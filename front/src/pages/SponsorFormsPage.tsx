import { getRouteByPath } from '../config/navigation.ts';
import { useAuth } from '../auth/useAuth.ts';
import { DisabledToolbar } from '../components/ui/DisabledToolbar.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/formularios-padrinos');

export function SponsorFormsPage() {
  const { can } = useAuth();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Formularios de padrinos'}
        description={route?.description ?? ''}
        actions={can('document.generate') ? (
          <button type="button" className="btn btnPrimary" disabled>
            Generar formulario
          </button>
        ) : undefined}
      />
      <DisabledToolbar>
        <label className="label">
          Padrino
          <select className="select" disabled defaultValue="">
            <option value="">Seleccionar padrino</option>
          </select>
        </label>
        <label className="label">
          Alumno
          <select className="select" disabled defaultValue="">
            <option value="">Seleccionar alumno</option>
          </select>
        </label>
        <label className="label">
          Estado
          <select className="select" disabled defaultValue="">
            <option value="">Todos los estados</option>
          </select>
        </label>
      </DisabledToolbar>
      <PlaceholderPanel title="Vista previa">
        <div className={styles.previewStub}>Área reservada para generar o consultar formularios</div>
      </PlaceholderPanel>
    </div>
  );
}
