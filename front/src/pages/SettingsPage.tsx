import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  createCycle,
  createGrade,
  listCycles,
  listGrades,
  updateCycle,
  updateGrade,
  type AcademicCycle,
  type AcademicCycleStatus,
  type Grade,
  type GradeLevel,
} from '../api/school.ts';
import { ApiError } from '../auth/api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { EmptyState } from '../components/feedback/EmptyState.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel.tsx';
import { getRouteByPath } from '../config/navigation.ts';
import { cycleStatusLabels, gradeLevelLabels } from '../lib/labels.ts';
import modalStyles from '../components/school/FormModal.module.css';
import styles from './schoolShared.module.css';
import pageStyles from './pageLayout.module.css';

const route = getRouteByPath('/configuracion');

function badgeClass(status: AcademicCycleStatus) {
  if (status === 'ACTIVE') return `${styles.badge} ${styles.badgeActive}`;
  if (status === 'CLOSED') return `${styles.badge} ${styles.badgeMuted}`;
  return `${styles.badge} ${styles.badgeWarn}`;
}

export function SettingsPage() {
  const { can, request } = useAuth();
  const canManage = can('settings.manage');
  const [cycles, setCycles] = useState<AcademicCycle[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [gradeFormOpen, setGradeFormOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<AcademicCycle | null>(null);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cycleResult, gradeResult] = await Promise.all([
        listCycles(request),
        listGrades(request),
      ]);
      setCycles(cycleResult.data);
      setGrades(gradeResult.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={pageStyles.stack}>
      <PageHeader
        title={route?.label ?? 'Configuración'}
        description={route?.description ?? ''}
      />

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.sections}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Ciclos escolares</h2>
              <p>Cree periodos con fecha de inicio/fin y marque uno como activo.</p>
            </div>
            {canManage ? (
              <button
                type="button"
                className="btn btnPrimary"
                onClick={() => {
                  setEditingCycle(null);
                  setCycleFormOpen(true);
                }}
              >
                <Plus size={16} aria-hidden="true" />
                Nuevo ciclo
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className={styles.empty}>Cargando ciclos…</p>
          ) : cycles.length === 0 ? (
            <p className={styles.empty}>No hay ciclos configurados.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Año</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Estado</th>
                    {canManage ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => (
                    <tr key={cycle.id}>
                      <td>{cycle.name}</td>
                      <td>{cycle.year}</td>
                      <td>{cycle.startDate}</td>
                      <td>{cycle.endDate}</td>
                      <td>
                        <span className={badgeClass(cycle.status)}>
                          {cycleStatusLabels[cycle.status]}
                        </span>
                      </td>
                      {canManage ? (
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={`btn ${styles.btnSm}`}
                              onClick={() => {
                                setEditingCycle(cycle);
                                setCycleFormOpen(true);
                              }}
                            >
                              Editar
                            </button>
                            {cycle.status !== 'ACTIVE' ? (
                              <button
                                type="button"
                                className={`btn btnPrimary ${styles.btnSm}`}
                                onClick={() => {
                                  void updateCycle(request, cycle.id, { status: 'ACTIVE' })
                                    .then(load)
                                    .catch((actionError: unknown) => {
                                      setError(
                                        actionError instanceof Error
                                          ? actionError.message
                                          : 'No se pudo activar el ciclo.',
                                      );
                                    });
                                }}
                              >
                                Marcar activo
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Grados</h2>
              <p>Catálogo reutilizable entre ciclos (prekínder, kínder, preparatoria y primaria).</p>
            </div>
            {canManage ? (
              <button
                type="button"
                className="btn btnPrimary"
                onClick={() => {
                  setEditingGrade(null);
                  setGradeFormOpen(true);
                }}
              >
                <Plus size={16} aria-hidden="true" />
                Nuevo grado
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className={styles.empty}>Cargando grados…</p>
          ) : grades.length === 0 ? (
            <p className={styles.empty}>No hay grados configurados.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Nivel</th>
                    <th>Orden</th>
                    <th>Estado</th>
                    {canManage ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {grades.map((grade) => (
                    <tr key={grade.id}>
                      <td>{grade.code}</td>
                      <td>{grade.name}</td>
                      <td>{gradeLevelLabels[grade.level]}</td>
                      <td>{grade.displayOrder}</td>
                      <td>
                        <span className={grade.active ? `${styles.badge} ${styles.badgeActive}` : `${styles.badge} ${styles.badgeMuted}`}>
                          {grade.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {canManage ? (
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={`btn ${styles.btnSm}`}
                              onClick={() => {
                                setEditingGrade(grade);
                                setGradeFormOpen(true);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className={`btn ${styles.btnSm}`}
                              onClick={() => {
                                void updateGrade(request, grade.id, { active: !grade.active })
                                  .then(load)
                                  .catch((actionError: unknown) => {
                                    setError(
                                      actionError instanceof Error
                                        ? actionError.message
                                        : 'No se pudo actualizar el grado.',
                                    );
                                  });
                              }}
                            >
                              {grade.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={pageStyles.settingsGrid}>
          <PlaceholderPanel title="Datos del colegio">
            <EmptyState message="Módulo pendiente" />
          </PlaceholderPanel>
          <PlaceholderPanel title="Plantillas de documentos">
            <EmptyState message="Módulo pendiente" />
          </PlaceholderPanel>
        </div>
      </div>

      {cycleFormOpen ? (
        <CycleFormModal
          cycle={editingCycle}
          onClose={() => setCycleFormOpen(false)}
          onSave={async (input) => {
            if (editingCycle) {
              await updateCycle(request, editingCycle.id, input);
            } else {
              await createCycle(request, {
                name: input.name!,
                year: input.year!,
                startDate: input.startDate!,
                endDate: input.endDate!,
                status: input.status ?? 'PLANNED',
              });
            }
            setCycleFormOpen(false);
            await load();
          }}
        />
      ) : null}

      {gradeFormOpen ? (
        <GradeFormModal
          grade={editingGrade}
          onClose={() => setGradeFormOpen(false)}
          onSave={async (input) => {
            if (editingGrade) {
              await updateGrade(request, editingGrade.id, input);
            } else {
              await createGrade(request, {
                code: input.code!,
                name: input.name!,
                level: input.level!,
                displayOrder: input.displayOrder!,
                minAge: input.minAge,
                maxAge: input.maxAge,
                active: input.active,
              });
            }
            setGradeFormOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function CycleFormModal({
  cycle,
  onClose,
  onSave,
}: {
  cycle: AcademicCycle | null;
  onClose: () => void;
  onSave: (input: Partial<{
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    status: AcademicCycleStatus;
  }>) => Promise<void>;
}) {
  const year = new Date().getFullYear();
  const [name, setName] = useState(cycle?.name ?? `Ciclo ${year}`);
  const [cycleYear, setCycleYear] = useState(String(cycle?.year ?? year));
  const [startDate, setStartDate] = useState(cycle?.startDate ?? `${year}-01-01`);
  const [endDate, setEndDate] = useState(cycle?.endDate ?? `${year}-10-31`);
  const [status, setStatus] = useState<AcademicCycleStatus>(cycle?.status ?? 'PLANNED');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name,
        year: Number(cycleYear),
        startDate,
        endDate,
        status,
      });
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'No se pudo guardar el ciclo.');
      setSaving(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="cycle-form-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="cycle-form-title">{cycle ? 'Editar ciclo' : 'Nuevo ciclo escolar'}</h2>
            <p>Defina el periodo académico con fechas y estado.</p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <p className={modalStyles.error}>{error}</p> : null}
          <div className={modalStyles.grid}>
            <label className={`label ${modalStyles.full}`}>
              Nombre
              <input className="field fieldWide" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="label">
              Año
              <input
                className="field"
                type="number"
                value={cycleYear}
                onChange={(e) => setCycleYear(e.target.value)}
                required
              />
            </label>
            <label className="label">
              Estado
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as AcademicCycleStatus)}>
                {Object.entries(cycleStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Fecha de inicio
              <input className="field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label className="label">
              Fecha de fin
              <input className="field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GradeFormModal({
  grade,
  onClose,
  onSave,
}: {
  grade: Grade | null;
  onClose: () => void;
  onSave: (input: Partial<{
    code: string;
    name: string;
    level: GradeLevel;
    displayOrder: number;
    minAge: number | null;
    maxAge: number | null;
    active: boolean;
  }>) => Promise<void>;
}) {
  const [code, setCode] = useState(grade?.code ?? '');
  const [name, setName] = useState(grade?.name ?? '');
  const [level, setLevel] = useState<GradeLevel>(grade?.level ?? 'PRE_PRIMARY');
  const [displayOrder, setDisplayOrder] = useState(String(grade?.displayOrder ?? 1));
  const [minAge, setMinAge] = useState(grade?.minAge != null ? String(grade.minAge) : '');
  const [maxAge, setMaxAge] = useState(grade?.maxAge != null ? String(grade.maxAge) : '');
  const [active, setActive] = useState(grade?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        code,
        name,
        level,
        displayOrder: Number(displayOrder),
        minAge: minAge === '' ? null : Number(minAge),
        maxAge: maxAge === '' ? null : Number(maxAge),
        active,
      });
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'No se pudo guardar el grado.');
      setSaving(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="grade-form-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="grade-form-title">{grade ? 'Editar grado' : 'Nuevo grado'}</h2>
            <p>Los grados se reutilizan en cada ciclo escolar.</p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <p className={modalStyles.error}>{error}</p> : null}
          <div className={modalStyles.grid}>
            <label className="label">
              Código
              <input className="field" value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <label className="label">
              Orden
              <input
                className="field"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                required
              />
            </label>
            <label className={`label ${modalStyles.full}`}>
              Nombre
              <input className="field fieldWide" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="label">
              Nivel
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value as GradeLevel)}>
                {Object.entries(gradeLevelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Activo
              <select
                className="select"
                value={active ? 'true' : 'false'}
                onChange={(e) => setActive(e.target.value === 'true')}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="label">
              Edad mínima
              <input className="field" type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
            </label>
            <label className="label">
              Edad máxima
              <input className="field" type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
            </label>
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
