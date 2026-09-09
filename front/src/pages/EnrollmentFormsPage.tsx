import { getRouteByPath } from '../config/navigation.ts';
import { DisabledToolbar } from '../components/ui/DisabledToolbar.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import styles from './pageLayout.module.css';

const route = getRouteByPath('/fichas-inscripcion');

export function EnrollmentFormsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Fichas de inscripción'}
        description={route?.description ?? ''}
        actions={
          <button type="button" className="btn btnPrimary" disabled>
            Generar ficha
          </button>
        }
      />
      <DisabledToolbar>
        <label className="label">
          Ciclo
          <select className="select" disabled defaultValue="">
            <option value="">Seleccionar ciclo</option>
          </select>
        </label>
        <label className="label">
          Grado
          <select className="select" disabled defaultValue="">
            <option value="">Seleccionar grado</option>
          </select>
        </label>
        <label className="label">
          Alumno
          <select className="select" disabled defaultValue="">
            <option value="">Seleccionar alumno</option>
          </select>
        </label>
      </DisabledToolbar>
      <PlaceholderPanel title="Vista previa">
        <div className={styles.previewStub}>Área reservada para generar o consultar fichas</div>
      </PlaceholderPanel>
    </div>
  );
}
