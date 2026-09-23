import { X } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.ts';
import logo from '../../assets/mano-amiga-logo.png';
import { navigationSections } from '../../config/navigation.ts';
import { SidebarItem } from './SidebarItem.tsx';
import { SidebarSection } from './SidebarSection.tsx';
import styles from './Sidebar.module.css';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requiredRole || isAdmin),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className={[styles.sidebar, open ? styles.open : ''].filter(Boolean).join(' ')} aria-label="Navegación principal">
      <div className={styles.brand}>
        <img className={styles.logo} src={logo} alt="Mano Amiga — Juntos transformando vidas" />
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
        {visibleSections.map((section) => (
          <SidebarSection key={section.title} title={section.title}>
            {section.items.map((item) => (
              <SidebarItem key={item.path} item={item} onNavigate={onClose} />
            ))}
          </SidebarSection>
        ))}
      </nav>

      <div className={styles.footer}>
        <span className={styles.footerMark} aria-hidden="true" />
        <div>
          <p className={styles.footerTitle}>Mano Amiga</p>
          <p className={styles.version}>Sistema institucional · v0.1</p>
        </div>
      </div>
    </aside>
  );
}
