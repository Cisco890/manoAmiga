import { GraduationCap, X } from 'lucide-react';
import { navigationSections } from '../../config/navigation.ts';
import { SidebarItem } from './SidebarItem.tsx';
import { SidebarSection } from './SidebarSection.tsx';
import styles from './Sidebar.module.css';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <aside className={[styles.sidebar, open ? styles.open : ''].filter(Boolean).join(' ')} aria-label="Navegación principal">
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">
          <GraduationCap size={22} strokeWidth={1.75} />
        </div>
        <div className={styles.brandText}>
          <p className={styles.brandName}>ManoAmiga</p>
          <p className={styles.brandHint}>Espacio para logotipo</p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Cerrar menú"
        >
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Módulos del sistema">
        {navigationSections.map((section) => (
          <SidebarSection key={section.title} title={section.title}>
            {section.items.map((item) => (
              <SidebarItem key={item.path} item={item} onNavigate={onClose} />
            ))}
          </SidebarSection>
        ))}
      </nav>

      <p className={styles.version}>v0.1</p>
    </aside>
  );
}
