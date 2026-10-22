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
  family: { hasPrimaryGuardian: false, studentAddress: null },
  contact: {
    messageContactGivenNames: null,
    messageContactFirstSurname: null,
    messageContactSecondSurname: null,
    messageContactPhone: null,
    messageContactRelationship: null,
    mayLeaveAlone: false,
    authorizedPickups: [],
  },
  household: null,
  medical: null,
  signature: {
    signerGivenNames: null,
    signerFirstSurname: null,
    signerSecondSurname: null,
    signerRelationship: null,
  },
};

const fullForm: EnrollmentFormData = {
  family: { hasPrimaryGuardian: true, studentAddress: "4a. calle 3-25, Zona 5, Mixco, Guatemala" },
  contact: {
    messageContactGivenNames: "María",
    messageContactFirstSurname: "López",
    messageContactSecondSurname: null,
    messageContactPhone: "5555-1234",
    messageContactRelationship: "Madre",
    mayLeaveAlone: false,
    authorizedPickups: [
      {
        givenNames: "José",
        firstSurname: "López",
        secondSurname: null,
        relationship: "Abuelo",
        phone: null,
      },
    ],
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
  signature: {
    signerGivenNames: "María",
    signerFirstSurname: "López",
    signerSecondSurname: null,
    signerRelationship: "Madre",
  },
};

const fieldsOf = (missing: MissingField[]) => missing.map(({ field }) => field);

describe("missingEnrollmentFields", () => {
  test("un formulario vacío lista todos los obligatorios, agrupados por paso", () => {
    const missing = missingEnrollmentFields(emptyForm);
    assert.deepEqual(fieldsOf(missing), [
      "primaryGuardian",
      "studentAddress",
      "messageContactGivenNames",
      "messageContactFirstSurname",
      "messageContactPhone",
      "messageContactRelationship",
      "authorizedPickups",
      "livesWith",
      "householdSize",
      "bloodType",
      "signerGivenNames",
      "signerFirstSurname",
      "signerRelationship",
    ]);
    assert.deepEqual([...new Set(missing.map(({ step }) => step))], ["family", "contact", "household", "medical", "signature"]);
    assert.ok(missing.every(({ label }) => label.length > 0));
  });

  test("un formulario completo no tiene faltantes", () => {
    assert.deepEqual(missingEnrollmentFields(fullForm), []);
  });

  test("los textos con solo espacios cuentan como vacíos", () => {
    const form = {
      ...fullForm,
      signature: {
        signerGivenNames: "   ",
        signerFirstSurname: "López",
        signerSecondSurname: null,
        signerRelationship: "Madre",
      },
    };
    assert.deepEqual(fieldsOf(missingEnrollmentFields(form)), ["signerGivenNames"]);
  });

  test("no exige personas autorizadas si el alumno puede retirarse solo", () => {
    const contact = { ...fullForm.contact, mayLeaveAlone: true, authorizedPickups: [] };
    assert.deepEqual(missingEnrollmentFields({ ...fullForm, contact }), []);
    const withoutPermission = { ...contact, mayLeaveAlone: false };
    assert.deepEqual(fieldsOf(missingEnrollmentFields({ ...fullForm, contact: withoutPermission })), [
      "authorizedPickups",
    ]);
  });

  test("exige un responsable principal vigente (MA-27)", () => {
    const form = { ...fullForm, family: { ...fullForm.family, hasPrimaryGuardian: false } };
    assert.deepEqual(missingEnrollmentFields(form), [
      { step: "family", field: "primaryGuardian", label: "Padre, madre o tutor marcado como responsable principal" },
    ]);
  });

  test("exige la dirección del alumno (MA-28)", () => {
    const form = { ...fullForm, family: { ...fullForm.family, studentAddress: null } };
    assert.deepEqual(missingEnrollmentFields(form), [
      { step: "family", field: "studentAddress", label: "Dirección del alumno" },
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
    const patch = parseEnrollmentFormPatch({ signature: { signerGivenNames: "  Ana  " } });
    assert.deepEqual(patch, {
      contact: undefined,
      household: undefined,
      medical: undefined,
      signature: { signerGivenNames: "Ana" },
    });
  });

  test("rechaza campos desconocidos, tipos incorrectos y más de 3 personas autorizadas", () => {
    const pickup = { givenNames: "Ana", firstSurname: "Pérez", relationship: "Tía" };
    for (const body of [
      { status: "APPROVED" },
      { signature: { approvedByUserId: "x" } },
      { household: { householdSize: 0 } },
      { household: { livesWithMother: "sí" } },
      { contact: { authorizedPickups: [pickup, pickup, pickup, pickup] } },
      { contact: { authorizedPickups: [{ givenNames: "Ana" }] } },
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
    assert.match(body.message, /faltan 13 campos obligatorios/);
    assert.equal(body.missingFields.length, 13);
    assert.deepEqual(body.missingFields[2], {
      step: "contact",
      field: "messageContactGivenNames",
      label: "Nombres del contacto para mensajes",
    });

    const unchanged = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    assert.equal(unchanged.status, "DRAFT");
  });

  test("guarda el borrador por pasos y permite enviarlo cuando está completo", async () => {
    const enrollment = await draftEnrollment();
    const path = `/enrollments/${enrollment.id}/form`;

    const initial = (await (await context.api(adminToken, path)).json()) as FormBody;
    assert.equal(initial.data.editable, true);
    assert.equal(initial.data.missingFields.length, 13);

    let remaining = 13;
    for (const step of ["contact", "household", "medical", "signature"] as const) {
      const saved = await context.api(adminToken, path, "PATCH", { [step]: completeEnrollmentForm[step] });
      assert.equal(saved.status, 200, step);
      const { data } = (await saved.json()) as FormBody;
      assert.ok(data.missingFields.length < remaining, `el paso ${step} debe reducir los faltantes`);
      assert.ok(data.missingFields.every((missing) => missing.step !== step), `quedan faltantes en ${step}`);
      remaining = data.missingFields.length;
    }
    // El responsable y la dirección se registran en la ficha del alumno, no con el PATCH del formulario.
    assert.deepEqual(fieldsOf((await (await context.api(adminToken, path)).json() as FormBody).data.missingFields), [
      "primaryGuardian",
      "studentAddress",
    ]);
    const { studentId } = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    await context.completeStudentRecord(studentId);

    const reloaded = (await (await context.api(adminToken, path)).json()) as FormBody;
    assert.deepEqual(reloaded.data.missingFields, []);
    assert.equal(reloaded.data.form.family.hasPrimaryGuardian, true);
    // La ficha de inscripción (y su PDF) reutiliza la dirección formateada del alumno.
    assert.equal(reloaded.data.form.family.studentAddress, "4a. calle 3-25, Zona 5, Colonia El Esfuerzo, Mixco, Guatemala");
    assert.equal(reloaded.data.form.contact.authorizedPickups[0].givenNames, "José");
    assert.equal(reloaded.data.form.contact.authorizedPickups[0].firstSurname, "López");
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
          { givenNames: "Uno", firstSurname: "A", relationship: "Tío" },
          { givenNames: "Dos", firstSurname: "B", relationship: "Tía" },
        ],
      },
    });
    await context.api(adminToken, path, "PATCH", {
      contact: {
        authorizedPickups: [{ givenNames: "Tres", firstSurname: "C", relationship: "Abuela" }],
      },
    });

    const pickups = await prisma.authorizedPickup.findMany({ where: { enrollmentId: enrollment.id } });
    assert.deepEqual(
      pickups.map(({ givenNames, firstSurname, sortOrder }) => [givenNames, firstSurname, sortOrder]),
      [["Tres", "C", 1]],
    );
  });

  test("solo se edita en Borrador o Incompleta", async () => {
    const [cycle, student] = await Promise.all([context.createCycle(), context.createStudent()]);
    const pending = await context.createEnrollmentRow(student.id, cycle.id, "PENDING_REVIEW");

    const response = await context.api(adminToken, `/enrollments/${pending.id}/form`, "PATCH", {
      signature: { signerGivenNames: "Otra", signerFirstSurname: "Persona" },
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
      (
        await context.api(token, `/enrollments/${enrollment.id}/form`, "PATCH", {
          contact: { messageContactGivenNames: "X" },
        })
      ).status,
      403,
    );
  });
});
