/**
 * Compliance Intelligence (Department 14)
 *
 * Extends Document Intelligence (COC/certificates/expiry), Legal & Compliance,
 * documents, properties, jobs, and equipment with SANS support, COC workflows,
 * compliance checks, expiry tracking, and audit preparation.
 *
 * Invariants:
 * - No fake compliance records or certifications
 * - No automatic certification decisions
 * - AURA compliance risks / missing docs / expiry alerts are drafts only (Owner approval)
 * - Extends existing foundations — does not rebuild Legal Compliance or Documents CRUD
 * - Preserve RBAC, tenant isolation, approval workflows, audit logs
 */

export const COMPLIANCE_INTELLIGENCE_KEY = 'compliance-intelligence' as const;

export type CmiAvailability = 'available' | 'unavailable';

export type CmiSansStatus = 'tracked' | 'retired' | 'reference_only';

export type CmiCocWorkflowStatus =
  | 'intake'
  | 'documents_gathering'
  | 'inspection_pending'
  | 'review'
  | 'ready_for_issue'
  | 'issued'
  | 'expired'
  | 'cancelled';

/** Explicitly never auto-certified — issue requires Owner decision on a real workflow. */
export type CmiCheckResult = 'pass' | 'fail' | 'incomplete' | 'not_applicable' | 'unavailable';

export type CmiCheckKind =
  | 'coc_present'
  | 'coc_unexpired'
  | 'sans_linked'
  | 'property_docs'
  | 'job_docs'
  | 'equipment_warranty'
  | 'insurance_present'
  | 'audit_pack_ready';

export type CmiExpirySource =
  | 'di_document_profile'
  | 'lc_compliance_record'
  | 'lc_insurance_policy'
  | 'asset_warranty'
  | 'coc_workflow';

export type CmiExpiryStatus = 'open' | 'acknowledged' | 'dismissed' | 'resolved';

export type CmiAuditPackStatus = 'draft' | 'ready_for_review' | 'archived';

export type CmiRecommendationKind = 'compliance_risk' | 'missing_doc' | 'expiry_alert';

export type CmiRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type CmiAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'documents'
  | 'document_intelligence'
  | 'legal_compliance'
  | 'properties'
  | 'jobs'
  | 'equipment'
  | 'operations';

export type CmiAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type CmiSansStandardSummary = {
  id: string;
  code: string;
  title: string;
  status: CmiSansStatus;
  notes: string | null;
  linkedWorkflowCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CmiCocWorkflowSummary = {
  id: string;
  title: string;
  status: CmiCocWorkflowStatus;
  /** Always false — never automatic certification. */
  autoCertified: false;
  documentId: string | null;
  documentTitle: string | null;
  jobId: string | null;
  jobTitle: string | null;
  propertyId: string | null;
  propertyName: string | null;
  customerId: string | null;
  customerName: string | null;
  sansStandardId: string | null;
  sansCode: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CmiComplianceCheckSummary = {
  id: string;
  kind: CmiCheckKind;
  result: CmiCheckResult;
  title: string;
  detail: string;
  documentId: string | null;
  jobId: string | null;
  propertyId: string | null;
  equipmentId: string | null;
  cocWorkflowId: string | null;
  /** Always false — checks never certify. */
  certificationDecision: false;
  createdAt: string;
};

export type CmiExpiryItemSummary = {
  id: string;
  source: CmiExpirySource;
  status: CmiExpiryStatus;
  title: string;
  expiresAt: string;
  daysUntilExpiry: number | null;
  documentId: string | null;
  cocWorkflowId: string | null;
  equipmentId: string | null;
  note: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type CmiAuditPrepPackSummary = {
  id: string;
  title: string;
  status: CmiAuditPackStatus;
  scopeNote: string;
  documentCount: number;
  checkCount: number;
  gapCount: number;
  readiness: CmiAvailability;
  readinessRationale: string;
  createdAt: string;
  updatedAt: string;
};

export type CmiRecommendationDraftSummary = {
  id: string;
  kind: CmiRecommendationKind;
  status: CmiRecommendationStatus;
  title: string;
  body: string;
  documentId: string | null;
  jobId: string | null;
  propertyId: string | null;
  equipmentId: string | null;
  cocWorkflowId: string | null;
  /** Invariant: always false — never auto-execute / auto-certify. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CmiAuraInsightSummary = {
  id: string;
  target: CmiAuraInsightTarget;
  status: CmiAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceRecommendationId: string | null;
  createdAt: string;
};

export type CmiAuraConnection = {
  target: CmiAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type CmiSettings = {
  id: string;
  /** Invariant: always false. */
  autoCertificationEnabled: false;
  /** Invariant: always false. */
  inventComplianceRecordsEnabled: false;
  /** Invariant: always false. */
  autoExecuteActionsEnabled: false;
  sansTrackingEnabled: boolean;
  cocWorkflowsEnabled: boolean;
  complianceChecksEnabled: boolean;
  expiryTrackingEnabled: boolean;
  auditPrepEnabled: boolean;
  reminderLeadDays: number;
  notes: string | null;
  updatedAt: string;
};

export type CmiSansSnapshot = {
  availability: CmiAvailability;
  trackedCount: number;
  rationale: string;
};

export type CmiCocSnapshot = {
  availability: CmiAvailability;
  openWorkflowCount: number;
  issuedCount: number;
  expiredCount: number;
  rationale: string;
};

export type CmiChecksSnapshot = {
  availability: CmiAvailability;
  passCount: number;
  failCount: number;
  incompleteCount: number;
  rationale: string;
};

export type CmiExpirySnapshot = {
  availability: CmiAvailability;
  openCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  rationale: string;
};

export type CmiAuditSnapshot = {
  availability: CmiAvailability;
  packCount: number;
  readyCount: number;
  rationale: string;
};

export type CmiDashboard = {
  summary: string;
  productClarification: {
    legalComplianceOps: string;
    documentIntelligenceOps: string;
    thisLayer: string;
  };
  policy: {
    autoCertificationEnabled: false;
    inventComplianceRecordsEnabled: false;
    autoExecuteActionsEnabled: false;
    requiresOwnerApproval: true;
    fakeComplianceRecords: false;
  };
  sans: CmiSansSnapshot;
  coc: CmiCocSnapshot;
  checks: CmiChecksSnapshot;
  expiry: CmiExpirySnapshot;
  audit: CmiAuditSnapshot;
  sansStandards: CmiSansStandardSummary[];
  cocWorkflows: CmiCocWorkflowSummary[];
  complianceChecks: CmiComplianceCheckSummary[];
  expiryItems: CmiExpiryItemSummary[];
  auditPacks: CmiAuditPrepPackSummary[];
  recommendationDrafts: CmiRecommendationDraftSummary[];
  auraInsights: CmiAuraInsightSummary[];
  auraConnections: CmiAuraConnection[];
  settings: CmiSettings;
  pendingApprovals: number;
};

export type UpsertCmiSansStandardRequest = {
  code: string;
  title: string;
  status?: CmiSansStatus;
  notes?: string | null;
};

export type UpsertCmiCocWorkflowRequest = {
  title: string;
  status?: CmiCocWorkflowStatus;
  documentId?: string | null;
  jobId?: string | null;
  propertyId?: string | null;
  customerId?: string | null;
  sansStandardId?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

export type UpdateCmiCocWorkflowStatusRequest = {
  status: CmiCocWorkflowStatus;
  notes?: string;
};

export type RunCmiChecksRequest = {
  jobId?: string;
  propertyId?: string;
  documentId?: string;
};

export type RefreshCmiRecommendationsRequest = {
  submitForApproval?: boolean;
  reminderLeadDays?: number;
};

export type DecideCmiRecommendationRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type AcknowledgeCmiExpiryRequest = {
  status: 'acknowledged' | 'dismissed' | 'resolved';
};

export type CreateCmiAuditPackRequest = {
  title: string;
  scopeNote?: string;
  documentIds?: string[];
};

export type UpdateCmiSettingsRequest = {
  sansTrackingEnabled?: boolean;
  cocWorkflowsEnabled?: boolean;
  complianceChecksEnabled?: boolean;
  expiryTrackingEnabled?: boolean;
  auditPrepEnabled?: boolean;
  reminderLeadDays?: number;
  notes?: string | null;
};

export type CreateCmiAuraInsightRequest = {
  target: CmiAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceRecommendationId?: string;
};

export type AcknowledgeCmiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessComplianceIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('legal_compliance:read') ||
    identity.permissions.includes('legal_compliance:write') ||
    identity.permissions.includes('legal_compliance:manage') ||
    identity.permissions.includes('documents:read') ||
    identity.permissions.includes('documents:write') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteComplianceIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessComplianceIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('legal_compliance:write') ||
    identity.permissions.includes('legal_compliance:manage') ||
    identity.permissions.includes('documents:write')
  );
}

export function canApproveComplianceIntelligenceDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteComplianceIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManageComplianceIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveComplianceIntelligenceDrafts(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const CMI_PRODUCT_COPY = {
  legalComplianceOps:
    'Legal & Compliance remains under /legal-compliance — contracts, frameworks, insurance, and obligations are not rebuilt here.',
  documentIntelligenceOps:
    'Document Intelligence (/document-intelligence) owns typed COC/certificate profiles and document expiry reminders — this layer extends them for compliance workflows.',
  thisLayer:
    'Compliance Intelligence adds SANS tracking, COC workflows, compliance checks, expiry tracking, audit preparation, and Owner-gated AURA drafts. Real records only. No automatic certification.',
} as const;

export const CMI_COC_WORKFLOW_LABELS: Record<CmiCocWorkflowStatus, string> = {
  intake: 'Intake',
  documents_gathering: 'Documents gathering',
  inspection_pending: 'Inspection pending',
  review: 'Review',
  ready_for_issue: 'Ready for issue (Owner decision)',
  issued: 'Issued (recorded — not auto-certified)',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const CMI_CHECK_KIND_LABELS: Record<CmiCheckKind, string> = {
  coc_present: 'COC present',
  coc_unexpired: 'COC unexpired',
  sans_linked: 'SANS linked',
  property_docs: 'Property documents',
  job_docs: 'Job documents',
  equipment_warranty: 'Equipment warranty',
  insurance_present: 'Insurance present',
  audit_pack_ready: 'Audit pack ready',
};

export const CMI_SANS_STATUSES: readonly CmiSansStatus[] = [
  'tracked',
  'retired',
  'reference_only',
] as const;

export const CMI_COC_WORKFLOW_STATUSES: readonly CmiCocWorkflowStatus[] = [
  'intake',
  'documents_gathering',
  'inspection_pending',
  'review',
  'ready_for_issue',
  'issued',
  'expired',
  'cancelled',
] as const;

export function isCmiCocWorkflowStatus(
  value: string | null | undefined,
): value is CmiCocWorkflowStatus {
  return Boolean(value && (CMI_COC_WORKFLOW_STATUSES as readonly string[]).includes(value));
}

export function buildCmiSansSnapshot(input: { trackedCount: number }): CmiSansSnapshot {
  if (input.trackedCount === 0) {
    return {
      availability: 'unavailable',
      trackedCount: 0,
      rationale:
        'No SANS standards tracked yet — SANS support unavailable (not invented). Add real standards the company tracks.',
    };
  }
  return {
    availability: 'available',
    trackedCount: input.trackedCount,
    rationale: `${input.trackedCount} SANS standard(s) tracked from company-entered records only.`,
  };
}

export function buildCmiCocSnapshot(input: {
  openWorkflowCount: number;
  issuedCount: number;
  expiredCount: number;
  totalCount: number;
}): CmiCocSnapshot {
  if (input.totalCount === 0) {
    return {
      availability: 'unavailable',
      openWorkflowCount: 0,
      issuedCount: 0,
      expiredCount: 0,
      rationale:
        'No COC workflows yet — COC workflow intelligence unavailable (not invented). Link real documents/jobs/properties when creating workflows.',
    };
  }
  return {
    availability: 'available',
    openWorkflowCount: input.openWorkflowCount,
    issuedCount: input.issuedCount,
    expiredCount: input.expiredCount,
    rationale: `${input.openWorkflowCount} open; ${input.issuedCount} issued (recorded, never auto-certified); ${input.expiredCount} expired — from real workflow rows only.`,
  };
}

export function buildCmiChecksSnapshot(input: {
  passCount: number;
  failCount: number;
  incompleteCount: number;
  totalCount: number;
}): CmiChecksSnapshot {
  if (input.totalCount === 0) {
    return {
      availability: 'unavailable',
      passCount: 0,
      failCount: 0,
      incompleteCount: 0,
      rationale:
        'No compliance checks run yet — check intelligence unavailable until run against real documents/workflows (never invents pass/fail).',
    };
  }
  return {
    availability: 'available',
    passCount: input.passCount,
    failCount: input.failCount,
    incompleteCount: input.incompleteCount,
    rationale: `${input.passCount} pass / ${input.failCount} fail / ${input.incompleteCount} incomplete — informational only; never an automatic certification decision.`,
  };
}

export function buildCmiExpirySnapshot(input: {
  openCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  sourceCount: number;
}): CmiExpirySnapshot {
  if (input.sourceCount === 0 && input.openCount === 0) {
    return {
      availability: 'unavailable',
      openCount: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      rationale:
        'No compliance-relevant expiry dates found on real DI profiles, COC workflows, LC records, insurance, or equipment warranties — not invented.',
    };
  }
  return {
    availability: 'available',
    openCount: input.openCount,
    expiringSoonCount: input.expiringSoonCount,
    expiredCount: input.expiredCount,
    rationale: `${input.openCount} open expiry item(s); ${input.expiringSoonCount} expiring soon; ${input.expiredCount} expired — from real source dates only.`,
  };
}

export function buildCmiAuditSnapshot(input: {
  packCount: number;
  readyCount: number;
}): CmiAuditSnapshot {
  if (input.packCount === 0) {
    return {
      availability: 'unavailable',
      packCount: 0,
      readyCount: 0,
      rationale:
        'No audit preparation packs yet — create a pack from real documents/checks only (never invents evidence).',
    };
  }
  return {
    availability: 'available',
    packCount: input.packCount,
    readyCount: input.readyCount,
    rationale: `${input.packCount} pack(s); ${input.readyCount} ready for review — assembled from real document IDs and check results only.`,
  };
}

export function buildCmiComplianceRiskDraft(input: {
  title: string;
  detail: string;
  checkKind?: CmiCheckKind;
}): { kind: CmiRecommendationKind; title: string; body: string } {
  return {
    kind: 'compliance_risk',
    title: `Compliance risk — ${input.title}`.slice(0, 200),
    body: [
      input.detail,
      input.checkKind ? `Check kind: ${CMI_CHECK_KIND_LABELS[input.checkKind]}.` : null,
      '',
      'Draft only from real compliance checks / missing evidence. Not invented.',
      'Owner approval required. Does not auto-certify, auto-issue COCs, or mutate legal records.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildCmiMissingDocDraft(input: {
  missingLabel: string;
  scope?: string | null;
}): { kind: CmiRecommendationKind; title: string; body: string } {
  const scope = input.scope?.trim() || null;
  return {
    kind: 'missing_doc',
    title: `Missing ${input.missingLabel}${scope ? ` — ${scope}` : ''}`.slice(0, 200),
    body: [
      `Suggestion: no real ${input.missingLabel} evidence is linked${scope ? ` for ${scope}` : ''}.`,
      '',
      'Draft only — based on real jobs/properties/documents. Does not invent documents.',
      'Owner approval required. Never auto-creates files or certifications.',
    ].join('\n'),
  };
}

export function buildCmiExpiryAlertDraft(input: {
  title: string;
  expiresAt: string;
  daysUntilExpiry: number;
  source: CmiExpirySource;
}): { kind: CmiRecommendationKind; title: string; body: string } {
  const urgency =
    input.daysUntilExpiry < 0
      ? `expired ${Math.abs(input.daysUntilExpiry)} day(s) ago`
      : `expires in ${input.daysUntilExpiry} day(s)`;
  return {
    kind: 'expiry_alert',
    title: `Expiry alert — ${input.title}`.slice(0, 200),
    body: [
      `“${input.title}” ${urgency} (${input.expiresAt}). Source: ${input.source}.`,
      '',
      'Draft only from a real expiry date. Not invented.',
      'Owner approval required. Does not auto-renew, auto-certify, or auto-send notices.',
    ].join('\n'),
  };
}

export function listCmiAuraConnections(): CmiAuraConnection[] {
  return [
    {
      target: 'document_intelligence',
      label: 'Document Intelligence',
      href: '/document-intelligence',
      status: 'available_link',
      note: 'COC/certificate profiles and document expiry foundations.',
    },
    {
      target: 'documents',
      label: 'Documents',
      href: '/documents',
      status: 'available_link',
      note: 'Operational document register and uploads.',
    },
    {
      target: 'legal_compliance',
      label: 'Legal & Compliance',
      href: '/legal-compliance',
      status: 'available_link',
      note: 'Frameworks, insurance, obligations, and compliance records.',
    },
    {
      target: 'properties',
      label: 'Properties',
      href: '/customer-experience',
      status: 'available_link',
      note: 'Property links via cx_customer_properties when present.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Job FK links for COC workflows and checks.',
    },
    {
      target: 'equipment',
      label: 'Equipment',
      href: '/assets',
      status: 'available_link',
      note: 'Asset/equipment warranty expiry signals when present.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Insight handoffs for Owner review.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive dashboard',
      href: '/',
      status: 'registry_stub',
      note: 'Executive surface link; compliance insights stay draft until acknowledged.',
    },
    {
      target: 'operations',
      label: 'Operations',
      href: '/dispatch-intelligence',
      status: 'registry_stub',
      note: 'Ops handoff stub — no invented operational impact.',
    },
  ];
}

export function defaultCmiSettings(partial?: {
  id?: string;
  sansTrackingEnabled?: boolean;
  cocWorkflowsEnabled?: boolean;
  complianceChecksEnabled?: boolean;
  expiryTrackingEnabled?: boolean;
  auditPrepEnabled?: boolean;
  reminderLeadDays?: number;
  notes?: string | null;
  updatedAt?: string;
}): CmiSettings {
  return {
    id: partial?.id ?? 'pending',
    autoCertificationEnabled: false,
    inventComplianceRecordsEnabled: false,
    autoExecuteActionsEnabled: false,
    sansTrackingEnabled: partial?.sansTrackingEnabled ?? true,
    cocWorkflowsEnabled: partial?.cocWorkflowsEnabled ?? true,
    complianceChecksEnabled: partial?.complianceChecksEnabled ?? true,
    expiryTrackingEnabled: partial?.expiryTrackingEnabled ?? true,
    auditPrepEnabled: partial?.auditPrepEnabled ?? true,
    reminderLeadDays: partial?.reminderLeadDays ?? 30,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function cmiDaysUntil(isoDate: string, now = new Date()): number {
  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target)) return 0;
  const ms = target - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isOpenCocWorkflowStatus(status: CmiCocWorkflowStatus): boolean {
  return !['issued', 'expired', 'cancelled'].includes(status);
}
