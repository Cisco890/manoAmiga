import assert from "node:assert/strict";
import { test } from "node:test";
import { signAccessToken, verifyAccessToken } from "../src/auth/jwt";

const secret = "una-clave-de-prueba-con-mas-de-32-caracteres";
const claims = {
  sub: "usuario-1",
  sid: "sesion-1",
  schoolId: "colegio-1",
  name: "Usuario de prueba",
  roles: ["COLLABORATOR"],
  permissions: ["student.read"],
};

test("firma y valida un JWT de acceso", () => {
  const token = signAccessToken(claims, secret, "mano-amiga", "mano-amiga-web", 900, 1_000);
  const payload = verifyAccessToken(token, secret, "mano-amiga", "mano-amiga-web", 1_001);

  assert.equal(payload.sub, claims.sub);
  assert.deepEqual(payload.roles, claims.roles);
  assert.equal(payload.exp, 1_900);
});

test("rechaza tokens alterados o vencidos", () => {
  const token = signAccessToken(claims, secret, "mano-amiga", "mano-amiga-web", 10, 1_000);
  const altered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

  assert.throws(() => verifyAccessToken(altered, secret, "mano-amiga", "mano-amiga-web", 1_001));
  assert.throws(() => verifyAccessToken(token, secret, "mano-amiga", "mano-amiga-web", 1_010));
});
