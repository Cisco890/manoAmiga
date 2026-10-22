import type { EnrollmentStatus, Prisma, Sex, StudentStatus } from "../generated/prisma/client";
import { prisma } from "../prisma";
import {
  encryptCui,
  hashCui,
  isValidCui,
  maskCui,
  normalizeCui,
  decryptCui,
} from "../privacy/cui";
import { buildFullName, buildSearchName } from "./personName";

export const studentStatuses = ["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"] as const;
export const sexes = ["MALE", "FEMALE", "NOT_SPECIFIED"] as const;
const terminalEnrollmentStatuses: EnrollmentStatus[] = ["CLOSED", "CANCELLED", "REJECTED"];

function parseOptionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error(`${field} debe usar el formato YYYY-MM-DD`), { status: 400 });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} no es una fecha válida`), { status: 400 });
  }
  return date;
}

async function nextStudentCode(schoolId: string) {
  const year = new Date().getUTCFullYear();
  const prefix = `MA-${year}-`;
  const latest = await prisma.student.findFirst({
    where: { schoolId, studentCode: { startsWith: prefix } },
    orderBy: { studentCode: "desc" },
    select: { studentCode: true },
  });
  const current = latest ? Number(latest.studentCode.slice(prefix.length)) : 0;
  const sequence = Number.isFinite(current) ? current + 1 : 1;
  return `${prefix}${String(sequence).padStart(5, "0")}`;
}

function publicStudent(student: {
  id: string;
  schoolId: string;
  studentCode: string;
  givenNames: string;
  firstSurname: string;
  secondSurname: string | null;
  usualName: string | null;
  birthPlace: string | null;
  birthDate: Date | null;
  cuiEncrypted: string | null;
  homePhone: string | null;
  sex: Sex;
  status: StudentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  enrollments?: Array<{
    id: string;
    status: string;
    grade: { id: string; name: string; code: string };
    academicCycle: { id: string; name: string; year: number };
  }>;
}) {
  let cuiMasked: string | null = null;
  if (student.cuiEncrypted) {
    try {
      cuiMasked = maskCui(decryptCui(student.cuiEncrypted));
    } catch {
      cuiMasked = "****";
    }
  }

  const currentEnrollment = student.enrollments?.[0];

  return {
    id: student.id,
    schoolId: student.schoolId,
    studentCode: student.studentCode,
    givenNames: student.givenNames,
    firstSurname: student.firstSurname,
    secondSurname: student.secondSurname,
    usualName: student.usualName,
    fullName: buildFullName(student.givenNames, student.firstSurname, student.secondSurname),
    birthPlace: student.birthPlace,
    birthDate: student.birthDate ? student.birthDate.toISOString().slice(0, 10) : null,
    cuiMasked,
    hasCui: Boolean(student.cuiEncrypted),
    homePhone: student.homePhone,
    sex: student.sex,
    status: student.status,
    notes: student.notes,
    currentGrade: currentEnrollment
      ? {
          id: currentEnrollment.grade.id,
          name: currentEnrollment.grade.name,
          code: currentEnrollment.grade.code,
          enrollmentStatus: currentEnrollment.status,
          cycleName: currentEnrollment.academicCycle.name,
        }
      : null,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

export const currentEnrollmentWhere = {
  status: { notIn: terminalEnrollmentStatuses },
  academicCycle: { status: { not: "CLOSED" as const } },
};
export const currentEnrollmentOrder = [
  { academicCycle: { year: "desc" as const } }, { createdAt: "desc" as const }, { id: "desc" as const },
];

const studentInclude = {
  enrollments: {
    where: currentEnrollmentWhere,
    orderBy: currentEnrollmentOrder,
    take: 1,
    select: {
      id: true,
      status: true,
      grade: { select: { id: true, name: true, code: true } },
      academicCycle: { select: { id: true, name: true, year: true } },
    },
  },
};

export async function listStudents(
  schoolId: string,
  options: { page: number; limit: number; q?: string; status?: StudentStatus; gradeId?: string; academicCycleId?: string },
) {
  const q = options.q?.trim();
  const tokens = q?.split(/\s+/).filter(Boolean) ?? [];
  const nameFilter = { AND: tokens.map((token) => ({ searchName: { contains: token, mode: "insensitive" as const } })) };
  const today = new Date(new Date().toISOString().slice(0, 10));
  const where: Prisma.StudentWhereInput = {
    schoolId,
    deletedAt: null,
    ...(options.status ? { status: options.status } : {}),
    ...(options.gradeId || options.academicCycleId ? {
      enrollments: { some: {
        ...(options.gradeId ? { gradeId: options.gradeId } : {}),
        ...(options.academicCycleId ? { academicCycleId: options.academicCycleId } : {}),
      } },
    } : {}),
    ...(q
      ? {
          OR: [
            nameFilter,
            { studentCode: { contains: q, mode: "insensitive" } },
            ...(/^[\d\s-]+$/.test(q) && isValidCui(q) ? [{ cuiHash: hashCui(q) }] : []),
            { enrollments: { some: { OR: [
              { grade: { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } },
              { academicCycle: { OR: [
                { name: { contains: q, mode: "insensitive" } },
                ...(/^\d{4}$/.test(q) ? [{ year: Number(q) }] : []),
              ] } },
            ] } } },
            { guardianLinks: { some: { active: true, startDate: { lte: today },
              OR: [{ endDate: null }, { endDate: { gte: today } }],
              guardian: { active: true, deletedAt: null, ...nameFilter },
            } } },
            { sponsorships: { some: { sponsor: { active: true, deletedAt: null, ...nameFilter } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: studentInclude,
      orderBy: [{ firstSurname: "asc" }, { givenNames: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    }),
  ]);

  return {
    data: rows.map(publicStudent),
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      pages: Math.max(1, Math.ceil(total / options.limit)),
    },
  };
}

export async function getStudent(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    include: studentInclude,
  });
  if (!student) {
    throw Object.assign(new Error("Alumno no encontrado"), { status: 404 });
  }
  return publicStudent(student);
}

export type StudentInput = {
  givenNames: string;
  firstSurname: string;
  secondSurname?: string | null;
  usualName?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  cui?: string | null;
  homePhone?: string | null;
  sex?: Sex;
  status?: StudentStatus;
  notes?: string | null;
};

function normalizeStudentInput(input: StudentInput) {
  const givenNames = input.givenNames.trim();
  const firstSurname = input.firstSurname.trim();
  const secondSurname = input.secondSurname?.trim() || null;
  if (givenNames.length < 1 || givenNames.length > 120) {
    throw Object.assign(new Error("Los nombres son obligatorios"), { status: 400 });
  }
  if (firstSurname.length < 1 || firstSurname.length > 80) {
    throw Object.assign(new Error("El primer apellido es obligatorio"), { status: 400 });
  }

  let cuiEncrypted: string | null | undefined;
  let cuiHash: string | null | undefined;
  if (input.cui !== undefined) {
    if (input.cui === null || input.cui === "") {
      cuiEncrypted = null;
      cuiHash = null;
    } else {
      if (!isValidCui(input.cui)) {
        throw Object.assign(new Error("El CUI debe contener entre 13 y 20 dígitos"), { status: 400 });
      }
      const digits = normalizeCui(input.cui);
      cuiEncrypted = encryptCui(digits);
      cuiHash = hashCui(digits);
    }
  }

  return {
    givenNames,
    firstSurname,
    secondSurname,
    usualName: input.usualName?.trim() || null,
    birthPlace: input.birthPlace?.trim() || null,
    birthDate: parseOptionalDate(input.birthDate, "birthDate"),
    homePhone: input.homePhone?.trim() || null,
    sex: input.sex ?? "NOT_SPECIFIED",
    status: input.status ?? "ACTIVE",
    notes: input.notes?.trim() || null,
    searchName: buildSearchName(givenNames, firstSurname, secondSurname),
    cuiEncrypted,
    cuiHash,
  };
}

export async function createStudent(schoolId: string, input: StudentInput) {
  const data = normalizeStudentInput(input);
  if (data.cuiHash) {
    const duplicate = await prisma.student.findFirst({
      where: { cuiHash: data.cuiHash, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw Object.assign(new Error("Ya existe un alumno con ese CUI"), { status: 409 });
    }
  }

  const studentCode = await nextStudentCode(schoolId);
  const student = await prisma.student.create({
    data: {
      schoolId,
      studentCode,
      givenNames: data.givenNames,
      firstSurname: data.firstSurname,
      secondSurname: data.secondSurname,
      usualName: data.usualName,
      searchName: data.searchName,
      birthPlace: data.birthPlace,
      birthDate: data.birthDate,
      homePhone: data.homePhone,
      sex: data.sex,
      status: data.status,
      notes: data.notes,
      cuiEncrypted: data.cuiEncrypted ?? null,
      cuiHash: data.cuiHash ?? null,
    },
    include: studentInclude,
  });
  return publicStudent(student);
}

export async function updateStudent(schoolId: string, studentId: string, input: StudentInput) {
  const existing = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
  });
  if (!existing) {
    throw Object.assign(new Error("Alumno no encontrado"), { status: 404 });
  }

  const data = normalizeStudentInput({
    givenNames: input.givenNames ?? existing.givenNames,
    firstSurname: input.firstSurname ?? existing.firstSurname,
    secondSurname: input.secondSurname === undefined ? existing.secondSurname : input.secondSurname,
    usualName: input.usualName === undefined ? existing.usualName : input.usualName,
    birthPlace: input.birthPlace === undefined ? existing.birthPlace : input.birthPlace,
    birthDate:
      input.birthDate === undefined
        ? existing.birthDate?.toISOString().slice(0, 10) ?? null
        : input.birthDate,
    cui: input.cui,
    homePhone: input.homePhone === undefined ? existing.homePhone : input.homePhone,
    sex: input.sex ?? existing.sex,
    status: input.status ?? existing.status,
    notes: input.notes === undefined ? existing.notes : input.notes,
  });

  if (data.cuiHash) {
    const duplicate = await prisma.student.findFirst({
      where: { cuiHash: data.cuiHash, deletedAt: null, id: { not: studentId } },
      select: { id: true },
    });
    if (duplicate) {
      throw Object.assign(new Error("Ya existe un alumno con ese CUI"), { status: 409 });
    }
  }

  const student = await prisma.student.update({
    where: { id: studentId },
    data: {
      givenNames: data.givenNames,
      firstSurname: data.firstSurname,
      secondSurname: data.secondSurname,
      usualName: data.usualName,
      searchName: data.searchName,
      birthPlace: data.birthPlace,
      birthDate: data.birthDate,
      homePhone: data.homePhone,
      sex: data.sex,
      status: data.status,
      notes: data.notes,
      ...(data.cuiEncrypted !== undefined
        ? { cuiEncrypted: data.cuiEncrypted, cuiHash: data.cuiHash ?? null }
        : {}),
    },
    include: studentInclude,
  });
  return publicStudent(student);
}
