/** Phase 1 polish — draft workspace types and Young Guns safe defaults. */

export const DRAFT_RECORD_TYPES = [
  'quote',
  'invoice',
  'job',
  'customer',
  'document',
  'marketing',
  'other',
] as const;

export type DraftRecordType = (typeof DRAFT_RECORD_TYPES)[number];

export const DRAFT_STATUSES = ['active', 'archived', 'published'] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export type DraftWorkspaceSummary = {
  id: string;
  companyId: string;
  userId: string;
  recordType: DraftRecordType;
  recordId: string | null;
  draftKey: string;
  title: string | null;
  customerLabel: string | null;
  completionPct: number | null;
  status: DraftStatus;
  version: number;
  lastEditedAt: string;
  lastEditedByUserId: string | null;
  lastEditedByName: string | null;
};

export type DraftWorkspaceDetail = DraftWorkspaceSummary & {
  payload: Record<string, unknown>;
  payloadHistory: Array<{ version: number; savedAt: string; savedByUserId: string | null }>;
};

export type UpsertDraftRequest = {
  recordType: DraftRecordType;
  recordId?: string | null;
  draftKey?: string;
  title?: string | null;
  customerLabel?: string | null;
  completionPct?: number | null;
  payload: Record<string, unknown>;
};

export type DuplicateDraftRequest = {
  title?: string | null;
};

/** Young Guns safe defaults — work without Owner configuration. */
export const DEFAULT_DRAFT_AUTOSAVE_MS = 30_000;
export const DEFAULT_DRAFT_DEBOUNCE_MS = 1_500;
export const DEFAULT_DRAFT_RETENTION_DAYS = 90;
export const DEFAULT_NOTIFY_DEDUPE_MS = 3_000;
export const DEFAULT_RECENT_ITEMS_CAP = 20;

export type DraftWorkspaceSettings = {
  autosaveIntervalMs: number;
  debounceMs: number;
  retentionDays: number;
};

export const DEFAULT_DRAFT_WORKSPACE_SETTINGS: DraftWorkspaceSettings = {
  autosaveIntervalMs: DEFAULT_DRAFT_AUTOSAVE_MS,
  debounceMs: DEFAULT_DRAFT_DEBOUNCE_MS,
  retentionDays: DEFAULT_DRAFT_RETENTION_DAYS,
};

/** Idempotent draft key per user + type + record (new records use `new`). */
export function buildDraftKey(input: {
  userId: string;
  recordType: DraftRecordType;
  recordId?: string | null;
}): string {
  const recordPart = input.recordId?.trim() || 'new';
  return `${input.userId}:${input.recordType}:${recordPart}`;
}

export function draftRecordTypeLabel(type: DraftRecordType): string {
  const labels: Record<DraftRecordType, string> = {
    quote: 'Quotes',
    invoice: 'Invoices',
    job: 'Jobs',
    customer: 'Customers',
    document: 'Documents',
    marketing: 'Marketing',
    other: 'Other',
  };
  return labels[type];
}

export function draftContinueHref(draft: Pick<DraftWorkspaceSummary, 'recordType' | 'recordId' | 'id'>): string {
  switch (draft.recordType) {
    case 'quote':
      return draft.recordId ? `/finance/quotes/${draft.recordId}/edit` : `/finance/quotes/new?draftId=${draft.id}`;
    case 'invoice':
      return draft.recordId
        ? `/finance/invoices/${draft.recordId}`
        : `/finance/invoices/new?draftId=${draft.id}`;
    case 'job':
      return draft.recordId ? `/jobs/${draft.recordId}` : `/jobs/new?draftId=${draft.id}`;
    case 'customer':
      return draft.recordId ? `/crm/${draft.recordId}` : `/crm/new?draftId=${draft.id}`;
    case 'document':
      return draft.recordId ? `/documents/${draft.recordId}` : `/documents/new?draftId=${draft.id}`;
    default:
      return `/drafts`;
  }
}

export function permissionsForDraftType(recordType: DraftRecordType): string[] {
  switch (recordType) {
    case 'quote':
    case 'invoice':
      return ['finance:read', 'finance:write'];
    case 'job':
      return ['jobs:read', 'jobs:write'];
    case 'customer':
      return ['customers:read', 'customers:write'];
    case 'document':
      return ['documents:read', 'documents:write'];
    case 'marketing':
      return ['marketing:read', 'marketing:write'];
    default:
      return ['*'];
  }
}
