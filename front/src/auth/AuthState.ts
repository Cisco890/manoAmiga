import { createContext } from 'react';
import type { AuthUser, PermissionCode } from './types.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  isAdmin: boolean;
  can: (permission: PermissionCode) => boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
