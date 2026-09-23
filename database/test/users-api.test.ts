import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";

process.env.JWT_ACCESS_SECRET = "secreto-de-integracion-con-mas-de-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const { createApiServer } = await import("../src/server");
const server = createApiServer();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `admin-api-${suffix}@example.test`;
const collaboratorEmail = `collaborator-api-${suffix}@example.test`;
const createdEmail = `created-api-${suffix}@example.test`;
const password = "ClaveDePrueba-2026";
let baseUrl = "";
const testUserIds: string[] = [];

before(async () => {
  const [school, adminRole, collaboratorRole] = await Promise.all([
    prisma.school.findUnique({ where: { code: "MANO_AMIGA" }, select: { id: true } }),
    prisma.role.findUnique({ where: { code: "ADMIN" }, select: { id: true } }),
    prisma.role.findUnique({ where: { code: "COLLABORATOR" }, select: { id: true } }),
  ]);
  assert.ok(school);
  assert.ok(adminRole);
  assert.ok(collaboratorRole);
  const passwordHash = await bcrypt.hash(password, 4);
  const [admin, collaborator] = await Promise.all([
    prisma.user.create({
      data: {
        schoolId: school.id,
        email: adminEmail,
        displayName: "Admin API Test",
        passwordHash,
        roles: { create: { roleId: adminRole.id } },
      },
    }),
    prisma.user.create({
      data: {
        schoolId: school.id,
        email: collaboratorEmail,
        displayName: "Collaborator API Test",
        passwordHash,
        roles: { create: { roleId: collaboratorRole.id } },
      },
    }),
  ]);
  testUserIds.push(admin.id, collaborator.id);

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
  await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { userId: { in: testUserIds } },
        { entityType: "User", entityId: { in: testUserIds } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, collaboratorEmail, createdEmail] } },
  });
  await prisma.$disconnect();
});

async function login(email: string, origin?: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("documenta y protege el CRUD REST de usuarios", async () => {
  const [openApiResponse, swaggerResponse] = await Promise.all([
    fetch(`${baseUrl}/api/openapi.json`),
    fetch(`${baseUrl}/api/docs`),
  ]);
  assert.equal(openApiResponse.status, 200);
  const openApi = (await openApiResponse.json()) as { paths: Record<string, unknown> };
  assert.ok(openApi.paths["/api/users"]);
  assert.ok(openApi.paths["/api/users/{userId}"]);
  assert.equal(swaggerResponse.status, 200);
  assert.match(await swaggerResponse.text(), /SwaggerUIBundle/);

  const withoutToken = await fetch(`${baseUrl}/api/users`);
  assert.equal(withoutToken.status, 401);
  const invalidToken = await fetch(`${baseUrl}/api/users`, {
    headers: bearer("token-invalido"),
  });
  assert.equal(invalidToken.status, 401);

  const [adminToken, collaboratorToken] = await Promise.all([
    login(adminEmail, baseUrl),
    login(collaboratorEmail),
  ]);
  const rejectedOrigin = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      ...bearer(adminToken),
      "Content-Type": "application/json",
      Origin: "https://origen-no-permitido.example",
    },
    body: JSON.stringify({}),
  });
  assert.equal(rejectedOrigin.status, 403);
  const forbiddenList = await fetch(`${baseUrl}/api/users`, {
    headers: bearer(collaboratorToken),
  });
  assert.equal(forbiddenList.status, 403);
  const forbiddenCreate = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { ...bearer(collaboratorToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: createdEmail,
      displayName: "Sin permiso",
      password,
      role: "COLLABORATOR",
    }),
  });
  assert.equal(forbiddenCreate.status, 403);

  const listResponse = await fetch(`${baseUrl}/api/users`, { headers: bearer(adminToken) });
  assert.equal(listResponse.status, 200);

  const createResponse = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { ...bearer(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: createdEmail,
      displayName: "Usuario creado por API",
      password,
      role: "COLLABORATOR",
    }),
  });
  assert.equal(createResponse.status, 201);
  const createdBody = (await createResponse.json()) as {
    data: { id: string; passwordHash?: unknown; role: { code: string } };
  };
  assert.equal(createdBody.data.role.code, "COLLABORATOR");
  assert.equal(createdBody.data.passwordHash, undefined);
  testUserIds.push(createdBody.data.id);

  const detailResponse = await fetch(`${baseUrl}/api/users/${createdBody.data.id}`, {
    headers: bearer(adminToken),
  });
  assert.equal(detailResponse.status, 200);

  const updateResponse = await fetch(`${baseUrl}/api/users/${createdBody.data.id}`, {
    method: "PATCH",
    headers: { ...bearer(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Usuario actualizado", role: "ADMIN" }),
  });
  assert.equal(updateResponse.status, 200);
  const updatedBody = (await updateResponse.json()) as {
    data: { displayName: string; role: { code: string } };
  };
  assert.equal(updatedBody.data.displayName, "Usuario actualizado");
  assert.equal(updatedBody.data.role.code, "ADMIN");

  const collaboratorRole = await prisma.role.findUniqueOrThrow({
    where: { code: "COLLABORATOR" },
    select: { id: true },
  });
  await assert.rejects(
    prisma.userRole.create({
      data: { userId: createdBody.data.id, roleId: collaboratorRole.id },
    }),
    (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"),
  );

  const deleteResponse = await fetch(`${baseUrl}/api/users/${createdBody.data.id}`, {
    method: "DELETE",
    headers: bearer(adminToken),
  });
  assert.equal(deleteResponse.status, 204);
  const deactivated = await prisma.user.findUniqueOrThrow({
    where: { id: createdBody.data.id },
    select: { status: true },
  });
  assert.equal(deactivated.status, "INACTIVE");
});
