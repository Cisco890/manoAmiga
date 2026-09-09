import type { ReactNode } from 'react';
import styles from './PlaceholderPanel.module.css';

type PlaceholderPanelProps = {
  title: string;
  children: ReactNode;
};

export function PlaceholderPanel({ title, children }: PlaceholderPanelProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
