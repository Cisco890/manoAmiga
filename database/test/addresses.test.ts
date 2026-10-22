import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/prisma";
import { formatAddress } from "../src/school/addresses";
import { createSchoolTestContext, sampleAddress } from "./support/schoolFixtures";

let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
let admin: string, collaborator: string;
const guardianIds: string[] = [];
const studentIds: string[] = [];

before(async () => {
  ctx = await createSchoolTestContext("ma28");
  admin = await ctx.login("admin");
  collaborator = await ctx.login("collaborator");
});

after(async () => {
  if (!ctx) return;
  const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { addressId: true } });
  const guardians = await prisma.guardian.findMany({ where: { id: { in: guardianIds } }, select: { addressId: true } });
  await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: guardianIds } } });
  await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
  const addressIds = [...students, ...guardians].map((row) => row.addressId).filter((id): id is string => Boolean(id));
  await prisma.student.updateMany({ where: { id: { in: studentIds } }, data: { addressId: null } });
  await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
  await ctx.cleanup();
});

type AddressBody = { data: { address: { id: string; formatted: string; municipality: string } | null; sharedWith?: Array<{ type: string; id: string }> } };

async function studentWithGuardian() {
  const student = await ctx.createStudent();
  studentIds.push(student.id);
  const response = await ctx.api(admin, `/students/${student.id}/guardians`, "POST", {
    relationship: "MOTHER",
    guardian: { givenNames: "Madre", firstSurname: "Dirección" },
  });
  assert.equal(response.status, 201);
  const { data } = (await response.json()) as { data: { guardian: { id: string } } };
  guardianIds.push(data.guardian.id);
  return { studentId: student.id, guardianId: data.guardian.id };
}

const putStudentAddress = (studentId: string, body: unknown, token = admin) =>
  ctx.api(token, `/students/${studentId}/address`, "PUT", body);
const putGuardianAddress = (guardianId: string, body: unknown, token = admin) =>
  ctx.api(token, `/guardians/${guardianId}/address`, "PUT", body);
const guardianLink = async (studentId: string) => {
  const { data } = (await (await ctx.api(admin, `/students/${studentId}/guardians`)).json()) as {
    data: Array<{ guardian: { address: { id: string; formatted: string } | null; sharesStudentAddress: boolean } }>;
  };
  return data[0].guardian;
};

test("formatAddress arma la dirección en una línea y omite lo vacío", () => {
  assert.equal(
    formatAddress({ ...sampleAddress, lot: "12", block: "B", sector: null, village: null, country: "Guatemala", reference: "Frente a la iglesia" }),
    "4a. calle 3-25, Lote 12, Manzana B, Zona 5, Colonia El Esfuerzo, Mixco, Guatemala",
  );
  assert.equal(
    formatAddress({ fullAddress: null, lot: null, block: null, sector: null, zone: null, neighborhood: null, village: "Aldea Las Flores", municipality: "Chinautla", department: "Guatemala", country: "El Salvador", reference: null }),
    "Aldea Las Flores, Chinautla, Guatemala, El Salvador",
  );
  assert.equal(formatAddress(null), null);
});

test("registra la dirección del alumno y la reutiliza en la ficha y el formulario", async () => {
  const { studentId } = await studentWithGuardian();
  const created = await putStudentAddress(studentId, { ...sampleAddress, reference: "Casa verde" });
  assert.equal(created.status, 200);
  const { data } = (await created.json()) as AddressBody;
  assert.equal(data.address?.formatted, "4a. calle 3-25, Zona 5, Colonia El Esfuerzo, Mixco, Guatemala");

  const read = (await (await ctx.api(collaborator, `/students/${studentId}/address`)).json()) as AddressBody;
  assert.equal(read.data.address?.id, data.address?.id);
  const summary = (await (await ctx.api(collaborator, `/students/${studentId}/summary`)).json()) as {
    data: { address: { formatted: string } | null };
  };
  assert.equal(summary.data.address?.formatted, data.address?.formatted);

  const cycle = await ctx.createCycle();
  const enrollment = await ctx.createEnrollmentRow(studentId, cycle.id);
  const form = (await (await ctx.api(admin, `/enrollments/${enrollment.id}/form`)).json()) as {
    data: { form: { family: { studentAddress: string } }; missingFields: Array<{ field: string }> };
  };
  assert.equal(form.data.form.family.studentAddress, data.address?.formatted);
  assert.ok(!form.data.missingFields.some((field) => field.field === "studentAddress"));

  // Guardar otra vez actualiza la misma fila en lugar de crear otra.
  const updated = (await (await putStudentAddress(studentId, { ...sampleAddress, zone: "7" })).json()) as AddressBody;
  assert.equal(updated.data.address?.id, data.address?.id);
  assert.match(updated.data.address?.formatted ?? "", /Zona 7/);
});

test("un responsable comparte la dirección del alumno y la cambia con él", async () => {
  const { studentId, guardianId } = await studentWithGuardian();
  assert.equal((await putGuardianAddress(guardianId, { sameAsStudentId: studentId })).status, 409, "el alumno aún no tiene dirección");
  await putStudentAddress(studentId, sampleAddress);

  const shared = await putGuardianAddress(guardianId, { sameAsStudentId: studentId });
  assert.equal(shared.status, 200);
  const studentAddress = (await (await ctx.api(admin, `/students/${studentId}/address`)).json()) as AddressBody;
  assert.deepEqual(studentAddress.data.sharedWith?.map((user) => [user.type, user.id]), [["guardian", guardianId]]);
  assert.equal((await guardianLink(studentId)).sharesStudentAddress, true);
  assert.equal(await prisma.address.count({ where: { id: studentAddress.data.address!.id } }), 1);

  // Editar la dirección del hogar desde el alumno la actualiza para el responsable.
  await putStudentAddress(studentId, { ...sampleAddress, fullAddress: "6a. avenida 10-01" });
  assert.match((await guardianLink(studentId)).address?.formatted ?? "", /^6a\. avenida 10-01/);
});

test("si el responsable se muda recibe su propia dirección y el alumno conserva la suya", async () => {
  const { studentId, guardianId } = await studentWithGuardian();
  await putStudentAddress(studentId, sampleAddress);
  await putGuardianAddress(guardianId, { sameAsStudentId: studentId });
  const studentAddressId = (await prisma.student.findUniqueOrThrow({ where: { id: studentId } })).addressId;

  const moved = await putGuardianAddress(guardianId, { address: { fullAddress: "Km 18 carretera a El Salvador", municipality: "Fraijanes", department: "Guatemala" } });
  assert.equal(moved.status, 200);
  const movedAddress = ((await moved.json()) as AddressBody).data.address!;
  assert.notEqual(movedAddress.id, studentAddressId);
  assert.equal((await guardianLink(studentId)).sharesStudentAddress, false);
  const student = (await (await ctx.api(admin, `/students/${studentId}/address`)).json()) as AddressBody;
  assert.equal(student.data.address?.municipality, "Mixco");
  assert.deepEqual(student.data.sharedWith, []);

  // Su dirección propia, sin compartir, se edita en su lugar; quitarla elimina la fila huérfana.
  const edited = (await (await putGuardianAddress(guardianId, { address: { village: "Aldea El Cerrito", municipality: "Fraijanes", department: "Guatemala" } })).json()) as AddressBody;
  assert.equal(edited.data.address?.id, movedAddress.id);
  assert.equal((await putGuardianAddress(guardianId, { address: null })).status, 200);
  assert.equal(await prisma.address.count({ where: { id: movedAddress.id } }), 0);
  assert.equal((await guardianLink(studentId)).address, null);
});

test("valida los campos y los permisos de las direcciones", async () => {
  const { studentId, guardianId } = await studentWithGuardian();
  for (const body of [
    null,
    { fullAddress: "Calle 1", department: "Guatemala" },
    { fullAddress: "Calle 1", municipality: "Mixco" },
    { municipality: "Mixco", department: "Guatemala" },
    { ...sampleAddress, zone: "x".repeat(21) },
    { ...sampleAddress, zone: 5 },
    { ...sampleAddress, studentId },
  ]) {
    assert.equal((await putStudentAddress(studentId, body)).status, 400, JSON.stringify(body));
  }
  for (const body of [{}, { sameAsStudentId: "x" }, { sameAsStudentId: studentId, address: null }, { address: { zone: "1" } }]) {
    assert.equal((await putGuardianAddress(guardianId, body)).status, 400, JSON.stringify(body));
  }
  const other = await ctx.createStudent();
  studentIds.push(other.id);
  await putStudentAddress(other.id, sampleAddress);
  assert.equal((await putGuardianAddress(guardianId, { sameAsStudentId: other.id })).status, 404, "no es responsable de ese alumno");

  assert.equal((await putStudentAddress(studentId, sampleAddress, collaborator)).status, 403);
  assert.equal((await putGuardianAddress(guardianId, { address: null }, collaborator)).status, 403);
  assert.equal((await ctx.api(collaborator, `/students/${studentId}/address`)).status, 200);
  assert.equal((await fetch(`${ctx.baseUrl}/api/students/${studentId}/address`)).status, 401);

  assert.equal((await putStudentAddress(studentId, sampleAddress)).status, 200);
  const audits = await prisma.auditEvent.findMany({ where: { entityType: "Address", afterData: { path: ["studentId"], equals: studentId } } });
  assert.equal(audits.length, 1);
  assert.ok(!JSON.stringify(audits.map(({ afterData }) => afterData)).includes("Mixco"), "la auditoría no copia la dirección");
});

test("OpenAPI documenta los endpoints de direcciones", async () => {
  const openApi = (await (await fetch(`${ctx.baseUrl}/api/openapi.json`)).json()) as { paths: Record<string, unknown> };
  for (const path of ["/api/students/{id}/address", "/api/guardians/{id}/address"]) assert.ok(openApi.paths[path], path);
});
