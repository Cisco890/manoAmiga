import { ApiError } from '../auth/api.ts';
import type { EnrollmentStatus } from './school.ts';
import type { AuthenticatedRequest } from './users.ts';

export type MedicalProfile = {
  bloodType: string | null;
  bloodTypeUnknown: boolean;
  hasDiseaseOrAllergy: boolean;
  diseaseOrAllergyDetails: string | null;
  hasMedicationAllergy: boolean;
  medicationAllergyDetails: string | null;
  vaccinationsComplete: boolean | null;
  missingVaccines: string | null;
  emergencyMedicalNotes: string | null;
  updatedAt: string;
};

export type StudentMedicalProfile = {
  profile: MedicalProfile | null;
  enrollment: { id: string; status: EnrollmentStatus; academicCycle: { id: string; name: string; year: number } } | null;
};

/** Requiere student.medical.read; la API registra cada consulta en auditoría. */
export async function getStudentMedicalProfile(request: AuthenticatedRequest, studentId: string) {
  const response = await request(`/students/${studentId}/medical-profile`);
  if (response.ok) return (await response.json()) as { data: StudentMedicalProfile };
  let message = 'No se pudo cargar el perfil médico.';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Conserva el mensaje genérico.
  }
  throw new ApiError(message, response.status);
}
