/** ASV-001 / Phase 1 — draft workspace types and Young Guns safe defaults. */

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

/** Marker stored in `other` payloads for purchase-order drafts (no enum migration). */
export const PURCHASE_ORDER_DRAFT_KIND = 'purchase_order';

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

export function isPurchaseOrderDraft(
  draft: Pick<DraftWorkspaceSummary, 'recordType' | 'title'> & {
    payload?: Record<string, unknown>;
  },
): boolean {
  if (draft.recordType !== 'other') return false;
  if (draft.payload?.draftKind === PURCHASE_ORDER_DRAFT_KIND) return true;
  return Boolean(draft.title?.startsWith('PO draft:'));
}

export function draftContinueHref(
  draft: Pick<DraftWorkspaceSummary, 'recordType' | 'recordId' | 'id' | 'title'> & {
    payload?: Record<string, unknown>;
  },
): string {
  switch (draft.recordType) {
    case 'quote':
      return draft.recordId
        ? `/finance/quotes/${draft.recordId}/edit`
        : `/finance/quotes/new?draftId=${draft.id}`;
    case 'invoice':
      return draft.recordId
        ? `/finance/invoices/${draft.recordId}`
        : `/finance/invoices/new?draftId=${draft.id}`;
    case 'job':
      return draft.recordId ? `/jobs/${draft.recordId}` : `/jobs/new?draftId=${draft.id}`;
    case 'customer':
      return draft.recordId ? `/crm/${draft.recordId}?draftId=${draft.id}` : `/crm/new?draftId=${draft.id}`;
    case 'document':
      return draft.recordId
        ? `/documents/${draft.recordId}?draftId=${draft.id}`
        : `/documents/new?draftId=${draft.id}`;
    case 'marketing':
      return `/marketing-intelligence?tab=reactivation&draftId=${draft.id}`;
    case 'other':
      if (isPurchaseOrderDraft(draft)) {
        return draft.recordId
          ? `/procurement/purchase-orders/${draft.recordId}`
          : `/procurement/purchase-orders/new?draftId=${draft.id}`;
      }
      return `/drafts`;
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
    case 'other':
      // Purchase-order drafts use `other` until a dedicated enum value is migrated.
      return ['procurement:read', 'procurement:write', '*'];
    default:
      return ['*'];
  }
}

const SENSITIVE_DRAFT_KEY_PATTERN =
  /(secret|password|token|api[_-]?key|refresh[_-]?token|access[_-]?token|client[_-]?secret|authorization|bearer|credential|private[_-]?key|xero.*secret|smtp.*pass)/i;

/** Strip finance/provider secrets and binary blobs before persisting browser/API drafts. */
export function sanitizeDraftPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_DRAFT_KEY_PATTERN.test(key)) continue;
    if (key === 'fileBytes' || key === 'fileBase64' || key === 'binaryContent' || key === 'contentBase64') {
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeDraftPayload(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    if (value && typeof value === 'object') {
      next[key] = sanitizeDraftPayload(value as Record<string, unknown>);
      continue;
    }
    next[key] = value;
  }
  return next;
}

/**
 * Customer draft restore must not silently overwrite verified contact channels.
 * Returns which draft fields are safe to apply.
 */
export function selectSafeCustomerDraftRestore(input: {
  draft: { name?: unknown; email?: unknown; phone?: unknown; status?: unknown; notes?: unknown };
  current: { name: string; email: string | null; phone: string | null; status: string; notes: string | null };
  verifiedEmail?: boolean;
  verifiedPhone?: boolean;
}): {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
  skippedVerified: string[];
} {
  const skippedVerified: string[] = [];
  const out: {
    name?: string;
    email?: string;
    phone?: string;
    status?: string;
    notes?: string;
    skippedVerified: string[];
  } = { skippedVerified };

  if (typeof input.draft.name === 'string') out.name = input.draft.name;
  if (typeof input.draft.status === 'string') out.status = input.draft.status;
  if (typeof input.draft.notes === 'string') out.notes = input.draft.notes;

  if (typeof input.draft.email === 'string') {
    if (input.verifiedEmail && input.draft.email !== (input.current.email ?? '')) {
      skippedVerified.push('email');
    } else {
      out.email = input.draft.email;
    }
  }

  if (typeof input.draft.phone === 'string') {
    if (input.verifiedPhone && input.draft.phone !== (input.current.phone ?? '')) {
      skippedVerified.push('phone');
    } else {
      out.phone = input.draft.phone;
    }
  }

  return out;
}
