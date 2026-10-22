import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listCycles, listGrades, listStudents, type AcademicCycle, type Grade, type Student, type StudentStatus } from '../../api/school.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { studentStatusLabels } from '../../lib/labels.ts';
import { StudentSummaryModal } from './StudentSummaryModal.tsx';
import styles from '../../pages/schoolShared.module.css';

export function StudentSearch({ onEdit, refreshKey = 0 }: { onEdit?: (student: Student) => void; refreshKey?: number }) {
  const { request, can } = useAuth();
  const location = useLocation();
  const initialSearch = typeof location.state?.studentSearch === 'string' ? location.state.studentSearch : '';
  const [draft, setDraft] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch);
  const [gradeId, setGradeId] = useState('');
  const [academicCycleId, setAcademicCycleId] = useState('');
  const [status, setStatus] = useState<StudentStatus | ''>('');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [cycles, setCycles] = useState<AcademicCycle[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [retry, setRetry] = useState(0);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canRead = can('student.read');

  useEffect(() => {
    if (typeof location.state?.studentSearch === 'string') {
      setDraft(location.state.studentSearch); setQuery(location.state.studentSearch); setPage(1);
    }
  }, [location.key, location.state]);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    Promise.all([listGrades(request), listCycles(request)]).then(([gradeResult, cycleResult]) => {
      if (active) { setGrades(gradeResult.data); setCycles(cycleResult.data); setCatalogError(''); }
    }).catch(() => { if (active) setCatalogError('No se pudieron cargar los filtros de grado y ciclo. Puede volver a intentar.'); });
    return () => { active = false; };
  }, [request, canRead, catalogRetry]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listStudents(request, { page, limit: 10, q: query, status, gradeId, academicCycleId }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) { setStudents(result.data); setPagination(result.pagination); }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudieron buscar los alumnos.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, canRead, page, query, status, gradeId, academicCycleId, refreshKey, retry]);

  if (!canRead) return null;
  return (
    <section className={styles.panel} aria-label="Directorio de alumnos">
      <div className={styles.panelHeader}>
        <div><h2>Buscar alumnos</h2><p>Seleccione un resultado para abrir su ficha resumida.</p></div>
      </div>
      <form className={styles.filters} role="search" aria-label="Buscar alumnos" onSubmit={(event) => {
        event.preventDefault(); setPage(1); setQuery(draft.trim()); setRetry((value) => value + 1);
      }}>
        <label className="label">
          Buscar alumno
          <input className="field fieldWide" type="search" value={draft} maxLength={200}
            onChange={(event) => setDraft(event.target.value)} placeholder="Nombre, código, CUI o familiar/padrino" aria-describedby="student-search-help" />
        </label>
        <label className="label">Grado
          <select className="select" value={gradeId} onChange={(event) => { setGradeId(event.target.value); setPage(1); }}>
            <option value="">Todos los grados</option>
            {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}{grade.active ? '' : ' (inactivo)'}</option>)}
          </select>
        </label>
        <label className="label">Ciclo escolar
          <select className="select" value={academicCycleId} onChange={(event) => { setAcademicCycleId(event.target.value); setPage(1); }}>
            <option value="">Todos los ciclos</option>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
        </label>
        <label className="label">Estado
          <select className="select" value={status} onChange={(event) => { setStatus(event.target.value as StudentStatus | ''); setPage(1); }}>
            <option value="">Todos</option>
            {Object.entries(studentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btnPrimary">Buscar</button>
        <p id="student-search-help" className={styles.searchHelp}>Busque por nombre, código, CUI completo, grado, ciclo o nombre del padre, madre, tutor o padrino. Los filtros incluyen inscripciones anteriores.</p>
      </form>
      {catalogError ? <p className={styles.error} role="alert">{catalogError} <button type="button" className="btn" onClick={() => setCatalogRetry((value) => value + 1)}>Reintentar filtros</button></p> : null}
      {error ? <div className={styles.error} role="alert">{error} <button type="button" className="btn" onClick={() => setRetry((value) => value + 1)}>Reintentar búsqueda</button></div>
        : loading ? <p className={styles.empty} role="status">Buscando alumnos…</p>
          : !students.length ? <p className={styles.empty}>No hay alumnos que coincidan con la búsqueda.</p>
            : <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Código</th><th>Primer apellido</th><th>Segundo apellido</th><th>Nombres</th><th>CUI</th><th>Grado actual</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>{students.map((student) => <tr key={student.id}>
                  <td>{student.studentCode}</td><td>{student.firstSurname}</td><td>{student.secondSurname ?? '—'}</td><td>{student.givenNames}</td>
                  <td>{student.cuiMasked ?? '—'}</td>
                  <td>{student.currentGrade ? `${student.currentGrade.name} (${student.currentGrade.cycleName})` : 'Sin inscripción actual'}</td>
                  <td><span className={styles.badge}>{studentStatusLabels[student.status]}</span></td>
                  <td><div className={styles.rowActions}>
                    <button type="button" className={`btn ${styles.btnSm}`} aria-label={`Ver ficha de ${student.fullName}`} onClick={() => setSelectedId(student.id)}>Ver ficha</button>
                    {onEdit ? <button type="button" className={`btn ${styles.btnSm}`} onClick={() => onEdit(student)}>Editar</button> : null}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>}
      <div className={styles.pagination}>
        <span aria-live="polite">{error ? 'Búsqueda no disponible' : `${pagination.total} alumnos · página ${page} de ${pagination.pages}`}</span>
        <div className={styles.rowActions}>
          <button type="button" className={`btn ${styles.btnSm}`} disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
          <button type="button" className={`btn ${styles.btnSm}`} disabled={loading || Boolean(error) || page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
        </div>
      </div>
      {selectedId ? <StudentSummaryModal key={selectedId} studentId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </section>
  );
}
