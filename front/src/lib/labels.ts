import type {
  AcademicCycleStatus,
  ApplicationType,
  EnrollmentStatus,
  GradeLevel,
  Sex,
  StudentStatus,
} from '../api/school.ts';

export const cycleStatusLabels: Record<AcademicCycleStatus, string> = {
  PLANNED: 'Planificado',
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
};

export const gradeLevelLabels: Record<GradeLevel, string> = {
  PRE_PRIMARY: 'Preprimaria',
  PRIMARY: 'Primaria',
  SECONDARY: 'Básico',
  OTHER: 'Otro',
};

export const studentStatusLabels: Record<StudentStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  GRADUATED: 'Egresado',
  WITHDRAWN: 'Retirado',
};

export const sexLabels: Record<Sex, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
  NOT_SPECIFIED: 'No especificado',
};

export const applicationTypeLabels: Record<ApplicationType, string> = {
  NEW_ENROLLMENT: 'Ingreso nuevo',
  RE_ENROLLMENT: 'Reinscripción',
  TRANSFER: 'Traslado',
};

/** Texto del botón que lleva una inscripción a cada estado. */
export const enrollmentActionLabels: Record<EnrollmentStatus, string> = {
  DRAFT: 'Volver a borrador',
  PENDING_REVIEW: 'Enviar a revisión',
  INCOMPLETE: 'Devolver para corrección',
  APPROVED: 'Aprobar',
  REJECTED: 'Rechazar',
  CLOSED: 'Cerrar',
  CANCELLED: 'Cancelar',
};

/** Estados a los que solo llega una decisión de dirección (permiso enrollment.approve). */
export const enrollmentReviewStatuses: EnrollmentStatus[] = ['APPROVED', 'INCOMPLETE', 'REJECTED'];

export const enrollmentStatusLabels: Record<EnrollmentStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Pendiente de revisión',
  INCOMPLETE: 'Incompleta',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};
