import type { Prisma, SponsorshipStatus } from "../generated/prisma/client";
import { prisma } from "../prisma";

/**
 * Modelo de padrinazgo (MA-37).
 *
 * `sponsorships` es una relación muchos a muchos entre `sponsors` y `students`: la base de datos
 * permite que un padrino apoye a varios alumnos y que un alumno tenga varios padrinos. Hoy el
 * colegio trabaja con un solo padrino por alumno; esa política es una regla de negocio que se
 * aplica aquí, en el servicio, y se configura con el ajuste `sponsorship.max_open_per_student`.
 * Si el colegio amplía la política, basta con cambiar el ajuste: no hace falta migrar el esquema.
 */

type Client = Prisma.TransactionClient | typeof prisma;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

/** Estados en los que el padrinazgo sigue vigente y ocupa el cupo del alumno. */
export const OPEN_SPONSORSHIP_STATUSES: readonly SponsorshipStatus[] = ["PENDING", "ACTIVE", "PAUSED"];

export const MAX_OPEN_SPONSORSHIPS_SETTING = "sponsorship.max_open_per_student";
export const DEFAULT_MAX_OPEN_SPONSORSHIPS = 1;

/** Interpreta el valor del ajuste. Un valor ausente o inválido usa la política por defecto (1). */
export function parseMaxOpenSponsorships(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20
    ? value
    : DEFAULT_MAX_OPEN_SPONSORSHIPS;
}

/** Cupo máximo de padrinazgos abiertos por alumno en el colegio. */
export async function maxOpenSponsorshipsPerStudent(client: Client, schoolId: string) {
  const setting = await client.systemSetting.findUnique({
    where: { schoolId_key: { schoolId, key: MAX_OPEN_SPONSORSHIPS_SETTING } },
    select: { value: true },
  });
  return parseMaxOpenSponsorships(setting?.value);
}

export function openSponsorshipLimitMessage(limit: number) {
  return limit === 1
    ? "El alumno ya tiene un padrino asignado. Finalice o cancele ese padrinazgo antes de asignar otro."
    : `El alumno ya tiene el máximo de ${limit} padrinos asignados.`;
}

/**
 * Verifica que el alumno tenga cupo para un padrinazgo abierto más.
 *
 * Debe llamarse dentro de la transacción que crea (o reabre) el padrinazgo: bloquea la fila del
 * alumno para que dos asignaciones simultáneas no superen el cupo.
 */
export async function assertStudentCanReceiveSponsor(
  tx: Prisma.TransactionClient,
  schoolId: string,
  studentId: string,
) {
  const student = await tx.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw fail(404, "Alumno no encontrado");
  await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;

  const [limit, open] = await Promise.all([
    maxOpenSponsorshipsPerStudent(tx, schoolId),
    tx.sponsorship.count({ where: { studentId, status: { in: [...OPEN_SPONSORSHIP_STATUSES] } } }),
  ]);
  if (open >= limit) throw fail(409, openSponsorshipLimitMessage(limit));
}

/** Un mismo padrino no puede tener dos padrinazgos abiertos con el mismo alumno. */
export async function assertNoOpenSponsorshipForPair(client: Client, sponsorId: string, studentId: string) {
  const duplicate = await client.sponsorship.findFirst({
    where: { sponsorId, studentId, status: { in: [...OPEN_SPONSORSHIP_STATUSES] } },
    select: { id: true },
  });
  if (duplicate) throw fail(409, "Este padrino ya tiene un padrinazgo vigente con el alumno");
}
