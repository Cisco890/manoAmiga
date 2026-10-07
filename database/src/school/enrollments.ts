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

// Índice único parcial creado en la migración 20261007120000_enrollment_grade_history.
// Es la garantía real de una sola inscripción activa por alumno y ciclo, incluso con
// solicitudes simultáneas que pasan la validación previa al mismo tiempo.
export const oneOpenEnrollmentIndex = "enrollments_one_open_per_student_cycle";

function isOpenEnrollmentConflict(error: unknown) {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") {
    return false;
  }
  return JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes(oneOpenEnrollmentIndex);
}

function openEnrollmentConflict(cycleName: string) {
  return Object.assign(
    new Error(
      `El alumno ya tiene una inscripción activa en el ciclo ${cycleName}. ` +
        "Cancele o cierre la inscripción existente antes de crear otra.",
    ),
    { status: 409 },
  );
}

const allowedTransitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "CANCELLED"],
  PENDING_REVIEW: ["INCOMPLETE", "APPROVED", "REJECTED", "CANCELLED"],
  // Una inscripción devuelta vuelve a revisión; no se aprueba sin pasar por PENDING_REVIEW.
  INCOMPLETE: ["PENDING_REVIEW", "CANCELLED"],
  APPROVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

// Decisiones de revisión (dirección): requieren enrollment.approve. Devolver (INCOMPLETE) y
// rechazar definitivamente (REJECTED) exigen un motivo que se muestra a la secretaría.
export const reviewStatuses: EnrollmentStatus[] = ["APPROVED", "INCOMPLETE", "REJECTED"];
const statusesRequiringReason: EnrollmentStatus[] = ["INCOMPLETE", "REJECTED"];
const reviewReasonMinLength = 5;
const reviewReasonMaxLength = 1000;

export function isReviewStatus(status: EnrollmentStatus) {
  return reviewStatuses.includes(status);
}

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
  approvedByUserId: string | null;
  rejectionReason: string | null;
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
    approvedByUserId: enrollment.approvedByUserId,
    rejectionReason: enrollment.rejectionReason,
    // La generación de ficha PDF y carné (Sprint 5) solo se habilita para inscripciones aprobadas.
    canGenerateDocuments: enrollment.status === "APPROVED",
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
      select: { id: true, name: true, status: true },
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

  try {
    return await createEnrollmentInTransaction(actorUserId, input);
  } catch (error) {
    if (isOpenEnrollmentConflict(error)) throw openEnrollmentConflict(cycle.name);
    throw error;
  }
}

function createEnrollmentInTransaction(
  actorUserId: string,
  input: {
    studentId: string;
    academicCycleId: string;
    gradeId: string;
    applicationType: ApplicationType;
    notes?: string | null;
  },
) {
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

  const rejectionReason = options.rejectionReason?.trim() ?? "";
  if (statusesRequiringReason.includes(nextStatus)) {
    if (rejectionReason.length < reviewReasonMinLength || rejectionReason.length > reviewReasonMaxLength) {
      throw Object.assign(
        new Error(
          `El motivo es obligatorio y debe contener entre ${reviewReasonMinLength} y ${reviewReasonMaxLength} caracteres`,
        ),
        { status: 400 },
      );
    }
  }

  const reviewData =
    nextStatus === "APPROVED"
      ? { approvedAt: new Date(), approvedByUserId: actorUserId, rejectionReason: null }
      : statusesRequiringReason.includes(nextStatus)
        ? { approvedAt: null, approvedByUserId: null, rejectionReason }
        : {};

  const updated = await prisma.$transaction(async (tx) => {
    // Actualización condicionada al estado leído: si otra persona ya cambió la inscripción
    // (por ejemplo, dos revisores a la vez), no se pisa su decisión.
    const { count } = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: enrollment.status },
      data: {
        status: nextStatus,
        ...reviewData,
        ...(options.notes !== undefined ? { notes: options.notes?.trim() || null } : {}),
      },
    });
    if (count === 0) {
      throw Object.assign(
        new Error("La inscripción cambió de estado mientras se procesaba. Recargue e intente de nuevo."),
        { status: 409 },
      );
    }

    await tx.auditEvent.create({
      data: {
        userId: actorUserId,
        action: "UPDATE",
        entityType: "Enrollment",
        entityId: enrollmentId,
        beforeData: { status: enrollment.status },
        afterData: {
          status: nextStatus,
          ...(statusesRequiringReason.includes(nextStatus) ? { rejectionReason } : {}),
        },
      },
    });

    return tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: enrollmentInclude });
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
