import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const secret = process.env.CUI_ENCRYPTION_KEY ?? process.env.JWT_ACCESS_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("CUI_ENCRYPTION_KEY o JWT_ACCESS_SECRET debe tener al menos 32 bytes");
  }
  return createHash("sha256").update(secret).digest();
}

export function normalizeCui(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCui(value: string) {
  const digits = normalizeCui(value);
  return digits.length >= 13 && digits.length <= 20;
}

export function hashCui(value: string) {
  const pepper = process.env.CUI_HASH_PEPPER ?? process.env.JWT_ACCESS_SECRET ?? "";
  return createHash("sha256").update(`${pepper}:${normalizeCui(value)}`).digest("hex");
}

export function encryptCui(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalizeCui(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptCui(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("CUI cifrado inválido");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskCui(digits: string) {
  if (digits.length < 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
