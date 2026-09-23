import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Edit3,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  createUser,
  deactivateUser,
  listRoles,
  listUsers,
  updateUser,
  type CreateUserInput,
  type ManagedRole,
  type ManagedUser,
  type UpdateUserInput,
  type UserStatus,
} from '../api/users.ts';
import type { RoleCode } from '../auth/types.ts';
import { useAuth } from '../auth/useAuth.ts';
import { UserFormModal } from '../components/users/UserFormModal.tsx';
import { getRouteByPath } from '../config/navigation.ts';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './UsersPage.module.css';

const route = getRouteByPath('/usuarios');
const pageSize = 10;

function formatLastAccess(value: string | null) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin información';
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function UsersPage() {
  const { can, request, user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState<RoleCode | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [confirmUser, setConfirmUser] = useState<ManagedUser | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ page, limit: pageSize, q: search, status, role }),
    [page, role, search, status],
  );

  const fetchUsers = useCallback(
    () => listUsers(request, filters),
    [filters, request],
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchUsers();
      setUsers(result.data);
      setTotal(result.pagination.total);
      setPages(result.pagination.pages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    let active = true;
    void fetchUsers()
      .then((result) => {
        if (!active) return;
        setUsers(result.data);
        setTotal(result.pagination.total);
        setPages(result.pagination.pages);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los usuarios.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchUsers]);

  useEffect(() => {
    let active = true;
    void listRoles(request)
      .then((result) => {
        if (active) setRoles(result.data);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los roles.');
        }
      });
    return () => {
      active = false;
    };
  }, [request]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchDraft.trim();
    if (page === 1 && nextSearch === search) {
      void loadUsers();
      return;
    }
    setLoading(true);
    setPage(1);
    setSearch(nextSearch);
  }

  function openCreate() {
    setEditingUser(null);
    setEditorOpen(true);
  }

  function openEdit(user: ManagedUser) {
    setEditingUser(user);
    setEditorOpen(true);
  }

  async function saveUser(input: CreateUserInput | UpdateUserInput) {
    if (editingUser) {
      await updateUser(request, editingUser.id, input as UpdateUserInput);
    } else {
      await createUser(request, input as CreateUserInput);
    }
    setEditorOpen(false);
    setEditingUser(null);
    await loadUsers();
  }

  async function confirmDeactivate() {
    if (!confirmUser) return;
    setChangingStatus(confirmUser.id);
    setError('');
    try {
      await deactivateUser(request, confirmUser.id);
      setConfirmUser(null);
      await loadUsers();
    } catch (deactivateError) {
      setError(
        deactivateError instanceof Error
          ? deactivateError.message
          : 'No se pudo desactivar el usuario.',
      );
    } finally {
      setChangingStatus(null);
    }
  }

  async function reactivate(user: ManagedUser) {
    setChangingStatus(user.id);
    setError('');
    try {
      await updateUser(request, user.id, { status: 'ACTIVE' });
      await loadUsers();
    } catch (activateError) {
      setError(
        activateError instanceof Error ? activateError.message : 'No se pudo activar el usuario.',
      );
    } finally {
      setChangingStatus(null);
    }
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={route?.label ?? 'Usuarios'}
        description={route?.description ?? ''}
        actions={can('user.manage') ? (
          <button
            type="button"
            className="btn btnPrimary"
            onClick={openCreate}
            disabled={roles.length === 0}
          >
            <Plus size={17} aria-hidden="true" />
            Nuevo usuario
          </button>
        ) : undefined}
      />

      <section className={styles.panel} aria-label="Gestión de usuarios">
        <div className={styles.summary}>
          <div>
            <span className={styles.summaryIcon} aria-hidden="true">
              <Users size={20} />
            </span>
            <div>
              <p className={styles.summaryValue}>{total}</p>
              <p className={styles.summaryLabel}>
                {total === 1 ? 'usuario registrado' : 'usuarios registrados'}
              </p>
            </div>
          </div>
        </div>

        <form className={styles.filters} onSubmit={handleSearch}>
          <label className={styles.searchField}>
            <span className="srOnly">Buscar usuario</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nombre o correo"
            />
          </label>
          <select
            value={role}
            onChange={(event) => {
              setLoading(true);
              setRole(event.target.value as RoleCode | '');
              setPage(1);
            }}
            aria-label="Filtrar por rol"
          >
            <option value="">Todos los roles</option>
            {roles.map((availableRole) => (
              <option key={availableRole.code} value={availableRole.code}>
                {availableRole.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setLoading(true);
              setStatus(event.target.value as UserStatus | '');
              setPage(1);
            }}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
          <button type="submit" className="btn">Buscar</button>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadUsers()}
            aria-label="Actualizar listado"
            title="Actualizar listado"
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? styles.spinning : ''} aria-hidden="true" />
          </button>
        </form>

        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadUsers()}>
              Reintentar
            </button>
          </div>
        ) : null}

        <div className={styles.tableWrap} aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Último acceso</th>
                <th scope="col"><span className="srOnly">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0
                ? Array.from({ length: 4 }, (_, index) => (
                    <tr className={styles.skeletonRow} key={index}>
                      <td colSpan={5}>
                        <span />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    <Users size={26} aria-hidden="true" />
                    <strong>No se encontraron usuarios</strong>
                    <span>Ajusta los filtros o crea una cuenta nueva.</span>
                  </td>
                </tr>
              ) : null}
              {users.map((managedUser) => {
                const isSelf = managedUser.id === currentUser?.id;
                const busy = changingStatus === managedUser.id;
                return (
                  <tr key={managedUser.id}>
                    <td>
                      <div className={styles.userCell}>
                        <span className={styles.avatar}>{initials(managedUser.displayName)}</span>
                        <span>
                          <strong>
                            {managedUser.displayName}
                            {isSelf ? <small>Tú</small> : null}
                          </strong>
                          <span>{managedUser.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.roleBadge}>{managedUser.role.name}</span>
                    </td>
                    <td>
                      <span
                        className={[
                          styles.statusBadge,
                          managedUser.status === 'ACTIVE' ? styles.active : styles.inactive,
                        ].join(' ')}
                      >
                        <span aria-hidden="true" />
                        {managedUser.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={styles.lastAccess}>
                      {formatLastAccess(managedUser.lastLoginAt)}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          onClick={() => openEdit(managedUser)}
                          aria-label={`Editar a ${managedUser.displayName}`}
                          title="Editar"
                        >
                          <Edit3 size={17} aria-hidden="true" />
                        </button>
                        {!isSelf && managedUser.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            className={styles.dangerAction}
                            onClick={() => setConfirmUser(managedUser)}
                            aria-label={`Desactivar a ${managedUser.displayName}`}
                            title="Desactivar"
                            disabled={busy}
                          >
                            <PowerOff size={17} aria-hidden="true" />
                          </button>
                        ) : null}
                        {!isSelf && managedUser.status === 'INACTIVE' ? (
                          <button
                            type="button"
                            className={styles.activateAction}
                            onClick={() => void reactivate(managedUser)}
                            aria-label={`Activar a ${managedUser.displayName}`}
                            title="Activar"
                            disabled={busy}
                          >
                            <Power size={17} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className={styles.pagination}>
          <p>
            Página {pages === 0 ? 0 : page} de {pages}
          </p>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
              disabled={page <= 1 || loading}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLoading(true);
                setPage((current) => current + 1);
              }}
              disabled={page >= pages || loading}
            >
              Siguiente
            </button>
          </div>
        </footer>
      </section>

      {editorOpen && currentUser ? (
        <UserFormModal
          user={editingUser}
          roles={roles}
          currentUserId={currentUser.id}
          onClose={() => {
            setEditorOpen(false);
            setEditingUser(null);
          }}
          onSave={saveUser}
        />
      ) : null}

      {confirmUser ? (
        <div className={styles.confirmOverlay}>
          <button
            type="button"
            className={styles.confirmBackdrop}
            onClick={() => setConfirmUser(null)}
            aria-label="Cancelar desactivación"
            disabled={Boolean(changingStatus)}
          />
          <section className={styles.confirmDialog} role="alertdialog" aria-modal="true">
            <span className={styles.confirmIcon} aria-hidden="true">
              <PowerOff size={22} />
            </span>
            <h2>Desactivar usuario</h2>
            <p>
              <strong>{confirmUser.displayName}</strong> perderá el acceso al CRM y todas sus
              sesiones serán cerradas.
            </p>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmUser(null)}
                disabled={Boolean(changingStatus)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void confirmDeactivate()}
                disabled={Boolean(changingStatus)}
              >
                {changingStatus ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <p className={styles.connected}>
        <CheckCircle2 size={15} aria-hidden="true" /> Conectado a la API de usuarios
      </p>
    </div>
  );
}
