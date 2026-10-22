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

export type AddressInput = {
  fullAddress: string | null;
  lot: string | null;
  block: string | null;
  sector: string | null;
  zone: string | null;
  neighborhood: string | null;
  village: string | null;
  municipality: string | null;
  department: string | null;
  country: string | null;
  reference: string | null;
};

/** `formatted` es la dirección en una línea que reutilizan la ficha y la ficha PDF. */
export type Address = AddressInput & { id: string; formatted: string | null };

export type AddressUser = { type: 'student' | 'guardian'; id: string; fullName: string };

const jsonInit = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function getStudentAddress(request: AuthenticatedRequest, studentId: string) {
  return parseResponse<{ data: { address: Address | null; sharedWith: AddressUser[] } }>(
    await request(`/students/${studentId}/address`),
  );
}

export async function saveStudentAddress(request: AuthenticatedRequest, studentId: string, address: AddressInput) {
  return parseResponse<{ data: { address: Address; sharedWith: AddressUser[] } }>(
    await request(`/students/${studentId}/address`, jsonInit(address)),
  );
}

export async function saveGuardianAddress(
  request: AuthenticatedRequest,
  guardianId: string,
  body: { sameAsStudentId: string } | { address: AddressInput | null },
) {
  return parseResponse<{ data: { address: Address | null } }>(await request(`/guardians/${guardianId}/address`, jsonInit(body)));
}
