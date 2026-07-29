import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  CreateDipActionDraftRequest,
  CreateDipClassificationRequest,
  CreateDipExtractionRecordRequest,
  CreateDipExtractionTemplateRequest,
  CreateDipIntelligenceRecordRequest,
  CreateDipMatchingRecordRequest,
  CreateDipOcrJobRequest,
  CreateDipOcrProviderRequest,
  CreateDipOcrResultRequest,
  CreateDipReviewQueueItemRequest,
  CreateDipSourceConfigRequest,
  CreateDipWorkflowDraftRequest,
  DipActionDraftSummary,
  DipAnalyticsSummary,
  DipAuditLogSummary,
  DipClassificationCatalogSummary,
  DipClassificationKey,
  DipClassificationRecordSummary,
  DipDocumentAlertSummary,
  DipExtractionRecordSummary,
  DipExtractionTemplateSummary,
  DipIntelligenceRecordSummary,
  DipMatchingRecordSummary,
  DipOcrJobSummary,
  DipOcrProviderSummary,
  DipOcrResultSummary,
  DipPlatformConfigSummary,
  DipProcessingHealthSummary,
  DipReviewQueueItemSummary,
  DipSearchRequest,
  DipSearchResultSummary,
  DipSourceConfigSummary,
  DipWorkflowDraftSummary,
  EnterpriseDocumentAiAuraContext,
  EnterpriseDocumentAiDashboard,
  UpdateDipPlatformConfigRequest,
  UpdateDipReviewQueueItemRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  dipActionDrafts,
  dipAnalyticsSnapshots,
  dipAuditLogs,
  dipClassificationCatalog,
  dipClassificationRecords,
  dipDocumentAlerts,
  dipExtractionRecords,
  dipExtractionTemplates,
  dipIntelligenceRecords,
  dipMatchingRecords,
  dipOcrJobs,
  dipOcrProviderConfigs,
  dipOcrResults,
  dipPlatformConfig,
  dipReviewHistory,
  dipReviewQueueItems,
  dipSearchIndexEntries,
  dipSourceConfigs,
  dipWorkflowDrafts,
  documents,
} from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { DocumentsService } from './documents.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { FinanceService } from './finance.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { ProcurementService } from './procurement.service.js';

export class EnterpriseDocumentAiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseDocumentAiError';
  }
}

type StaffScope = { companyId: string; userId: string };

type DocumentAiDeps = {
  db: DatabaseClient;
  documentsService: DocumentsService;
  crmService: CrmService;
  jobsService: JobsService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  procurementService: ProcurementService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

const SYSTEM_CLASSIFICATIONS: Array<{
  classificationKey: DipClassificationKey;
  name: string;
  description: string;
}> = [
  { classificationKey: 'customer_document', name: 'Customer Document', description: 'Customer-related documents.' },
  { classificationKey: 'job_document', name: 'Job Document', description: 'Job and work order documents.' },
  { classificationKey: 'quote', name: 'Quote', description: 'Customer quotation documents.' },
  { classificationKey: 'invoice', name: 'Invoice', description: 'Customer invoice documents.' },
  { classificationKey: 'purchase_order', name: 'Purchase Order', description: 'Purchase order documents.' },
  { classificationKey: 'supplier_invoice', name: 'Supplier Invoice', description: 'Supplier invoice documents.' },
  { classificationKey: 'delivery_note', name: 'Delivery Note', description: 'Delivery and dispatch notes.' },
  { classificationKey: 'compliance_certificate', name: 'Compliance Certificate', description: 'Compliance and certification documents.' },
  { classificationKey: 'inspection_report', name: 'Inspection Report', description: 'Inspection and quality reports.' },
  { classificationKey: 'asset_record', name: 'Asset Record', description: 'Asset documentation.' },
  { classificationKey: 'warranty', name: 'Warranty', description: 'Warranty documents.' },
  { classificationKey: 'technical_manual', name: 'Technical Manual', description: 'Technical manuals and guides.' },
  { classificationKey: 'employment_document', name: 'Employment Document', description: 'Employment and HR documents.' },
  { classificationKey: 'contract', name: 'Contract', description: 'Contractual documents.' },
  { classificationKey: 'other', name: 'Other', description: 'Uncategorised documents.' },
];

const DEFAULT_SOURCES: Array<{ sourceKey: string; name: string }> = [
  { sourceKey: 'upload', name: 'Upload' },
  { sourceKey: 'email_attachment', name: 'Email Attachment' },
  { sourceKey: 'customer_portal', name: 'Customer Portal' },
  { sourceKey: 'mobile_app', name: 'Mobile App' },
  { sourceKey: 'scanner', name: 'Scanner Import' },
  { sourceKey: 'cloud_storage', name: 'Cloud Storage' },
  { sourceKey: 'integration', name: 'Integration' },
];

export class EnterpriseDocumentAiService {
  constructor(private readonly deps: DocumentAiDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseDocumentAiDashboard> {
    await this.ensurePlatformConfig(companyId);
    await this.ensureSystemCatalog(companyId);
    await this.ensureDefaultSources(companyId);

    const [
      platformConfig,
      documentsStats,
      allDocuments,
      ocrProviders,
      sourceConfigs,
      ocrQueue,
      reviewQueue,
      classifications,
      classificationCatalog,
      extractionTemplates,
      extractionRecords,
      matchingRecords,
      intelligenceRecords,
      workflowDrafts,
      analytics,
      alerts,
      searchIndexCount,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.documentsService.getStats(companyId),
      this.deps.documentsService.listDocuments(companyId),
      this.listOcrProviders(companyId),
      this.listSourceConfigs(companyId),
      this.listOcrJobs(companyId, { status: 'pending' }),
      this.listReviewQueue(companyId, { status: 'pending' }),
      this.listClassifications(companyId),
      this.listClassificationCatalog(companyId),
      this.listExtractionTemplates(companyId),
      this.listExtractionRecords(companyId),
      this.listMatchingRecords(companyId),
      this.listIntelligenceRecords(companyId),
      this.listWorkflowDrafts(companyId),
      this.getLatestAnalytics(companyId),
      this.listDocumentAlerts(companyId, { status: 'open' }),
      this.getSearchIndexCount(companyId),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const failedOcr = await this.listOcrJobs(companyId, { status: 'failed' });
    const processingHealth = this.buildProcessingHealth(ocrQueue, failedOcr, reviewQueue, intelligenceRecords, alerts);
    const activeOcrProviderCount = ocrProviders.filter((p) => p.enabled).length;
    const enabledSourceCount = sourceConfigs.filter((s) => s.enabled).length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const overallDocumentAiHealthStatus =
      criticalAlertCount > 0 || failedOcr.length > 5
        ? 'critical'
        : alerts.length > 0 || reviewQueue.length > 10
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${allDocuments.length} document(s), ${ocrQueue.length} OCR job(s) pending, ${reviewQueue.length} review item(s), ${activeOcrProviderCount} active OCR provider(s), ${alerts.length} open alert(s).`,
      platformConfig,
      documentsStats,
      processingHealth,
      ocrProviders,
      sourceConfigs,
      activeOcrProviderCount,
      enabledSourceCount,
      inboxDocuments: allDocuments.slice(0, 50),
      ocrQueue: [...ocrQueue, ...failedOcr].slice(0, 50),
      reviewQueue,
      classifications: classifications.slice(0, 50),
      classificationCatalog,
      extractionTemplates,
      extractionRecords: extractionRecords.slice(0, 50),
      matchingRecords: matchingRecords.slice(0, 50),
      intelligenceRecords: intelligenceRecords.slice(0, 50),
      workflowDrafts,
      searchIndexCount,
      analytics,
      recentAlerts: alerts.slice(0, 10),
      openAlertCount: alerts.length,
      overallDocumentAiHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseDocumentAiAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      pendingOcrCount: dashboard.processingHealth.pendingOcrCount,
      failedOcrCount: dashboard.processingHealth.failedOcrCount,
      reviewBacklogCount: dashboard.processingHealth.reviewBacklogCount,
      openAlertCount: dashboard.openAlertCount,
      overallDocumentAiHealthStatus: dashboard.overallDocumentAiHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<DipPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateDipPlatformConfigRequest): Promise<DipPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(dipPlatformConfig)
      .set({
        ocrPolicy: input.ocrPolicy ?? existing.ocrPolicy,
        classificationPolicy: input.classificationPolicy ?? existing.classificationPolicy,
        extractionPolicy: input.extractionPolicy ?? existing.extractionPolicy,
        reviewPolicy: input.reviewPolicy ?? existing.reviewPolicy,
        searchPolicy: input.searchPolicy ?? existing.searchPolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(dipPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'dip_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async listOcrProviders(companyId: string): Promise<DipOcrProviderSummary[]> {
    const rows = await this.deps.db.query.dipOcrProviderConfigs.findMany({
      where: eq(dipOcrProviderConfigs.companyId, companyId),
      orderBy: [desc(dipOcrProviderConfigs.createdAt)],
    });
    return rows.map(toOcrProviderSummary);
  }

  async createOcrProvider(scope: StaffScope, input: CreateDipOcrProviderRequest): Promise<DipOcrProviderSummary> {
    const [created] = await this.deps.db
      .insert(dipOcrProviderConfigs)
      .values({
        companyId: scope.companyId,
        providerKey: input.providerKey.trim(),
        name: input.name.trim(),
        enabled: input.enabled ?? false,
        config: input.config ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create OCR provider');
    await this.logAudit(scope, 'create_ocr_provider', 'dip_ocr_provider_configs', created.id);
    return toOcrProviderSummary(created);
  }

  async listSourceConfigs(companyId: string): Promise<DipSourceConfigSummary[]> {
    const rows = await this.deps.db.query.dipSourceConfigs.findMany({
      where: eq(dipSourceConfigs.companyId, companyId),
      orderBy: [desc(dipSourceConfigs.createdAt)],
    });
    return rows.map(toSourceConfigSummary);
  }

  async createSourceConfig(scope: StaffScope, input: CreateDipSourceConfigRequest): Promise<DipSourceConfigSummary> {
    const [created] = await this.deps.db
      .insert(dipSourceConfigs)
      .values({
        companyId: scope.companyId,
        sourceKey: input.sourceKey.trim(),
        name: input.name.trim(),
        enabled: input.enabled ?? true,
        config: input.config ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create source config');
    await this.logAudit(scope, 'create_source_config', 'dip_source_configs', created.id);
    return toSourceConfigSummary(created);
  }

  async listOcrJobs(companyId: string, filters?: { status?: string }): Promise<DipOcrJobSummary[]> {
    const rows = await this.deps.db.query.dipOcrJobs.findMany({
      where: filters?.status
        ? and(eq(dipOcrJobs.companyId, companyId), eq(dipOcrJobs.status, filters.status as never))
        : eq(dipOcrJobs.companyId, companyId),
      orderBy: [desc(dipOcrJobs.createdAt)],
      limit: 100,
    });
    const docMap = await this.getDocumentTitleMap(companyId, rows.map((r) => r.documentId));
    return rows.map((row) => toOcrJobSummary(row, docMap.get(row.documentId) ?? null));
  }

  async createOcrJob(scope: StaffScope, input: CreateDipOcrJobRequest): Promise<DipOcrJobSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const [created] = await this.deps.db
      .insert(dipOcrJobs)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        providerKey: input.providerKey?.trim() ?? null,
        sourceKey: input.sourceKey?.trim() ?? 'upload',
        requestedByUserId: scope.userId,
        status: 'pending',
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create OCR job');
    await this.logAudit(scope, 'create_ocr_job', 'dip_ocr_jobs', created.id, { documentId: input.documentId });
    return toOcrJobSummary(created, document.title);
  }

  async recordOcrResult(scope: StaffScope, input: CreateDipOcrResultRequest): Promise<DipOcrResultSummary> {
    const job = await this.deps.db.query.dipOcrJobs.findFirst({
      where: and(eq(dipOcrJobs.id, input.ocrJobId), eq(dipOcrJobs.companyId, scope.companyId)),
    });
    if (!job) throw new EnterpriseDocumentAiError('NOT_FOUND', 'OCR job not found');

    const [result] = await this.deps.db
      .insert(dipOcrResults)
      .values({
        companyId: scope.companyId,
        ocrJobId: input.ocrJobId,
        documentId: input.documentId,
        extractedText: input.extractedText?.trim() ?? null,
        confidenceScore: input.confidenceScore ?? null,
        pageCount: input.pageCount ?? null,
        languageCode: input.languageCode?.trim() ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();

    await this.deps.db
      .update(dipOcrJobs)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dipOcrJobs.id, input.ocrJobId));

    if (input.extractedText) {
      await this.upsertSearchIndex(scope.companyId, input.documentId, {
        ocrText: input.extractedText,
      });
    }

    await this.logAudit(scope, 'record_ocr_result', 'dip_ocr_results', result?.id);
    return toOcrResultSummary(result!);
  }

  async listClassificationCatalog(companyId: string): Promise<DipClassificationCatalogSummary[]> {
    await this.ensureSystemCatalog(companyId);
    const rows = await this.deps.db.query.dipClassificationCatalog.findMany({
      where: or(eq(dipClassificationCatalog.companyId, companyId), eq(dipClassificationCatalog.isSystemType, true)),
      orderBy: [desc(dipClassificationCatalog.createdAt)],
    });
    return rows.map(toClassificationCatalogSummary);
  }

  async listClassifications(companyId: string): Promise<DipClassificationRecordSummary[]> {
    const rows = await this.deps.db.query.dipClassificationRecords.findMany({
      where: eq(dipClassificationRecords.companyId, companyId),
      orderBy: [desc(dipClassificationRecords.createdAt)],
      limit: 100,
    });
    const docMap = await this.getDocumentTitleMap(companyId, rows.map((r) => r.documentId));
    return rows.map((row) => toClassificationRecordSummary(row, docMap.get(row.documentId) ?? null));
  }

  async createClassification(scope: StaffScope, input: CreateDipClassificationRequest): Promise<DipClassificationRecordSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const [created] = await this.deps.db
      .insert(dipClassificationRecords)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        classificationKey: input.classificationKey,
        confidenceScore: input.confidenceScore ?? null,
        manuallyCorrected: input.manuallyCorrected ?? false,
        correctedByUserId: input.manuallyCorrected ? scope.userId : null,
      })
      .returning();

    await this.upsertSearchIndex(scope.companyId, input.documentId, {
      classificationKey: input.classificationKey,
    });

    await this.logAudit(scope, 'create_classification', 'dip_classification_records', created?.id);
    return toClassificationRecordSummary(created!, document.title);
  }

  async listExtractionTemplates(companyId: string): Promise<DipExtractionTemplateSummary[]> {
    const rows = await this.deps.db.query.dipExtractionTemplates.findMany({
      where: eq(dipExtractionTemplates.companyId, companyId),
      orderBy: [desc(dipExtractionTemplates.createdAt)],
    });
    return rows.map(toExtractionTemplateSummary);
  }

  async createExtractionTemplate(
    scope: StaffScope,
    input: CreateDipExtractionTemplateRequest,
  ): Promise<DipExtractionTemplateSummary> {
    const [created] = await this.deps.db
      .insert(dipExtractionTemplates)
      .values({
        companyId: scope.companyId,
        templateKey: input.templateKey.trim(),
        name: input.name.trim(),
        classificationKey: input.classificationKey ?? null,
        fieldSchema: input.fieldSchema ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create extraction template');
    await this.logAudit(scope, 'create_extraction_template', 'dip_extraction_templates', created.id);
    return toExtractionTemplateSummary(created);
  }

  async listExtractionRecords(companyId: string): Promise<DipExtractionRecordSummary[]> {
    const rows = await this.deps.db.query.dipExtractionRecords.findMany({
      where: eq(dipExtractionRecords.companyId, companyId),
      orderBy: [desc(dipExtractionRecords.createdAt)],
      limit: 100,
    });
    const docMap = await this.getDocumentTitleMap(companyId, rows.map((r) => r.documentId));
    return rows.map((row) => toExtractionRecordSummary(row, docMap.get(row.documentId) ?? null));
  }

  async createExtractionRecord(
    scope: StaffScope,
    input: CreateDipExtractionRecordRequest,
  ): Promise<DipExtractionRecordSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const [created] = await this.deps.db
      .insert(dipExtractionRecords)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        templateId: input.templateId ?? null,
        extractedFields: input.extractedFields ?? {},
        confidenceScore: input.confidenceScore ?? null,
        workflowStatus: 'draft',
      })
      .returning();

    if ((input.confidenceScore ?? 1) < 0.7) {
      await this.createReviewQueueItem(scope, {
        documentId: input.documentId,
        reviewType: 'extraction_review',
        title: `Review extraction for ${document.title}`,
        description: 'Low confidence extraction requires human review.',
        context: { extractionRecordId: created?.id },
      });
    }

    await this.logAudit(scope, 'create_extraction_record', 'dip_extraction_records', created?.id);
    return toExtractionRecordSummary(created!, document.title);
  }

  async listMatchingRecords(companyId: string): Promise<DipMatchingRecordSummary[]> {
    const rows = await this.deps.db.query.dipMatchingRecords.findMany({
      where: eq(dipMatchingRecords.companyId, companyId),
      orderBy: [desc(dipMatchingRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toMatchingRecordSummary);
  }

  async createMatchingRecord(scope: StaffScope, input: CreateDipMatchingRecordRequest): Promise<DipMatchingRecordSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const requiresReview = input.requiresReview ?? (input.confidenceScore ?? 1) < 0.7;
    const [created] = await this.deps.db
      .insert(dipMatchingRecords)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        entityType: input.entityType.trim(),
        entityId: input.entityId ?? null,
        confidenceScore: input.confidenceScore ?? null,
        requiresReview,
        metadata: input.metadata ?? {},
      })
      .returning();

    if (requiresReview) {
      await this.createReviewQueueItem(scope, {
        documentId: input.documentId,
        reviewType: 'matching_review',
        title: `Review match for ${document.title}`,
        description: `Low confidence match to ${input.entityType}.`,
        context: { matchingRecordId: created?.id, entityType: input.entityType },
      });
    }

    await this.logAudit(scope, 'create_matching_record', 'dip_matching_records', created?.id);
    return toMatchingRecordSummary(created!);
  }

  async listReviewQueue(companyId: string, filters?: { status?: string }): Promise<DipReviewQueueItemSummary[]> {
    const rows = await this.deps.db.query.dipReviewQueueItems.findMany({
      where: filters?.status
        ? and(eq(dipReviewQueueItems.companyId, companyId), eq(dipReviewQueueItems.status, filters.status as never))
        : eq(dipReviewQueueItems.companyId, companyId),
      orderBy: [desc(dipReviewQueueItems.createdAt)],
      limit: 100,
    });
    const docMap = await this.getDocumentTitleMap(companyId, rows.map((r) => r.documentId));
    return rows.map((row) => toReviewQueueItemSummary(row, docMap.get(row.documentId) ?? null));
  }

  async createReviewQueueItem(
    scope: StaffScope,
    input: CreateDipReviewQueueItemRequest,
  ): Promise<DipReviewQueueItemSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const [created] = await this.deps.db
      .insert(dipReviewQueueItems)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        reviewType: input.reviewType.trim(),
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        assignedUserId: input.assignedUserId ?? null,
        context: input.context ?? {},
        status: 'pending',
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create review queue item');
    await this.logAudit(scope, 'create_review_queue_item', 'dip_review_queue_items', created.id);
    return toReviewQueueItemSummary(created, document.title);
  }

  async updateReviewQueueItem(
    scope: StaffScope,
    reviewItemId: string,
    input: UpdateDipReviewQueueItemRequest,
  ): Promise<DipReviewQueueItemSummary> {
    const existing = await this.deps.db.query.dipReviewQueueItems.findFirst({
      where: and(eq(dipReviewQueueItems.id, reviewItemId), eq(dipReviewQueueItems.companyId, scope.companyId)),
    });
    if (!existing) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Review queue item not found');

    const [updated] = await this.deps.db
      .update(dipReviewQueueItems)
      .set({
        status: input.status,
        assignedUserId: input.assignedUserId ?? existing.assignedUserId,
        updatedAt: new Date(),
      })
      .where(eq(dipReviewQueueItems.id, reviewItemId))
      .returning();

    await this.deps.db.insert(dipReviewHistory).values({
      companyId: scope.companyId,
      reviewQueueItemId: reviewItemId,
      actionType: input.status,
      userId: scope.userId,
      notes: input.notes?.trim() ?? null,
    });

    await this.logAudit(scope, 'update_review_queue_item', 'dip_review_queue_items', reviewItemId, { status: input.status });
    const doc = await this.deps.documentsService.getDocument(scope.companyId, existing.documentId);
    return toReviewQueueItemSummary(updated ?? existing, doc?.title ?? null);
  }

  async listIntelligenceRecords(companyId: string): Promise<DipIntelligenceRecordSummary[]> {
    const rows = await this.deps.db.query.dipIntelligenceRecords.findMany({
      where: eq(dipIntelligenceRecords.companyId, companyId),
      orderBy: [desc(dipIntelligenceRecords.createdAt)],
      limit: 100,
    });
    const docMap = await this.getDocumentTitleMap(companyId, rows.map((r) => r.documentId));
    return rows.map((row) => toIntelligenceRecordSummary(row, docMap.get(row.documentId) ?? null));
  }

  async createIntelligenceRecord(
    scope: StaffScope,
    input: CreateDipIntelligenceRecordRequest,
  ): Promise<DipIntelligenceRecordSummary> {
    const document = await this.deps.documentsService.getDocument(scope.companyId, input.documentId);
    if (!document) throw new EnterpriseDocumentAiError('NOT_FOUND', 'Document not found');

    const [created] = await this.deps.db
      .insert(dipIntelligenceRecords)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId,
        intelligenceType: input.intelligenceType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        severity: input.severity ?? 'info',
        metadata: input.metadata ?? {},
      })
      .returning();

    if (input.intelligenceType === 'summary') {
      await this.upsertSearchIndex(scope.companyId, input.documentId, { aiSummary: input.content });
    }

    await this.logAudit(scope, 'create_intelligence_record', 'dip_intelligence_records', created?.id);
    return toIntelligenceRecordSummary(created!, document.title);
  }

  async listWorkflowDrafts(companyId: string): Promise<DipWorkflowDraftSummary[]> {
    const rows = await this.deps.db.query.dipWorkflowDrafts.findMany({
      where: eq(dipWorkflowDrafts.companyId, companyId),
      orderBy: [desc(dipWorkflowDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toWorkflowDraftSummary);
  }

  async createWorkflowDraft(scope: StaffScope, input: CreateDipWorkflowDraftRequest): Promise<DipWorkflowDraftSummary> {
    const [created] = await this.deps.db
      .insert(dipWorkflowDrafts)
      .values({
        companyId: scope.companyId,
        documentId: input.documentId ?? null,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        approvalRequired: input.approvalRequired ?? true,
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create workflow draft');
    await this.logAudit(scope, 'create_workflow_draft', 'dip_workflow_drafts', created.id);
    return toWorkflowDraftSummary(created);
  }

  async searchDocuments(companyId: string, input: DipSearchRequest): Promise<DipSearchResultSummary[]> {
    const query = input.query.trim().toLowerCase();
    if (!query) return [];

    const rows = await this.deps.db.query.dipSearchIndexEntries.findMany({
      where: input.classificationKey
        ? and(
            eq(dipSearchIndexEntries.companyId, companyId),
            eq(dipSearchIndexEntries.classificationKey, input.classificationKey),
          )
        : eq(dipSearchIndexEntries.companyId, companyId),
      orderBy: [desc(dipSearchIndexEntries.indexedAt)],
      limit: input.limit ?? 50,
    });

    const docIds = rows.map((r) => r.documentId);
    const docMap = await this.getDocumentDetailsMap(companyId, docIds);

    return rows
      .filter((row) => {
        const haystack = [
          row.ocrText ?? '',
          row.aiSummary ?? '',
          row.tags.join(' '),
          docMap.get(row.documentId)?.title ?? '',
          docMap.get(row.documentId)?.fileName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .map((row) => {
        const doc = docMap.get(row.documentId);
        return {
          documentId: row.documentId,
          documentTitle: doc?.title ?? null,
          fileName: doc?.fileName ?? null,
          classificationKey: row.classificationKey,
          aiSummary: row.aiSummary,
          tags: row.tags ?? [],
          matchedText: row.ocrText?.slice(0, 200) ?? row.aiSummary,
          indexedAt: row.indexedAt.toISOString(),
        };
      });
  }

  async listDocumentAlerts(companyId: string, filters?: { status?: string }): Promise<DipDocumentAlertSummary[]> {
    const rows = await this.deps.db.query.dipDocumentAlerts.findMany({
      where: filters?.status
        ? and(eq(dipDocumentAlerts.companyId, companyId), eq(dipDocumentAlerts.status, filters.status as never))
        : eq(dipDocumentAlerts.companyId, companyId),
      orderBy: [desc(dipDocumentAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toDocumentAlertSummary);
  }

  async syncDocumentAlerts(scope: StaffScope): Promise<DipDocumentAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const alerts: DipDocumentAlertSummary[] = [];

    if (dashboard.processingHealth.failedOcrCount > 0) {
      alerts.push(
        await this.upsertDocumentAlert(scope.companyId, {
          alertType: 'ocr_failures',
          severity: dashboard.processingHealth.failedOcrCount > 5 ? 'critical' : 'warning',
          title: 'OCR extraction failures',
          description: `${dashboard.processingHealth.failedOcrCount} failed OCR job(s).`,
        }),
      );
    }

    if (dashboard.processingHealth.reviewBacklogCount > 10) {
      alerts.push(
        await this.upsertDocumentAlert(scope.companyId, {
          alertType: 'review_backlog',
          severity: 'warning',
          title: 'Review backlog high',
          description: `${dashboard.processingHealth.reviewBacklogCount} item(s) pending review.`,
        }),
      );
    }

    if (dashboard.activeOcrProviderCount === 0 && dashboard.ocrProviders.length > 0) {
      alerts.push(
        await this.upsertDocumentAlert(scope.companyId, {
          alertType: 'ocr_provider_inactive',
          severity: 'critical',
          title: 'No active OCR providers',
          description: 'All configured OCR providers are disabled.',
        }),
      );
    }

    if (dashboard.processingHealth.duplicateAlertCount > 0) {
      alerts.push(
        await this.upsertDocumentAlert(scope.companyId, {
          alertType: 'duplicate_documents',
          severity: 'info',
          title: 'Potential duplicate documents detected',
          description: `${dashboard.processingHealth.duplicateAlertCount} duplicate alert(s).`,
        }),
      );
    }

    await this.logAudit(scope, 'sync_document_alerts', 'dip_document_alerts', undefined, { alertCount: alerts.length });
    return alerts;
  }

  async captureAnalytics(scope: StaffScope): Promise<DipAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const metrics = {
      documentCount: dashboard.documentsStats.documentCount,
      pendingOcrCount: dashboard.processingHealth.pendingOcrCount,
      failedOcrCount: dashboard.processingHealth.failedOcrCount,
      reviewBacklogCount: dashboard.processingHealth.reviewBacklogCount,
      classificationCount: dashboard.classifications.length,
      extractionCount: dashboard.extractionRecords.length,
      searchIndexCount: dashboard.searchIndexCount,
      openAlertCount: dashboard.openAlertCount,
      activeOcrProviderCount: dashboard.activeOcrProviderCount,
    };

    const [created] = await this.deps.db
      .insert(dipAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to capture analytics');
    await this.logAudit(scope, 'capture_analytics', 'dip_analytics_snapshots', created.id);
    return toAnalyticsSummary(created);
  }

  async listActionDrafts(companyId: string): Promise<DipActionDraftSummary[]> {
    const rows = await this.deps.db.query.dipActionDrafts.findMany({
      where: eq(dipActionDrafts.companyId, companyId),
      orderBy: [desc(dipActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraftSummary);
  }

  async createActionDraft(scope: StaffScope, input: CreateDipActionDraftRequest): Promise<DipActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(dipActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created) throw new EnterpriseDocumentAiError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'dip_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listAuditLogs(companyId: string): Promise<DipAuditLogSummary[]> {
    const rows = await this.deps.db.query.dipAuditLogs.findMany({
      where: eq(dipAuditLogs.companyId, companyId),
      orderBy: [desc(dipAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  private buildProcessingHealth(
    ocrQueue: DipOcrJobSummary[],
    failedOcr: DipOcrJobSummary[],
    reviewQueue: DipReviewQueueItemSummary[],
    intelligence: DipIntelligenceRecordSummary[],
    alerts: DipDocumentAlertSummary[],
  ): DipProcessingHealthSummary {
    const expiringDocumentCount = intelligence.filter((i) => i.intelligenceType === 'expiry').length;
    const duplicateAlertCount = alerts.filter((a) => a.alertType === 'duplicate_documents').length;
    const ocrHealthStatus =
      failedOcr.length > 5 ? 'critical' : failedOcr.length > 0 || ocrQueue.length > 20 ? 'degraded' : 'healthy';

    return {
      ocrHealthStatus,
      pendingOcrCount: ocrQueue.length,
      failedOcrCount: failedOcr.length,
      reviewBacklogCount: reviewQueue.length,
      expiringDocumentCount,
      duplicateAlertCount,
    };
  }

  private async getSearchIndexCount(companyId: string): Promise<number> {
    const [result] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(dipSearchIndexEntries)
      .where(eq(dipSearchIndexEntries.companyId, companyId));
    return result?.count ?? 0;
  }

  private async getLatestAnalytics(companyId: string): Promise<DipAnalyticsSummary | null> {
    const row = await this.deps.db.query.dipAnalyticsSnapshots.findFirst({
      where: eq(dipAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(dipAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async upsertSearchIndex(
    companyId: string,
    documentId: string,
    input: { ocrText?: string; aiSummary?: string; classificationKey?: DipClassificationKey; tags?: string[] },
  ) {
    const existing = await this.deps.db.query.dipSearchIndexEntries.findFirst({
      where: and(eq(dipSearchIndexEntries.companyId, companyId), eq(dipSearchIndexEntries.documentId, documentId)),
    });

    if (existing) {
      await this.deps.db
        .update(dipSearchIndexEntries)
        .set({
          ocrText: input.ocrText ?? existing.ocrText,
          aiSummary: input.aiSummary ?? existing.aiSummary,
          classificationKey: input.classificationKey ?? existing.classificationKey,
          tags: input.tags ?? existing.tags,
          indexedAt: new Date(),
        })
        .where(eq(dipSearchIndexEntries.id, existing.id));
      return;
    }

    await this.deps.db.insert(dipSearchIndexEntries).values({
      companyId,
      documentId,
      ocrText: input.ocrText ?? null,
      aiSummary: input.aiSummary ?? null,
      classificationKey: input.classificationKey ?? null,
      tags: input.tags ?? [],
    });
  }

  private async upsertDocumentAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      documentId?: string;
    },
  ): Promise<DipDocumentAlertSummary> {
    const existing = await this.deps.db.query.dipDocumentAlerts.findFirst({
      where: and(
        eq(dipDocumentAlerts.companyId, companyId),
        eq(dipDocumentAlerts.alertType, input.alertType),
        eq(dipDocumentAlerts.status, 'open'),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(dipDocumentAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description,
          updatedAt: new Date(),
        })
        .where(eq(dipDocumentAlerts.id, existing.id))
        .returning();
      return toDocumentAlertSummary(updated ?? existing);
    }

    const [created] = await this.deps.db
      .insert(dipDocumentAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        documentId: input.documentId ?? null,
        sourceModule: 'document_ai',
      })
      .returning();
    return toDocumentAlertSummary(created!);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.dipPlatformConfig.findFirst({
      where: eq(dipPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(dipPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureSystemCatalog(companyId: string) {
    for (const item of SYSTEM_CLASSIFICATIONS) {
      const existing = await this.deps.db.query.dipClassificationCatalog.findFirst({
        where: and(
          eq(dipClassificationCatalog.classificationKey, item.classificationKey),
          eq(dipClassificationCatalog.isSystemType, true),
        ),
      });
      if (!existing) {
        await this.deps.db.insert(dipClassificationCatalog).values({
          companyId: null,
          classificationKey: item.classificationKey,
          name: item.name,
          description: item.description,
          isSystemType: true,
        });
      }
    }

    const tenantRows = await this.deps.db.query.dipClassificationCatalog.findMany({
      where: eq(dipClassificationCatalog.companyId, companyId),
    });
    if (tenantRows.length === 0) {
      for (const item of SYSTEM_CLASSIFICATIONS) {
        await this.deps.db.insert(dipClassificationCatalog).values({
          companyId,
          classificationKey: item.classificationKey,
          name: item.name,
          description: item.description,
          isSystemType: false,
        });
      }
    }
  }

  private async ensureDefaultSources(companyId: string) {
    const existing = await this.deps.db.query.dipSourceConfigs.findMany({
      where: eq(dipSourceConfigs.companyId, companyId),
    });
    if (existing.length > 0) return;

    for (const source of DEFAULT_SOURCES) {
      await this.deps.db.insert(dipSourceConfigs).values({
        companyId,
        sourceKey: source.sourceKey,
        name: source.name,
        enabled: true,
      });
    }
  }

  private async getDocumentTitleMap(companyId: string, documentIds: string[]) {
    const map = new Map<string, string>();
    if (documentIds.length === 0) return map;
    const rows = await this.deps.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), inArray(documents.id, documentIds)),
      columns: { id: true, title: true },
    });
    for (const row of rows) map.set(row.id, row.title);
    return map;
  }

  private async getDocumentDetailsMap(companyId: string, documentIds: string[]) {
    const map = new Map<string, { title: string; fileName: string }>();
    if (documentIds.length === 0) return map;
    const rows = await this.deps.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), inArray(documents.id, documentIds)),
      columns: { id: true, title: true, fileName: true },
    });
    for (const row of rows) map.set(row.id, { title: row.title, fileName: row.fileName });
    return map;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(dipAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof dipPlatformConfig.$inferSelect): DipPlatformConfigSummary {
  return {
    ocrPolicy: row.ocrPolicy ?? {},
    classificationPolicy: row.classificationPolicy ?? {},
    extractionPolicy: row.extractionPolicy ?? {},
    reviewPolicy: row.reviewPolicy ?? {},
    searchPolicy: row.searchPolicy ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toOcrProviderSummary(row: typeof dipOcrProviderConfigs.$inferSelect): DipOcrProviderSummary {
  return {
    id: row.id,
    providerKey: row.providerKey,
    name: row.name,
    enabled: row.enabled,
    workflowStatus: row.workflowStatus,
  };
}

function toSourceConfigSummary(row: typeof dipSourceConfigs.$inferSelect): DipSourceConfigSummary {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    name: row.name,
    enabled: row.enabled,
    workflowStatus: row.workflowStatus,
  };
}

function toOcrJobSummary(row: typeof dipOcrJobs.$inferSelect, documentTitle: string | null): DipOcrJobSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    documentTitle,
    providerKey: row.providerKey,
    sourceKey: row.sourceKey,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toOcrResultSummary(row: typeof dipOcrResults.$inferSelect): DipOcrResultSummary {
  return {
    id: row.id,
    ocrJobId: row.ocrJobId,
    documentId: row.documentId,
    extractedText: row.extractedText,
    confidenceScore: row.confidenceScore,
    pageCount: row.pageCount,
    languageCode: row.languageCode,
    createdAt: row.createdAt.toISOString(),
  };
}

function toClassificationCatalogSummary(row: typeof dipClassificationCatalog.$inferSelect): DipClassificationCatalogSummary {
  return {
    id: row.id,
    classificationKey: row.classificationKey,
    name: row.name,
    description: row.description,
    isSystemType: row.isSystemType,
  };
}

function toClassificationRecordSummary(
  row: typeof dipClassificationRecords.$inferSelect,
  documentTitle: string | null,
): DipClassificationRecordSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    documentTitle,
    classificationKey: row.classificationKey,
    confidenceScore: row.confidenceScore,
    manuallyCorrected: row.manuallyCorrected,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExtractionTemplateSummary(row: typeof dipExtractionTemplates.$inferSelect): DipExtractionTemplateSummary {
  return {
    id: row.id,
    templateKey: row.templateKey,
    name: row.name,
    classificationKey: row.classificationKey,
    workflowStatus: row.workflowStatus,
  };
}

function toExtractionRecordSummary(
  row: typeof dipExtractionRecords.$inferSelect,
  documentTitle: string | null,
): DipExtractionRecordSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    documentTitle,
    templateId: row.templateId,
    extractedFields: row.extractedFields ?? {},
    confidenceScore: row.confidenceScore,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMatchingRecordSummary(row: typeof dipMatchingRecords.$inferSelect): DipMatchingRecordSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    entityType: row.entityType,
    entityId: row.entityId,
    confidenceScore: row.confidenceScore,
    requiresReview: row.requiresReview,
    createdAt: row.createdAt.toISOString(),
  };
}

function toReviewQueueItemSummary(
  row: typeof dipReviewQueueItems.$inferSelect,
  documentTitle: string | null,
): DipReviewQueueItemSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    documentTitle,
    reviewType: row.reviewType,
    status: row.status,
    assignedUserId: row.assignedUserId,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toIntelligenceRecordSummary(
  row: typeof dipIntelligenceRecords.$inferSelect,
  documentTitle: string | null,
): DipIntelligenceRecordSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    documentTitle,
    intelligenceType: row.intelligenceType,
    title: row.title,
    content: row.content,
    severity: row.severity,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWorkflowDraftSummary(row: typeof dipWorkflowDrafts.$inferSelect): DipWorkflowDraftSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    approvalRequired: row.approvalRequired,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDocumentAlertSummary(row: typeof dipDocumentAlerts.$inferSelect): DipDocumentAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    documentId: row.documentId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof dipAnalyticsSnapshots.$inferSelect): DipAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof dipActionDrafts.$inferSelect): DipActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof dipAuditLogs.$inferSelect): DipAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
