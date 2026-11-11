import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import { parseAuthorizedAmount } from "../src/school/sponsorshipAssignment";
import { createSchoolTestContext } from "./support/schoolFixtures";

/** MA-34: asignar un padrino a un alumno con su compromiso de donación. */

let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
let admin: string, collaborator: string;
let foreignSchoolId: string, foreignSponsorId: string;
const suffix = randomUUID().slice(0, 8);

const assignment = (sponsorId: string, overrides: Record<string, unknown> = {}, commitment: Record<string, unknown> = {}) => ({
  sponsorId,
  startDate: "2026-02-01",
  commitment: { amount: "250", frequency: "MONTHLY", ...commitment },
  ...overrides,
});

const assign = (studentId: string, body: unknown, token = admin) => ctx.api(token, `/students/${studentId}/sponsorships`, "POST", body);

before(async () => {
  ctx = await createSchoolTestContext("assignment");
  admin = await ctx.login("admin");
  collaborator = await ctx.login("collaborator");
  foreignSchoolId = (await prisma.school.create({ data: { code: `AS-OTHER-${suffix}`, name: "Otro colegio" } })).id;
  foreignSponsorId = (await prisma.sponsor.create({ data: {
    schoolId: foreignSchoolId, givenNames: "Padrino", firstSurname: "Ajeno", searchName: "Padrino Ajeno",
  } })).id;
});

after(async () => {
  if (foreignSponsorId) await prisma.sponsor.delete({ where: { id: foreignSponsorId } });
  if (foreignSchoolId) await prisma.school.delete({ where: { id: foreignSchoolId } });
  if (ctx) await ctx.cleanup();
});

test("asigna un padrino existente y registra el compromiso vinculado al padrinazgo", async () => {
  const student = await ctx.createStudent();
  const sponsor = await ctx.createSponsor({ givenNames: "Esperanza", firstSurname: `Ajcalón-${suffix}` });

  const response = await assign(student.id, assignment(sponsor.id, { notes: "Padrinazgo del ciclo 2026" }));
  assert.equal(response.status, 201);
  const body = (await response.json()).data;
  assert.equal(body.status, "PENDING");
  assert.equal(body.startDate, "2026-02-01");
  assert.equal(body.sponsor.fullName, `Esperanza Ajcalón-${suffix}`);
  assert.deepEqual(
    { ...body.commitment, id: undefined },
    { id: undefined, authorizedAmount: "250.00", currency: "GTQ", frequency: "MONTHLY", startDate: "2026-02-01", endDate: null, status: "PENDING" },
  );

  // El compromiso vive en donation_commitments y apunta al padrinazgo.
  const stored = await prisma.donationCommitment.findUniqueOrThrow({ where: { id: body.commitment.id } });
  assert.equal(stored.sponsorshipId, body.id);
  assert.equal(stored.amount.toFixed(2), "250.00");
  assert.equal(stored.cardLastFour, null);
  assert.equal(stored.paymentReference, null);

  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "Sponsorship", entityId: body.id, action: "CREATE" } });
  assert.equal((audit.afterData as { donationCommitmentId: string }).donationCommitmentId, body.commitment.id);
});

test("el padrinazgo asignado se consulta desde el alumno, la ficha y el padrino", async () => {
  const student = await ctx.createStudent();
  const sponsor = await ctx.createSponsor();
  const created = (await (await assign(student.id, assignment(sponsor.id, {}, { amount: 175.5 }))).json()).data;

  const summary = (await (await ctx.api(collaborator, `/students/${student.id}/summary`)).json()).data;
  assert.equal(summary.sponsors.length, 1);
  assert.equal(summary.sponsors[0].sponsorshipId, created.id);
  assert.equal(summary.sponsors[0].status, "PENDING");
  assert.equal(summary.sponsors[0].commitment.authorizedAmount, "175.50");
  assert.equal(summary.sponsors[0].commitment.frequency, "MONTHLY");

  const list = await ctx.api(collaborator, `/students/${student.id}/sponsorships`);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data[0].commitment.authorizedAmount, "175.50");

  const detail = (await (await ctx.api(collaborator, `/sponsors/${sponsor.id}`)).json()).data;
  assert.equal(detail.sponsorships[0].student.id, student.id);
  assert.equal(detail.sponsorships[0].commitment.authorizedAmount, "175.50");

  // Un padrinazgo finalizado deja de aparecer en la ficha, pero se conserva en el historial.
  await prisma.sponsorship.update({ where: { id: created.id }, data: { status: "ENDED", endDate: new Date("2026-06-30") } });
  assert.equal((await (await ctx.api(collaborator, `/students/${student.id}/summary`)).json()).data.sponsors.length, 0);
  assert.equal((await (await ctx.api(collaborator, `/students/${student.id}/sponsorships`)).json()).data.length, 1);
});

test("respeta la regla de un padrino por alumno", async () => {
  const student = await ctx.createStudent();
  const [first, second] = [await ctx.createSponsor(), await ctx.createSponsor()];
  const created = (await (await assign(student.id, assignment(first.id))).json()).data;

  const rejected = await assign(student.id, assignment(second.id));
  assert.equal(rejected.status, 409);
  assert.match((await rejected.json()).message, /ya tiene un padrino asignado/);
  assert.equal((await assign(student.id, assignment(first.id))).status, 409);

  await prisma.sponsorship.update({ where: { id: created.id }, data: { status: "CANCELLED" } });
  assert.equal((await assign(student.id, assignment(second.id))).status, 201, "al cancelar se libera el cupo");
  assert.equal(await prisma.sponsorship.count({ where: { studentId: student.id } }), 2);
});

test("dos asignaciones simultáneas al mismo alumno no superan el cupo", async () => {
  const student = await ctx.createStudent();
  const sponsors = [await ctx.createSponsor(), await ctx.createSponsor(), await ctx.createSponsor()];
  const statuses = (await Promise.all(sponsors.map((sponsor) => assign(student.id, assignment(sponsor.id))))).map((r) => r.status);
  assert.deepEqual(statuses.sort(), [201, 409, 409]);
  assert.equal(await prisma.sponsorship.count({ where: { studentId: student.id } }), 1);
  assert.equal(await prisma.donationCommitment.count({ where: { sponsorship: { studentId: student.id } } }), 1);
});

test("valida el compromiso y no acepta datos de tarjeta", async () => {
  const student = await ctx.createStudent();
  const sponsor = await ctx.createSponsor();
  for (const [body, message] of [
    [assignment(sponsor.id, {}, { amount: 0 }), /mayor que cero/],
    [assignment(sponsor.id, {}, { amount: "-5" }), /número positivo/],
    [assignment(sponsor.id, {}, { amount: "12.345" }), /2 decimales/],
    [assignment(sponsor.id, {}, { amount: "Q250" }), /número positivo/],
    [assignment(sponsor.id, {}, { frequency: "WEEKLY" }), /frecuencia/],
    [assignment(sponsor.id, {}, { currency: "quetzales" }), /moneda/],
    [assignment(sponsor.id, {}, { startDate: "2026-01-01" }), /antes que el padrinazgo/],
    [assignment(sponsor.id, {}, { frequency: "ONE_TIME", endDate: "2026-12-31" }), /única no lleva fecha de fin/],
    [assignment(sponsor.id, {}, { endDate: "2026-01-15" }), /posterior a su inicio/],
    [assignment(sponsor.id, {}, { cardLastFour: "4242" }), /no permitido en el compromiso: cardLastFour/],
    [assignment(sponsor.id, {}, { paymentReference: "tok_123" }), /no permitido en el compromiso: paymentReference/],
    [assignment(sponsor.id, { cardNumber: "4242424242424242" }), /no permitido en el padrinazgo: cardNumber/],
    [assignment(sponsor.id, { commitment: undefined }), /compromiso de donación es obligatorio/],
    [assignment(sponsor.id, { startDate: "01/02/2026" }), /YYYY-MM-DD/],
    [assignment("no-es-uuid"), /sponsorId/],
  ] as const) {
    const response = await assign(student.id, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match((await response.json()).message, message);
  }
  assert.equal(await prisma.sponsorship.count({ where: { studentId: student.id } }), 0);
  assert.equal((await assign(student.id, assignment(sponsor.id, {}, { frequency: "ONE_TIME", amount: "1000.5" }))).status, 201);
});

test("verifica el padrino, el alumno y los permisos", async () => {
  const student = await ctx.createStudent();
  const inactive = await ctx.createSponsor();
  await prisma.sponsor.update({ where: { id: inactive.id }, data: { active: false } });
  const inactiveResponse = await assign(student.id, assignment(inactive.id));
  assert.equal(inactiveResponse.status, 409);
  assert.match((await inactiveResponse.json()).message, /inactivo/);
  assert.equal((await assign(student.id, assignment(foreignSponsorId))).status, 404, "padrino de otro colegio");
  assert.equal((await assign(student.id, assignment(randomUUID()))).status, 404);
  assert.equal((await assign(randomUUID(), assignment((await ctx.createSponsor()).id))).status, 404);

  const sponsor = await ctx.createSponsor();
  assert.equal((await assign(student.id, assignment(sponsor.id), collaborator)).status, 403);
  assert.equal((await ctx.api(collaborator, `/students/${student.id}/sponsorships`)).status, 200);
  assert.equal(await prisma.sponsorship.count({ where: { studentId: student.id } }), 0);
});

test("el monto autorizado conserva exactamente dos decimales", () => {
  assert.equal(parseAuthorizedAmount("250"), "250");
  assert.equal(parseAuthorizedAmount(99.99), "99.99");
  assert.equal(parseAuthorizedAmount(" 1500.5 "), "1500.5");
  assert.throws(() => parseAuthorizedAmount(1e21));
  assert.throws(() => parseAuthorizedAmount("12345678901"));
  assert.throws(() => parseAuthorizedAmount(null));
});

test("OpenAPI documenta la asignación de padrinos", async () => {
  const openApi = (await (await fetch(`${ctx.baseUrl}/api/openapi.json`)).json()) as { paths: Record<string, Record<string, unknown>> };
  assert.ok(openApi.paths["/api/students/{id}/sponsorships"].post);
  assert.ok(openApi.paths["/api/students/{id}/sponsorships"].get);
});
