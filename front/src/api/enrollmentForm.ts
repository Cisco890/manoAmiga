import { ApiError } from '../auth/api.ts';
import type { Enrollment, EnrollmentStatus } from './school.ts';

type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<Response>;

export type FormStepId = 'contact' | 'household' | 'medical' | 'signature';
export type MissingField = { step: FormStepId; field: string; label: string };

export type AuthorizedPickupInput = { fullName: string; relationship: string; phone: string | null };

export type EnrollmentFormData = {
  contact: {
    messageContactName: string | null;
    messageContactPhone: string | null;
    messageContactRelationship: string | null;
    mayLeaveAlone: boolean;
    authorizedPickups: AuthorizedPickupInput[];
  };
  household: {
    livesWithMother: boolean;
    livesWithFather: boolean;
    livesWithSiblings: boolean;
    livesWithUncles: boolean;
    livesWithFriends: boolean;
    livesWithGrandparents: boolean;
    livesWithOther: boolean;
    otherDetails: string | null;
    householdSize: number | null;
  } | null;
  medical: {
    bloodType: string | null;
    bloodTypeUnknown: boolean;
    hasDiseaseOrAllergy: boolean;
    diseaseOrAllergyDetails: string | null;
    hasMedicationAllergy: boolean;
    medicationAllergyDetails: string | null;
    vaccinationsComplete: boolean | null;
    missingVaccines: string | null;
  } | null;
  signature: { signerName: string | null; signerRelationship: string | null };
};

export type EnrollmentForm = {
  enrollmentId: string;
  status: EnrollmentStatus;
  rejectionReason: string | null;
  editable: boolean;
  steps: Array<{ id: FormStepId; label: string }>;
  form: EnrollmentFormData;
  missingFields: MissingField[];
};

/** La API rechazó el envío a revisión (422) porque faltan campos obligatorios. */
export class MissingFieldsError extends ApiError {
  readonly missingFields: MissingField[];

  constructor(message: string, missingFields: MissingField[]) {
    super(message, 422);
    this.missingFields = missingFields;
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let body: { message?: unknown; missingFields?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Respuesta sin JSON.
  }
  const message = typeof body.message === 'string' ? body.message : 'No fue posible completar la solicitud';
  if (response.status === 422 && Array.isArray(body.missingFields)) {
    throw new MissingFieldsError(message, body.missingFields as MissingField[]);
  }
  throw new ApiError(message, response.status);
}

export async function getEnrollmentForm(request: AuthenticatedRequest, enrollmentId: string) {
  return parse<{ data: EnrollmentForm }>(await request(`/enrollments/${enrollmentId}/form`));
}

export async function saveEnrollmentForm(
  request: AuthenticatedRequest,
  enrollmentId: string,
  patch: Partial<{ [K in FormStepId]: Partial<NonNullable<EnrollmentFormData[K]>> }>,
) {
  return parse<{ data: EnrollmentForm }>(
    await request(`/enrollments/${enrollmentId}/form`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}

export async function submitEnrollmentForReview(request: AuthenticatedRequest, enrollmentId: string) {
  return parse<{ data: Enrollment }>(
    await request(`/enrollments/${enrollmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING_REVIEW' }),
    }),
  );
}
