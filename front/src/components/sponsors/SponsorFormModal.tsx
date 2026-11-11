import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  createSponsor,
  findSponsorMatches,
  updateSponsor,
  type SponsorDetail,
  type SponsorInput,
  type SponsorMatch,
  type SponsorType,
} from '../../api/sponsors.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { formatDate, parseDate } from '../../lib/dates.ts';
import { sponsorMatchReasonLabels, sponsorshipStatusLabels } from '../../lib/labels.ts';
import { DateInput } from '../ui/DateInput.tsx';
import modalStyles from '../school/FormModal.module.css';
import styles from './Sponsors.module.css';

/**
 * Registro y edición de padrinos (MA-33). Mientras se escribe el nombre, el correo o el teléfono,
 * el formulario busca padrinos parecidos para no duplicar a quien ya apoya a otro alumno.
 */

type Draft = {
  type: SponsorType;
  givenNames: string;
  firstSurname: string;
  secondSurname: string;
  organizationName: string;
  email: string;
  phone: string;
  birthday: string;
  notes: string;
};

const matchDelayMs = 400;

function toDraft(sponsor?: SponsorDetail | null): Draft {
  return {
    type: sponsor?.type ?? 'INDIVIDUAL',
    givenNames: sponsor?.givenNames ?? '',
    firstSurname: sponsor?.firstSurname ?? '',
    secondSurname: sponsor?.secondSurname ?? '',
    organizationName: sponsor?.organizationName ?? '',
    email: sponsor?.email ?? '',
    phone: sponsor?.phone ?? '',
    birthday: formatDate(sponsor?.birthday),
    notes: sponsor?.notes ?? '',
  };
}

const orNull = (value: string) => value.trim() || null;

function toInput(draft: Draft): SponsorInput {
  return {
    type: draft.type,
    givenNames: orNull(draft.givenNames),
    firstSurname: orNull(draft.firstSurname),
    secondSurname: orNull(draft.secondSurname),
    organizationName: draft.type === 'ORGANIZATION' ? orNull(draft.organizationName) : null,
    email: orNull(draft.email),
    phone: orNull(draft.phone),
    birthday: draft.birthday.trim() ? parseDate(draft.birthday.trim()) : null,
    notes: orNull(draft.notes),
  };
}

function matchQuery(draft: Draft, excludeId?: string) {
  const name = draft.type === 'ORGANIZATION'
    ? draft.organizationName
    : [draft.givenNames, draft.firstSurname, draft.secondSurname].join(' ');
  const query = {
    name: name.replace(/\s+/g, ' ').trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    excludeId,
  };
  const searchable = query.name.length >= 2 || query.email.includes('@') || query.phone.replace(/\D/g, '').length >= 7;
  return searchable ? query : null;
}

type Props = {
  /** Padrino a editar; sin él, el formulario registra uno nuevo. */
  sponsor?: SponsorDetail | null;
  onClose: () => void;
  onSaved: (sponsor: SponsorDetail) => void;
  /** Acción sobre una coincidencia: ver su detalle o usarla (por ejemplo, al asignar un padrino). */
  onUseExisting?: (match: SponsorMatch) => void;
  useExistingLabel?: string;
};

export function SponsorFormModal({ sponsor, onClose, onSaved, onUseExisting, useExistingLabel = 'Ver padrino' }: Props) {
  const { request } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => toDraft(sponsor));
  const [matches, setMatches] = useState<SponsorMatch[]>([]);
  const [reviewedMatches, setReviewedMatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(sponsor);
  const query = matchQuery(draft, sponsor?.id);
  const queryKey = JSON.stringify(query);
  // Sin datos suficientes para buscar no se muestran sugerencias (aunque haya una respuesta anterior).
  const shownMatches = query ? matches : [];

  useEffect(() => {
    const parsed = JSON.parse(queryKey) as ReturnType<typeof matchQuery>;
    if (!parsed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      findSponsorMatches(request, parsed, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setMatches(result.data);
        })
        .catch(() => {
          // Las sugerencias son una ayuda: si fallan, el registro sigue disponible.
        });
    }, matchDelayMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [queryKey, request]);

  const set = (field: keyof Draft) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setReviewedMatches(false);
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (draft.birthday.trim() && !parseDate(draft.birthday.trim())) {
      setError('Ingrese la fecha de cumpleaños como dd/mm/aaaa.');
      return;
    }
    setSaving(true);
    try {
      if (!editing && !reviewedMatches && shownMatches.length === 0) {
        // Si las coincidencias ya están a la vista, el botón «Crear de todas formas» confirma.
        // Si no, se verifica justo antes de crear, por si la sugerencia aún no había llegado.
        const latest = query ? (await findSponsorMatches(request, query)).data : [];
        if (latest.length > 0) {
          setMatches(latest);
          setReviewedMatches(true);
          setError('Encontramos padrinos parecidos. Revíselos; si es otra persona, presione «Crear de todas formas».');
          return;
        }
      }
      const input = toInput(draft);
      const saved = editing ? await updateSponsor(request, sponsor!.id, input) : await createSponsor(request, input);
      onSaved(saved.data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el padrino.');
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = saving
    ? 'Guardando…'
    : editing
      ? 'Guardar cambios'
      : shownMatches.length > 0
        ? 'Crear de todas formas'
        : 'Registrar padrino';

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="sponsor-form-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="sponsor-form-title">{editing ? 'Editar padrino' : 'Nuevo padrino'}</h2>
            <p>Un padrino puede registrarse aunque todavía no apoye a ningún alumno.</p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <fieldset className={styles.typeSwitch} disabled={saving} aria-label="Tipo de padrino">
            {(['INDIVIDUAL', 'ORGANIZATION'] as const).map((type) => (
              <label key={type} className={styles.check}>
                <input type="radio" name="sponsor-type" checked={draft.type === type} onChange={() => set('type')(type)} />
                {type === 'INDIVIDUAL' ? 'Persona' : 'Organización o empresa'}
              </label>
            ))}
          </fieldset>

          <div className={modalStyles.grid}>
            {draft.type === 'ORGANIZATION' ? (
              <label className={`label ${modalStyles.full}`}>
                Nombre de la organización
                <input className="field fieldWide" value={draft.organizationName} maxLength={200} required
                  onChange={(event) => set('organizationName')(event.target.value)} />
              </label>
            ) : null}
            <label className="label">
              {draft.type === 'ORGANIZATION' ? 'Nombres del contacto' : 'Nombres'}
              <input className="field fieldWide" value={draft.givenNames} maxLength={120} required={draft.type === 'INDIVIDUAL'}
                onChange={(event) => set('givenNames')(event.target.value)} />
            </label>
            <label className="label">
              Primer apellido
              <input className="field fieldWide" value={draft.firstSurname} maxLength={80} required={draft.type === 'INDIVIDUAL'}
                onChange={(event) => set('firstSurname')(event.target.value)} />
            </label>
            <label className="label">
              Segundo apellido
              <input className="field fieldWide" value={draft.secondSurname} maxLength={80}
                onChange={(event) => set('secondSurname')(event.target.value)} />
            </label>
            <label className="label">
              Cumpleaños
              <DateInput className="field fieldWide" value={draft.birthday} onChange={set('birthday')} />
            </label>
            <label className="label">
              Correo electrónico
              <input className="field fieldWide" type="email" value={draft.email} maxLength={254}
                onChange={(event) => set('email')(event.target.value)} />
            </label>
            <label className="label">
              Teléfono
              <input className="field fieldWide" type="tel" value={draft.phone} maxLength={30}
                onChange={(event) => set('phone')(event.target.value)} />
            </label>
            <label className={`label ${modalStyles.full}`}>
              Notas
              <textarea className="field fieldWide" rows={2} value={draft.notes} maxLength={2000}
                onChange={(event) => set('notes')(event.target.value)} />
            </label>
          </div>

          {shownMatches.length > 0 ? (
            <section className={styles.matches} aria-label="Posibles coincidencias" aria-live="polite">
              <h3>¿Ya está registrado? Posibles coincidencias</h3>
              <ul className={styles.matchList}>
                {shownMatches.map((match) => (
                  <li key={match.id} className={styles.matchItem}>
                    <div>
                      <strong>{match.fullName}</strong>
                      {match.active ? null : <span className={styles.muted}> · Inactivo</span>}
                      <div className={styles.muted}>
                        Coincide por {match.reasons.map((reason) => sponsorMatchReasonLabels[reason]).join(' y ')}
                        {[match.email, match.phone].filter(Boolean).length ? ` · ${[match.email, match.phone].filter(Boolean).join(' · ')}` : ''}
                      </div>
                      <div className={styles.muted}>
                        {match.openSponsorships.length
                          ? `Apoya a: ${match.openSponsorships.map((s) => `${s.student.fullName} (${sponsorshipStatusLabels[s.status]})`).join(', ')}`
                          : 'Sin padrinazgos vigentes'}
                      </div>
                    </div>
                    {onUseExisting ? (
                      <button type="button" className="btn" onClick={() => onUseExisting(match)}>
                        {useExistingLabel}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {error ? <p className={modalStyles.error} role="alert">{error}</p> : null}

          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
