import { Link, useLocation } from 'react-router-dom';
import { dashboardRoute, getRouteByPath } from '../../config/navigation.ts';
import styles from './Breadcrumbs.module.css';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const currentRoute = getRouteByPath(pathname);
  const isDashboard = pathname === '/';
  const currentLabel = currentRoute?.label ?? 'Página no encontrada';

  return (
    <nav className={styles.nav} aria-label="Miga de pan">
      <ol className={styles.list}>
        <li>
          {isDashboard ? (
            <span aria-current="page">{dashboardRoute.label}</span>
          ) : (
            <Link to={dashboardRoute.path}>Inicio</Link>
          )}
        </li>
        {!isDashboard ? (
          <li>
            <span aria-current="page">{currentLabel}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
