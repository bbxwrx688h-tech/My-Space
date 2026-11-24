import { assignableRoles } from '@shared/model';
import type { Role, Site } from '@shared/model';

/** Hebrew role labels and the roles an admin can assign in the directory. */
export const roleLabels: Record<Role, string> = {
  user: 'עובד/ת',
  manager: 'מנהל/ת',
  boss: 'מנהל/ת בכיר/ה',
  admin: 'מנהל מערכת',
};

export const assignableRoleOptions = assignableRoles.map((value) => ({
  value,
  label: roleLabels[value],
}));

export const defaultSite: Site = 'MID';
