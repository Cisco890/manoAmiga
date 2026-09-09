import { getRouteByPath } from '../config/navigation.ts';
import { DisabledToolbar } from '../components/ui/DisabledToolbar.tsx';
import { EmptyTable } from '../components/ui/EmptyTable.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/padrinos');

export function SponsorsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Padrinos'}
        description={route?.description ?? ''}
        actions={
          <button type="button" className="btn btnPrimary" disabled>
            Nuevo padrino
          </button>
        }
      />
      <DisabledToolbar>
        <label className="label">
          Buscar padrino
          <input className="field fieldWide" type="search" placeholder="Buscar padrino" disabled />
        </label>
      </DisabledToolbar>
      <EmptyTable columns={['Padrino', 'Contacto', 'Alumnos', 'Frecuencia', 'Estado']} />
    </div>
  );
}
