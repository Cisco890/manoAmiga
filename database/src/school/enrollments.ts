import type {
  ApplicationType,
  EnrollmentStatus,
} from "../generated/prisma/client";
import { prisma } from "../prisma";

export const applicationTypes = ["NEW_ENROLLMENT", "RE_ENROLLMENT", "TRANSFER"] as const;
export const enrollmentStatuses = [
  "DRAFT",
  "PENDING_REVIEW",
  "INCOMPLETE",
  "APPROVED",
  "REJECTED",
  "CLOSED",
  "CANCELLED",
] as const;

const openStatuses: EnrollmentStatus[] = ["DRAFT", "PENDING_REVIEW", "INCOMPLETE", "APPROVED"];

const allowedTransitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "CANCELLED"],
  PENDING_REVIEW: ["INCOMPLETE", "APPROVED", "REJECTED", "CANCELLED"],
  INCOMPLETE: ["PENDING_REVIEW", "APPROVED", "CANCELLED"],
  APPROVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

function buildSearchName(givenNames: string, firstSurname: string, secondSurname?: string | null) {
  return [givenNames, firstSurname, secondSurname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function publicEnrollment(enrollment: {
  id: string;
  studentId: string;
  academicCycleId: string;
  gradeId: string;
  applicationType: ApplicationType;
  requestDate: Date;
  status: EnrollmentStatus;
  notes: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    studentCode: string;
    givenNames: string;
    firstSurname: string;
    secondSurname: string | null;
  };
  academicCycle: { id: string; name: string; year: number; status: string };
  grade: { id: string; code: string; name: string; level: string };
}) {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    academicCycleId: enrollment.academicCycleId,
    gradeId: enrollment.gradeId,
    applicationType: enrollment.applicationType,
    requestDate: enrollment.requestDate.toISOString().slice(0, 10),
    status: enrollment.status,
    notes: enrollment.notes,
    approvedAt: enrollment.approvedAt,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
    student: {
      id: enrollment.student.id,
      studentCode: enrollment.student.studentCode,
      fullName: buildSearchName(
        enrollment.student.givenNames,
        enrollment.student.firstSurname,
        enrollment.student.secondSurname,
      ),
    },
    academicCycle: enrollment.academicCycle,
    grade: enrollment.grade,
    allowedNextStatuses: allowedTransitions[enrollment.status],
  };
}

const enrollmentInclude = {
  student: {
    select: {
      id: true,
      studentCode: true,
      givenNames: true,
      firstSurname: true,
      secondSurname: true,
    },
  },
  academicCycle: { select: { id: true, name: true, year: true, status: true } },
  grade: { select: { id: true, code: true, name: true, level: true } },
} as const;

export async function listEnrollments(
  schoolId: string,
  options: {
    page: number;
    limit: number;
    academicCycleId?: string;
    gradeId?: string;
    status?: EnrollmentStatus;
    q?: string;
  },
) {
  const where = {
    student: { schoolId, deletedAt: null },
    ...(options.academicCycleId ? { academicCycleId: options.academicCycleId } : {}),
    ...(options.gradeId ? { gradeId: options.gradeId } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.q
      ? {
          student: {
            schoolId,
            deletedAt: null,
            OR: [
              { searchName: { contains: options.q, mode: "insensitive" as const } },
              { studentCode: { contains: options.q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      include: enrollmentInclude,
      orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    }),
  ]);

  return {
    data: rows.map(publicEnrollment),
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      pages: Math.max(1, Math.ceil(total / options.limit)),
    },
  };
}

export async function createEnrollment(
  schoolId: string,
  actorUserId: string,
  input: {
    studentId: string;
    academicCycleId: string;
    gradeId: string;
    applicationType: ApplicationType;
    notes?: string | null;
    closePreviousForGradeChange?: boolean;
  },
) {
  const [student, cycle, grade] = await Promise.all([
    prisma.student.findFirst({
      where: { id: input.studentId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.academicCycle.findFirst({
      where: { id: input.academicCycleId, schoolId },
      select: { id: true, status: true },
    }),
    prisma.grade.findFirst({
      where: { id: input.gradeId, schoolId, active: true },
      select: { id: true },
    }),
  ]);

  if (!student) throw Object.assign(new Error("Alumno no encontrado"), { status: 404 });
  if (!cycle) throw Object.assign(new Error("Ciclo escolar no encontrado"), { status: 404 });
  if (!grade) throw Object.assign(new Error("Grado no encontrado o inactivo"), { status: 404 });
  if (cycle.status === "CLOSED") {
    throw Object.assign(new Error("No se puede inscribir en un ciclo cerrado"), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const openEnrollment = await tx.enrollment.findFirst({
      where: {
        studentId: input.studentId,
        academicCycleId: input.academicCycleId,
        status: { in: openStatuses },
      },
    });

    if (openEnrollment) {
      if (openEnrollment.gradeId === input.gradeId) {
        throw Object.assign(
          new Error("El alumno ya tiene una inscripción abierta en ese ciclo y grado"),
          { status: 409 },
        );
      }

      // Cambio de grado: conserva histórico cerrando la inscripción anterior.
      await tx.enrollment.update({
        where: { id: openEnrollment.id },
        data: {
          status: "CLOSED",
          notes: [openEnrollment.notes, "Cerrada por cambio de grado"]
            .filter(Boolean)
            .join(" | "),
        },
      });
    }

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: input.studentId,
        academicCycleId: input.academicCycleId,
        gradeId: input.gradeId,
        applicationType: input.applicationType,
        status: "DRAFT",
        notes: input.notes?.trim() || null,
      },
      include: enrollmentInclude,
    });

    await tx.auditEvent.create({
      data: {
        userId: actorUserId,
        action: openEnrollment ? "UPDATE" : "CREATE",
        entityType: "Enrollment",
        entityId: enrollment.id,
        beforeData: openEnrollment
          ? {
              previousEnrollmentId: openEnrollment.id,
              previousGradeId: openEnrollment.gradeId,
              previousStatus: openEnrollment.status,
            }
          : undefined,
        afterData: {
          studentId: input.studentId,
          academicCycleId: input.academicCycleId,
          gradeId: input.gradeId,
          applicationType: input.applicationType,
          status: enrollment.status,
        },
      },
    });

    return publicEnrollment(enrollment);
  });
}

export async function transitionEnrollmentStatus(
  schoolId: string,
  actorUserId: string,
  enrollmentId: string,
  nextStatus: EnrollmentStatus,
  options: { rejectionReason?: string | null; notes?: string | null } = {},
) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, student: { schoolId } },
    include: enrollmentInclude,
  });
  if (!enrollment) {
    throw Object.assign(new Error("Inscripción no encontrada"), { status: 404 });
  }

  const allowed = allowedTransitions[enrollment.status];
  if (!allowed.includes(nextStatus)) {
    throw Object.assign(
      new Error(
        `No se puede pasar de ${enrollment.status} a ${nextStatus}. Flujo: BORRADOR → PENDIENTE_DE_REVISIÓN → INCOMPLETA/APROBADA → CERRADA`,
      ),
      { status: 400 },
    );
  }

  if (nextStatus === "APPROVED" || nextStatus === "INCOMPLETE") {
    // Aprobar requiere enrollment.approve; se valida en la capa HTTP.
  }

  const updated = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: nextStatus,
      ...(nextStatus === "APPROVED"
        ? { approvedAt: new Date(), approvedByUserId: actorUserId, rejectionReason: null }
        : {}),
      ...(nextStatus === "REJECTED"
        ? { rejectionReason: options.rejectionReason?.trim() || "Sin motivo indicado" }
        : {}),
      ...(options.notes !== undefined ? { notes: options.notes?.trim() || null } : {}),
    },
    include: enrollmentInclude,
  });

  await prisma.auditEvent.create({
    data: {
      userId: actorUserId,
      action: "UPDATE",
      entityType: "Enrollment",
      entityId: enrollmentId,
      beforeData: { status: enrollment.status },
      afterData: { status: nextStatus },
    },
  });

  return publicEnrollment(updated);
}

export async function getEnrollment(schoolId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, student: { schoolId } },
    include: enrollmentInclude,
  });
  if (!enrollment) {
    throw Object.assign(new Error("Inscripción no encontrada"), { status: 404 });
  }
  return publicEnrollment(enrollment);
}
