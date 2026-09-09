import { getRouteByPath } from '../config/navigation.ts';
import { EmptyTable } from '../components/ui/EmptyTable.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/usuarios');

export function UsersPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Usuarios'}
        description={route?.description ?? ''}
        actions={
          <button type="button" className="btn btnPrimary" disabled>
            Nuevo usuario
          </button>
        }
      />
      <EmptyTable columns={['Usuario', 'Correo', 'Rol', 'Estado']} />
    </div>
  );
}
