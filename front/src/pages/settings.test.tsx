import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AcademicCycle, Grade } from '../api/school.ts';
import { AuthContext, type AuthContextValue } from '../auth/AuthState.ts';
import { SettingsPage } from './SettingsPage.tsx';

function renderSettings() {
  let grades: Grade[] = [{
    id: 'grade-1', schoolId: 'school-1', code: 'KINDER', name: 'Kínder', level: 'PRE_PRIMARY',
    displayOrder: 1, studentCount: 25, minAge: null, maxAge: null, active: true,
  }];
  let cycles: AcademicCycle[] = [{
    id: 'cycle-1', schoolId: 'school-1', name: 'Ciclo 2026', year: 2026,
    startDate: '2026-01-15', endDate: '2026-10-31', status: 'PLANNED',
  }];
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    let data: unknown;
    if (!init.method) data = path === '/grades' ? grades : cycles;
    else {
      const body = JSON.parse(String(init.body));
      if (path === '/grades') {
        const grade = { ...body, id: 'grade-2', schoolId: 'school-1' };
        grades = [...grades, grade];
        data = grade;
      } else if (path === '/grades/grade-1') {
        grades = [{ ...grades[0], ...body }];
        data = grades[0];
      } else if (path === '/academic-cycles/cycle-1') {
        cycles = [{ ...cycles[0], ...body }];
        data = cycles[0];
      }
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  const auth: AuthContextValue = {
    status: 'authenticated', user: null, accessToken: 'token', isAdmin: true,
    can: () => true, request, login: async () => {}, logout: async () => {},
  };
  render(<AuthContext.Provider value={auth}><SettingsPage /></AuthContext.Provider>);
  return request;
}

describe('cantidad de estudiantes y fechas de configuración', () => {
  it('crea un grado con su cantidad de estudiantes y la muestra tras guardar', async () => {
    const request = renderSettings();
    const user = userEvent.setup();
    await screen.findByText('Kínder');
    await user.click(screen.getByRole('button', { name: 'Nuevo grado' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Código'), 'PRIMERO');
    await user.type(dialog.getByLabelText('Nombre'), 'Primero');
    await user.type(dialog.getByLabelText('Cantidad de estudiantes'), '30');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const create = request.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(create?.[1]?.body)).studentCount).toBe(30);
    expect(within(screen.getByText('Primero').closest('tr')!).getByText('30')).toBeTruthy();
  });

  it('edita la cantidad, conserva el cero y permite dejarla sin definir', async () => {
    const request = renderSettings();
    const user = userEvent.setup();
    const row = (await screen.findByText('Kínder')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Editar' }));
    let dialog = within(screen.getByRole('dialog'));
    const input = dialog.getByLabelText('Cantidad de estudiantes') as HTMLInputElement;
    expect(input.value).toBe('25');
    await user.clear(input);
    await user.type(input, '-1');
    expect(input.checkValidity()).toBe(false);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    await user.clear(input);
    await user.type(input, '0');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(screen.getByText('Kínder').closest('tr')!).getByText('0')).toBeTruthy();

    await user.click(within(screen.getByText('Kínder').closest('tr')!).getByRole('button', { name: 'Editar' }));
    dialog = within(screen.getByRole('dialog'));
    await user.clear(dialog.getByLabelText('Cantidad de estudiantes'));
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Sin definir')).toBeTruthy();
  });

  it('muestra y edita dd/mm/aaaa, rechaza fechas imposibles y guarda ISO en la API', async () => {
    const request = renderSettings();
    const user = userEvent.setup();
    const row = (await screen.findByText('15/01/2026')).closest('tr')!;
    expect(within(row).getByText('31/10/2026')).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: 'Editar' }));
    const dialog = within(screen.getByRole('dialog'));
    const start = dialog.getByLabelText('Fecha de inicio') as HTMLInputElement;
    expect(start.value).toBe('15/01/2026');
    await user.clear(start);
    await user.type(start, '31/02/2026');
    expect(start.checkValidity()).toBe(false);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    await user.clear(start);
    await user.type(start, '05/06/2026');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = request.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ startDate: '2026-06-05', endDate: '2026-10-31' });
    expect(screen.getByText('05/06/2026')).toBeTruthy();
  });
});
