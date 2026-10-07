import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import type { EnrollmentStatus } from "../../src/generated/prisma/client";
import { prisma } from "../../src/prisma";

process.env.JWT_ACCESS_SECRET ??= "secreto-de-integracion-con-mas-de-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const password = "ClaveDePrueba-2026";

/** Datos mínimos que completan todos los pasos obligatorios del formulario de inscripción. */
export const completeEnrollmentForm = {
  contact: {
    messageContactName: "María López",
    messageContactPhone: "5555-1234",
    messageContactRelationship: "Madre",
    mayLeaveAlone: false,
    authorizedPickups: [{ fullName: "José López", relationship: "Abuelo", phone: "5555-9876" }],
  },
  household: { livesWithMother: true, householdSize: 4 },
  medical: { bloodType: "O+", vaccinationsComplete: true },
  signature: { signerName: "María López", signerRelationship: "Madre" },
};

/**
 * Levanta la API en un puerto libre y crea datos desechables (usuarios, ciclos y alumnos).
 * `cleanup()` elimina todo lo creado, incluidas las inscripciones de esos alumnos.
 */
export async function createSchoolTestContext(label: string) {
  const { createApiServer } = await import("../../src/server");
  const server = createApiServer();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userIds: string[] = [];
  const studentIds: string[] = [];
  const cycleIds: string[] = [];

  const [school, adminRole, collaboratorRole] = await Promise.all([
    prisma.school.findUniqueOrThrow({ where: { code: "MANO_AMIGA" }, select: { id: true } }),
    prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" }, select: { id: true } }),
    prisma.role.findUniqueOrThrow({ where: { code: "COLLABORATOR" }, select: { id: true } }),
  ]);
  const grades = await prisma.grade.findMany({
    where: { schoolId: school.id, active: true },
    orderBy: { displayOrder: "asc" },
    take: 2,
    select: { id: true },
  });
  assert.equal(grades.length, 2, "el seed debe crear grados");

  const passwordHash = await bcrypt.hash(password, 4);
  const emails = {
    admin: `${label}-admin-${suffix}@example.test`,
    collaborator: `${label}-collaborator-${suffix}@example.test`,
  };
  for (const [role, roleId] of [
    ["admin", adminRole.id],
    ["collaborator", collaboratorRole.id],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: emails[role],
        displayName: `${label} ${role}`,
        passwordHash,
        roles: { create: { roleId } },
      },
    });
    userIds.push(user.id);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function login(role: keyof typeof emails) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emails[role], password }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  function api(token: string, path: string, method = "GET", body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:5173",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function createCycle() {
    // Años lejanos y aleatorios para no chocar con el seed. Como (school_id, year) es único y
    // las pruebas corren en paralelo, se reintenta con otro año si ya está ocupado.
    for (let attempt = 0; ; attempt += 1) {
      const year = 2200 + Math.floor(Math.random() * 7000);
      try {
        const cycle = await prisma.academicCycle.create({
          data: {
            schoolId: school.id,
            name: `Ciclo prueba ${year}`,
            year,
            startDate: new Date(`${year}-01-15`),
            endDate: new Date(`${year}-10-31`),
            status: "PLANNED",
          },
          select: { id: true, name: true },
        });
        cycleIds.push(cycle.id);
        return cycle;
      } catch (error) {
        const duplicateYear =
          error && typeof error === "object" && "code" in error && error.code === "P2002";
        if (!duplicateYear || attempt >= 10) throw error;
      }
    }
  }

  async function createStudent() {
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        studentCode: `T-${studentIds.length}-${suffix}`,
        givenNames: "Alumno",
        firstSurname: "Prueba",
        searchName: "Alumno Prueba",
        sex: "NOT_SPECIFIED",
      },
      select: { id: true },
    });
    studentIds.push(student.id);
    return student;
  }

  function createEnrollmentRow(
    studentId: string,
    academicCycleId: string,
    status: EnrollmentStatus = "DRAFT",
    gradeId = grades[0].id,
  ) {
    return prisma.enrollment.create({
      data: { studentId, academicCycleId, gradeId, applicationType: "NEW_ENROLLMENT", status },
      select: { id: true },
    });
  }

  async function cleanup() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.academicCycle.deleteMany({ where: { id: { in: cycleIds } } });
    await prisma.auditEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }

  return {
    baseUrl,
    gradeIds: grades.map(({ id }) => id),
    login,
    api,
    createCycle,
    createStudent,
    createEnrollmentRow,
    cleanup,
  };
}
