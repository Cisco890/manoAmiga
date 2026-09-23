import { getRouteByPath } from '../config/navigation.ts';
import { useAuth } from '../auth/useAuth.ts';
import { DisabledToolbar } from '../components/ui/DisabledToolbar.tsx';
import { EmptyTable } from '../components/ui/EmptyTable.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/alumnos');

export function StudentsPage() {
  const { can } = useAuth();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Alumnos'}
        description={route?.description ?? ''}
        actions={can('student.write') ? (
          <button type="button" className="btn btnPrimary" disabled>
            Nuevo alumno
          </button>
        ) : undefined}
      />
      <DisabledToolbar>
        <label className="label">
          Buscar alumno
          <input className="field fieldWide" type="search" placeholder="Buscar alumno" disabled />
        </label>
      </DisabledToolbar>
      <EmptyTable columns={['Código', 'Alumno', 'Grado', 'Padrino', 'Estado']} />
    </div>
  );
}
