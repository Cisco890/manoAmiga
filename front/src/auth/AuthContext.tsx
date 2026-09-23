import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiBaseUrl, loginRequest, logoutRequest, refreshRequest } from './api.ts';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthState.ts';
import type { AuthPayload, AuthUser } from './types.ts';
let pendingRefresh: Promise<AuthPayload> | null = null;

function refreshOnce() {
  pendingRefresh ??= refreshRequest().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null);

  const applyAuth = useCallback((payload: AuthPayload) => {
    setUser(payload.user);
    setAccessToken(payload.accessToken);
    setAccessTokenExpiresAt(Date.now() + payload.expiresIn * 1000);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let active = true;
    void refreshOnce()
      .then((payload) => {
        if (active) applyAuth(payload);
      })
      .catch(() => {
        if (active) setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, [applyAuth]);

  useEffect(() => {
    if (status !== 'authenticated' || !accessTokenExpiresAt) return;
    const delay = Math.max(1_000, accessTokenExpiresAt - Date.now() - 60_000);
    const timeout = window.setTimeout(() => {
      void refreshOnce()
        .then(applyAuth)
        .catch(() => {
          setUser(null);
          setAccessToken(null);
          setAccessTokenExpiresAt(null);
          setStatus('unauthenticated');
        });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [accessTokenExpiresAt, applyAuth, status]);

  const login = useCallback(
    async (email: string, password: string) => {
      applyAuth(await loginRequest(email, password));
    },
    [applyAuth],
  );

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const execute = (token: string) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(`${apiBaseUrl}${path}`, {
          ...init,
          credentials: 'include',
          headers,
        });
      };

      if (!accessToken) throw new Error('No hay una sesión activa');
      let response = await execute(accessToken);
      if (response.status !== 401) return response;

      try {
        const payload = await refreshOnce();
        applyAuth(payload);
        response = await execute(payload.accessToken);
        return response;
      } catch (error) {
        setUser(null);
        setAccessToken(null);
        setAccessTokenExpiresAt(null);
        setStatus('unauthenticated');
        throw error;
      }
    },
    [accessToken, applyAuth],
  );

  const logout = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    setAccessTokenExpiresAt(null);
    setStatus('unauthenticated');
    try {
      await logoutRequest();
    } catch {
      // El estado local se limpia incluso si la API no está disponible.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accessToken,
      isAdmin: user?.roles.includes('ADMIN') ?? false,
      can: (permission) => user?.permissions.includes(permission) ?? false,
      request,
      login,
      logout,
    }),
    [accessToken, login, logout, request, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
