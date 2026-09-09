import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  message: string;
};

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Inbox size={20} strokeWidth={1.75} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
