import type { CustomerStatus } from './crm.js';
import type { LeadStatus } from './leads.js';
import type { CustomerValueClassificationSummary } from './customer-value-classification.js';

/** Restrained premium palette tones for list row accents and badges. */
export type StatusColorTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted';

export type LeadQuickStatusAction = {
  id: string;
  label: string;
  targetStatus: LeadStatus;
  /** Lost/duplicate/archive transitions may require a reason on the API. */
  requiresReason?: boolean;
};

export const LEAD_QUICK_STATUS_ACTIONS: LeadQuickStatusAction[] = [
  { id: 'qualify', label: 'Accept / Qualify', targetStatus: 'qualified' },
  { id: 'pending', label: 'Pending', targetStatus: 'awaiting_information' },
  { id: 'decline', label: 'Decline', targetStatus: 'lost', requiresReason: true },
  { id: 'new', label: 'Return to New', targetStatus: 'new' },
  { id: 'archive', label: 'Archive', targetStatus: 'duplicate', requiresReason: true },
];

/** UI filter groups mapped to underlying lead statuses. */
export const LEAD_STATUS_FILTER_GROUPS: Array<{
  id: string;
  label: string;
  statuses: LeadStatus[];
  tone: StatusColorTone;
}> = [
  { id: 'new', label: 'New', statuses: ['new', 'attempted_contact'], tone: 'info' },
  {
    id: 'pending',
    label: 'Pending',
    statuses: ['contacted', 'awaiting_information', 'quote_required'],
    tone: 'warning',
  },
  {
    id: 'qualified',
    label: 'Qualified',
    statuses: ['qualified', 'ready_to_book', 'opportunity'],
    tone: 'success',
  },
  { id: 'converted', label: 'Converted', statuses: ['converted'], tone: 'success' },
  { id: 'declined', label: 'Declined', statuses: ['lost'], tone: 'danger' },
  { id: 'archived', label: 'Archived', statuses: ['duplicate'], tone: 'muted' },
];

export function getLeadStatusTone(status: LeadStatus): StatusColorTone {
  if (['qualified', 'ready_to_book', 'opportunity', 'converted'].includes(status)) {
    return 'success';
  }
  if (['contacted', 'awaiting_information', 'quote_required'].includes(status)) {
    return 'warning';
  }
  if (status === 'lost') return 'danger';
  if (status === 'duplicate') return 'muted';
  if (['new', 'attempted_contact'].includes(status)) return 'info';
  return 'neutral';
}

export function getLeadStatusLabel(status: LeadStatus): string {
  const group = LEAD_STATUS_FILTER_GROUPS.find((entry) => entry.statuses.includes(status));
  if (group) {
    if (group.id === 'qualified' && status === 'qualified') return 'Qualified';
    if (group.id === 'pending' && status === 'awaiting_information') return 'Pending';
    if (group.id === 'new' && status === 'new') return 'New';
    if (group.id === 'declined') return 'Declined';
    if (group.id === 'archived') return 'Archived';
  }
  return status.replace(/_/g, ' ');
}

export function leadStatusesForFilterGroups(groupIds: string[]): LeadStatus[] {
  const statuses = new Set<LeadStatus>();
  for (const group of LEAD_STATUS_FILTER_GROUPS) {
    if (groupIds.includes(group.id)) {
      for (const status of group.statuses) statuses.add(status);
    }
  }
  return [...statuses];
}

export type CustomerUiStatus =
  | 'active'
  | 'inactive'
  | 'payment_attention'
  | 'duplicate_review'
  | 'archived';

export const CUSTOMER_UI_STATUS_OPTIONS: Array<{ value: CustomerUiStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'payment_attention', label: 'Payment attention' },
  { value: 'duplicate_review', label: 'Duplicate review' },
  { value: 'archived', label: 'Archived' },
];

export const CUSTOMER_STATUS_FILTER_GROUPS: Array<{
  id: CustomerUiStatus;
  label: string;
  tone: StatusColorTone;
}> = [
  { id: 'active', label: 'Active', tone: 'success' },
  { id: 'inactive', label: 'Inactive', tone: 'muted' },
  { id: 'payment_attention', label: 'Payment attention', tone: 'warning' },
  { id: 'duplicate_review', label: 'Duplicate review', tone: 'info' },
  { id: 'archived', label: 'Archived', tone: 'muted' },
];

export function getCustomerUiStatusTone(status: CustomerUiStatus): StatusColorTone {
  return CUSTOMER_STATUS_FILTER_GROUPS.find((entry) => entry.id === status)?.tone ?? 'neutral';
}

export function resolveCustomerUiStatus(
  dbStatus: CustomerStatus,
  classification?: Pick<
    CustomerValueClassificationSummary,
    | 'isVerifiedInvoiced'
    | 'isPayingCustomer'
    | 'isOverdueDebtor'
    | 'isUnpaidDebtor'
    | 'isPartiallyPaid'
    | 'isProspect'
  > | null,
): CustomerUiStatus {
  if (dbStatus === 'inactive') return 'archived';
  if (dbStatus === 'lead') return 'duplicate_review';
  if (
    classification &&
    (classification.isOverdueDebtor ||
      classification.isUnpaidDebtor ||
      classification.isPartiallyPaid)
  ) {
    return 'payment_attention';
  }
  if (classification?.isProspect && dbStatus === 'active') return 'duplicate_review';
  return 'active';
}

export function customerUiStatusToDbStatus(uiStatus: CustomerUiStatus): CustomerStatus {
  switch (uiStatus) {
    case 'archived':
    case 'inactive':
      return 'inactive';
    case 'duplicate_review':
      return 'lead';
    default:
      return 'active';
  }
}

export type CustomerStatusChangeGuardInput = Pick<
  CustomerValueClassificationSummary,
  'isVerifiedInvoiced' | 'isPayingCustomer' | 'isFullyPaid'
>;

/** Paying or invoiced customers cannot be archived or marked inactive (declined equivalent). */
export function validateCustomerStatusChange(
  targetUiStatus: CustomerUiStatus,
  classification: CustomerStatusChangeGuardInput | null,
): { allowed: true } | { allowed: false; reason: string } {
  if (!classification) return { allowed: true };

  const isProtected =
    classification.isVerifiedInvoiced ||
    classification.isPayingCustomer ||
    classification.isFullyPaid;

  if (
    isProtected &&
    (targetUiStatus === 'inactive' || targetUiStatus === 'archived')
  ) {
    return {
      allowed: false,
      reason:
        'Cannot archive or deactivate a paying or invoiced customer. Resolve billing first.',
    };
  }

  return { allowed: true };
}

export function isCustomerUiStatusWritable(uiStatus: CustomerUiStatus): boolean {
  return uiStatus !== 'payment_attention';
}

export type DeleteEligibility = {
  canDelete: boolean;
  canArchive: boolean;
  deleteLabel: string;
  archiveLabel: string;
  blockReason?: string;
};

/** Paying/invoiced customers must archive, not delete. */
export function getCustomerDeleteEligibility(
  classification: CustomerStatusChangeGuardInput | null,
): DeleteEligibility {
  const guard = validateCustomerStatusChange('archived', classification);
  const isProtected = !guard.allowed;

  return {
    canDelete: !isProtected,
    canArchive: true,
    deleteLabel: isProtected ? 'Delete (blocked)' : 'Delete permanently',
    archiveLabel: 'Archive',
    blockReason: isProtected ? guard.reason : undefined,
  };
}

/** Block delete when converted or linked to a job. */
export function getLeadDeleteEligibility(lead: {
  status: LeadStatus;
  jobId: string | null;
}): DeleteEligibility {
  const isConverted = lead.status === 'converted';
  const hasJob = Boolean(lead.jobId);

  if (isConverted || hasJob) {
    return {
      canDelete: false,
      canArchive: true,
      deleteLabel: 'Delete (blocked)',
      archiveLabel: 'Archive',
      blockReason: isConverted
        ? 'Converted leads cannot be deleted. Archive instead.'
        : 'Lead is linked to a job. Archive instead.',
    };
  }

  return {
    canDelete: true,
    canArchive: true,
    deleteLabel: 'Delete',
    archiveLabel: 'Archive',
  };
}

export type JobDeleteBlockerInput = {
  status: import('./jobs.js').JobStatus;
  hasInvoice?: boolean;
  hasPayment?: boolean;
  hasDocuments?: boolean;
  hasExecution?: boolean;
};

/** Empty draft jobs only; otherwise cancel/archive. */
export function getJobDeleteEligibility(input: JobDeleteBlockerInput): DeleteEligibility {
  const hasBlockers =
    input.hasInvoice ||
    input.hasPayment ||
    input.hasDocuments ||
    input.hasExecution ||
    input.status !== 'new';

  if (hasBlockers) {
    return {
      canDelete: false,
      canArchive: true,
      deleteLabel: 'Delete (blocked)',
      archiveLabel: input.status === 'cancelled' ? 'Archived' : 'Cancel / Archive',
      blockReason:
        'Job has linked records or is not an empty draft. Cancel or archive instead of deleting.',
    };
  }

  return {
    canDelete: true,
    canArchive: true,
    deleteLabel: 'Delete permanently',
    archiveLabel: 'Cancel',
  };
}

export function getJobStatusTone(status: import('./jobs.js').JobStatus): StatusColorTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
      return 'info';
    case 'scheduled':
      return 'warning';
    case 'cancelled':
      return 'muted';
    default:
      return 'neutral';
  }
}

export const JOB_QUICK_STATUS_ACTIONS: Array<{
  id: string;
  label: string;
  targetStatus: import('./jobs.js').JobStatus;
}> = [
  { id: 'schedule', label: 'Scheduled', targetStatus: 'scheduled' },
  { id: 'progress', label: 'In progress', targetStatus: 'in_progress' },
  { id: 'complete', label: 'Complete', targetStatus: 'completed' },
  { id: 'cancel', label: 'Cancel', targetStatus: 'cancelled' },
];
