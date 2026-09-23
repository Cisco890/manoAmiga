import { createHmac, timingSafeEqual } from "node:crypto";

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  schoolId: string;
  name: string;
  roles: string[];
  permissions: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

type SignAccessTokenInput = Omit<AccessTokenClaims, "iss" | "aud" | "iat" | "exp">;

const encode = (value: object | string) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

function signatureFor(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function signAccessToken(
  input: SignAccessTokenInput,
  secret: string,
  issuer: string,
  audience: string,
  lifetimeSeconds = 15 * 60,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    ...input,
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + lifetimeSeconds,
  });
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${signatureFor(unsignedToken, secret)}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  issuer: string,
  audience: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token inválido");

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  if (!signaturesMatch(signature, signatureFor(unsignedToken, secret))) {
    throw new Error("Firma inválida");
  }

  let header: { alg?: unknown; typ?: unknown };
  let payload: Partial<AccessTokenClaims>;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Token inválido");
  }

  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("Algoritmo inválido");
  if (payload.iss !== issuer || payload.aud !== audience) throw new Error("Emisor inválido");
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new Error("Token vencido");
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 30) throw new Error("Token inválido");
  if (
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.schoolId !== "string" ||
    typeof payload.name !== "string" ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every((role) => typeof role === "string") ||
    !Array.isArray(payload.permissions) ||
    !payload.permissions.every((permission) => typeof permission === "string")
  ) {
    throw new Error("Contenido del token inválido");
  }

  return payload as AccessTokenClaims;
}
