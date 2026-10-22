import type { GuardianRelationship, Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { decryptCui, encryptCui, hashCui, isValidCui, maskCui, normalizeCui } from "../privacy/cui";
import { buildFullName, buildSearchName } from "./personName";

/**
 * Padres, madres y tutores reutilizables entre hermanos (MA-27).
 *
 * Un guardián se registra una sola vez y se vincula a cada alumno con su parentesco,
 * convivencia y responsabilidad principal (tabla student_guardians). El DPI se cifra con
 * AES-256-GCM y se busca por hash, igual que el CUI del alumno.
 */

export const guardianRelationships = ["MOTHER", "FATHER", "TUTOR", "GRANDPARENT", "SIBLING", "OTHER"] as const;

type Client = Prisma.TransactionClient | typeof prisma;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const invalid = (message: string) => fail(400, message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(section: string, value: Record<string, unknown>, allowed: readonly string[]) {
  const unknownField = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknownField) throw invalid(`Campo no permitido en ${section}: ${unknownField}`);
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw invalid(`${label} debe ser texto`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw invalid(`${label} no puede superar ${max} caracteres`);
  return trimmed || null;
}

function requiredText(value: unknown, label: string, max: number) {
  const text = optionalText(value, label, max);
  if (!text) throw invalid(`${label} es obligatorio`);
  return text;
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw invalid(`${label} debe ser verdadero o falso`);
  return value;
}

function definedOnly<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

// ---------------------------------------------------------------------------
// Datos personales del guardián

const guardianFields = [
  "givenNames",
  "firstSurname",
  "secondSurname",
  "marriedSurname",
  "dpi",
  "mobilePhone",
  "homePhone",
  "primaryEmail",
  "occupation",
  "workplaceName",
  "workplacePhone",
] as const;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida los datos del guardián. Con `partial`, los campos ausentes se conservan. */
export function parseGuardianInput(body: unknown, partial = false) {
  if (!isRecord(body)) throw invalid("Los datos del responsable deben ser un objeto");
  rejectUnknown("responsable", body, guardianFields);

  const name = (field: "givenNames" | "firstSurname", label: string, max: number) =>
    partial && body[field] === undefined ? undefined : requiredText(body[field], label, max);
  const primaryEmail = optionalText(body.primaryEmail, "El correo", 254);
  if (primaryEmail && !emailRe.test(primaryEmail)) throw invalid("El correo no es válido");

  let dpiEncrypted: string | null | undefined;
  let dpiHash: string | null | undefined;
  const dpi = optionalText(body.dpi, "El DPI", 25);
  if (dpi === null) {
    dpiEncrypted = null;
    dpiHash = null;
  } else if (dpi !== undefined) {
    if (!isValidCui(dpi)) throw invalid("El DPI debe contener entre 13 y 20 dígitos");
    dpiEncrypted = encryptCui(normalizeCui(dpi));
    dpiHash = hashCui(dpi);
  }

  return definedOnly({
    givenNames: name("givenNames", "Los nombres del responsable", 120),
    firstSurname: name("firstSurname", "El primer apellido del responsable", 80),
    secondSurname: optionalText(body.secondSurname, "El segundo apellido", 80),
    marriedSurname: optionalText(body.marriedSurname, "El apellido de casada", 80),
    mobilePhone: optionalText(body.mobilePhone, "El celular", 30),
    homePhone: optionalText(body.homePhone, "El teléfono de casa", 30),
    primaryEmail,
    occupation: optionalText(body.occupation, "La ocupación", 120),
    workplaceName: optionalText(body.workplaceName, "El lugar de trabajo", 180),
    workplacePhone: optionalText(body.workplacePhone, "El teléfono del trabajo", 30),
    dpiEncrypted,
    dpiHash,
  });
}

export type GuardianInput = ReturnType<typeof parseGuardianInput>;

const guardianSelect = {
  id: true,
  givenNames: true,
  firstSurname: true,
  secondSurname: true,
  marriedSurname: true,
  dpiEncrypted: true,
  mobilePhone: true,
  homePhone: true,
  primaryEmail: true,
  occupation: true,
  workplaceName: true,
  workplacePhone: true,
} as const satisfies Prisma.GuardianSelect;

type GuardianRow = Prisma.GuardianGetPayload<{ select: typeof guardianSelect }>;

function maskedDpi(encrypted: string | null) {
  if (!encrypted) return null;
  try {
    return maskCui(decryptCui(encrypted));
  } catch {
    return "****";
  }
}

function publicGuardian(row: GuardianRow) {
  const { dpiEncrypted, ...fields } = row;
  return {
    ...fields,
    fullName: buildFullName(row.givenNames, row.firstSurname, row.secondSurname),
    dpiMasked: maskedDpi(dpiEncrypted),
    hasDpi: Boolean(dpiEncrypted),
  };
}

const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Vínculos vigentes: activos, ya iniciados y sin terminar. */
const currentLinkWhere = (): Prisma.StudentGuardianWhereInput => ({
  active: true,
  startDate: { lte: today() },
  OR: [{ endDate: null }, { endDate: { gte: today() } }],
});

/** Alumnos del colegio vinculados a cada guardián (hermanos que comparten responsable). */
const linkedStudentsSelect = (schoolId: string) => ({
  where: { ...currentLinkWhere(), student: { schoolId, deletedAt: null } },
  orderBy: { createdAt: "asc" as const },
  select: {
    relationship: true,
    student: { select: { id: true, studentCode: true, givenNames: true, firstSurname: true, secondSurname: true } },
  },
});

function publicLinkedStudent(link: {
  relationship: GuardianRelationship;
  student: { id: string; studentCode: string; givenNames: string; firstSurname: string; secondSurname: string | null };
}) {
  return {
    id: link.student.id,
    studentCode: link.student.studentCode,
    fullName: buildFullName(link.student.givenNames, link.student.firstSurname, link.student.secondSurname),
    relationship: link.relationship,
  };
}

/** Un guardián pertenece al colegio si está vinculado a algún alumno de ese colegio. */
const guardianInSchool = (schoolId: string): Prisma.GuardianWhereInput => ({
  deletedAt: null,
  studentLinks: { some: { student: { schoolId } } },
});

export async function searchGuardians(schoolId: string, q: string) {
  const query = q.trim();
  if (query.length < 2) throw invalid("La búsqueda debe tener al menos 2 caracteres");
  const tokens = query.split(/\s+/).filter(Boolean);
  const rows = await prisma.guardian.findMany({
    where: {
      ...guardianInSchool(schoolId),
      active: true,
      OR: [
        { AND: tokens.map((token) => ({ searchName: { contains: token, mode: "insensitive" as const } })) },
        ...(/^[\d\s-]+$/.test(query) && isValidCui(query) ? [{ dpiHash: hashCui(query) }] : []),
      ],
    },
    orderBy: [{ firstSurname: "asc" }, { secondSurname: "asc" }, { givenNames: "asc" }],
    take: 10,
    select: { ...guardianSelect, studentLinks: linkedStudentsSelect(schoolId) },
  });
  return rows.map(({ studentLinks, ...guardian }) => ({
    ...publicGuardian(guardian),
    students: studentLinks.map(publicLinkedStudent),
  }));
}

async function assertUniqueDpi(client: Client, dpiHash: string | null | undefined, exceptGuardianId?: string) {
  if (!dpiHash) return;
  const duplicate = await client.guardian.findFirst({
    where: { dpiHash, deletedAt: null, ...(exceptGuardianId ? { id: { not: exceptGuardianId } } : {}) },
    select: { id: true },
  });
  if (duplicate) {
    throw fail(409, "Ya existe un responsable con ese DPI. Búsquelo por DPI y vincúlelo al alumno.");
  }
}

function guardianWriteData(input: GuardianInput, existing?: GuardianRow) {
  const givenNames = input.givenNames ?? existing?.givenNames ?? "";
  const firstSurname = input.firstSurname ?? existing?.firstSurname ?? "";
  const secondSurname = input.secondSurname === undefined ? existing?.secondSurname ?? null : input.secondSurname;
  const marriedSurname = input.marriedSurname === undefined ? existing?.marriedSurname ?? null : input.marriedSurname;
  return {
    ...input,
    searchName: [buildSearchName(givenNames, firstSurname, secondSurname), marriedSurname].filter(Boolean).join(" "),
  };
}

export async function updateGuardian(schoolId: string, actorId: string, guardianId: string, input: GuardianInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.guardian.findFirst({
      where: { id: guardianId, ...guardianInSchool(schoolId) },
      select: guardianSelect,
    });
    if (!existing) throw fail(404, "Responsable no encontrado");
    await assertUniqueDpi(tx, input.dpiHash, guardianId);
    const updated = await tx.guardian.update({
      where: { id: guardianId },
      data: guardianWriteData(input, existing),
      select: guardianSelect,
    });
    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "UPDATE",
        entityType: "Guardian",
        entityId: guardianId,
        // Solo los nombres de los campos: el DPI y los contactos no se copian a auditoría.
        afterData: { fields: Object.keys(input).filter((key) => key !== "dpiHash") },
      },
    });
    return publicGuardian(updated);
  });
}

// ---------------------------------------------------------------------------
// Vínculos alumno ↔ guardián

const linkFields = [
  "relationship",
  "customRelationship",
  "livesWithStudent",
  "primaryContact",
  "legalRepresentative",
  "authorizedForSchoolProcedures",
] as const;

export function parseLinkInput(body: Record<string, unknown>, partial = false) {
  const relationship = body.relationship;
  if (relationship !== undefined || !partial) {
    if (!guardianRelationships.includes(relationship as GuardianRelationship)) {
      throw invalid("Parentesco no válido");
    }
  }
  return definedOnly({
    relationship: relationship as GuardianRelationship | undefined,
    customRelationship: optionalText(body.customRelationship, "El parentesco personalizado", 80),
    livesWithStudent: optionalBoolean(body.livesWithStudent, "Vive con el alumno"),
    primaryContact: optionalBoolean(body.primaryContact, "Responsable principal"),
    legalRepresentative: optionalBoolean(body.legalRepresentative, "Representante legal"),
    authorizedForSchoolProcedures: optionalBoolean(
      body.authorizedForSchoolProcedures,
      "Autorizado para trámites escolares",
    ),
  });
}

export type LinkInput = ReturnType<typeof parseLinkInput>;

/** Cuerpo de POST /students/:id/guardians: un guardián existente (guardianId) o uno nuevo (guardian). */
export function parseNewLinkBody(body: unknown) {
  if (!isRecord(body)) throw invalid("El cuerpo debe ser un objeto JSON");
  rejectUnknown("el vínculo", body, ["guardianId", "guardian", ...linkFields]);
  const hasId = body.guardianId !== undefined;
  const hasNew = body.guardian !== undefined;
  if (hasId === hasNew) throw invalid("Indique guardianId para reutilizar un responsable o guardian para registrar uno nuevo");
  if (hasId && (typeof body.guardianId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.guardianId))) {
    throw invalid("guardianId no es válido");
  }
  return {
    guardianId: hasId ? (body.guardianId as string) : undefined,
    guardian: hasNew ? parseGuardianInput(body.guardian) : undefined,
    link: parseLinkInput(body),
  };
}

function checkCustomRelationship(relationship: GuardianRelationship, customRelationship: string | null | undefined) {
  if (relationship === "OTHER" && !customRelationship) {
    throw invalid("Indique el parentesco cuando selecciona Otro");
  }
}

const linkSelect = (schoolId: string) => ({
  id: true,
  relationship: true,
  customRelationship: true,
  livesWithStudent: true,
  primaryContact: true,
  legalRepresentative: true,
  authorizedForSchoolProcedures: true,
  startDate: true,
  studentId: true,
  guardian: { select: { ...guardianSelect, studentLinks: linkedStudentsSelect(schoolId) } },
}) satisfies Prisma.StudentGuardianSelect;

type LinkRow = Prisma.StudentGuardianGetPayload<{ select: ReturnType<typeof linkSelect> }>;

function publicLink(row: LinkRow) {
  const { studentLinks, ...guardian } = row.guardian;
  return {
    id: row.id,
    relationship: row.relationship,
    customRelationship: row.customRelationship,
    livesWithStudent: row.livesWithStudent,
    primaryContact: row.primaryContact,
    legalRepresentative: row.legalRepresentative,
    authorizedForSchoolProcedures: row.authorizedForSchoolProcedures,
    startDate: row.startDate.toISOString().slice(0, 10),
    guardian: publicGuardian(guardian),
    // Hermanos: otros alumnos que comparten este responsable.
    otherStudents: studentLinks
      .filter((link) => link.student.id !== row.studentId)
      .map(publicLinkedStudent),
  };
}

async function lockStudent(tx: Prisma.TransactionClient, schoolId: string, studentId: string) {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } });
  if (!student) throw fail(404, "Alumno no encontrado");
  // Serializa los cambios de vínculos del alumno para no dejar dos responsables principales.
  await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
}

async function clearOtherPrimaries(tx: Prisma.TransactionClient, studentId: string, keepLinkId?: string) {
  await tx.studentGuardian.updateMany({
    where: { studentId, active: true, primaryContact: true, ...(keepLinkId ? { id: { not: keepLinkId } } : {}) },
    data: { primaryContact: false },
  });
}

export async function listStudentGuardians(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } });
  if (!student) throw fail(404, "Alumno no encontrado");
  const rows = await prisma.studentGuardian.findMany({
    where: { studentId, ...currentLinkWhere(), guardian: { active: true, deletedAt: null } },
    orderBy: [{ primaryContact: "desc" }, { createdAt: "asc" }],
    select: linkSelect(schoolId),
  });
  return rows.map(publicLink);
}

export async function linkGuardian(
  schoolId: string,
  actorId: string,
  studentId: string,
  input: ReturnType<typeof parseNewLinkBody>,
) {
  const relationship = input.link.relationship!;
  checkCustomRelationship(relationship, input.link.customRelationship);

  return prisma.$transaction(async (tx) => {
    await lockStudent(tx, schoolId, studentId);

    let guardianId = input.guardianId;
    if (guardianId) {
      const existing = await tx.guardian.findFirst({
        where: { id: guardianId, active: true, ...guardianInSchool(schoolId) },
        select: { id: true },
      });
      if (!existing) throw fail(404, "Responsable no encontrado");
    } else {
      await assertUniqueDpi(tx, input.guardian!.dpiHash);
      const data = guardianWriteData(input.guardian!);
      guardianId = (await tx.guardian.create({
        data: { ...data, givenNames: data.givenNames!, firstSurname: data.firstSurname! },
        select: { id: true },
      })).id;
    }

    const activeLink = await tx.studentGuardian.findFirst({
      where: { studentId, guardianId, active: true },
      select: { id: true },
    });
    if (activeLink) throw fail(409, "Este responsable ya está vinculado al alumno");

    // El primer responsable vigente queda como principal si no se indica otra cosa.
    const hasPrimary = await tx.studentGuardian.count({ where: { studentId, active: true, primaryContact: true } });
    const primaryContact = input.link.primaryContact ?? hasPrimary === 0;
    if (primaryContact) await clearOtherPrimaries(tx, studentId);

    const data = {
      ...input.link,
      relationship,
      customRelationship: relationship === "OTHER" ? input.link.customRelationship ?? null : null,
      primaryContact,
      active: true,
      startDate: today(),
      endDate: null,
    };
    // Un vínculo terminado con el mismo parentesco se reactiva (la tabla lo exige único).
    const link = await tx.studentGuardian.upsert({
      where: { studentId_guardianId_relationship: { studentId, guardianId, relationship } },
      create: { ...data, studentId, guardianId },
      update: data,
      select: { id: true },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "CREATE",
        entityType: "StudentGuardian",
        entityId: link.id,
        afterData: { studentId, guardianId, relationship, primaryContact, reused: Boolean(input.guardianId) },
      },
    });
    return publicLink(await tx.studentGuardian.findUniqueOrThrow({ where: { id: link.id }, select: linkSelect(schoolId) }));
  });
}

async function findActiveLink(tx: Prisma.TransactionClient, studentId: string, linkId: string) {
  const link = await tx.studentGuardian.findFirst({
    where: { id: linkId, studentId, active: true },
    select: { id: true, relationship: true, customRelationship: true, primaryContact: true },
  });
  if (!link) throw fail(404, "Vínculo con el responsable no encontrado");
  return link;
}

export async function updateGuardianLink(
  schoolId: string,
  actorId: string,
  studentId: string,
  linkId: string,
  input: LinkInput,
) {
  return prisma.$transaction(async (tx) => {
    await lockStudent(tx, schoolId, studentId);
    const current = await findActiveLink(tx, studentId, linkId);
    const relationship = input.relationship ?? current.relationship;
    const customRelationship =
      input.customRelationship === undefined ? current.customRelationship : input.customRelationship;
    checkCustomRelationship(relationship, customRelationship);
    if (input.primaryContact) await clearOtherPrimaries(tx, studentId, linkId);

    try {
      await tx.studentGuardian.update({
        where: { id: linkId },
        data: { ...input, customRelationship: relationship === "OTHER" ? customRelationship : null },
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw fail(409, "El responsable ya tiene un vínculo con ese parentesco");
      }
      throw error;
    }

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "UPDATE",
        entityType: "StudentGuardian",
        entityId: linkId,
        beforeData: { relationship: current.relationship, primaryContact: current.primaryContact },
        afterData: { ...input },
      },
    });
    return publicLink(await tx.studentGuardian.findUniqueOrThrow({ where: { id: linkId }, select: linkSelect(schoolId) }));
  });
}

/** Termina el vínculo sin borrarlo: el historial conserva quién fue responsable y hasta cuándo. */
export async function unlinkGuardian(schoolId: string, actorId: string, studentId: string, linkId: string) {
  await prisma.$transaction(async (tx) => {
    await lockStudent(tx, schoolId, studentId);
    const current = await findActiveLink(tx, studentId, linkId);
    await tx.studentGuardian.update({
      where: { id: linkId },
      data: { active: false, primaryContact: false, endDate: today() },
    });
    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "DELETE",
        entityType: "StudentGuardian",
        entityId: linkId,
        beforeData: { relationship: current.relationship, primaryContact: current.primaryContact },
      },
    });
  });
}

/** Para la validación de la inscripción (MA-25): ¿el alumno tiene un responsable principal vigente? */
export async function hasPrimaryGuardian(client: Client, studentId: string) {
  const count = await client.studentGuardian.count({
    where: { studentId, primaryContact: true, ...currentLinkWhere(), guardian: { active: true, deletedAt: null } },
  });
  return count > 0;
}
