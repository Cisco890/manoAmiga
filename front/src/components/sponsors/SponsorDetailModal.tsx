import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { deactivateSponsor, getSponsor, updateSponsor, type SponsorDetail } from '../../api/sponsors.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { formatDate } from '../../lib/dates.ts';
import { donationFrequencyLabels, sponsorTypeLabels, sponsorshipStatusLabels } from '../../lib/labels.ts';
import { formatMoney } from '../../lib/money.ts';
import modalStyles from '../school/FormModal.module.css';
import shared from '../../pages/schoolShared.module.css';
import { SponsorFormModal } from './SponsorFormModal.tsx';
import styles from './Sponsors.module.css';

/**
 * Detalle del padrino (MA-33): datos de contacto y todos sus padrinazgos, vigentes e históricos.
 *
 * Puntos de extensión del Sprint 4:
 * - MA-35 (datos fiscales): agregar la sección "Datos fiscales" donde indica el comentario.
 * - MA-36 (estados): agregar una columna "Acciones" en la tabla de padrinazgos con los cambios de
 *   estado (activar, pausar, finalizar).
 */

type Props = {
  sponsorId: string;
  onClose: () => void;
  /** Se llama después de editar, desactivar o reactivar (para refrescar el listado). */
  onChanged?: () => void;
};

export function SponsorDetailModal({ sponsorId, onClose, onChanged }: Props) {
  const { request, can } = useAuth();
  const canWrite = can('sponsor.write');
  const [sponsor, setSponsor] = useState<SponsorDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSponsor(request, sponsorId, controller.signal)
      .then((result) => setSponsor(result.data))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el padrino.');
      });
    return () => controller.abort();
  }, [request, sponsorId]);

  const changeActive = useCallback(async (active: boolean) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = active ? await updateSponsor(request, sponsorId, { active: true }) : await deactivateSponsor(request, sponsorId);
      setSponsor(result.data);
      setNotice(active ? 'Padrino reactivado.' : 'Padrino desactivado. Su historial se conserva.');
      onChanged?.();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'No se pudo cambiar el estado del padrino.');
    } finally {
      setBusy(false);
    }
  }, [onChanged, request, sponsorId]);

  if (editing && sponsor) {
    return (
      <SponsorFormModal
        sponsor={sponsor}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setSponsor(saved);
          setEditing(false);
          setNotice('Datos del padrino actualizados.');
          onChanged?.();
        }}
      />
    );
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="sponsor-detail-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="sponsor-detail-title">{sponsor?.fullName ?? 'Padrino'}</h2>
            {sponsor ? (
              <p>
                {sponsorTypeLabels[sponsor.type]} · {sponsor.active ? 'Activo' : 'Inactivo'}
              </p>
            ) : null}
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar detalle">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={modalStyles.form}>
          {error ? <p className={modalStyles.error} role="alert">{error}</p> : null}
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
          {!sponsor ? (
            error ? null : <p className={styles.muted} role="status">Cargando padrino…</p>
          ) : (
            <>
              <dl className={styles.details}>
                {sponsor.contactName ? (
                  <div><dt>Contacto</dt><dd>{sponsor.contactName}</dd></div>
                ) : null}
                <div><dt>Correo</dt><dd>{sponsor.email ?? '—'}</dd></div>
                <div><dt>Teléfono</dt><dd>{sponsor.phone ?? '—'}</dd></div>
                <div><dt>Cumpleaños</dt><dd>{sponsor.birthday ? formatDate(sponsor.birthday) : '—'}</dd></div>
                {sponsor.notes ? <div><dt>Notas</dt><dd>{sponsor.notes}</dd></div> : null}
              </dl>

              {/* MA-35: sección "Datos fiscales" (NIT, nombre y dirección fiscal) del padrino. */}

              <section className={styles.section} aria-label="Padrinazgos">
                <h3>Alumnos apadrinados</h3>
                {sponsor.sponsorships.length === 0 ? (
                  <p className={styles.muted}>Todavía no tiene padrinazgos.</p>
                ) : (
                  <div className={shared.tableWrap}>
                    <table className={shared.table}>
                      <thead>
                        <tr><th>Alumno</th><th>Estado</th><th>Compromiso autorizado</th><th>Inicio</th><th>Fin</th></tr>
                      </thead>
                      <tbody>
                        {sponsor.sponsorships.map((sponsorship) => (
                          <tr key={sponsorship.id}>
                            <td>{sponsorship.student.fullName}<div className={styles.muted}>{sponsorship.student.studentCode}</div></td>
                            <td><span className={shared.badge}>{sponsorshipStatusLabels[sponsorship.status]}</span></td>
                            <td>
                              {sponsorship.commitment
                                ? <>{formatMoney(sponsorship.commitment.authorizedAmount, sponsorship.commitment.currency)}<div className={styles.muted}>{donationFrequencyLabels[sponsorship.commitment.frequency]}</div></>
                                : '—'}
                            </td>
                            <td>{formatDate(sponsorship.startDate)}</td>
                            <td>{sponsorship.endDate ? formatDate(sponsorship.endDate) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {canWrite ? (
                <div className={modalStyles.actions}>
                  {sponsor.active ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => void changeActive(false)}>
                      Desactivar
                    </button>
                  ) : (
                    <button type="button" className="btn" disabled={busy} onClick={() => void changeActive(true)}>
                      Reactivar
                    </button>
                  )}
                  <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => setEditing(true)}>
                    Editar datos
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
