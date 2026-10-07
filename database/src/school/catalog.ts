import type { AcademicCycleStatus, GradeLevel } from "../generated/prisma/client";
import { prisma } from "../prisma";

export const cycleStatuses = ["PLANNED", "ACTIVE", "CLOSED"] as const;
export const gradeLevels = ["PRE_PRIMARY", "PRIMARY", "SECONDARY", "OTHER"] as const;

export type PrincipalLike = {
  id: string;
  schoolId: string;
  permissions: string[];
};

export function hasAnyPermission(principal: PrincipalLike, permissions: string[]) {
  return permissions.some((permission) => principal.permissions.includes(permission));
}

export function parseDateOnly(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error(`${field} debe usar el formato YYYY-MM-DD`), { status: 400 });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} no es una fecha válida`), { status: 400 });
  }
  return date;
}

export function publicCycle(cycle: {
  id: string;
  schoolId: string;
  name: string;
  year: number;
  startDate: Date;
  endDate: Date;
  status: AcademicCycleStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: cycle.id,
    schoolId: cycle.schoolId,
    name: cycle.name,
    year: cycle.year,
    startDate: cycle.startDate.toISOString().slice(0, 10),
    endDate: cycle.endDate.toISOString().slice(0, 10),
    status: cycle.status,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

export function publicGrade(grade: {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  level: GradeLevel;
  displayOrder: number;
  minAge: number | null;
  maxAge: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: grade.id,
    schoolId: grade.schoolId,
    code: grade.code,
    name: grade.name,
    level: grade.level,
    displayOrder: grade.displayOrder,
    minAge: grade.minAge,
    maxAge: grade.maxAge,
    active: grade.active,
    createdAt: grade.createdAt,
    updatedAt: grade.updatedAt,
  };
}

export async function listCycles(schoolId: string, status?: AcademicCycleStatus) {
  const cycles = await prisma.academicCycle.findMany({
    where: { schoolId, ...(status ? { status } : {}) },
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
  });
  return cycles.map(publicCycle);
}

export async function createCycle(
  schoolId: string,
  input: {
    name: string;
    year: number;
    startDate: Date;
    endDate: Date;
    status: AcademicCycleStatus;
  },
) {
  if (input.endDate < input.startDate) {
    throw Object.assign(new Error("La fecha de fin debe ser posterior al inicio"), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    if (input.status === "ACTIVE") {
      await tx.academicCycle.updateMany({
        where: { schoolId, status: "ACTIVE" },
        data: { status: "PLANNED" },
      });
    }

    const cycle = await tx.academicCycle.create({
      data: {
        schoolId,
        name: input.name,
        year: input.year,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
      },
    });
    return publicCycle(cycle);
  });
}

export async function updateCycle(
  schoolId: string,
  cycleId: string,
  input: Partial<{
    name: string;
    year: number;
    startDate: Date;
    endDate: Date;
    status: AcademicCycleStatus;
  }>,
) {
  const existing = await prisma.academicCycle.findFirst({
    where: { id: cycleId, schoolId },
  });
  if (!existing) {
    throw Object.assign(new Error("Ciclo escolar no encontrado"), { status: 404 });
  }

  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  if (endDate < startDate) {
    throw Object.assign(new Error("La fecha de fin debe ser posterior al inicio"), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    if (input.status === "ACTIVE") {
      await tx.academicCycle.updateMany({
        where: { schoolId, status: "ACTIVE", id: { not: cycleId } },
        data: { status: "PLANNED" },
      });
    }

    const cycle = await tx.academicCycle.update({
      where: { id: cycleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return publicCycle(cycle);
  });
}

export async function listGrades(schoolId: string, activeOnly = false) {
  const grades = await prisma.grade.findMany({
    where: { schoolId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return grades.map(publicGrade);
}

export async function createGrade(
  schoolId: string,
  input: {
    code: string;
    name: string;
    level: GradeLevel;
    displayOrder: number;
    minAge?: number | null;
    maxAge?: number | null;
    active?: boolean;
  },
) {
  const grade = await prisma.grade.create({
    data: {
      schoolId,
      code: input.code,
      name: input.name,
      level: input.level,
      displayOrder: input.displayOrder,
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      active: input.active ?? true,
    },
  });
  return publicGrade(grade);
}

export async function updateGrade(
  schoolId: string,
  gradeId: string,
  input: Partial<{
    code: string;
    name: string;
    level: GradeLevel;
    displayOrder: number;
    minAge: number | null;
    maxAge: number | null;
    active: boolean;
  }>,
) {
  const existing = await prisma.grade.findFirst({ where: { id: gradeId, schoolId } });
  if (!existing) {
    throw Object.assign(new Error("Grado no encontrado"), { status: 404 });
  }

  const grade = await prisma.grade.update({
    where: { id: gradeId },
    data: input,
  });
  return publicGrade(grade);
}
