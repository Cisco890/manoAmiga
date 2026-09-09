import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Topbar } from './Topbar.tsx';
import styles from './DashboardLayout.module.css';

export function DashboardLayout() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className={styles.shell}>
      {sidebarOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={styles.mainColumn}>
        <Topbar pathname={pathname} onMenuClick={() => setSidebarOpen(true)} />
        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Breadcrumbs />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
