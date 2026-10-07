import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Enrollment, EnrollmentStatus } from '../api/school.ts';
import { AuthContext, type AuthContextValue } from '../auth/AuthState.ts';
import type { PermissionCode } from '../auth/types.ts';
import { EnrollmentsPage } from './EnrollmentsPage.tsx';

const nextStatuses: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  DRAFT: ['PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['INCOMPLETE', 'APPROVED', 'REJECTED', 'CANCELLED'],
  INCOMPLETE: ['PENDING_REVIEW', 'CANCELLED'],
  APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

function enrollment(id: string, status: EnrollmentStatus, overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id,
    studentId: `alumno-${id}`,
    academicCycleId: 'ciclo-1',
    gradeId: 'grado-1',
    applicationType: 'NEW_ENROLLMENT',
    requestDate: '2026-10-07',
    status,
    notes: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectionReason: null,
    canGenerateDocuments: status === 'APPROVED',
    student: { id: `alumno-${id}`, studentCode: `MA-2026-${id}`, fullName: `Alumno ${id}` },
    academicCycle: { id: 'ciclo-1', name: 'Ciclo 2026', year: 2026, status: 'ACTIVE' },
    grade: { id: 'grado-1', code: 'KINDER', name: 'Kínder', level: 'PRE_PRIMARY' },
    allowedNextStatuses: nextStatuses[status],
    ...overrides,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage(permissions: PermissionCode[], enrollments: Enrollment[]) {
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path.startsWith('/academic-cycles') || path.startsWith('/grades')) return json(200, { data: [] });
    if (path.startsWith('/enrollments?')) {
      return json(200, {
        data: enrollments,
        pagination: { page: 1, limit: 10, total: enrollments.length, pages: 1 },
      });
    }
    const match = /^\/enrollments\/([^/]+)\/status$/.exec(path);
    if (match && init.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { status: EnrollmentStatus; rejectionReason?: string };
      return json(200, { data: enrollment(match[1], body.status, { rejectionReason: body.rejectionReason ?? null }) });
    }
    return json(404, { message: `Ruta no simulada: ${path}` });
  });

  const auth: AuthContextValue = {
    status: 'authenticated',
    user: null,
    accessToken: 'token',
    isAdmin: permissions.includes('user.manage'),
    can: (permission) => permissions.includes(permission),
    request,
    login: async () => {},
    logout: async () => {},
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <EnrollmentsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return request;
}

const statusRequests = (request: ReturnType<typeof renderPage>) =>
  request.mock.calls.filter(([path]) => String(path).endsWith('/status'));

const rowOf = async (studentName: string) =>
  (await screen.findByText(studentName)).closest('tr') as HTMLTableRowElement;

describe('revisión de inscripciones (dirección)', () => {
  it('muestra Aprobar, Devolver y Rechazar a quien tiene enrollment.approve', async () => {
    renderPage(['enrollment.read', 'enrollment.write', 'enrollment.approve'], [enrollment('1', 'PENDING_REVIEW')]);
    const row = within(await rowOf('Alumno 1'));

    expect(row.getByRole('button', { name: 'Aprobar' })).toBeTruthy();
    expect(row.getByRole('button', { name: 'Devolver para corrección' })).toBeTruthy();
    expect(row.getByRole('button', { name: 'Rechazar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pendientes de revisión' })).toBeTruthy();
  });

  it('aprueba directamente sin pedir motivo', async () => {
    const request = renderPage(['enrollment.read', 'enrollment.approve'], [enrollment('1', 'PENDING_REVIEW')]);
    const user = userEvent.setup();

    await user.click(within(await rowOf('Alumno 1')).getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => expect(statusRequests(request)).toHaveLength(1));
    expect(JSON.parse(String(statusRequests(request)[0][1]?.body))).toEqual({ status: 'APPROVED' });
  });

  it('devolver exige un motivo y lo envía a la API', async () => {
    const request = renderPage(['enrollment.read', 'enrollment.approve'], [enrollment('1', 'PENDING_REVIEW')]);
    const user = userEvent.setup();

    await user.click(within(await rowOf('Alumno 1')).getByRole('button', { name: 'Devolver para corrección' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Devolver inscripción' }));

    expect(dialog.getByRole('alert').textContent).toMatch(/motivo/);
    expect(statusRequests(request)).toHaveLength(0);

    await user.type(dialog.getByLabelText('Motivo'), 'Falta la constancia de vacunación');
    await user.click(dialog.getByRole('button', { name: 'Devolver inscripción' }));

    await waitFor(() => expect(statusRequests(request)).toHaveLength(1));
    expect(JSON.parse(String(statusRequests(request)[0][1]?.body))).toEqual({
      status: 'INCOMPLETE',
      rejectionReason: 'Falta la constancia de vacunación',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('muestra el motivo en las inscripciones devueltas o rechazadas', async () => {
    renderPage(
      ['enrollment.read', 'enrollment.write'],
      [
        enrollment('1', 'INCOMPLETE', { rejectionReason: 'Falta la firma del encargado' }),
        enrollment('2', 'APPROVED'),
      ],
    );

    expect(await screen.findByText('Motivo: Falta la firma del encargado')).toBeTruthy();
    expect(within(await rowOf('Alumno 2')).getByText('Ficha y carné habilitados')).toBeTruthy();
  });

  it('la secretaría sin enrollment.approve no ve las acciones de revisión', async () => {
    renderPage(['enrollment.read', 'enrollment.write'], [enrollment('1', 'PENDING_REVIEW')]);
    const row = within(await rowOf('Alumno 1'));

    expect(row.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    for (const name of ['Aprobar', 'Devolver para corrección', 'Rechazar']) {
      expect(row.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Pendientes de revisión' })).toBeNull();
  });

  it('un colaborador de solo lectura no ve la columna de acciones', async () => {
    renderPage(['enrollment.read'], [enrollment('1', 'PENDING_REVIEW')]);

    await rowOf('Alumno 1');
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });
});
