import { useState } from 'react';
import { getStudentMedicalProfile, type StudentMedicalProfile } from '../../api/medical.ts';
import type { AuthenticatedRequest } from '../../api/users.ts';
import { formatDate } from '../../lib/dates.ts';
import styles from './StudentSummaryModal.module.css';

/**
 * Perfil médico en la ficha del alumno (MA-29). Solo se muestra a quien tiene
 * student.medical.read y se carga a pedido, porque cada consulta queda en auditoría.
 */
export function MedicalProfileSection({ studentId, request }: { studentId: string; request: AuthenticatedRequest }) {
  const [data, setData] = useState<StudentMedicalProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData((await getStudentMedicalProfile(request, studentId)).data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el perfil médico.');
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <>
        <p className={styles.muted}>Información confidencial para emergencias. Cada consulta queda registrada.</p>
        {error ? <p role="alert">{error}</p> : null}
        <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
          {loading ? 'Cargando…' : 'Ver perfil médico'}
        </button>
      </>
    );
  }

  const { profile, enrollment } = data;
  if (!profile) return <p className={styles.muted}>Sin perfil médico registrado.</p>;
  const yesNo = (value: boolean | null, detail: string | null) =>
    value === null ? 'Sin dato' : value ? `Sí${detail ? `: ${detail}` : ''}` : 'No';

  return (
    <>
      <dl className={styles.facts}>
        <div><dt>Tipo de sangre</dt><dd>{profile.bloodTypeUnknown ? 'Se desconoce' : profile.bloodType ?? 'Sin dato'}</dd></div>
        <div><dt>Enfermedades o alergias</dt><dd>{yesNo(profile.hasDiseaseOrAllergy, profile.diseaseOrAllergyDetails)}</dd></div>
        <div><dt>Alergia a medicamentos</dt><dd>{yesNo(profile.hasMedicationAllergy, profile.medicationAllergyDetails)}</dd></div>
        <div>
          <dt>Vacunas completas</dt>
          <dd>{profile.vaccinationsComplete === false ? `No${profile.missingVaccines ? `: faltan ${profile.missingVaccines}` : ''}` : yesNo(profile.vaccinationsComplete, null)}</dd>
        </div>
        {profile.emergencyMedicalNotes ? (
          <div><dt>En caso de emergencia</dt><dd>{profile.emergencyMedicalNotes}</dd></div>
        ) : null}
      </dl>
      <p className={styles.muted}>
        Registrado en la inscripción {enrollment?.academicCycle.name ?? ''} · actualizado {formatDate(profile.updatedAt.slice(0, 10))}
      </p>
    </>
  );
}
