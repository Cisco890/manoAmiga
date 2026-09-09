import { getRouteByPath } from '../config/navigation.ts';
import { EmptyState } from '../components/feedback/EmptyState.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/carnets');

export function IdCardsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Carnés'}
        description={route?.description ?? ''}
        actions={
          <>
            <button type="button" className="btn btnPrimary" disabled>
              Generar
            </button>
            <button type="button" className="btn" disabled>
              Imprimir
            </button>
          </>
        }
      />
      <div className={styles.split}>
        <PlaceholderPanel title="Selección de alumno">
          <EmptyState message="Módulo pendiente" />
        </PlaceholderPanel>
        <PlaceholderPanel title="Vista previa del carné">
          <div className={styles.previewStub}>Área reservada para la vista previa</div>
        </PlaceholderPanel>
      </div>
    </div>
  );
}
