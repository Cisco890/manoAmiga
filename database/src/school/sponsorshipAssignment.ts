import type { DonationFrequency, Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { parseDateOnly } from "./catalog";
import { buildFullName } from "./personName";
import { commitmentSelect, publicCommitment, sponsorDisplayName } from "./sponsors";
import { assertNoOpenSponsorshipForPair, assertStudentCanReceiveSponsor } from "./sponsorships";

/**
 * Asignar un padrino a un alumno con su compromiso de donación (MA-34).
 *
 * El padrinazgo nace en estado PENDIENTE (MA-36 lo lleva a ACTIVO) y su compromiso se guarda en
 * `donation_commitments`, vinculado al padrinazgo. El monto es lo que el padrino **autorizó**
 * aportar; no representa dinero recibido. Este flujo no captura datos de tarjeta ni de pago.
 */

export const donationFrequencies = ["MONTHLY", "ONE_TIME"] as const;

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const invalid = (message: string) => fail(400, message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(section: string, value: Record<string, unknown>, allowed: readonly string[]) {
  const unknownField = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknownField) throw invalid(`Campo no permitido en ${section}: ${unknownField}`);
}

const amountRe = /^\d{1,10}(\.\d{1,2})?$/;

/** Monto positivo con hasta 2 decimales (columna DECIMAL(12,2)). Se devuelve como texto exacto. */
export function parseAuthorizedAmount(value: unknown) {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!amountRe.test(text)) throw invalid("El monto autorizado debe ser un número positivo con hasta 2 decimales");
  if (Number(text) <= 0) throw invalid("El monto autorizado debe ser mayor que cero");
  return text;
}

const assignmentFields = ["sponsorId", "startDate", "notes", "commitment"] as const;
const commitmentFields = ["amount", "currency", "frequency", "startDate", "endDate"] as const;

export function parseAssignmentInput(body: unknown) {
  if (!isRecord(body)) throw invalid("El cuerpo debe ser un objeto JSON");
  rejectUnknown("el padrinazgo", body, assignmentFields);
  if (typeof body.sponsorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.sponsorId)) {
    throw invalid("sponsorId no es válido");
  }
  const startDate = parseDateOnly(body.startDate, "La fecha de inicio");
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") throw invalid("Las notas deben ser texto");
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;

  if (!isRecord(body.commitment)) throw invalid("El compromiso de donación es obligatorio");
  const commitment = body.commitment;
  // Los campos de pago (tarjeta, referencia, proveedor) no se aceptan en este flujo.
  rejectUnknown("el compromiso", commitment, commitmentFields);
  if (!donationFrequencies.includes(commitment.frequency as DonationFrequency)) {
    throw invalid("La frecuencia debe ser MONTHLY (mensual) o ONE_TIME (única)");
  }
  const frequency = commitment.frequency as DonationFrequency;
  const currency = commitment.currency === undefined ? "GTQ" : commitment.currency;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw invalid("La moneda debe ser un código de 3 letras, por ejemplo GTQ");
  const commitmentStart = commitment.startDate === undefined ? startDate : parseDateOnly(commitment.startDate, "La fecha de inicio del compromiso");
  if (commitmentStart < startDate) throw invalid("El compromiso no puede iniciar antes que el padrinazgo");
  const commitmentEnd = commitment.endDate === undefined || commitment.endDate === null
    ? null
    : parseDateOnly(commitment.endDate, "La fecha de fin del compromiso");
  if (commitmentEnd && frequency === "ONE_TIME") throw invalid("Una donación única no lleva fecha de fin");
  if (commitmentEnd && commitmentEnd < commitmentStart) throw invalid("La fecha de fin del compromiso debe ser posterior a su inicio");

  return {
    sponsorId: body.sponsorId,
    startDate,
    notes,
    commitment: {
      amount: parseAuthorizedAmount(commitment.amount),
      currency,
      frequency,
      startDate: commitmentStart,
      endDate: commitmentEnd,
    },
  };
}

export type AssignmentInput = ReturnType<typeof parseAssignmentInput>;

const studentSponsorshipSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  notes: true,
  sponsor: {
    select: { id: true, type: true, givenNames: true, firstSurname: true, secondSurname: true, organizationName: true, active: true },
  },
  donations: commitmentSelect,
} as const satisfies Prisma.SponsorshipSelect;

type StudentSponsorshipRow = Prisma.SponsorshipGetPayload<{ select: typeof studentSponsorshipSelect }>;

function publicStudentSponsorship(row: StudentSponsorshipRow) {
  return {
    id: row.id,
    status: row.status,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    notes: row.notes,
    sponsor: {
      id: row.sponsor.id,
      fullName: sponsorDisplayName(row.sponsor),
      contactName: row.sponsor.type === "ORGANIZATION"
        ? buildFullName(row.sponsor.givenNames, row.sponsor.firstSurname, row.sponsor.secondSurname) || null
        : null,
      active: row.sponsor.active,
    },
    commitment: publicCommitment(row.donations[0]),
  };
}

/** Padrinazgos del alumno, vigentes e históricos, con su compromiso. */
export async function listStudentSponsorships(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } });
  if (!student) throw fail(404, "Alumno no encontrado");
  const rows = await prisma.sponsorship.findMany({
    where: { studentId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: studentSponsorshipSelect,
  });
  return rows.map(publicStudentSponsorship);
}

export async function assignSponsor(schoolId: string, actorId: string, studentId: string, input: AssignmentInput) {
  return prisma.$transaction(async (tx) => {
    // Bloquea al alumno y aplica la regla de un padrino por alumno (MA-37).
    await assertStudentCanReceiveSponsor(tx, schoolId, studentId);

    const sponsor = await tx.sponsor.findFirst({
      where: { id: input.sponsorId, schoolId, deletedAt: null },
      select: { id: true, active: true },
    });
    if (!sponsor) throw fail(404, "Padrino no encontrado");
    if (!sponsor.active) throw fail(409, "El padrino está inactivo. Reactívelo antes de asignarlo a un alumno.");
    await assertNoOpenSponsorshipForPair(tx, sponsor.id, studentId);

    const sponsorship = await tx.sponsorship.create({
      data: {
        sponsorId: sponsor.id,
        studentId,
        startDate: input.startDate,
        status: "PENDING",
        notes: input.notes,
        donations: {
          create: {
            amount: input.commitment.amount,
            currency: input.commitment.currency,
            frequency: input.commitment.frequency,
            startDate: input.commitment.startDate,
            endDate: input.commitment.endDate,
            status: "PENDING",
          },
        },
      },
      select: { id: true, donations: { select: { id: true } } },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "CREATE",
        entityType: "Sponsorship",
        entityId: sponsorship.id,
        afterData: {
          sponsorId: sponsor.id,
          studentId,
          status: "PENDING",
          donationCommitmentId: sponsorship.donations[0].id,
          authorizedAmount: input.commitment.amount,
          currency: input.commitment.currency,
          frequency: input.commitment.frequency,
        },
      },
    });

    return publicStudentSponsorship(
      await tx.sponsorship.findUniqueOrThrow({ where: { id: sponsorship.id }, select: studentSponsorshipSelect }),
    );
  });
}
