import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";

export const maxAuthorizedPickups = 3;
export const pickupSelect = {
  givenNames: true, firstSurname: true, secondSurname: true, relationship: true, phone: true,
} as const;
export type PickupInput = {
  givenNames: string; firstSurname: string; secondSurname: string | null;
  relationship: string; phone: string | null;
};
const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });

export function parseAuthorizedPickups(value: unknown): PickupInput[] {
  if (!Array.isArray(value)) throw invalid("authorizedPickups debe ser una lista");
  if (value.length > maxAuthorizedPickups) {
    throw invalid(`Se permiten como máximo ${maxAuthorizedPickups} personas autorizadas`);
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw invalid(`La persona autorizada ${index + 1} debe ser un objeto`);
    }
    const fields = entry as Record<string, unknown>;
    if (Object.keys(fields).some((key) => !Object.hasOwn(pickupSelect, key))) throw invalid("Campo no permitido en persona autorizada");
    const text = (key: string, max: number) => {
      const raw = fields[key];
      if (raw === undefined || raw === null) return null;
      if (typeof raw !== "string" || raw.trim().length > max) throw invalid(`${key} debe ser texto de hasta ${max} caracteres`);
      return raw.trim() || null;
    };
    const givenNames = text("givenNames", 120);
    const firstSurname = text("firstSurname", 80);
    const relationship = text("relationship", 80);
    if (!givenNames || !firstSurname || !relationship) {
      throw invalid(`La persona autorizada ${index + 1} necesita nombres, primer apellido y parentesco`);
    }
    return { givenNames, firstSurname, secondSurname: text("secondSurname", 80), relationship, phone: text("phone", 30) };
  });
}

export async function replaceStudentPickups(tx: Prisma.TransactionClient, studentId: string, pickups: PickupInput[]) {
  // Serialize replacements so simultaneous saves cannot mix lists or duplicate sort orders.
  await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
  await tx.authorizedPickup.deleteMany({ where: { studentId } });
  if (pickups.length) {
    await tx.authorizedPickup.createMany({
      data: pickups.map((pickup, i) => ({ ...pickup, studentId, sortOrder: i + 1 })),
    });
  }
}

export async function saveStudentPickups(schoolId: string, actorId: string, studentId: string, pickups: PickupInput[]) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } });
    if (!student) throw Object.assign(new Error("Alumno no encontrado"), { status: 404 });
    await replaceStudentPickups(tx, studentId, pickups);
    const latest = await tx.enrollment.findFirst({
      where: { studentId, status: { in: ["DRAFT", "INCOMPLETE", "PENDING_REVIEW", "APPROVED"] }, academicCycle: { status: { not: "CLOSED" } } },
      orderBy: [{ academicCycle: { year: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true },
    });
    // Only an editable current draft follows changes to the student's live permissions.
    // Submitted, approved and past inscriptions retain the list that was recorded at that time.
    if (latest && ["DRAFT", "INCOMPLETE"].includes(latest.status)) {
      await tx.authorizedPickup.deleteMany({ where: { enrollmentId: latest.id } });
      if (pickups.length) await tx.authorizedPickup.createMany({
        data: pickups.map((pickup, i) => ({ ...pickup, enrollmentId: latest.id, sortOrder: i + 1 })),
      });
    }
    await tx.auditEvent.create({
      data: { userId: actorId, action: "UPDATE", entityType: "Student", entityId: studentId,
        afterData: { section: "authorizedPickups", count: pickups.length } },
    });
    return pickups;
  });
}
