import { hasAnyPermission, isTechnicianRole, type StaffIdentity } from '@titan/auth';

export type SchedulingAuthContext = StaffIdentity & { userId: string };

export function canReadSchedulingCalendar(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['dispatch:read', 'dispatch:write', 'mobile:read']);
}

export function canWriteSchedulingCalendar(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['dispatch:write']);
}

export function isTechnicianCalendarScope(identity: StaffIdentity): boolean {
  return (
    isTechnicianRole(identity) &&
    !hasAnyPermission(identity.permissions, ['dispatch:read', 'dispatch:write'])
  );
}

export function resolveCalendarViewScope(identity: StaffIdentity): 'all' | 'own' {
  return isTechnicianCalendarScope(identity) ? 'own' : 'all';
}
