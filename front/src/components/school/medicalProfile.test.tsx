import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { StudentMedicalProfile } from '../../api/medical.ts';
import { AuthContext, type AuthContextValue } from '../../auth/AuthState.ts';
import type { PermissionCode } from '../../auth/types.ts';
import { MedicalProfileSection } from './MedicalProfileSection.tsx';
import { StudentSummaryModal } from './StudentSummaryModal.tsx';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const medical: StudentMedicalProfile = {
  profile: {
    bloodType: 'O+', bloodTypeUnknown: false, hasDiseaseOrAllergy: true, diseaseOrAllergyDetails: 'Asma',
    hasMedicationAllergy: true, medicationAllergyDetails: 'Penicilina', vaccinationsComplete: false,
    missingVaccines: 'Refuerzo de tétanos', emergencyMedicalNotes: 'Llamar a la madre', updatedAt: '2026-10-01T10:00:00.000Z',
  },
  enrollment: { id: 'e-1', status: 'APPROVED', academicCycle: { id: 'c-1', name: 'Ciclo 2026', year: 2026 } },
};

describe('perfil médico del alumno', () => {
  it('se carga a pedido y muestra los datos para emergencias', async () => {
    const request = vi.fn(async () => json({ data: medical }));
    render(<MedicalProfileSection studentId="s-1" request={request} />);
    expect(request).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver perfil médico' }));

    expect(await screen.findByText('O+')).toBeTruthy();
    expect(screen.getByText('Sí: Penicilina')).toBeTruthy();
    expect(screen.getByText('No: faltan Refuerzo de tétanos')).toBeTruthy();
    expect(screen.getByText('Llamar a la madre')).toBeTruthy();
    expect(screen.getByText(/Ciclo 2026 · actualizado 01\/10\/2026/)).toBeTruthy();
    expect(request).toHaveBeenCalledWith('/students/s-1/medical-profile');
  });

  it('indica cuando no hay perfil y muestra el error de la API', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({ message: 'No tienes permiso para realizar esta acción' }, 403))
      .mockResolvedValueOnce(json({ data: { profile: null, enrollment: null } }));
    render(<MedicalProfileSection studentId="s-1" request={request} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ver perfil médico' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/permiso/);
    await user.click(screen.getByRole('button', { name: 'Ver perfil médico' }));
    expect(await screen.findByText('Sin perfil médico registrado.')).toBeTruthy();
  });

  it.each([
    [['student.read', 'student.medical.read'], true],
    [['student.read'], false],
  ] as Array<[PermissionCode[], boolean]>)('la ficha muestra la sección médica solo con el permiso (%j)', async (permissions, visible) => {
    const summary = {
      student: { id: 's-1', studentCode: 'MA-1', fullName: 'Ana Pérez', status: 'ACTIVE', cuiMasked: null, birthDate: null },
      photo: null, address: null, currentEnrollment: null, responsible: null, guardians: [], sponsors: [],
      authorizedPickups: [], maxAuthorizedPickups: 3, documents: [], history: [],
    };
    const request = vi.fn(async (path: string) => {
      if (path.endsWith('/summary')) return json({ data: summary });
      if (path.endsWith('/address')) return json({ data: { address: null, sharedWith: [] } });
      return json({ message: `Ruta no simulada: ${path}` }, 404);
    });
    const auth: AuthContextValue = {
      status: 'authenticated', user: null, accessToken: 'token', isAdmin: false,
      can: (permission) => permissions.includes(permission), request,
      login: async () => {}, logout: async () => {},
    };
    render(<AuthContext.Provider value={auth}><MemoryRouter><StudentSummaryModal studentId="s-1" onClose={() => {}} /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
    expect(Boolean(screen.queryByRole('heading', { name: 'Perfil médico' }))).toBe(visible);
    expect(request.mock.calls.some(([path]) => path.endsWith('/medical-profile'))).toBe(false);
  });
});
