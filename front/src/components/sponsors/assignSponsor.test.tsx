import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { StudentSummary } from '../../api/school.ts';
import type { SponsorListItem } from '../../api/sponsors.ts';
import { AuthContext, type AuthContextValue } from '../../auth/AuthState.ts';
import { describeCommitment, formatMoney } from '../../lib/money.ts';
import { StudentSummaryModal } from '../school/StudentSummaryModal.tsx';

/** MA-34: asignar un padrino al alumno con su compromiso de donación. */

const sponsor: SponsorListItem = {
  id: 'sponsor-1', type: 'INDIVIDUAL', givenNames: 'José', firstSurname: 'Solidario', secondSurname: null, organizationName: null,
  fullName: 'José Solidario', contactName: null, birthday: null, email: 'jose@example.test', phone: '5555-1234',
  active: true, notes: null, createdAt: '2026-01-01T00:00:00.000Z', openSponsorships: [],
};
const commitment = {
  id: 'commitment-1', authorizedAmount: '250.50', currency: 'GTQ', frequency: 'MONTHLY' as const,
  startDate: '2026-02-01', endDate: null, status: 'PENDING' as const,
};
const baseSummary = {
  student: { id: 's-1', studentCode: 'MA-1', fullName: 'Ana Pérez', status: 'ACTIVE', cuiMasked: null, birthDate: null },
  photo: null, address: null, currentEnrollment: null, responsible: null, guardians: [], sponsors: [],
  authorizedPickups: [], maxAuthorizedPickups: 3, documents: [], history: [],
} as unknown as StudentSummary;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function renderSummary(options: { write?: boolean; assignStatus?: number; sponsors?: StudentSummary['sponsors'] } = {}) {
  let summary: StudentSummary = { ...baseSummary, sponsors: options.sponsors ?? [] };
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === '/students/s-1/summary') return json({ data: summary });
    if (path.endsWith('/address')) return json({ data: { address: null, sharedWith: [] } });
    if (path.startsWith('/sponsors?')) return json({ data: [sponsor], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
    if (path === '/students/s-1/sponsorships' && init.method === 'POST') {
      if (options.assignStatus === 409) return json({ message: 'El alumno ya tiene un padrino asignado. Finalice o cancele ese padrinazgo antes de asignar otro.' }, 409);
      summary = { ...summary, sponsors: [{ id: sponsor.id, sponsorshipId: 'sp-1', fullName: sponsor.fullName, startDate: '2026-02-01', status: 'PENDING', commitment }] };
      return json({ data: { id: 'sp-1' } }, 201);
    }
    return json({ message: `Ruta no simulada: ${path}` }, 404);
  });
  const write = options.write ?? true;
  const auth: AuthContextValue = {
    status: 'authenticated', user: null, accessToken: 'token', isAdmin: write,
    can: (permission) => permission.endsWith('.read') ? permission !== 'student.medical.read' : write, request,
    login: async () => {}, logout: async () => {},
  };
  render(<AuthContext.Provider value={auth}><MemoryRouter><StudentSummaryModal studentId="s-1" onClose={() => {}} /></MemoryRouter></AuthContext.Provider>);
  return request;
}

const assignCalls = (request: ReturnType<typeof renderSummary>) =>
  request.mock.calls.filter(([path, init]) => path === '/students/s-1/sponsorships' && init?.method === 'POST');

async function chooseSponsor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Asignar padrino' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Asignar padrino' }));
  await user.type(dialog.getByLabelText('Buscar padrino registrado'), 'José');
  await user.click(dialog.getByRole('button', { name: /Buscar/ }));
  await user.click(await dialog.findByRole('button', { name: 'Elegir a José Solidario' }));
  return dialog;
}

describe('asignar padrino desde la ficha del alumno', () => {
  it('asigna un padrino con su compromiso mensual autorizado y lo muestra en la ficha', async () => {
    const user = userEvent.setup();
    const request = renderSummary();
    expect(await screen.findByText('Sin padrino asignado.')).toBeTruthy();
    const dialog = await chooseSponsor(user);
    expect(dialog.getByText(/Es un compromiso, no un pago recibido/)).toBeTruthy();
    const startDate = dialog.getByLabelText('Inicio del padrinazgo');
    await user.clear(startDate);
    await user.type(startDate, '01/02/2026');
    await user.type(dialog.getByLabelText('Monto mensual autorizado (Q)'), '250,50');
    await user.click(dialog.getByRole('button', { name: 'Asignar padrino' }));

    await waitFor(() => expect(assignCalls(request)).toHaveLength(1));
    expect(JSON.parse(String(assignCalls(request)[0][1]!.body))).toEqual({
      sponsorId: 'sponsor-1', startDate: '2026-02-01', notes: null,
      commitment: { amount: '250.50', currency: 'GTQ', frequency: 'MONTHLY' },
    });
    const section = within(screen.getByRole('region', { name: 'Padrino' }));
    expect(await section.findByText('José Solidario')).toBeTruthy();
    expect(section.getByText('Padrinazgo pendiente')).toBeTruthy();
    expect(section.getByText(/Compromiso mensual autorizado: Q\s?250\.50/)).toBeTruthy();
    expect(section.queryByRole('button', { name: 'Asignar padrino' })).toBeNull();
    expect(section.getByText(/pendiente de activación/)).toBeTruthy();
  });

  it('valida el monto antes de enviar', async () => {
    const user = userEvent.setup();
    const request = renderSummary();
    const dialog = await chooseSponsor(user);
    await user.type(dialog.getByLabelText('Monto mensual autorizado (Q)'), '0');
    await user.click(dialog.getByRole('button', { name: 'Asignar padrino' }));
    expect((await dialog.findByRole('alert')).textContent).toMatch(/mayor que cero/);
    await user.clear(dialog.getByLabelText('Monto mensual autorizado (Q)'));
    await user.type(dialog.getByLabelText('Monto mensual autorizado (Q)'), '12.345');
    await user.click(dialog.getByRole('button', { name: 'Asignar padrino' }));
    expect(assignCalls(request)).toHaveLength(0);
  });

  it('muestra el error del servidor cuando el alumno ya tiene padrino', async () => {
    const user = userEvent.setup();
    renderSummary({ assignStatus: 409 });
    const dialog = await chooseSponsor(user);
    await user.selectOptions(dialog.getByLabelText('Frecuencia'), 'ONE_TIME');
    await user.type(dialog.getByLabelText('Monto autorizado (Q)'), '1000');
    await user.click(dialog.getByRole('button', { name: 'Asignar padrino' }));
    expect((await dialog.findByRole('alert')).textContent).toMatch(/ya tiene un padrino asignado/);
  });

  it('sin permiso de escritura solo muestra el padrino', async () => {
    renderSummary({ write: false, sponsors: [{ id: 'sponsor-1', sponsorshipId: 'sp-1', fullName: 'José Solidario', startDate: '2026-02-01', status: 'ACTIVE', commitment }] });
    const section = within(await screen.findByRole('region', { name: 'Padrino' }));
    expect(await section.findByText('Padrinazgo activo')).toBeTruthy();
    expect(section.queryByRole('button', { name: 'Asignar padrino' })).toBeNull();
  });
});

describe('textos del compromiso', () => {
  it('siempre dice autorizado, nunca recibido', () => {
    expect(describeCommitment(commitment)).toMatch(/^Compromiso mensual autorizado: Q\s?250\.50$/);
    expect(describeCommitment({ ...commitment, frequency: 'ONE_TIME' })).toMatch(/^Donación única autorizada/);
    expect(describeCommitment(null)).toBe('Sin compromiso registrado');
    expect(formatMoney('1500.00')).toMatch(/Q\s?1,500\.00/);
  });
});
