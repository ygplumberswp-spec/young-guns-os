import type { DocumentSummary, DocumentsStats } from './documents.js';

export type DipClassificationKey =
  | 'customer_document'
  | 'job_document'
  | 'quote'
  | 'invoice'
  | 'purchase_order'
  | 'supplier_invoice'
  | 'delivery_note'
  | 'compliance_certificate'
  | 'inspection_report'
  | 'asset_record'
  | 'warranty'
  | 'technical_manual'
  | 'employment_document'
  | 'contract'
  | 'other';

export type DipPlatformConfigSummary = {
  ocrPolicy: Record<string, unknown>;
  classificationPolicy: Record<string, unknown>;
  extractionPolicy: Record<string, unknown>;
  reviewPolicy: Record<string, unknown>;
  searchPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type DipOcrProviderSummary = {
  id: string;
  providerKey: string;
  name: string;
  enabled: boolean;
  workflowStatus: string;
};

export type DipSourceConfigSummary = {
  id: string;
  sourceKey: string;
  name: string;
  enabled: boolean;
  workflowStatus: string;
};

export type DipOcrJobSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  providerKey: string | null;
  sourceKey: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DipOcrResultSummary = {
  id: string;
  ocrJobId: string;
  documentId: string;
  extractedText: string | null;
  confidenceScore: number | null;
  pageCount: number | null;
  languageCode: string | null;
  createdAt: string;
};

export type DipClassificationCatalogSummary = {
  id: string;
  classificationKey: DipClassificationKey;
  name: string;
  description: string | null;
  isSystemType: boolean;
};

export type DipClassificationRecordSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  classificationKey: DipClassificationKey;
  confidenceScore: number | null;
  manuallyCorrected: boolean;
  createdAt: string;
};

export type DipExtractionTemplateSummary = {
  id: string;
  templateKey: string;
  name: string;
  classificationKey: DipClassificationKey | null;
  workflowStatus: string;
};

export type DipExtractionRecordSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  templateId: string | null;
  extractedFields: Record<string, unknown>;
  confidenceScore: number | null;
  workflowStatus: string;
  createdAt: string;
};

export type DipMatchingRecordSummary = {
  id: string;
  documentId: string;
  entityType: string;
  entityId: string | null;
  confidenceScore: number | null;
  requiresReview: boolean;
  createdAt: string;
};

export type DipReviewQueueItemSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  reviewType: string;
  status: string;
  assignedUserId: string | null;
  title: string;
  description: string | null;
  createdAt: string;
};

export type DipIntelligenceRecordSummary = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  intelligenceType: string;
  title: string;
  content: string;
  severity: string;
  createdAt: string;
};

export type DipWorkflowDraftSummary = {
  id: string;
  documentId: string | null;
  draftType: string;
  title: string;
  content: string;
  approvalRequired: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type DipSearchResultSummary = {
  documentId: string;
  documentTitle: string | null;
  fileName: string | null;
  classificationKey: DipClassificationKey | null;
  aiSummary: string | null;
  tags: string[];
  matchedText: string | null;
  indexedAt: string;
};

export type DipDocumentAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  documentId: string | null;
  createdAt: string;
};

export type DipAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type DipAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type DipActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type DipProcessingHealthSummary = {
  ocrHealthStatus: string;
  pendingOcrCount: number;
  failedOcrCount: number;
  reviewBacklogCount: number;
  expiringDocumentCount: number;
  duplicateAlertCount: number;
};

export type EnterpriseDocumentAiDashboard = {
  summary: string;
  platformConfig: DipPlatformConfigSummary;
  documentsStats: DocumentsStats;
  processingHealth: DipProcessingHealthSummary;
  ocrProviders: DipOcrProviderSummary[];
  sourceConfigs: DipSourceConfigSummary[];
  activeOcrProviderCount: number;
  enabledSourceCount: number;
  inboxDocuments: DocumentSummary[];
  ocrQueue: DipOcrJobSummary[];
  reviewQueue: DipReviewQueueItemSummary[];
  classifications: DipClassificationRecordSummary[];
  classificationCatalog: DipClassificationCatalogSummary[];
  extractionTemplates: DipExtractionTemplateSummary[];
  extractionRecords: DipExtractionRecordSummary[];
  matchingRecords: DipMatchingRecordSummary[];
  intelligenceRecords: DipIntelligenceRecordSummary[];
  workflowDrafts: DipWorkflowDraftSummary[];
  searchIndexCount: number;
  analytics: DipAnalyticsSummary | null;
  recentAlerts: DipDocumentAlertSummary[];
  openAlertCount: number;
  overallDocumentAiHealthStatus: string;
};

export type EnterpriseDocumentAiAuraContext = {
  summary: string;
  pendingOcrCount: number;
  failedOcrCount: number;
  reviewBacklogCount: number;
  openAlertCount: number;
  overallDocumentAiHealthStatus: string;
};

export type UpdateDipPlatformConfigRequest = {
  ocrPolicy?: Record<string, unknown>;
  classificationPolicy?: Record<string, unknown>;
  extractionPolicy?: Record<string, unknown>;
  reviewPolicy?: Record<string, unknown>;
  searchPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateDipOcrProviderRequest = {
  providerKey: string;
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type CreateDipSourceConfigRequest = {
  sourceKey: string;
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type CreateDipOcrJobRequest = {
  documentId: string;
  providerKey?: string;
  sourceKey?: string;
};

export type CreateDipOcrResultRequest = {
  ocrJobId: string;
  documentId: string;
  extractedText?: string;
  confidenceScore?: number;
  pageCount?: number;
  languageCode?: string;
  metadata?: Record<string, unknown>;
};

export type CreateDipClassificationRequest = {
  documentId: string;
  classificationKey: DipClassificationKey;
  confidenceScore?: number;
  manuallyCorrected?: boolean;
};

export type CreateDipExtractionTemplateRequest = {
  templateKey: string;
  name: string;
  classificationKey?: DipClassificationKey;
  fieldSchema?: Record<string, unknown>;
};

export type CreateDipExtractionRecordRequest = {
  documentId: string;
  templateId?: string;
  extractedFields?: Record<string, unknown>;
  confidenceScore?: number;
};

export type CreateDipMatchingRecordRequest = {
  documentId: string;
  entityType: string;
  entityId?: string;
  confidenceScore?: number;
  requiresReview?: boolean;
  metadata?: Record<string, unknown>;
};

export type CreateDipReviewQueueItemRequest = {
  documentId: string;
  reviewType: string;
  title: string;
  description?: string;
  assignedUserId?: string;
  context?: Record<string, unknown>;
};

export type UpdateDipReviewQueueItemRequest = {
  status: 'approved' | 'corrected' | 'rejected' | 'reprocess' | 'in_review';
  notes?: string;
  assignedUserId?: string;
};

export type CreateDipIntelligenceRecordRequest = {
  documentId: string;
  intelligenceType: string;
  title: string;
  content: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
};

export type CreateDipWorkflowDraftRequest = {
  documentId?: string;
  draftType: string;
  title: string;
  content: string;
  approvalRequired?: boolean;
};

export type CreateDipActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type DipSearchRequest = {
  query: string;
  classificationKey?: DipClassificationKey;
  limit?: number;
};
