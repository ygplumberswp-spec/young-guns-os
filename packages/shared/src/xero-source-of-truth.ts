/**
 * Xero ↔ TITAN source-of-truth and conflict rules (XERO-002 P0 — section H).
 */

export type XeroFieldAuthority = 'xero' | 'titan' | 'derived_titan';

export type XeroConflictResolutionRule = {
  field: string;
  authority: XeroFieldAuthority;
  conflictRule: string;
  timestampRule: string;
  idempotencyRequired: boolean;
  manualResolutionPath: string;
};

/** Xero authoritative where synced. */
export const XERO_AUTHORITATIVE_FIELDS: readonly XeroConflictResolutionRule[] = [
  {
    field: 'xero_contact_id',
    authority: 'xero',
    conflictRule: 'Xero contact ID wins after confirmed link',
    timestampRule: 'Last successful Xero sync timestamp',
    idempotencyRequired: true,
    manualResolutionPath: 'Customer mapping review queue',
  },
  {
    field: 'official_quote_number',
    authority: 'xero',
    conflictRule: 'Xero quote number after push — TITAN draft ID never presented as official',
    timestampRule: 'Xero UpdatedDateUTC',
    idempotencyRequired: true,
    manualResolutionPath: 'Write approval queue',
  },
  {
    field: 'official_invoice_number',
    authority: 'xero',
    conflictRule: 'Xero invoice number after push',
    timestampRule: 'Xero UpdatedDateUTC',
    idempotencyRequired: true,
    manualResolutionPath: 'Write approval queue',
  },
  {
    field: 'invoice_status',
    authority: 'xero',
    conflictRule: 'Xero status on synced invoices',
    timestampRule: 'Xero UpdatedDateUTC',
    idempotencyRequired: true,
    manualResolutionPath: 'Manual status override with audit',
  },
  {
    field: 'payment_records',
    authority: 'xero',
    conflictRule: 'Xero payment rows are authoritative for accounting payment state',
    timestampRule: 'Xero payment date',
    idempotencyRequired: true,
    manualResolutionPath: 'Reconciliation workflow',
  },
  {
    field: 'bank_transactions',
    authority: 'xero',
    conflictRule: 'Imported Xero bank feed',
    timestampRule: 'Bank transaction date',
    idempotencyRequired: true,
    manualResolutionPath: 'Reconciliation workflow',
  },
];

/** TITAN authoritative operational fields. */
export const TITAN_AUTHORITATIVE_FIELDS: readonly XeroConflictResolutionRule[] = [
  {
    field: 'crm_operational_profile',
    authority: 'titan',
    conflictRule: 'TITAN CRM profile — Xero contact supplements identity only',
    timestampRule: 'TITAN updatedAt',
    idempotencyRequired: false,
    manualResolutionPath: 'CRM edit',
  },
  {
    field: 'jobs_and_technician_activity',
    authority: 'titan',
    conflictRule: 'Jobs, dispatch, field execution remain TITAN-owned',
    timestampRule: 'TITAN job updatedAt',
    idempotencyRequired: false,
    manualResolutionPath: 'Operations workflow',
  },
  {
    field: 'materials_and_labour_actuals',
    authority: 'titan',
    conflictRule: 'Actual materials/labour from job execution',
    timestampRule: 'Job completion timestamp',
    idempotencyRequired: false,
    manualResolutionPath: 'Job costing review',
  },
  {
    field: 'approval_workflow',
    authority: 'titan',
    conflictRule: 'Draft → Approve → Execute before any Xero write',
    timestampRule: 'Approval record timestamp',
    idempotencyRequired: true,
    manualResolutionPath: 'Write approval queue',
  },
];

/** Derived in TITAN — never overwrite Xero. */
export const TITAN_DERIVED_FIELDS: readonly XeroConflictResolutionRule[] = [
  {
    field: 'job_gross_profit',
    authority: 'derived_titan',
    conflictRule: 'Collected revenue ex-VAT minus direct costs',
    timestampRule: 'Calculation snapshot timestamp',
    idempotencyRequired: false,
    manualResolutionPath: 'Dashboard drill-down',
  },
  {
    field: 'operational_dashboard_metrics',
    authority: 'derived_titan',
    conflictRule: 'Labelled with source and freshness',
    timestampRule: 'Source lastUpdatedAt',
    idempotencyRequired: false,
    manualResolutionPath: 'Finance report',
  },
];

export const XERO_SOURCE_OF_TRUTH_RULES: readonly XeroConflictResolutionRule[] = [
  ...XERO_AUTHORITATIVE_FIELDS,
  ...TITAN_AUTHORITATIVE_FIELDS,
  ...TITAN_DERIVED_FIELDS,
];

/** Prevent circular update: Xero import must not trigger immediate push back. */
export function shouldBlockCircularXeroUpdate(input: {
  direction: 'import' | 'push';
  lastImportAt: string | null;
  lastPushAt: string | null;
  fieldAuthority: XeroFieldAuthority;
}): boolean {
  if (input.fieldAuthority !== 'xero') return false;
  if (input.direction !== 'push') return false;
  if (!input.lastImportAt || !input.lastPushAt) return false;
  return Date.parse(input.lastPushAt) <= Date.parse(input.lastImportAt);
}
