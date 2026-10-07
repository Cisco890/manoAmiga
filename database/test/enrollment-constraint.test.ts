import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool, type PoolClient } from "pg";
import { prisma } from "../src/prisma";
import { oneOpenEnrollmentIndex } from "../src/school/enrollments";
import { createSchoolTestContext } from "./support/schoolFixtures";

let context: Awaited<ReturnType<typeof createSchoolTestContext>>;

before(async () => {
  context = await createSchoolTestContext("ma24");
});

after(async () => {
  await context.cleanup();
});

const isUniqueViolation = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");

test("el índice único parcial existe y excluye las inscripciones terminadas", async () => {
  const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ${oneOpenEnrollmentIndex}
  `;
  assert.ok(index, "falta el índice; revise que prisma migrate dev no lo haya eliminado");
  assert.match(index.indexdef, /CREATE UNIQUE INDEX/);
  assert.match(index.indexdef, /\(student_id, academic_cycle_id\)/);
  for (const status of ["CLOSED", "CANCELLED", "REJECTED"]) {
    assert.match(index.indexdef, new RegExp(status));
  }
});

test("la base de datos rechaza una segunda inscripción activa aunque no pase por la API", async () => {
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
  await context.createEnrollmentRow(student.id, cycle.id, "APPROVED");

  for (const status of ["DRAFT", "PENDING_REVIEW", "INCOMPLETE", "APPROVED"] as const) {
    await assert.rejects(
      context.createEnrollmentRow(student.id, cycle.id, status, context.gradeIds[1]),
      isUniqueViolation,
      `debe rechazar una segunda inscripción en estado ${status}`,
    );
  }
});

test("las inscripciones cerradas, canceladas o rechazadas no bloquean una nueva", async () => {
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
  for (const status of ["CLOSED", "CANCELLED", "REJECTED"] as const) {
    await context.createEnrollmentRow(student.id, cycle.id, status);
  }
  await context.createEnrollmentRow(student.id, cycle.id, "DRAFT");

  const open = await prisma.enrollment.count({
    where: { studentId: student.id, academicCycleId: cycle.id, status: "DRAFT" },
  });
  assert.equal(open, 1);
});

test("el mismo alumno puede tener una inscripción activa en ciclos distintos", async () => {
  const [firstCycle, secondCycle, student] = await Promise.all([
    context.createCycle(),
    context.createCycle(),
    context.createStudent(),
  ]);
  await context.createEnrollmentRow(student.id, firstCycle.id, "APPROVED");
  await context.createEnrollmentRow(student.id, secondCycle.id, "DRAFT");
});

test("la API responde un error claro al duplicar la inscripción activa", async () => {
  const token = await context.login("admin");
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
  const body = {
    studentId: student.id,
    academicCycleId: cycle.id,
    gradeId: context.gradeIds[0],
    applicationType: "NEW_ENROLLMENT",
  };

  assert.equal((await context.api(token, "/enrollments", "POST", body)).status, 201);
  const duplicate = await context.api(token, "/enrollments", "POST", body);
  assert.equal(duplicate.status, 409);
  const { message } = (await duplicate.json()) as { message: string };
  assert.match(message, /ya tiene una inscripción/);
});

test("si otra transacción gana la carrera, la API responde el mismo error claro", async () => {
  const token = await context.login("admin");
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);

  // Otra sesión inserta una inscripción activa sin confirmar: la validación previa de la API
  // no la ve, pero el índice único hace esperar al INSERT de la API hasta el COMMIT.
  const competitor = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await competitor.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO enrollments (id, student_id, academic_cycle_id, grade_id, application_type, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'NEW_ENROLLMENT', 'DRAFT', now())`,
      [student.id, cycle.id, context.gradeIds[1]],
    );

    const pending = context.api(token, "/enrollments", "POST", {
      studentId: student.id,
      academicCycleId: cycle.id,
      gradeId: context.gradeIds[0],
      applicationType: "NEW_ENROLLMENT",
    });
    await waitForBlockedInsert(client);
    await client.query("COMMIT");

    const response = await pending;
    assert.equal(response.status, 409);
    const { message } = (await response.json()) as { message: string };
    assert.match(message, new RegExp(`ya tiene una inscripción activa en el ciclo ${cycle.name}`));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await competitor.end();
  }

  const open = await prisma.enrollment.count({
    where: { studentId: student.id, academicCycleId: cycle.id, status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] } },
  });
  assert.equal(open, 1);
});

// Espera a que la API quede bloqueada esperando el COMMIT de la otra transacción.
async function waitForBlockedInsert(client: PoolClient) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await client.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))`,
    );
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("la API no llegó a esperar el bloqueo de la otra transacción");
}

test("un colaborador no puede crear inscripciones", async () => {
  const token = await context.login("collaborator");
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
  const response = await context.api(token, "/enrollments", "POST", {
    studentId: student.id,
    academicCycleId: cycle.id,
    gradeId: context.gradeIds[0],
    applicationType: "NEW_ENROLLMENT",
  });
  assert.equal(response.status, 403);
});
