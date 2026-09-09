import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import styles from './pageLayout.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Página no encontrada"
        description="La ruta solicitada no forma parte del dashboard"
      />
      <p>
        <Link to="/">Regresar al dashboard</Link>
      </p>
    </div>
  );
}
