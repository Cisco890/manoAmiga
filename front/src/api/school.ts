import { ApiError } from '../auth/api.ts';
import type { AuthenticatedRequest } from './users.ts';

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = 'No fue posible completar la solicitud';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Conserva el mensaje genérico.
  }
  throw new ApiError(message, response.status);
}

export type AcademicCycleStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type GradeLevel = 'PRE_PRIMARY' | 'PRIMARY' | 'SECONDARY' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'WITHDRAWN';
export type Sex = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
export type ApplicationType = 'NEW_ENROLLMENT' | 'RE_ENROLLMENT' | 'TRANSFER';
export type EnrollmentStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'INCOMPLETE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED';

export type AcademicCycle = {
  id: string;
  schoolId: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  status: AcademicCycleStatus;
};

export type Grade = {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  level: GradeLevel;
  displayOrder: number;
  minAge: number | null;
  maxAge: number | null;
  active: boolean;
};

export type Student = {
  id: string;
  studentCode: string;
  givenNames: string;
  firstSurname: string;
  secondSurname: string | null;
  usualName: string | null;
  fullName: string;
  birthPlace: string | null;
  birthDate: string | null;
  cuiMasked: string | null;
  hasCui: boolean;
  homePhone: string | null;
  sex: Sex;
  status: StudentStatus;
  notes: string | null;
  currentGrade: {
    id: string;
    name: string;
    code: string;
    enrollmentStatus: string;
    cycleName: string;
  } | null;
};

export type Enrollment = {
  id: string;
  studentId: string;
  academicCycleId: string;
  gradeId: string;
  applicationType: ApplicationType;
  requestDate: string;
  status: EnrollmentStatus;
  notes: string | null;
  student: { id: string; studentCode: string; fullName: string };
  academicCycle: { id: string; name: string; year: number; status: string };
  grade: { id: string; code: string; name: string; level: string };
  allowedNextStatuses: EnrollmentStatus[];
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export async function listCycles(request: AuthenticatedRequest, status?: AcademicCycleStatus) {
  const query = status ? `?status=${status}` : '';
  return parseResponse<{ data: AcademicCycle[] }>(await request(`/academic-cycles${query}`));
}

export async function createCycle(
  request: AuthenticatedRequest,
  input: {
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    status: AcademicCycleStatus;
  },
) {
  return parseResponse<{ data: AcademicCycle }>(
    await request('/academic-cycles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateCycle(
  request: AuthenticatedRequest,
  cycleId: string,
  input: Partial<{
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    status: AcademicCycleStatus;
  }>,
) {
  return parseResponse<{ data: AcademicCycle }>(
    await request(`/academic-cycles/${cycleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function listGrades(request: AuthenticatedRequest, activeOnly = false) {
  const query = activeOnly ? '?active=true' : '';
  return parseResponse<{ data: Grade[] }>(await request(`/grades${query}`));
}

export async function createGrade(
  request: AuthenticatedRequest,
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
  return parseResponse<{ data: Grade }>(
    await request('/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateGrade(
  request: AuthenticatedRequest,
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
  return parseResponse<{ data: Grade }>(
    await request(`/grades/${gradeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function listStudents(
  request: AuthenticatedRequest,
  filters: { page: number; limit: number; q?: string; status?: StudentStatus | '' },
) {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.q) parameters.set('q', filters.q);
  if (filters.status) parameters.set('status', filters.status);
  return parseResponse<{ data: Student[]; pagination: Pagination }>(
    await request(`/students?${parameters.toString()}`),
  );
}

export async function createStudent(
  request: AuthenticatedRequest,
  input: {
    givenNames: string;
    firstSurname: string;
    secondSurname?: string | null;
    usualName?: string | null;
    birthPlace?: string | null;
    birthDate?: string | null;
    cui?: string | null;
    homePhone?: string | null;
    sex?: Sex;
    notes?: string | null;
  },
) {
  return parseResponse<{ data: Student }>(
    await request('/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateStudent(
  request: AuthenticatedRequest,
  studentId: string,
  input: {
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
  },
) {
  return parseResponse<{ data: Student }>(
    await request(`/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function listEnrollments(
  request: AuthenticatedRequest,
  filters: {
    page: number;
    limit: number;
    academicCycleId?: string;
    gradeId?: string;
    status?: EnrollmentStatus | '';
    q?: string;
  },
) {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.academicCycleId) parameters.set('academicCycleId', filters.academicCycleId);
  if (filters.gradeId) parameters.set('gradeId', filters.gradeId);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.q) parameters.set('q', filters.q);
  return parseResponse<{ data: Enrollment[]; pagination: Pagination }>(
    await request(`/enrollments?${parameters.toString()}`),
  );
}

export async function createEnrollment(
  request: AuthenticatedRequest,
  input: {
    studentId: string;
    academicCycleId: string;
    gradeId: string;
    applicationType: ApplicationType;
    notes?: string | null;
  },
) {
  return parseResponse<{ data: Enrollment }>(
    await request('/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function transitionEnrollmentStatus(
  request: AuthenticatedRequest,
  enrollmentId: string,
  status: EnrollmentStatus,
  extras?: { rejectionReason?: string; notes?: string },
) {
  return parseResponse<{ data: Enrollment }>(
    await request(`/enrollments/${enrollmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extras }),
    }),
  );
}
