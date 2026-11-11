import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SponsorDetail, SponsorListItem, SponsorMatch } from '../../api/sponsors.ts';
import { AuthContext, type AuthContextValue } from '../../auth/AuthState.ts';
import { SponsorsPage } from '../../pages/SponsorsPage.tsx';

/** MA-33: crear o localizar un padrino existente. */

const baseSponsor = {
  type: 'INDIVIDUAL' as const, givenNames: 'José', firstSurname: 'Solidario', secondSurname: null, organizationName: null,
  contactName: null, birthday: null, notes: null, active: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const existing: SponsorListItem = {
  ...baseSponsor, id: 'sponsor-1', fullName: 'José Solidario', email: 'jose@example.test', phone: '5555-1234',
  openSponsorships: [{ id: 'sp-1', status: 'ACTIVE', startDate: '2026-01-15', endDate: null, notes: null,
    student: { id: 'student-1', studentCode: 'MA-2026-00001', fullName: 'Ana Pérez' }, commitment: null }],
};
const match: SponsorMatch = { ...existing, reasons: ['name', 'phone'] };
const detail = (sponsor: SponsorListItem): SponsorDetail => {
  const { openSponsorships, ...rest } = sponsor;
  return { ...rest, sponsorships: openSponsorships };
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function renderPage(options: { write?: boolean; matches?: SponsorMatch[] } = {}) {
  const created: SponsorDetail = { ...detail({ ...existing, openSponsorships: [] }), id: 'sponsor-new', fullName: 'José Solidario Ruiz', secondSurname: 'Ruiz' };
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path.startsWith('/sponsors?')) return json({ data: [existing], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
    if (path.startsWith('/sponsors/matches?')) return json({ data: options.matches ?? [match] });
    if (path === '/sponsors' && init.method === 'POST') return json({ data: created }, 201);
    if (path === '/sponsors/sponsor-1' && !init.method) return json({ data: detail(existing) });
    if (path === '/sponsors/sponsor-new' && !init.method) return json({ data: created });
    if (path === '/sponsors/sponsor-1' && init.method === 'DELETE') {
      return json({ message: 'El padrino tiene padrinazgos vigentes. Finalícelos o cancélelos antes de desactivarlo.' }, 409);
    }
    return json({ message: `Ruta no simulada: ${path}` }, 404);
  });
  const auth: AuthContextValue = {
    status: 'authenticated', user: null, accessToken: 'token', isAdmin: options.write ?? true,
    can: (permission) => permission.endsWith('.read') || (options.write ?? true), request,
    login: async () => {}, logout: async () => {},
  };
  render(<AuthContext.Provider value={auth}><MemoryRouter><SponsorsPage /></MemoryRouter></AuthContext.Provider>);
  return request;
}

const posts = (request: ReturnType<typeof renderPage>) => request.mock.calls.filter(([, init]) => init?.method === 'POST');

describe('padrinos', () => {
  it('lista los padrinos con sus alumnos apadrinados', async () => {
    const request = renderPage();
    const row = (await screen.findByText('José Solidario')).closest('tr')!;
    expect(within(row).getByText('Ana Pérez')).toBeTruthy();
    expect(within(row).getByText('jose@example.test')).toBeTruthy();
    expect(request.mock.calls[0][0]).toContain('active=true');
  });

  it('sugiere padrinos existentes mientras se escribe y permite crear de todas formas', async () => {
    const user = userEvent.setup();
    const request = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nuevo padrino' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Nombres'), 'José');
    await user.type(dialog.getByLabelText('Primer apellido'), 'Solidario');
    await user.type(dialog.getByLabelText('Teléfono'), '55551234');

    const suggestions = within(await dialog.findByRole('region', { name: 'Posibles coincidencias' }, { timeout: 2000 }));
    expect(suggestions.getByText('José Solidario')).toBeTruthy();
    expect(suggestions.getByText(/nombre parecido y mismo teléfono/)).toBeTruthy();
    expect(suggestions.getByText(/Apoya a: Ana Pérez \(Activo\)/)).toBeTruthy();
    const matchCall = request.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/sponsors/matches?')).at(-1)!;
    expect(new URLSearchParams(matchCall.split('?')[1]).get('phone')).toBe('55551234');
    expect(posts(request)).toHaveLength(0);

    await user.type(dialog.getByLabelText('Segundo apellido'), 'Ruiz');
    await user.click(await dialog.findByRole('button', { name: 'Crear de todas formas' }, { timeout: 2000 }));
    await waitFor(() => expect(posts(request)).toHaveLength(1));
    expect(JSON.parse(String(posts(request)[0][1]!.body))).toMatchObject({
      type: 'INDIVIDUAL', givenNames: 'José', firstSurname: 'Solidario', secondSurname: 'Ruiz', phone: '55551234',
    });
    expect(await screen.findByRole('heading', { name: 'José Solidario Ruiz' })).toBeTruthy();
  });

  it('antes de crear vuelve a consultar coincidencias aunque la sugerencia no haya llegado', async () => {
    const user = userEvent.setup();
    const request = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nuevo padrino' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Nombres'), 'José');
    await user.type(dialog.getByLabelText('Primer apellido'), 'Solidario');
    await user.click(dialog.getByRole('button', { name: 'Registrar padrino' }));
    expect(await dialog.findByRole('alert')).toBeTruthy();
    expect(dialog.getByText(/Encontramos padrinos parecidos/)).toBeTruthy();
    expect(posts(request)).toHaveLength(0);
  });

  it('desde una coincidencia abre el padrino existente en lugar de duplicarlo', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nuevo padrino' }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Correo electrónico'), 'jose@example.test');
    await user.click(await screen.findByRole('button', { name: 'Ver padrino' }, { timeout: 2000 }));
    const dialog = within(await screen.findByRole('dialog', { name: 'José Solidario' }));
    expect(await dialog.findByText('MA-2026-00001')).toBeTruthy();
  });

  it('muestra el motivo cuando no se puede desactivar', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver padrino José Solidario' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'José Solidario' }));
    await user.click(await dialog.findByRole('button', { name: 'Desactivar' }));
    expect((await dialog.findByRole('alert')).textContent).toMatch(/padrinazgos vigentes/);
  });

  it('el colaborador consulta pero no ve acciones de edición', async () => {
    const user = userEvent.setup();
    renderPage({ write: false });
    expect(screen.queryByRole('button', { name: 'Nuevo padrino' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Ver padrino José Solidario' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'José Solidario' }));
    await dialog.findByText('MA-2026-00001');
    expect(dialog.queryByRole('button', { name: 'Editar datos' })).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Desactivar' })).toBeNull();
  });
});
