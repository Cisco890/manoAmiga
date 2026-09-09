import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  extra?: ReactNode;
};

export function PageHeader({ title, description, actions, extra }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {extra}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
