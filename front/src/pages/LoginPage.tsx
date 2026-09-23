import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../auth/api.ts';
import { useAuth } from '../auth/useAuth.ts';
import logo from '../assets/mano-amiga-logo.png';
import styles from './LoginPage.module.css';

type LoginLocationState = { from?: string };

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const requestedDestination = (location.state as LoginLocationState | null)?.from;
  const destination =
    requestedDestination?.startsWith('/') && !requestedDestination.startsWith('//')
      ? requestedDestination
      : '/';

  // El login actualiza la sesión antes de navegar; ambos caminos deben llevar al mismo destino.
  if (status === 'authenticated') return <Navigate to={destination} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'No se pudo conectar con el servidor. Inténtalo nuevamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Mano Amiga">
        <div className={styles.brandContent}>
          <img src={logo} alt="Mano Amiga — Juntos transformando vidas" />
          <p className={styles.brandEyebrow}>CRM institucional</p>
          <h1>Juntos transformando vidas.</h1>
          <p className={styles.brandCopy}>
            Gestión segura de alumnos, inscripciones y padrinazgo para el equipo de Mano Amiga.
          </p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div>
            <p className={styles.eyebrow}>Acceso al sistema</p>
            <h2>Bienvenido</h2>
            <p className={styles.description}>Ingresa con las credenciales asignadas a tu cuenta.</p>
          </div>

          <label className={styles.label}>
            Correo electrónico
            <span className={styles.fieldWrap}>
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="nombre@manoamiga.edu.gt"
                required
                disabled={submitting}
              />
            </span>
          </label>

          <label className={styles.label}>
            Contraseña
            <span className={styles.fieldWrap}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                required
                disabled={submitting}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>

          <p className={styles.help}>Si no puedes ingresar, comunícate con un administrador.</p>
        </form>
      </section>
    </main>
  );
}
