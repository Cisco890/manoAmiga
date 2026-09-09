import type { ReactNode } from 'react';
import styles from './SidebarSection.module.css';

type SidebarSectionProps = {
  title: string;
  children: ReactNode;
};

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className={styles.section}>
      <p className={styles.title}>{title}</p>
      <div className={styles.items}>{children}</div>
    </div>
  );
}
