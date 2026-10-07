import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";
import { completeEnrollmentForm } from "./support/schoolFixtures";

process.env.JWT_ACCESS_SECRET = "secreto-de-integracion-con-mas-de-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const { createApiServer } = await import("../src/server");
const server = createApiServer();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `admin-school-${suffix}@example.test`;
const password = "ClaveDePrueba-2026";
let baseUrl = "";
let schoolId = "";
let adminId = "";
const createdStudentIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdCycleIds: string[] = [];

before(async () => {
  const [school, adminRole] = await Promise.all([
    prisma.school.findUnique({ where: { code: "MANO_AMIGA" }, select: { id: true } }),
    prisma.role.findUnique({ where: { code: "ADMIN" }, select: { id: true } }),
  ]);
  assert.ok(school);
  assert.ok(adminRole);
  schoolId = school.id;
  const passwordHash = await bcrypt.hash(password, 4);
  const admin = await prisma.user.create({
    data: {
      schoolId,
      email: adminEmail,
      displayName: "Admin School Test",
      passwordHash,
      roles: { create: { roleId: adminRole.id } },
    },
  });
  adminId = admin.id;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdEnrollmentIds.length) {
    await prisma.enrollment.deleteMany({ where: { id: { in: createdEnrollmentIds } } });
  }
  if (createdStudentIds.length) {
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
  }
  if (createdCycleIds.length) {
    await prisma.academicCycle.deleteMany({ where: { id: { in: createdCycleIds } } });
  }
  await prisma.auditEvent.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ email: adminEmail, password }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Origin: "http://localhost:5173",
});

const completeForm = (token: string, enrollmentId: string) =>
  fetch(`${baseUrl}/api/enrollments/${enrollmentId}/form`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(completeEnrollmentForm),
  });

test("ciclos, grados, alumnos e inscripciones cumplen el flujo escolar", async () => {
  const token = await login();
  const year = 2099;

  const cycleResponse = await fetch(`${baseUrl}/api/academic-cycles`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      name: `Ciclo prueba ${suffix}`,
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-10-31`,
      status: "ACTIVE",
    }),
  });
  assert.equal(cycleResponse.status, 201);
  const cycleBody = (await cycleResponse.json()) as { data: { id: string; status: string } };
  createdCycleIds.push(cycleBody.data.id);
  assert.equal(cycleBody.data.status, "ACTIVE");

  const gradesResponse = await fetch(`${baseUrl}/api/grades`, { headers: auth(token) });
  assert.equal(gradesResponse.status, 200);
  const gradesBody = (await gradesResponse.json()) as {
    data: Array<{ id: string; code: string; name: string }>;
  };
  assert.ok(gradesBody.data.length >= 4);
  assert.ok(gradesBody.data.some((grade) => grade.code === "PRE-KINDER"));
  assert.ok(gradesBody.data.some((grade) => grade.code === "KINDER"));
  const gradeA = gradesBody.data.find((grade) => grade.code === "PRE-KINDER");
  const gradeB = gradesBody.data.find((grade) => grade.code === "KINDER");
  assert.ok(gradeA && gradeB);

  const cui = `2599${String(Date.now()).slice(-9)}`;
  const studentResponse = await fetch(`${baseUrl}/api/students`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      givenNames: "Ana",
      firstSurname: "Prueba",
      secondSurname: "Ciclo",
      birthDate: "2018-05-01",
      cui,
      sex: "FEMALE",
    }),
  });
  assert.equal(studentResponse.status, 201);
  const studentBody = (await studentResponse.json()) as {
    data: { id: string; studentCode: string; hasCui: boolean };
  };
  createdStudentIds.push(studentBody.data.id);
  assert.equal(studentBody.data.hasCui, true);

  const duplicateCui = await fetch(`${baseUrl}/api/students`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      givenNames: "Otra",
      firstSurname: "Persona",
      cui,
    }),
  });
  assert.equal(duplicateCui.status, 409);

  const enrollmentResponse = await fetch(`${baseUrl}/api/enrollments`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      studentId: studentBody.data.id,
      academicCycleId: cycleBody.data.id,
      gradeId: gradeA.id,
      applicationType: "NEW_ENROLLMENT",
    }),
  });
  assert.equal(enrollmentResponse.status, 201);
  const enrollmentBody = (await enrollmentResponse.json()) as {
    data: { id: string; status: string; gradeId: string };
  };
  createdEnrollmentIds.push(enrollmentBody.data.id);
  assert.equal(enrollmentBody.data.status, "DRAFT");

  // MA-25: el formulario debe estar completo antes de enviarlo a revisión.
  assert.equal((await completeForm(token, enrollmentBody.data.id)).status, 200);
  const pending = await fetch(`${baseUrl}/api/enrollments/${enrollmentBody.data.id}/status`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "PENDING_REVIEW" }),
  });
  assert.equal(pending.status, 200);

  const approved = await fetch(`${baseUrl}/api/enrollments/${enrollmentBody.data.id}/status`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "APPROVED" }),
  });
  assert.equal(approved.status, 200);

  const gradeChange = await fetch(`${baseUrl}/api/enrollments`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      studentId: studentBody.data.id,
      academicCycleId: cycleBody.data.id,
      gradeId: gradeB.id,
      applicationType: "RE_ENROLLMENT",
    }),
  });
  assert.equal(gradeChange.status, 201);
  const gradeChangeBody = (await gradeChange.json()) as {
    data: { id: string; gradeId: string; status: string };
  };
  createdEnrollmentIds.push(gradeChangeBody.data.id);
  assert.equal(gradeChangeBody.data.gradeId, gradeB.id);
  assert.equal(gradeChangeBody.data.status, "DRAFT");

  const previous = await prisma.enrollment.findUnique({
    where: { id: enrollmentBody.data.id },
    select: { status: true, gradeId: true },
  });
  assert.equal(previous?.status, "CLOSED");
  assert.equal(previous?.gradeId, gradeA.id);

  assert.equal((await completeForm(token, gradeChangeBody.data.id)).status, 200);
  const closed = await fetch(`${baseUrl}/api/enrollments/${gradeChangeBody.data.id}/status`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "PENDING_REVIEW" }),
  });
  assert.equal(closed.status, 200);
  const approved2 = await fetch(`${baseUrl}/api/enrollments/${gradeChangeBody.data.id}/status`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "APPROVED" }),
  });
  assert.equal(approved2.status, 200);
  const closedFinal = await fetch(`${baseUrl}/api/enrollments/${gradeChangeBody.data.id}/status`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "CLOSED" }),
  });
  assert.equal(closedFinal.status, 200);
});
