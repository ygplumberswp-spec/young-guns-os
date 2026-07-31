import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateSdServiceActionDraftRequest,
  EnterpriseServiceDeliveryAuraContext,
  EnterpriseServiceDeliveryDashboard,
  SdAnalyticsSummary,
  SdPortalServiceSummary,
  SdPlatformConfigSummary,
  SdServiceAlertSummary,
  SdServiceMonitoringSummary,
  UpdateSdPlatformConfigRequest,
  CreateSdCallbackRecordRequest,
  CreateSdCompletionCertificateRequest,
  CreateSdContinuousImprovementInitiativeRequest,
  CreateSdCorrectiveActionRequest,
  CreateSdCustomerAcceptanceRequest,
  CreateSdDefectRequest,
  CreateSdFirstTimeFixAnalysisRequest,
  CreateSdHandoverRecordRequest,
  CreateSdInspectionRequest,
  CreateSdInspectionTemplateRequest,
  CreateSdNonConformanceRequest,
  CreateSdPreventiveActionRequest,
  CreateSdQaInspectionRequest,
  CreateSdServicePromiseRequest,
  CreateSdSlaFrameworkRequest,
  CreateSdSlaRecordRequest,
  CreateSdVariationRecordRequest,
  CreateSdWarrantyClaimTrackingRequest,
  CreateSdWarrantyRecordRequest,
  UpdateSdCallbackRecordRequest,
  UpdateSdCompletionCertificateRequest,
  UpdateSdContinuousImprovementInitiativeRequest,
  UpdateSdCorrectiveActionRequest,
  UpdateSdCustomerAcceptanceRequest,
  UpdateSdDefectRequest,
  UpdateSdHandoverRecordRequest,
  UpdateSdInspectionRequest,
  UpdateSdInspectionTemplateRequest,
  UpdateSdNonConformanceRequest,
  UpdateSdPreventiveActionRequest,
  UpdateSdQaInspectionRequest,
  UpdateSdServicePromiseRequest,
  UpdateSdSlaFrameworkRequest,
  UpdateSdSlaRecordRequest,
  UpdateSdVariationRecordRequest,
  UpdateSdWarrantyClaimTrackingRequest,
  UpdateSdWarrantyRecordRequest,
  SdCallbackRecordSummary,
  SdCompletionCertificateSummary,
  SdContinuousImprovementInitiativeSummary,
  SdCorrectiveActionSummary,
  SdCustomerAcceptanceSummary,
  SdDefectSummary,
  SdFirstTimeFixAnalysisSummary,
  SdHandoverRecordSummary,
  SdInspectionSummary,
  SdInspectionTemplateSummary,
  SdNonConformanceSummary,
  SdPreventiveActionSummary,
  SdQaInspectionSummary,
  SdServicePromiseSummary,
  SdSlaFrameworkSummary,
  SdSlaRecordSummary,
  SdVariationRecordSummary,
  SdWarrantyClaimTrackingSummary,
  SdWarrantyRecordSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  sdAnalyticsSnapshots,
  sdAuditLogs,
  sdCallbackRecords,
  sdCompletionCertificates,
  sdContinuousImprovementInitiatives,
  sdCorrectiveActions,
  sdCustomerAcceptances,
  sdDefects,
  sdFirstTimeFixAnalyses,
  sdHandoverRecords,
  sdInspectionTemplates,
  sdInspections,
  sdNonConformances,
  sdPlatformConfig,
  sdPreventiveActions,
  sdQaInspections,
  sdServiceActionDrafts,
  sdServiceAlerts,
  sdServicePromises,
  sdSlaFrameworks,
  sdSlaRecords,
  sdVariationRecords,
  sdWarrantyClaimTrackings,
  sdWarrantyRecords,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { CrmService } from './crm.service.js';
import type { DispatchIntelligenceService } from './dispatch-intelligence.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';
import type { QualityAssuranceService } from './quality-assurance.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class EnterpriseServiceDeliveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseServiceDeliveryError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ServiceDeliveryDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  jobsService: JobsService;
  qualityAssuranceService: QualityAssuranceService;
  dispatchIntelligenceService: DispatchIntelligenceService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  analyticsService: AnalyticsService;
  crmService: CrmService;
};

export class EnterpriseServiceDeliveryService {
  constructor(private readonly deps: ServiceDeliveryDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseServiceDeliveryDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      jobStats,
      qualityStats,
      dispatchStats,
      promises,
      slaRecords,
      inspections,
      callbacks,
      alerts,
      defects,
      correctiveActions,
      analytics,
      serviceMonitoring,
      financeStats,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.jobsService.getStats(companyId),
      this.deps.qualityAssuranceService.getExecutiveDashboard(companyId),
      this.deps.dispatchIntelligenceService.getOperationsDashboard(companyId),
      this.listServicePromises(companyId),
      this.listSlaRecords(companyId),
      this.listInspections(companyId),
      this.listCallbackRecords(companyId),
      this.listServiceAlerts(companyId, { status: 'open' }),
      this.listDefects(companyId),
      this.listCorrectiveActions(companyId),
      this.getLatestAnalytics(companyId),
      this.getServiceMonitoring(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    const openPromiseCount = promises.filter(
      (row) => !row.fulfilledAt && row.workflowStatus !== 'cancelled',
    ).length;
    const slaBreachCount = slaRecords.filter((row) => row.breachedAt && !row.metAt).length;

    return {
      summary: `${jobStats.activeCount} active job(s), ${openPromiseCount} open promise(s), ${slaBreachCount} SLA breach(es), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      jobStats,
      qualityStats,
      dispatchStats,
      promiseCount: promises.length,
      openPromiseCount,
      slaRecordCount: slaRecords.length,
      slaBreachCount,
      inspectionCount: inspections.length,
      openDefectCount: defects.filter(
        (row) => !['executed', 'cancelled'].includes(row.workflowStatus),
      ).length,
      openCallbackCount: callbacks.filter(
        (row) => !['executed', 'cancelled'].includes(row.workflowStatus),
      ).length,
      openAlertCount: alerts.length,
      currency: financeStats.currency,
      analytics,
      serviceMonitoring,
      recentPromises: promises.slice(0, 10),
      recentSlaRecords: slaRecords.slice(0, 10),
      recentInspections: inspections.slice(0, 10),
      recentCallbacks: callbacks.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentDefects: defects.slice(0, 10),
      recentCorrectiveActions: correctiveActions.slice(0, 10),
    };
  }

  async getServiceMonitoring(companyId: string): Promise<SdServiceMonitoringSummary> {
    const now = Date.now();
    const [
      slaRecords,
      inspections,
      callbacks,
      promises,
      defects,
      correctiveActions,
      qualityComebacks,
      qualityWarranty,
    ] = await Promise.all([
      this.deps.db.query.sdSlaRecords.findMany({ where: eq(sdSlaRecords.companyId, companyId) }),
      this.deps.db.query.sdInspections.findMany({ where: eq(sdInspections.companyId, companyId) }),
      this.deps.db.query.sdCallbackRecords.findMany({
        where: eq(sdCallbackRecords.companyId, companyId),
      }),
      this.deps.db.query.sdServicePromises.findMany({
        where: eq(sdServicePromises.companyId, companyId),
      }),
      this.deps.db.query.sdDefects.findMany({ where: eq(sdDefects.companyId, companyId) }),
      this.deps.db.query.sdCorrectiveActions.findMany({
        where: eq(sdCorrectiveActions.companyId, companyId),
      }),
      this.deps.qualityAssuranceService.listComebacks(companyId),
      this.deps.qualityAssuranceService.listWarrantyClaims(companyId),
    ]);

    const slaBreachCount = slaRecords.filter((row) => row.breachedAt && !row.metAt).length;
    const overdueInspectionCount = inspections.filter((row) => {
      if (['completed', 'cancelled'].includes(row.inspectionStatus)) return false;
      const dueAt = (row.config as { dueAt?: string }).dueAt;
      return dueAt ? new Date(dueAt).getTime() < now : false;
    }).length;
    const openCallbackCount = callbacks.filter(
      (row) => !['executed', 'cancelled'].includes(row.workflowStatus),
    ).length;
    const promiseBreachCount = promises.filter((row) => {
      if (row.fulfilledAt || row.workflowStatus === 'cancelled') return false;
      return row.dueAt ? row.dueAt.getTime() < now : false;
    }).length;
    const openDefectCount = defects.filter(
      (row) => !['executed', 'cancelled'].includes(row.workflowStatus),
    ).length;
    const pendingCorrectiveActionCount = correctiveActions.filter((row) =>
      ['draft', 'review', 'pending_approval', 'approved'].includes(row.workflowStatus),
    ).length;

    const alerts: string[] = [];
    if (slaBreachCount > 0) alerts.push(`${slaBreachCount} SLA breach(es)`);
    if (overdueInspectionCount > 0) alerts.push(`${overdueInspectionCount} overdue inspection(s)`);
    if (openCallbackCount > 0) alerts.push(`${openCallbackCount} open callback(s)`);
    if (promiseBreachCount > 0) alerts.push(`${promiseBreachCount} breached service promise(s)`);
    if (openDefectCount > 0) alerts.push(`${openDefectCount} open defect(s)`);
    if (pendingCorrectiveActionCount > 0)
      alerts.push(`${pendingCorrectiveActionCount} pending corrective action(s)`);
    const openQualityComebacks = qualityComebacks.filter(
      (row) => !['closed', 'cancelled'].includes(row.status),
    ).length;
    const openQualityWarranty = qualityWarranty.filter(
      (row) => !['closed', 'cancelled'].includes(row.status),
    ).length;
    if (openQualityComebacks > 0) alerts.push(`${openQualityComebacks} open quality comeback(s)`);
    if (openQualityWarranty > 0) alerts.push(`${openQualityWarranty} open warranty claim(s)`);

    return {
      slaBreachCount,
      overdueInspectionCount,
      openCallbackCount,
      promiseBreachCount,
      openDefectCount,
      pendingCorrectiveActionCount,
      alerts,
    };
  }

  async getPortalServiceSummary(
    companyId: string,
    customerId?: string,
  ): Promise<SdPortalServiceSummary> {
    const [jobStats, promises, callbacks, warrantyRecords, acceptances] = await Promise.all([
      this.deps.jobsService.getStats(companyId),
      this.listServicePromises(companyId),
      this.listCallbackRecords(companyId),
      this.listWarrantyRecords(companyId),
      this.listCustomerAcceptances(companyId),
    ]);

    const filteredPromises = customerId
      ? promises.filter((row) => (row as { customerId?: string }).customerId === customerId)
      : promises;
    const filteredCallbacks = callbacks;
    const filteredWarranty = customerId
      ? warrantyRecords.filter((row) => row.customerId === customerId)
      : warrantyRecords;
    const filteredAcceptances = customerId
      ? acceptances.filter((row) => row.customerId === customerId)
      : acceptances;

    const openPromiseCount = filteredPromises.filter(
      (row) => !row.fulfilledAt && row.workflowStatus !== 'cancelled',
    ).length;
    const openCallbackCount = filteredCallbacks.filter(
      (row) => !['executed', 'cancelled'].includes(row.workflowStatus),
    ).length;
    const pendingAcceptanceCount = filteredAcceptances.filter(
      (row) => row.workflowStatus !== 'executed',
    ).length;

    return {
      activeJobCount: jobStats.activeCount,
      openPromiseCount,
      openCallbackCount,
      warrantyRecordCount: filteredWarranty.length,
      pendingAcceptanceCount,
      summary:
        openPromiseCount > 0 || openCallbackCount > 0
          ? `${openPromiseCount} open promise(s), ${openCallbackCount} open callback(s).`
          : 'No active service delivery issues.',
    };
  }

  async listJobs(companyId: string) {
    return this.deps.jobsService.listJobs(companyId);
  }

  async listQualityComebacks(companyId: string) {
    return this.deps.qualityAssuranceService.listComebacks(companyId);
  }

  async listQualityWarrantyClaims(companyId: string) {
    return this.deps.qualityAssuranceService.listWarrantyClaims(companyId);
  }

  async getDispatchDashboard(companyId: string) {
    return this.deps.dispatchIntelligenceService.getOperationsDashboard(companyId);
  }

  async getPlatformConfig(companyId: string): Promise<SdPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateSdPlatformConfigRequest,
  ): Promise<SdPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(sdPlatformConfig)
      .set({
        serviceStandards: input.serviceStandards ?? existing.serviceStandards,
        promiseTemplates: input.promiseTemplates ?? existing.promiseTemplates,
        slaTemplates: input.slaTemplates ?? existing.slaTemplates,
        inspectionTemplates: input.inspectionTemplates ?? existing.inspectionTemplates,
        qualityStandards: input.qualityStandards ?? existing.qualityStandards,
        warrantyStandards: input.warrantyStandards ?? existing.warrantyStandards,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(sdPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createServicePromise(
    scope: StaffScope,
    input: CreateSdServicePromiseRequest,
  ): Promise<SdServicePromiseSummary> {
    const [created] = await this.deps.db
      .insert(sdServicePromises)
      .values({
        companyId: scope.companyId,
        ...mapCreateServicePromiseInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'service_promise_created', 'sd_service_promise', created!.id);
    return toServicePromiseSummary(created!);
  }

  async listServicePromises(companyId: string): Promise<SdServicePromiseSummary[]> {
    const rows = await this.deps.db.query.sdServicePromises.findMany({
      where: eq(sdServicePromises.companyId, companyId),
      orderBy: [desc(sdServicePromises.createdAt)],
      limit: 100,
    });
    return rows.map(toServicePromiseSummary);
  }

  async getServicePromise(companyId: string, id: string): Promise<SdServicePromiseSummary | null> {
    const row = await this.deps.db.query.sdServicePromises.findFirst({
      where: and(eq(sdServicePromises.companyId, companyId), eq(sdServicePromises.id, id)),
    });
    return row ? toServicePromiseSummary(row) : null;
  }

  async updateServicePromise(
    scope: StaffScope,
    id: string,
    input: UpdateSdServicePromiseRequest,
  ): Promise<SdServicePromiseSummary> {
    await this.ensureServicePromise(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdServicePromises)
      .set({ ...mapUpdateServicePromiseInput(input), updatedAt: new Date() })
      .where(and(eq(sdServicePromises.companyId, scope.companyId), eq(sdServicePromises.id, id)))
      .returning();

    await this.recordAudit(scope, 'service_promise_updated', 'sd_service_promise', id);
    return toServicePromiseSummary(updated!);
  }

  async createSlaFramework(
    scope: StaffScope,
    input: CreateSdSlaFrameworkRequest,
  ): Promise<SdSlaFrameworkSummary> {
    const [created] = await this.deps.db
      .insert(sdSlaFrameworks)
      .values({
        companyId: scope.companyId,
        ...mapCreateSlaFrameworkInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'sla_framework_created', 'sd_sla_framework', created!.id);
    return toSlaFrameworkSummary(created!);
  }

  async listSlaFrameworks(companyId: string): Promise<SdSlaFrameworkSummary[]> {
    const rows = await this.deps.db.query.sdSlaFrameworks.findMany({
      where: eq(sdSlaFrameworks.companyId, companyId),
      orderBy: [desc(sdSlaFrameworks.createdAt)],
      limit: 100,
    });
    return rows.map(toSlaFrameworkSummary);
  }

  async getSlaFramework(companyId: string, id: string): Promise<SdSlaFrameworkSummary | null> {
    const row = await this.deps.db.query.sdSlaFrameworks.findFirst({
      where: and(eq(sdSlaFrameworks.companyId, companyId), eq(sdSlaFrameworks.id, id)),
    });
    return row ? toSlaFrameworkSummary(row) : null;
  }

  async updateSlaFramework(
    scope: StaffScope,
    id: string,
    input: UpdateSdSlaFrameworkRequest,
  ): Promise<SdSlaFrameworkSummary> {
    await this.ensureSlaFramework(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdSlaFrameworks)
      .set({ ...mapUpdateSlaFrameworkInput(input), updatedAt: new Date() })
      .where(and(eq(sdSlaFrameworks.companyId, scope.companyId), eq(sdSlaFrameworks.id, id)))
      .returning();

    await this.recordAudit(scope, 'sla_framework_updated', 'sd_sla_framework', id);
    return toSlaFrameworkSummary(updated!);
  }

  async createSlaRecord(
    scope: StaffScope,
    input: CreateSdSlaRecordRequest,
  ): Promise<SdSlaRecordSummary> {
    const [created] = await this.deps.db
      .insert(sdSlaRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateSlaRecordInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'sla_record_created', 'sd_sla_record', created!.id);
    return toSlaRecordSummary(created!);
  }

  async listSlaRecords(companyId: string): Promise<SdSlaRecordSummary[]> {
    const rows = await this.deps.db.query.sdSlaRecords.findMany({
      where: eq(sdSlaRecords.companyId, companyId),
      orderBy: [desc(sdSlaRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toSlaRecordSummary);
  }

  async getSlaRecord(companyId: string, id: string): Promise<SdSlaRecordSummary | null> {
    const row = await this.deps.db.query.sdSlaRecords.findFirst({
      where: and(eq(sdSlaRecords.companyId, companyId), eq(sdSlaRecords.id, id)),
    });
    return row ? toSlaRecordSummary(row) : null;
  }

  async updateSlaRecord(
    scope: StaffScope,
    id: string,
    input: UpdateSdSlaRecordRequest,
  ): Promise<SdSlaRecordSummary> {
    await this.ensureSlaRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdSlaRecords)
      .set({ ...mapUpdateSlaRecordInput(input), updatedAt: new Date() })
      .where(and(eq(sdSlaRecords.companyId, scope.companyId), eq(sdSlaRecords.id, id)))
      .returning();

    await this.recordAudit(scope, 'sla_record_updated', 'sd_sla_record', id);
    return toSlaRecordSummary(updated!);
  }

  async createInspectionTemplate(
    scope: StaffScope,
    input: CreateSdInspectionTemplateRequest,
  ): Promise<SdInspectionTemplateSummary> {
    const [created] = await this.deps.db
      .insert(sdInspectionTemplates)
      .values({
        companyId: scope.companyId,
        ...mapCreateInspectionTemplateInput(input),
      })
      .returning();

    await this.recordAudit(
      scope,
      'inspection_template_created',
      'sd_inspection_template',
      created!.id,
    );
    return toInspectionTemplateSummary(created!);
  }

  async listInspectionTemplates(companyId: string): Promise<SdInspectionTemplateSummary[]> {
    const rows = await this.deps.db.query.sdInspectionTemplates.findMany({
      where: eq(sdInspectionTemplates.companyId, companyId),
      orderBy: [desc(sdInspectionTemplates.createdAt)],
      limit: 100,
    });
    return rows.map(toInspectionTemplateSummary);
  }

  async getInspectionTemplate(
    companyId: string,
    id: string,
  ): Promise<SdInspectionTemplateSummary | null> {
    const row = await this.deps.db.query.sdInspectionTemplates.findFirst({
      where: and(eq(sdInspectionTemplates.companyId, companyId), eq(sdInspectionTemplates.id, id)),
    });
    return row ? toInspectionTemplateSummary(row) : null;
  }

  async updateInspectionTemplate(
    scope: StaffScope,
    id: string,
    input: UpdateSdInspectionTemplateRequest,
  ): Promise<SdInspectionTemplateSummary> {
    await this.ensureInspectionTemplate(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdInspectionTemplates)
      .set({ ...mapUpdateInspectionTemplateInput(input), updatedAt: new Date() })
      .where(
        and(eq(sdInspectionTemplates.companyId, scope.companyId), eq(sdInspectionTemplates.id, id)),
      )
      .returning();

    await this.recordAudit(scope, 'inspection_template_updated', 'sd_inspection_template', id);
    return toInspectionTemplateSummary(updated!);
  }

  async createInspection(
    scope: StaffScope,
    input: CreateSdInspectionRequest,
  ): Promise<SdInspectionSummary> {
    const [created] = await this.deps.db
      .insert(sdInspections)
      .values({
        companyId: scope.companyId,
        ...mapCreateInspectionInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'inspection_created', 'sd_inspection', created!.id);
    return toInspectionSummary(created!);
  }

  async listInspections(companyId: string): Promise<SdInspectionSummary[]> {
    const rows = await this.deps.db.query.sdInspections.findMany({
      where: eq(sdInspections.companyId, companyId),
      orderBy: [desc(sdInspections.createdAt)],
      limit: 100,
    });
    return rows.map(toInspectionSummary);
  }

  async getInspection(companyId: string, id: string): Promise<SdInspectionSummary | null> {
    const row = await this.deps.db.query.sdInspections.findFirst({
      where: and(eq(sdInspections.companyId, companyId), eq(sdInspections.id, id)),
    });
    return row ? toInspectionSummary(row) : null;
  }

  async updateInspection(
    scope: StaffScope,
    id: string,
    input: UpdateSdInspectionRequest,
  ): Promise<SdInspectionSummary> {
    await this.ensureInspection(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdInspections)
      .set({ ...mapUpdateInspectionInput(input), updatedAt: new Date() })
      .where(and(eq(sdInspections.companyId, scope.companyId), eq(sdInspections.id, id)))
      .returning();

    await this.recordAudit(scope, 'inspection_updated', 'sd_inspection', id);
    return toInspectionSummary(updated!);
  }

  async createQaInspection(
    scope: StaffScope,
    input: CreateSdQaInspectionRequest,
  ): Promise<SdQaInspectionSummary> {
    const [created] = await this.deps.db
      .insert(sdQaInspections)
      .values({
        companyId: scope.companyId,
        ...mapCreateQaInspectionInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'qa_inspection_created', 'sd_qa_inspection', created!.id);
    return toQaInspectionSummary(created!);
  }

  async listQaInspections(companyId: string): Promise<SdQaInspectionSummary[]> {
    const rows = await this.deps.db.query.sdQaInspections.findMany({
      where: eq(sdQaInspections.companyId, companyId),
      orderBy: [desc(sdQaInspections.createdAt)],
      limit: 100,
    });
    return rows.map(toQaInspectionSummary);
  }

  async getQaInspection(companyId: string, id: string): Promise<SdQaInspectionSummary | null> {
    const row = await this.deps.db.query.sdQaInspections.findFirst({
      where: and(eq(sdQaInspections.companyId, companyId), eq(sdQaInspections.id, id)),
    });
    return row ? toQaInspectionSummary(row) : null;
  }

  async updateQaInspection(
    scope: StaffScope,
    id: string,
    input: UpdateSdQaInspectionRequest,
  ): Promise<SdQaInspectionSummary> {
    await this.ensureQaInspection(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdQaInspections)
      .set({ ...mapUpdateQaInspectionInput(input), updatedAt: new Date() })
      .where(and(eq(sdQaInspections.companyId, scope.companyId), eq(sdQaInspections.id, id)))
      .returning();

    await this.recordAudit(scope, 'qa_inspection_updated', 'sd_qa_inspection', id);
    return toQaInspectionSummary(updated!);
  }

  async createDefect(scope: StaffScope, input: CreateSdDefectRequest): Promise<SdDefectSummary> {
    const [created] = await this.deps.db
      .insert(sdDefects)
      .values({
        companyId: scope.companyId,
        ...mapCreateDefectInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'defect_created', 'sd_defect', created!.id);
    return toDefectSummary(created!);
  }

  async listDefects(companyId: string): Promise<SdDefectSummary[]> {
    const rows = await this.deps.db.query.sdDefects.findMany({
      where: eq(sdDefects.companyId, companyId),
      orderBy: [desc(sdDefects.createdAt)],
      limit: 100,
    });
    return rows.map(toDefectSummary);
  }

  async getDefect(companyId: string, id: string): Promise<SdDefectSummary | null> {
    const row = await this.deps.db.query.sdDefects.findFirst({
      where: and(eq(sdDefects.companyId, companyId), eq(sdDefects.id, id)),
    });
    return row ? toDefectSummary(row) : null;
  }

  async updateDefect(
    scope: StaffScope,
    id: string,
    input: UpdateSdDefectRequest,
  ): Promise<SdDefectSummary> {
    await this.ensureDefect(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdDefects)
      .set({ ...mapUpdateDefectInput(input), updatedAt: new Date() })
      .where(and(eq(sdDefects.companyId, scope.companyId), eq(sdDefects.id, id)))
      .returning();

    await this.recordAudit(scope, 'defect_updated', 'sd_defect', id);
    return toDefectSummary(updated!);
  }

  async createNonConformance(
    scope: StaffScope,
    input: CreateSdNonConformanceRequest,
  ): Promise<SdNonConformanceSummary> {
    const [created] = await this.deps.db
      .insert(sdNonConformances)
      .values({
        companyId: scope.companyId,
        ...mapCreateNonConformanceInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'non_conformance_created', 'sd_non_conformance', created!.id);
    return toNonConformanceSummary(created!);
  }

  async listNonConformances(companyId: string): Promise<SdNonConformanceSummary[]> {
    const rows = await this.deps.db.query.sdNonConformances.findMany({
      where: eq(sdNonConformances.companyId, companyId),
      orderBy: [desc(sdNonConformances.createdAt)],
      limit: 100,
    });
    return rows.map(toNonConformanceSummary);
  }

  async getNonConformance(companyId: string, id: string): Promise<SdNonConformanceSummary | null> {
    const row = await this.deps.db.query.sdNonConformances.findFirst({
      where: and(eq(sdNonConformances.companyId, companyId), eq(sdNonConformances.id, id)),
    });
    return row ? toNonConformanceSummary(row) : null;
  }

  async updateNonConformance(
    scope: StaffScope,
    id: string,
    input: UpdateSdNonConformanceRequest,
  ): Promise<SdNonConformanceSummary> {
    await this.ensureNonConformance(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdNonConformances)
      .set({ ...mapUpdateNonConformanceInput(input), updatedAt: new Date() })
      .where(and(eq(sdNonConformances.companyId, scope.companyId), eq(sdNonConformances.id, id)))
      .returning();

    await this.recordAudit(scope, 'non_conformance_updated', 'sd_non_conformance', id);
    return toNonConformanceSummary(updated!);
  }

  async createCorrectiveAction(
    scope: StaffScope,
    input: CreateSdCorrectiveActionRequest,
  ): Promise<SdCorrectiveActionSummary> {
    const [created] = await this.deps.db
      .insert(sdCorrectiveActions)
      .values({
        companyId: scope.companyId,
        ...mapCreateCorrectiveActionInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'corrective_action_created', 'sd_corrective_action', created!.id);
    return toCorrectiveActionSummary(created!);
  }

  async listCorrectiveActions(companyId: string): Promise<SdCorrectiveActionSummary[]> {
    const rows = await this.deps.db.query.sdCorrectiveActions.findMany({
      where: eq(sdCorrectiveActions.companyId, companyId),
      orderBy: [desc(sdCorrectiveActions.createdAt)],
      limit: 100,
    });
    return rows.map(toCorrectiveActionSummary);
  }

  async getCorrectiveAction(
    companyId: string,
    id: string,
  ): Promise<SdCorrectiveActionSummary | null> {
    const row = await this.deps.db.query.sdCorrectiveActions.findFirst({
      where: and(eq(sdCorrectiveActions.companyId, companyId), eq(sdCorrectiveActions.id, id)),
    });
    return row ? toCorrectiveActionSummary(row) : null;
  }

  async updateCorrectiveAction(
    scope: StaffScope,
    id: string,
    input: UpdateSdCorrectiveActionRequest,
  ): Promise<SdCorrectiveActionSummary> {
    await this.ensureCorrectiveAction(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdCorrectiveActions)
      .set({ ...mapUpdateCorrectiveActionInput(input), updatedAt: new Date() })
      .where(
        and(eq(sdCorrectiveActions.companyId, scope.companyId), eq(sdCorrectiveActions.id, id)),
      )
      .returning();

    await this.recordAudit(scope, 'corrective_action_updated', 'sd_corrective_action', id);
    return toCorrectiveActionSummary(updated!);
  }

  async createPreventiveAction(
    scope: StaffScope,
    input: CreateSdPreventiveActionRequest,
  ): Promise<SdPreventiveActionSummary> {
    const [created] = await this.deps.db
      .insert(sdPreventiveActions)
      .values({
        companyId: scope.companyId,
        ...mapCreatePreventiveActionInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'preventive_action_created', 'sd_preventive_action', created!.id);
    return toPreventiveActionSummary(created!);
  }

  async listPreventiveActions(companyId: string): Promise<SdPreventiveActionSummary[]> {
    const rows = await this.deps.db.query.sdPreventiveActions.findMany({
      where: eq(sdPreventiveActions.companyId, companyId),
      orderBy: [desc(sdPreventiveActions.createdAt)],
      limit: 100,
    });
    return rows.map(toPreventiveActionSummary);
  }

  async getPreventiveAction(
    companyId: string,
    id: string,
  ): Promise<SdPreventiveActionSummary | null> {
    const row = await this.deps.db.query.sdPreventiveActions.findFirst({
      where: and(eq(sdPreventiveActions.companyId, companyId), eq(sdPreventiveActions.id, id)),
    });
    return row ? toPreventiveActionSummary(row) : null;
  }

  async updatePreventiveAction(
    scope: StaffScope,
    id: string,
    input: UpdateSdPreventiveActionRequest,
  ): Promise<SdPreventiveActionSummary> {
    await this.ensurePreventiveAction(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdPreventiveActions)
      .set({ ...mapUpdatePreventiveActionInput(input), updatedAt: new Date() })
      .where(
        and(eq(sdPreventiveActions.companyId, scope.companyId), eq(sdPreventiveActions.id, id)),
      )
      .returning();

    await this.recordAudit(scope, 'preventive_action_updated', 'sd_preventive_action', id);
    return toPreventiveActionSummary(updated!);
  }

  async createFirstTimeFixAnalysis(
    scope: StaffScope,
    input: CreateSdFirstTimeFixAnalysisRequest,
  ): Promise<SdFirstTimeFixAnalysisSummary> {
    const [created] = await this.deps.db
      .insert(sdFirstTimeFixAnalyses)
      .values({
        companyId: scope.companyId,
        ...mapCreateFirstTimeFixAnalysisInput(input),
      })
      .returning();

    await this.recordAudit(
      scope,
      'first_time_fix_analysis_created',
      'sd_first_time_fix_analysis',
      created!.id,
    );
    return toFirstTimeFixAnalysisSummary(created!);
  }

  async listFirstTimeFixAnalyses(companyId: string): Promise<SdFirstTimeFixAnalysisSummary[]> {
    const rows = await this.deps.db.query.sdFirstTimeFixAnalyses.findMany({
      where: eq(sdFirstTimeFixAnalyses.companyId, companyId),
      orderBy: [desc(sdFirstTimeFixAnalyses.capturedAt)],
      limit: 100,
    });
    return rows.map(toFirstTimeFixAnalysisSummary);
  }

  async getFirstTimeFixAnalysis(
    companyId: string,
    id: string,
  ): Promise<SdFirstTimeFixAnalysisSummary | null> {
    const row = await this.deps.db.query.sdFirstTimeFixAnalyses.findFirst({
      where: and(
        eq(sdFirstTimeFixAnalyses.companyId, companyId),
        eq(sdFirstTimeFixAnalyses.id, id),
      ),
    });
    return row ? toFirstTimeFixAnalysisSummary(row) : null;
  }

  async createCustomerAcceptance(
    scope: StaffScope,
    input: CreateSdCustomerAcceptanceRequest,
  ): Promise<SdCustomerAcceptanceSummary> {
    const [created] = await this.deps.db
      .insert(sdCustomerAcceptances)
      .values({
        companyId: scope.companyId,
        ...mapCreateCustomerAcceptanceInput(input),
      })
      .returning();

    await this.recordAudit(
      scope,
      'customer_acceptance_created',
      'sd_customer_acceptance',
      created!.id,
    );
    return toCustomerAcceptanceSummary(created!);
  }

  async listCustomerAcceptances(companyId: string): Promise<SdCustomerAcceptanceSummary[]> {
    const rows = await this.deps.db.query.sdCustomerAcceptances.findMany({
      where: eq(sdCustomerAcceptances.companyId, companyId),
      orderBy: [desc(sdCustomerAcceptances.createdAt)],
      limit: 100,
    });
    return rows.map(toCustomerAcceptanceSummary);
  }

  async getCustomerAcceptance(
    companyId: string,
    id: string,
  ): Promise<SdCustomerAcceptanceSummary | null> {
    const row = await this.deps.db.query.sdCustomerAcceptances.findFirst({
      where: and(eq(sdCustomerAcceptances.companyId, companyId), eq(sdCustomerAcceptances.id, id)),
    });
    return row ? toCustomerAcceptanceSummary(row) : null;
  }

  async updateCustomerAcceptance(
    scope: StaffScope,
    id: string,
    input: UpdateSdCustomerAcceptanceRequest,
  ): Promise<SdCustomerAcceptanceSummary> {
    await this.ensureCustomerAcceptance(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdCustomerAcceptances)
      .set({ ...mapUpdateCustomerAcceptanceInput(input), updatedAt: new Date() })
      .where(
        and(eq(sdCustomerAcceptances.companyId, scope.companyId), eq(sdCustomerAcceptances.id, id)),
      )
      .returning();

    await this.recordAudit(scope, 'customer_acceptance_updated', 'sd_customer_acceptance', id);
    return toCustomerAcceptanceSummary(updated!);
  }

  async createWarrantyRecord(
    scope: StaffScope,
    input: CreateSdWarrantyRecordRequest,
  ): Promise<SdWarrantyRecordSummary> {
    const [created] = await this.deps.db
      .insert(sdWarrantyRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateWarrantyRecordInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'warranty_record_created', 'sd_warranty_record', created!.id);
    return toWarrantyRecordSummary(created!);
  }

  async listWarrantyRecords(companyId: string): Promise<SdWarrantyRecordSummary[]> {
    const rows = await this.deps.db.query.sdWarrantyRecords.findMany({
      where: eq(sdWarrantyRecords.companyId, companyId),
      orderBy: [desc(sdWarrantyRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toWarrantyRecordSummary);
  }

  async getWarrantyRecord(companyId: string, id: string): Promise<SdWarrantyRecordSummary | null> {
    const row = await this.deps.db.query.sdWarrantyRecords.findFirst({
      where: and(eq(sdWarrantyRecords.companyId, companyId), eq(sdWarrantyRecords.id, id)),
    });
    return row ? toWarrantyRecordSummary(row) : null;
  }

  async updateWarrantyRecord(
    scope: StaffScope,
    id: string,
    input: UpdateSdWarrantyRecordRequest,
  ): Promise<SdWarrantyRecordSummary> {
    await this.ensureWarrantyRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdWarrantyRecords)
      .set({ ...mapUpdateWarrantyRecordInput(input), updatedAt: new Date() })
      .where(and(eq(sdWarrantyRecords.companyId, scope.companyId), eq(sdWarrantyRecords.id, id)))
      .returning();

    await this.recordAudit(scope, 'warranty_record_updated', 'sd_warranty_record', id);
    return toWarrantyRecordSummary(updated!);
  }

  async createWarrantyClaimTracking(
    scope: StaffScope,
    input: CreateSdWarrantyClaimTrackingRequest,
  ): Promise<SdWarrantyClaimTrackingSummary> {
    const [created] = await this.deps.db
      .insert(sdWarrantyClaimTrackings)
      .values({
        companyId: scope.companyId,
        ...mapCreateWarrantyClaimTrackingInput(input),
      })
      .returning();

    await this.recordAudit(
      scope,
      'warranty_claim_tracking_created',
      'sd_warranty_claim_tracking',
      created!.id,
    );
    return toWarrantyClaimTrackingSummary(created!);
  }

  async listWarrantyClaimTrackings(companyId: string): Promise<SdWarrantyClaimTrackingSummary[]> {
    const rows = await this.deps.db.query.sdWarrantyClaimTrackings.findMany({
      where: eq(sdWarrantyClaimTrackings.companyId, companyId),
      orderBy: [desc(sdWarrantyClaimTrackings.createdAt)],
      limit: 100,
    });
    return rows.map(toWarrantyClaimTrackingSummary);
  }

  async getWarrantyClaimTracking(
    companyId: string,
    id: string,
  ): Promise<SdWarrantyClaimTrackingSummary | null> {
    const row = await this.deps.db.query.sdWarrantyClaimTrackings.findFirst({
      where: and(
        eq(sdWarrantyClaimTrackings.companyId, companyId),
        eq(sdWarrantyClaimTrackings.id, id),
      ),
    });
    return row ? toWarrantyClaimTrackingSummary(row) : null;
  }

  async updateWarrantyClaimTracking(
    scope: StaffScope,
    id: string,
    input: UpdateSdWarrantyClaimTrackingRequest,
  ): Promise<SdWarrantyClaimTrackingSummary> {
    await this.ensureWarrantyClaimTracking(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdWarrantyClaimTrackings)
      .set({ ...mapUpdateWarrantyClaimTrackingInput(input), updatedAt: new Date() })
      .where(
        and(
          eq(sdWarrantyClaimTrackings.companyId, scope.companyId),
          eq(sdWarrantyClaimTrackings.id, id),
        ),
      )
      .returning();

    await this.recordAudit(
      scope,
      'warranty_claim_tracking_updated',
      'sd_warranty_claim_tracking',
      id,
    );
    return toWarrantyClaimTrackingSummary(updated!);
  }

  async createCallbackRecord(
    scope: StaffScope,
    input: CreateSdCallbackRecordRequest,
  ): Promise<SdCallbackRecordSummary> {
    const [created] = await this.deps.db
      .insert(sdCallbackRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateCallbackRecordInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'callback_record_created', 'sd_callback_record', created!.id);
    return toCallbackRecordSummary(created!);
  }

  async listCallbackRecords(companyId: string): Promise<SdCallbackRecordSummary[]> {
    const rows = await this.deps.db.query.sdCallbackRecords.findMany({
      where: eq(sdCallbackRecords.companyId, companyId),
      orderBy: [desc(sdCallbackRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toCallbackRecordSummary);
  }

  async getCallbackRecord(companyId: string, id: string): Promise<SdCallbackRecordSummary | null> {
    const row = await this.deps.db.query.sdCallbackRecords.findFirst({
      where: and(eq(sdCallbackRecords.companyId, companyId), eq(sdCallbackRecords.id, id)),
    });
    return row ? toCallbackRecordSummary(row) : null;
  }

  async updateCallbackRecord(
    scope: StaffScope,
    id: string,
    input: UpdateSdCallbackRecordRequest,
  ): Promise<SdCallbackRecordSummary> {
    await this.ensureCallbackRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdCallbackRecords)
      .set({ ...mapUpdateCallbackRecordInput(input), updatedAt: new Date() })
      .where(and(eq(sdCallbackRecords.companyId, scope.companyId), eq(sdCallbackRecords.id, id)))
      .returning();

    await this.recordAudit(scope, 'callback_record_updated', 'sd_callback_record', id);
    return toCallbackRecordSummary(updated!);
  }

  async createContinuousImprovementInitiative(
    scope: StaffScope,
    input: CreateSdContinuousImprovementInitiativeRequest,
  ): Promise<SdContinuousImprovementInitiativeSummary> {
    const [created] = await this.deps.db
      .insert(sdContinuousImprovementInitiatives)
      .values({
        companyId: scope.companyId,
        ...mapCreateContinuousImprovementInitiativeInput(input, scope),
      })
      .returning();

    await this.recordAudit(
      scope,
      'continuous_improvement_initiative_created',
      'sd_continuous_improvement_initiative',
      created!.id,
    );
    return toContinuousImprovementInitiativeSummary(created!);
  }

  async listContinuousImprovementInitiatives(
    companyId: string,
  ): Promise<SdContinuousImprovementInitiativeSummary[]> {
    const rows = await this.deps.db.query.sdContinuousImprovementInitiatives.findMany({
      where: eq(sdContinuousImprovementInitiatives.companyId, companyId),
      orderBy: [desc(sdContinuousImprovementInitiatives.createdAt)],
      limit: 100,
    });
    return rows.map(toContinuousImprovementInitiativeSummary);
  }

  async getContinuousImprovementInitiative(
    companyId: string,
    id: string,
  ): Promise<SdContinuousImprovementInitiativeSummary | null> {
    const row = await this.deps.db.query.sdContinuousImprovementInitiatives.findFirst({
      where: and(
        eq(sdContinuousImprovementInitiatives.companyId, companyId),
        eq(sdContinuousImprovementInitiatives.id, id),
      ),
    });
    return row ? toContinuousImprovementInitiativeSummary(row) : null;
  }

  async updateContinuousImprovementInitiative(
    scope: StaffScope,
    id: string,
    input: UpdateSdContinuousImprovementInitiativeRequest,
  ): Promise<SdContinuousImprovementInitiativeSummary> {
    await this.ensureContinuousImprovementInitiative(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdContinuousImprovementInitiatives)
      .set({ ...mapUpdateContinuousImprovementInitiativeInput(input), updatedAt: new Date() })
      .where(
        and(
          eq(sdContinuousImprovementInitiatives.companyId, scope.companyId),
          eq(sdContinuousImprovementInitiatives.id, id),
        ),
      )
      .returning();

    await this.recordAudit(
      scope,
      'continuous_improvement_initiative_updated',
      'sd_continuous_improvement_initiative',
      id,
    );
    return toContinuousImprovementInitiativeSummary(updated!);
  }

  async createHandoverRecord(
    scope: StaffScope,
    input: CreateSdHandoverRecordRequest,
  ): Promise<SdHandoverRecordSummary> {
    const [created] = await this.deps.db
      .insert(sdHandoverRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateHandoverRecordInput(input, scope),
      })
      .returning();

    await this.recordAudit(scope, 'handover_record_created', 'sd_handover_record', created!.id);
    return toHandoverRecordSummary(created!);
  }

  async listHandoverRecords(companyId: string): Promise<SdHandoverRecordSummary[]> {
    const rows = await this.deps.db.query.sdHandoverRecords.findMany({
      where: eq(sdHandoverRecords.companyId, companyId),
      orderBy: [desc(sdHandoverRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toHandoverRecordSummary);
  }

  async getHandoverRecord(companyId: string, id: string): Promise<SdHandoverRecordSummary | null> {
    const row = await this.deps.db.query.sdHandoverRecords.findFirst({
      where: and(eq(sdHandoverRecords.companyId, companyId), eq(sdHandoverRecords.id, id)),
    });
    return row ? toHandoverRecordSummary(row) : null;
  }

  async updateHandoverRecord(
    scope: StaffScope,
    id: string,
    input: UpdateSdHandoverRecordRequest,
  ): Promise<SdHandoverRecordSummary> {
    await this.ensureHandoverRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdHandoverRecords)
      .set({ ...mapUpdateHandoverRecordInput(input), updatedAt: new Date() })
      .where(and(eq(sdHandoverRecords.companyId, scope.companyId), eq(sdHandoverRecords.id, id)))
      .returning();

    await this.recordAudit(scope, 'handover_record_updated', 'sd_handover_record', id);
    return toHandoverRecordSummary(updated!);
  }

  async createVariationRecord(
    scope: StaffScope,
    input: CreateSdVariationRecordRequest,
  ): Promise<SdVariationRecordSummary> {
    const [created] = await this.deps.db
      .insert(sdVariationRecords)
      .values({
        companyId: scope.companyId,
        ...mapCreateVariationRecordInput(input),
      })
      .returning();

    await this.recordAudit(scope, 'variation_record_created', 'sd_variation_record', created!.id);
    return toVariationRecordSummary(created!);
  }

  async listVariationRecords(companyId: string): Promise<SdVariationRecordSummary[]> {
    const rows = await this.deps.db.query.sdVariationRecords.findMany({
      where: eq(sdVariationRecords.companyId, companyId),
      orderBy: [desc(sdVariationRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toVariationRecordSummary);
  }

  async getVariationRecord(
    companyId: string,
    id: string,
  ): Promise<SdVariationRecordSummary | null> {
    const row = await this.deps.db.query.sdVariationRecords.findFirst({
      where: and(eq(sdVariationRecords.companyId, companyId), eq(sdVariationRecords.id, id)),
    });
    return row ? toVariationRecordSummary(row) : null;
  }

  async updateVariationRecord(
    scope: StaffScope,
    id: string,
    input: UpdateSdVariationRecordRequest,
  ): Promise<SdVariationRecordSummary> {
    await this.ensureVariationRecord(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdVariationRecords)
      .set({ ...mapUpdateVariationRecordInput(input), updatedAt: new Date() })
      .where(and(eq(sdVariationRecords.companyId, scope.companyId), eq(sdVariationRecords.id, id)))
      .returning();

    await this.recordAudit(scope, 'variation_record_updated', 'sd_variation_record', id);
    return toVariationRecordSummary(updated!);
  }

  async createCompletionCertificate(
    scope: StaffScope,
    input: CreateSdCompletionCertificateRequest,
  ): Promise<SdCompletionCertificateSummary> {
    const [created] = await this.deps.db
      .insert(sdCompletionCertificates)
      .values({
        companyId: scope.companyId,
        ...mapCreateCompletionCertificateInput(input, scope),
      })
      .returning();

    await this.recordAudit(
      scope,
      'completion_certificate_created',
      'sd_completion_certificate',
      created!.id,
    );
    return toCompletionCertificateSummary(created!);
  }

  async listCompletionCertificates(companyId: string): Promise<SdCompletionCertificateSummary[]> {
    const rows = await this.deps.db.query.sdCompletionCertificates.findMany({
      where: eq(sdCompletionCertificates.companyId, companyId),
      orderBy: [desc(sdCompletionCertificates.createdAt)],
      limit: 100,
    });
    return rows.map(toCompletionCertificateSummary);
  }

  async getCompletionCertificate(
    companyId: string,
    id: string,
  ): Promise<SdCompletionCertificateSummary | null> {
    const row = await this.deps.db.query.sdCompletionCertificates.findFirst({
      where: and(
        eq(sdCompletionCertificates.companyId, companyId),
        eq(sdCompletionCertificates.id, id),
      ),
    });
    return row ? toCompletionCertificateSummary(row) : null;
  }

  async updateCompletionCertificate(
    scope: StaffScope,
    id: string,
    input: UpdateSdCompletionCertificateRequest,
  ): Promise<SdCompletionCertificateSummary> {
    await this.ensureCompletionCertificate(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(sdCompletionCertificates)
      .set({ ...mapUpdateCompletionCertificateInput(input), updatedAt: new Date() })
      .where(
        and(
          eq(sdCompletionCertificates.companyId, scope.companyId),
          eq(sdCompletionCertificates.id, id),
        ),
      )
      .returning();

    await this.recordAudit(
      scope,
      'completion_certificate_updated',
      'sd_completion_certificate',
      id,
    );
    return toCompletionCertificateSummary(updated!);
  }

  async submitInspection(scope: StaffScope, inspectionId: string): Promise<SdInspectionSummary> {
    const inspection = await this.ensureInspection(scope.companyId, inspectionId);
    if (inspection.inspectionStatus !== 'draft' && inspection.inspectionStatus !== 'in_progress') {
      throw new EnterpriseServiceDeliveryError(
        'VALIDATION_ERROR',
        'Inspection must be draft or in progress to submit',
      );
    }
    const [updated] = await this.deps.db
      .update(sdInspections)
      .set({ inspectionStatus: 'review', updatedAt: new Date() })
      .where(eq(sdInspections.id, inspectionId))
      .returning();
    await this.recordAudit(scope, 'inspection_submitted', 'sd_inspection', inspectionId);
    return toInspectionSummary(updated!);
  }

  async approveInspection(scope: StaffScope, inspectionId: string): Promise<SdInspectionSummary> {
    const inspection = await this.ensureInspection(scope.companyId, inspectionId);
    if (inspection.inspectionStatus !== 'review') {
      throw new EnterpriseServiceDeliveryError(
        'VALIDATION_ERROR',
        'Inspection must be in review to approve',
      );
    }
    const [updated] = await this.deps.db
      .update(sdInspections)
      .set({ inspectionStatus: 'approved', updatedAt: new Date() })
      .where(eq(sdInspections.id, inspectionId))
      .returning();
    await this.recordAudit(scope, 'inspection_approved', 'sd_inspection', inspectionId);
    return toInspectionSummary(updated!);
  }

  async completeInspection(scope: StaffScope, inspectionId: string): Promise<SdInspectionSummary> {
    const inspection = await this.ensureInspection(scope.companyId, inspectionId);
    if (inspection.inspectionStatus !== 'approved') {
      throw new EnterpriseServiceDeliveryError(
        'VALIDATION_ERROR',
        'Inspection must be approved to complete',
      );
    }
    const [updated] = await this.deps.db
      .update(sdInspections)
      .set({ inspectionStatus: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(sdInspections.id, inspectionId))
      .returning();
    await this.recordAudit(scope, 'inspection_completed', 'sd_inspection', inspectionId);
    return toInspectionSummary(updated!);
  }

  async approveCorrectiveAction(
    scope: StaffScope,
    actionId: string,
  ): Promise<SdCorrectiveActionSummary> {
    const action = await this.ensureCorrectiveAction(scope.companyId, actionId);
    if (action.workflowStatus !== 'pending_approval') {
      throw new EnterpriseServiceDeliveryError(
        'VALIDATION_ERROR',
        'Corrective action must be pending approval',
      );
    }
    const [updated] = await this.deps.db
      .update(sdCorrectiveActions)
      .set({ workflowStatus: 'approved', updatedAt: new Date() })
      .where(eq(sdCorrectiveActions.id, actionId))
      .returning();
    await this.recordAudit(scope, 'corrective_action_approved', 'sd_corrective_action', actionId);
    return toCorrectiveActionSummary(updated!);
  }

  async listServiceAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<SdServiceAlertSummary[]> {
    const rows = await this.deps.db.query.sdServiceAlerts.findMany({
      where: filters?.status
        ? and(
            eq(sdServiceAlerts.companyId, companyId),
            eq(sdServiceAlerts.status, filters.status as 'open'),
          )
        : eq(sdServiceAlerts.companyId, companyId),
      orderBy: [desc(sdServiceAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toServiceAlertSummary);
  }

  async syncServiceAlerts(scope: StaffScope): Promise<SdServiceAlertSummary[]> {
    const monitoring = await this.getServiceMonitoring(scope.companyId);
    const existingOpen = await this.listServiceAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();

    const alertDefinitions = [
      {
        alertType: 'sla_breach',
        severity: 'critical',
        title: 'SLA breaches',
        description: `${monitoring.slaBreachCount} SLA breach(es) detected.`,
        active: monitoring.slaBreachCount > 0,
      },
      {
        alertType: 'overdue_inspection',
        severity: 'warning',
        title: 'Overdue inspections',
        description: `${monitoring.overdueInspectionCount} overdue inspection(s).`,
        active: monitoring.overdueInspectionCount > 0,
      },
      {
        alertType: 'open_callback',
        severity: 'warning',
        title: 'Open callbacks',
        description: `${monitoring.openCallbackCount} open callback(s).`,
        active: monitoring.openCallbackCount > 0,
      },
      {
        alertType: 'promise_breach',
        severity: 'critical',
        title: 'Breached service promises',
        description: `${monitoring.promiseBreachCount} breached service promise(s).`,
        active: monitoring.promiseBreachCount > 0,
      },
      {
        alertType: 'open_defect',
        severity: 'warning',
        title: 'Open defects',
        description: `${monitoring.openDefectCount} open defect(s).`,
        active: monitoring.openDefectCount > 0,
      },
      {
        alertType: 'pending_corrective_action',
        severity: 'warning',
        title: 'Pending corrective actions',
        description: `${monitoring.pendingCorrectiveActionCount} pending corrective action(s).`,
        active: monitoring.pendingCorrectiveActionCount > 0,
      },
    ] as const;

    for (const definition of alertDefinitions) {
      const existing = existingOpen.find((row) => row.alertType === definition.alertType);
      if (definition.active && !existing) {
        await this.deps.db.insert(sdServiceAlerts).values({
          companyId: scope.companyId,
          alertType: definition.alertType,
          severity: definition.severity,
          status: 'open',
          title: definition.title,
          description: definition.description,
          sourceModule: 'service_delivery',
          context: { syncedAt: syncedAt.toISOString(), monitoring },
        });
      } else if (!definition.active && existing) {
        await this.deps.db
          .update(sdServiceAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(sdServiceAlerts.id, existing.id));
      }
    }

    await this.recordAudit(scope, 'service_alerts_synced');
    return this.listServiceAlerts(scope.companyId, { status: 'open' });
  }

  async createServiceActionDraft(
    scope: StaffScope,
    input: CreateSdServiceActionDraftRequest,
  ): Promise<{ id: string; title: string; draftType: string; workflowStatus: string }> {
    const [created] = await this.deps.db
      .insert(sdServiceActionDrafts)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        workflowStatus: 'draft',
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        requiresHumanReview: true,
      })
      .returning();

    await this.recordAudit(scope, 'service_draft_created', 'sd_service_action_draft', created!.id);
    return {
      id: created!.id,
      title: created!.title,
      draftType: created!.draftType,
      workflowStatus: created!.workflowStatus,
    };
  }

  async captureAnalytics(scope: StaffScope): Promise<SdAnalyticsSummary> {
    const [dashboard, monitoring, financeStats] = await Promise.all([
      this.getDashboard(scope.companyId),
      this.getServiceMonitoring(scope.companyId),
      this.deps.financeService.getStats(scope.companyId),
    ]);

    const ftfr = dashboard.qualityStats.firstTimeFixRatePercent;

    const [created] = await this.deps.db
      .insert(sdAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        activeJobCount: dashboard.jobStats.activeCount,
        completedJobCount: dashboard.jobStats.totalCount - dashboard.jobStats.activeCount,
        openPromiseCount: dashboard.openPromiseCount,
        slaBreachCount: monitoring.slaBreachCount,
        openDefectCount: monitoring.openDefectCount,
        openCallbackCount: monitoring.openCallbackCount,
        firstTimeFixRatePercent: ftfr != null ? String(ftfr) : null,
        openAlertCount: dashboard.openAlertCount,
        currency: financeStats.currency,
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured', undefined, undefined, { monitoring });
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<SdAnalyticsSummary | null> {
    const row = await this.deps.db.query.sdAnalyticsSnapshots.findFirst({
      where: eq(sdAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(sdAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseServiceDeliveryAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      activeJobCount: dashboard.jobStats.activeCount,
      slaBreachCount: dashboard.slaBreachCount,
      openCallbackCount: dashboard.openCallbackCount,
      openDefectCount: dashboard.openDefectCount,
      firstTimeFixRatePercent:
        dashboard.qualityStats.firstTimeFixRatePercent != null
          ? String(dashboard.qualityStats.firstTimeFixRatePercent)
          : null,
      openAlertCount: dashboard.openAlertCount,
      summary: dashboard.summary,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.sdPlatformConfig.findFirst({
      where: eq(sdPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(sdPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureServicePromise(companyId: string, id: string) {
    const row = await this.deps.db.query.sdServicePromises.findFirst({
      where: and(eq(sdServicePromises.companyId, companyId), eq(sdServicePromises.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'ServicePromise not found');
    return row;
  }

  private async ensureSlaFramework(companyId: string, id: string) {
    const row = await this.deps.db.query.sdSlaFrameworks.findFirst({
      where: and(eq(sdSlaFrameworks.companyId, companyId), eq(sdSlaFrameworks.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'SlaFramework not found');
    return row;
  }

  private async ensureSlaRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.sdSlaRecords.findFirst({
      where: and(eq(sdSlaRecords.companyId, companyId), eq(sdSlaRecords.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'SlaRecord not found');
    return row;
  }

  private async ensureInspectionTemplate(companyId: string, id: string) {
    const row = await this.deps.db.query.sdInspectionTemplates.findFirst({
      where: and(eq(sdInspectionTemplates.companyId, companyId), eq(sdInspectionTemplates.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'InspectionTemplate not found');
    return row;
  }

  private async ensureInspection(companyId: string, id: string) {
    const row = await this.deps.db.query.sdInspections.findFirst({
      where: and(eq(sdInspections.companyId, companyId), eq(sdInspections.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'Inspection not found');
    return row;
  }

  private async ensureQaInspection(companyId: string, id: string) {
    const row = await this.deps.db.query.sdQaInspections.findFirst({
      where: and(eq(sdQaInspections.companyId, companyId), eq(sdQaInspections.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'QaInspection not found');
    return row;
  }

  private async ensureDefect(companyId: string, id: string) {
    const row = await this.deps.db.query.sdDefects.findFirst({
      where: and(eq(sdDefects.companyId, companyId), eq(sdDefects.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'Defect not found');
    return row;
  }

  private async ensureNonConformance(companyId: string, id: string) {
    const row = await this.deps.db.query.sdNonConformances.findFirst({
      where: and(eq(sdNonConformances.companyId, companyId), eq(sdNonConformances.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'NonConformance not found');
    return row;
  }

  private async ensureCorrectiveAction(companyId: string, id: string) {
    const row = await this.deps.db.query.sdCorrectiveActions.findFirst({
      where: and(eq(sdCorrectiveActions.companyId, companyId), eq(sdCorrectiveActions.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'CorrectiveAction not found');
    return row;
  }

  private async ensurePreventiveAction(companyId: string, id: string) {
    const row = await this.deps.db.query.sdPreventiveActions.findFirst({
      where: and(eq(sdPreventiveActions.companyId, companyId), eq(sdPreventiveActions.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'PreventiveAction not found');
    return row;
  }

  private async ensureCustomerAcceptance(companyId: string, id: string) {
    const row = await this.deps.db.query.sdCustomerAcceptances.findFirst({
      where: and(eq(sdCustomerAcceptances.companyId, companyId), eq(sdCustomerAcceptances.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'CustomerAcceptance not found');
    return row;
  }

  private async ensureWarrantyRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.sdWarrantyRecords.findFirst({
      where: and(eq(sdWarrantyRecords.companyId, companyId), eq(sdWarrantyRecords.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'WarrantyRecord not found');
    return row;
  }

  private async ensureWarrantyClaimTracking(companyId: string, id: string) {
    const row = await this.deps.db.query.sdWarrantyClaimTrackings.findFirst({
      where: and(
        eq(sdWarrantyClaimTrackings.companyId, companyId),
        eq(sdWarrantyClaimTrackings.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'WarrantyClaimTracking not found');
    return row;
  }

  private async ensureCallbackRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.sdCallbackRecords.findFirst({
      where: and(eq(sdCallbackRecords.companyId, companyId), eq(sdCallbackRecords.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'CallbackRecord not found');
    return row;
  }

  private async ensureContinuousImprovementInitiative(companyId: string, id: string) {
    const row = await this.deps.db.query.sdContinuousImprovementInitiatives.findFirst({
      where: and(
        eq(sdContinuousImprovementInitiatives.companyId, companyId),
        eq(sdContinuousImprovementInitiatives.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseServiceDeliveryError(
        'NOT_FOUND',
        'ContinuousImprovementInitiative not found',
      );
    return row;
  }

  private async ensureHandoverRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.sdHandoverRecords.findFirst({
      where: and(eq(sdHandoverRecords.companyId, companyId), eq(sdHandoverRecords.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'HandoverRecord not found');
    return row;
  }

  private async ensureVariationRecord(companyId: string, id: string) {
    const row = await this.deps.db.query.sdVariationRecords.findFirst({
      where: and(eq(sdVariationRecords.companyId, companyId), eq(sdVariationRecords.id, id)),
    });
    if (!row) throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'VariationRecord not found');
    return row;
  }

  private async ensureCompletionCertificate(companyId: string, id: string) {
    const row = await this.deps.db.query.sdCompletionCertificates.findFirst({
      where: and(
        eq(sdCompletionCertificates.companyId, companyId),
        eq(sdCompletionCertificates.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseServiceDeliveryError('NOT_FOUND', 'CompletionCertificate not found');
    return row;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(sdAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}
function toPlatformConfigSummary(
  row: typeof sdPlatformConfig.$inferSelect,
): SdPlatformConfigSummary {
  return {
    serviceStandards: row.serviceStandards,
    promiseTemplates: row.promiseTemplates,
    slaTemplates: row.slaTemplates,
    inspectionTemplates: row.inspectionTemplates,
    qualityStandards: row.qualityStandards,
    warrantyStandards: row.warrantyStandards,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toServiceAlertSummary(row: typeof sdServiceAlerts.$inferSelect): SdServiceAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    jobId: row.jobId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof sdAnalyticsSnapshots.$inferSelect): SdAnalyticsSummary {
  return {
    activeJobCount: row.activeJobCount,
    completedJobCount: row.completedJobCount,
    openPromiseCount: row.openPromiseCount,
    slaBreachCount: row.slaBreachCount,
    openDefectCount: row.openDefectCount,
    openCallbackCount: row.openCallbackCount,
    firstTimeFixRatePercent:
      row.firstTimeFixRatePercent != null ? String(row.firstTimeFixRatePercent) : null,
    openAlertCount: row.openAlertCount,
    currency: row.currency,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toServicePromiseSummary(
  row: typeof sdServicePromises.$inferSelect,
): SdServicePromiseSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    promiseType: row.promiseType,
    title: row.title,
    description: row.description,
    workflowStatus: row.workflowStatus,
    promisedAt: row.promisedAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    ownerUserId: row.ownerUserId,
  };
}
function toSlaFrameworkSummary(row: typeof sdSlaFrameworks.$inferSelect): SdSlaFrameworkSummary {
  return {
    id: row.id,
    name: row.name,
    frameworkKey: row.frameworkKey,
    slaType: row.slaType,
    targetMinutes: row.targetMinutes,
    warningThresholdMinutes: row.warningThresholdMinutes,
    isActive: row.isActive,
  };
}
function toSlaRecordSummary(row: typeof sdSlaRecords.$inferSelect): SdSlaRecordSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    frameworkId: row.frameworkId,
    slaType: row.slaType,
    targetAt: row.targetAt?.toISOString() ?? null,
    breachedAt: row.breachedAt?.toISOString() ?? null,
    metAt: row.metAt?.toISOString() ?? null,
    breachMinutes: row.breachMinutes,
  };
}
function toInspectionTemplateSummary(
  row: typeof sdInspectionTemplates.$inferSelect,
): SdInspectionTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    templateKey: row.templateKey,
    description: row.description,
    isActive: row.isActive,
  };
}
function toInspectionSummary(row: typeof sdInspections.$inferSelect): SdInspectionSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    templateId: row.templateId,
    inspectionStatus: row.inspectionStatus,
    inspectorUserId: row.inspectorUserId,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
function toQaInspectionSummary(row: typeof sdQaInspections.$inferSelect): SdQaInspectionSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    inspectionId: row.inspectionId,
    qaScore: row.qaScore != null ? String(row.qaScore) : null,
    workflowStatus: row.workflowStatus,
    reviewerUserId: row.reviewerUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
function toDefectSummary(row: typeof sdDefects.$inferSelect): SdDefectSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    inspectionId: row.inspectionId,
    defectType: row.defectType,
    severity: row.severity,
    description: row.description,
    workflowStatus: row.workflowStatus,
    reportedByUserId: row.reportedByUserId,
  };
}
function toNonConformanceSummary(
  row: typeof sdNonConformances.$inferSelect,
): SdNonConformanceSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    defectId: row.defectId,
    ncNumber: row.ncNumber,
    title: row.title,
    description: row.description,
    workflowStatus: row.workflowStatus,
    ownerUserId: row.ownerUserId,
  };
}
function toCorrectiveActionSummary(
  row: typeof sdCorrectiveActions.$inferSelect,
): SdCorrectiveActionSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    nonConformanceId: row.nonConformanceId,
    title: row.title,
    actionType: row.actionType,
    workflowStatus: row.workflowStatus,
    assignedUserId: row.assignedUserId,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
function toPreventiveActionSummary(
  row: typeof sdPreventiveActions.$inferSelect,
): SdPreventiveActionSummary {
  return {
    id: row.id,
    correctiveActionId: row.correctiveActionId,
    title: row.title,
    workflowStatus: row.workflowStatus,
    assignedUserId: row.assignedUserId,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
function toFirstTimeFixAnalysisSummary(
  row: typeof sdFirstTimeFixAnalyses.$inferSelect,
): SdFirstTimeFixAnalysisSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    technicianUserId: row.technicianUserId,
    fixedFirstTime: row.fixedFirstTime,
    rootCause: row.rootCause,
    capturedAt: row.capturedAt.toISOString(),
  };
}
function toCustomerAcceptanceSummary(
  row: typeof sdCustomerAcceptances.$inferSelect,
): SdCustomerAcceptanceSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    workflowStatus: row.workflowStatus,
    signatureRef: row.signatureRef,
    notes: row.notes,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}
function toWarrantyRecordSummary(
  row: typeof sdWarrantyRecords.$inferSelect,
): SdWarrantyRecordSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    warrantyType: row.warrantyType,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}
function toWarrantyClaimTrackingSummary(
  row: typeof sdWarrantyClaimTrackings.$inferSelect,
): SdWarrantyClaimTrackingSummary {
  return {
    id: row.id,
    warrantyRecordId: row.warrantyRecordId,
    jobId: row.jobId,
    claimNumber: row.claimNumber,
    workflowStatus: row.workflowStatus,
    description: row.description,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
function toCallbackRecordSummary(
  row: typeof sdCallbackRecords.$inferSelect,
): SdCallbackRecordSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    originalJobId: row.originalJobId,
    callbackReason: row.callbackReason,
    workflowStatus: row.workflowStatus,
    assignedUserId: row.assignedUserId,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
function toContinuousImprovementInitiativeSummary(
  row: typeof sdContinuousImprovementInitiatives.$inferSelect,
): SdContinuousImprovementInitiativeSummary {
  return {
    id: row.id,
    title: row.title,
    initiativeKey: row.initiativeKey,
    workflowStatus: row.workflowStatus,
    ownerUserId: row.ownerUserId,
    targetDate: row.targetDate,
  };
}
function toHandoverRecordSummary(
  row: typeof sdHandoverRecords.$inferSelect,
): SdHandoverRecordSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    handoverType: row.handoverType,
    workflowStatus: row.workflowStatus,
    handedOverByUserId: row.handedOverByUserId,
    receivedByUserId: row.receivedByUserId,
    handoverAt: row.handoverAt?.toISOString() ?? null,
  };
}
function toVariationRecordSummary(
  row: typeof sdVariationRecords.$inferSelect,
): SdVariationRecordSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    variationType: row.variationType,
    description: row.description,
    workflowStatus: row.workflowStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}
function toCompletionCertificateSummary(
  row: typeof sdCompletionCertificates.$inferSelect,
): SdCompletionCertificateSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    certificateNumber: row.certificateNumber,
    workflowStatus: row.workflowStatus,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    issuedByUserId: row.issuedByUserId,
  };
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapCreateServicePromiseInput(input: CreateSdServicePromiseRequest, scope: StaffScope) {
  return {
    jobId: input.jobId ?? null,
    promiseType: input.promiseType as typeof sdServicePromises.$inferInsert.promiseType,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    ownerUserId: scope.userId,
    promisedAt: parseOptionalDate(input.promisedAt),
    dueAt: parseOptionalDate(input.dueAt),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateServicePromiseInput(input: UpdateSdServicePromiseRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.promiseType !== undefined
      ? { promiseType: input.promiseType as typeof sdServicePromises.$inferInsert.promiseType }
      : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
    ...(input.promisedAt !== undefined ? { promisedAt: parseOptionalDate(input.promisedAt) } : {}),
    ...(input.dueAt !== undefined ? { dueAt: parseOptionalDate(input.dueAt) } : {}),
    ...(input.fulfilledAt !== undefined
      ? { fulfilledAt: parseOptionalDate(input.fulfilledAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdServicePromises.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateSlaFrameworkInput(input: CreateSdSlaFrameworkRequest) {
  return {
    name: input.name.trim(),
    frameworkKey: input.frameworkKey.trim(),
    slaType: input.slaType as typeof sdSlaFrameworks.$inferInsert.slaType,
    targetMinutes: input.targetMinutes ?? null,
    warningThresholdMinutes: input.warningThresholdMinutes ?? null,
    config: input.config ?? {},
  };
}

function mapUpdateSlaFrameworkInput(input: UpdateSdSlaFrameworkRequest) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.frameworkKey !== undefined ? { frameworkKey: input.frameworkKey.trim() } : {}),
    ...(input.slaType !== undefined
      ? { slaType: input.slaType as typeof sdSlaFrameworks.$inferInsert.slaType }
      : {}),
    ...(input.targetMinutes !== undefined ? { targetMinutes: input.targetMinutes ?? null } : {}),
    ...(input.warningThresholdMinutes !== undefined
      ? { warningThresholdMinutes: input.warningThresholdMinutes ?? null }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateSlaRecordInput(input: CreateSdSlaRecordRequest) {
  return {
    jobId: input.jobId ?? null,
    frameworkId: input.frameworkId ?? null,
    slaType: input.slaType as typeof sdSlaRecords.$inferInsert.slaType,
    targetAt: parseOptionalDate(input.targetAt),
    config: input.config ?? {},
  };
}

function mapUpdateSlaRecordInput(input: UpdateSdSlaRecordRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.frameworkId !== undefined ? { frameworkId: input.frameworkId ?? null } : {}),
    ...(input.slaType !== undefined
      ? { slaType: input.slaType as typeof sdSlaRecords.$inferInsert.slaType }
      : {}),
    ...(input.targetAt !== undefined ? { targetAt: parseOptionalDate(input.targetAt) } : {}),
    ...(input.breachedAt !== undefined ? { breachedAt: parseOptionalDate(input.breachedAt) } : {}),
    ...(input.metAt !== undefined ? { metAt: parseOptionalDate(input.metAt) } : {}),
    ...(input.breachMinutes !== undefined ? { breachMinutes: input.breachMinutes ?? null } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateInspectionTemplateInput(input: CreateSdInspectionTemplateRequest) {
  return {
    name: input.name.trim(),
    templateKey: input.templateKey.trim(),
    description: input.description?.trim() ?? null,
    checklist: input.checklist ?? {},
    config: input.config ?? {},
  };
}

function mapUpdateInspectionTemplateInput(input: UpdateSdInspectionTemplateRequest) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.templateKey !== undefined ? { templateKey: input.templateKey.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
    ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateInspectionInput(input: CreateSdInspectionRequest, scope: StaffScope) {
  return {
    jobId: input.jobId ?? null,
    templateId: input.templateId ?? null,
    inspectorUserId: scope.userId,
    findings: input.findings ?? {},
    config: input.config ?? {},
    inspectionStatus: 'draft' as const,
  };
}

function mapUpdateInspectionInput(input: UpdateSdInspectionRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.templateId !== undefined ? { templateId: input.templateId ?? null } : {}),
    ...(input.findings !== undefined ? { findings: input.findings } : {}),
    ...(input.inspectionStatus !== undefined
      ? {
          inspectionStatus:
            input.inspectionStatus as typeof sdInspections.$inferInsert.inspectionStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateQaInspectionInput(input: CreateSdQaInspectionRequest, scope: StaffScope) {
  return {
    jobId: input.jobId ?? null,
    inspectionId: input.inspectionId ?? null,
    qaScore: input.qaScore != null ? String(input.qaScore) : null,
    reviewerUserId: scope.userId,
    notes: input.notes?.trim() ?? null,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateQaInspectionInput(input: UpdateSdQaInspectionRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.inspectionId !== undefined ? { inspectionId: input.inspectionId ?? null } : {}),
    ...(input.qaScore !== undefined
      ? { qaScore: input.qaScore != null ? String(input.qaScore) : null }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdQaInspections.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateDefectInput(input: CreateSdDefectRequest, scope: StaffScope) {
  return {
    jobId: input.jobId ?? null,
    inspectionId: input.inspectionId ?? null,
    defectType: input.defectType.trim(),
    severity: (input.severity ?? 'warning') as typeof sdDefects.$inferInsert.severity,
    description: input.description.trim(),
    reportedByUserId: scope.userId,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateDefectInput(input: UpdateSdDefectRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.inspectionId !== undefined ? { inspectionId: input.inspectionId ?? null } : {}),
    ...(input.defectType !== undefined ? { defectType: input.defectType.trim() } : {}),
    ...(input.severity !== undefined
      ? { severity: input.severity as typeof sdDefects.$inferInsert.severity }
      : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.workflowStatus !== undefined
      ? { workflowStatus: input.workflowStatus as typeof sdDefects.$inferInsert.workflowStatus }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateNonConformanceInput(input: CreateSdNonConformanceRequest, scope: StaffScope) {
  return {
    jobId: input.jobId ?? null,
    defectId: input.defectId ?? null,
    ncNumber: input.ncNumber?.trim() ?? null,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    ownerUserId: scope.userId,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateNonConformanceInput(input: UpdateSdNonConformanceRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.defectId !== undefined ? { defectId: input.defectId ?? null } : {}),
    ...(input.ncNumber !== undefined ? { ncNumber: input.ncNumber?.trim() ?? null } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdNonConformances.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateCorrectiveActionInput(input: CreateSdCorrectiveActionRequest) {
  return {
    jobId: input.jobId ?? null,
    nonConformanceId: input.nonConformanceId ?? null,
    title: input.title.trim(),
    actionType: input.actionType.trim(),
    assignedUserId: input.assignedUserId ?? null,
    dueAt: parseOptionalDate(input.dueAt),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateCorrectiveActionInput(input: UpdateSdCorrectiveActionRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.nonConformanceId !== undefined
      ? { nonConformanceId: input.nonConformanceId ?? null }
      : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.actionType !== undefined ? { actionType: input.actionType.trim() } : {}),
    ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId ?? null } : {}),
    ...(input.dueAt !== undefined ? { dueAt: parseOptionalDate(input.dueAt) } : {}),
    ...(input.completedAt !== undefined
      ? { completedAt: parseOptionalDate(input.completedAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdCorrectiveActions.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreatePreventiveActionInput(input: CreateSdPreventiveActionRequest) {
  return {
    correctiveActionId: input.correctiveActionId ?? null,
    title: input.title.trim(),
    assignedUserId: input.assignedUserId ?? null,
    dueAt: parseOptionalDate(input.dueAt),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdatePreventiveActionInput(input: UpdateSdPreventiveActionRequest) {
  return {
    ...(input.correctiveActionId !== undefined
      ? { correctiveActionId: input.correctiveActionId ?? null }
      : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId ?? null } : {}),
    ...(input.dueAt !== undefined ? { dueAt: parseOptionalDate(input.dueAt) } : {}),
    ...(input.completedAt !== undefined
      ? { completedAt: parseOptionalDate(input.completedAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdPreventiveActions.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateFirstTimeFixAnalysisInput(input: CreateSdFirstTimeFixAnalysisRequest) {
  return {
    jobId: input.jobId,
    technicianUserId: input.technicianUserId ?? null,
    fixedFirstTime: input.fixedFirstTime ?? true,
    rootCause: input.rootCause?.trim() ?? null,
    analysis: input.analysis ?? {},
    config: input.config ?? {},
  };
}

function mapCreateCustomerAcceptanceInput(input: CreateSdCustomerAcceptanceRequest) {
  return {
    jobId: input.jobId,
    customerId: input.customerId,
    signatureRef: input.signatureRef?.trim() ?? null,
    notes: input.notes?.trim() ?? null,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateCustomerAcceptanceInput(input: UpdateSdCustomerAcceptanceRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
    ...(input.signatureRef !== undefined
      ? { signatureRef: input.signatureRef?.trim() ?? null }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
    ...(input.acceptedAt !== undefined ? { acceptedAt: parseOptionalDate(input.acceptedAt) } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdCustomerAcceptances.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateWarrantyRecordInput(input: CreateSdWarrantyRecordRequest) {
  return {
    jobId: input.jobId,
    customerId: input.customerId,
    warrantyType: input.warrantyType.trim(),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    terms: input.terms ?? {},
    config: input.config ?? {},
  };
}

function mapUpdateWarrantyRecordInput(input: UpdateSdWarrantyRecordRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
    ...(input.warrantyType !== undefined ? { warrantyType: input.warrantyType.trim() } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate ?? null } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate ?? null } : {}),
    ...(input.terms !== undefined ? { terms: input.terms } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateWarrantyClaimTrackingInput(input: CreateSdWarrantyClaimTrackingRequest) {
  return {
    warrantyRecordId: input.warrantyRecordId,
    jobId: input.jobId ?? null,
    claimNumber: input.claimNumber?.trim() ?? null,
    description: input.description?.trim() ?? null,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateWarrantyClaimTrackingInput(input: UpdateSdWarrantyClaimTrackingRequest) {
  return {
    ...(input.warrantyRecordId !== undefined ? { warrantyRecordId: input.warrantyRecordId } : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.claimNumber !== undefined ? { claimNumber: input.claimNumber?.trim() ?? null } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
    ...(input.resolvedAt !== undefined ? { resolvedAt: parseOptionalDate(input.resolvedAt) } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdWarrantyClaimTrackings.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateCallbackRecordInput(input: CreateSdCallbackRecordRequest) {
  return {
    jobId: input.jobId ?? null,
    originalJobId: input.originalJobId ?? null,
    callbackReason: input.callbackReason.trim(),
    assignedUserId: input.assignedUserId ?? null,
    scheduledAt: parseOptionalDate(input.scheduledAt),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateCallbackRecordInput(input: UpdateSdCallbackRecordRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId ?? null } : {}),
    ...(input.originalJobId !== undefined ? { originalJobId: input.originalJobId ?? null } : {}),
    ...(input.callbackReason !== undefined ? { callbackReason: input.callbackReason.trim() } : {}),
    ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId ?? null } : {}),
    ...(input.scheduledAt !== undefined
      ? { scheduledAt: parseOptionalDate(input.scheduledAt) }
      : {}),
    ...(input.completedAt !== undefined
      ? { completedAt: parseOptionalDate(input.completedAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdCallbackRecords.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateContinuousImprovementInitiativeInput(
  input: CreateSdContinuousImprovementInitiativeRequest,
  scope: StaffScope,
) {
  return {
    title: input.title.trim(),
    initiativeKey: input.initiativeKey.trim(),
    ownerUserId: scope.userId,
    targetDate: input.targetDate ?? null,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateContinuousImprovementInitiativeInput(
  input: UpdateSdContinuousImprovementInitiativeRequest,
) {
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.initiativeKey !== undefined ? { initiativeKey: input.initiativeKey.trim() } : {}),
    ...(input.targetDate !== undefined ? { targetDate: input.targetDate ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdContinuousImprovementInitiatives.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateHandoverRecordInput(input: CreateSdHandoverRecordRequest, scope: StaffScope) {
  return {
    jobId: input.jobId,
    handoverType: input.handoverType.trim(),
    handedOverByUserId: input.handedOverByUserId ?? scope.userId,
    receivedByUserId: input.receivedByUserId ?? null,
    handoverAt: parseOptionalDate(input.handoverAt),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateHandoverRecordInput(input: UpdateSdHandoverRecordRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.handoverType !== undefined ? { handoverType: input.handoverType.trim() } : {}),
    ...(input.handedOverByUserId !== undefined
      ? { handedOverByUserId: input.handedOverByUserId ?? null }
      : {}),
    ...(input.receivedByUserId !== undefined
      ? { receivedByUserId: input.receivedByUserId ?? null }
      : {}),
    ...(input.handoverAt !== undefined ? { handoverAt: parseOptionalDate(input.handoverAt) } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdHandoverRecords.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateVariationRecordInput(input: CreateSdVariationRecordRequest) {
  return {
    jobId: input.jobId,
    variationType: input.variationType.trim(),
    description: input.description.trim(),
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateVariationRecordInput(input: UpdateSdVariationRecordRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.variationType !== undefined ? { variationType: input.variationType.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.approvedAt !== undefined ? { approvedAt: parseOptionalDate(input.approvedAt) } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdVariationRecords.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}

function mapCreateCompletionCertificateInput(
  input: CreateSdCompletionCertificateRequest,
  scope: StaffScope,
) {
  return {
    jobId: input.jobId,
    certificateNumber: input.certificateNumber?.trim() ?? null,
    issuedByUserId: scope.userId,
    config: input.config ?? {},
    workflowStatus: 'draft' as const,
  };
}

function mapUpdateCompletionCertificateInput(input: UpdateSdCompletionCertificateRequest) {
  return {
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.certificateNumber !== undefined
      ? { certificateNumber: input.certificateNumber?.trim() ?? null }
      : {}),
    ...(input.issuedAt !== undefined ? { issuedAt: parseOptionalDate(input.issuedAt) } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof sdCompletionCertificates.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  };
}
