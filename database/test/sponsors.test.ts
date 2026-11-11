import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import { phoneMatchKey } from "../src/school/sponsors";
import { createSchoolTestContext } from "./support/schoolFixtures";

/** MA-33: crear o localizar un padrino existente antes de registrar un padrinazgo. */

let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
let admin: string, collaborator: string;
let foreignSchoolId: string, foreignSponsorId: string;
const suffix = randomUUID().slice(0, 8);
const localPhone = String(10000000 + Math.floor(Math.random() * 89999999));
const email = `padrino-${suffix}@example.test`;

type SponsorBody = Record<string, unknown>;

async function create(body: SponsorBody) {
  const response = await ctx.api(admin, "/sponsors", "POST", body);
  const json = await response.json();
  if (response.status === 201) ctx.trackSponsor(json.data.id);
  return { status: response.status, data: json.data, message: json.message as string | undefined };
}

async function matches(params: Record<string, string>, token = admin) {
  const response = await ctx.api(token, `/sponsors/matches?${new URLSearchParams(params)}`);
  const json = await response.json();
  return { status: response.status, data: json.data as { id: string; reasons: string[]; active: boolean; openSponsorships: unknown[] }[] };
}

before(async () => {
  ctx = await createSchoolTestContext("sponsors");
  admin = await ctx.login("admin");
  collaborator = await ctx.login("collaborator");
  foreignSchoolId = (await prisma.school.create({ data: { code: `SP-OTHER-${suffix}`, name: "Otro colegio" } })).id;
  foreignSponsorId = (await prisma.sponsor.create({ data: {
    schoolId: foreignSchoolId, givenNames: "Wenceslao", firstSurname: `Ajeno-${suffix}`, searchName: `Wenceslao Ajeno-${suffix}`, email,
  } })).id;
});

after(async () => {
  if (foreignSponsorId) await prisma.sponsor.delete({ where: { id: foreignSponsorId } });
  if (foreignSchoolId) await prisma.school.delete({ where: { id: foreignSchoolId } });
  if (ctx) await ctx.cleanup();
});

test("registra un padrino sin padrinazgo y lo devuelve en el listado y el detalle", async () => {
  const created = await create({
    givenNames: "  Wenceslao ", firstSurname: `Zuñiga-${suffix}`, secondSurname: "Pérez",
    email: email.toUpperCase(), phone: `${localPhone.slice(0, 4)}-${localPhone.slice(4)}`, birthday: "1980-04-12",
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.type, "INDIVIDUAL");
  assert.equal(created.data.fullName, `Wenceslao Zuñiga-${suffix} Pérez`);
  assert.equal(created.data.email, email, "el correo se guarda en minúsculas");
  assert.equal(created.data.birthday, "1980-04-12");
  assert.equal(created.data.active, true);
  assert.deepEqual(created.data.sponsorships, []);

  const list = await (await ctx.api(collaborator, `/sponsors?q=${encodeURIComponent(`zuñiga-${suffix} wenceslao`)}`)).json();
  assert.equal(list.pagination.total, 1);
  assert.equal(list.data[0].id, created.data.id);
  assert.deepEqual(list.data[0].openSponsorships, []);
  const byPhone = await (await ctx.api(collaborator, `/sponsors?q=${localPhone.slice(0, 4)}`)).json();
  assert.ok(byPhone.data.some((s: { id: string }) => s.id === created.data.id));

  const detail = await ctx.api(collaborator, `/sponsors/${created.data.id}`);
  assert.equal(detail.status, 200);

  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "Sponsor", entityId: created.data.id, action: "CREATE" } });
  assert.ok(!JSON.stringify(audit.afterData).includes(email), "la auditoría no copia el correo");
});

test("valida el nombre según el tipo y los datos de contacto", async () => {
  const organization = await create({ type: "ORGANIZATION", organizationName: `Fundación Luz ${suffix}`, givenNames: "Ana", firstSurname: "Contacto" });
  assert.equal(organization.status, 201);
  assert.equal(organization.data.fullName, `Fundación Luz ${suffix}`);
  assert.equal(organization.data.contactName, "Ana Contacto");

  for (const [body, message] of [
    [{ givenNames: "Solo nombre" }, /primer apellido/],
    [{ type: "ORGANIZATION", givenNames: "Ana", firstSurname: "López" }, /organización/],
    [{ type: "EMPRESA", organizationName: "X" }, /Tipo de padrino/],
    [{ givenNames: "Ana", firstSurname: "López", email: "no-es-correo" }, /correo/],
    [{ givenNames: "Ana", firstSurname: "López", phone: "12-34" }, /7 dígitos/],
    [{ givenNames: "Ana", firstSurname: "López", phone: "5555-abcd" }, /7 dígitos/],
    [{ givenNames: "Ana", firstSurname: "López", birthday: "12/04/1980" }, /YYYY-MM-DD/],
    [{ givenNames: "Ana", firstSurname: "López", nit: "123" }, /no permitido: nit/],
    [{ givenNames: "Ana", firstSurname: "López", active: false }, /no permitido: active/],
  ] as const) {
    const result = await create(body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.match(result.message ?? "", message);
  }
});

test("sugiere coincidencias por nombre, correo o teléfono antes de crear", async () => {
  const existing = await create({ givenNames: "Rigoberta", firstSurname: `Quiñónez-${suffix}`, email: `rigo-${suffix}@example.test`, phone: `+502 ${localPhone.slice(0, 4)} ${localPhone.slice(4)}9` });
  assert.equal(existing.status, 201);
  const student = await ctx.createStudent();
  await ctx.createSponsorshipRow(existing.data.id, student.id, "ACTIVE");

  const byName = await matches({ name: `quiñónez-${suffix} RIGOBERTA` });
  assert.equal(byName.status, 200);
  const nameMatch = byName.data.find((m) => m.id === existing.data.id);
  assert.deepEqual(nameMatch?.reasons, ["name"]);
  assert.equal(nameMatch?.openSponsorships.length, 1, "muestra a qué alumnos ya apoya");

  const typo = await matches({ name: `Rigoberta Quiñonez-${suffix}` });
  assert.ok(typo.data.some((m) => m.id === existing.data.id), "tolera un error de tilde");

  const byEmail = await matches({ email: `RIGO-${suffix}@example.test` });
  assert.deepEqual(byEmail.data.map((m) => [m.id, m.reasons]), [[existing.data.id, ["email"]]]);

  // Mismo número local escrito de otra forma: coinciden los últimos 8 dígitos.
  const lastEight = `${localPhone}9`.slice(-8);
  const byPhone = await matches({ phone: `${lastEight.slice(0, 4)} ${lastEight.slice(4)}` });
  assert.ok(byPhone.data.some((m) => m.id === existing.data.id && m.reasons.includes("phone")));

  const all = await matches({ name: `Rigoberta Quiñónez-${suffix}`, email: `rigo-${suffix}@example.test` });
  assert.deepEqual(all.data[0].reasons, ["name", "email"]);
  assert.deepEqual((await matches({ email: `rigo-${suffix}@example.test`, excludeId: existing.data.id })).data, []);

  assert.equal((await matches({}, collaborator)).status, 400);
  assert.equal((await matches({ name: "a" })).status, 400);
  assert.equal((await matches({ name: "%_" })).data.length, 0, "los comodines se escapan");
});

test("no sugiere ni muestra padrinos de otro colegio", async () => {
  const byEmail = await matches({ email });
  assert.ok(!byEmail.data.some((m) => m.id === foreignSponsorId));
  assert.equal((await ctx.api(admin, `/sponsors/${foreignSponsorId}`)).status, 404);
  assert.equal((await ctx.api(admin, `/sponsors/${foreignSponsorId}`, "PATCH", { notes: "x" })).status, 404);
  const list = await (await ctx.api(admin, `/sponsors?q=Ajeno-${suffix}`)).json();
  assert.equal(list.pagination.total, 0);
});

test("edita, desactiva y reactiva un padrino sin perder su historial", async () => {
  const sponsor = await create({ givenNames: "Teodoro", firstSurname: `Ixcot-${suffix}` });
  const id = sponsor.data.id;
  const patched = await ctx.api(admin, `/sponsors/${id}`, "PATCH", { secondSurname: "Ajú", phone: "4444 5555" });
  assert.equal(patched.status, 200);
  const body = (await patched.json()).data;
  assert.equal(body.fullName, `Teodoro Ixcot-${suffix} Ajú`);
  assert.equal(body.phone, "4444 5555");
  assert.equal((await ctx.api(admin, `/sponsors/${id}`, "PATCH", { type: "ORGANIZATION" })).status, 400);
  assert.equal((await ctx.api(admin, `/sponsors/${id}`, "PATCH", { givenNames: null })).status, 400);

  const student = await ctx.createStudent();
  const sponsorship = await ctx.createSponsorshipRow(id, student.id, "PAUSED");
  assert.equal((await ctx.api(admin, `/sponsors/${id}`, "DELETE")).status, 409);
  assert.equal((await ctx.api(admin, `/sponsors/${id}`, "PATCH", { active: false })).status, 409);
  await prisma.sponsorship.update({ where: { id: sponsorship.id }, data: { status: "ENDED", endDate: new Date() } });

  const deactivated = await ctx.api(admin, `/sponsors/${id}`, "DELETE");
  assert.equal(deactivated.status, 200);
  const deactivatedBody = (await deactivated.json()).data;
  assert.equal(deactivatedBody.active, false);
  assert.equal(deactivatedBody.sponsorships.length, 1, "conserva el historial");
  const inactiveList = await (await ctx.api(admin, `/sponsors?active=false&q=Ixcot-${suffix}`)).json();
  assert.equal(inactiveList.data[0].id, id);
  assert.equal((await (await ctx.api(admin, `/sponsors?active=true&q=Ixcot-${suffix}`)).json()).pagination.total, 0);
  const stillSuggested = await matches({ name: `Teodoro Ixcot-${suffix}` });
  assert.equal(stillSuggested.data.find((m) => m.id === id)?.active, false, "un inactivo se sugiere para reactivarlo");

  const reactivated = await ctx.api(admin, `/sponsors/${id}`, "PATCH", { active: true });
  assert.equal((await reactivated.json()).data.active, true);
  assert.equal(await prisma.auditEvent.count({ where: { entityType: "Sponsor", entityId: id } }), 4);
});

test("el colaborador consulta padrinos pero no los modifica", async () => {
  const sponsor = await ctx.createSponsor();
  assert.equal((await ctx.api(collaborator, "/sponsors")).status, 200);
  assert.equal((await ctx.api(collaborator, `/sponsors/${sponsor.id}`)).status, 200);
  assert.equal((await ctx.api(collaborator, "/sponsors", "POST", { givenNames: "A", firstSurname: "B" })).status, 403);
  assert.equal((await ctx.api(collaborator, `/sponsors/${sponsor.id}`, "PATCH", { notes: "x" })).status, 403);
  assert.equal((await ctx.api(collaborator, `/sponsors/${sponsor.id}`, "DELETE")).status, 403);
  assert.equal((await fetch(`${ctx.baseUrl}/api/sponsors`)).status, 401);
  assert.equal((await ctx.api(admin, "/sponsors?active=quizas")).status, 400);
  assert.equal((await ctx.api(admin, "/sponsors/no-es-uuid")).status, 404);
});

test("la clave de teléfono ignora formato y prefijo internacional", () => {
  assert.equal(phoneMatchKey("5555-1234"), "55551234");
  assert.equal(phoneMatchKey("+502 5555 1234"), "55551234");
  assert.equal(phoneMatchKey("(502) 5555-1234"), "55551234");
  assert.equal(phoneMatchKey("123-456"), null);
  assert.equal(phoneMatchKey(null), null);
});

test("OpenAPI documenta los endpoints de padrinos", async () => {
  const openApi = (await (await fetch(`${ctx.baseUrl}/api/openapi.json`)).json()) as { paths: Record<string, Record<string, unknown>> };
  for (const path of ["/api/sponsors", "/api/sponsors/matches", "/api/sponsors/{id}"]) assert.ok(openApi.paths[path], path);
  assert.ok(openApi.paths["/api/sponsors/{id}"].delete);
});
