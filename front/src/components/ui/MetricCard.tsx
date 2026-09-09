import type { LucideIcon } from 'lucide-react';
import styles from './MetricCard.module.css';

type MetricCardProps = {
  title: string;
  icon: LucideIcon;
  value?: string;
  hint?: string;
};

export function MetricCard({
  title,
  icon: Icon,
  value = '—',
  hint = 'Disponible al conectar los datos',
}: MetricCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.icon} aria-hidden="true">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.value}>{value}</p>
      <p className={styles.hint}>{hint}</p>
    </article>
  );
}
