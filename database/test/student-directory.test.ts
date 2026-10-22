import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import { encryptCui, hashCui } from "../src/privacy/cui";
import { createSchoolTestContext } from "./support/schoolFixtures";

let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
let admin: string, collaborator: string, studentId: string, schoolId: string;
let oldCycleId: string, currentCycleId: string, oldEnrollmentId: string, currentEnrollmentId: string;
let guardianId: string, sponsorId: string, templateId: string, foreignSchoolId: string, foreignStudentId: string;
const suffix = randomUUID().slice(0, 8);
const cui = `2888${String(Date.now()).slice(-9)}`;
const code = `DIRECTORY-${suffix}`;
const guardianName = `Marina-${suffix}`;
const sponsorName = `Padrino-${suffix}`;
const pickup = (name: string) => ({ givenNames: name, firstSurname: "López", secondSurname: null, relationship: "Vecina", phone: "5555-1234" });
const bulkIds: string[] = [];

before(async () => {
  ctx = await createSchoolTestContext("directory");
  admin = await ctx.login("admin");
  collaborator = await ctx.login("collaborator");
  studentId = (await ctx.createStudent()).id;
  const student = await prisma.student.update({ where: { id: studentId }, data: {
    studentCode: code, givenNames: "Lucía Sofía", firstSurname: "Zapata", secondSurname: "Díaz",
    searchName: "Lucía Sofía Zapata Díaz", birthDate: new Date("2018-05-06"),
    cuiEncrypted: encryptCui(cui), cuiHash: hashCui(cui),
  } });
  schoolId = student.schoolId;
  const cycles = await Promise.all([ctx.createCycle(), ctx.createCycle()]);
  const ordered = await prisma.academicCycle.findMany({ where: { id: { in: cycles.map((c) => c.id) } }, orderBy: { year: "asc" } });
  oldCycleId = ordered[0].id; currentCycleId = ordered[1].id;
  oldEnrollmentId = (await ctx.createEnrollmentRow(studentId, oldCycleId, "CLOSED", ctx.gradeIds[0])).id;
  currentEnrollmentId = (await ctx.createEnrollmentRow(studentId, currentCycleId, "APPROVED", ctx.gradeIds[1])).id;
  await prisma.authorizedPickup.create({ data: { ...pickup("Persona histórica"), enrollmentId: oldEnrollmentId, sortOrder: 1 } });
  guardianId = (await prisma.guardian.create({ data: {
    givenNames: guardianName, firstSurname: "Torres", searchName: `${guardianName} Torres`,
    mobilePhone: "5555-9876", notes: "Información privada no incluida en la ficha",
    studentLinks: { create: { studentId, relationship: "MOTHER", primaryContact: true, legalRepresentative: true } },
  } })).id;
  sponsorId = (await prisma.sponsor.create({ data: {
    givenNames: sponsorName, firstSurname: "Solidario", searchName: `${sponsorName} Solidario`,
    sponsorships: { create: { studentId, status: "ACTIVE", startDate: new Date("2020-01-01") } },
  } })).id;
  await prisma.studentPhoto.create({ data: { studentId, storagePath: "alumnos/foto privada.png", fileName: "foto.png", mimeType: "image/png" } });
  templateId = (await prisma.documentTemplate.create({ data: { name: `Test ${suffix}`, type: "ENROLLMENT_FORM", version: 10000 + Math.floor(Math.random() * 1000000000), templatePath: "test" } })).id;
  for (const [enrollmentId, status, generatedAt] of [
    [oldEnrollmentId, "SIGNED", "2025-01-01"],
    [currentEnrollmentId, "PRINTED", "2026-01-01"],
    [currentEnrollmentId, "VOID", "2026-02-01"],
  ] as const) {
    await prisma.generatedDocument.create({ data: { studentId, enrollmentId, templateId, type: "ENROLLMENT_FORM", status,
      generatedAt: new Date(generatedAt), storagePath: "documento/privado.pdf", fileName: "ficha.pdf", dataSnapshot: { private: true } } });
  }
  foreignSchoolId = (await prisma.school.create({ data: { code: `OTHER-${suffix}`, name: "Otro colegio" } })).id;
  foreignStudentId = (await prisma.student.create({ data: { schoolId: foreignSchoolId, studentCode: code, givenNames: "Lucía Sofía", firstSurname: "Zapata", searchName: "Lucía Sofía Zapata Díaz" } })).id;
});

after(async () => {
  if (bulkIds.length) {
    await prisma.enrollment.deleteMany({ where: { studentId: { in: bulkIds } } });
    await prisma.student.deleteMany({ where: { id: { in: bulkIds } } });
  }
  if (studentId) {
    await prisma.generatedDocument.deleteMany({ where: { studentId } });
    await prisma.sponsorship.deleteMany({ where: { studentId } });
    await prisma.studentGuardian.deleteMany({ where: { studentId } });
  }
  if (guardianId) await prisma.guardian.delete({ where: { id: guardianId } });
  if (sponsorId) await prisma.sponsor.delete({ where: { id: sponsorId } });
  if (templateId) await prisma.documentTemplate.delete({ where: { id: templateId } });
  if (foreignStudentId) await prisma.student.delete({ where: { id: foreignStudentId } });
  if (foreignSchoolId) await prisma.school.delete({ where: { id: foreignSchoolId } });
  if (ctx) await ctx.cleanup();
});

const summary = async (id = studentId) => {
  const response = await ctx.api(collaborator, `/students/${id}/summary`);
  assert.equal(response.status, 200);
  return (await response.json()).data;
};

test("registra autorizados sin guardianes ni inscripción y permite revocarlos", async () => {
  const student = await ctx.createStudent();
  const path = `/students/${student.id}/authorized-pickups`;
  const body = { authorizedPickups: [pickup("Ana"), pickup("Marta")] };
  assert.equal((await ctx.api(admin, path, "PUT", body)).status, 200);
  assert.deepEqual((await summary(student.id)).authorizedPickups, body.authorizedPickups);
  assert.equal(await prisma.studentGuardian.count({ where: { studentId: student.id } }), 0);
  assert.equal((await ctx.api(collaborator, path, "PUT", body)).status, 403);
  assert.equal((await fetch(`${ctx.baseUrl}/api/students/${student.id}/summary`)).status, 401);
  for (const authorizedPickups of [null, {}, [pickup("")], [pickup("Ana"), pickup("Ana"), pickup("Ana"), pickup("Ana")], [{ ...pickup("Ana"), guardianId }]]) {
    assert.equal((await ctx.api(admin, path, "PUT", { authorizedPickups })).status, 400);
  }
  assert.deepEqual((await summary(student.id)).authorizedPickups, body.authorizedPickups);
  assert.equal((await ctx.api(admin, path, "PUT", { authorizedPickups: [] })).status, 200);
  assert.deepEqual((await summary(student.id)).authorizedPickups, []);
});

test("la ficha contiene los siete elementos, preserva ciclos y no expone datos privados", async () => {
  const before = await summary();
  assert.ok(before.photo.id);
  assert.equal(before.currentEnrollment.id, currentEnrollmentId);
  assert.equal(before.student.status, "ACTIVE");
  assert.equal(before.responsible.fullName, `${guardianName} Torres`);
  assert.equal(before.sponsors[0].fullName, `${sponsorName} Solidario`);
  assert.equal(before.documents.find((d: { type: string }) => d.type === "ENROLLMENT_FORM").status, "PRINTED");
  assert.equal(before.documents.find((d: { type: string }) => d.type === "STUDENT_ID_CARD").status, "MISSING");
  assert.equal(before.history.length, 2);
  assert.equal(before.history.find((e: { id: string }) => e.id === oldEnrollmentId).documents[0].status, "SIGNED");
  const serialized = JSON.stringify(before);
  for (const privateValue of [cui, "cuiEncrypted", "storagePath", "dataSnapshot", "Información privada"]) assert.ok(!serialized.includes(privateValue));

  const body = { authorizedPickups: [pickup("Autorizada actual")] };
  assert.equal((await ctx.api(admin, `/students/${studentId}/authorized-pickups`, "PUT", body)).status, 200);
  const after = await summary();
  assert.deepEqual(after.authorizedPickups, body.authorizedPickups);
  assert.deepEqual(after.history, before.history);
  assert.equal(after.history.find((e: { id: string }) => e.id === oldEnrollmentId).authorizedPickups[0].givenNames, "Persona histórica");
});

test("los autorizados pasan a una nueva inscripción y los cambios del borrador aparecen en la ficha", async () => {
  const student = await ctx.createStudent();
  const cycle = await ctx.createCycle();
  await ctx.api(admin, `/students/${student.id}/authorized-pickups`, "PUT", { authorizedPickups: [pickup("Inicial")] });
  const created = await ctx.api(admin, "/enrollments", "POST", { studentId: student.id, academicCycleId: cycle.id, gradeId: ctx.gradeIds[0], applicationType: "NEW_ENROLLMENT" });
  assert.equal(created.status, 201);
  const enrollmentId = (await created.json()).data.id;
  const formPath = `/enrollments/${enrollmentId}/form`;
  assert.equal((await (await ctx.api(admin, formPath)).json()).data.form.contact.authorizedPickups[0].givenNames, "Inicial");
  assert.equal((await ctx.api(admin, formPath, "PATCH", { contact: { authorizedPickups: [pickup("Desde formulario")] } })).status, 200);
  assert.equal((await summary(student.id)).authorizedPickups[0].givenNames, "Desde formulario");
  await ctx.api(admin, `/students/${student.id}/authorized-pickups`, "PUT", { authorizedPickups: [pickup("Desde ficha")] });
  assert.equal((await (await ctx.api(admin, formPath)).json()).data.form.contact.authorizedPickups[0].givenNames, "Desde ficha");
  await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "CLOSED" } });
  await ctx.api(admin, `/students/${student.id}/authorized-pickups`, "PUT", { authorizedPickups: [] });
  assert.equal((await summary(student.id)).history[0].authorizedPickups[0].givenNames, "Desde ficha");
  assert.deepEqual((await summary(student.id)).authorizedPickups, []);
});

test("busca por los seis criterios y combina grado/ciclo en una misma inscripción", async () => {
  const grade = await prisma.grade.findUniqueOrThrow({ where: { id: ctx.gradeIds[1] } });
  const cycle = await prisma.academicCycle.findUniqueOrThrow({ where: { id: currentCycleId } });
  for (const query of ["Zapata Lucía", code.toLowerCase(), `${cui.slice(0, 4)} ${cui.slice(4)}`, grade.name, cycle.name, String(cycle.year), guardianName, sponsorName]) {
    const result = await ctx.api(collaborator, `/students?q=${encodeURIComponent(query)}&limit=100`);
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.ok(body.data.some((s: { id: string }) => s.id === studentId), `Falta resultado para ${query}`);
    assert.ok(!body.data.some((s: { id: string }) => s.id === foreignStudentId));
  }
  const matched = await (await ctx.api(admin, `/students?gradeId=${ctx.gradeIds[0]}&academicCycleId=${oldCycleId}`)).json();
  assert.ok(matched.data.some((s: { id: string }) => s.id === studentId));
  const mismatched = await (await ctx.api(admin, `/students?gradeId=${ctx.gradeIds[0]}&academicCycleId=${currentCycleId}`)).json();
  assert.ok(!mismatched.data.some((s: { id: string }) => s.id === studentId));
  assert.equal((await ctx.api(admin, "/students?gradeId=invalid")).status, 400);
  assert.equal((await ctx.api(admin, `/students?q=${"a".repeat(201)}`)).status, 400);
  assert.equal((await ctx.api(admin, `/students?q=${encodeURIComponent("' OR 1=1 --")}`)).status, 200);
});

test("el aislamiento del colegio cubre ficha, fotografía y autorizados", async () => {
  assert.equal((await ctx.api(admin, `/students/${foreignStudentId}/summary`)).status, 404);
  assert.equal((await ctx.api(admin, `/students/${foreignStudentId}/photo`)).status, 404);
  assert.equal((await ctx.api(admin, `/students/${foreignStudentId}/authorized-pickups`, "PUT", { authorizedPickups: [] })).status, 404);
  assert.equal((await ctx.api(admin, `/students/${studentId}/authorized-pickups`, "PUT", { authorizedPickups: [] })).headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  const denied = await fetch(`${ctx.baseUrl}/api/students/${studentId}/authorized-pickups`, { method: "PUT", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json", Origin: "https://otro.test" }, body: JSON.stringify({ authorizedPickups: [] }) });
  assert.equal(denied.status, 403);
});

test("entrega la fotografía con autenticación y sin revelar credenciales ni rutas", async () => {
  const originalFetch = globalThis.fetch;
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://photos.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "private-test-key";
  const bytes = new Uint8Array([137, 80, 78, 71]);
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://photos.example.test")) {
      assert.match(String(input), /foto%20privada\.png$/);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-test-key");
      return new Response(bytes);
    }
    return originalFetch(input, init);
  };
  try {
    const response = await ctx.api(collaborator, `/students/${studentId}/photo`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});

test("las búsquedas comunes responden en menos de dos segundos con 2000 alumnos adicionales", async (t) => {
  const data = Array.from({ length: 2000 }, (_, index) => {
    const id = randomUUID(); bulkIds.push(id);
    return { id, schoolId, studentCode: `PERF-${suffix}-${index}`, givenNames: `Estudiante ${index}`, firstSurname: "Rendimiento", searchName: `Estudiante ${index} Rendimiento` };
  });
  await prisma.student.createMany({ data });
  await prisma.enrollment.createMany({ data: bulkIds.map((studentId) => ({ studentId, academicCycleId: currentCycleId, gradeId: ctx.gradeIds[1], applicationType: "NEW_ENROLLMENT" as const })) });
  const cycle = await prisma.academicCycle.findUniqueOrThrow({ where: { id: currentCycleId } });
  const grade = await prisma.grade.findUniqueOrThrow({ where: { id: ctx.gradeIds[1] } });
  const durations: number[] = [];
  for (const query of ["Lucía Zapata", code, cui, grade.name, cycle.name, guardianName, sponsorName]) {
    const start = performance.now();
    const response = await ctx.api(collaborator, `/students?q=${encodeURIComponent(query)}&limit=10`);
    const body = await response.json();
    const elapsed = performance.now() - start; durations.push(elapsed);
    assert.equal(response.status, 200);
    assert.ok(body.data.length > 0 && body.data.length <= 10);
    assert.ok(body.pagination.total >= 1);
    assert.ok(elapsed < 2000, `La búsqueda tardó ${elapsed.toFixed(0)} ms`);
  }
  t.diagnostic(`Máximo de búsqueda con 2000 alumnos adicionales: ${Math.max(...durations).toFixed(1)} ms`);
});
