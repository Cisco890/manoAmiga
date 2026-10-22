import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GuardianLink, GuardianSearchResult } from '../../api/guardians.ts';
import { GuardiansPanel } from './GuardiansPanel.tsx';

const guardian = {
  id: 'g-1', givenNames: 'María', firstSurname: 'López', secondSurname: null, marriedSurname: null,
  fullName: 'María López', dpiMasked: '*********0123', hasDpi: true, mobilePhone: '5555-1234', homePhone: null,
  primaryEmail: null, occupation: null, workplaceName: null, workplacePhone: null,
};
const motherLink: GuardianLink = {
  id: 'link-1', relationship: 'MOTHER', customRelationship: null, livesWithStudent: true, primaryContact: true,
  legalRepresentative: false, authorizedForSchoolProcedures: false, startDate: '2026-01-10', guardian,
  otherStudents: [{ id: 's-2', studentCode: 'MA-2026-00002', fullName: 'Luis López', relationship: 'MOTHER' }],
};
const fatherResult: GuardianSearchResult = {
  ...guardian, id: 'g-2', givenNames: 'Pedro', fullName: 'Pedro López', dpiMasked: null, hasDpi: false,
  students: [{ id: 's-2', studentCode: 'MA-2026-00002', fullName: 'Luis López', relationship: 'FATHER' }],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function renderPanel(options: { links?: GuardianLink[]; canWrite?: boolean } = {}) {
  let links = options.links ?? [motherLink];
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === '/students/s-1/guardians' && !init.method) return json({ data: links });
    if (path.startsWith('/guardians?')) return json({ data: [fatherResult] });
    if (path === '/students/s-1/guardians' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { guardianId?: string };
      const created = { ...motherLink, id: 'link-2', relationship: 'FATHER' as const, primaryContact: false, guardian: { ...guardian, id: body.guardianId ?? 'g-new', fullName: 'Pedro López' } };
      links = [...links, created];
      return json({ data: created }, 201);
    }
    if (path.startsWith('/students/s-1/guardians/') && init.method === 'DELETE') {
      links = links.filter((link) => !path.endsWith(link.id));
      return json({ data: { id: 'x' } });
    }
    return json({ message: `Ruta no simulada: ${path}` }, 404);
  });
  const onChange = vi.fn();
  render(<GuardiansPanel studentId="s-1" request={request} canWrite={options.canWrite ?? true} onChange={onChange} />);
  return { request, onChange };
}

const calls = (request: ReturnType<typeof renderPanel>['request'], method: string) =>
  request.mock.calls.filter(([, init]) => init?.method === method);

describe('panel de padres, madres y tutores', () => {
  it('muestra parentesco, convivencia, responsable principal y hermanos', async () => {
    renderPanel();
    const item = within(await screen.findByRole('listitem'));
    expect(item.getByText('María López')).toBeTruthy();
    expect(item.getByText('Madre')).toBeTruthy();
    expect(item.getByText('Responsable principal')).toBeTruthy();
    expect(item.getByText('Vive con el alumno')).toBeTruthy();
    expect(item.getByText(/También es responsable de: Luis López \(MA-2026-00002\)/)).toBeTruthy();
    expect(item.getByText(/DPI \*{9}0123/)).toBeTruthy();
  });

  it('reutiliza un responsable ya registrado para un hermano', async () => {
    const { request, onChange } = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Agregar responsable' }));
    await user.type(screen.getByLabelText('Nombre o DPI del responsable'), 'Pedro');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(/Responsable de: Luis López \(Padre\)/)).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: /Pedro López/ }));
    await user.selectOptions(screen.getByLabelText('Parentesco'), 'FATHER');
    await user.click(screen.getByRole('button', { name: 'Vincular responsable' }));

    await waitFor(() => expect(calls(request, 'POST')).toHaveLength(1));
    expect(JSON.parse(String(calls(request, 'POST')[0][1]?.body))).toEqual({
      relationship: 'FATHER', customRelationship: null, livesWithStudent: false, primaryContact: false,
      legalRepresentative: false, guardianId: 'g-2',
    });
    expect(await screen.findByText('Responsable vinculado.')).toBeTruthy();
    expect(onChange).toHaveBeenCalled();
  });

  it('registra un responsable nuevo y lo marca como principal si es el primero', async () => {
    const { request } = renderPanel({ links: [] });
    const user = userEvent.setup();
    expect(await screen.findByText('Sin padre, madre o tutor registrado.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Agregar responsable' }));
    await user.click(screen.getByRole('button', { name: 'Registrar nuevo' }));
    await user.type(screen.getByLabelText('Nombres'), 'Pedro');
    await user.type(screen.getByLabelText('Primer apellido'), 'López');
    await user.type(screen.getByLabelText(/^DPI/), '1234567890123');
    expect((screen.getByLabelText('Responsable principal') as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Registrar y vincular' }));

    await waitFor(() => expect(calls(request, 'POST')).toHaveLength(1));
    const body = JSON.parse(String(calls(request, 'POST')[0][1]?.body)) as Record<string, unknown>;
    expect(body.guardian).toEqual({ givenNames: 'Pedro', firstSurname: 'López', dpi: '1234567890123' });
    expect(body.primaryContact).toBe(true);
  });

  it('desvincula sin borrar y oculta las acciones sin permiso de escritura', async () => {
    const { request } = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Desvincular a María López' }));
    expect(await screen.findByText('Responsable desvinculado.')).toBeTruthy();
    expect(calls(request, 'DELETE')[0][0]).toBe('/students/s-1/guardians/link-1');
  });

  it('un usuario de solo lectura no ve botones de edición', async () => {
    renderPanel({ canWrite: false });
    await screen.findByText('María López');
    expect(screen.queryByRole('button', { name: 'Agregar responsable' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desvincular/ })).toBeNull();
  });
});
