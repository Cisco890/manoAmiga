import { useEffect, useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { ApiError } from '../../auth/api.ts';
import type { RoleCode } from '../../auth/types.ts';
import type {
  CreateUserInput,
  ManagedRole,
  ManagedUser,
  UpdateUserInput,
  UserStatus,
} from '../../api/users.ts';
import styles from './UserFormModal.module.css';

type UserFormModalProps = {
  user: ManagedUser | null;
  roles: ManagedRole[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: CreateUserInput | UpdateUserInput) => Promise<void>;
};

export function UserFormModal({
  user,
  roles,
  currentUserId,
  onClose,
  onSave,
}: UserFormModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const editing = Boolean(user);
  const editingSelf = user?.id === currentUserId;
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<RoleCode>(user?.role.code ?? 'COLLABORATOR');
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await onSave({
          displayName,
          email,
          ...(!editingSelf ? { role, status } : {}),
        });
      } else {
        await onSave({ displayName, email, password, role });
      }
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : 'No se pudo guardar el usuario. Inténtalo nuevamente.',
      );
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Cerrar formulario"
        disabled={saving}
      />
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Administración</p>
            <h2 id={titleId}>{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <p id={descriptionId}>
              {editing
                ? 'Actualiza los datos, el rol o el estado de la cuenta.'
                : 'Crea las credenciales y asigna un único rol.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar"
            disabled={saving}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.grid}>
            <label className={styles.fieldGroup}>
              Nombre completo
              <input
                autoFocus
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={160}
                required
                disabled={saving}
              />
            </label>

            <label className={styles.fieldGroup}>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                disabled={saving}
              />
            </label>

            {!editing ? (
              <label className={[styles.fieldGroup, styles.fullWidth].join(' ')}>
                Contraseña temporal
                <span className={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                    disabled={saving}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <span className={styles.hint}>Debe contener al menos 12 caracteres.</span>
              </label>
            ) : null}

            <label className={styles.fieldGroup}>
              Rol
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as RoleCode)}
                disabled={saving || editingSelf}
              >
                {roles.map((availableRole) => (
                  <option key={availableRole.code} value={availableRole.code}>
                    {availableRole.name}
                  </option>
                ))}
              </select>
            </label>

            {editing ? (
              <label className={styles.fieldGroup}>
                Estado
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as UserStatus)}
                  disabled={saving || editingSelf}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </label>
            ) : null}
          </div>

          {editingSelf ? (
            <p className={styles.notice}>
              Por seguridad no puedes cambiar tu propio rol ni desactivar tu cuenta.
            </p>
          ) : null}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <footer className={styles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
