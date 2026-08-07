import type { OperationalReportAudience } from '@titan/shared';
import { isTechnicianRole, type StaffIdentity } from '@titan/auth';

export type StaffReportExportMode = 'internal' | 'technician' | 'none';

/** Derive which staff report export mode the UI may offer — server remains authoritative. */
export function resolveStaffReportExportMode(user: StaffIdentity & { permissions: string[] }): StaffReportExportMode {
  if (isTechnicianRole(user)) {
    return 'technician';
  }
  const permissions = user.permissions;
  if (permissions.includes('*') || permissions.includes('documents:read') || permissions.includes('jobs:write')) {
    return 'internal';
  }
  if (permissions.includes('jobs:read') || permissions.includes('mobile:read')) {
    return 'technician';
  }
  return 'none';
}

export function staffAudienceForMode(mode: StaffReportExportMode): OperationalReportAudience | undefined {
  if (mode === 'internal') return 'internal';
  if (mode === 'technician') return undefined;
  return undefined;
}
