import { useEffect, useState, type FormEvent } from 'react';
import { getStudentAddress, saveStudentAddress, type Address, type AddressInput, type AddressUser } from '../../api/addresses.ts';
import type { AuthenticatedRequest } from '../../api/users.ts';
import { toAddressInput } from '../../lib/address.ts';
import styles from './GuardiansPanel.module.css';

/** Direcciones del alumno y sus responsables (MA-28). */

const fields: Array<[keyof AddressInput, string, number]> = [
  ['fullAddress', 'Dirección (calle o avenida y número)', 300],
  ['zone', 'Zona', 20],
  ['neighborhood', 'Colonia o barrio', 120],
  ['village', 'Aldea o caserío', 120],
  ['lot', 'Lote', 30],
  ['block', 'Manzana', 30],
  ['sector', 'Sector', 80],
  ['municipality', 'Municipio', 100],
  ['department', 'Departamento', 100],
  ['country', 'País', 100],
  ['reference', 'Referencia para llegar', 500],
];

/** Campos de la dirección. Municipio y departamento son obligatorios, igual que en la API. */
export function AddressFields({ value, onChange }: { value: AddressInput; onChange: (value: AddressInput) => void }) {
  return (
    <div className={styles.grid}>
      {fields.map(([field, label, max]) => (
        <label key={field} className="label">
          {label}
          <input className="field fieldWide" value={value[field] ?? ''} maxLength={max}
            required={field === 'municipality' || field === 'department'}
            onChange={(event) => onChange({ ...value, [field]: event.target.value || null })} />
        </label>
      ))}
    </div>
  );
}

const sharedText = (users: AddressUser[]) =>
  users.length ? `Compartida con: ${users.map((user) => user.fullName).join(', ')}. Los cambios aplican a todos.` : '';

export function StudentAddressPanel({
  studentId,
  request,
  canWrite,
  onChange,
}: {
  studentId: string;
  request: AuthenticatedRequest;
  canWrite: boolean;
  onChange?: () => void;
}) {
  const [data, setData] = useState<{ address: Address | null; sharedWith: AddressUser[] } | null>(null);
  const [draft, setDraft] = useState<AddressInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getStudentAddress(request, studentId)
      .then((result) => {
        if (active) setData(result.data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la dirección.');
      });
    return () => {
      active = false;
    };
  }, [request, studentId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setData((await saveStudentAddress(request, studentId, draft)).data);
      setDraft(null);
      setNotice('Dirección guardada.');
      onChange?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la dirección.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {!data ? (
        error ? null : <p className={styles.muted}>Cargando dirección…</p>
      ) : draft ? (
        <form className={styles.form} onSubmit={(event) => void save(event)} aria-label="Dirección del alumno">
          <fieldset className={styles.fieldset} disabled={busy}>
            {data.sharedWith.length ? <p className={styles.muted}>{sharedText(data.sharedWith)}</p> : null}
            <AddressFields value={draft} onChange={setDraft} />
            <div className={styles.actions}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>Cancelar</button>
              <button type="submit" className="btn btnPrimary">{busy ? 'Guardando…' : 'Guardar dirección'}</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p>{data.address?.formatted ?? <span className={styles.muted}>Sin dirección registrada.</span>}</p>
          {data.address?.reference ? <p className={styles.muted}>Referencia: {data.address.reference}</p> : null}
          {data.sharedWith.length ? <p className={styles.muted}>{sharedText(data.sharedWith)}</p> : null}
          {canWrite ? (
            <div>
              <button type="button" className="btn" onClick={() => { setDraft(toAddressInput(data.address)); setNotice(''); }}>
                {data.address ? 'Editar dirección' : 'Registrar dirección'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
