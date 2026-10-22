import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Student, StudentSummary } from '../../api/school.ts';
import { AuthContext, type AuthContextValue } from '../../auth/AuthState.ts';
import { DashboardPage } from '../../pages/DashboardPage.tsx';
import { Topbar } from '../layout/Topbar.tsx';

const student: Student = {
  id: 'student-1', studentCode: 'MA-2026-00001', givenNames: 'Ana', firstSurname: 'Pérez', secondSurname: 'López', fullName: 'Ana Pérez López',
  usualName: null, birthPlace: null, birthDate: '2018-05-06', cuiMasked: '*********1234', hasCui: true, homePhone: null,
  sex: 'FEMALE', status: 'ACTIVE', notes: null,
  currentGrade: { id: 'grade-1', name: 'Primero', code: 'PRIMERO', enrollmentStatus: 'APPROVED', cycleName: 'Ciclo 2026' },
};
const pickup = { givenNames: 'Beatriz', firstSurname: 'López', secondSurname: null, relationship: 'Tía', phone: '5555-1234' };
const cycle = { id: 'cycle-1', name: 'Ciclo 2026', year: 2026, status: 'ACTIVE' as const };
const grade = { id: 'grade-1', name: 'Primero', code: 'PRIMERO' };
const dossier: StudentSummary = {
  student, photo: null,
  currentEnrollment: { id: 'enrollment-1', status: 'APPROVED', academicCycle: cycle, grade },
  responsible: { id: 'guardian-1', fullName: 'María López', relationship: 'MOTHER', customRelationship: null, phone: '5555-9876', primaryContact: true, legalRepresentative: true },
  guardians: [], sponsors: [{ id: 'sponsor-1', sponsorshipId: 'sponsorship-1', fullName: 'José Solidario', startDate: '2025-01-15' }],
  authorizedPickups: [pickup], maxAuthorizedPickups: 3,
  documents: [
    { type: 'ENROLLMENT_FORM', status: 'SIGNED', id: 'doc-1', generatedAt: '2026-01-20' },
    { type: 'STUDENT_ID_CARD', status: 'MISSING', id: null, generatedAt: null },
    { type: 'SPONSOR_AUTHORIZATION', status: 'GENERATED', id: 'doc-2', generatedAt: '2026-01-20' },
  ],
  history: [
    { id: 'enrollment-1', status: 'APPROVED', academicCycle: cycle, grade, requestDate: '2026-01-15', approvedAt: null, isCurrent: true, authorizedPickups: [pickup], documents: [] },
    { id: 'old-enrollment', status: 'CLOSED', academicCycle: { ...cycle, id: 'old-cycle', name: 'Ciclo 2025', year: 2025, status: 'CLOSED' }, grade: { ...grade, name: 'Preparatoria' }, requestDate: '2025-01-10', approvedAt: null, isCurrent: false,
      authorizedPickups: [{ ...pickup, givenNames: 'Persona histórica' }], documents: [] },
  ],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function renderDirectory(options: {
  write?: boolean; photo?: boolean; topbar?: boolean;
  list?: (path: string) => Promise<Response>;
  failSave?: boolean;
} = {}) {
  let summary = structuredClone(dossier);
  if (options.photo) summary.photo = { id: 'photo-1', capturedAt: '2026-01-15' };
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === '/grades') return json({ data: [{ ...grade, schoolId: 'school-1', level: 'PRIMARY', displayOrder: 1, active: true, studentCount: 25, minAge: null, maxAge: null }] });
    if (path === '/academic-cycles') return json({ data: [{ ...cycle, schoolId: 'school-1', startDate: '2026-01-01', endDate: '2026-10-31' }] });
    if (path.startsWith('/students?')) return options.list ? options.list(path) : json({ data: [student], pagination: { page: 1, limit: 10, total: 20, pages: 2 } });
    if (path.endsWith('/summary')) return json({ data: summary });
    if (path.endsWith('/photo')) return new Response(new Blob(['photo'], { type: 'image/png' }));
    if (path.endsWith('/address')) return json({ data: { address: null, sharedWith: [] } });
    if (path.endsWith('/authorized-pickups') && init.method === 'PUT') {
      if (options.failSave) return json({ message: 'No fue posible guardar autorizados.' }, 500);
      summary = { ...summary, authorizedPickups: JSON.parse(String(init.body)).authorizedPickups };
      return json({ data: summary.authorizedPickups });
    }
    return json({ message: `Ruta no simulada: ${path}` }, 404);
  });
  const auth: AuthContextValue = {
    status: 'authenticated', user: null, accessToken: 'token', isAdmin: options.write ?? false,
    can: (permission) => permission.endsWith('.read') || Boolean(options.write), request,
    login: async () => {}, logout: async () => {},
  };
  render(<AuthContext.Provider value={auth}><MemoryRouter>
    {options.topbar ? <Topbar pathname="/" onMenuClick={() => {}} /> : null}
    <DashboardPage />
  </MemoryRouter></AuthContext.Provider>);
  return request;
}
const listCalls = (request: ReturnType<typeof renderDirectory>) => request.mock.calls.filter(([path]) => path.startsWith('/students?'));
const writeCalls = (request: ReturnType<typeof renderDirectory>) => request.mock.calls.filter(([, init]) => init?.method === 'PUT');
const openSummary = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez López' }));
  const dialog = within(screen.getByRole('dialog'));
  await dialog.findByText('María López');
  return dialog;
};

describe('búsqueda y ficha del alumno desde el dashboard', () => {
  it.each(['Ana Pérez', 'MA-2026-00001', '1234567891234', 'María López', 'José Solidario'])('envía el criterio de búsqueda %s', async (query) => {
    const request = renderDirectory();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez López' });
    await user.type(screen.getByLabelText('Buscar alumno'), query);
    await user.click(within(screen.getByRole('search', { name: 'Buscar alumnos' })).getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(new URL(listCalls(request).at(-1)![0], 'http://test').searchParams.get('q')).toBe(query));
  });

  it('combina los filtros de grado y ciclo y reinicia la paginación', async () => {
    const request = renderDirectory();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez López' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(listCalls(request).at(-1)![0]).toContain('page=2'));
    await user.selectOptions(screen.getByLabelText('Grado'), 'grade-1');
    await user.selectOptions(screen.getByLabelText('Ciclo escolar'), 'cycle-1');
    await waitFor(() => {
      const parameters = new URL(listCalls(request).at(-1)![0], 'http://test').searchParams;
      expect(parameters.get('page')).toBe('1'); expect(parameters.get('gradeId')).toBe('grade-1'); expect(parameters.get('academicCycleId')).toBe('cycle-1');
    });
  });

  it('muestra los siete elementos, autorizados e historial y restaura el foco al cerrar', async () => {
    renderDirectory();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez López' });
    const dialog = await openSummary(user);
    expect(dialog.getByText('Sin fotografía')).toBeTruthy();
    expect(dialog.getByText('*********1234')).toBeTruthy();
    expect(dialog.getByText('06/05/2018')).toBeTruthy();
    expect(dialog.getAllByText('Primero').length).toBeGreaterThan(0);
    expect(dialog.getByText('Activo')).toBeTruthy();
    expect(dialog.getByText('José Solidario')).toBeTruthy();
    expect(dialog.getByText('Firmado')).toBeTruthy();
    expect(dialog.getByText('Pendiente de generar')).toBeTruthy();
    expect(dialog.getByText('Beatriz López', { selector: 'strong' })).toBeTruthy();
    expect(dialog.getByText('Ciclo 2025')).toBeTruthy();
    expect(dialog.getByText('Preparatoria')).toBeTruthy();
    expect(dialog.queryByRole('button', { name: 'Editar personas autorizadas' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(button);
  });

  it('agrega otra persona independiente de los guardianes y conserva el historial', async () => {
    const request = renderDirectory({ write: true });
    const user = userEvent.setup();
    const dialog = await openSummary(user);
    await user.click(dialog.getByRole('button', { name: 'Editar personas autorizadas' }));
    await user.click(dialog.getByRole('button', { name: 'Agregar persona autorizada' }));
    await user.click(dialog.getByRole('button', { name: 'Guardar autorizados' }));
    expect(writeCalls(request)).toHaveLength(0);
    await user.type(dialog.getByLabelText('Nombres (persona 2)'), 'Carlos');
    await user.type(dialog.getByLabelText('Primer apellido (persona 2)'), 'García');
    await user.type(dialog.getByLabelText('Parentesco (persona 2)'), 'Vecino');
    await user.click(dialog.getByRole('button', { name: 'Guardar autorizados' }));
    expect(await dialog.findByText('Personas autorizadas actualizadas.')).toBeTruthy();
    expect(dialog.getByText('Carlos García')).toBeTruthy();
    expect(dialog.getByText('María López')).toBeTruthy();
    expect(dialog.getByText('Persona histórica López · Tía')).toBeTruthy();
    expect(JSON.parse(String(writeCalls(request)[0][1]?.body)).authorizedPickups).toHaveLength(2);
  });

  it('muestra los errores al guardar sin perder los cambios del formulario', async () => {
    renderDirectory({ write: true, failSave: true });
    const user = userEvent.setup();
    const dialog = await openSummary(user);
    await user.click(dialog.getByRole('button', { name: 'Editar personas autorizadas' }));
    await user.clear(dialog.getByLabelText('Nombres (persona 1)'));
    await user.type(dialog.getByLabelText('Nombres (persona 1)'), 'Nombre cambiado');
    await user.click(dialog.getByRole('button', { name: 'Guardar autorizados' }));
    expect(await dialog.findByRole('alert')).toBeTruthy();
    expect((dialog.getByLabelText('Nombres (persona 1)') as HTMLInputElement).value).toBe('Nombre cambiado');
  });

  it('ignora respuestas antiguas que llegan después de una búsqueda nueva', async () => {
    let finishInitial: (response: Response) => void = () => {};
    renderDirectory({ list: async (path) => {
      const q = new URL(path, 'http://test').searchParams.get('q');
      if (!q) return new Promise((resolve) => { finishInitial = resolve; });
      return json({ data: [student], pagination: { total: 1, pages: 1 } });
    } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar alumno'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez López' });
    await act(async () => finishInitial(json({ data: [{ ...student, givenNames: 'Obsoleto', fullName: 'Obsoleto' }], pagination: { total: 1, pages: 1 } })));
    expect(screen.queryByText('Obsoleto')).toBeNull();
  });

  it('la búsqueda superior actualiza el criterio incluso si ya está en la misma pantalla', async () => {
    const request = renderDirectory({ topbar: true });
    const user = userEvent.setup();
    const search = within(screen.getByRole('search', { name: 'Búsqueda global' }));
    await user.type(search.getByLabelText('Búsqueda global'), 'María{Enter}');
    await waitFor(() => expect((screen.getByLabelText('Buscar alumno') as HTMLInputElement).value).toBe('María'));
    await user.clear(search.getByLabelText('Búsqueda global'));
    await user.type(search.getByLabelText('Búsqueda global'), 'José{Enter}');
    await waitFor(() => expect(new URL(listCalls(request).at(-1)![0], 'http://test').searchParams.get('q')).toBe('José'));
  });

  it('carga la foto con la solicitud autenticada y libera su URL al cerrar la ficha', async () => {
    const createObjectURL = vi.fn(() => 'blob:student-photo');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    const request = renderDirectory({ photo: true });
    const user = userEvent.setup();
    const dialog = await openSummary(user);
    const photo = await dialog.findByRole('img', { name: 'Fotografía de Ana Pérez López' });
    expect(photo.getAttribute('src')).toBe('blob:student-photo');
    expect(request.mock.calls.some(([path]) => path.endsWith('/photo'))).toBe(true);
    await user.click(dialog.getByRole('button', { name: 'Cerrar ficha del alumno' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:student-photo');
  });
});
