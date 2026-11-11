import { ApiError } from '../auth/api.ts';
import type { AuthenticatedRequest } from './users.ts';

/** Cliente del módulo de padrinos (MA-33). MA-34, MA-35 y MA-36 lo amplían. */

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

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export type SponsorType = 'INDIVIDUAL' | 'ORGANIZATION';
export type SponsorshipStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';

export type Sponsor = {
  id: string;
  type: SponsorType;
  givenNames: string | null;
  firstSurname: string | null;
  secondSurname: string | null;
  organizationName: string | null;
  /** Nombre que se muestra: la organización o la persona. */
  fullName: string;
  /** Solo en organizaciones: la persona de contacto. */
  contactName: string | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
};

export type SponsorshipSummary = {
  id: string;
  status: SponsorshipStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  student: { id: string; studentCode: string; fullName: string };
};

export type SponsorListItem = Sponsor & { openSponsorships: SponsorshipSummary[] };
export type SponsorDetail = Sponsor & { sponsorships: SponsorshipSummary[] };

export type SponsorMatchReason = 'name' | 'email' | 'phone';
export type SponsorMatch = SponsorListItem & { reasons: SponsorMatchReason[] };

export type SponsorInput = Partial<{
  type: SponsorType;
  givenNames: string | null;
  firstSurname: string | null;
  secondSurname: string | null;
  organizationName: string | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}>;

export type SponsorFilters = { page: number; limit: number; q?: string; active?: boolean };

export async function listSponsors(request: AuthenticatedRequest, filters: SponsorFilters, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.q) params.set('q', filters.q);
  if (filters.active !== undefined) params.set('active', String(filters.active));
  return parseResponse<{ data: SponsorListItem[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    await request(`/sponsors?${params.toString()}`, { signal }),
  );
}

/** Posibles duplicados antes de registrar un padrino nuevo. */
export async function findSponsorMatches(
  request: AuthenticatedRequest,
  query: { name?: string; email?: string; phone?: string; excludeId?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value?.trim()) params.set(key, value.trim());
  return parseResponse<{ data: SponsorMatch[] }>(await request(`/sponsors/matches?${params.toString()}`, { signal }));
}

export async function getSponsor(request: AuthenticatedRequest, sponsorId: string, signal?: AbortSignal) {
  return parseResponse<{ data: SponsorDetail }>(await request(`/sponsors/${sponsorId}`, { signal }));
}

export async function createSponsor(request: AuthenticatedRequest, input: SponsorInput) {
  return parseResponse<{ data: SponsorDetail }>(await request('/sponsors', jsonInit('POST', input)));
}

export async function updateSponsor(request: AuthenticatedRequest, sponsorId: string, input: SponsorInput & { active?: boolean }) {
  return parseResponse<{ data: SponsorDetail }>(await request(`/sponsors/${sponsorId}`, jsonInit('PATCH', input)));
}

export async function deactivateSponsor(request: AuthenticatedRequest, sponsorId: string) {
  return parseResponse<{ data: SponsorDetail }>(await request(`/sponsors/${sponsorId}`, { method: 'DELETE' }));
}
