import { ClipboardList, HeartHandshake, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth/useAuth.ts';
import { dashboardRoute } from '../config/navigation.ts';
import { MetricCard } from '../components/ui/MetricCard.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import { EmptyTable } from '../components/ui/EmptyTable.tsx';
import styles from './pageLayout.module.css';

export function DashboardPage() {
  const { can } = useAuth();
  const showQuickActions =
    can('student.write') ||
    can('enrollment.write') ||
    can('sponsor.write') ||
    can('document.generate');

  return (
    <div className={styles.stack}>
      <PageHeader
        title={dashboardRoute.label}
        description={dashboardRoute.description}
        extra={
          <label className="label">
            Ciclo escolar
            <select className="select" disabled defaultValue="">
              <option value="">Seleccionar ciclo</option>
            </select>
          </label>
        }
      />

      <section className={styles.metrics} aria-label="Indicadores">
        <MetricCard title="Alumnos inscritos" icon={Users} />
        <MetricCard title="Alumnos con padrino" icon={HeartHandshake} />
        <MetricCard title="Alumnos sin padrino" icon={UserPlus} />
        <MetricCard title="Inscripciones pendientes" icon={ClipboardList} />
      </section>

      <section className={styles.charts} aria-label="Gráficas">
        <PlaceholderPanel title="Cobertura de padrinazgo">
          <div className={styles.chartStub}>Gráfica pendiente de conexión</div>
        </PlaceholderPanel>
        <PlaceholderPanel title="Alumnos por grado">
          <div className={styles.chartStub}>Gráfica pendiente de conexión</div>
        </PlaceholderPanel>
      </section>

      <section
        className={[styles.bottom, showQuickActions ? '' : styles.bottomSingle]
          .filter(Boolean)
          .join(' ')}
        aria-label="Resumen"
      >
        <PlaceholderPanel title="Inscripciones recientes">
          <EmptyTable columns={['Alumno', 'Grado', 'Estado', 'Fecha']} framed={false} />
        </PlaceholderPanel>
        {showQuickActions ? (
          <PlaceholderPanel title="Accesos rápidos">
            <div className={styles.quickActions}>
              {can('student.write') ? (
                <button type="button" className="btn" disabled>
                  Registrar alumno
                </button>
              ) : null}
              {can('enrollment.write') ? (
                <button type="button" className="btn" disabled>
                  Crear inscripción
                </button>
              ) : null}
              {can('sponsor.write') ? (
                <button type="button" className="btn" disabled>
                  Registrar padrino
                </button>
              ) : null}
              {can('document.generate') ? (
                <button type="button" className="btn" disabled>
                  Generar carné
                </button>
              ) : null}
            </div>
          </PlaceholderPanel>
        ) : null}
      </section>
    </div>
  );
}
