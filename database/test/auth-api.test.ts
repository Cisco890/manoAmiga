import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { verifyAccessToken } from "../src/auth/jwt";
import { prisma } from "../src/prisma";

const jwtSecret = "secreto-de-integracion-auth-con-mas-de-32-bytes";
process.env.JWT_ACCESS_SECRET = jwtSecret;
process.env.JWT_ISSUER = "mano-amiga-api";
process.env.JWT_AUDIENCE = "mano-amiga-web";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const { createApiServer } = await import("../src/server");
const server = createApiServer();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = {
  collaborator: `auth-collaborator-${suffix}@example.test`,
  locked: `auth-locked-${suffix}@example.test`,
  inactive: `auth-inactive-${suffix}@example.test`,
};
const password = "ClaveDePrueba-2026";
let baseUrl = "";
let collaboratorId = "";

before(async () => {
  const [school, collaboratorRole] = await Promise.all([
    prisma.school.findUnique({ where: { code: "MANO_AMIGA" }, select: { id: true } }),
    prisma.role.findUnique({ where: { code: "COLLABORATOR" }, select: { id: true } }),
  ]);
  assert.ok(school);
  assert.ok(collaboratorRole);
  const passwordHash = await bcrypt.hash(password, 4);
  const users = await Promise.all(
    Object.entries(emails).map(([key, email]) =>
      prisma.user.create({
        data: {
          schoolId: school.id,
          email,
          displayName: `Auth ${key}`,
          passwordHash,
          status: key === "inactive" ? "INACTIVE" : "ACTIVE",
          roles: { create: { roleId: collaboratorRole.id } },
        },
      }),
    ),
  );
  collaboratorId = users[0].id;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  await prisma.auditEvent.deleteMany({ where: { userId: { in: users.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
});

type AuthBody = {
  accessToken: string;
  expiresIn: number;
  user: { id: string; email: string; roles: string[]; permissions: string[] };
};

function login(email: string, loginPassword = password) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: loginPassword }),
  });
}

function refreshCookieFrom(response: Response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "la respuesta debe establecer la cookie de sesión");
  return header.split(";")[0];
}

const postWithCookie = (path: string, cookie: string) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: { Cookie: cookie } });

const me = (token: string) =>
  fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });

test("el login entrega un JWT con el contrato acordado y una cookie HttpOnly", async () => {
  const response = await login(emails.collaborator);
  assert.equal(response.status, 200);
  const body = (await response.json()) as AuthBody;

  assert.equal(body.expiresIn, 900);
  assert.equal(body.user.email, emails.collaborator);
  assert.deepEqual(body.user.roles, ["COLLABORATOR"]);
  assert.ok(!("passwordHash" in body.user));

  const claims = verifyAccessToken(body.accessToken, jwtSecret, "mano-amiga-api", "mano-amiga-web");
  assert.equal(claims.sub, collaboratorId);
  assert.equal(claims.name, "Auth collaborator");
  assert.deepEqual(claims.roles, ["COLLABORATOR"]);
  assert.deepEqual([...claims.permissions].sort(), [...body.user.permissions].sort());
  assert.ok(claims.permissions.includes("student.read"));
  assert.ok(!claims.permissions.includes("user.manage"));
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(typeof claims.sid, "string");
  assert.equal(typeof claims.schoolId, "string");

  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^ma_refresh=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\/api\/auth/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, new RegExp(body.accessToken.replace(/\./g, "\\.")));
});

test("rechaza credenciales inválidas sin revelar si el correo existe", async () => {
  const [wrongPassword, unknownEmail, inactive] = await Promise.all([
    login(emails.collaborator, "ClaveIncorrecta-2026"),
    login(`no-existe-${suffix}@example.test`),
    login(emails.inactive),
  ]);
  const messages = await Promise.all(
    [wrongPassword, unknownEmail, inactive].map(async (response) => {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
      return ((await response.json()) as { message: string }).message;
    }),
  );
  assert.equal(new Set(messages).size, 1);
});

test("las rutas protegidas exigen un JWT válido", async () => {
  const withoutToken = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(withoutToken.status, 401);

  const response = await login(emails.collaborator);
  const { accessToken } = (await response.json()) as AuthBody;
  assert.equal((await me(accessToken)).status, 200);

  const [header, payload, signature] = accessToken.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const escalated = Buffer.from(JSON.stringify({ ...claims, roles: ["ADMIN"] })).toString("base64url");
  assert.equal((await me(`${header}.${escalated}.${signature}`)).status, 401);
  assert.equal((await me("token-invalido")).status, 401);
});

test("el refresh rota la cookie y detecta la reutilización de una cookie anterior", async () => {
  const loginResponse = await login(emails.collaborator);
  const firstCookie = refreshCookieFrom(loginResponse);

  const refreshed = await postWithCookie("/api/auth/refresh", firstCookie);
  assert.equal(refreshed.status, 200);
  const secondCookie = refreshCookieFrom(refreshed);
  assert.notEqual(secondCookie, firstCookie);
  const { accessToken } = (await refreshed.json()) as AuthBody;
  assert.equal((await me(accessToken)).status, 200);

  const reused = await postWithCookie("/api/auth/refresh", firstCookie);
  assert.equal(reused.status, 401);
  assert.equal((await postWithCookie("/api/auth/refresh", secondCookie)).status, 401);
  assert.equal((await me(accessToken)).status, 401);
});

test("el logout revoca la sesión y sus JWT de acceso", async () => {
  const loginResponse = await login(emails.collaborator);
  const cookie = refreshCookieFrom(loginResponse);
  const { accessToken } = (await loginResponse.json()) as AuthBody;

  const logout = await postWithCookie("/api/auth/logout", cookie);
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await postWithCookie("/api/auth/refresh", cookie)).status, 401);
  assert.equal((await me(accessToken)).status, 401);
});

test("cinco intentos fallidos bloquean la cuenta temporalmente", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(emails.locked, "ClaveIncorrecta-2026")).status, 401);
  }
  assert.equal((await login(emails.locked)).status, 401);

  const locked = await prisma.user.findUniqueOrThrow({
    where: { email: emails.locked },
    select: { lockedUntil: true },
  });
  assert.ok(locked.lockedUntil && locked.lockedUntil > new Date());
});
