import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, X } from 'lucide-react';
import {
  createStudent,
  listStudents,
  updateStudent,
  type Sex,
  type Student,
  type StudentStatus,
} from '../api/school.ts';
import { ApiError } from '../auth/api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { getRouteByPath } from '../config/navigation.ts';
import { sexLabels, studentStatusLabels } from '../lib/labels.ts';
import modalStyles from '../components/school/FormModal.module.css';
import styles from './schoolShared.module.css';
import pageStyles from './pageLayout.module.css';

const route = getRouteByPath('/alumnos');
const pageSize = 10;

export function StudentsPage() {
  const { can, request } = useAuth();
  const canWrite = can('student.write');
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StudentStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  const filters = useMemo(
    () => ({ page, limit: pageSize, q: search, status }),
    [page, search, status],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listStudents(request, filters);
      setStudents(result.data);
      setTotal(result.pagination.total);
      setPages(result.pagination.pages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los alumnos.');
    } finally {
      setLoading(false);
    }
  }, [filters, request]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={pageStyles.stack}>
      <PageHeader
        title={route?.label ?? 'Alumnos'}
        description="El alumno se registra una sola vez y se reutiliza en cada ciclo escolar."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Nuevo alumno
            </button>
          ) : undefined
        }
      />

      <section className={styles.panel}>
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchDraft.trim());
          }}
        >
          <label className="label">
            Buscar alumno
            <span className={styles.filters} style={{ padding: 0, border: 0, background: 'transparent' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Search size={16} aria-hidden="true" />
                <input
                  className="field fieldWide"
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Nombre o código"
                />
              </span>
            </span>
          </label>
          <label className="label">
            Estado
            <select
              className="select"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as StudentStatus | '');
              }}
            >
              <option value="">Todos</option>
              {Object.entries(studentStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Buscar
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}

        {loading ? (
          <p className={styles.empty}>Cargando alumnos…</p>
        ) : students.length === 0 ? (
          <p className={styles.empty}>No hay alumnos registrados.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Alumno</th>
                  <th>CUI</th>
                  <th>Grado actual</th>
                  <th>Estado</th>
                  {canWrite ? <th>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.studentCode}</td>
                    <td>{student.fullName}</td>
                    <td>{student.cuiMasked ?? '—'}</td>
                    <td>
                      {student.currentGrade
                        ? `${student.currentGrade.name} (${student.currentGrade.cycleName})`
                        : '—'}
                    </td>
                    <td>
                      <span className={styles.badge}>{studentStatusLabels[student.status]}</span>
                    </td>
                    {canWrite ? (
                      <td>
                        <button
                          type="button"
                          className={`btn ${styles.btnSm}`}
                          onClick={() => {
                            setEditing(student);
                            setFormOpen(true);
                          }}
                        >
                          Editar
                        </button>
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
            {total} alumno{total === 1 ? '' : 's'} · página {page} de {pages}
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

      {formOpen ? (
        <StudentFormModal
          student={editing}
          onClose={() => setFormOpen(false)}
          onSave={async (input) => {
            if (editing) {
              await updateStudent(request, editing.id, input);
            } else {
              await createStudent(request, input);
            }
            setFormOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function StudentFormModal({
  student,
  onClose,
  onSave,
}: {
  student: Student | null;
  onClose: () => void;
  onSave: (input: {
    givenNames: string;
    firstSurname: string;
    secondSurname?: string | null;
    usualName?: string | null;
    birthPlace?: string | null;
    birthDate?: string | null;
    cui?: string | null;
    homePhone?: string | null;
    sex?: Sex;
    status?: StudentStatus;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [givenNames, setGivenNames] = useState(student?.givenNames ?? '');
  const [firstSurname, setFirstSurname] = useState(student?.firstSurname ?? '');
  const [secondSurname, setSecondSurname] = useState(student?.secondSurname ?? '');
  const [usualName, setUsualName] = useState(student?.usualName ?? '');
  const [birthPlace, setBirthPlace] = useState(student?.birthPlace ?? '');
  const [birthDate, setBirthDate] = useState(student?.birthDate ?? '');
  const [cui, setCui] = useState('');
  const [clearCui, setClearCui] = useState(false);
  const [homePhone, setHomePhone] = useState(student?.homePhone ?? '');
  const [sex, setSex] = useState<Sex>(student?.sex ?? 'NOT_SPECIFIED');
  const [status, setStatus] = useState<StudentStatus>(student?.status ?? 'ACTIVE');
  const [notes, setNotes] = useState(student?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Parameters<typeof onSave>[0] = {
        givenNames,
        firstSurname,
        secondSurname: secondSurname || null,
        usualName: usualName || null,
        birthPlace: birthPlace || null,
        birthDate: birthDate || null,
        homePhone: homePhone || null,
        sex,
        notes: notes || null,
        ...(student ? { status } : {}),
      };
      if (clearCui) payload.cui = null;
      else if (cui.trim()) payload.cui = cui.trim();
      await onSave(payload);
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'No se pudo guardar el alumno.');
      setSaving(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="student-form-title">{student ? 'Editar alumno' : 'Registrar alumno'}</h2>
            <p>
              {student
                ? `Código ${student.studentCode}. El CUI es único cuando está disponible.`
                : 'Datos básicos para la ficha central del alumno.'}
            </p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)}>
          {error ? <p className={modalStyles.error}>{error}</p> : null}
          <div className={modalStyles.grid}>
            <label className="label">
              Nombres
              <input className="field" value={givenNames} onChange={(e) => setGivenNames(e.target.value)} required />
            </label>
            <label className="label">
              Primer apellido
              <input className="field" value={firstSurname} onChange={(e) => setFirstSurname(e.target.value)} required />
            </label>
            <label className="label">
              Segundo apellido
              <input className="field" value={secondSurname} onChange={(e) => setSecondSurname(e.target.value)} />
            </label>
            <label className="label">
              Nombre usual
              <input className="field" value={usualName} onChange={(e) => setUsualName(e.target.value)} />
            </label>
            <label className="label">
              Fecha de nacimiento
              <input className="field" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
            <label className="label">
              Lugar de nacimiento
              <input className="field" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
            </label>
            <label className="label">
              CUI {student?.hasCui ? `(actual ${student.cuiMasked})` : '(opcional)'}
              <input
                className="field"
                value={cui}
                onChange={(e) => {
                  setClearCui(false);
                  setCui(e.target.value);
                }}
                placeholder={student?.hasCui ? 'Dejar vacío para conservar' : '13 a 20 dígitos'}
                disabled={clearCui}
              />
            </label>
            <label className="label">
              Teléfono
              <input className="field" value={homePhone} onChange={(e) => setHomePhone(e.target.value)} />
            </label>
            <label className="label">
              Sexo
              <select className="select" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                {Object.entries(sexLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {student ? (
              <label className="label">
                Estado
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus)}>
                  {Object.entries(studentStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={`label ${modalStyles.full}`}>
              Notas
              <input className="field fieldWide" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {student?.hasCui ? (
              <label className={modalStyles.full} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={clearCui}
                  onChange={(e) => {
                    setClearCui(e.target.checked);
                    if (e.target.checked) setCui('');
                  }}
                />
                Quitar CUI del expediente
              </label>
            ) : null}
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar alumno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
