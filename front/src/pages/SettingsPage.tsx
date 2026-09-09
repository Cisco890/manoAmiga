import { getRouteByPath } from '../config/navigation.ts';
import { EmptyState } from '../components/feedback/EmptyState.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/configuracion');

export function SettingsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Configuración'}
        description={route?.description ?? ''}
        actions={
          <button type="button" className="btn btnPrimary" disabled>
            Guardar cambios
          </button>
        }
      />
      <div className={styles.settingsGrid}>
        <PlaceholderPanel title="Datos del colegio">
          <EmptyState message="Módulo pendiente" />
        </PlaceholderPanel>
        <PlaceholderPanel title="Ciclos escolares">
          <EmptyState message="Módulo pendiente" />
        </PlaceholderPanel>
        <PlaceholderPanel title="Grados y secciones">
          <EmptyState message="Módulo pendiente" />
        </PlaceholderPanel>
        <PlaceholderPanel title="Plantillas de documentos">
          <EmptyState message="Módulo pendiente" />
        </PlaceholderPanel>
      </div>
    </div>
  );
}
