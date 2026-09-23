import { LogOut, Menu, Search } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.ts';
import { getRouteByPath } from '../../config/navigation.ts';
import styles from './Topbar.module.css';

type TopbarProps = {
  pathname: string;
  onMenuClick: () => void;
};

export function Topbar({ pathname, onMenuClick }: TopbarProps) {
  const currentRoute = getRouteByPath(pathname);
  const { user, isAdmin, logout } = useAuth();
  const initials = user?.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'MA';

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Abrir menú"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Gestión institucional</span>
          <p className={styles.title}>{currentRoute?.label ?? 'Página no encontrada'}</p>
        </div>
      </div>

      <label className={styles.search}>
        <span className="srOnly">Búsqueda global</span>
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input className={styles.searchInput} type="search" placeholder="Buscar" disabled />
      </label>

      <div className={styles.profile}>
        <span className={styles.avatar} aria-hidden="true">{initials}</span>
        <span className={styles.userDetails}>
          <span className={styles.userName}>{user?.displayName}</span>
          <span className={styles.userRole}>{isAdmin ? 'Administrador' : 'Colaborador'}</span>
        </span>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void logout()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
