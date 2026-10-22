import { ApiError } from '../auth/api.ts';
import type { Address } from './addresses.ts';
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

export type GuardianRelationship = 'MOTHER' | 'FATHER' | 'TUTOR' | 'GRANDPARENT' | 'SIBLING' | 'OTHER';

export type Guardian = {
  id: string;
  givenNames: string;
  firstSurname: string;
  secondSurname: string | null;
  marriedSurname: string | null;
  fullName: string;
  dpiMasked: string | null;
  hasDpi: boolean;
  mobilePhone: string | null;
  homePhone: string | null;
  primaryEmail: string | null;
  occupation: string | null;
  workplaceName: string | null;
  workplacePhone: string | null;
};

export type GuardianInput = Partial<{
  givenNames: string;
  firstSurname: string;
  secondSurname: string | null;
  marriedSurname: string | null;
  dpi: string | null;
  mobilePhone: string | null;
  homePhone: string | null;
  primaryEmail: string | null;
  occupation: string | null;
  workplaceName: string | null;
  workplacePhone: string | null;
}>;

export type LinkedStudent = { id: string; studentCode: string; fullName: string; relationship: GuardianRelationship };

export type GuardianSearchResult = Guardian & { students: LinkedStudent[] };

export type GuardianLinkFields = {
  relationship: GuardianRelationship;
  customRelationship: string | null;
  livesWithStudent: boolean;
  primaryContact: boolean;
  legalRepresentative: boolean;
};

export type GuardianLink = GuardianLinkFields & {
  id: string;
  authorizedForSchoolProcedures: boolean;
  startDate: string;
  /** sharesStudentAddress: vive en la misma dirección (misma fila) que el alumno. */
  guardian: Guardian & { address: Address | null; sharesStudentAddress: boolean };
  /** Hermanos: otros alumnos que comparten este responsable. */
  otherStudents: LinkedStudent[];
};

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function listStudentGuardians(request: AuthenticatedRequest, studentId: string, signal?: AbortSignal) {
  return parseResponse<{ data: GuardianLink[] }>(await request(`/students/${studentId}/guardians`, { signal }));
}

export async function searchGuardians(request: AuthenticatedRequest, q: string) {
  return parseResponse<{ data: GuardianSearchResult[] }>(
    await request(`/guardians?${new URLSearchParams({ q }).toString()}`),
  );
}

/** Vincula un responsable existente (guardianId) o registra uno nuevo (guardian). */
export async function linkGuardian(
  request: AuthenticatedRequest,
  studentId: string,
  input: Partial<GuardianLinkFields> & { relationship: GuardianRelationship } & (
    | { guardianId: string }
    | { guardian: GuardianInput }
  ),
) {
  return parseResponse<{ data: GuardianLink }>(await request(`/students/${studentId}/guardians`, jsonInit('POST', input)));
}

export async function updateGuardianLink(
  request: AuthenticatedRequest,
  studentId: string,
  linkId: string,
  input: Partial<GuardianLinkFields>,
) {
  return parseResponse<{ data: GuardianLink }>(
    await request(`/students/${studentId}/guardians/${linkId}`, jsonInit('PATCH', input)),
  );
}

export async function unlinkGuardian(request: AuthenticatedRequest, studentId: string, linkId: string) {
  return parseResponse<{ data: { id: string } }>(
    await request(`/students/${studentId}/guardians/${linkId}`, { method: 'DELETE' }),
  );
}

export async function updateGuardian(request: AuthenticatedRequest, guardianId: string, input: GuardianInput) {
  return parseResponse<{ data: Guardian }>(await request(`/guardians/${guardianId}`, jsonInit('PATCH', input)));
}
