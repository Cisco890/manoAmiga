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

export const enrollmentStatusLabels: Record<EnrollmentStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Pendiente de revisión',
  INCOMPLETE: 'Incompleta',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};
