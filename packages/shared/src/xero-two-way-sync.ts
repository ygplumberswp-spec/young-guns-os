function stableHashHex(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Entity types participating in Xero ↔ TITAN two-way sync. */
export type XeroTwoWayEntityType =
  | 'contact'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'bank_transaction'
  | 'credit_note'
  | 'supplier_bill';

export type XeroSyncDirection = 'read' | 'write';

export type XeroWriteOperation =
  | 'contact_update'
  | 'quote_create'
  | 'invoice_create'
  | 'invoice_void'
  | 'credit_note_create'
  | 'payment_create';

export type XeroWriteApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';

export type XeroMappingConflictKind =
  | 'official_number_mismatch'
  | 'amount_mismatch'
  | 'status_mismatch'
  | 'reference_mismatch'
  | 'remote_deleted'
  | 'local_modified';

export type XeroMappingConflictMetadata = {
  kind: XeroMappingConflictKind;
  detectedAt: string;
  localSnapshot: Record<string, unknown>;
  remoteSnapshot: Record<string, unknown>;
  message: string;
  resolutionRequired: boolean;
};

/** Planned import stages — not active until post-GO migration + verify. */
export const XERO_PLANNED_IMPORT_STAGES = ['credit_notes', 'supplier_bills'] as const;
export type XeroPlannedImportStage = (typeof XERO_PLANNED_IMPORT_STAGES)[number];

export type XeroTwoWayEntityMatrixRow = {
  entity: XeroTwoWayEntityType;
  xeroToTitan: 'auto' | 'partial' | 'stub' | 'none';
  titanToXero: 'approval_gated' | 'partial' | 'stub' | 'none';
  preserveIds: boolean;
  officialNumberFromXero: boolean;
  notes: string;
};

export const XERO_TWO_WAY_ENTITY_MATRIX: XeroTwoWayEntityMatrixRow[] = [
  {
    entity: 'contact',
    xeroToTitan: 'auto',
    titanToXero: 'approval_gated',
    preserveIds: true,
    officialNumberFromXero: false,
    notes: 'Import all contacts; CV classifier filters qualifying sales activity for totals.',
  },
  {
    entity: 'invoice',
    xeroToTitan: 'auto',
    titanToXero: 'approval_gated',
    preserveIds: true,
    officialNumberFromXero: true,
    notes: 'Xero assigns ACCREC number; TITAN stores xeroInvoiceId + official number + job ref.',
  },
  {
    entity: 'payment',
    xeroToTitan: 'auto',
    titanToXero: 'approval_gated',
    preserveIds: true,
    officialNumberFromXero: false,
    notes: 'Read-sync default; TITAN→Xero payment_create only via Owner-approved write queue.',
  },
  {
    entity: 'bank_transaction',
    xeroToTitan: 'auto',
    titanToXero: 'none',
    preserveIds: true,
    officialNumberFromXero: false,
    notes: 'Audit log + sync log mirror; no TITAN entity yet.',
  },
  {
    entity: 'quote',
    xeroToTitan: 'partial',
    titanToXero: 'approval_gated',
    preserveIds: true,
    officialNumberFromXero: false,
    notes: 'Push on approval; pull not in background import pipeline.',
  },
  {
    entity: 'credit_note',
    xeroToTitan: 'stub',
    titanToXero: 'approval_gated',
    preserveIds: true,
    officialNumberFromXero: true,
    notes: 'Scaffold only — import stage queued post-verify.',
  },
  {
    entity: 'supplier_bill',
    xeroToTitan: 'stub',
    titanToXero: 'none',
    preserveIds: true,
    officialNumberFromXero: true,
    notes: 'Scaffold only — procurement chain deferred.',
  },
];

export function buildXeroWriteIdempotencyKey(input: {
  companyId: string;
  operation: XeroWriteOperation;
  entityId: string;
  payloadVersion?: string;
}): string {
  return stableHashHex(
    `${input.companyId}:${input.operation}:${input.entityId}:${input.payloadVersion ?? 'v1'}`,
  ).slice(0, 32);
}

export function detectXeroMappingConflict(input: {
  entityType: 'invoice' | 'contact' | 'payment';
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
}): XeroMappingConflictMetadata | null {
  if (input.entityType === 'invoice') {
    const localNumber = String(input.local.invoiceNumber ?? '').trim();
    const remoteNumber = String(input.remote.invoiceNumber ?? '').trim();
    if (localNumber && remoteNumber && localNumber !== remoteNumber) {
      return {
        kind: 'official_number_mismatch',
        detectedAt: new Date().toISOString(),
        localSnapshot: { invoiceNumber: localNumber },
        remoteSnapshot: { invoiceNumber: remoteNumber },
        message: `Official invoice number conflict: TITAN ${localNumber} vs Xero ${remoteNumber}`,
        resolutionRequired: true,
      };
    }

    const localCents = Number(input.local.amountCents ?? 0);
    const remoteCents = Number(input.remote.amountCents ?? 0);
    if (localCents > 0 && remoteCents > 0 && localCents !== remoteCents) {
      return {
        kind: 'amount_mismatch',
        detectedAt: new Date().toISOString(),
        localSnapshot: { amountCents: localCents },
        remoteSnapshot: { amountCents: remoteCents },
        message: 'Invoice amount differs between TITAN and Xero',
        resolutionRequired: true,
      };
    }
  }

  return null;
}

/** Xero is authoritative — never use TITAN-generated placeholder as official number on write-back. */
export function resolveOfficialXeroInvoiceNumber(input: {
  xeroAssignedNumber: string | null | undefined;
  xeroInvoiceId: string;
}): string | null {
  const trimmed = input.xeroAssignedNumber?.trim();
  if (trimmed) {
    return trimmed;
  }
  return null;
}

export type XeroTwoWayReadinessPhase =
  | 'import_running'
  | 'scaffold_only'
  | 'read_verify_queued'
  | 'read_verify_complete'
  | 'write_staging_blocked';

export type XeroTwoWayReadinessSummary = {
  phase: XeroTwoWayReadinessPhase;
  readPathPercent: number;
  writePathPercent: number;
  importJobId: string | null;
  importStatus: string | null;
  lastSyncAt: string | null;
  twoWayGo: boolean;
  ownerApprovalRequiredFor: string[];
};

export function estimateXeroTwoWayCompletion(): {
  readPathPercent: number;
  writePathPercent: number;
} {
  const readImplemented = XERO_TWO_WAY_ENTITY_MATRIX.filter(
    (row) => row.xeroToTitan === 'auto' || row.xeroToTitan === 'partial',
  ).length;
  const readTotal = XERO_TWO_WAY_ENTITY_MATRIX.length;
  const writeImplemented = XERO_TWO_WAY_ENTITY_MATRIX.filter(
    (row) => row.titanToXero === 'approval_gated' || row.titanToXero === 'partial',
  ).length;
  const writeScaffolded = XERO_TWO_WAY_ENTITY_MATRIX.filter(
    (row) => row.titanToXero !== 'none',
  ).length;

  return {
    readPathPercent: Math.round((readImplemented / readTotal) * 100),
    // Queue + gated execute paths are productized; live org write still Owner-gated.
    writePathPercent: Math.round((writeImplemented / writeScaffolded) * 70),
  };
}

/** Queue row returned by write-approval APIs (Draft → Approve → Execute). */
export type XeroWriteApprovalQueueItem = {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  writeOperation: XeroWriteOperation;
  status: XeroWriteApprovalStatus;
  idempotencyKey: string;
  actionType: XeroWriteOperation;
  targetLabel: string;
  amountCents: number | null;
  currency: string | null;
  requesterUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  metadata: Record<string, unknown>;
};

export type XeroWriteConflictResolution = 'keep_local' | 'accept_remote' | 'dismiss';

export function summarizeXeroWriteApprovalMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  targetLabel: string;
  amountCents: number | null;
  currency: string | null;
  requesterUserId: string | null;
} {
  const meta = metadata ?? {};
  return {
    targetLabel: String(meta.targetLabel ?? meta.invoiceNumber ?? meta.customerName ?? '—'),
    amountCents:
      typeof meta.amountCents === 'number' && Number.isFinite(meta.amountCents)
        ? meta.amountCents
        : null,
    currency: typeof meta.currency === 'string' ? meta.currency : null,
    requesterUserId: typeof meta.requesterUserId === 'string' ? meta.requesterUserId : null,
  };
}
