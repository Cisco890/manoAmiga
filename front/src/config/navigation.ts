import type { LucideIcon } from 'lucide-react';
import type { RoleCode } from '../auth/types.ts';
import {
  ClipboardList,
  FileCheck,
  FileText,
  HeartHandshake,
  IdCard,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
  requiredRole?: RoleCode;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

export const dashboardRoute: NavigationItem = {
  label: 'Dashboard',
  path: '/',
  icon: LayoutDashboard,
  description: 'Resumen general de datos de la institución',
};

export const navigationSections: NavigationSection[] = [
  {
    title: 'Principal',
    items: [dashboardRoute],
  },
  {
    title: 'Gestión escolar',
    items: [
      {
        label: 'Alumnos',
        path: '/alumnos',
        icon: Users,
        description: 'Consulta y administración de expedientes estudiantiles',
      },
      {
        label: 'Inscripciones',
        path: '/inscripciones',
        icon: ClipboardList,
        description: 'Control de inscripciones por ciclo escolar',
      },
      {
        label: 'Padrinos',
        path: '/padrinos',
        icon: HeartHandshake,
        description: 'Consulta de padrinos y alumnos beneficiados',
      },
    ],
  },
  {
    title: 'Documentos',
    items: [
      {
        label: 'Carnés',
        path: '/carnets',
        icon: IdCard,
        description: 'Generación y control de carnés estudiantiles',
      },
      {
        label: 'Fichas de inscripción',
        path: '/fichas-inscripcion',
        icon: FileText,
        description: 'Generación y consulta de fichas por ciclo escolar',
      },
      {
        label: 'Formularios de padrinos',
        path: '/formularios-padrinos',
        icon: FileCheck,
        description: 'Generación y consulta de autorizaciones de padrinazgo',
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        label: 'Usuarios',
        path: '/usuarios',
        icon: UserCog,
        description: 'Administración de usuarios y roles del sistema',
        requiredRole: 'ADMIN',
      },
      {
        label: 'Configuración',
        path: '/configuracion',
        icon: Settings,
        description: 'Parámetros generales del colegio y del sistema',
        requiredRole: 'ADMIN',
      },
    ],
  },
];

export const navigationItems: NavigationItem[] = navigationSections.flatMap(
  (section) => section.items,
);

export function getRouteByPath(pathname: string): NavigationItem | undefined {
  return navigationItems.find((item) => item.path === pathname);
}
