import type { AuthPayload } from './types.ts';

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
  } catch {
    // La respuesta sin JSON conserva el mensaje genérico.
  }
  return 'No fue posible completar la solicitud';
}

async function authRequest(path: string, body?: unknown): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new ApiError(await responseError(response), response.status);
  return (await response.json()) as AuthPayload;
}

export function loginRequest(email: string, password: string) {
  return authRequest('/auth/login', { email, password });
}

export function refreshRequest() {
  return authRequest('/auth/refresh');
}

export async function logoutRequest() {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
