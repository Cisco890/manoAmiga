import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../app/router.tsx';
import { AuthProvider } from './AuthContext.tsx';
import type { AuthPayload } from './types.ts';

const collaboratorSession: AuthPayload = {
  accessToken: 'header.payload.firma',
  expiresIn: 900,
  user: {
    id: 'usuario-1',
    schoolId: 'colegio-1',
    email: 'colaborador@manoamiga.edu.gt',
    displayName: 'Colaborador Prueba',
    roles: ['COLLABORATOR'],
    permissions: ['dashboard.read', 'student.read'],
  },
};

type ApiHandler = (path: string, init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const noSession = () => json(401, { message: 'Sesión no disponible' });

function stubApi(handler: ApiHandler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) =>
    Promise.resolve(handler(String(input).replace(/^\/api/, ''), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

// Todas las rutas declaradas en la aplicación, salvo el login.
function appPaths(routeList: RouteObject[], base = '/'): string[] {
  return routeList.flatMap((route) => {
    const segment = route.path === '*' ? 'ruta-inexistente' : route.path;
    const fullPath = !segment
      ? base
      : segment.startsWith('/')
        ? segment
        : `${base.replace(/\/$/, '')}/${segment}`;
    const own = route.index || (route.path && !route.children) ? [fullPath] : [];
    return [...own, ...appPaths(route.children ?? [], fullPath)];
  });
}

const protectedPaths = [...new Set(appPaths(routes))].filter((path) => path !== '/login');

describe('protección de rutas sin sesión válida', () => {
  it('declara las vistas protegidas esperadas', () => {
    expect(protectedPaths).toEqual(
      expect.arrayContaining(['/', '/alumnos', '/usuarios', '/configuracion', '/ruta-inexistente']),
    );
  });

  it.each(protectedPaths)('redirige %s al login', async (path) => {
    const fetchMock = stubApi(noSession);
    const router = renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Bienvenido' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: path });
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('no muestra la vista mientras verifica la sesión', async () => {
    let rejectSession = () => {};
    stubApi(
      () =>
        new Promise<Response>((resolve) => {
          rejectSession = () => resolve(noSession());
        }),
    );
    const router = renderApp('/alumnos');

    expect(await screen.findByText('Verificando sesión…')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/alumnos');
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();

    rejectSession();
    expect(await screen.findByRole('heading', { name: 'Bienvenido' })).toBeTruthy();
  });
});

describe('inicio de sesión', () => {
  it('obtiene el JWT, lo conserva solo en memoria y vuelve a la vista solicitada', async () => {
    const fetchMock = stubApi((path) =>
      path === '/auth/login' ? json(200, collaboratorSession) : noSession(),
    );
    const router = renderApp('/alumnos');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Correo electrónico'), 'colaborador@manoamiga.edu.gt');
    await user.type(screen.getByLabelText('Contraseña'), 'ClaveDePrueba-2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/alumnos'));
    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          email: 'colaborador@manoamiga.edu.gt',
          password: 'ClaveDePrueba-2026',
        }),
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(collaboratorSession.accessToken);
  });

  it('muestra el error del servidor y no concede acceso con credenciales incorrectas', async () => {
    stubApi((path) =>
      path === '/auth/login' ? json(401, { message: 'Correo o contraseña incorrectos' }) : noSession(),
    );
    const router = renderApp('/alumnos');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Correo electrónico'), 'colaborador@manoamiga.edu.gt');
    await user.type(screen.getByLabelText('Contraseña'), 'ClaveIncorrecta-1');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Correo o contraseña incorrectos');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('restaura la sesión con el refresh token al recargar la página', async () => {
    stubApi((path) => (path === '/auth/refresh' ? json(200, collaboratorSession) : noSession()));
    const router = renderApp('/alumnos');

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/alumnos');
  });

  it('cierra la sesión y vuelve a bloquear las vistas protegidas', async () => {
    const fetchMock = stubApi((path) => {
      if (path === '/auth/refresh') return json(200, collaboratorSession);
      if (path === '/auth/logout') return new Response(null, { status: 204 });
      return noSession();
    });
    const router = renderApp('/alumnos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Bienvenido' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

describe('autorización por rol en el frontend', () => {
  it.each(['/usuarios', '/configuracion'])('un colaborador no puede abrir %s', async (path) => {
    stubApi((requestPath) =>
      requestPath === '/auth/refresh' ? json(200, collaboratorSession) : noSession(),
    );
    const router = renderApp(path);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });
});
