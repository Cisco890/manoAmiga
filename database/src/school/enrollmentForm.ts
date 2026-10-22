import type { EnrollmentStatus, Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { parseAuthorizedPickups, replaceStudentPickups } from "./authorizedPickups";
export { maxAuthorizedPickups } from "./authorizedPickups";

/**
 * Formulario de inscripción por pasos (MA-25).
 *
 * La secretaría completa la inscripción en varios pasos y guarda borradores parciales.
 * Antes de enviarla a PENDING_REVIEW, `missingEnrollmentFields` indica qué falta; la API
 * rechaza el envío con 422 mientras la lista no esté vacía.
 */

export const formSteps = [
  { id: "contact", label: "Contacto y salida" },
  { id: "household", label: "Hogar" },
  { id: "medical", label: "Salud" },
  { id: "signature", label: "Firma" },
] as const;

export type FormStepId = (typeof formSteps)[number]["id"];
export type MissingField = { step: FormStepId; field: string; label: string };

const editableStatuses: EnrollmentStatus[] = ["DRAFT", "INCOMPLETE"];

export type PersonNameInput = {
  givenNames: string;
  firstSurname: string;
  secondSurname: string | null;
};

export type EnrollmentFormData = {
  contact: {
    messageContactGivenNames: string | null;
    messageContactFirstSurname: string | null;
    messageContactSecondSurname: string | null;
    messageContactPhone: string | null;
    messageContactRelationship: string | null;
    mayLeaveAlone: boolean;
    authorizedPickups: Array<PersonNameInput & { relationship: string; phone: string | null }>;
  };
  household: {
    livesWithMother: boolean;
    livesWithFather: boolean;
    livesWithSiblings: boolean;
    livesWithUncles: boolean;
    livesWithFriends: boolean;
    livesWithGrandparents: boolean;
    livesWithOther: boolean;
    otherDetails: string | null;
    householdSize: number | null;
  } | null;
  medical: {
    bloodType: string | null;
    bloodTypeUnknown: boolean;
    hasDiseaseOrAllergy: boolean;
    diseaseOrAllergyDetails: string | null;
    hasMedicationAllergy: boolean;
    medicationAllergyDetails: string | null;
    vaccinationsComplete: boolean | null;
    missingVaccines: string | null;
  } | null;
  signature: {
    signerGivenNames: string | null;
    signerFirstSurname: string | null;
    signerSecondSurname: string | null;
    signerRelationship: string | null;
  };
};

const livesWithFields = [
  "livesWithMother",
  "livesWithFather",
  "livesWithSiblings",
  "livesWithUncles",
  "livesWithFriends",
  "livesWithGrandparents",
  "livesWithOther",
] as const;

const filled = (value: string | null | undefined) => Boolean(value?.trim());

/** Lista los campos obligatorios que faltan, en el orden de los pasos del formulario. */
export function missingEnrollmentFields(form: EnrollmentFormData): MissingField[] {
  const missing: MissingField[] = [];
  const add = (step: FormStepId, field: string, label: string) => missing.push({ step, field, label });

  const { contact } = form;
  if (!filled(contact.messageContactGivenNames)) {
    add("contact", "messageContactGivenNames", "Nombres del contacto para mensajes");
  }
  if (!filled(contact.messageContactFirstSurname)) {
    add("contact", "messageContactFirstSurname", "Primer apellido del contacto para mensajes");
  }
  if (!filled(contact.messageContactPhone)) add("contact", "messageContactPhone", "Teléfono del contacto para mensajes");
  if (!filled(contact.messageContactRelationship)) {
    add("contact", "messageContactRelationship", "Parentesco del contacto para mensajes");
  }
  if (!contact.mayLeaveAlone && contact.authorizedPickups.length === 0) {
    add("contact", "authorizedPickups", "Al menos una persona autorizada para recoger al alumno");
  }

  const household = form.household;
  if (!household || !livesWithFields.some((field) => household[field])) {
    add("household", "livesWith", "Con quién vive el alumno");
  }
  if (household?.livesWithOther && !filled(household.otherDetails)) {
    add("household", "otherDetails", "Detalle de con quién más vive el alumno");
  }
  if (!household?.householdSize) add("household", "householdSize", "Número de personas en el hogar");

  const medical = form.medical;
  if (!medical || (!filled(medical.bloodType) && !medical.bloodTypeUnknown)) {
    add("medical", "bloodType", "Tipo de sangre (o marcar que se desconoce)");
  }
  if (medical?.hasDiseaseOrAllergy && !filled(medical.diseaseOrAllergyDetails)) {
    add("medical", "diseaseOrAllergyDetails", "Detalle de enfermedades o alergias");
  }
  if (medical?.hasMedicationAllergy && !filled(medical.medicationAllergyDetails)) {
    add("medical", "medicationAllergyDetails", "Detalle de alergias a medicamentos");
  }
  if (medical?.vaccinationsComplete === false && !filled(medical.missingVaccines)) {
    add("medical", "missingVaccines", "Vacunas pendientes");
  }

  if (!filled(form.signature.signerGivenNames)) {
    add("signature", "signerGivenNames", "Nombres de quien firma la inscripción");
  }
  if (!filled(form.signature.signerFirstSurname)) {
    add("signature", "signerFirstSurname", "Primer apellido de quien firma la inscripción");
  }
  if (!filled(form.signature.signerRelationship)) {
    add("signature", "signerRelationship", "Parentesco de quien firma la inscripción");
  }

  return missing;
}

export class MissingFieldsError extends Error {
  readonly status = 422;
  constructor(readonly missingFields: MissingField[]) {
    super(
      `No se puede enviar a revisión: faltan ${missingFields.length} campo${missingFields.length === 1 ? "" : "s"} obligatorio${missingFields.length === 1 ? "" : "s"}.`,
    );
  }
}

const formSelect = {
  id: true,
  studentId: true,
  status: true,
  rejectionReason: true,
  messageContactGivenNames: true,
  messageContactFirstSurname: true,
  messageContactSecondSurname: true,
  messageContactPhone: true,
  messageContactRelationship: true,
  mayLeaveAlone: true,
  signerGivenNames: true,
  signerFirstSurname: true,
  signerSecondSurname: true,
  signerRelationship: true,
  householdProfile: {
    select: {
      livesWithMother: true,
      livesWithFather: true,
      livesWithSiblings: true,
      livesWithUncles: true,
      livesWithFriends: true,
      livesWithGrandparents: true,
      livesWithOther: true,
      otherDetails: true,
      householdSize: true,
    },
  },
  medicalProfile: {
    select: {
      bloodType: true,
      bloodTypeUnknown: true,
      hasDiseaseOrAllergy: true,
      diseaseOrAllergyDetails: true,
      hasMedicationAllergy: true,
      medicationAllergyDetails: true,
      vaccinationsComplete: true,
      missingVaccines: true,
    },
  },
  authorizedPickups: {
    where: { active: true },
    orderBy: [{ firstSurname: "asc" }, { secondSurname: "asc" }, { givenNames: "asc" }, { sortOrder: "asc" }],
    select: {
      givenNames: true,
      firstSurname: true,
      secondSurname: true,
      relationship: true,
      phone: true,
    },
  },
} as const satisfies Prisma.EnrollmentSelect;

type FormRow = Prisma.EnrollmentGetPayload<{ select: typeof formSelect }>;
type Client = Prisma.TransactionClient | typeof prisma;

function toFormData(row: FormRow): EnrollmentFormData {
  return {
    contact: {
      messageContactGivenNames: row.messageContactGivenNames,
      messageContactFirstSurname: row.messageContactFirstSurname,
      messageContactSecondSurname: row.messageContactSecondSurname,
      messageContactPhone: row.messageContactPhone,
      messageContactRelationship: row.messageContactRelationship,
      mayLeaveAlone: row.mayLeaveAlone,
      authorizedPickups: row.authorizedPickups.map((pickup) => ({
        givenNames: pickup.givenNames,
        firstSurname: pickup.firstSurname,
        secondSurname: pickup.secondSurname,
        relationship: pickup.relationship,
        phone: pickup.phone,
      })),
    },
    household: row.householdProfile,
    medical: row.medicalProfile,
    signature: {
      signerGivenNames: row.signerGivenNames,
      signerFirstSurname: row.signerFirstSurname,
      signerSecondSurname: row.signerSecondSurname,
      signerRelationship: row.signerRelationship,
    },
  };
}

async function findFormRow(client: Client, schoolId: string, enrollmentId: string) {
  const row = await client.enrollment.findFirst({
    where: { id: enrollmentId, student: { schoolId } },
    select: formSelect,
  });
  if (!row) throw Object.assign(new Error("Inscripción no encontrada"), { status: 404 });
  return row;
}

function publicForm(row: FormRow) {
  const form = toFormData(row);
  return {
    enrollmentId: row.id,
    status: row.status,
    rejectionReason: row.rejectionReason,
    editable: editableStatuses.includes(row.status),
    steps: formSteps,
    form,
    missingFields: missingEnrollmentFields(form),
  };
}

export async function getEnrollmentForm(schoolId: string, enrollmentId: string) {
  return publicForm(await findFormRow(prisma, schoolId, enrollmentId));
}

/** Se usa dentro de la transición a PENDING_REVIEW para validar con los datos ya confirmados. */
export async function assertEnrollmentFormComplete(client: Client, schoolId: string, enrollmentId: string) {
  const missing = missingEnrollmentFields(toFormData(await findFormRow(client, schoolId, enrollmentId)));
  if (missing.length > 0) throw new MissingFieldsError(missing);
}

// ---------------------------------------------------------------------------
// Guardado de borrador: valida tipos y longitudes, pero no exige campos obligatorios.

export type EnrollmentFormPatch = {
  contact?: Partial<EnrollmentFormData["contact"]>;
  household?: Partial<NonNullable<EnrollmentFormData["household"]>>;
  medical?: Partial<NonNullable<EnrollmentFormData["medical"]>>;
  signature?: Partial<EnrollmentFormData["signature"]>;
};

const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickFields(section: string, value: unknown, allowed: readonly string[]) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid(`${section} debe ser un objeto`);
  const unknownField = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknownField) throw invalid(`Campo no permitido en ${section}: ${unknownField}`);
  return value;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw invalid(`${label} debe ser texto`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw invalid(`${label} no puede superar ${max} caracteres`);
  return trimmed || null;
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

export function parseEnrollmentFormPatch(body: unknown) {
  if (!isRecord(body)) throw invalid("El cuerpo debe ser un objeto JSON");
  const sections = pickFields("el formulario", body, ["contact", "household", "medical", "signature"])!;

  const contactInput = pickFields("contact", sections.contact, [
    "messageContactGivenNames",
    "messageContactFirstSurname",
    "messageContactSecondSurname",
    "messageContactPhone",
    "messageContactRelationship",
    "mayLeaveAlone",
    "authorizedPickups",
  ]);
  const authorizedPickups = contactInput?.authorizedPickups === undefined
    ? undefined
    : parseAuthorizedPickups(contactInput.authorizedPickups);

  const contact = contactInput
    ? definedOnly({
        messageContactGivenNames: optionalText(
          contactInput.messageContactGivenNames,
          "Los nombres del contacto",
          120,
        ),
        messageContactFirstSurname: optionalText(
          contactInput.messageContactFirstSurname,
          "El primer apellido del contacto",
          80,
        ),
        messageContactSecondSurname: optionalText(
          contactInput.messageContactSecondSurname,
          "El segundo apellido del contacto",
          80,
        ),
        messageContactPhone: optionalText(contactInput.messageContactPhone, "El teléfono del contacto", 30),
        messageContactRelationship: optionalText(
          contactInput.messageContactRelationship,
          "El parentesco del contacto",
          80,
        ),
        mayLeaveAlone: optionalBoolean(contactInput.mayLeaveAlone, "Puede retirarse solo"),
        authorizedPickups,
      })
    : undefined;

  const householdInput = pickFields("household", sections.household, [...livesWithFields, "otherDetails", "householdSize"]);
  let householdSize: number | null | undefined;
  if (householdInput?.householdSize !== undefined && householdInput.householdSize !== null) {
    const size = householdInput.householdSize;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > 50) {
      throw invalid("El número de personas en el hogar debe ser un entero entre 1 y 50");
    }
    householdSize = size;
  } else if (householdInput?.householdSize === null) {
    householdSize = null;
  }
  const household = householdInput
    ? definedOnly({
        ...Object.fromEntries(
          livesWithFields.map((field) => [field, optionalBoolean(householdInput[field], field)]),
        ),
        otherDetails: optionalText(householdInput.otherDetails, "El detalle del hogar", 250),
        householdSize,
      })
    : undefined;

  const medicalInput = pickFields("medical", sections.medical, [
    "bloodType",
    "bloodTypeUnknown",
    "hasDiseaseOrAllergy",
    "diseaseOrAllergyDetails",
    "hasMedicationAllergy",
    "medicationAllergyDetails",
    "vaccinationsComplete",
    "missingVaccines",
  ]);
  let vaccinationsComplete: boolean | null | undefined;
  if (medicalInput?.vaccinationsComplete === null) vaccinationsComplete = null;
  else vaccinationsComplete = optionalBoolean(medicalInput?.vaccinationsComplete, "Vacunas completas");
  const medical = medicalInput
    ? definedOnly({
        bloodType: optionalText(medicalInput.bloodType, "El tipo de sangre", 10),
        bloodTypeUnknown: optionalBoolean(medicalInput.bloodTypeUnknown, "Tipo de sangre desconocido"),
        hasDiseaseOrAllergy: optionalBoolean(medicalInput.hasDiseaseOrAllergy, "Tiene enfermedades o alergias"),
        diseaseOrAllergyDetails: optionalText(medicalInput.diseaseOrAllergyDetails, "El detalle de enfermedades", 2000),
        hasMedicationAllergy: optionalBoolean(medicalInput.hasMedicationAllergy, "Tiene alergia a medicamentos"),
        medicationAllergyDetails: optionalText(
          medicalInput.medicationAllergyDetails,
          "El detalle de alergias a medicamentos",
          2000,
        ),
        vaccinationsComplete,
        missingVaccines: optionalText(medicalInput.missingVaccines, "Las vacunas pendientes", 2000),
      })
    : undefined;

  const signatureInput = pickFields("signature", sections.signature, [
    "signerGivenNames",
    "signerFirstSurname",
    "signerSecondSurname",
    "signerRelationship",
  ]);
  const signature = signatureInput
    ? definedOnly({
        signerGivenNames: optionalText(signatureInput.signerGivenNames, "Los nombres de quien firma", 120),
        signerFirstSurname: optionalText(signatureInput.signerFirstSurname, "El primer apellido de quien firma", 80),
        signerSecondSurname: optionalText(
          signatureInput.signerSecondSurname,
          "El segundo apellido de quien firma",
          80,
        ),
        signerRelationship: optionalText(signatureInput.signerRelationship, "El parentesco de quien firma", 80),
      })
    : undefined;

  return { contact, household, medical, signature };
}

export async function saveEnrollmentForm(
  schoolId: string,
  actorUserId: string,
  enrollmentId: string,
  patch: ReturnType<typeof parseEnrollmentFormPatch>,
) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await findFormRow(tx, schoolId, enrollmentId);
    if (!editableStatuses.includes(current.status)) {
      throw Object.assign(
        new Error("Solo se pueden editar inscripciones en Borrador o Incompleta"),
        { status: 409 },
      );
    }

    const { authorizedPickups, ...contactFields } = patch.contact ?? {};
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { ...contactFields, ...patch.signature },
    });
    if (authorizedPickups) {
      const latest = await tx.enrollment.findFirst({
        where: { studentId: current.studentId, status: { in: ["DRAFT", "INCOMPLETE", "PENDING_REVIEW", "APPROVED"] },
          academicCycle: { status: { not: "CLOSED" } } },
        orderBy: [{ academicCycle: { year: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (latest?.id === enrollmentId) await replaceStudentPickups(tx, current.studentId, authorizedPickups);
      await tx.authorizedPickup.deleteMany({ where: { enrollmentId } });
      if (authorizedPickups.length > 0) {
        await tx.authorizedPickup.createMany({
          data: authorizedPickups.map((pickup, index) => ({ ...pickup, enrollmentId, sortOrder: index + 1 })),
        });
      }
    }
    if (patch.household) {
      await tx.householdProfile.upsert({
        where: { enrollmentId },
        create: { enrollmentId, ...patch.household },
        update: patch.household,
      });
    }
    if (patch.medical) {
      await tx.medicalProfile.upsert({
        where: { enrollmentId },
        create: { enrollmentId, ...patch.medical },
        update: patch.medical,
      });
    }

    await tx.auditEvent.create({
      data: {
        userId: actorUserId,
        action: "UPDATE",
        entityType: "Enrollment",
        entityId: enrollmentId,
        // Solo se registran las secciones modificadas; los datos médicos no se copian a auditoría.
        afterData: { formSections: Object.keys(patch).filter((key) => patch[key as keyof typeof patch]) },
      },
    });

    return findFormRow(tx, schoolId, enrollmentId);
  });
  return publicForm(updated);
}
