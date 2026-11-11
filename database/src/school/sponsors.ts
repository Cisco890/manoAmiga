import type { Prisma, SponsorType } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { parseDateOnly } from "./catalog";
import { buildFullName } from "./personName";
import { OPEN_SPONSORSHIP_STATUSES } from "./sponsorships";

/**
 * Padrinos (MA-33).
 *
 * Un padrino es una persona u organización del colegio que puede existir sin padrinazgos. Antes
 * de registrar uno nuevo, la secretaría consulta `findSponsorMatches` para reutilizar el registro
 * si el padrino ya apoya a otro alumno.
 */

export const sponsorTypes = ["INDIVIDUAL", "ORGANIZATION"] as const;

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const invalid = (message: string) => fail(400, message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw invalid(`${label} debe ser texto`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length > max) throw invalid(`${label} no puede superar ${max} caracteres`);
  return trimmed || null;
}

function definedOnly<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dígitos del teléfono, sin espacios, guiones ni prefijos de formato. */
export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

/**
 * Clave para comparar teléfonos: los últimos 8 dígitos (el número local de Guatemala), así
 * «5555-1234», «+502 5555 1234» y «55551234» coinciden. Menos de 7 dígitos no se comparan.
 */
export function phoneMatchKey(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phoneDigits(phone);
  return digits.length >= 7 ? digits.slice(-8) : null;
}

// ---------------------------------------------------------------------------
// Validación

const sponsorFields = [
  "type",
  "givenNames",
  "firstSurname",
  "secondSurname",
  "organizationName",
  "birthday",
  "email",
  "phone",
  "notes",
  "active",
] as const;

/** Valida los datos del padrino. Con `partial` (PATCH), los campos ausentes se conservan. */
export function parseSponsorInput(body: unknown, partial = false) {
  if (!isRecord(body)) throw invalid("El cuerpo debe ser un objeto JSON");
  const unknownField = Object.keys(body).find((field) => !sponsorFields.includes(field as never));
  if (unknownField) throw invalid(`Campo no permitido: ${unknownField}`);

  if (body.type !== undefined && !sponsorTypes.includes(body.type as SponsorType)) {
    throw invalid("Tipo de padrino no válido");
  }
  if (!partial && body.active !== undefined) throw invalid("Campo no permitido: active");
  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw invalid("active debe ser verdadero o falso");
  }

  const email = optionalText(body.email, "El correo", 254)?.toLowerCase();
  if (email && !emailRe.test(email)) throw invalid("El correo no es válido");

  const phone = optionalText(body.phone, "El teléfono", 30);
  if (phone && (!/^[\d\s()+-]+$/.test(phone) || phoneDigits(phone).length < 7)) {
    throw invalid("El teléfono debe contener al menos 7 dígitos");
  }

  let birthday: Date | null | undefined;
  if (body.birthday === null || body.birthday === "") birthday = null;
  else if (body.birthday !== undefined) {
    birthday = parseDateOnly(body.birthday, "La fecha de cumpleaños");
    if (birthday > new Date()) throw invalid("La fecha de cumpleaños no puede ser futura");
  }

  return definedOnly({
    type: (body.type as SponsorType | undefined) ?? (partial ? undefined : "INDIVIDUAL"),
    givenNames: optionalText(body.givenNames, "Los nombres", 120),
    firstSurname: optionalText(body.firstSurname, "El primer apellido", 80),
    secondSurname: optionalText(body.secondSurname, "El segundo apellido", 80),
    organizationName: optionalText(body.organizationName, "El nombre de la organización", 200),
    birthday,
    email,
    phone,
    notes: optionalText(body.notes, "Las notas", 2000),
    active: body.active as boolean | undefined,
  });
}

export type SponsorInput = ReturnType<typeof parseSponsorInput>;

const sponsorSelect = {
  id: true,
  type: true,
  givenNames: true,
  firstSurname: true,
  secondSurname: true,
  organizationName: true,
  birthday: true,
  email: true,
  phone: true,
  active: true,
  notes: true,
  createdAt: true,
} as const satisfies Prisma.SponsorSelect;

type SponsorRow = Prisma.SponsorGetPayload<{ select: typeof sponsorSelect }>;

/** Completa el registro con los valores actuales y verifica el nombre según el tipo. */
function sponsorWriteData(input: SponsorInput, existing?: SponsorRow) {
  const pick = <K extends keyof SponsorRow & keyof SponsorInput>(key: K) =>
    (input[key] === undefined ? existing?.[key] ?? null : input[key]) as SponsorRow[K] | null;
  const type = (input.type ?? existing?.type ?? "INDIVIDUAL") as SponsorType;
  const givenNames = pick("givenNames");
  const firstSurname = pick("firstSurname");
  const secondSurname = pick("secondSurname");
  const organizationName = pick("organizationName");

  if (type === "INDIVIDUAL" && (!givenNames || !firstSurname)) {
    throw invalid("Los nombres y el primer apellido del padrino son obligatorios");
  }
  if (type === "ORGANIZATION" && !organizationName) {
    throw invalid("El nombre de la organización es obligatorio");
  }

  const personName = buildFullName(givenNames, firstSurname, secondSurname);
  const searchName = (type === "ORGANIZATION" ? [organizationName, personName] : [personName, organizationName])
    .filter(Boolean)
    .join(" ")
    .slice(0, 350);
  return { ...input, type, searchName };
}

/** Compromiso de donación vigente del padrinazgo (MA-34): el más reciente que no esté cancelado. */
export const commitmentSelect = {
  where: { status: { not: "CANCELLED" as const } },
  orderBy: { createdAt: "desc" as const },
  take: 1,
  select: { id: true, amount: true, currency: true, frequency: true, startDate: true, endDate: true, status: true },
};

type CommitmentRow = Prisma.DonationCommitmentGetPayload<{ select: typeof commitmentSelect.select }>;

const dateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/**
 * El compromiso es un monto **autorizado** por el padrino, no dinero recibido: por eso se expone
 * como `authorizedAmount` (texto con dos decimales, sin pérdida de precisión).
 */
export function publicCommitment(row: CommitmentRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    authorizedAmount: row.amount.toFixed(2),
    currency: row.currency,
    frequency: row.frequency,
    startDate: dateOnly(row.startDate)!,
    endDate: dateOnly(row.endDate),
    status: row.status,
  };
}

const sponsorshipSummarySelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  notes: true,
  student: { select: { id: true, studentCode: true, givenNames: true, firstSurname: true, secondSurname: true } },
  donations: commitmentSelect,
} as const satisfies Prisma.SponsorshipSelect;

type SponsorshipSummaryRow = Prisma.SponsorshipGetPayload<{ select: typeof sponsorshipSummarySelect }>;

export function sponsorDisplayName(row: Pick<SponsorRow, "type" | "givenNames" | "firstSurname" | "secondSurname" | "organizationName">) {
  const personName = buildFullName(row.givenNames, row.firstSurname, row.secondSurname);
  return (row.type === "ORGANIZATION" ? row.organizationName : personName) || personName || row.organizationName || "";
}

export function publicSponsor(row: SponsorRow) {
  return {
    ...row,
    fullName: sponsorDisplayName(row),
    // En una organización, los nombres son de la persona de contacto.
    contactName: row.type === "ORGANIZATION" ? buildFullName(row.givenNames, row.firstSurname, row.secondSurname) || null : null,
    birthday: dateOnly(row.birthday),
  };
}

export function publicSponsorship(row: SponsorshipSummaryRow) {
  return {
    id: row.id,
    status: row.status,
    startDate: dateOnly(row.startDate)!,
    endDate: dateOnly(row.endDate),
    notes: row.notes,
    student: {
      id: row.student.id,
      studentCode: row.student.studentCode,
      fullName: buildFullName(row.student.givenNames, row.student.firstSurname, row.student.secondSurname),
    },
    commitment: publicCommitment(row.donations[0]),
  };
}

const openSponsorshipsSelect = {
  where: { status: { in: [...OPEN_SPONSORSHIP_STATUSES] } },
  orderBy: { startDate: "desc" as const },
  select: sponsorshipSummarySelect,
};

// ---------------------------------------------------------------------------
// Consultas

export async function listSponsors(
  schoolId: string,
  options: { page: number; limit: number; q?: string; active?: boolean },
) {
  const tokens = options.q?.split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.SponsorWhereInput = {
    schoolId,
    deletedAt: null,
    ...(options.active === undefined ? {} : { active: options.active }),
    ...(options.q
      ? {
          OR: [
            { AND: tokens.map((token) => ({ searchName: { contains: token, mode: "insensitive" as const } })) },
            { email: { contains: options.q, mode: "insensitive" } },
            { phone: { contains: options.q } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.sponsor.count({ where }),
    prisma.sponsor.findMany({
      where,
      orderBy: [{ active: "desc" }, { searchName: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: { ...sponsorSelect, sponsorships: openSponsorshipsSelect },
    }),
  ]);
  return {
    data: rows.map(({ sponsorships, ...sponsor }) => ({
      ...publicSponsor(sponsor),
      openSponsorships: sponsorships.map(publicSponsorship),
    })),
    pagination: { page: options.page, limit: options.limit, total, pages: Math.max(1, Math.ceil(total / options.limit)) },
  };
}

export async function getSponsor(schoolId: string, sponsorId: string) {
  const row = await prisma.sponsor.findFirst({
    where: { id: sponsorId, schoolId, deletedAt: null },
    select: {
      ...sponsorSelect,
      sponsorships: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], select: sponsorshipSummarySelect },
    },
  });
  if (!row) throw fail(404, "Padrino no encontrado");
  const { sponsorships, ...sponsor } = row;
  return { ...publicSponsor(sponsor), sponsorships: sponsorships.map(publicSponsorship) };
}

export type SponsorMatchReason = "name" | "email" | "phone";

export function parseMatchQuery(params: URLSearchParams) {
  const name = optionalText(params.get("name") ?? undefined, "El nombre", 200) ?? null;
  const email = optionalText(params.get("email") ?? undefined, "El correo", 254)?.toLowerCase() ?? null;
  const phone = optionalText(params.get("phone") ?? undefined, "El teléfono", 30) ?? null;
  const excludeId = params.get("excludeId");
  if (excludeId && !/^[0-9a-f-]{36}$/i.test(excludeId)) throw invalid("excludeId no es válido");
  return { name, email, phone, excludeId: excludeId || null };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Posibles duplicados de un padrino: coincide el nombre (todas las palabras o similitud
 * trigram), el correo exacto o el teléfono (últimos 8 dígitos). Devuelve hasta 10, primero los
 * que coinciden por correo o teléfono, que son los más confiables.
 */
export async function findSponsorMatches(
  schoolId: string,
  query: { name: string | null; email: string | null; phone: string | null; excludeId: string | null },
) {
  const name = query.name && query.name.length >= 2 ? query.name : null;
  const email = query.email && emailRe.test(query.email) ? query.email : null;
  const phoneKey = phoneMatchKey(query.phone);
  if (!name && !email && !phoneKey) {
    throw invalid("Indique un nombre (2 caracteres o más), un correo válido o un teléfono");
  }
  const patterns = name ? name.split(/\s+/).filter(Boolean).map((token) => `%${escapeLike(token)}%`) : [];

  const matches = await prisma.$queryRaw<
    { id: string; name_match: boolean; email_match: boolean; phone_match: boolean; score: number }[]
  >`
    SELECT * FROM (
      SELECT
        id,
        (${name}::text IS NOT NULL
          AND (search_name ILIKE ALL(${patterns}::text[]) OR similarity(search_name, ${name}::text) >= 0.45)) AS name_match,
        (${email}::text IS NOT NULL AND lower(email) = ${email}::text) AS email_match,
        (${phoneKey}::text IS NOT NULL
          AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 8) = ${phoneKey}::text) AS phone_match,
        CASE WHEN ${name}::text IS NULL THEN 0 ELSE similarity(search_name, ${name}::text) END AS score
      FROM sponsors
      WHERE school_id = ${schoolId}::uuid
        AND deleted_at IS NULL
        AND (${query.excludeId}::uuid IS NULL OR id <> ${query.excludeId}::uuid)
    ) AS candidates
    WHERE name_match OR email_match OR phone_match
    ORDER BY (email_match OR phone_match) DESC, score DESC, id
    LIMIT 10
  `;
  if (matches.length === 0) return [];

  const rows = await prisma.sponsor.findMany({
    where: { id: { in: matches.map((match) => match.id) } },
    select: { ...sponsorSelect, sponsorships: openSponsorshipsSelect },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return matches.flatMap((match) => {
    const row = byId.get(match.id);
    if (!row) return [];
    const { sponsorships, ...sponsor } = row;
    const reasons: SponsorMatchReason[] = [];
    if (match.name_match) reasons.push("name");
    if (match.email_match) reasons.push("email");
    if (match.phone_match) reasons.push("phone");
    return [{ ...publicSponsor(sponsor), reasons, openSponsorships: sponsorships.map(publicSponsorship) }];
  });
}

// ---------------------------------------------------------------------------
// Escritura

/** Solo los nombres de los campos: los contactos del padrino no se copian a la auditoría. */
const auditFields = (input: SponsorInput) => ({ fields: Object.keys(input) });

export async function createSponsor(schoolId: string, actorId: string, input: SponsorInput) {
  const data = sponsorWriteData(input);
  const created = await prisma.$transaction(async (tx) => {
    const sponsor = await tx.sponsor.create({ data: { ...data, schoolId }, select: { id: true } });
    await tx.auditEvent.create({
      data: { userId: actorId, action: "CREATE", entityType: "Sponsor", entityId: sponsor.id, afterData: { type: data.type, ...auditFields(input) } },
    });
    return sponsor;
  });
  return getSponsor(schoolId, created.id);
}

export async function updateSponsor(schoolId: string, actorId: string, sponsorId: string, input: SponsorInput) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.sponsor.findFirst({ where: { id: sponsorId, schoolId, deletedAt: null }, select: sponsorSelect });
    if (!existing) throw fail(404, "Padrino no encontrado");
    if (input.active === false) await assertNoOpenSponsorships(tx, sponsorId);
    await tx.sponsor.update({ where: { id: sponsorId }, data: sponsorWriteData(input, existing) });
    await tx.auditEvent.create({
      data: { userId: actorId, action: "UPDATE", entityType: "Sponsor", entityId: sponsorId, beforeData: { active: existing.active }, afterData: auditFields(input) },
    });
  });
  return getSponsor(schoolId, sponsorId);
}

async function assertNoOpenSponsorships(tx: Prisma.TransactionClient, sponsorId: string) {
  const open = await tx.sponsorship.count({ where: { sponsorId, status: { in: [...OPEN_SPONSORSHIP_STATUSES] } } });
  if (open > 0) {
    throw fail(409, "El padrino tiene padrinazgos vigentes. Finalícelos o cancélelos antes de desactivarlo.");
  }
}

/**
 * Desactiva al padrino sin borrarlo: sigue apareciendo como posible duplicado y en el historial
 * de sus alumnos, y se puede reactivar con PATCH { active: true }.
 */
export async function deactivateSponsor(schoolId: string, actorId: string, sponsorId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.sponsor.findFirst({ where: { id: sponsorId, schoolId, deletedAt: null }, select: { active: true } });
    if (!existing) throw fail(404, "Padrino no encontrado");
    await assertNoOpenSponsorships(tx, sponsorId);
    await tx.sponsor.update({ where: { id: sponsorId }, data: { active: false } });
    await tx.auditEvent.create({
      data: { userId: actorId, action: "DELETE", entityType: "Sponsor", entityId: sponsorId, beforeData: { active: existing.active }, afterData: { active: false } },
    });
  });
  return getSponsor(schoolId, sponsorId);
}
