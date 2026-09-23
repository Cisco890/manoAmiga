import { Navigate, Outlet, useLocation } from 'react-router-dom';
import logo from '../assets/mano-amiga-logo.png';
import { useAuth } from './useAuth.ts';
import styles from './RouteGuards.module.css';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className={styles.loading} role="status">
        <img src={logo} alt="Mano Amiga" />
        <span className={styles.spinner} aria-hidden="true" />
        <p>Verificando sesión…</p>
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function AdminRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
