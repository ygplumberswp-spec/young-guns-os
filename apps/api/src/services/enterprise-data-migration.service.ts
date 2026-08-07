import { and, desc, eq, or } from 'drizzle-orm';import type {
  CreateDmActionDraftRequest,
  CreateDmExportJobRequest,
  CreateDmImportJobRequest,
  CreateDmRollbackRequest,
  DmActionDraftSummary,
  DmAnalyticsSummary,
  DmAuditLogSummary,
  DmDuplicateReviewSummary,
  DmExportJobSummary,
  DmFieldMappingSummary,
  DmImportJobDetailSummary,
  DmImportJobSummary,
  DmImportRecordSummary,
  DmMigrationAlertSummary,
  DmMigrationHealthSummary,
  DmMigrationHistorySummary,
  DmPlatformConfigSummary,
  DmRollbackRequestSummary,
  DmValidationResultSummary,
  EnterpriseDataMigrationAuraContext,
  EnterpriseDataMigrationDashboard,
  HistoricalDocumentMatchProposal,
  HistoricalRecordMatchCandidate,
  ProposeHistoricalDocumentMatchRequest,
  ResolveDmDuplicateRequest,
  ResolveHistoricalDocumentMatchRequest,
  UpdateDmFieldMappingsRequest,
  UpdateDmPlatformConfigRequest,
  UploadDmImportFileRequest,
} from '@titan/shared';
import {
  buildHistoricalDocumentMatchProposal,
  extractDocumentNumberHint,
  scoreHistoricalRecordMatch,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  cxCustomerProperties,
  dmActionDrafts,
  dmAnalyticsSnapshots,
  dmAuditLogs,
  dmDuplicateReviews,
  dmExportJobs,
  dmFieldMappings,
  dmHistoricalDocumentMatches,
  dmImportJobs,
  dmImportRecords,
  dmMigrationAlerts,
  dmMigrationHistory,
  dmPlatformConfig,
  dmRollbackRequests,
  dmValidationResults,
  invoices,
  jobs,
  payments,
  quotes,
} from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { LeadsService } from './leads.service.js';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';
import type { InventoryService } from './inventory.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { FleetService } from './fleet.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { DocumentsService } from './documents.service.js';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';
import { EnterpriseDataMigrationMappingService } from './enterprise-data-migration-mapping.service.js';
import {
  buildDuplicateKey,
  EnterpriseDataMigrationValidationService,
  findDuplicates,
} from './enterprise-data-migration-validation.service.js';
import { EnterpriseDataMigrationImportService } from './enterprise-data-migration-import.service.js';
import { EnterpriseDataMigrationExportService } from './enterprise-data-migration-export.service.js';
import { EnterpriseDataMigrationRollbackService } from './enterprise-data-migration-rollback.service.js';

export class EnterpriseDataMigrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseDataMigrationError';
  }
}

type StaffScope = { companyId: string; userId: string };

type MigrationDeps = {
  db: DatabaseClient;
  crmService: CrmService;
  leadsService: LeadsService;
  financeService: FinanceService;
  jobsService: JobsService;
  inventoryService: InventoryService;
  procurementService: ProcurementService;
  fleetService: FleetService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  documentsService: DocumentsService;
  assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
};

export class EnterpriseDataMigrationService {
  private readonly mappingService = new EnterpriseDataMigrationMappingService();
  private readonly validationService = new EnterpriseDataMigrationValidationService();
  private readonly importService: EnterpriseDataMigrationImportService;
  private readonly exportService: EnterpriseDataMigrationExportService;
  private readonly rollbackService: EnterpriseDataMigrationRollbackService;

  constructor(private readonly deps: MigrationDeps) {
    this.importService = new EnterpriseDataMigrationImportService({
      db: deps.db,
      crmService: deps.crmService,
      leadsService: deps.leadsService,
      procurementService: deps.procurementService,
      inventoryService: deps.inventoryService,
      documentsService: deps.documentsService,
      assetEquipmentIntelligenceService: deps.assetEquipmentIntelligenceService,
      enterpriseAssetLifecycleService: deps.enterpriseAssetLifecycleService,
    });
    this.exportService = new EnterpriseDataMigrationExportService({
      crmService: deps.crmService,
      leadsService: deps.leadsService,
      financeService: deps.financeService,
      jobsService: deps.jobsService,
      inventoryService: deps.inventoryService,
      procurementService: deps.procurementService,
      fleetService: deps.fleetService,
    });
    this.rollbackService = new EnterpriseDataMigrationRollbackService({ db: deps.db });
  }

  async getDashboard(companyId: string): Promise<EnterpriseDataMigrationDashboard> {
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      importJobs,
      exportJobs,
      migrationHistory,
      rollbackRequests,
      analytics,
      alerts,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listImportJobs(companyId),
      this.listExportJobs(companyId),
      this.listMigrationHistory(companyId),
      this.listRollbackRequests(companyId),
      this.getLatestAnalytics(companyId),
      this.listMigrationAlerts(companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService
      .getMissionControlDashboard(companyId)
      .catch(() => null);

    const migrationHealth = this.buildMigrationHealth(importJobs, exportJobs);
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const overallMigrationHealthStatus =
      criticalAlertCount > 0 || migrationHealth.failedImportCount > 5
        ? 'critical'
        : alerts.length > 0 || migrationHealth.pendingValidationCount > 10
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${importJobs.length} import job(s), ${exportJobs.length} export job(s), ${migrationHealth.activeImportCount} active import(s), ${alerts.length} open alert(s).`,
      platformConfig,
      migrationHealth,
      importJobs,
      exportJobs,
      migrationHistory,
      rollbackRequests,
      analytics,
      recentAlerts: alerts.slice(0, 10),
      openAlertCount: alerts.length,
      overallMigrationHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseDataMigrationAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      activeImportCount: dashboard.migrationHealth.activeImportCount,
      failedImportCount: dashboard.migrationHealth.failedImportCount,
      rollbackAvailableCount: dashboard.migrationHealth.rollbackAvailableCount,
      openAlertCount: dashboard.openAlertCount,
      overallMigrationHealthStatus: dashboard.overallMigrationHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<DmPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateDmPlatformConfigRequest,
  ): Promise<DmPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(dmPlatformConfig)
      .set({
        importPolicy: input.importPolicy ?? existing.importPolicy,
        exportPolicy: input.exportPolicy ?? existing.exportPolicy,
        validationPolicy: input.validationPolicy ?? existing.validationPolicy,
        duplicatePolicy: input.duplicatePolicy ?? existing.duplicatePolicy,
        rollbackPolicy: input.rollbackPolicy ?? existing.rollbackPolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(dmPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'dm_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async createImportJob(
    scope: StaffScope,
    input: CreateDmImportJobRequest,
  ): Promise<DmImportJobSummary> {
    const [created] = await this.deps.db
      .insert(dmImportJobs)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        title: input.title.trim(),
        sourceFormat: input.sourceFormat,
        entityType: input.entityType,
        wizardStep: 'select_source',
        status: 'draft',
      })
      .returning();
    if (!created)
      throw new EnterpriseDataMigrationError('CREATE_FAILED', 'Unable to create import job');
    await this.logAudit(scope, 'create_import_job', 'dm_import_jobs', created.id);
    return toImportJobSummary(created);
  }

  async uploadImportFile(
    scope: StaffScope,
    importJobId: string,
    input: UploadDmImportFileRequest,
  ): Promise<DmImportJobSummary> {
    const job = await this.ensureImportJob(scope.companyId, importJobId);
    const rows = this.mappingService.parseFileContent(job.sourceFormat, input.fileContent);
    if (rows.length === 0) {
      throw new EnterpriseDataMigrationError('VALIDATION_ERROR', 'Unable to parse file content');
    }
    const detectedStructure = this.mappingService.detectStructure(rows);
    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        fileName: input.fileName.trim(),
        fileContent: input.fileContent,
        detectedStructure,
        wizardStep: 'detect_structure',
        status: 'uploaded',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();
    await this.logAudit(scope, 'upload_import_file', 'dm_import_jobs', importJobId, {
      rowCount: rows.length,
    });
    return toImportJobSummary(updated!);
  }

  async autoMapFields(scope: StaffScope, importJobId: string): Promise<DmImportJobSummary> {
    const job = await this.ensureImportJob(scope.companyId, importJobId);
    const structure = job.detectedStructure as { columns?: string[] };
    const columns = structure.columns ?? [];
    const suggestions = this.mappingService.suggestFieldMappings(job.entityType, columns);

    await this.deps.db.delete(dmFieldMappings).where(eq(dmFieldMappings.importJobId, importJobId));

    const mappings: Record<string, string> = {};
    for (const [sourceField, suggestion] of Object.entries(suggestions)) {
      mappings[sourceField] = suggestion.targetField;
      await this.deps.db.insert(dmFieldMappings).values({
        companyId: scope.companyId,
        importJobId,
        sourceField,
        targetField: suggestion.targetField,
        confidence: suggestion.confidence,
        aiSuggested: true,
      });
    }

    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        fieldMappings: mappings,
        wizardStep: 'auto_map',
        status: 'structure_detected',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();
    await this.logAudit(scope, 'auto_map_fields', 'dm_import_jobs', importJobId);
    return toImportJobSummary(updated!);
  }

  async updateFieldMappings(
    scope: StaffScope,
    importJobId: string,
    input: UpdateDmFieldMappingsRequest,
  ): Promise<DmImportJobSummary> {
    await this.ensureImportJob(scope.companyId, importJobId);
    await this.deps.db.delete(dmFieldMappings).where(eq(dmFieldMappings.importJobId, importJobId));

    const manualOverrides = new Set(input.manualOverrides ?? []);
    for (const [sourceField, targetField] of Object.entries(input.mappings)) {
      await this.deps.db.insert(dmFieldMappings).values({
        companyId: scope.companyId,
        importJobId,
        sourceField,
        targetField,
        isManualOverride: manualOverrides.has(sourceField),
        aiSuggested: !manualOverrides.has(sourceField),
      });
    }

    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        fieldMappings: input.mappings,
        wizardStep: 'manual_map',
        status: 'mapped',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();
    await this.logAudit(scope, 'update_field_mappings', 'dm_import_jobs', importJobId);
    return toImportJobSummary(updated!);
  }

  async validateImportJob(
    scope: StaffScope,
    importJobId: string,
  ): Promise<DmImportJobDetailSummary> {
    const job = await this.ensureImportJob(scope.companyId, importJobId);
    if (!job.fileContent) {
      throw new EnterpriseDataMigrationError('VALIDATION_ERROR', 'Import file not uploaded');
    }

    const parsedRows = this.mappingService.parseFileContent(job.sourceFormat, job.fileContent);
    const mappedRows = this.mappingService.applyMappings(
      parsedRows,
      job.fieldMappings as Record<string, string>,
    );
    const { keys: existingKeys, keyToEntityId } = await this.buildExistingDuplicateKeys(
      scope.companyId,
      job.entityType,
    );
    const issues = this.validationService.validateRows(job.entityType, mappedRows, existingKeys);

    await this.deps.db
      .delete(dmValidationResults)
      .where(eq(dmValidationResults.importJobId, importJobId));
    for (const issue of issues) {
      await this.deps.db.insert(dmValidationResults).values({
        companyId: scope.companyId,
        importJobId,
        rowNumber: issue.rowNumber,
        fieldName: issue.fieldName,
        severity: issue.severity,
        errorCode: issue.errorCode,
        message: issue.message,
      });
    }

    await this.deps.db
      .delete(dmDuplicateReviews)
      .where(eq(dmDuplicateReviews.importJobId, importJobId));
    const duplicates = findDuplicates(job.entityType, mappedRows, existingKeys, keyToEntityId);
    for (const duplicate of duplicates) {
      await this.deps.db.insert(dmDuplicateReviews).values({
        companyId: scope.companyId,
        importJobId,
        rowNumber: duplicate.rowNumber,
        duplicateKey: duplicate.duplicateKey,
        existingEntityId: duplicate.existingEntityId,
        proposedAction: 'pending',
      });
    }

    const validationSummary = this.validationService.summarize(issues);
    const previewRows = mappedRows.slice(0, 20);
    const hasErrors = this.validationService.hasBlockingErrors(issues);

    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        validationSummary,
        previewRows,
        wizardStep: hasErrors ? 'validation' : 'preview',
        status: hasErrors ? 'validated' : 'preview_ready',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();

    await this.logAudit(
      scope,
      'validate_import_job',
      'dm_import_jobs',
      importJobId,
      validationSummary,
    );
    return this.getImportJobDetail(scope.companyId, updated!.id);
  }

  async submitImportForApproval(
    scope: StaffScope,
    importJobId: string,
  ): Promise<DmImportJobSummary> {
    await this.ensureImportJob(scope.companyId, importJobId);
    if (this.validationService.hasBlockingErrors(await this.getValidationIssues(importJobId))) {
      throw new EnterpriseDataMigrationError(
        'VALIDATION_ERROR',
        'Import has blocking validation errors',
      );
    }
    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        wizardStep: 'approval',
        status: 'pending_approval',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();
    await this.logAudit(scope, 'submit_import_for_approval', 'dm_import_jobs', importJobId);
    return toImportJobSummary(updated!);
  }

  async approveImportJob(scope: StaffScope, importJobId: string): Promise<DmImportJobSummary> {
    await this.ensureImportJob(scope.companyId, importJobId);
    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        wizardStep: 'import',
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();
    await this.logAudit(scope, 'approve_import_job', 'dm_import_jobs', importJobId);
    return toImportJobSummary(updated!);
  }

  async executeImportJob(
    scope: StaffScope,
    importJobId: string,
  ): Promise<DmImportJobDetailSummary> {
    const job = await this.ensureImportJob(scope.companyId, importJobId);
    if (job.status !== 'approved') {
      throw new EnterpriseDataMigrationError(
        'APPROVAL_REQUIRED',
        'Import must be approved before execution',
      );
    }
    if (!job.fileContent) {
      throw new EnterpriseDataMigrationError('VALIDATION_ERROR', 'Import file not uploaded');
    }

    await this.deps.db
      .update(dmImportJobs)
      .set({ status: 'importing', wizardStep: 'import', updatedAt: new Date() })
      .where(eq(dmImportJobs.id, importJobId));

    const parsedRows = this.mappingService.parseFileContent(job.sourceFormat, job.fileContent);
    const mappedRows = this.mappingService.applyMappings(
      parsedRows,
      job.fieldMappings as Record<string, string>,
    );
    const duplicateReviews = await this.deps.db.query.dmDuplicateReviews.findMany({
      where: eq(dmDuplicateReviews.importJobId, importJobId),
    });
    const skipRows = new Set<number>();
    const linkRows = new Map<number, string>();
    const replaceStockRows = new Set<number>();
    for (const review of duplicateReviews) {
      const action = review.resolvedAction ?? review.proposedAction;
      // Unresolved or explicit skip — never silently create a duplicate historical record.
      if (!review.resolvedAction || action === 'skip' || action === 'pending') {
        skipRows.add(review.rowNumber);
        continue;
      }
      if (action === 'replace' && job.entityType === 'inventory') {
        // Explicit replace review allows stock overwrite; importer must run (not early-link).
        replaceStockRows.add(review.rowNumber);
        continue;
      }
      if (
        (action === 'merge' || action === 'replace') &&
        review.existingEntityId
      ) {
        linkRows.set(review.rowNumber, review.existingEntityId);
      }
      // create_new proceeds to importRow (idempotent match still applies inside importer).
    }

    const results = await this.importService.importApprovedRows(
      scope.companyId,
      scope.userId,
      job.entityType,
      mappedRows,
      skipRows,
      {
        importJobId,
        sourceFormat: job.sourceFormat,
        linkRows,
        replaceStockRows,
      },
    );

    await this.deps.db.delete(dmImportRecords).where(eq(dmImportRecords.importJobId, importJobId));
    for (const result of results) {
      await this.deps.db.insert(dmImportRecords).values({
        companyId: scope.companyId,
        importJobId,
        rowNumber: result.rowNumber,
        outcome: result.outcome,
        targetEntityId: result.targetEntityId,
        errorMessage: result.errorMessage,
        sourceData: result.sourceData,
      });
    }

    const importedCount = results.filter((r) => r.outcome === 'imported').length;
    const failedCount = results.filter((r) => r.outcome === 'failed').length;
    const skippedCount = results.filter((r) => r.outcome === 'skipped').length;
    const rollbackAvailable = importedCount > 0;

    const [updated] = await this.deps.db
      .update(dmImportJobs)
      .set({
        status: failedCount > 0 && importedCount === 0 ? 'failed' : 'completed',
        wizardStep: 'summary',
        importedCount,
        failedCount,
        skippedCount,
        rollbackStatus: rollbackAvailable ? 'available' : 'unavailable',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dmImportJobs.id, importJobId))
      .returning();

    await this.deps.db.insert(dmMigrationHistory).values({
      companyId: scope.companyId,
      importJobId,
      userId: scope.userId,
      actionType: 'import_completed',
      sourceFormat: job.sourceFormat,
      entityType: job.entityType,
      summary: `Imported ${importedCount}, failed ${failedCount}, skipped ${skippedCount}.`,
      importedCount,
      failedCount,
      validationErrorCount: Number(
        (job.validationSummary as { errorCount?: number }).errorCount ?? 0,
      ),
      rollbackAvailable,
    });

    await this.logAudit(scope, 'execute_import_job', 'dm_import_jobs', importJobId, {
      importedCount,
      failedCount,
      skippedCount,
    });

    return this.getImportJobDetail(scope.companyId, updated!.id);
  }

  async resolveDuplicate(
    scope: StaffScope,
    input: ResolveDmDuplicateRequest,
  ): Promise<DmDuplicateReviewSummary> {
    const review = await this.deps.db.query.dmDuplicateReviews.findFirst({
      where: and(
        eq(dmDuplicateReviews.id, input.duplicateReviewId),
        eq(dmDuplicateReviews.companyId, scope.companyId),
      ),
    });
    if (!review) throw new EnterpriseDataMigrationError('NOT_FOUND', 'Duplicate review not found');

    const [updated] = await this.deps.db
      .update(dmDuplicateReviews)
      .set({
        resolvedAction: input.action,
        resolvedByUserId: scope.userId,
        resolvedAt: new Date(),
      })
      .where(eq(dmDuplicateReviews.id, input.duplicateReviewId))
      .returning();
    await this.logAudit(
      scope,
      'resolve_duplicate',
      'dm_duplicate_reviews',
      input.duplicateReviewId,
      {
        action: input.action,
        before: review.resolvedAction,
        after: input.action,
      },
    );
    return toDuplicateReviewSummary(updated!);
  }

  async proposeHistoricalDocumentMatch(
    scope: StaffScope,
    input: ProposeHistoricalDocumentMatchRequest,
  ): Promise<HistoricalDocumentMatchProposal & { matchId: string }> {
    const fileName = input.fileName.trim();
    if (!fileName) {
      throw new EnterpriseDataMigrationError('VALIDATION_ERROR', 'fileName is required');
    }

    const hint = extractDocumentNumberHint(fileName);
    const candidates: HistoricalRecordMatchCandidate[] = [];

    if (hint.detectedNumber && (hint.detectedEntityHint === 'quote' || hint.detectedEntityHint === 'other')) {
      const quoteRows = await this.deps.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, scope.companyId), eq(quotes.quoteNumber, hint.detectedNumber)),
        with: { customer: true },
        limit: 5,
      });
      for (const quote of quoteRows) {
        const scored = scoreHistoricalRecordMatch({
          signals: {
            numberMatch: true,
            customerMatch: input.customerName
              ? quote.customer?.name?.toLowerCase() === input.customerName.toLowerCase()
              : false,
            amountMatch:
              input.amountCents != null ? quote.totalCents === input.amountCents : false,
            dateMatch: Boolean(input.issuedAt && quote.issuedAt),
          },
        });
        candidates.push({
          entityType: 'quote',
          entityId: quote.id,
          label: `Quote ${quote.quoteNumber}`,
          customerName: quote.customer?.name ?? null,
          documentNumber: quote.quoteNumber,
          issuedAt: quote.issuedAt?.toISOString() ?? null,
          amountCents: quote.totalCents,
          sourceProvider: quote.sourceProvider,
          ...scored,
          reasons: scored.confidence === 'none' ? ['weak signals'] : ['quote number'],
        });
      }
    }

    if (hint.detectedNumber && (hint.detectedEntityHint === 'invoice' || hint.detectedEntityHint === 'other')) {
      const invoiceRows = await this.deps.db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, scope.companyId),
          or(eq(invoices.invoiceNumber, hint.detectedNumber), eq(invoices.xeroInvoiceNumber, hint.detectedNumber)),
        ),
        with: { customer: true },
        limit: 5,
      });
      for (const invoice of invoiceRows) {
        const scored = scoreHistoricalRecordMatch({
          signals: {
            numberMatch: true,
            customerMatch: input.customerName
              ? invoice.customer?.name?.toLowerCase() === input.customerName.toLowerCase()
              : false,
            amountMatch:
              input.amountCents != null ? invoice.totalCents === input.amountCents : false,
          },
        });
        candidates.push({
          entityType: 'invoice',
          entityId: invoice.id,
          label: `Invoice ${invoice.invoiceNumber}`,
          customerName: invoice.customer?.name ?? null,
          documentNumber: invoice.invoiceNumber,
          issuedAt: invoice.issuedAt?.toISOString() ?? null,
          amountCents: invoice.totalCents,
          sourceProvider: invoice.sourceProvider,
          ...scored,
          reasons: ['invoice number'],
        });
      }
    }

    if (hint.detectedNumber && hint.detectedEntityHint === 'job') {
      const jobRows = await this.deps.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, scope.companyId), eq(jobs.jobNumber, hint.detectedNumber)),
        limit: 5,
      });
      for (const job of jobRows) {
        const scored = scoreHistoricalRecordMatch({
          signals: { numberMatch: true },
        });
        candidates.push({
          entityType: 'job',
          entityId: job.id,
          label: `Job ${job.jobNumber ?? job.title}`,
          documentNumber: job.jobNumber,
          sourceProvider: job.sourceProvider,
          ...scored,
          reasons: ['job number'],
        });
      }
    }

    const proposal = buildHistoricalDocumentMatchProposal({ fileName, candidates });
    const [created] = await this.deps.db
      .insert(dmHistoricalDocumentMatches)
      .values({
        companyId: scope.companyId,
        fileName: proposal.fileName,
        detectedNumber: proposal.detectedNumber,
        detectedEntityHint: proposal.detectedEntityHint,
        candidates: proposal.candidates,
        recommendedAction: proposal.recommendedAction,
        recommendedCandidateId: proposal.recommendedCandidateId,
        allowSilentLink: proposal.allowSilentLink,
      })
      .returning();

    if (!created) {
      throw new EnterpriseDataMigrationError('CREATE_FAILED', 'Unable to create document match proposal');
    }

    await this.logAudit(scope, 'historical_document_match_proposed', 'dm_historical_document_matches', created.id, {
      fileName,
      candidateCount: candidates.length,
      allowSilentLink: proposal.allowSilentLink,
    });

    return { ...proposal, matchId: created.id };
  }

  async resolveHistoricalDocumentMatch(
    scope: StaffScope,
    input: ResolveHistoricalDocumentMatchRequest,
  ): Promise<{ matchId: string; action: string; targetEntityId: string | null }> {
    const existing = await this.deps.db.query.dmHistoricalDocumentMatches.findFirst({
      where: and(
        eq(dmHistoricalDocumentMatches.id, input.matchId),
        eq(dmHistoricalDocumentMatches.companyId, scope.companyId),
      ),
    });
    if (!existing) {
      throw new EnterpriseDataMigrationError('NOT_FOUND', 'Document match proposal not found');
    }

    if (input.action === 'LINK' && !input.targetEntityId && !existing.allowSilentLink) {
      throw new EnterpriseDataMigrationError(
        'VALIDATION_ERROR',
        'Low-confidence matches require an explicit target record — silent link refused.',
      );
    }

    const actionMap = {
      LINK: 'link',
      CHOOSE_DIFFERENT: 'choose_different',
      CREATE_HISTORICAL_RECORD: 'create_historical_record',
      SKIP: 'skip',
    } as const;

    const targetEntityId =
      input.targetEntityId ??
      (input.action === 'LINK' ? existing.recommendedCandidateId : null);

    const [updated] = await this.deps.db
      .update(dmHistoricalDocumentMatches)
      .set({
        resolvedAction: actionMap[input.action],
        resolvedEntityType: input.targetEntityType ?? null,
        resolvedEntityId: targetEntityId,
        resolvedByUserId: scope.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dmHistoricalDocumentMatches.id, input.matchId))
      .returning();

    await this.logAudit(
      scope,
      'historical_document_match_resolved',
      'dm_historical_document_matches',
      input.matchId,
      {
        action: input.action,
        targetEntityId,
        before: existing.resolvedAction,
        after: actionMap[input.action],
      },
    );

    return {
      matchId: updated!.id,
      action: input.action,
      targetEntityId,
    };
  }

  async createExportJob(
    scope: StaffScope,
    input: CreateDmExportJobRequest,
  ): Promise<DmExportJobSummary> {
    const [created] = await this.deps.db
      .insert(dmExportJobs)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        title: input.title.trim(),
        exportScope: input.exportScope ?? 'module',
        entityType: input.entityType ?? null,
        sourceFormat: input.sourceFormat ?? 'csv',
        filters: input.filters ?? {},
        scheduleCron: input.scheduleCron ?? null,
        isScheduled: input.isScheduled ?? false,
      })
      .returning();
    if (!created)
      throw new EnterpriseDataMigrationError('CREATE_FAILED', 'Unable to create export job');
    await this.logAudit(scope, 'create_export_job', 'dm_export_jobs', created.id);
    return toExportJobSummary(created);
  }

  async executeExportJob(scope: StaffScope, exportJobId: string): Promise<DmExportJobSummary> {
    const job = await this.ensureExportJob(scope.companyId, exportJobId);
    await this.deps.db
      .update(dmExportJobs)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(dmExportJobs.id, exportJobId));

    try {
      const result = await this.exportService.exportModule(
        scope.companyId,
        job.entityType,
        job.sourceFormat,
        job.filters as Record<string, unknown>,
      );
      const [updated] = await this.deps.db
        .update(dmExportJobs)
        .set({
          status: 'completed',
          recordCount: result.recordCount,
          fileName: result.fileName,
          exportContent: result.exportContent,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dmExportJobs.id, exportJobId))
        .returning();

      await this.deps.db.insert(dmMigrationHistory).values({
        companyId: scope.companyId,
        exportJobId,
        userId: scope.userId,
        actionType: 'export_completed',
        sourceFormat: job.sourceFormat,
        entityType: job.entityType,
        summary: `Exported ${result.recordCount} record(s) to ${result.fileName}.`,
        importedCount: result.recordCount,
      });

      await this.logAudit(scope, 'execute_export_job', 'dm_export_jobs', exportJobId, {
        recordCount: result.recordCount,
      });
      return toExportJobSummary(updated!);
    } catch (error) {
      await this.deps.db
        .update(dmExportJobs)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Export failed',
          updatedAt: new Date(),
        })
        .where(eq(dmExportJobs.id, exportJobId));
      throw error;
    }
  }

  async createRollbackRequest(
    scope: StaffScope,
    input: CreateDmRollbackRequest,
  ): Promise<DmRollbackRequestSummary> {
    const availability = await this.rollbackService.getRollbackAvailability(
      input.importJobId,
      scope.companyId,
    );
    if (!availability.available) {
      throw new EnterpriseDataMigrationError(
        'VALIDATION_ERROR',
        'Rollback is not available for this import',
      );
    }

    const [created] = await this.deps.db
      .insert(dmRollbackRequests)
      .values({
        companyId: scope.companyId,
        importJobId: input.importJobId,
        userId: scope.userId,
        reason: input.reason ?? null,
        recordsAffected: availability.recordsAffected,
        status: 'pending',
      })
      .returning();
    if (!created)
      throw new EnterpriseDataMigrationError('CREATE_FAILED', 'Unable to create rollback request');
    await this.logAudit(scope, 'create_rollback_request', 'dm_rollback_requests', created.id);
    return toRollbackRequestSummary(created);
  }

  async approveRollbackRequest(
    scope: StaffScope,
    rollbackRequestId: string,
  ): Promise<DmRollbackRequestSummary> {
    const request = await this.deps.db.query.dmRollbackRequests.findFirst({
      where: and(
        eq(dmRollbackRequests.id, rollbackRequestId),
        eq(dmRollbackRequests.companyId, scope.companyId),
      ),
    });
    if (!request) throw new EnterpriseDataMigrationError('NOT_FOUND', 'Rollback request not found');

    const result = await this.rollbackService.executeRollback(request.importJobId, scope.companyId);

    const [updated] = await this.deps.db
      .update(dmRollbackRequests)
      .set({
        status: 'completed',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        completedAt: new Date(),
        recordsAffected: result.recordsAffected,
        updatedAt: new Date(),
      })
      .where(eq(dmRollbackRequests.id, rollbackRequestId))
      .returning();

    await this.deps.db.insert(dmMigrationHistory).values({
      companyId: scope.companyId,
      importJobId: request.importJobId,
      userId: scope.userId,
      actionType: 'rollback_completed',
      summary: result.note,
      importedCount: 0,
      failedCount: 0,
      rollbackAvailable: false,
      metadata: { recordsAffected: result.recordsAffected },
    });

    await this.logAudit(
      scope,
      'approve_rollback_request',
      'dm_rollback_requests',
      rollbackRequestId,
    );
    return toRollbackRequestSummary(updated!);
  }

  async getImportJobDetail(
    companyId: string,
    importJobId: string,
  ): Promise<DmImportJobDetailSummary> {
    const job = await this.ensureImportJob(companyId, importJobId);
    const [fieldMappingDetails, validationResults, duplicateReviews, importRecords] =
      await Promise.all([
        this.deps.db.query.dmFieldMappings.findMany({
          where: eq(dmFieldMappings.importJobId, importJobId),
        }),
        this.deps.db.query.dmValidationResults.findMany({
          where: eq(dmValidationResults.importJobId, importJobId),
        }),
        this.deps.db.query.dmDuplicateReviews.findMany({
          where: eq(dmDuplicateReviews.importJobId, importJobId),
        }),
        this.deps.db.query.dmImportRecords.findMany({
          where: eq(dmImportRecords.importJobId, importJobId),
        }),
      ]);

    return {
      ...toImportJobSummary(job),
      detectedStructure: job.detectedStructure as Record<string, unknown>,
      fieldMappings: job.fieldMappings as Record<string, string>,
      validationSummary: job.validationSummary as Record<string, unknown>,
      previewRows: job.previewRows as Record<string, unknown>[],
      fieldMappingDetails: fieldMappingDetails.map(toFieldMappingSummary),
      validationResults: validationResults.map(toValidationResultSummary),
      duplicateReviews: duplicateReviews.map(toDuplicateReviewSummary),
      importRecords: importRecords.map(toImportRecordSummary),
    };
  }

  async listImportJobs(companyId: string): Promise<DmImportJobSummary[]> {
    const rows = await this.deps.db.query.dmImportJobs.findMany({
      where: eq(dmImportJobs.companyId, companyId),
      orderBy: [desc(dmImportJobs.createdAt)],
      limit: 50,
    });
    return rows.map(toImportJobSummary);
  }

  async listExportJobs(companyId: string): Promise<DmExportJobSummary[]> {
    const rows = await this.deps.db.query.dmExportJobs.findMany({
      where: eq(dmExportJobs.companyId, companyId),
      orderBy: [desc(dmExportJobs.createdAt)],
      limit: 50,
    });
    return rows.map(toExportJobSummary);
  }

  async listMigrationHistory(companyId: string): Promise<DmMigrationHistorySummary[]> {
    const rows = await this.deps.db.query.dmMigrationHistory.findMany({
      where: eq(dmMigrationHistory.companyId, companyId),
      orderBy: [desc(dmMigrationHistory.occurredAt)],
      limit: 100,
    });
    return rows.map(toMigrationHistorySummary);
  }

  async listRollbackRequests(companyId: string): Promise<DmRollbackRequestSummary[]> {
    const rows = await this.deps.db.query.dmRollbackRequests.findMany({
      where: eq(dmRollbackRequests.companyId, companyId),
      orderBy: [desc(dmRollbackRequests.createdAt)],
      limit: 50,
    });
    return rows.map(toRollbackRequestSummary);
  }

  async listMigrationAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<DmMigrationAlertSummary[]> {
    const rows = await this.deps.db.query.dmMigrationAlerts.findMany({
      where: filters?.status
        ? and(
            eq(dmMigrationAlerts.companyId, companyId),
            eq(dmMigrationAlerts.status, filters.status as never),
          )
        : eq(dmMigrationAlerts.companyId, companyId),
      orderBy: [desc(dmMigrationAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toMigrationAlertSummary);
  }

  async syncMigrationAlerts(scope: StaffScope): Promise<DmMigrationAlertSummary[]> {
    const importJobs = await this.listImportJobs(scope.companyId);
    const exportJobs = await this.listExportJobs(scope.companyId);
    const alerts: DmMigrationAlertSummary[] = [];

    const failedImports = importJobs.filter((job) => job.status === 'failed');
    if (failedImports.length > 0) {
      alerts.push(
        await this.upsertMigrationAlert(scope.companyId, {
          alertType: 'failed_imports',
          severity: failedImports.length > 5 ? 'critical' : 'warning',
          title: 'Failed import jobs detected',
          description: `${failedImports.length} import job(s) failed.`,
        }),
      );
    }

    const activeImports = importJobs.filter((job) =>
      ['importing', 'pending_approval', 'approved'].includes(job.status),
    );
    if (activeImports.length > 10) {
      alerts.push(
        await this.upsertMigrationAlert(scope.companyId, {
          alertType: 'import_backlog',
          severity: 'warning',
          title: 'Import job backlog',
          description: `${activeImports.length} active import job(s).`,
        }),
      );
    }

    const failedExports = exportJobs.filter((job) => job.status === 'failed');
    if (failedExports.length > 0) {
      alerts.push(
        await this.upsertMigrationAlert(scope.companyId, {
          alertType: 'failed_exports',
          severity: 'warning',
          title: 'Failed export jobs detected',
          description: `${failedExports.length} export job(s) failed.`,
        }),
      );
    }

    await this.logAudit(scope, 'sync_migration_alerts', 'dm_migration_alerts');
    return alerts;
  }

  async captureAnalytics(scope: StaffScope): Promise<DmAnalyticsSummary> {
    const importJobs = await this.listImportJobs(scope.companyId);
    const exportJobs = await this.listExportJobs(scope.companyId);
    const metrics = {
      importJobCount: importJobs.length,
      exportJobCount: exportJobs.length,
      failedImportCount: importJobs.filter((j) => j.status === 'failed').length,
      failedExportCount: exportJobs.filter((j) => j.status === 'failed').length,
      rollbackAvailableCount: importJobs.filter((j) => j.rollbackStatus === 'available').length,
    };
    const [created] = await this.deps.db
      .insert(dmAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    await this.logAudit(scope, 'capture_analytics', 'dm_analytics_snapshots', created?.id);
    return toAnalyticsSummary(created!);
  }

  async listActionDrafts(companyId: string): Promise<DmActionDraftSummary[]> {
    const rows = await this.deps.db.query.dmActionDrafts.findMany({
      where: eq(dmActionDrafts.companyId, companyId),
      orderBy: [desc(dmActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraftSummary);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreateDmActionDraftRequest,
  ): Promise<DmActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(dmActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created)
      throw new EnterpriseDataMigrationError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'dm_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listAuditLogs(companyId: string): Promise<DmAuditLogSummary[]> {
    const rows = await this.deps.db.query.dmAuditLogs.findMany({
      where: eq(dmAuditLogs.companyId, companyId),
      orderBy: [desc(dmAuditLogs.createdAt)],
      limit: 200,
    });
    return rows.map(toAuditLogSummary);
  }

  private async buildExistingDuplicateKeys(
    companyId: string,
    entityType: DmImportJobSummary['entityType'],
  ): Promise<{ keys: Set<string>; keyToEntityId: Map<string, string> }> {
    const keys = new Set<string>();
    const keyToEntityId = new Map<string, string>();
    const remember = (key: string, entityId: string) => {
      if (!key || key.endsWith(':') || key.endsWith('|')) return;
      keys.add(key);
      keyToEntityId.set(key, entityId);
    };

    switch (entityType) {
      case 'customer':
      case 'contact':
        for (const customer of await this.deps.crmService.listCustomers(companyId)) {
          remember(
            buildDuplicateKey(entityType, {
              name: customer.name,
              email: customer.email ?? '',
            }),
            customer.id,
          );
        }
        break;
      case 'lead':
        for (const lead of await this.deps.leadsService.listLeads(companyId)) {
          remember(
            buildDuplicateKey('lead', {
              contactEmail: lead.contactEmail ?? '',
              contactName: lead.contactName,
              title: lead.title,
            }),
            lead.id,
          );
        }
        break;
      case 'supplier':
        for (const supplier of await this.deps.procurementService.listSuppliers(companyId)) {
          remember(
            buildDuplicateKey('supplier', {
              name: supplier.name,
              email: supplier.email ?? '',
              supplierCode: supplier.supplierCode ?? '',
              sourceExternalId: supplier.sourceExternalId ?? '',
            }),
            supplier.id,
          );
          if (supplier.supplierCode) {
            remember(
              buildDuplicateKey('supplier', {
                supplierCode: supplier.supplierCode,
                name: '',
                email: '',
              }),
              supplier.id,
            );
          }
        }
        break;
      case 'asset': {
        const assets = await this.deps.assetEquipmentIntelligenceService.listAssets(companyId);
        for (const asset of assets) {
          remember(
            buildDuplicateKey('asset', {
              serialNumber: asset.serialNumber ?? '',
              name: asset.name,
            }),
            asset.id,
          );
        }
        break;
      }
      case 'inventory':
      case 'price_book':
        for (const item of await this.deps.inventoryService.listItems(companyId)) {
          remember(
            buildDuplicateKey(entityType === 'price_book' ? 'price_book' : 'inventory', {
              sku: item.sku,
              code: item.sku,
            }),
            item.id,
          );
        }
        break;
      case 'property': {
        const customers = await this.deps.crmService.listCustomers(companyId);
        const customerById = new Map(customers.map((customer) => [customer.id, customer]));
        const properties = await this.deps.db.query.cxCustomerProperties.findMany({
          where: eq(cxCustomerProperties.companyId, companyId),
          limit: 5000,
        });
        for (const property of properties) {
          const customer = customerById.get(property.customerId);
          remember(
            buildDuplicateKey('property', {
              customerName: customer?.name ?? '',
              customerEmail: customer?.email ?? '',
              propertyName: property.propertyName,
              name: property.propertyName,
              address: property.addressLine1 ?? '',
            }),
            property.id,
          );
        }
        break;
      }
      case 'job': {
        const jobRows = await this.deps.db.query.jobs.findMany({
          where: eq(jobs.companyId, companyId),
          with: { customer: true },
          limit: 5000,
        });
        for (const job of jobRows) {
          remember(
            buildDuplicateKey('job', {
              jobNumber: job.jobNumber ?? '',
              title: job.title,
              customerName: job.customer?.name ?? '',
              customerEmail: job.customer?.email ?? '',
            }),
            job.id,
          );
        }
        break;
      }
      case 'quote': {
        const quoteRows = await this.deps.db.query.quotes.findMany({
          where: eq(quotes.companyId, companyId),
          limit: 5000,
        });
        for (const quote of quoteRows) {
          remember(buildDuplicateKey('quote', { quoteNumber: quote.quoteNumber }), quote.id);
        }
        break;
      }
      case 'invoice': {
        const invoiceRows = await this.deps.db.query.invoices.findMany({
          where: eq(invoices.companyId, companyId),
          limit: 5000,
        });
        for (const invoice of invoiceRows) {
          remember(
            buildDuplicateKey('invoice', { invoiceNumber: invoice.invoiceNumber }),
            invoice.id,
          );
          if (invoice.xeroInvoiceNumber) {
            remember(
              buildDuplicateKey('invoice', { invoiceNumber: invoice.xeroInvoiceNumber }),
              invoice.id,
            );
          }
        }
        break;
      }
      case 'payment': {
        const paymentRows = await this.deps.db.query.payments.findMany({
          where: eq(payments.companyId, companyId),
          with: { invoice: true },
          limit: 5000,
        });
        for (const payment of paymentRows) {
          remember(
            buildDuplicateKey('payment', {
              invoiceNumber: payment.invoice?.invoiceNumber ?? '',
              reference: payment.reference ?? '',
              amountCents: String(payment.amountCents),
            }),
            payment.id,
          );
        }
        break;
      }
      default:
        break;
    }
    return { keys, keyToEntityId };
  }

  private async getValidationIssues(importJobId: string) {
    const rows = await this.deps.db.query.dmValidationResults.findMany({
      where: eq(dmValidationResults.importJobId, importJobId),
    });
    return rows.map((row) => ({
      rowNumber: row.rowNumber,
      fieldName: row.fieldName,
      severity: row.severity,
      errorCode: row.errorCode,
      message: row.message,
    }));
  }

  private buildMigrationHealth(
    importJobs: DmImportJobSummary[],
    exportJobs: DmExportJobSummary[],
  ): DmMigrationHealthSummary {
    return {
      activeImportCount: importJobs.filter((j) =>
        ['importing', 'pending_approval', 'approved'].includes(j.status),
      ).length,
      failedImportCount: importJobs.filter((j) => j.status === 'failed').length,
      pendingValidationCount: importJobs.filter((j) =>
        ['validated', 'mapped', 'uploaded'].includes(j.status),
      ).length,
      rollbackAvailableCount: importJobs.filter((j) => j.rollbackStatus === 'available').length,
      activeExportCount: exportJobs.filter((j) => j.status === 'running' || j.status === 'pending')
        .length,
      failedExportCount: exportJobs.filter((j) => j.status === 'failed').length,
    };
  }

  private async ensureImportJob(companyId: string, importJobId: string) {
    const job = await this.deps.db.query.dmImportJobs.findFirst({
      where: and(eq(dmImportJobs.id, importJobId), eq(dmImportJobs.companyId, companyId)),
    });
    if (!job) throw new EnterpriseDataMigrationError('NOT_FOUND', 'Import job not found');
    return job;
  }

  private async ensureExportJob(companyId: string, exportJobId: string) {
    const job = await this.deps.db.query.dmExportJobs.findFirst({
      where: and(eq(dmExportJobs.id, exportJobId), eq(dmExportJobs.companyId, companyId)),
    });
    if (!job) throw new EnterpriseDataMigrationError('NOT_FOUND', 'Export job not found');
    return job;
  }

  private async upsertMigrationAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description?: string;
    },
  ): Promise<DmMigrationAlertSummary> {
    const existing = await this.deps.db.query.dmMigrationAlerts.findFirst({
      where: and(
        eq(dmMigrationAlerts.companyId, companyId),
        eq(dmMigrationAlerts.alertType, input.alertType),
        eq(dmMigrationAlerts.status, 'open'),
      ),
    });
    if (existing) {
      const [updated] = await this.deps.db
        .update(dmMigrationAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(dmMigrationAlerts.id, existing.id))
        .returning();
      return toMigrationAlertSummary(updated ?? existing);
    }
    const [created] = await this.deps.db
      .insert(dmMigrationAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
      })
      .returning();
    return toMigrationAlertSummary(created!);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.dmPlatformConfig.findFirst({
      where: eq(dmPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(dmPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async getLatestAnalytics(companyId: string): Promise<DmAnalyticsSummary | null> {
    const row = await this.deps.db.query.dmAnalyticsSnapshots.findFirst({
      where: eq(dmAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(dmAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(dmAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(
  row: typeof dmPlatformConfig.$inferSelect,
): DmPlatformConfigSummary {
  return {
    importPolicy: row.importPolicy,
    exportPolicy: row.exportPolicy,
    validationPolicy: row.validationPolicy,
    duplicatePolicy: row.duplicatePolicy,
    rollbackPolicy: row.rollbackPolicy,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toImportJobSummary(row: typeof dmImportJobs.$inferSelect): DmImportJobSummary {
  return {
    id: row.id,
    title: row.title,
    sourceFormat: row.sourceFormat,
    entityType: row.entityType,
    wizardStep: row.wizardStep,
    status: row.status,
    fileName: row.fileName,
    importedCount: row.importedCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    rollbackStatus: row.rollbackStatus,
    requiresApproval: row.requiresApproval,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toExportJobSummary(row: typeof dmExportJobs.$inferSelect): DmExportJobSummary {
  return {
    id: row.id,
    title: row.title,
    exportScope: row.exportScope,
    entityType: row.entityType,
    sourceFormat: row.sourceFormat,
    status: row.status,
    isScheduled: row.isScheduled,
    recordCount: row.recordCount,
    fileName: row.fileName,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toFieldMappingSummary(row: typeof dmFieldMappings.$inferSelect): DmFieldMappingSummary {
  return {
    id: row.id,
    importJobId: row.importJobId,
    sourceField: row.sourceField,
    targetField: row.targetField,
    confidence: row.confidence,
    isManualOverride: row.isManualOverride,
    aiSuggested: row.aiSuggested,
  };
}

function toValidationResultSummary(
  row: typeof dmValidationResults.$inferSelect,
): DmValidationResultSummary {
  return {
    id: row.id,
    importJobId: row.importJobId,
    rowNumber: row.rowNumber,
    fieldName: row.fieldName,
    severity: row.severity,
    errorCode: row.errorCode,
    message: row.message,
  };
}

function toDuplicateReviewSummary(
  row: typeof dmDuplicateReviews.$inferSelect,
): DmDuplicateReviewSummary {
  return {
    id: row.id,
    importJobId: row.importJobId,
    rowNumber: row.rowNumber,
    duplicateKey: row.duplicateKey,
    existingEntityId: row.existingEntityId,
    proposedAction: row.proposedAction,
    resolvedAction: row.resolvedAction,
  };
}

function toImportRecordSummary(row: typeof dmImportRecords.$inferSelect): DmImportRecordSummary {
  return {
    id: row.id,
    importJobId: row.importJobId,
    rowNumber: row.rowNumber,
    outcome: row.outcome,
    targetEntityId: row.targetEntityId,
    errorMessage: row.errorMessage,
  };
}

function toMigrationHistorySummary(
  row: typeof dmMigrationHistory.$inferSelect,
): DmMigrationHistorySummary {
  return {
    id: row.id,
    actionType: row.actionType,
    sourceFormat: row.sourceFormat,
    entityType: row.entityType,
    summary: row.summary,
    importedCount: row.importedCount,
    failedCount: row.failedCount,
    validationErrorCount: row.validationErrorCount,
    rollbackAvailable: row.rollbackAvailable,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toRollbackRequestSummary(
  row: typeof dmRollbackRequests.$inferSelect,
): DmRollbackRequestSummary {
  return {
    id: row.id,
    importJobId: row.importJobId,
    status: row.status,
    reason: row.reason,
    recordsAffected: row.recordsAffected,
    requiresApproval: row.requiresApproval,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toMigrationAlertSummary(
  row: typeof dmMigrationAlerts.$inferSelect,
): DmMigrationAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    importJobId: row.importJobId,
    exportJobId: row.exportJobId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof dmAnalyticsSnapshots.$inferSelect): DmAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof dmActionDrafts.$inferSelect): DmActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof dmAuditLogs.$inferSelect): DmAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
