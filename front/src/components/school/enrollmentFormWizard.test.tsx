import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EnrollmentForm, EnrollmentFormData, MissingField } from '../../api/enrollmentForm.ts';
import type { Enrollment } from '../../api/school.ts';
import { EnrollmentFormWizard } from './EnrollmentFormWizard.tsx';

const enrollment = {
  id: 'insc-1',
  status: 'DRAFT',
  student: { id: 'a-1', studentCode: 'MA-2026-00001', fullName: 'Ana Pérez' },
  academicCycle: { id: 'c-1', name: 'Ciclo 2026', year: 2026, status: 'ACTIVE' },
  grade: { id: 'g-1', code: 'KINDER', name: 'Kínder', level: 'PRE_PRIMARY' },
} as Enrollment;

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

const missingAll: MissingField[] = [
  { step: 'contact', field: 'messageContactName', label: 'Nombre del contacto para mensajes' },
  { step: 'contact', field: 'authorizedPickups', label: 'Al menos una persona autorizada para recoger al alumno' },
  { step: 'household', field: 'householdSize', label: 'Número de personas en el hogar' },
  { step: 'signature', field: 'signerName', label: 'Nombre de quien firma la inscripción' },
];

function formResponse(overrides: Partial<EnrollmentForm> = {}): { data: EnrollmentForm } {
  return {
    data: {
      enrollmentId: enrollment.id,
      status: 'DRAFT',
      rejectionReason: null,
      editable: true,
      steps: [],
      form: emptyForm,
      missingFields: missingAll,
      ...overrides,
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderWizard(
  handler: (path: string, init: RequestInit) => Response,
  initialStep: 'contact' | 'review' = 'contact',
) {
  const request = vi.fn(async (path: string, init: RequestInit = {}) => handler(path, init));
  const onSubmitted = vi.fn(async () => {});
  render(
    <EnrollmentFormWizard
      enrollment={enrollment}
      request={request}
      initialStep={initialStep}
      onClose={() => {}}
      onSubmitted={onSubmitted}
    />,
  );
  return { request, onSubmitted };
}

const patches = (request: ReturnType<typeof renderWizard>['request'], suffix: string) =>
  request.mock.calls.filter(([path, init]) => String(path).endsWith(suffix) && init?.method === 'PATCH');

describe('formulario de inscripción por pasos', () => {
  it('marca cuántos campos faltan en cada paso', async () => {
    renderWizard(() => json(200, formResponse()));
    const steps = within(await screen.findByRole('navigation', { name: 'Pasos del formulario' }));

    expect(steps.getByRole('button', { name: /Contacto y salida.*2 pendientes/ })).toBeTruthy();
    expect(steps.getByRole('button', { name: /Hogar.*1 pendientes/ })).toBeTruthy();
    expect(steps.getByRole('button', { name: /Salud/ }).textContent).not.toMatch(/\d+$/);
  });

  it('el paso de revisión lista los faltantes por paso y no permite enviar', async () => {
    const { request } = renderWizard(() => json(200, formResponse()), 'review');

    expect(await screen.findByText('Faltan 4 campos obligatorios')).toBeTruthy();
    expect(screen.getByText('Al menos una persona autorizada para recoger al alumno')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enviar a revisión' }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ir a Hogar' }));
    expect(await screen.findByLabelText('Número de personas en el hogar')).toBeTruthy();
    expect(patches(request, '/status')).toHaveLength(0);
  });

  it('guarda como borrador solo la sección del paso actual', async () => {
    const { request } = renderWizard((_path, init) => {
      if (init.method === 'PATCH') {
        return json(200, formResponse({ missingFields: missingAll.filter(({ step }) => step !== 'contact') }));
      }
      return json(200, formResponse());
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nombre'), 'María López');
    await user.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    await waitFor(() => expect(patches(request, '/form')).toHaveLength(1));
    const body = JSON.parse(String(patches(request, '/form')[0][1]?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['contact']);
    expect(body.contact).toMatchObject({ messageContactName: 'María López' });
    expect(await screen.findByText('Borrador guardado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1\s*Contacto y salida$/ })).toBeTruthy();
  });

  it('Siguiente guarda el paso y avanza', async () => {
    const { request } = renderWizard(() => json(200, formResponse()));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('¿Con quién vive el alumno?')).toBeTruthy();
    expect(patches(request, '/form')).toHaveLength(1);
  });

  it('envía a revisión cuando no faltan campos', async () => {
    const { request, onSubmitted } = renderWizard((path, init) => {
      if (path.endsWith('/status') && init.method === 'PATCH') return json(200, { data: enrollment });
      return json(200, formResponse({ missingFields: [] }));
    }, 'review');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enviar a revisión' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(JSON.parse(String(patches(request, '/status')[0][1]?.body))).toEqual({ status: 'PENDING_REVIEW' });
  });

  it('si la API responde 422 muestra los campos que faltan', async () => {
    renderWizard((path, init) => {
      if (path.endsWith('/status') && init.method === 'PATCH') {
        return json(422, {
          message: 'No se puede enviar a revisión: faltan 1 campo obligatorio.',
          missingFields: [missingAll[3]],
        });
      }
      return json(200, formResponse({ missingFields: [] }));
    }, 'review');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Enviar a revisión' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/faltan 1 campo/);
    expect(screen.getByText('Nombre de quien firma la inscripción')).toBeTruthy();
  });

  it('muestra el motivo de devolución y bloquea la edición fuera de Borrador o Incompleta', async () => {
    renderWizard(() =>
      json(
        200,
        formResponse({ status: 'INCOMPLETE', rejectionReason: 'Falta la firma del encargado', editable: false }),
      ),
    );

    expect(await screen.findByText(/Falta la firma del encargado/)).toBeTruthy();
    expect(screen.getByLabelText('Nombre').matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull();
  });
});
