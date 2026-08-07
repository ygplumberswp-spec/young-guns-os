/**
 * TITAN Operations — Workflow Automation Engine
 *
 * Operations-facing monitoring + approval layer over the existing Jobs / CRM /
 * Scheduling / Dispatch / Finance / Communication Timeline / AURA / Approval
 * systems. Never invents workflow runs, metrics, or demo triggers.
 *
 * Guarantees:
 * - Tenant isolation via companyId on every query
 * - Sensitive / outbound actions require Owner approval before execute
 * - External communication is draft → approve → execute (never auto-send)
 * - In-app notifications may fire without external send
 * - AURA suggestions are draft/advisory only (autoExecuted always false)
 */

import type {
  WorkflowActionType,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowTriggerType,
} from './automation.js';

export const WORKFLOW_AUTOMATION_GUARANTEES = {
  noDemoData: true,
  noFakeRuns: true,
  tenantIsolated: true,
  ownerApprovalForSensitiveActions: true,
  noAutoExternalCommunication: true,
  auraSuggestionsDraftOnly: true,
  autoExecuted: false as const,
} as const;

/** Product-facing Operations trigger catalog (wired to real domain events). */
export const OPS_WORKFLOW_TRIGGER_CATALOG: ReadonlyArray<{
  trigger: WorkflowTriggerType;
  event: string;
  label: string;
  wired: boolean;
}> = [
  { trigger: 'lead_created', event: 'lead.created', label: 'New lead created', wired: true },
  { trigger: 'customer_created', event: 'customer.created', label: 'Customer created', wired: true },
  { trigger: 'quote_created', event: 'quote.created', label: 'Quote created', wired: true },
  {
    trigger: 'quote_accepted',
    event: 'quote.accepted',
    label: 'Quote accepted',
    wired: true,
  },
  { trigger: 'job_booked', event: 'job.booked', label: 'Job booked', wired: true },
  { trigger: 'job_assigned', event: 'job.assigned', label: 'Job assigned', wired: true },
  { trigger: 'job_completed', event: 'job.completed', label: 'Job completed', wired: true },
  { trigger: 'invoice_created', event: 'invoice.created', label: 'Invoice created', wired: true },
  {
    trigger: 'payment_received',
    event: 'payment.received',
    label: 'Payment received',
    wired: true,
  },
  {
    trigger: 'maintenance_due',
    event: 'maintenance.due',
    label: 'Maintenance due',
    wired: true,
  },
] as const;

/** Product-facing Operations action catalog. */
export const OPS_WORKFLOW_ACTION_CATALOG: ReadonlyArray<{
  action: WorkflowActionType;
  label: string;
  requiresOwnerApproval: boolean;
  externalCommunication: boolean;
}> = [
  {
    action: 'create_task',
    label: 'Create tasks',
    requiresOwnerApproval: false,
    externalCommunication: false,
  },
  {
    action: 'notify_user',
    label: 'Send notifications (in-app)',
    requiresOwnerApproval: false,
    externalCommunication: false,
  },
  {
    action: 'send_internal_notification',
    label: 'Send internal notification (in-app)',
    requiresOwnerApproval: false,
    externalCommunication: false,
  },
  {
    action: 'create_follow_up',
    label: 'Create follow-ups (draft)',
    requiresOwnerApproval: false,
    externalCommunication: false,
  },
  {
    action: 'create_approval_request',
    label: 'Request approvals',
    requiresOwnerApproval: true,
    externalCommunication: false,
  },
  {
    action: 'update_record',
    label: 'Update records (scoped)',
    requiresOwnerApproval: true,
    externalCommunication: false,
  },
  {
    action: 'trigger_aura_suggestion',
    label: 'Trigger AURA suggestions (draft)',
    requiresOwnerApproval: false,
    externalCommunication: false,
  },
  {
    action: 'send_communication',
    label: 'Send communication (draft→approve→execute)',
    requiresOwnerApproval: true,
    externalCommunication: true,
  },
  {
    action: 'send_email_draft',
    label: 'Email draft (approval before send path)',
    requiresOwnerApproval: true,
    externalCommunication: true,
  },
  {
    action: 'send_whatsapp_draft',
    label: 'WhatsApp draft (approval before send path)',
    requiresOwnerApproval: true,
    externalCommunication: true,
  },
] as const;

export type OpsWorkflowMonitorBucket = 'active' | 'completed' | 'failed' | 'awaiting_approval';

export type OpsWorkflowRunMonitorStatus = WorkflowRunStatus | 'cancelled';

export type OpsWorkflowTaskStatus = 'open' | 'completed' | 'cancelled';

export type OpsWorkflowFollowUpStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'declined'
  | 'completed'
  | 'cancelled';

export type OpsWorkflowAuraSuggestionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type OpsWorkflowMonitorCounts = {
  active: number;
  completed: number;
  failed: number;
  awaitingApproval: number;
  /** Sum of open ops tasks created by workflows — never invented. */
  openTasks: number;
  /** Draft / pending follow-ups — never invented. */
  draftFollowUps: number;
  /** Pending AURA suggestions — never invented. */
  pendingAuraSuggestions: number;
};

export type OpsWorkflowRunSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerEvent: string;
  triggerEntityType: string | null;
  triggerEntityId: string | null;
  status: WorkflowRunStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  isSimulation: boolean;
};

export type OpsWorkflowDefinitionSummary = {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  triggerCount: number;
  actionCount: number;
  triggers: WorkflowTriggerType[];
  actions: WorkflowActionType[];
  updatedAt: string;
};

export type OpsWorkflowApprovalSummary = {
  stepResultId: string;
  workflowRunId: string;
  workflowId: string | null;
  workflowName: string | null;
  actionType: WorkflowActionType | string;
  preview: string | null;
  status: string;
  createdAt: string;
  triggerEvent: string | null;
};

export type OpsWorkflowTaskSummary = {
  id: string;
  title: string;
  description: string | null;
  status: OpsWorkflowTaskStatus;
  assigneeUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  workflowRunId: string | null;
  workflowId: string | null;
  createdAt: string;
};

export type OpsWorkflowFollowUpSummary = {
  id: string;
  title: string;
  notes: string | null;
  status: OpsWorkflowFollowUpStatus;
  customerId: string | null;
  entityType: string | null;
  entityId: string | null;
  dueAt: string | null;
  workflowRunId: string | null;
  workflowId: string | null;
  createdAt: string;
};

export type OpsWorkflowAuraSuggestionSummary = {
  id: string;
  subject: string;
  body: string;
  status: OpsWorkflowAuraSuggestionStatus;
  supportingSignals: string[];
  autoExecuted: false;
  entityType: string | null;
  entityId: string | null;
  workflowRunId: string | null;
  workflowId: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
};

export type OpsWorkflowMonitorOverview = {
  counts: OpsWorkflowMonitorCounts;
  recentActive: OpsWorkflowRunSummary[];
  recentCompleted: OpsWorkflowRunSummary[];
  recentFailed: OpsWorkflowRunSummary[];
  pendingApprovals: OpsWorkflowApprovalSummary[];
  triggerCatalog: typeof OPS_WORKFLOW_TRIGGER_CATALOG;
  actionCatalog: typeof OPS_WORKFLOW_ACTION_CATALOG;
  guarantees: typeof WORKFLOW_AUTOMATION_GUARANTEES;
};

export type OpsWorkflowDecideRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

/** Map monitor UI buckets onto real workflow_run statuses. */
export function monitorBucketToRunStatuses(
  bucket: OpsWorkflowMonitorBucket,
): WorkflowRunStatus[] {
  switch (bucket) {
    case 'active':
      return ['pending', 'running', 'awaiting_approval'];
    case 'completed':
      return ['completed', 'skipped'];
    case 'failed':
      return ['failed'];
    case 'awaiting_approval':
      return ['awaiting_approval'];
    default:
      return [];
  }
}

export function isSensitiveWorkflowAction(action: WorkflowActionType): boolean {
  const entry = OPS_WORKFLOW_ACTION_CATALOG.find((item) => item.action === action);
  if (entry) return entry.requiresOwnerApproval || entry.externalCommunication;
  return (
    action.startsWith('send_') ||
    action === 'update_record' ||
    action === 'update_job_status' ||
    action === 'update_customer' ||
    action === 'assign_job_task' ||
    action === 'assign_user' ||
    action === 'run_ai_agent' ||
    action === 'create_approval_request'
  );
}

/** Safe record update allow-list — never arbitrary SQL / free-form columns. */
export const OPS_SAFE_RECORD_UPDATE_FIELDS = {
  customer: ['notes', 'status'] as const,
  job: ['notes', 'priority', 'customerVisibleNotes'] as const,
} as const;

export type OpsSafeRecordType = keyof typeof OPS_SAFE_RECORD_UPDATE_FIELDS;

export function filterSafeRecordUpdates(
  recordType: string,
  updates: Record<string, unknown>,
): { recordType: OpsSafeRecordType; safeUpdates: Record<string, unknown> } | null {
  if (recordType !== 'customer' && recordType !== 'job') {
    return null;
  }
  const allowed = OPS_SAFE_RECORD_UPDATE_FIELDS[recordType];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      safeUpdates[key] = updates[key];
    }
  }
  if (Object.keys(safeUpdates).length === 0) {
    return null;
  }
  return { recordType, safeUpdates };
}
