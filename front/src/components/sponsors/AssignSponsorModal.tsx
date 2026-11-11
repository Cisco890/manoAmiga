import { useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import {
  assignSponsor,
  listSponsors,
  type DonationFrequency,
  type SponsorListItem,
  type SponsorshipSummary,
} from '../../api/sponsors.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { parseDate } from '../../lib/dates.ts';
import { donationFrequencyLabels, sponsorshipStatusLabels } from '../../lib/labels.ts';
import { DateInput } from '../ui/DateInput.tsx';
import modalStyles from '../school/FormModal.module.css';
import { SponsorFormModal } from './SponsorFormModal.tsx';
import styles from './Sponsors.module.css';

/**
 * Asignar un padrino al alumno con su compromiso de donación (MA-34).
 *
 * Paso 1: buscar un padrino registrado o registrar uno nuevo (con sugerencia de duplicados, MA-33).
 * Paso 2: el compromiso. El monto es lo que el padrino autoriza aportar, no dinero recibido.
 * El padrinazgo queda Pendiente; MA-36 lo activa.
 */

type SelectedSponsor = { id: string; fullName: string; openSponsorships: SponsorshipSummary[] };

const today = () => {
  const now = new Date();
  return [now.getDate(), now.getMonth() + 1].map((part) => String(part).padStart(2, '0')).join('/') + `/${now.getFullYear()}`;
};

const amountRe = /^\d{1,10}([.,]\d{1,2})?$/;

type Props = {
  studentId: string;
  studentName: string;
  onClose: () => void;
  onAssigned: () => void;
};

export function AssignSponsorModal({ studentId, studentName, onClose, onAssigned }: Props) {
  const { request } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SponsorListItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<SelectedSponsor | null>(null);
  const [registering, setRegistering] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [frequency, setFrequency] = useState<DonationFrequency>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearchError('');
    try {
      setResults((await listSponsors(request, { page: 1, limit: 10, q: query.trim(), active: true })).data);
    } catch (searchFailure) {
      setSearchError(searchFailure instanceof Error ? searchFailure.message : 'No se pudo buscar padrinos.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const isoStart = parseDate(startDate.trim());
    const normalizedAmount = amount.trim().replace(',', '.');
    if (!selected) return setError('Seleccione o registre un padrino.');
    if (!isoStart) return setError('Ingrese la fecha de inicio como dd/mm/aaaa.');
    if (!amountRe.test(amount.trim()) || Number(normalizedAmount) <= 0) {
      return setError('Ingrese un monto mayor que cero, con hasta 2 decimales.');
    }
    setSaving(true);
    try {
      await assignSponsor(request, studentId, {
        sponsorId: selected.id,
        startDate: isoStart,
        notes: notes.trim() || null,
        commitment: { amount: normalizedAmount, currency: 'GTQ', frequency },
      });
      onAssigned();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'No se pudo asignar el padrino.');
      setSaving(false);
    }
  }

  if (registering) {
    return (
      <SponsorFormModal
        onClose={() => setRegistering(false)}
        onSaved={(sponsor) => {
          setSelected({ id: sponsor.id, fullName: sponsor.fullName, openSponsorships: [] });
          setRegistering(false);
        }}
        onUseExisting={(match) => {
          setSelected(match);
          setRegistering(false);
        }}
        useExistingLabel="Usar este padrino"
      />
    );
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="assign-sponsor-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="assign-sponsor-title">Asignar padrino</h2>
            <p>{studentName}</p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={modalStyles.form}>
          <section className={styles.section} aria-labelledby="assign-step-sponsor">
            <h3 id="assign-step-sponsor">1. Padrino</h3>
            {selected ? (
              <div className={styles.matchItem}>
                <div>
                  <strong>{selected.fullName}</strong>
                  <div className={styles.muted}>
                    {selected.openSponsorships.length
                      ? `También apoya a: ${selected.openSponsorships.map((s) => s.student.fullName).join(', ')}`
                      : 'Sin otros alumnos apadrinados'}
                  </div>
                </div>
                <button type="button" className="btn" onClick={() => setSelected(null)} disabled={saving}>Cambiar</button>
              </div>
            ) : (
              <>
                <form role="search" aria-label="Buscar padrino" className={styles.section} onSubmit={(event) => void search(event)}>
                  <label className="label">
                    Buscar padrino registrado
                    <input className="field fieldWide" type="search" value={query} maxLength={200}
                      placeholder="Nombre, correo o teléfono" onChange={(event) => setQuery(event.target.value)} />
                  </label>
                  <div>
                    <button type="submit" className="btn" disabled={query.trim().length < 2}>
                      <Search size={14} aria-hidden="true" /> Buscar
                    </button>{' '}
                    <button type="button" className="btn" onClick={() => setRegistering(true)}>Registrar padrino nuevo</button>
                  </div>
                </form>
                {searchError ? <p className={modalStyles.error} role="alert">{searchError}</p> : null}
                {results && results.length === 0 ? (
                  <p className={styles.muted}>No se encontraron padrinos activos. Puede registrarlo como nuevo.</p>
                ) : null}
                {results?.length ? (
                  <ul className={styles.matchList} aria-label="Padrinos encontrados">
                    {results.map((sponsor) => (
                      <li key={sponsor.id} className={styles.matchItem}>
                        <div>
                          <strong>{sponsor.fullName}</strong>
                          <div className={styles.muted}>
                            {[sponsor.email, sponsor.phone].filter(Boolean).join(' · ') || 'Sin contacto'}
                            {sponsor.openSponsorships.length
                              ? ` · Apoya a: ${sponsor.openSponsorships.map((s) => `${s.student.fullName} (${sponsorshipStatusLabels[s.status]})`).join(', ')}`
                              : ''}
                          </div>
                        </div>
                        <button type="button" className="btn" aria-label={`Elegir a ${sponsor.fullName}`} onClick={() => setSelected(sponsor)}>
                          Elegir
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <form className={styles.section} aria-labelledby="assign-step-commitment" onSubmit={(event) => void submit(event)} noValidate>
            <h3 id="assign-step-commitment">2. Compromiso de donación</h3>
            <p className={styles.muted}>
              Registre el monto que el padrino <strong>autoriza</strong> aportar. Es un compromiso, no un pago recibido.
              No se registran datos de tarjeta.
            </p>
            <fieldset className={`${modalStyles.grid} ${styles.plainFieldset}`} disabled={saving}>
              <label className="label">
                Inicio del padrinazgo
                <DateInput className="field fieldWide" value={startDate} onChange={setStartDate} required />
              </label>
              <label className="label">
                Frecuencia
                <select className="select" value={frequency} onChange={(event) => setFrequency(event.target.value as DonationFrequency)}>
                  {(Object.keys(donationFrequencyLabels) as DonationFrequency[]).map((value) => (
                    <option key={value} value={value}>{donationFrequencyLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                {frequency === 'MONTHLY' ? 'Monto mensual autorizado (Q)' : 'Monto autorizado (Q)'}
                <input className="field fieldWide" inputMode="decimal" value={amount} maxLength={14} required
                  placeholder="250.00" onChange={(event) => setAmount(event.target.value)} />
              </label>
              <label className={`label ${modalStyles.full}`}>
                Notas
                <textarea className="field fieldWide" rows={2} value={notes} maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)} />
              </label>
            </fieldset>
            {error ? <p className={modalStyles.error} role="alert">{error}</p> : null}
            <div className={modalStyles.actions}>
              <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btnPrimary" disabled={saving || !selected}>
                {saving ? 'Asignando…' : 'Asignar padrino'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
