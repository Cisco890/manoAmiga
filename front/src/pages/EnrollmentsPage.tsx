import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  createEnrollment,
  listCycles,
  listEnrollments,
  listGrades,
  listStudents,
  transitionEnrollmentStatus,
  type AcademicCycle,
  type ApplicationType,
  type Enrollment,
  type EnrollmentStatus,
  type Grade,
  type Student,
} from '../api/school.ts';
import { ApiError } from '../auth/api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { getRouteByPath } from '../config/navigation.ts';
import {
  applicationTypeLabels,
  enrollmentActionLabels,
  enrollmentReviewStatuses,
  enrollmentStatusLabels,
} from '../lib/labels.ts';
import { ReviewDecisionModal, type ReviewDecision } from '../components/school/ReviewDecisionModal.tsx';
import modalStyles from '../components/school/FormModal.module.css';
import styles from './schoolShared.module.css';
import pageStyles from './pageLayout.module.css';

const route = getRouteByPath('/inscripciones');
const pageSize = 10;

function statusBadge(status: EnrollmentStatus) {
  if (status === 'APPROVED') return `${styles.badge} ${styles.badgeActive}`;
  if (status === 'PENDING_REVIEW' || status === 'INCOMPLETE') return `${styles.badge} ${styles.badgeWarn}`;
  if (status === 'CLOSED' || status === 'CANCELLED' || status === 'REJECTED') {
    return `${styles.badge} ${styles.badgeMuted}`;
  }
  return styles.badge;
}

export function EnrollmentsPage() {
  const { can, request } = useAuth();
  const canWrite = can('enrollment.write');
  const canApprove = can('enrollment.approve');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [cycles, setCycles] = useState<AcademicCycle[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [cycleId, setCycleId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ enrollment: Enrollment; status: ReviewDecision } | null>(null);
  const showActions = canWrite || canApprove;

  // Aprobar, devolver o rechazar son decisiones de dirección; el resto, de secretaría.
  const canMoveTo = (next: EnrollmentStatus) =>
    enrollmentReviewStatuses.includes(next) ? canApprove : canWrite;

  const filters = useMemo(
    () => ({
      page,
      limit: pageSize,
      academicCycleId: cycleId || undefined,
      gradeId: gradeId || undefined,
      status,
    }),
    [cycleId, gradeId, page, status],
  );

  const loadCatalog = useCallback(async () => {
    const [cycleResult, gradeResult] = await Promise.all([
      listCycles(request),
      listGrades(request, true),
    ]);
    setCycles(cycleResult.data);
    setGrades(gradeResult.data);
  }, [request]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listEnrollments(request, filters);
      setEnrollments(result.data);
      setTotal(result.pagination.total);
      setPages(result.pagination.pages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las inscripciones.');
    } finally {
      setLoading(false);
    }
  }, [filters, request]);

  useEffect(() => {
    void loadCatalog().catch((catalogError: unknown) => {
      setError(catalogError instanceof Error ? catalogError.message : 'No se pudo cargar catálogos.');
    });
  }, [loadCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(enrollment: Enrollment, next: EnrollmentStatus) {
    if (!canMoveTo(next)) {
      setError('No tienes permiso para realizar esta acción.');
      return;
    }
    if (next === 'INCOMPLETE' || next === 'REJECTED') {
      setDecision({ enrollment, status: next });
      return;
    }
    setBusyId(enrollment.id);
    setError('');
    try {
      await transitionEnrollmentStatus(request, enrollment.id, next);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={pageStyles.stack}>
      <PageHeader
        title={route?.label ?? 'Inscripciones'}
        description="Flujo: Borrador → Pendiente de revisión → Incompleta/Aprobada → Cerrada. Un cambio de grado crea una inscripción nueva."
        actions={
          canWrite ? (
            <button type="button" className="btn btnPrimary" onClick={() => setFormOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Nueva inscripción
            </button>
          ) : undefined
        }
      />

      <section className={styles.panel}>
        <div className={styles.filters}>
          <label className="label">
            Ciclo
            <select
              className="select"
              value={cycleId}
              onChange={(e) => {
                setPage(1);
                setCycleId(e.target.value);
              }}
            >
              <option value="">Todos los ciclos</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Grado
            <select
              className="select"
              value={gradeId}
              onChange={(e) => {
                setPage(1);
                setGradeId(e.target.value);
              }}
            >
              <option value="">Todos los grados</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Estado
            <select
              className="select"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as EnrollmentStatus | '');
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(enrollmentStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {canApprove ? (
            <button
              type="button"
              className={`btn ${styles.btnSm}`}
              aria-pressed={status === 'PENDING_REVIEW'}
              onClick={() => {
                setPage(1);
                setStatus((current) => (current === 'PENDING_REVIEW' ? '' : 'PENDING_REVIEW'));
              }}
            >
              {status === 'PENDING_REVIEW' ? 'Ver todas' : 'Pendientes de revisión'}
            </button>
          ) : null}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {loading ? (
          <p className={styles.empty}>Cargando inscripciones…</p>
        ) : enrollments.length === 0 ? (
          <p className={styles.empty}>No hay inscripciones con estos filtros.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Ciclo</th>
                  <th>Grado</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  {showActions ? <th>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>
                      <div>{enrollment.student.fullName}</div>
                      <small style={{ color: 'var(--color-text-muted)' }}>
                        {enrollment.student.studentCode}
                      </small>
                    </td>
                    <td>{enrollment.academicCycle.name}</td>
                    <td>{enrollment.grade.name}</td>
                    <td>{applicationTypeLabels[enrollment.applicationType]}</td>
                    <td>
                      <span className={statusBadge(enrollment.status)}>
                        {enrollmentStatusLabels[enrollment.status]}
                      </span>
                      {enrollment.rejectionReason &&
                      (enrollment.status === 'INCOMPLETE' || enrollment.status === 'REJECTED') ? (
                        <small className={styles.reviewNote}>Motivo: {enrollment.rejectionReason}</small>
                      ) : null}
                      {enrollment.canGenerateDocuments ? (
                        <small className={styles.reviewNote}>Ficha y carné habilitados</small>
                      ) : null}
                    </td>
                    <td>{enrollment.requestDate}</td>
                    {showActions ? (
                      <td>
                        <div className={styles.rowActions}>
                          {enrollment.allowedNextStatuses
                            .filter(canMoveTo)
                            .map((next) => (
                              <button
                                key={next}
                                type="button"
                                className={`btn ${styles.btnSm}`}
                                disabled={busyId === enrollment.id}
                                onClick={() => void changeStatus(enrollment, next)}
                              >
                                {enrollmentActionLabels[next]}
                              </button>
                            ))}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.pagination}>
          <span>
            {total} inscripción{total === 1 ? '' : 'es'} · página {page} de {pages}
          </span>
          <div className={styles.rowActions}>
            <button
              type="button"
              className={`btn ${styles.btnSm}`}
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className={`btn ${styles.btnSm}`}
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {decision ? (
        <ReviewDecisionModal
          enrollment={decision.enrollment}
          decision={decision.status}
          onClose={() => setDecision(null)}
          onConfirm={async (reason) => {
            await transitionEnrollmentStatus(request, decision.enrollment.id, decision.status, {
              rejectionReason: reason,
            });
            setDecision(null);
            await load();
          }}
        />
      ) : null}

      {formOpen ? (
        <EnrollmentFormModal
          cycles={cycles}
          grades={grades}
          onClose={() => setFormOpen(false)}
          onSave={async (input) => {
            await createEnrollment(request, input);
            setFormOpen(false);
            await load();
          }}
          request={request}
        />
      ) : null}
    </div>
  );
}

function EnrollmentFormModal({
  cycles,
  grades,
  onClose,
  onSave,
  request,
}: {
  cycles: AcademicCycle[];
  grades: Grade[];
  onClose: () => void;
  onSave: (input: {
    studentId: string;
    academicCycleId: string;
    gradeId: string;
    applicationType: ApplicationType;
    notes?: string | null;
  }) => Promise<void>;
  request: ReturnType<typeof useAuth>['request'];
}) {
  const activeCycle = cycles.find((cycle) => cycle.status === 'ACTIVE') ?? cycles[0];
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [academicCycleId, setAcademicCycleId] = useState(activeCycle?.id ?? '');
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? '');
  const [applicationType, setApplicationType] = useState<ApplicationType>('NEW_ENROLLMENT');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    setSearching(true);
    void listStudents(request, { page: 1, limit: 20, q: studentQuery || undefined, status: 'ACTIVE' })
      .then((result) => {
        if (!active) return;
        setStudents(result.data);
        setStudentId((current) => {
          if (current && result.data.some((student) => student.id === current)) return current;
          return result.data[0]?.id ?? '';
        });
      })
      .catch((searchError: unknown) => {
        if (active) {
          setError(searchError instanceof Error ? searchError.message : 'No se pudieron buscar alumnos.');
        }
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [request, studentQuery]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        studentId,
        academicCycleId,
        gradeId,
        applicationType,
        notes: notes || null,
      });
    } catch (saveError) {
      setError(
        saveError instanceof ApiError ? saveError.message : 'No se pudo crear la inscripción.',
      );
      setSaving(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="enrollment-form-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="enrollment-form-title">Nueva inscripción</h2>
            <p>
              Seleccione alumno, ciclo y grado. Si el alumno ya tiene inscripción abierta en otro grado del
              mismo ciclo, la anterior se cierra y se conserva el histórico.
            </p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <p className={modalStyles.error}>{error}</p> : null}
          <div className={modalStyles.grid}>
            <label className={`label ${modalStyles.full}`}>
              Buscar alumno
              <input
                className="field fieldWide"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Nombre o código"
              />
            </label>
            <label className={`label ${modalStyles.full}`}>
              Alumno {searching ? '(buscando…)' : ''}
              <select
                className="select"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                style={{ width: '100%', minWidth: 0 }}
              >
                {students.length === 0 ? <option value="">Sin resultados</option> : null}
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.studentCode} · {student.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Ciclo escolar
              <select
                className="select"
                value={academicCycleId}
                onChange={(e) => setAcademicCycleId(e.target.value)}
                required
              >
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name} ({cycle.status === 'ACTIVE' ? 'activo' : cycle.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Grado
              <select className="select" value={gradeId} onChange={(e) => setGradeId(e.target.value)} required>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`label ${modalStyles.full}`}>
              Tipo de inscripción
              <select
                className="select"
                value={applicationType}
                onChange={(e) => setApplicationType(e.target.value as ApplicationType)}
              >
                {Object.entries(applicationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`label ${modalStyles.full}`}>
              Notas
              <input className="field fieldWide" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving || !studentId}>
              {saving ? 'Guardando…' : 'Crear inscripción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
