import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { listSponsors, type SponsorListItem } from '../api/sponsors.ts';
import { useAuth } from '../auth/useAuth.ts';
import { SponsorDetailModal } from '../components/sponsors/SponsorDetailModal.tsx';
import { SponsorFormModal } from '../components/sponsors/SponsorFormModal.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { getRouteByPath } from '../config/navigation.ts';
import { donationFrequencyLabels, sponsorTypeLabels, sponsorshipStatusLabels } from '../lib/labels.ts';
import { formatMoney } from '../lib/money.ts';
import pageStyles from './pageLayout.module.css';
import styles from './schoolShared.module.css';

const route = getRouteByPath('/padrinos');
const pageSize = 10;

type ActiveFilter = '' | 'true' | 'false';

export function SponsorsPage() {
  const { can, request } = useAuth();
  const canWrite = can('sponsor.write');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<ActiveFilter>('true');
  const [page, setPage] = useState(1);
  const [sponsors, setSponsors] = useState<SponsorListItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listSponsors(request, { page, limit: pageSize, q: query || undefined, active: active ? active === 'true' : undefined }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSponsors(result.data);
          setPagination(result.pagination);
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los padrinos.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, page, query, active, reload]);

  const refresh = () => setReload((value) => value + 1);

  return (
    <div className={pageStyles.stack}>
      <PageHeader
        title={route?.label ?? 'Padrinos'}
        description={route?.description ?? ''}
        actions={canWrite ? (
          <button type="button" className="btn btnPrimary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            Nuevo padrino
          </button>
        ) : undefined}
      />

      <section className={styles.panel} aria-label="Directorio de padrinos">
        <form className={styles.filters} role="search" aria-label="Buscar padrinos" onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(draft.trim());
          refresh();
        }}>
          <label className="label">
            Buscar padrino
            <input className="field fieldWide" type="search" value={draft} maxLength={200}
              onChange={(event) => setDraft(event.target.value)} placeholder="Nombre, correo o teléfono" />
          </label>
          <label className="label">
            Estado
            <select className="select" value={active} onChange={(event) => { setActive(event.target.value as ActiveFilter); setPage(1); }}>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
              <option value="">Todos</option>
            </select>
          </label>
          <button type="submit" className="btn btnPrimary">Buscar</button>
        </form>

        {error ? (
          <div className={styles.error} role="alert">
            {error} <button type="button" className="btn" onClick={refresh}>Reintentar</button>
          </div>
        ) : loading ? (
          <p className={styles.empty} role="status">Buscando padrinos…</p>
        ) : sponsors.length === 0 ? (
          <p className={styles.empty}>
            {query ? 'No hay padrinos que coincidan con la búsqueda.' : 'Todavía no hay padrinos registrados.'}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Padrino</th><th>Contacto</th><th>Alumnos apadrinados</th><th>Compromiso autorizado</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {sponsors.map((sponsor) => (
                  <tr key={sponsor.id}>
                    <td>
                      <strong>{sponsor.fullName}</strong>
                      <span className={styles.reviewNote}>
                        {sponsorTypeLabels[sponsor.type]}{sponsor.contactName ? ` · ${sponsor.contactName}` : ''}
                      </span>
                    </td>
                    <td>
                      {sponsor.email || sponsor.phone ? (
                        <>
                          {sponsor.email ? <div>{sponsor.email}</div> : null}
                          {sponsor.phone ? <div>{sponsor.phone}</div> : null}
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      {sponsor.openSponsorships.length
                        ? sponsor.openSponsorships.map((sponsorship) => (
                            <div key={sponsorship.id}>
                              {sponsorship.student.fullName}{' '}
                              <span className={styles.reviewNote}>{sponsorshipStatusLabels[sponsorship.status]}</span>
                            </div>
                          ))
                        : 'Sin alumnos'}
                    </td>
                    <td>
                      {sponsor.openSponsorships.some((sponsorship) => sponsorship.commitment)
                        ? sponsor.openSponsorships.map((sponsorship) => sponsorship.commitment ? (
                            <div key={sponsorship.id}>
                              {formatMoney(sponsorship.commitment.authorizedAmount, sponsorship.commitment.currency)}{' '}
                              <span className={styles.reviewNote}>{donationFrequencyLabels[sponsorship.commitment.frequency]}</span>
                            </div>
                          ) : null)
                        : '—'}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${sponsor.active ? styles.badgeActive : styles.badgeMuted}`}>
                        {sponsor.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={`btn ${styles.btnSm}`} aria-label={`Ver padrino ${sponsor.fullName}`}
                        onClick={() => setSelectedId(sponsor.id)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.pagination}>
          <span aria-live="polite">{error ? 'Listado no disponible' : `${pagination.total} padrinos · página ${page} de ${pagination.pages}`}</span>
          <div className={styles.rowActions}>
            <button type="button" className={`btn ${styles.btnSm}`} disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
            <button type="button" className={`btn ${styles.btnSm}`} disabled={loading || Boolean(error) || page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
          </div>
        </div>
      </section>

      {creating ? (
        <SponsorFormModal
          onClose={() => setCreating(false)}
          onSaved={(sponsor) => {
            setCreating(false);
            refresh();
            setSelectedId(sponsor.id);
          }}
          onUseExisting={(match) => {
            setCreating(false);
            setSelectedId(match.id);
          }}
        />
      ) : null}

      {selectedId ? (
        <SponsorDetailModal key={selectedId} sponsorId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}
