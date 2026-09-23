import { ApiError } from '../auth/api.ts';
import type { RoleCode } from '../auth/types.ts';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export type ManagedRole = {
  code: RoleCode;
  name: string;
  description?: string | null;
};

export type ManagedUser = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  status: UserStatus;
  role: ManagedRole;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserFilters = {
  page: number;
  limit: number;
  q?: string;
  status?: UserStatus | '';
  role?: RoleCode | '';
};

export type UserListResponse = {
  data: ManagedUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  password: string;
  role: RoleCode;
};

export type UpdateUserInput = {
  email?: string;
  displayName?: string;
  role?: RoleCode;
  status?: UserStatus;
};

export type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<Response>;

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = 'No fue posible completar la solicitud';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Conserva el mensaje genérico cuando la API no devuelve JSON.
  }
  throw new ApiError(message, response.status);
}

export async function listUsers(request: AuthenticatedRequest, filters: UserFilters) {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.q) parameters.set('q', filters.q);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.role) parameters.set('role', filters.role);
  return parseResponse<UserListResponse>(await request(`/users?${parameters.toString()}`));
}

export async function listRoles(request: AuthenticatedRequest) {
  return parseResponse<{ data: ManagedRole[] }>(await request('/roles'));
}

export async function createUser(request: AuthenticatedRequest, input: CreateUserInput) {
  return parseResponse<{ data: ManagedUser }>(
    await request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateUser(
  request: AuthenticatedRequest,
  userId: string,
  input: UpdateUserInput,
) {
  return parseResponse<{ data: ManagedUser }>(
    await request(`/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function deactivateUser(request: AuthenticatedRequest, userId: string) {
  const response = await request(`/users/${userId}`, { method: 'DELETE' });
  if (response.ok) return;
  await parseResponse<never>(response);
}
