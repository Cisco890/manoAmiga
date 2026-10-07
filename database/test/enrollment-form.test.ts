import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../src/prisma";
import {
  missingEnrollmentFields,
  parseEnrollmentFormPatch,
  type EnrollmentFormData,
  type MissingField,
} from "../src/school/enrollmentForm";
import { completeEnrollmentForm, createSchoolTestContext } from "./support/schoolFixtures";

const emptyForm: EnrollmentFormData = {
  contact: {
    messageContactName: null,
    messageContactPhone: null,
    messageContactRelationship: null,
    mayLeaveAlone: false,
    authorizedPickups: [],
  },
  household: null,
  medical: null,
  signature: { signerName: null, signerRelationship: null },
};

const fullForm: EnrollmentFormData = {
  contact: {
    messageContactName: "María López",
    messageContactPhone: "5555-1234",
    messageContactRelationship: "Madre",
    mayLeaveAlone: false,
    authorizedPickups: [{ fullName: "José López", relationship: "Abuelo", phone: null }],
  },
  household: {
    livesWithMother: true,
    livesWithFather: false,
    livesWithSiblings: false,
    livesWithUncles: false,
    livesWithFriends: false,
    livesWithGrandparents: false,
    livesWithOther: false,
    otherDetails: null,
    householdSize: 3,
  },
  medical: {
    bloodType: "O+",
    bloodTypeUnknown: false,
    hasDiseaseOrAllergy: false,
    diseaseOrAllergyDetails: null,
    hasMedicationAllergy: false,
    medicationAllergyDetails: null,
    vaccinationsComplete: true,
    missingVaccines: null,
  },
  signature: { signerName: "María López", signerRelationship: "Madre" },
};

const fieldsOf = (missing: MissingField[]) => missing.map(({ field }) => field);

describe("missingEnrollmentFields", () => {
  test("un formulario vacío lista todos los obligatorios, agrupados por paso", () => {
    const missing = missingEnrollmentFields(emptyForm);
    assert.deepEqual(fieldsOf(missing), [
      "messageContactName",
      "messageContactPhone",
      "messageContactRelationship",
      "authorizedPickups",
      "livesWith",
      "householdSize",
      "bloodType",
      "signerName",
      "signerRelationship",
    ]);
    assert.deepEqual([...new Set(missing.map(({ step }) => step))], ["contact", "household", "medical", "signature"]);
    assert.ok(missing.every(({ label }) => label.length > 0));
  });

  test("un formulario completo no tiene faltantes", () => {
    assert.deepEqual(missingEnrollmentFields(fullForm), []);
  });

  test("los textos con solo espacios cuentan como vacíos", () => {
    const form = { ...fullForm, signature: { signerName: "   ", signerRelationship: "Madre" } };
    assert.deepEqual(fieldsOf(missingEnrollmentFields(form)), ["signerName"]);
  });

  test("no exige personas autorizadas si el alumno puede retirarse solo", () => {
    const contact = { ...fullForm.contact, mayLeaveAlone: true, authorizedPickups: [] };
    assert.deepEqual(missingEnrollmentFields({ ...fullForm, contact }), []);
    const withoutPermission = { ...contact, mayLeaveAlone: false };
    assert.deepEqual(fieldsOf(missingEnrollmentFields({ ...fullForm, contact: withoutPermission })), [
      "authorizedPickups",
    ]);
  });

  test("tipo de sangre desconocido es una respuesta válida", () => {
    const medical = { ...fullForm.medical!, bloodType: null, bloodTypeUnknown: true };
    assert.deepEqual(missingEnrollmentFields({ ...fullForm, medical }), []);
  });

  test("exige el detalle cuando se marca una condición", () => {
    const medical = {
      ...fullForm.medical!,
      hasDiseaseOrAllergy: true,
      hasMedicationAllergy: true,
      vaccinationsComplete: false,
    };
    const household = { ...fullForm.household!, livesWithOther: true };
    assert.deepEqual(fieldsOf(missingEnrollmentFields({ ...fullForm, medical, household })), [
      "otherDetails",
      "diseaseOrAllergyDetails",
      "medicationAllergyDetails",
      "missingVaccines",
    ]);
  });
});

describe("parseEnrollmentFormPatch", () => {
  test("acepta borradores parciales y normaliza espacios", () => {
    const patch = parseEnrollmentFormPatch({ signature: { signerName: "  Ana  " } });
    assert.deepEqual(patch, {
      contact: undefined,
      household: undefined,
      medical: undefined,
      signature: { signerName: "Ana" },
    });
  });

  test("rechaza campos desconocidos, tipos incorrectos y más de 3 personas autorizadas", () => {
    const pickup = { fullName: "Ana", relationship: "Tía" };
    for (const body of [
      { status: "APPROVED" },
      { signature: { approvedByUserId: "x" } },
      { household: { householdSize: 0 } },
      { household: { livesWithMother: "sí" } },
      { contact: { authorizedPickups: [pickup, pickup, pickup, pickup] } },
      { contact: { authorizedPickups: [{ fullName: "Ana" }] } },
    ]) {
      assert.throws(() => parseEnrollmentFormPatch(body), { status: 400 }, JSON.stringify(body));
    }
  });
});

describe("API del formulario de inscripción", () => {
  let context: Awaited<ReturnType<typeof createSchoolTestContext>>;
  let adminToken = "";

  before(async () => {
    context = await createSchoolTestContext("ma25");
    adminToken = await context.login("admin");
  });

  after(async () => {
    await context.cleanup();
  });

  async function draftEnrollment() {
    const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
    return context.createEnrollmentRow(student.id, cycle.id, "DRAFT");
  }

  type FormBody = { data: { editable: boolean; missingFields: MissingField[]; form: EnrollmentFormData } };

  test("no permite enviar a revisión con campos faltantes y devuelve cuáles son", async () => {
    const enrollment = await draftEnrollment();

    const response = await context.api(adminToken, `/enrollments/${enrollment.id}/status`, "PATCH", {
      status: "PENDING_REVIEW",
    });
    assert.equal(response.status, 422);
    const body = (await response.json()) as { message: string; missingFields: MissingField[] };
    assert.match(body.message, /faltan 9 campos obligatorios/);
    assert.equal(body.missingFields.length, 9);
    assert.deepEqual(body.missingFields[0], {
      step: "contact",
      field: "messageContactName",
      label: "Nombre del contacto para mensajes",
    });

    const unchanged = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    assert.equal(unchanged.status, "DRAFT");
  });

  test("guarda el borrador por pasos y permite enviarlo cuando está completo", async () => {
    const enrollment = await draftEnrollment();
    const path = `/enrollments/${enrollment.id}/form`;

    const initial = (await (await context.api(adminToken, path)).json()) as FormBody;
    assert.equal(initial.data.editable, true);
    assert.equal(initial.data.missingFields.length, 9);

    let remaining = 9;
    for (const step of ["contact", "household", "medical", "signature"] as const) {
      const saved = await context.api(adminToken, path, "PATCH", { [step]: completeEnrollmentForm[step] });
      assert.equal(saved.status, 200, step);
      const { data } = (await saved.json()) as FormBody;
      assert.ok(data.missingFields.length < remaining, `el paso ${step} debe reducir los faltantes`);
      assert.ok(data.missingFields.every((missing) => missing.step !== step), `quedan faltantes en ${step}`);
      remaining = data.missingFields.length;
    }
    assert.equal(remaining, 0);

    const reloaded = (await (await context.api(adminToken, path)).json()) as FormBody;
    assert.equal(reloaded.data.form.contact.authorizedPickups[0].fullName, "José López");
    assert.equal(reloaded.data.form.household?.householdSize, 4);

    const submitted = await context.api(adminToken, `/enrollments/${enrollment.id}/status`, "PATCH", {
      status: "PENDING_REVIEW",
    });
    assert.equal(submitted.status, 200);
  });

  test("reemplaza la lista de personas autorizadas al guardar", async () => {
    const enrollment = await draftEnrollment();
    const path = `/enrollments/${enrollment.id}/form`;
    await context.api(adminToken, path, "PATCH", {
      contact: {
        authorizedPickups: [
          { fullName: "Uno", relationship: "Tío" },
          { fullName: "Dos", relationship: "Tía" },
        ],
      },
    });
    await context.api(adminToken, path, "PATCH", {
      contact: { authorizedPickups: [{ fullName: "Tres", relationship: "Abuela" }] },
    });

    const pickups = await prisma.authorizedPickup.findMany({ where: { enrollmentId: enrollment.id } });
    assert.deepEqual(
      pickups.map(({ fullName, sortOrder }) => [fullName, sortOrder]),
      [["Tres", 1]],
    );
  });

  test("solo se edita en Borrador o Incompleta", async () => {
    const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
    const pending = await context.createEnrollmentRow(student.id, cycle.id, "PENDING_REVIEW");

    const response = await context.api(adminToken, `/enrollments/${pending.id}/form`, "PATCH", {
      signature: { signerName: "Otra persona" },
    });
    assert.equal(response.status, 409);
    const form = (await (await context.api(adminToken, `/enrollments/${pending.id}/form`)).json()) as FormBody;
    assert.equal(form.data.editable, false);
  });

  test("un colaborador no puede ver ni editar el formulario", async () => {
    const enrollment = await draftEnrollment();
    const token = await context.login("collaborator");
    assert.equal((await context.api(token, `/enrollments/${enrollment.id}/form`)).status, 403);
    assert.equal(
      (await context.api(token, `/enrollments/${enrollment.id}/form`, "PATCH", { signature: {} })).status,
      403,
    );
  });
});
