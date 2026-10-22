import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";
import { decryptMedicalText, encryptMedicalText, isEncryptedMedicalText } from "../src/privacy/medical";
import { createSchoolTestContext } from "./support/schoolFixtures";

const secretDetail = `Alergia a la penicilina ${randomUUID().slice(0, 8)}`;
const emergencyNote = "Llamar a la madre y aplicar epinefrina";

describe("cifrado de textos médicos", () => {
  test("cifra con AES-256-GCM, descifra y detecta alteraciones", () => {
    const encrypted = encryptMedicalText(secretDetail);
    assert.ok(isEncryptedMedicalText(encrypted));
    assert.ok(!encrypted.includes("penicilina"));
    assert.notEqual(encryptMedicalText(secretDetail), encrypted, "cada cifrado usa un IV distinto");
    assert.equal(decryptMedicalText(encrypted), secretDetail);
    assert.equal(encryptMedicalText(null), null);

    const [prefix, iv, tag, data] = encrypted.split(/(?<=enc:v1:)|\./);
    const tampered = `${prefix}${iv}.${tag}.${data.slice(0, -2)}AA`;
    assert.throws(() => decryptMedicalText(tampered));
  });

  test("los textos guardados antes del cifrado se siguen leyendo", () => {
    assert.equal(decryptMedicalText("Asma leve"), "Asma leve");
    assert.equal(decryptMedicalText(null), null);
  });
});

describe("perfil médico del alumno (MA-29)", () => {
  let ctx: Awaited<ReturnType<typeof createSchoolTestContext>>;
  let admin = "", collaborator = "", noMedical = "";
  let roleId = "", userId = "";

  before(async () => {
    ctx = await createSchoolTestContext("ma29");
    admin = await ctx.login("admin");
    collaborator = await ctx.login("collaborator");

    // Un rol que edita inscripciones pero no ve datos médicos (como Padrinazgo o Impresión).
    const permissions = await prisma.permission.findMany({
      where: { code: { in: ["student.read", "enrollment.read", "enrollment.write"] } },
      select: { id: true },
    });
    const suffix = randomUUID().slice(0, 8);
    roleId = (await prisma.role.create({
      data: { code: `MA29_SIN_SALUD_${suffix}`, name: "Sin datos médicos", permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) } },
    })).id;
    const school = await prisma.school.findUniqueOrThrow({ where: { code: "MANO_AMIGA" } });
    const email = `ma29-no-medical-${suffix}@example.test`;
    userId = (await prisma.user.create({
      data: {
        schoolId: school.id, email, displayName: "Sin salud", passwordHash: await bcrypt.hash("ClaveSinSalud-2026", 4),
        roles: { create: { roleId } },
      },
    })).id;
    const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "ClaveSinSalud-2026" }),
    });
    noMedical = ((await login.json()) as { accessToken: string }).accessToken;
  });

  after(async () => {
    if (userId) {
      await prisma.auditEvent.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (ctx) await ctx.cleanup();
  });

  async function enrollmentWithMedical() {
    const [cycle, student] = [await ctx.createCycle(), await ctx.createStudent()];
    const enrollment = await ctx.createEnrollmentRow(student.id, cycle.id);
    const saved = await ctx.api(admin, `/enrollments/${enrollment.id}/form`, "PATCH", {
      medical: {
        bloodType: "O+",
        hasMedicationAllergy: true,
        medicationAllergyDetails: secretDetail,
        vaccinationsComplete: false,
        missingVaccines: "Refuerzo de tétanos",
        emergencyMedicalNotes: emergencyNote,
      },
    });
    assert.equal(saved.status, 200);
    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  test("los textos libres se guardan cifrados y se leen descifrados con permiso", async () => {
    const { studentId, enrollmentId } = await enrollmentWithMedical();
    const [raw] = await prisma.$queryRaw<Array<Record<string, string | null>>>`
      SELECT blood_type, medication_allergy_details, missing_vaccines, emergency_medical_notes
      FROM medical_profiles WHERE enrollment_id = ${enrollmentId}::uuid`;
    assert.equal(raw.blood_type, "O+");
    for (const column of ["medication_allergy_details", "missing_vaccines", "emergency_medical_notes"]) {
      assert.ok(raw[column]?.startsWith("enc:v1:"), column);
    }
    assert.ok(!JSON.stringify(raw).includes("penicilina"));

    const form = (await (await ctx.api(admin, `/enrollments/${enrollmentId}/form`)).json()) as {
      data: { medicalRestricted: boolean; form: { medical: { medicationAllergyDetails: string; emergencyMedicalNotes: string } } };
    };
    assert.equal(form.data.medicalRestricted, false);
    assert.equal(form.data.form.medical.medicationAllergyDetails, secretDetail);
    assert.equal(form.data.form.medical.emergencyMedicalNotes, emergencyNote);

    const profile = await ctx.api(admin, `/students/${studentId}/medical-profile`);
    assert.equal(profile.status, 200);
    const { data } = (await profile.json()) as { data: { profile: Record<string, unknown>; enrollment: { id: string } } };
    assert.equal(data.enrollment.id, enrollmentId);
    assert.equal(data.profile.medicationAllergyDetails, secretDetail);
    assert.equal(data.profile.missingVaccines, "Refuerzo de tétanos");
  });

  test("solo los roles autorizados ven el perfil médico", async () => {
    const { studentId, enrollmentId } = await enrollmentWithMedical();
    assert.equal((await ctx.api(collaborator, `/students/${studentId}/medical-profile`)).status, 403);
    assert.equal((await ctx.api(noMedical, `/students/${studentId}/medical-profile`)).status, 403);
    assert.equal((await fetch(`${ctx.baseUrl}/api/students/${studentId}/medical-profile`)).status, 401);

    // Ni la ficha resumida ni la búsqueda incluyen datos médicos.
    const summary = await (await ctx.api(collaborator, `/students/${studentId}/summary`)).text();
    assert.ok(!summary.includes("penicilina") && !summary.includes("O+") && !summary.includes("tétanos"));

    // Quien edita inscripciones sin permiso médico ve el formulario sin la sección de salud.
    const restricted = (await (await ctx.api(noMedical, `/enrollments/${enrollmentId}/form`)).json()) as {
      data: { medicalRestricted: boolean; form: { medical: unknown; contact: unknown }; missingFields: Array<{ field: string }> };
    };
    assert.equal(restricted.data.medicalRestricted, true);
    assert.equal(restricted.data.form.medical, null);
    assert.ok(restricted.data.form.contact);
    assert.ok(!JSON.stringify(restricted).includes("penicilina"));
    assert.ok(!restricted.data.missingFields.some((field) => field.field === "bloodType"), "los faltantes usan los datos reales");

    const blocked = await ctx.api(noMedical, `/enrollments/${enrollmentId}/form`, "PATCH", { medical: { bloodType: "A-" } });
    assert.equal(blocked.status, 403);
    const allowed = await ctx.api(noMedical, `/enrollments/${enrollmentId}/form`, "PATCH", { signature: { signerGivenNames: "Ana" } });
    assert.equal(allowed.status, 200);
    const stored = await prisma.medicalProfile.findUniqueOrThrow({ where: { enrollmentId } });
    assert.equal(stored.bloodType, "O+");
  });

  test("cada consulta queda auditada sin copiar datos médicos", async () => {
    const { studentId } = await enrollmentWithMedical();
    await ctx.api(admin, `/students/${studentId}/medical-profile`);
    const views = await prisma.auditEvent.findMany({ where: { action: "VIEW", entityType: "MedicalProfile", entityId: studentId } });
    assert.equal(views.length, 1);
    const updates = await prisma.auditEvent.findMany({ where: { entityType: "Enrollment", afterData: { path: ["formSections"], array_contains: ["medical"] } } });
    const serialized = JSON.stringify([...views, ...updates].map(({ beforeData, afterData }) => [beforeData, afterData]));
    assert.ok(!serialized.includes("penicilina") && !serialized.includes("epinefrina"));
  });

  test("un alumno sin perfil médico devuelve profile null", async () => {
    const student = await ctx.createStudent();
    const response = await ctx.api(admin, `/students/${student.id}/medical-profile`);
    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { data: unknown }).data, { profile: null, enrollment: null });
    assert.equal((await ctx.api(admin, `/students/${randomUUID()}/medical-profile`)).status, 404);
  });

  test("OpenAPI documenta el perfil médico", async () => {
    const openApi = (await (await fetch(`${ctx.baseUrl}/api/openapi.json`)).json()) as { paths: Record<string, unknown> };
    assert.ok(openApi.paths["/api/students/{id}/medical-profile"]);
  });
});
