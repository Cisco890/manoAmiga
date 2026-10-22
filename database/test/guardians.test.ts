import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import { createSchoolTestContext } from "./support/schoolFixtures";

let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
let admin: string, collaborator: string;
const suffix = randomUUID().slice(0, 8);
const dpi = `2999${String(Date.now()).slice(-9)}`;
const guardianIds = new Set<string>();
let foreignSchoolId = "";

type Link = {
  id: string;
  relationship: string;
  customRelationship: string | null;
  livesWithStudent: boolean;
  primaryContact: boolean;
  guardian: { id: string; fullName: string; dpiMasked: string | null; hasDpi: boolean };
  otherStudents: Array<{ id: string; fullName: string; studentCode: string }>;
};

before(async () => {
  ctx = await createSchoolTestContext("ma27");
  admin = await ctx.login("admin");
  collaborator = await ctx.login("collaborator");
});

after(async () => {
  if (ctx) {
    // Los vínculos se borran en cascada con los alumnos; luego se borran los guardianes.
    await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: [...guardianIds] } } });
    await prisma.guardian.deleteMany({ where: { id: { in: [...guardianIds] } } });
    if (foreignSchoolId) {
      await prisma.student.deleteMany({ where: { schoolId: foreignSchoolId } });
      await prisma.school.delete({ where: { id: foreignSchoolId } });
    }
    await ctx.cleanup();
  }
});

async function link(token: string, studentId: string, body: Record<string, unknown>) {
  const response = await ctx.api(token, `/students/${studentId}/guardians`, "POST", body);
  const json = (await response.json()) as { data: Link; message?: string };
  if (response.status === 201) guardianIds.add(json.data.guardian.id);
  return { status: response.status, data: json.data, message: json.message };
}

async function links(studentId: string, token = admin) {
  const response = await ctx.api(token, `/students/${studentId}/guardians`);
  assert.equal(response.status, 200);
  return ((await response.json()) as { data: Link[] }).data;
}

// El fixture numera los códigos con un contador, así que los alumnos se crean en serie.
const twoStudents = async () => [await ctx.createStudent(), await ctx.createStudent()];

const newMother = (extra: Record<string, unknown> = {}) => ({
  relationship: "MOTHER",
  livesWithStudent: true,
  guardian: { givenNames: `Marina ${suffix}`, firstSurname: "Hermanos", secondSurname: "Pérez", dpi, mobilePhone: "5555-0001" },
  ...extra,
});

test("un guardián se registra una vez y se reutiliza entre hermanos", async () => {
  const [older, younger] = await twoStudents();
  const created = await link(admin, older.id, newMother());
  assert.equal(created.status, 201);
  assert.equal(created.data.relationship, "MOTHER");
  assert.equal(created.data.livesWithStudent, true);
  assert.equal(created.data.primaryContact, true, "el primer responsable queda como principal");

  // El hermano se vincula con el mismo registro: no se vuelven a digitar sus datos.
  const reused = await link(admin, younger.id, { guardianId: created.data.guardian.id, relationship: "MOTHER", livesWithStudent: false });
  assert.equal(reused.status, 201);
  assert.equal(reused.data.guardian.id, created.data.guardian.id);
  assert.equal(reused.data.livesWithStudent, false, "la convivencia es propia de cada vínculo");
  assert.equal(await prisma.guardian.count({ where: { dpiHash: { not: null }, searchName: { contains: suffix } } }), 1);

  const [olderLink] = await links(older.id, collaborator);
  assert.deepEqual(olderLink.otherStudents.map((s) => s.id), [younger.id]);
  const [youngerLink] = await links(younger.id);
  assert.deepEqual(youngerLink.otherStudents.map((s) => s.id), [older.id]);

  for (const q of [`marina ${suffix}`, `hermanos ${suffix}`, dpi]) {
    const response = await ctx.api(collaborator, `/guardians?q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200, q);
    const { data } = (await response.json()) as { data: Array<{ id: string; students: Array<{ id: string }> }> };
    assert.equal(data.length, 1, q);
    assert.deepEqual(data[0].students.map((s) => s.id).sort(), [older.id, younger.id].sort());
  }
});

test("el DPI se cifra, se enmascara y no admite duplicados", async () => {
  const [first, second] = await twoStudents();
  const otherDpi = `3111${String(Date.now()).slice(-9)}`;
  const created = await link(admin, first.id, newMother({ guardian: { givenNames: "Dpi", firstSurname: "Cifrado", dpi: otherDpi } }));
  assert.equal(created.status, 201);
  assert.equal(created.data.guardian.hasDpi, true);
  assert.equal(created.data.guardian.dpiMasked, `${"*".repeat(otherDpi.length - 4)}${otherDpi.slice(-4)}`);
  const stored = await prisma.guardian.findUniqueOrThrow({ where: { id: created.data.guardian.id } });
  assert.ok(stored.dpiEncrypted && !stored.dpiEncrypted.includes(otherDpi));
  assert.ok(stored.dpiHash && stored.dpiHash !== otherDpi);

  const duplicate = await link(admin, second.id, newMother({ guardian: { givenNames: "Otra", firstSurname: "Persona", dpi: otherDpi } }));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.message ?? "", /DPI/);

  const audits = await prisma.auditEvent.findMany({ where: { entityType: "StudentGuardian", entityId: created.data.id } });
  assert.equal(audits.length, 1);
  assert.ok(!JSON.stringify(audits.map(({ beforeData, afterData }) => [beforeData, afterData])).includes(otherDpi));
});

test("solo hay un responsable principal por alumno, también en la base de datos", async () => {
  const student = await ctx.createStudent();
  const mother = await link(admin, student.id, newMother({ guardian: { givenNames: "Principal", firstSurname: "Uno" } }));
  const father = await link(admin, student.id, {
    relationship: "FATHER",
    primaryContact: true,
    guardian: { givenNames: "Principal", firstSurname: "Dos" },
  });
  assert.equal(father.status, 201);
  const current = await links(student.id);
  assert.deepEqual(current.map((l) => [l.relationship, l.primaryContact]), [["FATHER", true], ["MOTHER", false]]);

  // Cambiar el principal desde la edición del vínculo desmarca al anterior.
  const patched = await ctx.api(admin, `/students/${student.id}/guardians/${mother.data.id}`, "PATCH", { primaryContact: true });
  assert.equal(patched.status, 200);
  assert.deepEqual((await links(student.id)).map((l) => [l.relationship, l.primaryContact]), [["MOTHER", true], ["FATHER", false]]);

  await assert.rejects(
    prisma.studentGuardian.update({ where: { id: father.data.id }, data: { primaryContact: true } }),
    (error: { code?: string }) => error.code === "P2002",
  );
});

test("valida el parentesco y no vincula dos veces al mismo responsable", async () => {
  const student = await ctx.createStudent();
  for (const body of [
    { relationship: "VECINO", guardian: { givenNames: "A", firstSurname: "B" } },
    { relationship: "OTHER", guardian: { givenNames: "A", firstSurname: "B" } },
    { relationship: "MOTHER", guardian: { givenNames: "", firstSurname: "B" } },
    { relationship: "MOTHER", guardian: { givenNames: "A", firstSurname: "B", dpi: "123" } },
    { relationship: "MOTHER", guardian: { givenNames: "A", firstSurname: "B", primaryEmail: "no-es-correo" } },
    { relationship: "MOTHER", guardian: { givenNames: "A", firstSurname: "B", notes: "campo no permitido" } },
    { relationship: "MOTHER", guardianId: randomUUID(), guardian: { givenNames: "A", firstSurname: "B" } },
    { relationship: "MOTHER" },
  ]) {
    assert.equal((await link(admin, student.id, body)).status, 400, JSON.stringify(body));
  }
  const tutor = await link(admin, student.id, {
    relationship: "OTHER",
    customRelationship: "Madrina",
    guardian: { givenNames: "Tutora", firstSurname: "Legal" },
  });
  assert.equal(tutor.status, 201);
  assert.equal(tutor.data.customRelationship, "Madrina");
  const again = await link(admin, student.id, { guardianId: tutor.data.guardian.id, relationship: "TUTOR" });
  assert.equal(again.status, 409);
  assert.equal((await link(admin, student.id, { guardianId: randomUUID(), relationship: "TUTOR" })).status, 404);
});

test("desvincular conserva el historial y permite volver a vincular", async () => {
  const student = await ctx.createStudent();
  const created = await link(admin, student.id, newMother({ guardian: { givenNames: "Temporal", firstSurname: "Vínculo" } }));
  const path = `/students/${student.id}/guardians/${created.data.id}`;
  assert.equal((await ctx.api(admin, path, "DELETE")).status, 200);
  assert.deepEqual(await links(student.id), []);
  const ended = await prisma.studentGuardian.findUniqueOrThrow({ where: { id: created.data.id } });
  assert.equal(ended.active, false);
  assert.ok(ended.endDate);
  assert.equal((await ctx.api(admin, path, "DELETE")).status, 404);

  const relinked = await link(admin, student.id, { guardianId: created.data.guardian.id, relationship: "MOTHER" });
  assert.equal(relinked.status, 201);
  assert.equal(relinked.data.id, created.data.id, "se reactiva el mismo vínculo");
  assert.equal(relinked.data.primaryContact, true);
});

test("los datos personales del responsable se editan una vez para todos sus alumnos", async () => {
  const [first, second] = await twoStudents();
  const created = await link(admin, first.id, newMother({ guardian: { givenNames: "Antes", firstSurname: "Cambio" } }));
  await link(admin, second.id, { guardianId: created.data.guardian.id, relationship: "MOTHER" });
  const response = await ctx.api(admin, `/guardians/${created.data.guardian.id}`, "PATCH", { givenNames: "Después" });
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { data: { fullName: string } }).data.fullName, "Después Cambio");
  assert.equal((await links(second.id))[0].guardian.fullName, "Después Cambio");
  const stored = await prisma.guardian.findUniqueOrThrow({ where: { id: created.data.guardian.id } });
  assert.equal(stored.searchName, "Después Cambio");
  assert.equal((await ctx.api(admin, `/guardians/${created.data.guardian.id}`, "PATCH", { firstSurname: "" })).status, 400);
});

test("permisos: el colaborador solo consulta y otro colegio no ve los guardianes", async () => {
  const student = await ctx.createStudent();
  const created = await link(admin, student.id, newMother({ guardian: { givenNames: `Privada ${suffix}`, firstSurname: "Colegio" } }));
  const path = `/students/${student.id}/guardians`;
  assert.equal((await ctx.api(collaborator, path, "POST", newMother())).status, 403);
  assert.equal((await ctx.api(collaborator, `${path}/${created.data.id}`, "PATCH", { livesWithStudent: false })).status, 403);
  assert.equal((await ctx.api(collaborator, `${path}/${created.data.id}`, "DELETE")).status, 403);
  assert.equal((await ctx.api(collaborator, `/guardians/${created.data.guardian.id}`, "PATCH", { givenNames: "X" })).status, 403);
  assert.equal((await fetch(`${ctx.baseUrl}/api${path}`)).status, 401);
  assert.equal((await ctx.api(admin, `/guardians?q=a`)).status, 400);

  // Un guardián vinculado solo a otro colegio no aparece en la búsqueda.
  foreignSchoolId = (await prisma.school.create({ data: { code: `MA27-${suffix}`, name: "Otro colegio" } })).id;
  const foreignStudent = await prisma.student.create({
    data: { schoolId: foreignSchoolId, studentCode: `F-${suffix}`, givenNames: "Ajeno", firstSurname: "Alumno", searchName: "Ajeno Alumno" },
  });
  const foreignGuardian = await prisma.guardian.create({
    data: {
      givenNames: `Externa ${suffix}`, firstSurname: "Colegio", searchName: `Externa ${suffix} Colegio`,
      studentLinks: { create: { studentId: foreignStudent.id, relationship: "MOTHER" } },
    },
  });
  guardianIds.add(foreignGuardian.id);
  const search = await ctx.api(admin, `/guardians?q=${encodeURIComponent(`Externa ${suffix}`)}`);
  assert.deepEqual(((await search.json()) as { data: unknown[] }).data, []);
  assert.equal((await link(admin, student.id, { guardianId: foreignGuardian.id, relationship: "FATHER" })).status, 404);
});

test("OpenAPI documenta los endpoints de responsables", async () => {
  const openApi = (await (await fetch(`${ctx.baseUrl}/api/openapi.json`)).json()) as { paths: Record<string, unknown> };
  for (const path of ["/api/guardians", "/api/guardians/{id}", "/api/students/{id}/guardians", "/api/students/{id}/guardians/{linkId}"]) {
    assert.ok(openApi.paths[path], path);
  }
});
