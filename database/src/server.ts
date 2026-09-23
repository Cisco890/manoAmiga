import "dotenv/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { signAccessToken, verifyAccessToken, type AccessTokenClaims } from "./auth/jwt";
import { openApiDocument, swaggerHtml } from "./openapi";

const port = Number(process.env.PORT ?? 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const jwtSecret = process.env.JWT_ACCESS_SECRET;
const jwtIssuer = process.env.JWT_ISSUER ?? "mano-amiga-api";
const jwtAudience = process.env.JWT_AUDIENCE ?? "mano-amiga-web";
const accessTokenLifetimeSeconds = 15 * 60;
const refreshTokenLifetimeSeconds = 7 * 24 * 60 * 60;
const refreshCookieName = "ma_refresh";
const secureCookies = process.env.NODE_ENV === "production";
const dummyPasswordHash = "$2b$12$HRhGbwGEB/X4S4BQOP1vc.VsKykaCpAPZVu0gW9RJasO.urr592sW";
const allowedRoles = ["ADMIN", "COLLABORATOR"] as const;
const allowedUserStatuses = ["ACTIVE", "INACTIVE"] as const;

if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
  throw new Error("JWT_ACCESS_SECRET debe existir y contener al menos 32 bytes");
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT debe ser un puerto válido");
}

const userSelect = {
  id: true,
  schoolId: true,
  email: true,
  displayName: true,
  status: true,
  deletedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  roles: {
    select: {
      role: {
        select: {
          code: true,
          name: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  },
} as const;

const managedUserSelect = {
  id: true,
  schoolId: true,
  email: true,
  displayName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

type AuthUser = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  status: string;
  deletedAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  roles: Array<{
    role: {
      code: string;
      name: string;
      permissions: Array<{ permission: { code: string } }>;
    };
  }>;
};

type Principal = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

type ManagedUser = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ role: { code: string; name: string } }>;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function principalFromUser(user: AuthUser): Principal {
  return {
    id: user.id,
    schoolId: user.schoolId,
    email: user.email,
    displayName: user.displayName,
    roles: [...new Set(user.roles.map(({ role }) => role.code))],
    permissions: [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ],
  };
}

function publicManagedUser(user: ManagedUser) {
  const role = user.roles[0]?.role;
  return {
    id: user.id,
    schoolId: user.schoolId,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    role: role ? { code: role.code, name: role.name } : null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hasPermission(principal: Principal, permission: string) {
  return principal.permissions.includes(permission);
}

function requirePermission(principal: Principal, permission: string) {
  if (!hasPermission(principal, permission)) {
    throw new HttpError(403, "No tienes permiso para realizar esta acción");
  }
}

function tokenFor(principal: Principal, sessionId: string) {
  return signAccessToken(
    {
      sub: principal.id,
      sid: sessionId,
      schoolId: principal.schoolId,
      name: principal.displayName,
      roles: principal.roles,
      permissions: principal.permissions,
    },
    jwtSecret!,
    jwtIssuer,
    jwtAudience,
    accessTokenLifetimeSeconds,
  );
}

function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function refreshTokensMatch(receivedToken: string, storedHash: string) {
  const receivedHash = Buffer.from(hashRefreshToken(receivedToken));
  const expectedHash = Buffer.from(storedHash);
  return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash);
}

function refreshCookie(sessionId: string, refreshToken: string) {
  return [
    `${refreshCookieName}=${encodeURIComponent(`${sessionId}.${refreshToken}`)}`,
    "HttpOnly",
    "Path=/api/auth",
    "SameSite=Lax",
    `Max-Age=${refreshTokenLifetimeSeconds}`,
    secureCookies ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function expiredRefreshCookie() {
  return [
    `${refreshCookieName}=`,
    "HttpOnly",
    "Path=/api/auth",
    "SameSite=Lax",
    "Max-Age=0",
    secureCookies ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function getCookie(request: IncomingMessage, name: string) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return undefined;
}

function parseRefreshCookie(request: IncomingMessage) {
  const cookie = getCookie(request, refreshCookieName);
  if (!cookie) throw new HttpError(401, "Sesión no disponible");
  const separator = cookie.indexOf(".");
  if (separator < 1) throw new HttpError(401, "Sesión no válida");
  return { sessionId: cookie.slice(0, separator), refreshToken: cookie.slice(separator + 1) };
}

function isAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin || origin === frontendOrigin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function responseHeaders(request: IncomingMessage) {
  const origin = request.headers.origin;
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    ...(origin && isAllowedOrigin(request) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  response.writeHead(status, {
    ...responseHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function sendHtml(request: IncomingMessage, response: ServerResponse, body: string) {
  response.writeHead(200, {
    ...responseHeaders(request),
    "Content-Security-Policy":
      "default-src 'none'; script-src https://unpkg.com 'unsafe-inline'; style-src https://unpkg.com 'unsafe-inline'; img-src data:; connect-src 'self'",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(body);
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new HttpError(413, "Solicitud demasiado grande");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "El cuerpo debe contener JSON válido");
  }
}

function bearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Autenticación requerida");
  return authorization.slice(7);
}

async function authenticatedPrincipal(request: IncomingMessage) {
  let claims: AccessTokenClaims;
  try {
    claims = verifyAccessToken(bearerToken(request), jwtSecret!, jwtIssuer, jwtAudience);
  } catch {
    throw new HttpError(401, "Sesión no válida o vencida");
  }

  const session = await prisma.userSession.findFirst({
    where: {
      id: claims.sid,
      userId: claims.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { user: { select: userSelect } },
  });
  if (!session || session.user.status !== "ACTIVE" || session.user.deletedAt) {
    throw new HttpError(401, "Sesión no válida o vencida");
  }
  return principalFromUser(session.user);
}

function authResponse(principal: Principal, sessionId: string) {
  return {
    accessToken: tokenFor(principal, sessionId),
    expiresIn: accessTokenLifetimeSeconds,
    user: principal,
  };
}

function isAllowedRole(value: unknown): value is (typeof allowedRoles)[number] {
  return typeof value === "string" && allowedRoles.some((role) => role === value);
}

function isAllowedUserStatus(value: unknown): value is (typeof allowedUserStatuses)[number] {
  return typeof value === "string" && allowedUserStatuses.some((status) => status === value);
}

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "El correo es obligatorio");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "El correo no es válido");
  }
  return email;
}

function normalizedDisplayName(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "El nombre es obligatorio");
  const displayName = value.trim();
  if (displayName.length < 2 || displayName.length > 160) {
    throw new HttpError(400, "El nombre debe contener entre 2 y 160 caracteres");
  }
  return displayName;
}

function validatedPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 12) {
    throw new HttpError(400, "La contraseña debe contener al menos 12 caracteres");
  }
  if (Buffer.byteLength(value, "utf8") > 72) {
    throw new HttpError(400, "La contraseña no puede superar 72 bytes");
  }
  return value;
}

function userIdFromPath(pathname: string) {
  const match = /^\/api\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
    pathname,
  );
  return match?.[1];
}

async function managedPrincipal(request: IncomingMessage) {
  const principal = await authenticatedPrincipal(request);
  requirePermission(principal, "user.manage");
  return principal;
}

async function listRoles(request: IncomingMessage, response: ServerResponse) {
  await managedPrincipal(request);
  const roles = await prisma.role.findMany({
    where: { code: { in: [...allowedRoles] } },
    select: { code: true, name: true, description: true },
    orderBy: { code: "asc" },
  });
  sendJson(request, response, 200, { data: roles });
}

async function listUsers(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  await managedPrincipal(request);
  const requestedPage = Number(url.searchParams.get("page") ?? 1);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    throw new HttpError(400, "page debe ser un entero positivo");
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    throw new HttpError(400, "limit debe ser un entero entre 1 y 100");
  }

  const search = url.searchParams.get("q")?.trim();
  const statusParameter = url.searchParams.get("status");
  const roleParameter = url.searchParams.get("role");
  if (statusParameter && !isAllowedUserStatus(statusParameter)) {
    throw new HttpError(400, "Estado no válido");
  }
  if (roleParameter && !isAllowedRole(roleParameter)) {
    throw new HttpError(400, "Rol no válido");
  }
  const status = statusParameter as (typeof allowedUserStatuses)[number] | null;
  const role = roleParameter as (typeof allowedRoles)[number] | null;

  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(role ? { roles: { some: { role: { code: role } } } } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { displayName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: managedUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * requestedLimit,
      take: requestedLimit,
    }),
    prisma.user.count({ where }),
  ]);

  sendJson(request, response, 200, {
    data: users.map(publicManagedUser),
    pagination: {
      page: requestedPage,
      limit: requestedLimit,
      total,
      pages: Math.ceil(total / requestedLimit),
    },
  });
}

async function getUser(request: IncomingMessage, response: ServerResponse, userId: string) {
  await managedPrincipal(request);
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: managedUserSelect,
  });
  if (!user) throw new HttpError(404, "Usuario no encontrado");
  sendJson(request, response, 200, { data: publicManagedUser(user) });
}

async function createUser(request: IncomingMessage, response: ServerResponse) {
  const principal = await managedPrincipal(request);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Datos de usuario no válidos");
  }
  const values = body as Record<string, unknown>;
  const allowedFields = new Set(["email", "displayName", "password", "role"]);
  if (Object.keys(values).some((field) => !allowedFields.has(field))) {
    throw new HttpError(400, "Campos de creación no válidos");
  }
  const email = normalizedEmail(values.email);
  const displayName = normalizedDisplayName(values.displayName);
  const password = validatedPassword(values.password);
  if (!isAllowedRole(values.role)) throw new HttpError(400, "Rol no válido");

  const [existing, role] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.role.findUnique({ where: { code: values.role }, select: { id: true } }),
  ]);
  if (existing) throw new HttpError(409, "Ya existe un usuario con ese correo");
  if (!role) throw new HttpError(400, "El rol solicitado no está configurado");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      schoolId: principal.schoolId,
      email,
      displayName,
      passwordHash,
      roles: { create: { roleId: role.id } },
    },
    select: managedUserSelect,
  });
  await prisma.auditEvent.create({
    data: {
      userId: principal.id,
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      afterData: { email, displayName, status: user.status, role: values.role },
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    },
  });
  sendJson(request, response, 201, { data: publicManagedUser(user) }, {
    Location: `/api/users/${user.id}`,
  });
}

async function updateUser(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const principal = await managedPrincipal(request);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Datos de usuario no válidos");
  }
  const values = body as Record<string, unknown>;
  const allowedFields = new Set(["email", "displayName", "role", "status"]);
  const fields = Object.keys(values);
  if (fields.length === 0 || fields.some((field) => !allowedFields.has(field))) {
    throw new HttpError(400, "Campos de actualización no válidos");
  }

  const current = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: managedUserSelect,
  });
  if (!current) throw new HttpError(404, "Usuario no encontrado");

  const email = values.email === undefined ? undefined : normalizedEmail(values.email);
  const displayName =
    values.displayName === undefined ? undefined : normalizedDisplayName(values.displayName);
  const roleCode = values.role;
  const status = values.status;
  if (roleCode !== undefined && !isAllowedRole(roleCode)) throw new HttpError(400, "Rol no válido");
  if (status !== undefined && !isAllowedUserStatus(status)) throw new HttpError(400, "Estado no válido");
  if (principal.id === userId && (roleCode === "COLLABORATOR" || status === "INACTIVE")) {
    throw new HttpError(400, "No puedes retirar tu propio acceso administrativo");
  }

  if (email && email !== current.email) {
    const duplicate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (duplicate) throw new HttpError(409, "Ya existe un usuario con ese correo");
  }
  const role = roleCode
    ? await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } })
    : null;
  if (roleCode && !role) throw new HttpError(400, "El rol solicitado no está configurado");

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: userId },
      data: {
        ...(email ? { email } : {}),
        ...(displayName ? { displayName } : {}),
        ...(status ? { status } : {}),
      },
    });
    if (role) {
      await transaction.userRole.deleteMany({ where: { userId } });
      await transaction.userRole.create({ data: { userId, roleId: role.id } });
    }
    if (status === "INACTIVE") {
      await transaction.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: managedUserSelect,
    });
  });

  await prisma.auditEvent.create({
    data: {
      userId: principal.id,
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      beforeData: {
        email: current.email,
        displayName: current.displayName,
        status: current.status,
        role: current.roles[0]?.role.code ?? null,
      },
      afterData: {
        email: updated.email,
        displayName: updated.displayName,
        status: updated.status,
        role: updated.roles[0]?.role.code ?? null,
      },
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    },
  });
  sendJson(request, response, 200, { data: publicManagedUser(updated) });
}

async function deactivateUser(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const principal = await managedPrincipal(request);
  if (principal.id === userId) throw new HttpError(400, "No puedes desactivar tu propia cuenta");
  const current = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!current) throw new HttpError(404, "Usuario no encontrado");

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "INACTIVE" } }),
    prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: {
        userId: principal.id,
        action: "DELETE",
        entityType: "User",
        entityId: userId,
        beforeData: { status: current.status },
        afterData: { status: "INACTIVE" },
        ipAddress: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"],
      },
    }),
  ]);
  response.writeHead(204, responseHeaders(request));
  response.end();
}

async function login(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") throw new HttpError(400, "Credenciales inválidas");
  const { email, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 254 ||
    password.length > 200
  ) {
    throw new HttpError(400, "Credenciales inválidas");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { ...userSelect, passwordHash: true },
  });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);
  const now = new Date();

  if (
    !user ||
    !passwordMatches ||
    user.status !== "ACTIVE" ||
    user.deletedAt ||
    (user.lockedUntil && user.lockedUntil > now)
  ) {
    if (user && !passwordMatches && user.status === "ACTIVE" && !user.deletedAt) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
        },
      });
    }
    throw new HttpError(401, "Correo o contraseña incorrectos");
  }

  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(now.getTime() + refreshTokenLifetimeSeconds * 1000);
  const [, session] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    }),
    prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt,
        ipAddress: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"],
      },
    }),
  ]);

  const principal = principalFromUser(user);
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entityType: "UserSession",
      entityId: session.id,
      ipAddress: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"],
    },
  });
  sendJson(request, response, 200, authResponse(principal, session.id), {
    "Set-Cookie": refreshCookie(session.id, refreshToken),
  });
}

async function refresh(request: IncomingMessage, response: ServerResponse) {
  const { sessionId, refreshToken } = parseRefreshCookie(request);
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      refreshTokenHash: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: userSelect },
    },
  });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now) {
    throw new HttpError(401, "Sesión no válida o vencida");
  }
  if (!refreshTokensMatch(refreshToken, session.refreshTokenHash)) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
    throw new HttpError(401, "Sesión no válida o vencida");
  }
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) {
    throw new HttpError(401, "Sesión no válida o vencida");
  }

  const rotatedToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(now.getTime() + refreshTokenLifetimeSeconds * 1000);
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashRefreshToken(rotatedToken), expiresAt },
  });

  const principal = principalFromUser(session.user);
  sendJson(request, response, 200, authResponse(principal, session.id), {
    "Set-Cookie": refreshCookie(session.id, rotatedToken),
  });
}

async function logout(request: IncomingMessage, response: ServerResponse) {
  try {
    const { sessionId } = parseRefreshCookie(request);
    await prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Cerrar sesión es idempotente, incluso si la cookie ya no es válida.
  }
  response.writeHead(204, { ...responseHeaders(request), "Set-Cookie": expiredRefreshCookie() });
  response.end();
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "OPTIONS") {
    response.writeHead(204, responseHeaders(request));
    return response.end();
  }
  if (["POST", "PATCH", "DELETE"].includes(request.method ?? "") && !isAllowedOrigin(request)) {
    throw new HttpError(403, "Origen no permitido");
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(request, response, 200, { status: "ok" });
  }
  if (request.method === "GET" && url.pathname === "/api/openapi.json") {
    return sendJson(request, response, 200, openApiDocument);
  }
  if (request.method === "GET" && url.pathname === "/api/docs") {
    return sendHtml(request, response, swaggerHtml);
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    return login(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/auth/refresh") {
    return refresh(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    return logout(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const principal = await authenticatedPrincipal(request);
    return sendJson(request, response, 200, { user: principal });
  }
  if (request.method === "GET" && url.pathname === "/api/roles") {
    return listRoles(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/users") {
    return listUsers(request, response, url);
  }
  if (request.method === "POST" && url.pathname === "/api/users") {
    return createUser(request, response);
  }
  const userId = userIdFromPath(url.pathname);
  if (userId && request.method === "GET") {
    return getUser(request, response, userId);
  }
  if (userId && request.method === "PATCH") {
    return updateUser(request, response, userId);
  }
  if (userId && request.method === "DELETE") {
    return deactivateUser(request, response, userId);
  }
  throw new HttpError(404, "Ruta no encontrada");
}

export function createApiServer() {
  return createServer((request, response) => {
    void route(request, response).catch((error: unknown) => {
      if (error instanceof HttpError) {
        return sendJson(request, response, error.status, { message: error.message });
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
      ) {
        return sendJson(request, response, 409, { message: "El registro ya existe" });
      }
      console.error(error);
      return sendJson(request, response, 500, { message: "Error interno del servidor" });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApiServer();
  server.listen(port, () => {
    console.info(`API Mano Amiga disponible en http://localhost:${port}`);
  });

  async function shutdown() {
    server.close();
    await prisma.$disconnect();
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
