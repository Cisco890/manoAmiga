export type RoleCode = 'ADMIN' | 'COLLABORATOR';

export type PermissionCode =
  | 'dashboard.read'
  | 'student.read'
  | 'student.write'
  | 'enrollment.read'
  | 'enrollment.write'
  | 'sponsor.read'
  | 'sponsor.write'
  | 'document.generate'
  | 'document.print'
  | 'user.manage'
  | 'settings.manage';

export type AuthUser = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

export type AuthPayload = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};
