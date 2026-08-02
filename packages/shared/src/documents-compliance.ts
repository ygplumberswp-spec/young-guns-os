/** Phase 11 — daily compliance workspace queues (real tenant data only). */

export type ComplianceWorkspaceQueue =
  | 'missing_coc'
  | 'missing_signature'
  | 'missing_photos'
  | 'missing_slips'
  | 'missing_quote_invoice_link'
  | 'coc_awaiting_completion'
  | 'coc_issued'
  | 'correction_required'
  | 'expiring_certificates'
  | 'vehicle_documents'
  | 'equipment_documents';

export const COMPLIANCE_WORKSPACE_QUEUE_OPTIONS: Array<{
  value: ComplianceWorkspaceQueue;
  label: string;
}> = [
  { value: 'missing_coc', label: 'Missing COC' },
  { value: 'missing_signature', label: 'Missing signature' },
  { value: 'missing_photos', label: 'Missing photos' },
  { value: 'missing_slips', label: 'Missing slips' },
  { value: 'missing_quote_invoice_link', label: 'Missing quote/invoice link' },
  { value: 'coc_awaiting_completion', label: 'COC awaiting completion' },
  { value: 'coc_issued', label: 'Issued' },
  { value: 'correction_required', label: 'Correction required' },
  { value: 'expiring_certificates', label: 'Expiring certificates' },
  { value: 'vehicle_documents', label: 'Vehicle documents' },
  { value: 'equipment_documents', label: 'Equipment documents' },
];

/** Guidance sections for authorised-plumber COC capture — UI checklist only; not legal issuance. */
export const COC_FORM_FIELD_SECTIONS: Array<{
  key: string;
  label: string;
  description: string;
}> = [
  {
    key: 'plumber_details',
    label: 'Plumber details',
    description: 'Licensed installer name, company, and contact — captured on the issued COC.',
  },
  {
    key: 'registration_number',
    label: 'Registration number',
    description: 'PIRB / registered plumber licence number as printed on the certificate.',
  },
  {
    key: 'installation_details',
    label: 'Installation details',
    description: 'Scope of work, appliance type, location, and serial numbers where applicable.',
  },
  {
    key: 'sans_checks',
    label: 'SANS checks',
    description: 'Applicable SANS code checklist items verified on site (gas/electrical as relevant).',
  },
  {
    key: 'temperatures',
    label: 'Temperatures',
    description: 'Geyser / thermal safety readings where SANS 60335-2-21 applies.',
  },
  {
    key: 'isolator',
    label: 'Isolator',
    description: 'Electrical isolation and lock-out confirmation for live work.',
  },
  {
    key: 'lagging',
    label: 'Lagging',
    description: 'Pipe insulation and thermal lagging compliance.',
  },
  {
    key: 'bonding',
    label: 'Bonding',
    description: 'Equipotential bonding and earth continuity where required.',
  },
  {
    key: 'overflow_discharge',
    label: 'Overflow / discharge',
    description: 'Safe discharge, drip tray, and overflow routing.',
  },
  {
    key: 'signature',
    label: 'Signature',
    description: 'Authorised plumber and customer signatures on the final certificate.',
  },
  {
    key: 'correction_workflow',
    label: 'Correction workflow',
    description: 'Record defects, re-inspection, and corrected certificate re-issue.',
  },
  {
    key: 'final_pdf',
    label: 'Final PDF',
    description: 'Upload the signed COC PDF to the job document pack when received.',
  },
];

export type ComplianceWorkspaceEntityLinks = {
  jobId: string | null;
  jobNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  documentId: string | null;
  documentTitle: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  assetId: string | null;
  assetName: string | null;
  staffUserId: string | null;
  staffName: string | null;
};

export type ComplianceWorkspaceItem = {
  id: string;
  queues: ComplianceWorkspaceQueue[];
  title: string;
  detail: string | null;
  statusLabel: string;
  occurredAt: string;
  sourceType: 'job' | 'document' | 'certification' | 'vehicle' | 'asset';
  sourceId: string;
  entities: ComplianceWorkspaceEntityLinks;
};

export type ComplianceWorkspaceQueueSummary = {
  queue: ComplianceWorkspaceQueue;
  label: string;
  count: number;
};

export type ComplianceWorkspaceResponse = {
  summary: string;
  disclaimer: string;
  queueSummaries: ComplianceWorkspaceQueueSummary[];
  items: ComplianceWorkspaceItem[];
  documentAuditRecentCount: number;
};

export function isCocLikeDocument(title: string, fileName: string): boolean {
  const haystack = `${title} ${fileName}`.toLowerCase();
  return (
    haystack.includes('coc') ||
    haystack.includes('certificate of compliance') ||
    (haystack.includes('certificate') && haystack.includes('compliance'))
  );
}

export function jobTypeSuggestsCocRequired(jobType: string | null | undefined): boolean {
  const normalized = (jobType ?? '').toLowerCase();
  return (
    normalized.includes('gas') ||
    normalized.includes('geyser') ||
    normalized.includes('lpg') ||
    normalized.includes('electrical') ||
    normalized.includes('db board') ||
    normalized.includes('coc')
  );
}
