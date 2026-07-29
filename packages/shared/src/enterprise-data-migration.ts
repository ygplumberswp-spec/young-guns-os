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
  | 'purchase_order'
  | 'document'
  | 'knowledge_article'
  | 'user'
  | 'role'
  | 'settings';

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

export type DmRollbackStatus = 'available' | 'pending' | 'in_progress' | 'completed' | 'unavailable';

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
  customer: ['name', 'email', 'phone', 'status', 'notes'],
  lead: ['title', 'contactName', 'contactEmail', 'contactPhone', 'status', 'notes'],
  supplier: ['name', 'email', 'phone', 'status', 'notes'],
  contact: ['name', 'email', 'phone', 'role'],
  property: ['name', 'address', 'city', 'postcode'],
  asset: ['name', 'serialNumber', 'status', 'location'],
  vehicle: ['name', 'licensePlate', 'make', 'model', 'status'],
  technician: ['name', 'email', 'phone', 'skillLevel'],
  job: ['title', 'customerName', 'status', 'description', 'scheduledAt'],
  quote: ['quoteNumber', 'title', 'customerName', 'amountCents', 'status'],
  invoice: ['invoiceNumber', 'title', 'customerName', 'amountCents', 'status'],
  payment: ['invoiceNumber', 'customerName', 'amountCents', 'method'],
  inventory: ['sku', 'name', 'quantity', 'status'],
  purchase_order: ['orderNumber', 'supplierName', 'status', 'amountCents'],
  document: ['title', 'fileName', 'categoryName'],
  knowledge_article: ['title', 'summary', 'content'],
  user: ['email', 'firstName', 'lastName', 'roleName'],
  role: ['name', 'permissions'],
  settings: ['key', 'value'],
};

export const DM_SOURCE_FORMAT_LABELS: Record<DmSourceFormat, string> = {
  csv: 'CSV',
  excel: 'Excel',
  json: 'JSON',
  xml: 'XML',
};
