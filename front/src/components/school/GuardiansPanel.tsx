import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  linkGuardian,
  listStudentGuardians,
  searchGuardians,
  unlinkGuardian,
  updateGuardian,
  updateGuardianLink,
  type GuardianInput,
  type GuardianLink,
  type GuardianLinkFields,
  type GuardianRelationship,
  type GuardianSearchResult,
} from '../../api/guardians.ts';
import type { AuthenticatedRequest } from '../../api/users.ts';
import { guardianRelationshipLabels } from '../../lib/labels.ts';
import styles from './GuardiansPanel.module.css';

/**
 * Padres, madres y tutores del alumno (MA-27). Un responsable se registra una vez y se
 * reutiliza entre hermanos: la búsqueda permite vincular a uno ya registrado.
 */

type Props = {
  studentId: string;
  request: AuthenticatedRequest;
  canWrite: boolean;
  /** Se llama después de cada cambio guardado (por ejemplo, para recalcular faltantes). */
  onChange?: () => void;
};

const relationships = Object.keys(guardianRelationshipLabels) as GuardianRelationship[];
const relationshipText = (link: Pick<GuardianLinkFields, 'relationship' | 'customRelationship'>) =>
  link.customRelationship || guardianRelationshipLabels[link.relationship];

const emptyLinkFields: GuardianLinkFields = {
  relationship: 'MOTHER',
  customRelationship: null,
  livesWithStudent: false,
  primaryContact: false,
  legalRepresentative: false,
};

const personFields: Array<[keyof GuardianInput, string, string?]> = [
  ['givenNames', 'Nombres'],
  ['firstSurname', 'Primer apellido'],
  ['secondSurname', 'Segundo apellido'],
  ['marriedSurname', 'Apellido de casada'],
  ['mobilePhone', 'Celular', 'tel'],
  ['homePhone', 'Teléfono de casa', 'tel'],
  ['primaryEmail', 'Correo electrónico', 'email'],
  ['occupation', 'Ocupación'],
];

export function GuardiansPanel({ studentId, request, canWrite, onChange }: Props) {
  const [links, setLinks] = useState<GuardianLink[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<{ type: 'add' } | { type: 'edit'; link: GuardianLink } | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks((await listStudentGuardians(request, studentId)).data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los responsables.');
    }
  }, [request, studentId]);

  useEffect(() => {
    let active = true;
    listStudentGuardians(request, studentId)
      .then(({ data }) => {
        if (active) setLinks(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los responsables.');
      });
    return () => {
      active = false;
    };
  }, [request, studentId]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setMode(null);
      setNotice(success);
      onChange?.();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo guardar el cambio.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {!links ? (
        error ? null : <p className={styles.muted}>Cargando responsables…</p>
      ) : links.length === 0 ? (
        <p className={styles.muted}>Sin padre, madre o tutor registrado.</p>
      ) : (
        <ul className={styles.list} aria-label="Responsables del alumno">
          {links.map((link) => (
            <li key={link.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>{link.guardian.fullName}</strong>
                <span className={styles.muted}>{relationshipText(link)}</span>
              </div>
              <div className={styles.tags}>
                {link.primaryContact ? <span className={`${styles.tag} ${styles.tagPrimary}`}>Responsable principal</span> : null}
                <span className={styles.tag}>{link.livesWithStudent ? 'Vive con el alumno' : 'No vive con el alumno'}</span>
                {link.legalRepresentative ? <span className={styles.tag}>Representante legal</span> : null}
              </div>
              <div className={styles.muted}>
                {[link.guardian.mobilePhone ?? link.guardian.homePhone, link.guardian.primaryEmail, link.guardian.dpiMasked && `DPI ${link.guardian.dpiMasked}`]
                  .filter(Boolean)
                  .join(' · ') || 'Sin datos de contacto'}
              </div>
              {link.otherStudents.length ? (
                <div className={styles.muted}>
                  También es responsable de: {link.otherStudents.map((s) => `${s.fullName} (${s.studentCode})`).join(', ')}
                </div>
              ) : null}
              {canWrite ? (
                <div className={styles.actions}>
                  {!link.primaryContact ? (
                    <button type="button" className={`btn ${styles.btnSm}`} disabled={busy}
                      onClick={() => void run(() => updateGuardianLink(request, studentId, link.id, { primaryContact: true }), 'Responsable principal actualizado.')}>
                      Marcar como principal
                    </button>
                  ) : null}
                  <button type="button" className={`btn ${styles.btnSm}`} disabled={busy} onClick={() => setMode({ type: 'edit', link })}>
                    Editar
                  </button>
                  <button type="button" className={`btn ${styles.btnSm}`} disabled={busy}
                    aria-label={`Desvincular a ${link.guardian.fullName}`}
                    onClick={() => void run(() => unlinkGuardian(request, studentId, link.id), 'Responsable desvinculado.')}>
                    Desvincular
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite && !mode ? (
        <div>
          <button type="button" className="btn" onClick={() => { setMode({ type: 'add' }); setNotice(''); }}>
            <Plus size={16} aria-hidden="true" />
            Agregar responsable
          </button>
        </div>
      ) : null}
      {mode?.type === 'add' ? (
        <AddGuardianForm
          request={request}
          linkedIds={new Set(links?.map((link) => link.guardian.id))}
          isFirst={!links?.some((link) => link.primaryContact)}
          busy={busy}
          onCancel={() => setMode(null)}
          onSubmit={(input) => run(() => linkGuardian(request, studentId, input), 'Responsable vinculado.')}
        />
      ) : null}
      {mode?.type === 'edit' ? (
        <EditGuardianForm
          key={mode.link.id}
          link={mode.link}
          busy={busy}
          onCancel={() => setMode(null)}
          onSubmit={(person, linkFields) =>
            run(async () => {
              if (Object.keys(person).length) await updateGuardian(request, mode.link.guardian.id, person);
              await updateGuardianLink(request, studentId, mode.link.id, linkFields);
            }, 'Responsable actualizado.')
          }
        />
      ) : null}
    </div>
  );
}

function LinkFieldsEditor({ value, onChange }: { value: GuardianLinkFields; onChange: (value: GuardianLinkFields) => void }) {
  const set = (values: Partial<GuardianLinkFields>) => onChange({ ...value, ...values });
  return (
    <>
      <div className={styles.grid}>
        <label className="label">
          Parentesco
          <select className="select" value={value.relationship}
            onChange={(event) => set({ relationship: event.target.value as GuardianRelationship })}>
            {relationships.map((relationship) => (
              <option key={relationship} value={relationship}>{guardianRelationshipLabels[relationship]}</option>
            ))}
          </select>
        </label>
        {value.relationship === 'OTHER' ? (
          <label className="label">
            ¿Cuál parentesco?
            <input className="field fieldWide" value={value.customRelationship ?? ''} maxLength={80} required
              onChange={(event) => set({ customRelationship: event.target.value || null })} />
          </label>
        ) : null}
      </div>
      <div className={styles.checks}>
        <label className={styles.check}>
          <input type="checkbox" checked={value.livesWithStudent} onChange={(event) => set({ livesWithStudent: event.target.checked })} />
          Vive con el alumno
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={value.primaryContact} onChange={(event) => set({ primaryContact: event.target.checked })} />
          Responsable principal
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={value.legalRepresentative} onChange={(event) => set({ legalRepresentative: event.target.checked })} />
          Representante legal
        </label>
      </div>
    </>
  );
}

function PersonFields({ value, onChange, dpiHint }: { value: GuardianInput; onChange: (value: GuardianInput) => void; dpiHint: string }) {
  return (
    <div className={styles.grid}>
      {personFields.map(([field, label, type]) => (
        <label key={field} className="label">
          {label}
          <input className="field fieldWide" type={type ?? 'text'} value={value[field] ?? ''}
            required={field === 'givenNames' || field === 'firstSurname'}
            onChange={(event) => onChange({ ...value, [field]: event.target.value })} />
        </label>
      ))}
      <label className="label">
        DPI {dpiHint}
        <input className="field fieldWide" inputMode="numeric" value={value.dpi ?? ''}
          onChange={(event) => onChange({ ...value, dpi: event.target.value })} />
      </label>
    </div>
  );
}

/** Convierte los textos vacíos en null, sin incluir los campos que no cambiaron. */
function cleanPerson(person: GuardianInput, keepEmptyDpi = false) {
  const result: GuardianInput = {};
  for (const [field, raw] of Object.entries(person) as Array<[keyof GuardianInput, string | null | undefined]>) {
    if (raw === undefined) continue;
    const text = raw?.trim() ?? '';
    if (field === 'dpi' && !text && !keepEmptyDpi) continue;
    (result as Record<string, string | null>)[field] = text || null;
  }
  return result;
}

function AddGuardianForm({
  request,
  linkedIds,
  isFirst,
  busy,
  onCancel,
  onSubmit,
}: {
  request: AuthenticatedRequest;
  linkedIds: Set<string>;
  isFirst: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof linkGuardian>[2]) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuardianSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<GuardianSearchResult | null>(null);
  const [person, setPerson] = useState<GuardianInput>({});
  const [linkFields, setLinkFields] = useState<GuardianLinkFields>({ ...emptyLinkFields, primaryContact: isFirst });

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearchError('');
    try {
      setResults((await searchGuardians(request, query.trim())).data);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'No se pudo buscar.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = { ...linkFields, customRelationship: linkFields.relationship === 'OTHER' ? linkFields.customRelationship : null };
    if (tab === 'search' && selected) await onSubmit({ ...fields, guardianId: selected.id });
    if (tab === 'new') await onSubmit({ ...fields, guardian: cleanPerson(person) });
  }

  return (
    <div className={styles.form}>
      <div className={styles.modes} role="group" aria-label="Cómo agregar el responsable">
        <button type="button" className={`btn ${styles.btnSm} ${tab === 'search' ? 'btnPrimary' : ''}`} aria-pressed={tab === 'search'} onClick={() => setTab('search')}>
          Buscar registrado
        </button>
        <button type="button" className={`btn ${styles.btnSm} ${tab === 'new' ? 'btnPrimary' : ''}`} aria-pressed={tab === 'new'} onClick={() => setTab('new')}>
          Registrar nuevo
        </button>
      </div>

      {tab === 'search' ? (
        <form role="search" aria-label="Buscar responsable" onSubmit={(event) => void search(event)} className={styles.fieldset}>
          <p className={styles.muted}>Si un hermano ya está inscrito, busque a su padre, madre o tutor para reutilizar sus datos.</p>
          <div className={styles.grid}>
            <label className="label">
              Nombre o DPI del responsable
              <input className="field fieldWide" type="search" value={query} minLength={2} maxLength={200}
                onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
          <div>
            <button type="submit" className={`btn ${styles.btnSm}`} disabled={query.trim().length < 2}>
              <Search size={14} aria-hidden="true" /> Buscar
            </button>
          </div>
          {searchError ? <p className={styles.error} role="alert">{searchError}</p> : null}
          {results && results.length === 0 ? <p className={styles.muted}>No se encontraron responsables. Puede registrarlo como nuevo.</p> : null}
          {results?.length ? (
            <ul className={styles.list} aria-label="Resultados de responsables">
              {results.map((result) => {
                const already = linkedIds.has(result.id);
                return (
                  <li key={result.id} className={styles.card}>
                    <label className={styles.check}>
                      <input type="radio" name="guardian-result" checked={selected?.id === result.id} disabled={already}
                        onChange={() => setSelected(result)} />
                      <strong>{result.fullName}</strong>
                      {result.dpiMasked ? <span className={styles.muted}>DPI {result.dpiMasked}</span> : null}
                    </label>
                    <div className={styles.muted}>
                      {already ? 'Ya está vinculado a este alumno. ' : ''}
                      {result.students.length
                        ? `Responsable de: ${result.students.map((s) => `${s.fullName} (${guardianRelationshipLabels[s.relationship]})`).join(', ')}`
                        : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </form>
      ) : null}

      <form onSubmit={(event) => void submit(event)} aria-label="Vincular responsable">
        <fieldset className={styles.fieldset} disabled={busy}>
          {tab === 'new' ? <PersonFields value={person} onChange={setPerson} dpiHint="(opcional)" /> : null}
          {tab === 'new' || selected ? <LinkFieldsEditor value={linkFields} onChange={setLinkFields} /> : null}
          <div className={styles.actions}>
            <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn btnPrimary" disabled={tab === 'search' && !selected}>
              {busy ? 'Guardando…' : tab === 'search' ? 'Vincular responsable' : 'Registrar y vincular'}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function EditGuardianForm({
  link,
  busy,
  onCancel,
  onSubmit,
}: {
  link: GuardianLink;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (person: GuardianInput, link: Partial<GuardianLinkFields>) => Promise<boolean>;
}) {
  const original: GuardianInput = Object.fromEntries(personFields.map(([field]) => [field, link.guardian[field as keyof typeof link.guardian] ?? ''])) as GuardianInput;
  const [person, setPerson] = useState<GuardianInput>({ ...original, dpi: '' });
  const [linkFields, setLinkFields] = useState<GuardianLinkFields>({
    relationship: link.relationship,
    customRelationship: link.customRelationship,
    livesWithStudent: link.livesWithStudent,
    primaryContact: link.primaryContact,
    legalRepresentative: link.legalRepresentative,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Solo se envían los datos personales que cambiaron; el DPI vacío se conserva.
    const changed = Object.fromEntries(
      Object.entries(person).filter(([field, value]) => (field === 'dpi' ? Boolean(value?.trim()) : (value ?? '') !== (original[field as keyof GuardianInput] ?? ''))),
    ) as GuardianInput;
    await onSubmit(cleanPerson(changed), {
      ...linkFields,
      customRelationship: linkFields.relationship === 'OTHER' ? linkFields.customRelationship : null,
    });
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} aria-label={`Editar a ${link.guardian.fullName}`}>
      <fieldset className={styles.fieldset} disabled={busy}>
        <p className={styles.muted}>
          Los datos personales se actualizan para todos los alumnos de este responsable.
        </p>
        <PersonFields value={person} onChange={setPerson}
          dpiHint={link.guardian.hasDpi ? `(actual ${link.guardian.dpiMasked}; vacío para conservar)` : '(opcional)'} />
        <LinkFieldsEditor value={linkFields} onChange={setLinkFields} />
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btnPrimary">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </fieldset>
    </form>
  );
}
