import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  getEnrollmentForm,
  MissingFieldsError,
  saveEnrollmentForm,
  submitEnrollmentForReview,
  type EnrollmentForm,
  type EnrollmentFormData,
  type FormStepId,
  type MissingField,
} from '../../api/enrollmentForm.ts';
import type { Enrollment } from '../../api/school.ts';
import { ApiError } from '../../auth/api.ts';
import { StudentAddressPanel } from './AddressForm.tsx';
import { GuardiansPanel } from './GuardiansPanel.tsx';
import modalStyles from './FormModal.module.css';
import styles from './EnrollmentFormWizard.module.css';

type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<Response>;
type WizardStep = FormStepId | 'review';

const stepOrder: WizardStep[] = ['family', 'contact', 'household', 'medical', 'signature', 'review'];
const stepLabels: Record<WizardStep, string> = {
  family: 'Responsables y dirección',
  contact: 'Contacto y salida',
  household: 'Hogar',
  medical: 'Salud',
  signature: 'Firma',
  review: 'Revisar y enviar',
};
const maxPickups = 3;

const emptyHousehold: NonNullable<EnrollmentFormData['household']> = {
  livesWithMother: false,
  livesWithFather: false,
  livesWithSiblings: false,
  livesWithUncles: false,
  livesWithFriends: false,
  livesWithGrandparents: false,
  livesWithOther: false,
  otherDetails: null,
  householdSize: null,
};
const emptyMedical: NonNullable<EnrollmentFormData['medical']> = {
  bloodType: null,
  bloodTypeUnknown: false,
  hasDiseaseOrAllergy: false,
  diseaseOrAllergyDetails: null,
  hasMedicationAllergy: false,
  medicationAllergyDetails: null,
  vaccinationsComplete: null,
  missingVaccines: null,
};
const livesWithOptions: Array<[keyof typeof emptyHousehold, string]> = [
  ['livesWithMother', 'Madre'],
  ['livesWithFather', 'Padre'],
  ['livesWithSiblings', 'Hermanos'],
  ['livesWithGrandparents', 'Abuelos'],
  ['livesWithUncles', 'Tíos'],
  ['livesWithFriends', 'Amigos'],
  ['livesWithOther', 'Otros'],
];

type EnrollmentFormWizardProps = {
  enrollment: Enrollment;
  request: AuthenticatedRequest;
  initialStep?: WizardStep;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
};

export function EnrollmentFormWizard({
  enrollment,
  request,
  initialStep = 'family',
  onClose,
  onSubmitted,
}: EnrollmentFormWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [loaded, setLoaded] = useState<EnrollmentForm | null>(null);
  const [form, setForm] = useState<EnrollmentFormData | null>(null);
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const applyForm = useCallback((data: EnrollmentForm) => {
    setLoaded(data);
    setForm({
      ...data.form,
      household: data.form.household ?? emptyHousehold,
      medical: data.form.medical ?? emptyMedical,
    });
    setMissing(data.missingFields);
  }, []);

  const reloadForm = useCallback(async () => {
    try {
      applyForm((await getEnrollmentForm(request, enrollment.id)).data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo actualizar el formulario.');
    }
  }, [applyForm, enrollment.id, request]);

  useEffect(() => {
    let active = true;
    getEnrollmentForm(request, enrollment.id)
      .then(({ data }) => {
        if (active) applyForm(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el formulario.');
      });
    return () => {
      active = false;
    };
  }, [applyForm, enrollment.id, request]);

  const editable = loaded?.editable ?? false;
  const missingIn = (stepId: WizardStep) => missing.filter((field) => field.step === stepId);

  async function saveStep(current: WizardStep) {
    // Los responsables se guardan al instante desde su panel; no forman parte del PATCH.
    if (!form || !editable || current === 'review' || current === 'family') return true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await saveEnrollmentForm(request, enrollment.id, { [current]: form[current] });
      applyForm(data);
      setNotice('Borrador guardado.');
      return true;
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'No se pudo guardar el borrador.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goTo(next: WizardStep) {
    if (await saveStep(step)) setStep(next);
  }

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await submitEnrollmentForReview(request, enrollment.id);
      await onSubmitted();
    } catch (submitError) {
      if (submitError instanceof MissingFieldsError) setMissing(submitError.missingFields);
      setError(submitError instanceof ApiError ? submitError.message : 'No se pudo enviar a revisión.');
      setBusy(false);
    }
  }

  function updateSection<K extends FormStepId>(section: K, values: Partial<NonNullable<EnrollmentFormData[K]>>) {
    setForm((current) => (current ? { ...current, [section]: { ...current[section], ...values } } : current));
  }

  const index = stepOrder.indexOf(step);

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={`${modalStyles.modal} ${styles.wide}`} role="dialog" aria-modal="true" aria-labelledby="enrollment-wizard-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="enrollment-wizard-title">Formulario de inscripción</h2>
            <p>
              {enrollment.student.fullName} · {enrollment.grade.name} · {enrollment.academicCycle.name}
            </p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className={styles.steps} aria-label="Pasos del formulario">
          {stepOrder.map((stepId, position) => {
            const pending = stepId === 'review' ? missing.length : missingIn(stepId).length;
            return (
              <button
                key={stepId}
                type="button"
                className={`${styles.step} ${stepId === step ? styles.stepActive : ''}`}
                aria-current={stepId === step ? 'step' : undefined}
                disabled={busy || !form}
                onClick={() => void goTo(stepId)}
              >
                <span className={styles.stepNumber}>{position + 1}</span>
                {stepLabels[stepId]}
                {stepId !== 'review' && pending > 0 ? (
                  <span className={styles.stepMissing} aria-label={`${pending} pendientes`}>
                    {pending}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className={modalStyles.form}>
          {loaded?.status === 'INCOMPLETE' && loaded.rejectionReason ? (
            <p className={styles.returned}>
              <strong>Devuelta por dirección:</strong> {loaded.rejectionReason}
            </p>
          ) : null}
          {loaded && !editable ? (
            <p className={styles.returned}>
              Esta inscripción ya no está en Borrador ni Incompleta; el formulario es de solo lectura.
            </p>
          ) : null}
          {error ? (
            <p className={modalStyles.error} role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          ) : null}

          {!form ? (
            <p>Cargando formulario…</p>
          ) : (
            <fieldset className={styles.fieldset} disabled={busy || !editable}>
              <legend className="srOnly">{stepLabels[step]}</legend>
              {step === 'family' ? (
                <div className={modalStyles.grid}>
                  <Section title="Padre, madre o tutor">
                    <p className={styles.hint}>
                      Los responsables pertenecen al alumno y se reutilizan entre hermanos y ciclos. Debe haber uno marcado
                      como responsable principal antes de enviar a revisión.
                    </p>
                    <GuardiansPanel
                      studentId={enrollment.student.id}
                      request={request}
                      canWrite={editable}
                      onChange={() => void reloadForm()}
                    />
                  </Section>
                  <Section title="Dirección del alumno">
                    <p className={styles.hint}>
                      Se reutiliza en la ficha de inscripción y en la dirección de los responsables que viven con el alumno.
                    </p>
                    <StudentAddressPanel
                      studentId={enrollment.student.id}
                      request={request}
                      canWrite={editable}
                      onChange={() => void reloadForm()}
                    />
                  </Section>
                </div>
              ) : null}
              {step === 'contact' ? (
                <ContactStep form={form} update={(values) => updateSection('contact', values)} />
              ) : null}
              {step === 'household' ? (
                <HouseholdStep form={form} update={(values) => updateSection('household', values)} />
              ) : null}
              {step === 'medical' ? (
                <MedicalStep form={form} update={(values) => updateSection('medical', values)} />
              ) : null}
              {step === 'signature' ? (
                <div className={modalStyles.grid}>
                  <TextField
                    label="Nombres de quien firma"
                    value={form.signature.signerGivenNames}
                    onChange={(signerGivenNames) => updateSection('signature', { signerGivenNames })}
                  />
                  <TextField
                    label="Primer apellido"
                    value={form.signature.signerFirstSurname}
                    onChange={(signerFirstSurname) => updateSection('signature', { signerFirstSurname })}
                  />
                  <TextField
                    label="Segundo apellido"
                    value={form.signature.signerSecondSurname}
                    onChange={(signerSecondSurname) => updateSection('signature', { signerSecondSurname })}
                  />
                  <TextField
                    label="Parentesco con el alumno"
                    value={form.signature.signerRelationship}
                    onChange={(signerRelationship) => updateSection('signature', { signerRelationship })}
                  />
                </div>
              ) : null}
            </fieldset>
          )}

          {step === 'review' && form ? (
            <ReviewStep missing={missing} onGoTo={(stepId) => setStep(stepId)} />
          ) : null}

          <div className={modalStyles.actions}>
            {index > 0 ? (
              <button type="button" className="btn" disabled={busy || !form} onClick={() => void goTo(stepOrder[index - 1])}>
                Anterior
              </button>
            ) : null}
            {step !== 'review' && editable ? (
              <button type="button" className="btn" disabled={busy || !form} onClick={() => void saveStep(step)}>
                Guardar borrador
              </button>
            ) : null}
            {step !== 'review' ? (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={busy || !form}
                onClick={() => void goTo(stepOrder[index + 1])}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={busy || !editable || missing.length > 0}
                onClick={() => void submit()}
              >
                {busy ? 'Enviando…' : 'Enviar a revisión'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  full = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  type?: string;
  full?: boolean;
}) {
  return (
    <label className={`label ${full ? modalStyles.full : ''}`}>
      {label}
      <input
        className="field fieldWide"
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={modalStyles.full}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function ContactStep({
  form,
  update,
}: {
  form: EnrollmentFormData;
  update: (values: Partial<EnrollmentFormData['contact']>) => void;
}) {
  const { contact } = form;
  const pickups = contact.authorizedPickups;
  const setPickup = (position: number, values: Partial<(typeof pickups)[number]>) =>
    update({ authorizedPickups: pickups.map((pickup, i) => (i === position ? { ...pickup, ...values } : pickup)) });

  return (
    <div className={modalStyles.grid}>
      <Section title="Contacto para mensajes">
        <div className={modalStyles.grid}>
          <TextField
            label="Nombres"
            value={contact.messageContactGivenNames}
            onChange={(messageContactGivenNames) => update({ messageContactGivenNames })}
          />
          <TextField
            label="Primer apellido"
            value={contact.messageContactFirstSurname}
            onChange={(messageContactFirstSurname) => update({ messageContactFirstSurname })}
          />
          <TextField
            label="Segundo apellido"
            value={contact.messageContactSecondSurname}
            onChange={(messageContactSecondSurname) => update({ messageContactSecondSurname })}
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={contact.messageContactPhone}
            onChange={(messageContactPhone) => update({ messageContactPhone })}
          />
          <TextField
            label="Parentesco"
            value={contact.messageContactRelationship}
            onChange={(messageContactRelationship) => update({ messageContactRelationship })}
          />
        </div>
      </Section>
      <Section title="Salida del colegio">
        <Check
          label="El alumno puede retirarse solo"
          checked={contact.mayLeaveAlone}
          onChange={(mayLeaveAlone) => update({ mayLeaveAlone })}
        />
        <p className={styles.hint}>
          Personas autorizadas para recoger al alumno (máximo {maxPickups}). Debe haber al menos una si el alumno no
          puede retirarse solo. Los apellidos van en campos separados para ordenarlos.
        </p>
        {pickups.map((pickup, position) => (
          <div key={position} className={styles.pickup}>
            <TextField
              label={`Nombres (persona ${position + 1})`}
              value={pickup.givenNames}
              onChange={(givenNames) => setPickup(position, { givenNames: givenNames ?? '' })}
            />
            <TextField
              label="Primer apellido"
              value={pickup.firstSurname}
              onChange={(firstSurname) => setPickup(position, { firstSurname: firstSurname ?? '' })}
            />
            <TextField
              label="Segundo apellido"
              value={pickup.secondSurname}
              onChange={(secondSurname) => setPickup(position, { secondSurname })}
            />
            <TextField
              label="Parentesco"
              value={pickup.relationship}
              onChange={(relationship) => setPickup(position, { relationship: relationship ?? '' })}
            />
            <TextField
              label="Teléfono"
              type="tel"
              value={pickup.phone}
              onChange={(phone) => setPickup(position, { phone })}
            />
            <button
              type="button"
              className={`btn ${styles.iconButton}`}
              aria-label={`Quitar persona ${position + 1}`}
              onClick={() => update({ authorizedPickups: pickups.filter((_, i) => i !== position) })}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        {pickups.length < maxPickups ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                authorizedPickups: [
                  ...pickups,
                  { givenNames: '', firstSurname: '', secondSurname: null, relationship: '', phone: null },
                ],
              })
            }
          >
            <Plus size={16} aria-hidden="true" />
            Agregar persona autorizada
          </button>
        ) : null}
      </Section>
    </div>
  );
}

function HouseholdStep({
  form,
  update,
}: {
  form: EnrollmentFormData;
  update: (values: Partial<NonNullable<EnrollmentFormData['household']>>) => void;
}) {
  const household = form.household ?? emptyHousehold;
  return (
    <div className={modalStyles.grid}>
      <Section title="¿Con quién vive el alumno?">
        <div className={styles.checkGrid}>
          {livesWithOptions.map(([field, label]) => (
            <Check
              key={field}
              label={label}
              checked={Boolean(household[field])}
              onChange={(value) => update({ [field]: value })}
            />
          ))}
        </div>
      </Section>
      {household.livesWithOther ? (
        <TextField
          label="¿Con quién más vive?"
          value={household.otherDetails}
          onChange={(otherDetails) => update({ otherDetails })}
          full
        />
      ) : null}
      <label className="label">
        Número de personas en el hogar
        <input
          className="field fieldWide"
          type="number"
          min={1}
          max={50}
          value={household.householdSize ?? ''}
          onChange={(event) => update({ householdSize: event.target.value ? Number(event.target.value) : null })}
        />
      </label>
    </div>
  );
}

function MedicalStep({
  form,
  update,
}: {
  form: EnrollmentFormData;
  update: (values: Partial<NonNullable<EnrollmentFormData['medical']>>) => void;
}) {
  const medical = form.medical ?? emptyMedical;
  return (
    <div className={modalStyles.grid}>
      <TextField
        label="Tipo de sangre"
        value={medical.bloodType}
        onChange={(bloodType) => update({ bloodType })}
      />
      <Check
        label="Se desconoce el tipo de sangre"
        checked={medical.bloodTypeUnknown}
        onChange={(bloodTypeUnknown) => update({ bloodTypeUnknown })}
      />
      <div className={modalStyles.full}>
        <Check
          label="Tiene enfermedades o alergias"
          checked={medical.hasDiseaseOrAllergy}
          onChange={(hasDiseaseOrAllergy) => update({ hasDiseaseOrAllergy })}
        />
      </div>
      {medical.hasDiseaseOrAllergy ? (
        <TextField
          label="Detalle de enfermedades o alergias"
          value={medical.diseaseOrAllergyDetails}
          onChange={(diseaseOrAllergyDetails) => update({ diseaseOrAllergyDetails })}
          full
        />
      ) : null}
      <div className={modalStyles.full}>
        <Check
          label="Es alérgico a algún medicamento"
          checked={medical.hasMedicationAllergy}
          onChange={(hasMedicationAllergy) => update({ hasMedicationAllergy })}
        />
      </div>
      {medical.hasMedicationAllergy ? (
        <TextField
          label="Detalle de alergias a medicamentos"
          value={medical.medicationAllergyDetails}
          onChange={(medicationAllergyDetails) => update({ medicationAllergyDetails })}
          full
        />
      ) : null}
      <label className="label">
        ¿Vacunas completas?
        <select
          className="select"
          value={medical.vaccinationsComplete === null ? '' : String(medical.vaccinationsComplete)}
          onChange={(event) =>
            update({ vaccinationsComplete: event.target.value === '' ? null : event.target.value === 'true' })
          }
        >
          <option value="">Sin dato</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </label>
      {medical.vaccinationsComplete === false ? (
        <TextField
          label="Vacunas pendientes"
          value={medical.missingVaccines}
          onChange={(missingVaccines) => update({ missingVaccines })}
        />
      ) : null}
    </div>
  );
}

function ReviewStep({ missing, onGoTo }: { missing: MissingField[]; onGoTo: (step: FormStepId) => void }) {
  if (missing.length === 0) {
    return (
      <p className={styles.notice}>
        El formulario está completo. Al enviarlo, la inscripción pasará a Pendiente de revisión.
      </p>
    );
  }
  const byStep = (Object.keys(stepLabels) as WizardStep[])
    .filter((stepId): stepId is FormStepId => stepId !== 'review')
    .map((stepId) => ({ stepId, fields: missing.filter((field) => field.step === stepId) }))
    .filter(({ fields }) => fields.length > 0);

  return (
    <div className={styles.missing}>
      <h3 className={styles.sectionTitle}>
        Faltan {missing.length} campo{missing.length === 1 ? '' : 's'} obligatorio{missing.length === 1 ? '' : 's'}
      </h3>
      {byStep.map(({ stepId, fields }) => (
        <div key={stepId} className={styles.missingGroup}>
          <div className={styles.missingHeader}>
            <strong>{stepLabels[stepId]}</strong>
            <button type="button" className="btn" onClick={() => onGoTo(stepId)}>
              Ir a {stepLabels[stepId]}
            </button>
          </div>
          <ul>
            {fields.map((field) => (
              <li key={field.field}>{field.label}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
