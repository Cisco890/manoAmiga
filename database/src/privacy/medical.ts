import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado de los textos libres del perfil médico (MA-29), con AES-256-GCM en la aplicación.
 *
 * La clave sale de MEDICAL_ENCRYPTION_KEY, distinta de la del CUI. En desarrollo y CI se
 * deriva de JWT_ACCESS_SECRET para no exigir otra variable, pero con un prefijo propio, así
 * que nunca coincide con la clave del CUI. En producción debe definirse MEDICAL_ENCRYPTION_KEY.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function encryptionKey() {
  const dedicated = process.env.MEDICAL_ENCRYPTION_KEY;
  const secret = dedicated ?? process.env.JWT_ACCESS_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("MEDICAL_ENCRYPTION_KEY o JWT_ACCESS_SECRET debe tener al menos 32 bytes");
  }
  return createHash("sha256").update(dedicated ? secret : `medical-profile:${secret}`).digest();
}

export function isEncryptedMedicalText(value: string) {
  return value.startsWith(PREFIX);
}

export function encryptMedicalText(value: string): string;
export function encryptMedicalText(value: string | null): string | null;
export function encryptMedicalText(value: string | null | undefined): string | null | undefined;
export function encryptMedicalText(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Descifra un texto médico. Los datos guardados antes del cifrado (sin prefijo) se devuelven tal cual. */
export function decryptMedicalText(payload: string | null) {
  if (payload === null || !isEncryptedMedicalText(payload)) return payload;
  const [ivPart, tagPart, dataPart] = payload.slice(PREFIX.length).split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Texto médico cifrado inválido");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

/** Campos de medical_profiles que se guardan cifrados. */
export const encryptedMedicalFields = [
  "diseaseOrAllergyDetails",
  "medicationAllergyDetails",
  "missingVaccines",
  "emergencyMedicalNotes",
] as const;

type EncryptedField = (typeof encryptedMedicalFields)[number];

export function encryptMedicalFields<T extends Partial<Record<EncryptedField, string | null>>>(values: T): T {
  const result = { ...values };
  for (const field of encryptedMedicalFields) {
    if (field in result) (result as Record<string, unknown>)[field] = encryptMedicalText(result[field]);
  }
  return result;
}

export function decryptMedicalFields<T extends Record<EncryptedField, string | null>>(values: T): T {
  const result = { ...values };
  for (const field of encryptedMedicalFields) result[field] = decryptMedicalText(values[field]) as T[EncryptedField];
  return result;
}
