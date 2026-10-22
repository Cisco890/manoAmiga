import { prisma } from "../prisma";
import { decryptMedicalFields } from "../privacy/medical";
import { currentEnrollmentOrder } from "./students";

/**
 * Perfil médico del alumno para emergencias (MA-29).
 *
 * Se registra en el paso Salud de cada inscripción; aquí se consulta el más reciente. Solo
 * lo ve quien tiene student.medical.read y cada consulta queda en auditoría (VIEW) sin
 * copiar los datos médicos.
 */

const medicalSelect = {
  bloodType: true,
  bloodTypeUnknown: true,
  hasDiseaseOrAllergy: true,
  diseaseOrAllergyDetails: true,
  hasMedicationAllergy: true,
  medicationAllergyDetails: true,
  vaccinationsComplete: true,
  missingVaccines: true,
  laterality: true,
  emergencyMedicalNotes: true,
  updatedAt: true,
} as const;

export async function getStudentMedicalProfile(schoolId: string, actorId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw Object.assign(new Error("Alumno no encontrado"), { status: 404 });

  // Las inscripciones canceladas o rechazadas también pueden tener el perfil más reciente.
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, medicalProfile: { isNot: null } },
    orderBy: currentEnrollmentOrder,
    select: {
      id: true,
      status: true,
      academicCycle: { select: { id: true, name: true, year: true } },
      medicalProfile: { select: medicalSelect },
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId: actorId,
      action: "VIEW",
      entityType: "MedicalProfile",
      entityId: studentId,
      afterData: { enrollmentId: enrollment?.id ?? null },
    },
  });

  if (!enrollment?.medicalProfile) return { profile: null, enrollment: null };
  return {
    profile: decryptMedicalFields(enrollment.medicalProfile),
    enrollment: { id: enrollment.id, status: enrollment.status, academicCycle: enrollment.academicCycle },
  };
}
