import { ChevronDown, Menu, Search } from 'lucide-react';
import { getRouteByPath } from '../../config/navigation.ts';
import styles from './Topbar.module.css';

type TopbarProps = {
  pathname: string;
  onMenuClick: () => void;
};

export function Topbar({ pathname, onMenuClick }: TopbarProps) {
  const currentRoute = getRouteByPath(pathname);

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
        <p className={styles.title}>{currentRoute?.label ?? 'Página no encontrada'}</p>
      </div>

      <label className={styles.search}>
        <span className="srOnly">Búsqueda global</span>
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input className={styles.searchInput} type="search" placeholder="Buscar" disabled />
      </label>

      <div className={styles.profile} aria-hidden="true">
        <span className={styles.avatar}>US</span>
        <span className={styles.userName}>Usuario</span>
        <ChevronDown size={16} strokeWidth={1.75} />
      </div>
    </header>
  );
}
