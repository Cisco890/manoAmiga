import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import {
  assertNoOpenSponsorshipForPair,
  assertStudentCanReceiveSponsor,
  DEFAULT_MAX_OPEN_SPONSORSHIPS,
  MAX_OPEN_SPONSORSHIPS_SETTING,
  OPEN_SPONSORSHIP_STATUSES,
  parseMaxOpenSponsorships,
} from "../src/school/sponsorships";

/**
 * MA-37: la relación padrinos ↔ alumnos es muchos a muchos en la base de datos; el límite de un
 * padrino por alumno es una regla de negocio configurable del servicio.
 *
 * Cada prueba usa su propio colegio para poder cambiar el ajuste sin afectar a las demás pruebas,
 * que corren en paralelo contra el colegio del seed.
 */

const suffix = randomUUID().slice(0, 8);
const schoolIds: string[] = [];
const studentIds: string[] = [];
const sponsorIds: string[] = [];

async function createSchool(maxOpen?: unknown) {
  const school = await prisma.school.create({
    data: { code: `SPONSOR-${suffix}-${schoolIds.length}`, name: "Colegio de prueba de padrinazgo" },
    select: { id: true },
  });
  schoolIds.push(school.id);
  if (maxOpen !== undefined) {
    await prisma.systemSetting.create({
      data: { schoolId: school.id, key: MAX_OPEN_SPONSORSHIPS_SETTING, value: maxOpen as never },
    });
  }
  return school.id;
}

async function createStudent(schoolId: string) {
  const student = await prisma.student.create({
    data: {
      schoolId,
      studentCode: `SP-${suffix}-${studentIds.length}`,
      givenNames: "Alumno",
      firstSurname: "Apadrinado",
      searchName: "Alumno Apadrinado",
    },
    select: { id: true },
  });
  studentIds.push(student.id);
  return student.id;
}

async function createSponsor(schoolId: string) {
  const sponsor = await prisma.sponsor.create({
    data: { schoolId, givenNames: "Padrino", firstSurname: `Modelo ${sponsorIds.length}`, searchName: `Padrino Modelo ${sponsorIds.length}` },
    select: { id: true },
  });
  sponsorIds.push(sponsor.id);
  return sponsor.id;
}

const sponsorship = (sponsorId: string, studentId: string, status: (typeof OPEN_SPONSORSHIP_STATUSES)[number] | "ENDED" | "CANCELLED" = "ACTIVE") =>
  prisma.sponsorship.create({ data: { sponsorId, studentId, status, startDate: new Date("2026-01-15") } });

const canReceive = (schoolId: string, studentId: string) =>
  prisma.$transaction((tx) => assertStudentCanReceiveSponsor(tx, schoolId, studentId));

async function rejectsWith(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: { status?: number }) => error.status === status);
}

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.sponsorship.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.sponsor.deleteMany({ where: { id: { in: sponsorIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.$disconnect();
});

test("la base permite que un padrino apoye a varios alumnos y un alumno tenga varios padrinos", async () => {
  const schoolId = await createSchool();
  const [firstStudent, secondStudent] = [await createStudent(schoolId), await createStudent(schoolId)];
  const [firstSponsor, secondSponsor] = [await createSponsor(schoolId), await createSponsor(schoolId)];

  // Inserciones directas: la base no impone ningún límite de cardinalidad.
  await sponsorship(firstSponsor, firstStudent);
  await sponsorship(firstSponsor, secondStudent);
  await sponsorship(secondSponsor, firstStudent);

  assert.equal(await prisma.sponsorship.count({ where: { sponsorId: firstSponsor, status: "ACTIVE" } }), 2);
  assert.equal(await prisma.sponsorship.count({ where: { studentId: firstStudent, status: "ACTIVE" } }), 2);
  const sponsorsOfStudent = await prisma.student.findUniqueOrThrow({
    where: { id: firstStudent },
    select: { sponsorships: { select: { sponsor: { select: { id: true } } } } },
  });
  assert.deepEqual(
    sponsorsOfStudent.sponsorships.map((s) => s.sponsor.id).sort(),
    [firstSponsor, secondSponsor].sort(),
  );
});

test("sin ajuste, la regla de negocio permite un solo padrinazgo abierto por alumno", async () => {
  const schoolId = await createSchool();
  const studentId = await createStudent(schoolId);
  const [firstSponsor, secondSponsor] = [await createSponsor(schoolId), await createSponsor(schoolId)];

  await canReceive(schoolId, studentId);
  await sponsorship(firstSponsor, studentId, "PENDING");
  await rejectsWith(canReceive(schoolId, studentId), 409);

  // Pausado sigue ocupando el cupo; finalizado o cancelado lo libera.
  for (const status of ["ACTIVE", "PAUSED"] as const) {
    await prisma.sponsorship.updateMany({ where: { studentId }, data: { status } });
    await rejectsWith(canReceive(schoolId, studentId), 409);
  }
  for (const status of ["ENDED", "CANCELLED"] as const) {
    await prisma.sponsorship.updateMany({ where: { studentId }, data: { status } });
    await canReceive(schoolId, studentId);
  }
  // Un padrinazgo anterior terminado no impide asignar a otro padrino.
  await sponsorship(secondSponsor, studentId, "ACTIVE");
  await rejectsWith(canReceive(schoolId, studentId), 409);
});

test("el cupo se amplía con sponsorship.max_open_per_student sin cambiar el esquema", async () => {
  const schoolId = await createSchool(2);
  const studentId = await createStudent(schoolId);
  await canReceive(schoolId, studentId);
  await sponsorship(await createSponsor(schoolId), studentId);
  await canReceive(schoolId, studentId);
  await sponsorship(await createSponsor(schoolId), studentId);
  await assert.rejects(canReceive(schoolId, studentId), /máximo de 2 padrinos/);
});

test("un valor inválido del ajuste usa la política por defecto", () => {
  assert.equal(DEFAULT_MAX_OPEN_SPONSORSHIPS, 1);
  for (const value of [undefined, null, 0, -1, 1.5, "3", 21, { max: 2 }]) {
    assert.equal(parseMaxOpenSponsorships(value), 1, `valor ${JSON.stringify(value)}`);
  }
  assert.equal(parseMaxOpenSponsorships(3), 3);
});

test("el cupo solo aplica a alumnos del mismo colegio", async () => {
  const schoolId = await createSchool();
  const otherSchoolId = await createSchool();
  const studentId = await createStudent(otherSchoolId);
  await rejectsWith(canReceive(schoolId, studentId), 404);
  await rejectsWith(canReceive(schoolId, randomUUID()), 404);
});

test("un padrino no puede tener dos padrinazgos abiertos con el mismo alumno", async () => {
  const schoolId = await createSchool(5);
  const studentId = await createStudent(schoolId);
  const sponsorId = await createSponsor(schoolId);
  await assertNoOpenSponsorshipForPair(prisma, sponsorId, studentId);
  await sponsorship(sponsorId, studentId, "PAUSED");
  await rejectsWith(assertNoOpenSponsorshipForPair(prisma, sponsorId, studentId), 409);
  await prisma.sponsorship.updateMany({ where: { studentId }, data: { status: "ENDED" } });
  await assertNoOpenSponsorshipForPair(prisma, sponsorId, studentId);
});

test("el seed configura un padrino por alumno en Mano Amiga", async () => {
  const school = await prisma.school.findUniqueOrThrow({ where: { code: "MANO_AMIGA" }, select: { id: true } });
  const setting = await prisma.systemSetting.findUnique({
    where: { schoolId_key: { schoolId: school.id, key: MAX_OPEN_SPONSORSHIPS_SETTING } },
  });
  assert.equal(setting?.value, 1);
});
