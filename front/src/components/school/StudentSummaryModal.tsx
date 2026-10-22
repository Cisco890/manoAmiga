import { useEffect, useRef, useState, type FormEvent } from 'react';
import { UserRound, X } from 'lucide-react';
import { getStudentSummary, saveStudentPickups, type AuthorizedPickup, type DocumentSummary, type StudentSummary } from '../../api/school.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { formatDate } from '../../lib/dates.ts';
import { enrollmentStatusLabels, studentStatusLabels } from '../../lib/labels.ts';
import modal from './FormModal.module.css';
import shared from '../../pages/schoolShared.module.css';
import styles from './StudentSummaryModal.module.css';

const documentLabels = { ENROLLMENT_FORM: 'Ficha de inscripción', STUDENT_ID_CARD: 'Carné', SPONSOR_AUTHORIZATION: 'Autorización de padrinazgo' };
const documentStatusLabels = { MISSING: 'Pendiente de generar', GENERATED: 'Generado', SIGNED: 'Firmado', PRINTED: 'Impreso', VOID: 'Anulado' };
const relationshipLabels: Record<string, string> = {
  MOTHER: 'Madre', FATHER: 'Padre', TUTOR: 'Tutor', GRANDPARENT: 'Abuelo/a', SIBLING: 'Hermano/a', OTHER: 'Otro', ENROLLMENT_CONTACT: 'Contacto de inscripción',
};
const fullName = (person: AuthorizedPickup) => [person.givenNames, person.firstSurname, person.secondSurname].filter(Boolean).join(' ');

function Documents({ documents }: { documents: DocumentSummary[] }) {
  return <ul className={styles.list}>{documents.map((doc) => <li key={doc.type}>
    <span>{documentLabels[doc.type]}</span> <span className={shared.badge}>{documentStatusLabels[doc.status]}</span>
  </li>)}</ul>;
}

function Photo({ studentId, photoId, name }: { studentId: string; photoId: string | null; name: string }) {
  const { request } = useAuth();
  const [url, setUrl] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!photoId) return;
    const controller = new AbortController();
    let objectUrl = '';
    request(`/students/${studentId}/photo`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Fotografía no disponible');
      const blob = await response.blob();
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [request, studentId, photoId]);
  return <div className={styles.photo}>
    {url && !unavailable ? <img src={url} alt={`Fotografía de ${name}`} onError={() => setUnavailable(true)} />
      : <><UserRound size={48} aria-hidden="true" /><span>{!photoId ? 'Sin fotografía' : unavailable ? 'Fotografía no disponible' : 'Cargando fotografía…'}</span></>}
  </div>;
}

export function StudentSummaryModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { request, can } = useAuth();
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pickups, setPickups] = useState<AuthorizedPickup[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => { mounted.current = false; previous?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getStudentSummary(request, studentId, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setSummary(data);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo cargar la ficha.');
    });
    return () => controller.abort();
  }, [request, studentId, retry]);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setSaveError(''); setNotice('');
    try {
      const { data } = await saveStudentPickups(request, studentId, pickups);
      if (!mounted.current) return;
      setSummary((current) => current ? { ...current, authorizedPickups: data } : current);
      setEditing(false); setNotice('Personas autorizadas actualizadas.');
    } catch (err) {
      if (mounted.current) setSaveError(err instanceof Error ? err.message : 'No se pudieron guardar las personas autorizadas.');
    } finally { if (mounted.current) setSaving(false); }
  }

  return <div className={modal.overlay}>
    <button type="button" className={modal.backdrop} aria-label="Cerrar ficha" onClick={onClose} />
    <div className={`${modal.modal} ${styles.modal}`} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="student-summary-title" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className={modal.header}>
        <div><h2 id="student-summary-title">Ficha resumida del alumno</h2><p>{summary ? `${summary.student.fullName} · ${summary.student.studentCode}` : 'Expediente estudiantil'}</p></div>
        <button ref={closeButton} type="button" className={modal.close} onClick={onClose} aria-label="Cerrar ficha del alumno"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className={styles.content}>
        {error ? <div className={modal.error} role="alert">{error} <button className="btn" type="button" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></div>
          : !summary ? <p role="status">Cargando ficha…</p> : <>
            <div className={styles.overview}>
              <section aria-label="Fotografía"><Photo key={summary.photo?.id ?? 'no-photo'} studentId={studentId} photoId={summary.photo?.id ?? null} name={summary.student.fullName} /></section>
              <section className={styles.section} aria-label="Datos del alumno">
                <h3>{summary.student.fullName}</h3>
                <dl className={styles.facts}>
                  <div><dt>Código</dt><dd>{summary.student.studentCode}</dd></div>
                  <div><dt>CUI</dt><dd>{summary.student.cuiMasked ?? 'Sin registrar'}</dd></div>
                  <div><dt>Fecha de nacimiento</dt><dd>{formatDate(summary.student.birthDate) || 'Sin registrar'}</dd></div>
                  <div><dt>Grado actual</dt><dd>{summary.currentEnrollment?.grade.name ?? 'Sin inscripción actual'}</dd></div>
                  <div><dt>Ciclo escolar</dt><dd>{summary.currentEnrollment?.academicCycle.name ?? 'Sin inscripción actual'}</dd></div>
                  <div><dt>Estado del alumno</dt><dd>{studentStatusLabels[summary.student.status]}</dd></div>
                  {summary.currentEnrollment ? <div><dt>Estado de inscripción</dt><dd>{enrollmentStatusLabels[summary.currentEnrollment.status]}</dd></div> : null}
                </dl>
              </section>
            </div>
            <div className={styles.grid}>
              <section className={styles.section} aria-labelledby="student-responsible-title">
                <h3 id="student-responsible-title">Responsable</h3>
                {summary.responsible ? <p>{summary.responsible.fullName}<br /><span className={styles.muted}>{summary.responsible.customRelationship || relationshipLabels[summary.responsible.relationship] || summary.responsible.relationship}{summary.responsible.phone ? ` · ${summary.responsible.phone}` : ''}</span></p> : <p className={styles.muted}>Sin responsable registrado.</p>}
                {summary.guardians.length > 1 ? <details><summary>Otros responsables</summary><ul className={styles.list}>{summary.guardians.slice(1).map((guardian) => <li key={guardian.id}>{guardian.fullName} · {guardian.customRelationship || relationshipLabels[guardian.relationship] || guardian.relationship}</li>)}</ul></details> : null}
              </section>
              <section className={styles.section} aria-labelledby="student-sponsors-title">
                <h3 id="student-sponsors-title">Padrino</h3>
                {summary.sponsors.length ? <ul className={styles.list}>{summary.sponsors.map((sponsor) => <li key={sponsor.sponsorshipId}>{sponsor.fullName}<br /><span className={styles.muted}>Desde {formatDate(sponsor.startDate)}</span></li>)}</ul> : <p className={styles.muted}>Sin padrino activo.</p>}
              </section>
              <section className={styles.section} aria-labelledby="student-documents-title">
                <h3 id="student-documents-title">Estado de documentos</h3>
                <Documents documents={summary.documents} />
              </section>
              <section className={styles.section} aria-labelledby="student-pickups-title">
                <h3 id="student-pickups-title">Personas autorizadas para recoger al alumno</h3>
                <p className={styles.muted}>Lista independiente de los responsables del alumno.</p>
                {notice ? <p role="status">{notice}</p> : null}
                {!editing ? <>
                  {summary.authorizedPickups.length ? <ul className={styles.list}>{summary.authorizedPickups.map((person, i) => <li key={i}><strong>{fullName(person)}</strong><br />{person.relationship}{person.phone ? ` · ${person.phone}` : ''}</li>)}</ul> : <p className={styles.muted}>Sin personas autorizadas registradas.</p>}
                  {can('student.write') ? <button type="button" className="btn" onClick={() => { setPickups(summary.authorizedPickups.map((person) => ({ ...person }))); setEditing(true); setSaveError(''); setNotice(''); }}>Editar personas autorizadas</button> : null}
                </> : <form onSubmit={(event) => void save(event)}>
                  {saveError ? <p className={modal.error} role="alert">{saveError}</p> : null}
                  <fieldset className={styles.fieldset} disabled={saving}>
                    <legend className="srOnly">Editar personas autorizadas</legend>
                    {pickups.map((person, index) => <div key={index} className={styles.pickup}>
                      <h4>Persona {index + 1}</h4>
                      {(['givenNames', 'firstSurname', 'secondSurname', 'relationship', 'phone'] as const).map((field) => <label key={field} className="label">
                        {{ givenNames: 'Nombres', firstSurname: 'Primer apellido', secondSurname: 'Segundo apellido', relationship: 'Parentesco', phone: 'Teléfono' }[field]} (persona {index + 1})
                        <input className="field fieldWide" type={field === 'phone' ? 'tel' : 'text'} value={person[field] ?? ''}
                          required={['givenNames', 'firstSurname', 'relationship'].includes(field)} maxLength={field === 'givenNames' ? 120 : field === 'phone' ? 30 : 80}
                          onChange={(event) => setPickups((list) => list.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} />
                      </label>)}
                      <button type="button" className="btn" aria-label={`Quitar persona ${index + 1}`} onClick={() => setPickups((list) => list.filter((_, i) => i !== index))}>Quitar persona</button>
                    </div>)}
                    {pickups.length < summary.maxAuthorizedPickups ? <button type="button" className="btn" onClick={() => setPickups((list) => [...list, { givenNames: '', firstSurname: '', secondSurname: null, relationship: '', phone: null }])}>Agregar persona autorizada</button> : null}
                    <div className={modal.actions}>
                      <button className="btn" type="button" onClick={() => setEditing(false)}>Cancelar</button>
                      <button className="btn btnPrimary" type="submit">{saving ? 'Guardando…' : 'Guardar autorizados'}</button>
                    </div>
                  </fieldset>
                </form>}
              </section>
            </div>
            <section className={styles.section} aria-labelledby="student-history-title">
              <h3 id="student-history-title">Historial por ciclo escolar</h3>
              {!summary.history.length ? <p className={styles.muted}>Sin inscripciones registradas.</p> : <div className={shared.tableWrap}>
                <table className={shared.table}>
                  <thead><tr><th>Ciclo</th><th>Grado</th><th>Estado</th><th>Solicitud</th><th>Detalle histórico</th></tr></thead>
                  <tbody>{summary.history.map((entry) => <tr key={entry.id}>
                    <td>{entry.academicCycle.name}{entry.isCurrent ? <span className={shared.badge}>Actual</span> : null}</td>
                    <td>{entry.grade.name}</td><td>{enrollmentStatusLabels[entry.status]}</td><td>{formatDate(entry.requestDate)}</td>
                    <td><details><summary>Ver detalle de inscripción</summary><Documents documents={entry.documents} />
                      <p>Personas autorizadas en esta inscripción:</p>
                      {entry.authorizedPickups.length ? <ul className={styles.list}>{entry.authorizedPickups.map((person, i) => <li key={i}>{fullName(person)} · {person.relationship}</li>)}</ul> : <p>Sin registros.</p>}
                    </details></td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </section>
          </>}
      </div>
    </div>
  </div>;
}
