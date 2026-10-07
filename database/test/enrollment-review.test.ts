import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { EnrollmentStatus } from "../src/generated/prisma/client";
import { prisma } from "../src/prisma";
import { completeEnrollmentForm, createSchoolTestContext } from "./support/schoolFixtures";

let context: Awaited<ReturnType<typeof createSchoolTestContext>>;
let adminToken = "";
let collaboratorToken = "";

before(async () => {
  context = await createSchoolTestContext("ma26");
  [adminToken, collaboratorToken] = await Promise.all([
    context.login("admin"),
    context.login("collaborator"),
  ]);
});

after(async () => {
  await context.cleanup();
});

type EnrollmentBody = {
  data: {
    status: EnrollmentStatus;
    rejectionReason: string | null;
    approvedAt: string | null;
    approvedByUserId: string | null;
    canGenerateDocuments: boolean;
    allowedNextStatuses: EnrollmentStatus[];
  };
};

async function enrollmentIn(status: EnrollmentStatus) {
  const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
  return context.createEnrollmentRow(student.id, cycle.id, status);
}

const changeStatus = (token: string, id: string, body: Record<string, unknown>) =>
  context.api(token, `/enrollments/${id}/status`, "PATCH", body);

const lastAudit = (entityId: string) =>
  prisma.auditEvent.findFirst({
    where: { entityType: "Enrollment", entityId },
    orderBy: { createdAt: "desc" },
  });

test("aprobar una inscripción pendiente la deja APROBADA y habilita los documentos", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");

  const response = await changeStatus(adminToken, enrollment.id, { status: "APPROVED" });
  assert.equal(response.status, 200);
  const { data } = (await response.json()) as EnrollmentBody;
  assert.equal(data.status, "APPROVED");
  assert.equal(data.canGenerateDocuments, true);
  assert.ok(data.approvedAt);
  assert.ok(data.approvedByUserId);
  assert.equal(data.rejectionReason, null);

  const audit = await lastAudit(enrollment.id);
  assert.deepEqual(audit?.beforeData, { status: "PENDING_REVIEW" });
  assert.deepEqual(audit?.afterData, { status: "APPROVED" });
});

test("devolver una inscripción la deja INCOMPLETA con el motivo registrado", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");
  const reason = "Falta la constancia de vacunación";

  const response = await changeStatus(adminToken, enrollment.id, {
    status: "INCOMPLETE",
    rejectionReason: `  ${reason}  `,
  });
  assert.equal(response.status, 200);
  const { data } = (await response.json()) as EnrollmentBody;
  assert.equal(data.status, "INCOMPLETE");
  assert.equal(data.rejectionReason, reason);
  assert.equal(data.canGenerateDocuments, false);
  assert.deepEqual(data.allowedNextStatuses, ["PENDING_REVIEW", "CANCELLED"]);

  const audit = await lastAudit(enrollment.id);
  assert.deepEqual(audit?.afterData, { status: "INCOMPLETE", rejectionReason: reason });
});

test("rechazar definitivamente exige motivo y deja la inscripción RECHAZADA", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");

  const response = await changeStatus(adminToken, enrollment.id, {
    status: "REJECTED",
    rejectionReason: "No hay cupo para el grado solicitado",
  });
  assert.equal(response.status, 200);
  const { data } = (await response.json()) as EnrollmentBody;
  assert.equal(data.status, "REJECTED");
  assert.equal(data.rejectionReason, "No hay cupo para el grado solicitado");
});

test("devolver o rechazar sin motivo responde 400 y no cambia el estado", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");

  for (const body of [
    { status: "INCOMPLETE" },
    { status: "INCOMPLETE", rejectionReason: "   " },
    { status: "REJECTED", rejectionReason: "no" },
    { status: "REJECTED", rejectionReason: "x".repeat(1001) },
  ]) {
    const response = await changeStatus(adminToken, enrollment.id, body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(((await response.json()) as { message: string }).message, /motivo/);
  }
  const unchanged = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  assert.equal(unchanged.status, "PENDING_REVIEW");
});

test("solo se puede aprobar, devolver o rechazar una inscripción pendiente de revisión", async () => {
  for (const status of ["DRAFT", "INCOMPLETE", "APPROVED", "CLOSED"] as const) {
    const enrollment = await enrollmentIn(status);
    const response = await changeStatus(adminToken, enrollment.id, { status: "APPROVED" });
    assert.equal(response.status, 400, `no debe aprobarse desde ${status}`);
  }
});

test("una inscripción devuelta vuelve a revisión antes de poder aprobarse", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");
  await changeStatus(adminToken, enrollment.id, {
    status: "INCOMPLETE",
    rejectionReason: "Falta la firma del encargado",
  });
  // MA-25: reenviar a revisión exige el formulario completo.
  assert.equal(
    (await context.api(adminToken, `/enrollments/${enrollment.id}/form`, "PATCH", completeEnrollmentForm)).status,
    200,
  );

  assert.equal((await changeStatus(adminToken, enrollment.id, { status: "APPROVED" })).status, 400);
  assert.equal(
    (await changeStatus(adminToken, enrollment.id, { status: "PENDING_REVIEW" })).status,
    200,
  );
  const approved = await changeStatus(adminToken, enrollment.id, { status: "APPROVED" });
  assert.equal(approved.status, 200);
  assert.equal(((await approved.json()) as EnrollmentBody).data.rejectionReason, null);
});

test("un colaborador no puede aprobar, devolver ni rechazar", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");

  for (const body of [
    { status: "APPROVED" },
    { status: "INCOMPLETE", rejectionReason: "Motivo de prueba" },
    { status: "REJECTED", rejectionReason: "Motivo de prueba" },
  ]) {
    assert.equal((await changeStatus(collaboratorToken, enrollment.id, body)).status, 403);
  }
  const unchanged = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  assert.equal(unchanged.status, "PENDING_REVIEW");
});

test("dos decisiones simultáneas: solo una se aplica y la otra recibe un error", async () => {
  const enrollment = await enrollmentIn("PENDING_REVIEW");

  const responses = await Promise.all([
    changeStatus(adminToken, enrollment.id, { status: "APPROVED" }),
    changeStatus(adminToken, enrollment.id, {
      status: "REJECTED",
      rejectionReason: "Decisión simultánea de prueba",
    }),
  ]);
  const statuses = responses.map(({ status }) => status).sort();
  assert.equal(statuses[0], 200);
  assert.ok([400, 409].includes(statuses[1]), `estado inesperado ${statuses[1]}`);

  const audits = await prisma.auditEvent.count({
    where: { entityType: "Enrollment", entityId: enrollment.id },
  });
  assert.equal(audits, 1);
});
