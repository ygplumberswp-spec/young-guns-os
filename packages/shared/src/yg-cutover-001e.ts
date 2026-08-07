/**
 * YG-CUTOVER-001E — Technician Field Mobile acceptance contracts.
 */

export const YG_CUTOVER_001E_LABEL = 'YG-CUTOVER-001E' as const;

export const YG_CUTOVER_001E_VISIBLE_SURFACES = [
  'Today / Dispatch',
  'Schedule',
  'assigned Jobs',
  'Job Cards',
  'Navigation / Directions',
  'Timesheets',
  'Parts Used / returns',
  'Notifications (job/dispatch scoped)',
  'Offline Sync',
  'completion workflow on job cards',
] as const;

export const YG_CUTOVER_001E_FORBIDDEN_SURFACES = [
  'unpaid invoices / company finance',
  'company inventory low-stock alerts',
  'Performance nav (productivity analytics)',
  'Communications Hub / CRM',
  'Owner dashboard / AURA executive',
  'unrelated company jobs',
] as const;

export const YG_CUTOVER_001E_ASSIGNED_JOB_SOURCE =
  'getJobIdsForUserIncludingCrew → MobileService.listAssignedJobs' as const;

export const YG_CUTOVER_001E_ACTIVE_COUNT_SURFACES = [
  'greeting',
  'Assigned Jobs panel',
  'route stops',
] as const;
