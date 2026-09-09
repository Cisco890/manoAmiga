import type { ReactNode } from 'react';
import styles from './DisabledToolbar.module.css';

type DisabledToolbarProps = {
  children: ReactNode;
};

export function DisabledToolbar({ children }: DisabledToolbarProps) {
  return <div className={styles.toolbar}>{children}</div>;
}
