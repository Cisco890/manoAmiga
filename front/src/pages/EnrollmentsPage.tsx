import { getRouteByPath } from '../config/navigation.ts';
import { DisabledToolbar } from '../components/ui/DisabledToolbar.tsx';
import { EmptyTable } from '../components/ui/EmptyTable.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/inscripciones');

export function EnrollmentsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Inscripciones'}
        description={route?.description ?? ''}
        actions={
          <button type="button" className="btn btnPrimary" disabled>
            Nueva inscripción
          </button>
        }
      />
      <DisabledToolbar>
        <label className="label">
          Ciclo
          <select className="select" disabled defaultValue="">
            <option value="">Todos los ciclos</option>
          </select>
        </label>
        <label className="label">
          Grado
          <select className="select" disabled defaultValue="">
            <option value="">Todos los grados</option>
          </select>
        </label>
        <label className="label">
          Estado
          <select className="select" disabled defaultValue="">
            <option value="">Todos los estados</option>
          </select>
        </label>
      </DisabledToolbar>
      <EmptyTable columns={['Alumno', 'Ciclo', 'Grado', 'Tipo', 'Estado', 'Fecha']} />
    </div>
  );
}
