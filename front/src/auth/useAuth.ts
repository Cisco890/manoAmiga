import { useContext } from 'react';
import { AuthContext } from './AuthState.ts';

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return value;
}
