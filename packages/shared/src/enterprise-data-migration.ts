export type DmSourceFormat = 'csv' | 'excel' | 'json' | 'xml';

export type DmEntityType =
  | 'customer'
  | 'lead'
  | 'supplier'
  | 'contact'
  | 'property'
  | 'asset'
  | 'vehicle'
  | 'technician'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'inventory'
  | 'price_book'
  | 'purchase_order'
  | 'document'
  | 'knowledge_article'
  | 'user'
  | 'role'
  | 'settings';

/** Entity types with a safe canonical commit path in Enterprise Data Migration. */
export const DM_EXECUTABLE_ENTITY_TYPES: readonly DmEntityType[] = [
  'customer',
  'lead',
  'supplier',
  'contact',
  'property',
  'asset',
  'job',
  'quote',
  'invoice',
  'payment',
  'inventory',
  'price_book',
  'document',
] as const;

export function isDmEntityExecutable(entityType: DmEntityType): boolean {
  return (DM_EXECUTABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

export type DmWizardStep =
  | 'select_source'
  | 'upload_file'
  | 'detect_structure'
  | 'auto_map'
  | 'manual_map'
  | 'validation'
  | 'preview'
  | 'approval'
  | 'import'
  | 'summary';

export type DmImportStatus =
  | 'draft'
  | 'uploaded'
  | 'structure_detected'
  | 'mapped'
  | 'validated'
  | 'preview_ready'
  | 'pending_approval'
  | 'approved'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type DmExportStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DmDuplicateAction = 'merge' | 'skip' | 'replace' | 'create_new' | 'pending';

export type DmValidationSeverity = 'error' | 'warning' | 'info';

export type DmRollbackStatus =
  'available' | 'pending' | 'in_progress' | 'completed' | 'unavailable';

export type DmRecordOutcome = 'imported' | 'failed' | 'skipped' | 'duplicate_pending';

export type DmPlatformConfigSummary = {
  importPolicy: Record<string, unknown>;
  exportPolicy: Record<string, unknown>;
  validationPolicy: Record<string, unknown>;
  duplicatePolicy: Record<string, unknown>;
  rollbackPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type DmImportJobSummary = {
  id: string;
  title: string;
  sourceFormat: DmSourceFormat;
  entityType: DmEntityType;
  wizardStep: DmWizardStep;
  status: DmImportStatus;
  fileName: string | null;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  rollbackStatus: DmRollbackStatus;
  requiresApproval: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type DmExportJobSummary = {
  id: string;
  title: string;
  exportScope: string;
  entityType: DmEntityType | null;
  sourceFormat: DmSourceFormat;
  status: DmExportStatus;
  isScheduled: boolean;
  recordCount: number;
  fileName: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DmFieldMappingSummary = {
  id: string;
  importJobId: string;
  sourceField: string;
  targetField: string;
  confidence: number | null;
  isManualOverride: boolean;
  aiSuggested: boolean;
};

export type DmValidationResultSummary = {
  id: string;
  importJobId: string;
  rowNumber: number;
  fieldName: string | null;
  severity: DmValidationSeverity;
  errorCode: string;
  message: string;
};

export type DmDuplicateReviewSummary = {
  id: string;
  importJobId: string;
  rowNumber: number;
  duplicateKey: string;
  existingEntityId: string | null;
  proposedAction: DmDuplicateAction;
  resolvedAction: DmDuplicateAction | null;
};

export type DmImportRecordSummary = {
  id: string;
  importJobId: string;
  rowNumber: number;
  outcome: DmRecordOutcome;
  targetEntityId: string | null;
  errorMessage: string | null;
};

export type DmMigrationHistorySummary = {
  id: string;
  actionType: string;
  sourceFormat: DmSourceFormat | null;
  entityType: DmEntityType | null;
  summary: string;
  importedCount: number;
  failedCount: number;
  validationErrorCount: number;
  rollbackAvailable: boolean;
  occurredAt: string;
};

export type DmRollbackRequestSummary = {
  id: string;
  importJobId: string;
  status: DmRollbackStatus;
  reason: string | null;
  recordsAffected: number;
  requiresApproval: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type DmMigrationAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  importJobId: string | null;
  exportJobId: string | null;
  createdAt: string;
};

export type DmAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type DmAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type DmActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type DmMigrationHealthSummary = {
  activeImportCount: number;
  failedImportCount: number;
  pendingValidationCount: number;
  rollbackAvailableCount: number;
  activeExportCount: number;
  failedExportCount: number;
};

export type EnterpriseDataMigrationDashboard = {
  summary: string;
  platformConfig: DmPlatformConfigSummary;
  migrationHealth: DmMigrationHealthSummary;
  importJobs: DmImportJobSummary[];
  exportJobs: DmExportJobSummary[];
  migrationHistory: DmMigrationHistorySummary[];
  rollbackRequests: DmRollbackRequestSummary[];
  analytics: DmAnalyticsSummary | null;
  recentAlerts: DmMigrationAlertSummary[];
  openAlertCount: number;
  overallMigrationHealthStatus: string;
};

export type EnterpriseDataMigrationAuraContext = {
  summary: string;
  activeImportCount: number;
  failedImportCount: number;
  rollbackAvailableCount: number;
  openAlertCount: number;
  overallMigrationHealthStatus: string;
};

export type UpdateDmPlatformConfigRequest = {
  importPolicy?: Record<string, unknown>;
  exportPolicy?: Record<string, unknown>;
  validationPolicy?: Record<string, unknown>;
  duplicatePolicy?: Record<string, unknown>;
  rollbackPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateDmImportJobRequest = {
  title: string;
  sourceFormat: DmSourceFormat;
  entityType: DmEntityType;
};

export type UploadDmImportFileRequest = {
  fileName: string;
  fileContent: string;
};

export type UpdateDmFieldMappingsRequest = {
  mappings: Record<string, string>;
  manualOverrides?: string[];
};

export type ResolveDmDuplicateRequest = {
  duplicateReviewId: string;
  action: Exclude<DmDuplicateAction, 'pending'>;
};

export type CreateDmExportJobRequest = {
  title: string;
  exportScope?: string;
  entityType?: DmEntityType;
  sourceFormat?: DmSourceFormat;
  filters?: Record<string, unknown>;
  scheduleCron?: string;
  isScheduled?: boolean;
};

export type CreateDmRollbackRequest = {
  importJobId: string;
  reason?: string;
};

export type CreateDmActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type DmImportJobDetailSummary = DmImportJobSummary & {
  wizardStep: DmWizardStep;
  detectedStructure: Record<string, unknown>;
  fieldMappings: Record<string, string>;
  validationSummary: Record<string, unknown>;
  previewRows: Record<string, unknown>[];
  fieldMappingDetails: DmFieldMappingSummary[];
  validationResults: DmValidationResultSummary[];
  duplicateReviews: DmDuplicateReviewSummary[];
  importRecords: DmImportRecordSummary[];
};

export const DM_ENTITY_FIELD_TARGETS: Record<DmEntityType, string[]> = {
  customer: ['name', 'email', 'phone', 'status', 'notes', 'sourceExternalId'],
  lead: ['title', 'contactName', 'contactEmail', 'contactPhone', 'status', 'notes'],
  supplier: [
    'name',
    'email',
    'phone',
    'status',
    'notes',
    'supplierCode',
    'category',
    'address',
    'sourceExternalId',
    'sourceProvider',
  ],
  contact: ['name', 'email', 'phone', 'role', 'customerName', 'customerEmail'],
  property: [
    'name',
    'propertyName',
    'customerName',
    'customerEmail',
    'address',
    'street',
    'city',
    'suburb',
    'postcode',
    'postalCode',
    'sourceExternalId',
  ],
  asset: [
    'name',
    'serialNumber',
    'status',
    'location',
    'assetType',
    'equipmentType',
    'manufacturer',
    'model',
    'customerName',
    'customerEmail',
    'propertyName',
    'installationDate',
    'warrantyExpiresAt',
    'notes',
    'sourceExternalId',
    'sourceProvider',
    'jobNumber',
  ],
  vehicle: ['name', 'licensePlate', 'make', 'model', 'status'],
  technician: ['name', 'email', 'phone', 'skillLevel'],
  job: [
    'title',
    'jobNumber',
    'customerName',
    'customerEmail',
    'propertyName',
    'status',
    'description',
    'scheduledAt',
    'siteContactName',
    'siteContactMobile',
    'sourceExternalId',
  ],
  quote: [
    'quoteNumber',
    'title',
    'customerName',
    'customerEmail',
    'jobNumber',
    'propertyName',
    'amountCents',
    'vatCents',
    'status',
    'issuedAt',
    'validUntil',
    'sourceExternalId',
    'sourceProvider',
  ],
  invoice: [
    'invoiceNumber',
    'title',
    'customerName',
    'customerEmail',
    'jobNumber',
    'quoteNumber',
    'propertyName',
    'amountCents',
    'vatCents',
    'status',
    'issuedAt',
    'dueDate',
    'sourceExternalId',
    'sourceProvider',
  ],
  payment: [
    'invoiceNumber',
    'customerName',
    'amountCents',
    'method',
    'reference',
    'paidAt',
    'kind',
    'sourceExternalId',
    'sourceProvider',
  ],
  inventory: [
    'sku',
    'name',
    'quantity',
    'status',
    'sellPriceCents',
    'unitCostCents',
    'unit',
    'category',
    'description',
    'location',
    'itemType',
    'supplierName',
    'sourceExternalId',
    'sourceProvider',
  ],
  price_book: [
    'code',
    'sku',
    'name',
    'description',
    'category',
    'sellPriceCents',
    'unit',
    'taxTreatment',
    'sourceExternalId',
  ],
  purchase_order: ['orderNumber', 'supplierName', 'status', 'amountCents'],
  document: [
    'title',
    'fileName',
    'categoryName',
    'jobNumber',
    'customerName',
    'quoteNumber',
    'invoiceNumber',
    'photoPhase',
    'sourceExternalId',
  ],
  knowledge_article: ['title', 'summary', 'content'],
  user: ['email', 'firstName', 'lastName', 'roleName'],
  role: ['name', 'permissions'],
  settings: ['key', 'value'],
};

export type ProposeHistoricalDocumentMatchRequest = {
  fileName: string;
  /** Optional hints from the uploader — never auto-committed. */
  customerName?: string | null;
  amountCents?: number | null;
  issuedAt?: string | null;
};

export type ResolveHistoricalDocumentMatchRequest = {
  matchId: string;
  action: 'LINK' | 'CHOOSE_DIFFERENT' | 'CREATE_HISTORICAL_RECORD' | 'SKIP';
  targetEntityType?: string | null;
  targetEntityId?: string | null;
};

export const DM_SOURCE_FORMAT_LABELS: Record<DmSourceFormat, string> = {
  csv: 'CSV',
  excel: 'Excel',
  json: 'JSON',
  xml: 'XML',
};
