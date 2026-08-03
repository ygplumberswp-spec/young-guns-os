/**
 * Document Intelligence (Department 13)
 *
 * Extends the existing documents foundation (`documents` / categories / job packs)
 * with typed profiles (COC, quotes, invoices, reports, warranties, certificates, photos),
 * search, version history, expiry reminders, and AURA recommendation drafts.
 *
 * Invariants:
 * - Real documents only — never invents document records or file contents
 * - Extends existing documents system — does not rebuild CRUD under `/documents`
 * - Links to customers / jobs / cx_customer_properties only when real FKs exist
 * - AURA expiry alerts + missing-doc suggestions are drafts only (Owner approval)
 * - Never auto-send reminders / never auto-mutate documents
 * - Preserve RBAC, tenant isolation, approval workflows, audit logs
 */

export const DOCUMENT_INTELLIGENCE_KEY = 'document-intelligence' as const;

export type DocIDocumentType =
  | 'coc'
  | 'quote'
  | 'invoice'
  | 'report'
  | 'warranty'
  | 'certificate'
  | 'photo'
  | 'other';

export const DOCI_DOCUMENT_TYPES: readonly DocIDocumentType[] = [
  'coc',
  'quote',
  'invoice',
  'report',
  'warranty',
  'certificate',
  'photo',
  'other',
] as const;

export type DocIAvailability = 'available' | 'unavailable';

export type DocIReminderStatus = 'open' | 'acknowledged' | 'dismissed' | 'resolved';

export type DocIRecommendationKind = 'expiry_alert' | 'missing_doc_suggestion';

export type DocIRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type DocIAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'documents'
  | 'customers'
  | 'jobs'
  | 'compliance'
  | 'operations';

export type DocIAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type DocIDocumentIntelligenceRow = {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string | null;
  documentType: DocIDocumentType;
  categoryId: string | null;
  categoryName: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  propertyId: string | null;
  propertyName: string | null;
  expiresAt: string | null;
  versionCount: number;
  currentVersionNumber: number;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocIVersionSummary = {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  fileName: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  changeNote: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type DocIExpiryReminderSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  documentType: DocIDocumentType | null;
  expiresAt: string;
  status: DocIReminderStatus;
  docIDaysUntilExpiry: number | null;
  note: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type DocIRecommendationDraftSummary = {
  id: string;
  kind: DocIRecommendationKind;
  status: DocIRecommendationStatus;
  title: string;
  body: string;
  documentId: string | null;
  customerId: string | null;
  jobId: string | null;
  propertyId: string | null;
  /** Invariant: always false — never auto-send / auto-mutate. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type DocIAuraInsightSummary = {
  id: string;
  target: DocIAuraInsightTarget;
  status: DocIAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceRecommendationId: string | null;
  createdAt: string;
};

export type DocIAuraConnection = {
  target: DocIAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type DocISettings = {
  id: string;
  /** Invariant: always false. */
  autoSendRemindersEnabled: false;
  /** Invariant: always false. */
  inventDocumentsEnabled: false;
  expiryRemindersEnabled: boolean;
  missingDocSuggestionsEnabled: boolean;
  reminderLeadDays: number;
  notes: string | null;
  updatedAt: string;
};

export type DocISearchSnapshot = {
  availability: DocIAvailability;
  resultCount: number;
  query: string | null;
  rationale: string;
};

export type DocIExpirySnapshot = {
  availability: DocIAvailability;
  openReminderCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  rationale: string;
};

export type DocIVersionSnapshot = {
  availability: DocIAvailability;
  versionedDocumentCount: number;
  totalVersionRows: number;
  rationale: string;
};

export type DocILinkSnapshot = {
  customerLinkedCount: number;
  jobLinkedCount: number;
  propertyLinkedCount: number;
  unlinkedCount: number;
  propertyLinksAvailable: true;
  rationale: string;
};

export type DocIDashboard = {
  summary: string;
  productClarification: {
    documentsOps: string;
    thisLayer: string;
  };
  policy: {
    autoSendRemindersEnabled: false;
    inventDocumentsEnabled: false;
    requiresOwnerApproval: true;
    fakeDocuments: false;
  };
  search: DocISearchSnapshot;
  expiry: DocIExpirySnapshot;
  versions: DocIVersionSnapshot;
  links: DocILinkSnapshot;
  documents: DocIDocumentIntelligenceRow[];
  reminders: DocIExpiryReminderSummary[];
  recommendationDrafts: DocIRecommendationDraftSummary[];
  auraInsights: DocIAuraInsightSummary[];
  auraConnections: DocIAuraConnection[];
  settings: DocISettings;
  pendingApprovals: number;
  totalDocuments: number;
  typedDocumentCount: number;
};

export type DocISearchRequest = {
  query?: string;
  documentType?: DocIDocumentType;
  customerId?: string;
  jobId?: string;
  propertyId?: string;
  expiringWithinDays?: number;
  limit?: number;
};

export type UpsertDiDocumentProfileRequest = {
  documentId: string;
  documentType?: DocIDocumentType;
  propertyId?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

export type CreateDiVersionRequest = {
  documentId: string;
  title?: string;
  fileName?: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  changeNote?: string | null;
};

export type RefreshDiRecommendationsRequest = {
  submitForApproval?: boolean;
  reminderLeadDays?: number;
};

export type DecideDiRecommendationRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type AcknowledgeDiReminderRequest = {
  status: 'acknowledged' | 'dismissed' | 'resolved';
};

export type UpdateDiSettingsRequest = {
  expiryRemindersEnabled?: boolean;
  missingDocSuggestionsEnabled?: boolean;
  reminderLeadDays?: number;
  notes?: string | null;
};

export type CreateDiAuraInsightRequest = {
  target: DocIAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceRecommendationId?: string;
};

export type AcknowledgeDiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessDocumentIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('documents:read') ||
    identity.permissions.includes('documents:write') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteDocumentIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessDocumentIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return identity.permissions.includes('documents:write');
}

export function canApproveDocumentIntelligenceDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteDocumentIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManageDocumentIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveDocumentIntelligenceDrafts(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const DOCI_PRODUCT_COPY = {
  documentsOps:
    'Operational document register remains under /documents — this layer does not rebuild upload/CRUD.',
  thisLayer:
    'Document Intelligence adds typed profiles (COC/quotes/invoices/reports/warranties/certificates/photos), search, version history, expiry reminders, and Owner-gated AURA drafts. Real documents only. Never auto-send.',
} as const;

export const DOCI_DOCUMENT_TYPE_LABELS: Record<DocIDocumentType, string> = {
  coc: 'Certificate of Compliance (COC)',
  quote: 'Quote',
  invoice: 'Invoice',
  report: 'Report',
  warranty: 'Warranty',
  certificate: 'Certificate',
  photo: 'Photo',
  other: 'Other',
};

/** Expected doc types commonly needed per linked job/customer context (suggestion seeds only). */
export const DOCI_COMMON_MISSING_TYPES: readonly DocIDocumentType[] = [
  'coc',
  'warranty',
  'certificate',
  'report',
] as const;

export function isDocIDocumentType(value: string | null | undefined): value is DocIDocumentType {
  return Boolean(value && (DOCI_DOCUMENT_TYPES as readonly string[]).includes(value));
}

export function buildDocISearchSnapshot(input: {
  resultCount: number;
  query: string | null;
  totalDocuments: number;
}): DocISearchSnapshot {
  if (input.totalDocuments === 0) {
    return {
      availability: 'unavailable',
      resultCount: 0,
      query: input.query,
      rationale:
        'No real documents registered yet — search stays unavailable (not invented). Add documents under /documents.',
    };
  }
  return {
    availability: 'available',
    resultCount: input.resultCount,
    query: input.query,
    rationale: input.query
      ? `Search matched ${input.resultCount} real document(s) for “${input.query}”.`
      : `Listing ${input.resultCount} real document(s) from the documents register.`,
  };
}

export function buildDocIExpirySnapshot(input: {
  openReminderCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  profileWithExpiryCount: number;
}): DocIExpirySnapshot {
  if (input.profileWithExpiryCount === 0 && input.openReminderCount === 0) {
    return {
      availability: 'unavailable',
      openReminderCount: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      rationale:
        'No expiry dates set on document profiles yet — expiry intelligence unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    openReminderCount: input.openReminderCount,
    expiringSoonCount: input.expiringSoonCount,
    expiredCount: input.expiredCount,
    rationale: `${input.openReminderCount} open reminder(s); ${input.expiringSoonCount} expiring soon; ${input.expiredCount} expired — from real profile expiry dates only.`,
  };
}

export function buildDocIVersionSnapshot(input: {
  versionedDocumentCount: number;
  totalVersionRows: number;
}): DocIVersionSnapshot {
  if (input.totalVersionRows === 0) {
    return {
      availability: 'unavailable',
      versionedDocumentCount: 0,
      totalVersionRows: 0,
      rationale:
        'No version history rows yet — version intelligence unavailable until versions are recorded against real documents.',
    };
  }
  return {
    availability: 'available',
    versionedDocumentCount: input.versionedDocumentCount,
    totalVersionRows: input.totalVersionRows,
    rationale: `${input.totalVersionRows} version row(s) across ${input.versionedDocumentCount} real document(s).`,
  };
}

export function buildDocILinkSnapshot(input: {
  customerLinkedCount: number;
  jobLinkedCount: number;
  propertyLinkedCount: number;
  unlinkedCount: number;
}): DocILinkSnapshot {
  return {
    customerLinkedCount: input.customerLinkedCount,
    jobLinkedCount: input.jobLinkedCount,
    propertyLinkedCount: input.propertyLinkedCount,
    unlinkedCount: input.unlinkedCount,
    propertyLinksAvailable: true,
    rationale: `Links use real FKs: ${input.customerLinkedCount} customer, ${input.jobLinkedCount} job, ${input.propertyLinkedCount} property (cx_customer_properties). ${input.unlinkedCount} unlinked.`,
  };
}

export function buildDocIExpiryAlertDraft(input: {
  documentTitle: string;
  documentType: DocIDocumentType;
  expiresAt: string;
  docIDaysUntilExpiry: number;
}): { kind: DocIRecommendationKind; title: string; body: string } {
  const label = DOCI_DOCUMENT_TYPE_LABELS[input.documentType];
  const urgency =
    input.docIDaysUntilExpiry < 0
      ? `expired ${Math.abs(input.docIDaysUntilExpiry)} day(s) ago`
      : `expires in ${input.docIDaysUntilExpiry} day(s)`;
  return {
    kind: 'expiry_alert',
    title: `Expiry alert — ${input.documentTitle}`.slice(0, 200),
    body: [
      `${label} “${input.documentTitle}” ${urgency} (${input.expiresAt}).`,
      '',
      'Draft only from a real document profile expiry date. Not invented.',
      'Owner approval required. Does not auto-send reminders or mutate documents.',
    ].join('\n'),
  };
}

export function buildDocIMissingDocDraft(input: {
  missingType: DocIDocumentType;
  customerName?: string | null;
  jobTitle?: string | null;
  propertyName?: string | null;
}): { kind: DocIRecommendationKind; title: string; body: string } {
  const label = DOCI_DOCUMENT_TYPE_LABELS[input.missingType];
  const scope = [
    input.customerName ? `customer ${input.customerName}` : null,
    input.jobTitle ? `job ${input.jobTitle}` : null,
    input.propertyName ? `property ${input.propertyName}` : null,
  ]
    .filter(Boolean)
    .join(' / ');
  return {
    kind: 'missing_doc_suggestion',
    title: `Missing ${label}${scope ? ` — ${scope}` : ''}`.slice(0, 200),
    body: [
      `Suggestion: no real ${label} profile is linked${scope ? ` for ${scope}` : ''}.`,
      '',
      'Draft only — based on linked real jobs/customers/properties and existing document types.',
      'Does not invent documents. Owner approval required. Never auto-creates files.',
    ].join('\n'),
  };
}

export function listDocIAuraConnections(): DocIAuraConnection[] {
  return [
    {
      target: 'documents',
      label: 'Documents',
      href: '/documents',
      status: 'available_link',
      note: 'Operational document register and uploads.',
    },
    {
      target: 'customers',
      label: 'Customers',
      href: '/crm',
      status: 'available_link',
      note: 'Customer FK links from real documents.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Job FK links from real documents.',
    },
    {
      target: 'compliance',
      label: 'Legal & Compliance',
      href: '/legal-compliance',
      status: 'available_link',
      note: 'Compliance surface for COCs/certificates when present.',
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
      note: 'Executive surface link; document insights stay draft until acknowledged.',
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

export function defaultDocISettings(partial?: {
  id?: string;
  expiryRemindersEnabled?: boolean;
  missingDocSuggestionsEnabled?: boolean;
  reminderLeadDays?: number;
  notes?: string | null;
  updatedAt?: string;
}): DocISettings {
  return {
    id: partial?.id ?? 'pending',
    autoSendRemindersEnabled: false,
    inventDocumentsEnabled: false,
    expiryRemindersEnabled: partial?.expiryRemindersEnabled ?? true,
    missingDocSuggestionsEnabled: partial?.missingDocSuggestionsEnabled ?? true,
    reminderLeadDays: partial?.reminderLeadDays ?? 30,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function docIDaysUntil(isoDate: string, now = new Date()): number {
  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target)) return 0;
  const ms = target - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
