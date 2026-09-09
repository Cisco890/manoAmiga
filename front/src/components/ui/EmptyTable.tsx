import { EmptyState } from '../feedback/EmptyState.tsx';
import styles from './EmptyTable.module.css';

type EmptyTableProps = {
  columns: string[];
  message?: string;
  framed?: boolean;
};

export function EmptyTable({
  columns,
  message = 'No hay información cargada',
  framed = true,
}: EmptyTableProps) {
  return (
    <div className={[styles.wrap, framed ? styles.framed : ''].filter(Boolean).join(' ')}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
      </table>
      <EmptyState message={message} />
    </div>
  );
}
