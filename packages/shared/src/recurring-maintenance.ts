/**
 * TITAN Operations — Recurring Maintenance Engine
 *
 * Customer/property/asset recurring service plans on top of existing
 * asset_maintenance_schedules + al_preventive_maintenance_due + maintenance.due
 * Workflow Automation wiring. Never invents demo plans, runs, or opportunities.
 *
 * Guarantees:
 * - Tenant isolation via companyId on every query
 * - Customer outbound: draft → Owner approve → Email Centre execute (never auto-send)
 * - In-app reminders may fire without external send
 * - AURA suggestions are draft/advisory only (autoExecuted always false)
 */

export const RECURRING_MAINTENANCE_GUARANTEES = {
  noDemoData: true,
  noFakePlans: true,
  noFakeRuns: true,
  tenantIsolated: true,
  ownerApprovalForCustomerCommunication: true,
  noAutoExternalCommunication: true,
  auraSuggestionsDraftOnly: true,
  autoExecuted: false as const,
  extendsExistingMaintenanceDue: true,
} as const;

/** Plumbing asset kinds — stored on plans; asset_type remains equipment. */
export const PLUMBING_EQUIPMENT_KINDS = [
  'geyser',
  'prv',
  'tank',
  'installed_equipment',
  'other',
] as const;

export type PlumbingEquipmentKind = (typeof PLUMBING_EQUIPMENT_KINDS)[number];

export const PLUMBING_EQUIPMENT_KIND_LABELS: Record<PlumbingEquipmentKind, string> = {
  geyser: 'Geyser',
  prv: 'PRV',
  tank: 'Tank',
  installed_equipment: 'Installed equipment',
  other: 'Other',
};

export type OpsMaintenancePlanStatus = 'draft' | 'active' | 'paused' | 'archived';
export type OpsMaintenanceRunStatus = 'completed' | 'skipped' | 'missed';
export type OpsMaintenanceReminderStatus = 'pending' | 'acknowledged' | 'dismissed' | 'snoozed';
export type OpsMaintenanceCommStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';
export type OpsMaintenanceAuraKind =
  | 'upcoming_alert'
  | 'missed_maintenance'
  | 'customer_opportunity';
export type OpsMaintenanceAuraStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type OpsRecurringMaintenancePlanSummary = {
  id: string;
  name: string;
  description: string | null;
  assetId: string;
  scheduleId: string | null;
  customerId: string | null;
  propertyId: string | null;
  jobId: string | null;
  plumbingKind: PlumbingEquipmentKind;
  intervalDays: number;
  nextDueAt: string | null;
  lastCompletedAt: string | null;
  reminderDaysBefore: number;
  status: OpsMaintenancePlanStatus;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type OpsMaintenanceDueBucket = 'upcoming' | 'due' | 'missed' | 'completed';

export type OpsMaintenanceDueItem = {
  planId: string;
  planName: string;
  assetId: string;
  customerId: string | null;
  propertyId: string | null;
  plumbingKind: PlumbingEquipmentKind;
  nextDueAt: string | null;
  bucket: OpsMaintenanceDueBucket;
  dueRecordId: string | null;
  dueStatus: string | null;
  daysUntilDue: number | null;
};

export type OpsMaintenanceRunSummary = {
  id: string;
  planId: string;
  dueId: string | null;
  maintenanceRecordId: string | null;
  jobId: string | null;
  status: OpsMaintenanceRunStatus;
  completedAt: string | null;
  notes: string | null;
  documentIds: string[];
  createdAt: string;
};

export type OpsMaintenanceReminderSummary = {
  id: string;
  planId: string;
  dueId: string | null;
  title: string;
  remindAt: string;
  status: OpsMaintenanceReminderStatus;
  acknowledgedAt: string | null;
  createdAt: string;
};

export type OpsMaintenanceCommRequestSummary = {
  id: string;
  planId: string | null;
  customerId: string | null;
  subject: string;
  body: string;
  status: OpsMaintenanceCommStatus;
  emailDraftId: string | null;
  autoExecuted: false;
  decidedAt: string | null;
  decisionNotes: string | null;
  executedAt: string | null;
  createdAt: string;
};

export type OpsMaintenanceAuraSuggestionSummary = {
  id: string;
  planId: string | null;
  assetId: string | null;
  customerId: string | null;
  kind: OpsMaintenanceAuraKind;
  subject: string;
  body: string;
  status: OpsMaintenanceAuraStatus;
  supportingSignals: Array<Record<string, unknown>>;
  autoExecuted: false;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
};

export type OpsRecurringMaintenanceOverview = {
  counts: {
    activePlans: number;
    upcoming: number;
    due: number;
    missed: number;
    pendingReminders: number;
    pendingCommApprovals: number;
    pendingAuraSuggestions: number;
  };
  recentPlans: OpsRecurringMaintenancePlanSummary[];
  dueItems: OpsMaintenanceDueItem[];
  pendingCommRequests: OpsMaintenanceCommRequestSummary[];
  pendingAuraSuggestions: OpsMaintenanceAuraSuggestionSummary[];
  plumbingKinds: typeof PLUMBING_EQUIPMENT_KINDS;
  guarantees: typeof RECURRING_MAINTENANCE_GUARANTEES;
};

export type CreateRecurringMaintenancePlanRequest = {
  name: string;
  description?: string | null;
  assetId: string;
  customerId?: string | null;
  propertyId?: string | null;
  jobId?: string | null;
  plumbingKind?: PlumbingEquipmentKind;
  intervalDays: number;
  nextDueAt?: string | null;
  reminderDaysBefore?: number;
  status?: OpsMaintenancePlanStatus;
  documentIds?: string[];
  /** When true (default), also creates/links an asset_maintenance_schedules row. */
  syncSchedule?: boolean;
};

export type UpdateRecurringMaintenancePlanRequest = {
  name?: string;
  description?: string | null;
  customerId?: string | null;
  propertyId?: string | null;
  jobId?: string | null;
  plumbingKind?: PlumbingEquipmentKind;
  intervalDays?: number;
  nextDueAt?: string | null;
  reminderDaysBefore?: number;
  status?: OpsMaintenancePlanStatus;
  documentIds?: string[];
};

export type CompleteMaintenanceCycleRequest = {
  notes?: string | null;
  jobId?: string | null;
  documentIds?: string[];
  dueId?: string | null;
  completedAt?: string | null;
};

export type CreateMaintenanceCommRequest = {
  planId?: string | null;
  customerId?: string | null;
  subject: string;
  body: string;
  /** Optional recipient overrides; otherwise customer email is used at execute. */
  to?: string[];
};

export type DecideMaintenanceCommRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type DecideMaintenanceAuraRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export function classifyMaintenanceDueBucket(
  nextDueAt: Date | string | null | undefined,
  now: Date = new Date(),
): OpsMaintenanceDueBucket {
  if (!nextDueAt) return 'upcoming';
  const due = typeof nextDueAt === 'string' ? new Date(nextDueAt) : nextDueAt;
  if (Number.isNaN(due.getTime())) return 'upcoming';
  const ms = due.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < -1) return 'missed';
  if (days <= 0) return 'due';
  return 'upcoming';
}

export function daysUntilDue(
  nextDueAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!nextDueAt) return null;
  const due = typeof nextDueAt === 'string' ? new Date(nextDueAt) : nextDueAt;
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isCustomerFacingMaintenanceComm(
  status: OpsMaintenanceCommStatus,
): boolean {
  return status === 'executed';
}

export function requiresOwnerApprovalForComm(
  status: OpsMaintenanceCommStatus,
): boolean {
  return status === 'pending_approval' || status === 'draft' || status === 'approved';
}
