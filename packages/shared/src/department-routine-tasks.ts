import type {
  CorporateDepartmentId,
  DepartmentAccountableOwner,
  DepartmentRoutineLink,
} from './corporate-departments.js';
import { CORPORATE_DEPARTMENTS, getCorporateDepartmentById } from './corporate-departments.js';

/** Persisted department routine task statuses. */
export type DepartmentRoutineTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'blocked'
  | 'awaiting_approval'
  | 'skipped';

export type DepartmentRoutineTaskCadence = 'daily' | 'weekly' | 'monthly';

export type DepartmentRoutineTaskAuditEventType =
  | 'created'
  | 'status_changed'
  | 'completed'
  | 'skipped'
  | 'handoff'
  | 'approval_requested'
  | 'approved'
  | 'rejected';

export type DepartmentRoutineDefinition = {
  departmentId: CorporateDepartmentId;
  cadence: DepartmentRoutineTaskCadence;
  label: string;
  href: string;
  approvalGateId: string | null;
  handoffToDepartmentId: CorporateDepartmentId | null;
};

export type DepartmentRoutineTaskRecord = {
  id: string;
  companyId: string;
  departmentId: CorporateDepartmentId;
  routineKey: string;
  title: string;
  description: string | null;
  href: string;
  cadence: DepartmentRoutineTaskCadence;
  accountableOwner: DepartmentAccountableOwner;
  assignedUserId: string | null;
  dueDate: string;
  periodStart: string;
  status: DepartmentRoutineTaskStatus;
  requiresApproval: boolean;
  approvalGateId: string | null;
  handoffToDepartmentId: CorporateDepartmentId | null;
  handoffStatus: 'pending' | 'completed' | null;
  completedAt: string | null;
  completedByUserId: string | null;
  skippedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentRoutineTaskAuditRecord = {
  id: string;
  taskId: string;
  eventType: DepartmentRoutineTaskAuditEventType;
  fromStatus: DepartmentRoutineTaskStatus | null;
  toStatus: DepartmentRoutineTaskStatus | null;
  message: string;
  metadata: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
};

export type DepartmentRoutineTaskListResponse = {
  generatedAt: string;
  departmentId: CorporateDepartmentId;
  tasks: DepartmentRoutineTaskRecord[];
  auditAvailable: boolean;
};

/** Daily routines from TITAN_DEPARTMENT_RECURRING_ROUTINES.md — real route links only. */
export const DEPARTMENT_DAILY_ROUTINES: DepartmentRoutineDefinition[] = [
  {
    departmentId: 'executive_strategy',
    cadence: 'daily',
    label: 'Review owner dashboard action queue',
    href: '/',
    approvalGateId: null,
    handoffToDepartmentId: null,
  },
  {
    departmentId: 'finance_accounting',
    cadence: 'daily',
    label: 'Money Today — receivables snapshot',
    href: '/finance/receivables',
    approvalGateId: null,
    handoffToDepartmentId: null,
  },
  {
    departmentId: 'scheduling_dispatch',
    cadence: 'daily',
    label: 'Unassigned and delayed jobs',
    href: '/scheduling',
    approvalGateId: null,
    handoffToDepartmentId: null,
  },
  {
    departmentId: 'operations',
    cadence: 'daily',
    label: 'Live dispatch board',
    href: '/mobile-platform/dispatcher',
    approvalGateId: null,
    handoffToDepartmentId: null,
  },
  {
    departmentId: 'executive_strategy',
    cadence: 'daily',
    label: 'Department hub — scan actionable queues',
    href: '/departments',
    approvalGateId: null,
    handoffToDepartmentId: null,
  },
];

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function buildRoutineKey(
  departmentId: CorporateDepartmentId,
  cadence: DepartmentRoutineTaskCadence,
  label: string,
): string {
  return `${departmentId}:${cadence}:${slugifyLabel(label)}`;
}

function resolveApprovalGateId(
  departmentId: CorporateDepartmentId,
  routine: DepartmentRoutineLink,
): string | null {
  const dept = getCorporateDepartmentById(departmentId);
  if (!dept) return null;
  const match = dept.approvals.find((gate) => gate.href === routine.href);
  return match?.id ?? null;
}

function resolveHandoffTarget(
  departmentId: CorporateDepartmentId,
): CorporateDepartmentId | null {
  const dept = getCorporateDepartmentById(departmentId);
  if (!dept || dept.handoffs.length === 0) return null;
  return dept.handoffs[0]?.toDepartmentId ?? null;
}

/** All routine definitions derived from corporate-departments.ts + daily doc table. */
export function listAllDepartmentRoutineDefinitions(): DepartmentRoutineDefinition[] {
  const definitions: DepartmentRoutineDefinition[] = [...DEPARTMENT_DAILY_ROUTINES];

  for (const dept of CORPORATE_DEPARTMENTS) {
    for (const routine of dept.weeklyRoutine) {
      definitions.push({
        departmentId: dept.id,
        cadence: 'weekly',
        label: routine.label,
        href: routine.href,
        approvalGateId: resolveApprovalGateId(dept.id, routine),
        handoffToDepartmentId: resolveHandoffTarget(dept.id),
      });
    }
    for (const routine of dept.monthlyRoutine) {
      definitions.push({
        departmentId: dept.id,
        cadence: 'monthly',
        label: routine.label,
        href: routine.href,
        approvalGateId: resolveApprovalGateId(dept.id, routine),
        handoffToDepartmentId: resolveHandoffTarget(dept.id),
      });
    }
  }

  return definitions;
}

export function canAccessDepartment(
  permissions: string[],
  departmentId: CorporateDepartmentId,
): boolean {
  if (permissions.includes('*')) return true;
  const dept = getCorporateDepartmentById(departmentId);
  if (!dept) return false;
  return dept.requiredPermissions.some((perm) => permissions.includes(perm));
}

export function canMutateDepartmentTasks(
  permissions: string[],
  departmentId: CorporateDepartmentId,
): boolean {
  if (permissions.includes('*')) return true;
  if (!canAccessDepartment(permissions, departmentId)) return false;
  return (
    permissions.includes('executive:read') ||
    permissions.includes('ops:write') ||
    permissions.includes('workforce:write')
  );
}

export function localDateIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday of the ISO week containing `date`. */
export function weekPeriodStart(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return localDateIso(copy);
}

/** Sunday end of ISO week containing `date`. */
export function weekDueDate(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  copy.setDate(copy.getDate() + diff);
  return localDateIso(copy);
}

export function monthPeriodStart(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthDueDate(date = new Date()): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return localDateIso(last);
}

export function resolveRoutinePeriod(
  cadence: DepartmentRoutineTaskCadence,
  reference = new Date(),
): { periodStart: string; dueDate: string } {
  if (cadence === 'daily') {
    const today = localDateIso(reference);
    return { periodStart: today, dueDate: today };
  }
  if (cadence === 'weekly') {
    return { periodStart: weekPeriodStart(reference), dueDate: weekDueDate(reference) };
  }
  return { periodStart: monthPeriodStart(reference), dueDate: monthDueDate(reference) };
}

export function isTaskOverdue(
  status: DepartmentRoutineTaskStatus,
  dueDate: string,
  today = localDateIso(),
): boolean {
  if (status === 'completed' || status === 'skipped') return false;
  return dueDate < today && (status === 'pending' || status === 'in_progress' || status === 'overdue');
}

export const EXPECTED_DEPARTMENT_ROUTINE_DEFINITION_COUNT =
  listAllDepartmentRoutineDefinitions().length;
