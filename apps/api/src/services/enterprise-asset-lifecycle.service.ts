import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type {
  AlAnalyticsSummary,
  AlAssetAlertSummary,
  AlAssetCategorySummary,
  AlAssetRegistryEntry,
  AlAssetRegistryProfileSummary,
  AlCustomerAssetDetail,
  AlCustomerAssetSummary,
  AlIotDeviceSummary,
  AlIotMonitoringSummary,
  AlIotProviderAdapterSummary,
  AlLifecycleStageHistorySummary,
  AlPlatformConfigSummary,
  AlPredictiveAssessmentSummary,
  AlPreventiveMaintenanceDueSummary,
  AlTelemetryReadingSummary,
  AlWorkOrderDraftSummary,
  CreateAlAssetCategoryRequest,
  CreateAlAssetRegistryProfileRequest,
  CreateAlIotDeviceRequest,
  CreateAlIotProviderAdapterRequest,
  CreateAlLifecycleStageRequest,
  CreateAlWorkOrderDraftRequest,
  EnterpriseAssetLifecycleAuraContext,
  EnterpriseAssetLifecycleDashboard,
  IngestAlTelemetryRequest,
  UpdateAlPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  alAnalyticsSnapshots,
  alAssetAlerts,
  alAssetCategories,
  alAssetRegistryProfiles,
  alAuditLogs,
  alIotDevices,
  alIotProviderAdapters,
  alLifecycleStageHistory,
  alPlatformConfig,
  alPredictiveAssessments,
  alPreventiveMaintenanceDue,
  alTelemetryReadings,
  alWarrantyComplianceRecords,
  alWorkOrderDrafts,
  assetMaintenanceRecords,
  assetMaintenanceSchedules,
} from '@titan/db';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

export class EnterpriseAssetLifecycleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseAssetLifecycleError';
  }
}

type StaffScope = { companyId: string; userId: string };

type AssetLifecycleDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
};

export class EnterpriseAssetLifecycleService {
  constructor(private readonly deps: AssetLifecycleDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseAssetLifecycleDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      assets,
      registryProfiles,
      categories,
      iotProviders,
      iotDevices,
      openAlertCount,
      maintenanceDue,
      predictiveAssessments,
      analytics,
      recentAlerts,
      recentTelemetry,
      workOrderDrafts,
      digitalTwin,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.assetEquipmentIntelligenceService.listAssets(companyId),
      this.listRegistryProfiles(companyId),
      this.listCategories(companyId),
      this.listIotProviders(companyId),
      this.listIotDevices(companyId),
      this.countOpenAlerts(companyId),
      this.listMaintenanceDue(companyId),
      this.listPredictiveAssessments(companyId),
      this.getLatestAnalytics(companyId),
      this.listAlerts(companyId, { limit: 20 }),
      this.listRecentTelemetry(companyId, 30),
      this.listWorkOrderDrafts(companyId),
      this.deps.enterpriseDigitalTwinService.getExecutiveDashboard(companyId).catch(() => null),
    ]);

    const activeProviderCount = iotProviders.filter((p) => p.status === 'active').length;
    const registryEntries = await this.buildRegistryEntries(companyId, assets.slice(0, 10));

    return {
      summary: `${assets.length} asset(s), ${iotDevices.length} IoT device(s), ${openAlertCount} open alert(s), ${maintenanceDue.length} maintenance due.`,
      isPlatformOwner,
      platformConfig,
      assetCount: assets.length,
      registryProfileCount: registryProfiles.length,
      categoryCount: categories.length,
      iotDeviceCount: iotDevices.length,
      activeProviderCount,
      openAlertCount,
      maintenanceDueCount: maintenanceDue.length,
      predictiveAssessmentCount: predictiveAssessments.length,
      analytics,
      recentAssets: registryEntries,
      recentAlerts,
      recentTelemetry,
      iotProviders,
      maintenanceDue,
      predictiveAssessments,
      workOrderDrafts,
      digitalTwinConnected: digitalTwin != null,
    };
  }

  async getIotMonitoring(companyId: string): Promise<AlIotMonitoringSummary> {
    const [devices, recentReadings, openAlerts] = await Promise.all([
      this.listIotDevices(companyId),
      this.listRecentTelemetry(companyId, 50),
      this.listAlerts(companyId, { status: 'open' }),
    ]);

    const connectedDeviceCount = devices.filter(
      (d) => d.connectivityStatus === 'connected' || d.lastSeenAt != null,
    ).length;

    return {
      deviceCount: devices.length,
      connectedDeviceCount,
      recentReadings,
      openAlertCount: openAlerts.length,
      thresholdBreaches: openAlerts.filter((a) =>
        ['high_temperature', 'low_pressure', 'abnormal_flow', 'vibration_anomaly'].includes(
          a.alertType,
        ),
      ).length,
    };
  }

  async getPlatformConfig(companyId: string): Promise<AlPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateAlPlatformConfigRequest,
  ): Promise<AlPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(alPlatformConfig)
      .set({
        globalPolicies: input.globalPolicies ?? existing.globalPolicies,
        iotAdapterTemplates: input.iotAdapterTemplates ?? existing.iotAdapterTemplates,
        telemetryStandards: input.telemetryStandards ?? existing.telemetryStandards,
        retentionPolicies: input.retentionPolicies ?? existing.retentionPolicies,
        defaultAlertPolicies: input.defaultAlertPolicies ?? existing.defaultAlertPolicies,
        updatedAt: new Date(),
      })
      .where(eq(alPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createCategory(
    scope: StaffScope,
    input: CreateAlAssetCategoryRequest,
  ): Promise<AlAssetCategorySummary> {
    const [created] = await this.deps.db
      .insert(alAssetCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'category_created', 'al_asset_category', created!.id);
    return toCategorySummary(created!);
  }

  async listCategories(companyId: string): Promise<AlAssetCategorySummary[]> {
    const rows = await this.deps.db.query.alAssetCategories.findMany({
      where: eq(alAssetCategories.companyId, companyId),
      orderBy: [desc(alAssetCategories.createdAt)],
    });
    return rows.map(toCategorySummary);
  }

  async createRegistryProfile(
    scope: StaffScope,
    input: CreateAlAssetRegistryProfileRequest,
  ): Promise<AlAssetRegistryProfileSummary> {
    const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(
      scope.companyId,
      input.assetId,
    );
    if (!asset) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Asset not found');
    }

    const [created] = await this.deps.db
      .insert(alAssetRegistryProfiles)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        categoryId: input.categoryId ?? null,
        customCategoryName: input.customCategoryName?.trim() ?? null,
        ownershipType: input.ownershipType ?? 'company_owned',
        customerId: input.customerId ?? null,
        propertyId: input.propertyId ?? null,
        manufacturer: input.manufacturer?.trim() ?? null,
        model: input.model?.trim() ?? null,
        installationDate: input.installationDate ?? null,
        commissioningDate: input.commissioningDate ?? null,
        warrantyDetails: input.warrantyDetails ?? {},
        criticality: input.criticality?.trim() ?? null,
        lifecycleStage: input.lifecycleStage ?? 'active_operation',
      })
      .returning();

    await this.recordAudit(
      scope,
      'registry_profile_created',
      'al_asset_registry_profile',
      created!.id,
    );
    return toRegistryProfileSummary(created!);
  }

  async createIotProvider(
    scope: StaffScope,
    input: CreateAlIotProviderAdapterRequest,
  ): Promise<AlIotProviderAdapterSummary> {
    const [created] = await this.deps.db
      .insert(alIotProviderAdapters)
      .values({
        companyId: scope.companyId,
        providerType: input.providerType,
        providerKey: input.providerKey.trim(),
        name: input.name.trim(),
        endpointUrl: input.endpointUrl ?? null,
        credentialsVaultKey: input.credentialsVaultKey ?? null,
        isPrimary: input.isPrimary ?? false,
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? null,
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.recordAudit(scope, 'iot_provider_created', 'al_iot_provider_adapter', created!.id);
    return toIotProviderSummary(created!);
  }

  async testIotProvider(
    scope: StaffScope,
    providerId: string,
  ): Promise<AlIotProviderAdapterSummary> {
    const provider = await this.getIotProviderOrThrow(scope.companyId, providerId);
    const testStatus = provider.endpointUrl ? 'success' : 'skipped';
    const testMessage = provider.endpointUrl
      ? 'Connection test recorded — configure endpoint and credentials for live provider data.'
      : 'No endpoint configured — provider remains inactive until configured.';

    const [updated] = await this.deps.db
      .update(alIotProviderAdapters)
      .set({
        lastTestAt: new Date(),
        lastTestStatus: testStatus,
        lastTestMessage: testMessage,
        status: testStatus === 'success' ? 'testing' : provider.status,
        updatedAt: new Date(),
      })
      .where(eq(alIotProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'iot_provider_tested', 'al_iot_provider_adapter', providerId);
    return toIotProviderSummary(updated!);
  }

  async createIotDevice(
    scope: StaffScope,
    input: CreateAlIotDeviceRequest,
  ): Promise<AlIotDeviceSummary> {
    const [created] = await this.deps.db
      .insert(alIotDevices)
      .values({
        companyId: scope.companyId,
        providerAdapterId: input.providerAdapterId ?? null,
        assetId: input.assetId ?? null,
        externalDeviceId: input.externalDeviceId.trim(),
        deviceName: input.deviceName.trim(),
        telemetryFieldMap: input.telemetryFieldMap ?? {},
        thresholdConfig: input.thresholdConfig ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'iot_device_created', 'al_iot_device', created!.id);
    return (await this.getIotDevice(scope.companyId, created!.id))!;
  }

  async mapDeviceToAsset(
    scope: StaffScope,
    deviceId: string,
    assetId: string,
  ): Promise<AlIotDeviceSummary> {
    const device = await this.getIotDeviceOrThrow(scope.companyId, deviceId);
    const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(
      scope.companyId,
      assetId,
    );
    if (!asset) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Asset not found');
    }

    const [updated] = await this.deps.db
      .update(alIotDevices)
      .set({ assetId, updatedAt: new Date() })
      .where(eq(alIotDevices.id, device.id))
      .returning();

    await this.recordAudit(scope, 'iot_device_mapped', 'al_iot_device', deviceId, { assetId });
    return (await this.getIotDevice(scope.companyId, updated!.id))!;
  }

  async ingestTelemetry(
    scope: StaffScope,
    input: IngestAlTelemetryRequest,
  ): Promise<AlTelemetryReadingSummary> {
    const device = await this.getIotDeviceOrThrow(scope.companyId, input.deviceId);

    const [reading] = await this.deps.db
      .insert(alTelemetryReadings)
      .values({
        companyId: scope.companyId,
        deviceId: device.id,
        assetId: device.assetId,
        providerAdapterId: device.providerAdapterId,
        field: input.field,
        customFieldName: input.customFieldName ?? null,
        normalizedValue: String(input.normalizedValue),
        unit: input.unit ?? null,
        quality: input.quality ?? 'good',
        rawPayloadRef: input.rawPayloadRef ?? null,
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
      })
      .returning();

    await this.deps.db
      .update(alIotDevices)
      .set({
        lastSeenAt: new Date(),
        connectivityStatus: 'connected',
        updatedAt: new Date(),
      })
      .where(eq(alIotDevices.id, device.id));

    await this.evaluateThresholds(scope, device, input);
    return toTelemetrySummary(reading!);
  }

  async createLifecycleStage(
    scope: StaffScope,
    input: CreateAlLifecycleStageRequest,
  ): Promise<AlLifecycleStageHistorySummary> {
    const requiresApproval =
      input.requiresApproval ?? ['decommissioning', 'disposal'].includes(input.stage);
    const status = requiresApproval ? 'pending_approval' : 'executed';

    const [created] = await this.deps.db
      .insert(alLifecycleStageHistory)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        stage: input.stage,
        status,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        responsibleUserId: scope.userId,
        costCents: input.costCents ?? null,
        createdByUserId: scope.userId,
      })
      .returning();

    if (status === 'executed') {
      await this.deps.db
        .update(alAssetRegistryProfiles)
        .set({ lifecycleStage: input.stage, updatedAt: new Date() })
        .where(
          and(
            eq(alAssetRegistryProfiles.companyId, scope.companyId),
            eq(alAssetRegistryProfiles.assetId, input.assetId),
          ),
        );
    }

    await this.recordAudit(
      scope,
      'lifecycle_stage_created',
      'al_lifecycle_stage_history',
      created!.id,
    );
    return toLifecycleSummary(created!);
  }

  async approveLifecycleStage(
    scope: StaffScope,
    historyId: string,
  ): Promise<AlLifecycleStageHistorySummary> {
    const row = await this.getLifecycleHistoryOrThrow(scope.companyId, historyId);
    if (row.status !== 'pending_approval') {
      throw new EnterpriseAssetLifecycleError(
        'VALIDATION_ERROR',
        'Lifecycle stage is not pending approval',
      );
    }

    const [updated] = await this.deps.db
      .update(alLifecycleStageHistory)
      .set({ status: 'approved' })
      .where(eq(alLifecycleStageHistory.id, historyId))
      .returning();

    await this.recordAudit(
      scope,
      'lifecycle_stage_approved',
      'al_lifecycle_stage_history',
      historyId,
    );
    return toLifecycleSummary(updated!);
  }

  async executeLifecycleStage(
    scope: StaffScope,
    historyId: string,
  ): Promise<AlLifecycleStageHistorySummary> {
    const row = await this.getLifecycleHistoryOrThrow(scope.companyId, historyId);
    if (!['approved', 'pending_approval'].includes(row.status)) {
      throw new EnterpriseAssetLifecycleError(
        'VALIDATION_ERROR',
        'Lifecycle stage cannot be executed',
      );
    }

    const [updated] = await this.deps.db
      .update(alLifecycleStageHistory)
      .set({ status: 'executed' })
      .where(eq(alLifecycleStageHistory.id, historyId))
      .returning();

    await this.deps.db
      .update(alAssetRegistryProfiles)
      .set({ lifecycleStage: row.stage, updatedAt: new Date() })
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, scope.companyId),
          eq(alAssetRegistryProfiles.assetId, row.assetId),
        ),
      );

    await this.recordAudit(
      scope,
      'lifecycle_stage_executed',
      'al_lifecycle_stage_history',
      historyId,
    );
    return toLifecycleSummary(updated!);
  }

  async acknowledgeAlert(scope: StaffScope, alertId: string): Promise<AlAssetAlertSummary> {
    const [updated] = await this.deps.db
      .update(alAssetAlerts)
      .set({ status: 'acknowledged', acknowledgedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(alAssetAlerts.id, alertId), eq(alAssetAlerts.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Alert not found');
    }

    await this.recordAudit(scope, 'alert_acknowledged', 'al_asset_alert', alertId);
    return toAlertSummary(updated);
  }

  async resolveAlert(
    scope: StaffScope,
    alertId: string,
    resolutionNotes?: string,
  ): Promise<AlAssetAlertSummary> {
    const [updated] = await this.deps.db
      .update(alAssetAlerts)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: resolutionNotes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(alAssetAlerts.id, alertId), eq(alAssetAlerts.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Alert not found');
    }

    await this.recordAudit(scope, 'alert_resolved', 'al_asset_alert', alertId);
    return toAlertSummary(updated);
  }

  async generateMaintenanceDue(scope: StaffScope): Promise<AlPreventiveMaintenanceDueSummary[]> {
    const schedules = await this.deps.db.query.assetMaintenanceSchedules.findMany({
      where: and(
        eq(assetMaintenanceSchedules.companyId, scope.companyId),
        eq(assetMaintenanceSchedules.isActive, true),
      ),
    });

    const created: AlPreventiveMaintenanceDueSummary[] = [];
    const now = new Date();

    for (const schedule of schedules) {
      if (!schedule.nextDueAt || schedule.nextDueAt > now) continue;

      const existing = await this.deps.db.query.alPreventiveMaintenanceDue.findFirst({
        where: and(
          eq(alPreventiveMaintenanceDue.companyId, scope.companyId),
          eq(alPreventiveMaintenanceDue.scheduleId, schedule.id),
          inArray(alPreventiveMaintenanceDue.status, ['due', 'overdue', 'scheduled'] as never[]),
        ),
      });
      if (existing) continue;

      const [row] = await this.deps.db
        .insert(alPreventiveMaintenanceDue)
        .values({
          companyId: scope.companyId,
          assetId: schedule.assetId,
          scheduleId: schedule.id,
          title: schedule.title,
          dueReason: `Schedule due: ${schedule.scheduleType}`,
          status: schedule.nextDueAt < now ? 'overdue' : 'due',
          dueAt: schedule.nextDueAt,
        })
        .returning();

      created.push(toMaintenanceDueSummary(row!));

      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'maintenance.due',
        entityType: 'maintenance_due',
        entityId: row!.id,
        payload: {
          maintenanceDue: {
            id: row!.id,
            assetId: row!.assetId,
            scheduleId: row!.scheduleId,
            title: row!.title,
            status: row!.status,
            dueAt: row!.dueAt?.toISOString?.() ?? row!.dueAt,
          },
          assetId: row!.assetId,
        },
        actorUserId: scope.userId,
      });
    }

    await this.recordAudit(scope, 'maintenance_due_generated', undefined, undefined, {
      count: created.length,
    });
    return created;
  }

  async generatePredictiveAssessment(
    scope: StaffScope,
    assetId: string,
  ): Promise<AlPredictiveAssessmentSummary> {
    const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(
      scope.companyId,
      assetId,
    );
    if (!asset) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Asset not found');
    }

    const [maintenanceRecords, telemetry, alerts] = await Promise.all([
      this.deps.db.query.assetMaintenanceRecords.findMany({
        where: and(
          eq(assetMaintenanceRecords.companyId, scope.companyId),
          eq(assetMaintenanceRecords.assetId, assetId),
        ),
        limit: 20,
      }),
      this.deps.db.query.alTelemetryReadings.findMany({
        where: and(
          eq(alTelemetryReadings.companyId, scope.companyId),
          eq(alTelemetryReadings.assetId, assetId),
        ),
        orderBy: [desc(alTelemetryReadings.recordedAt)],
        limit: 50,
      }),
      this.deps.db.query.alAssetAlerts.findMany({
        where: and(
          eq(alAssetAlerts.companyId, scope.companyId),
          eq(alAssetAlerts.assetId, assetId),
        ),
        limit: 10,
      }),
    ]);

    const emergencyCount = maintenanceRecords.filter(
      (r) => r.maintenanceType === 'emergency',
    ).length;
    const openAlertCount = alerts.filter((a) => a.status === 'open').length;
    const telemetryCount = telemetry.length;

    let failureRiskScore = 10;
    if (emergencyCount > 0) failureRiskScore += emergencyCount * 15;
    if (openAlertCount > 0) failureRiskScore += openAlertCount * 10;
    if (asset.condition === 'poor' || asset.condition === 'critical') failureRiskScore += 20;
    failureRiskScore = Math.min(failureRiskScore, 95);

    const confidenceScore = telemetryCount > 0 || maintenanceRecords.length > 0 ? 70 : 40;

    const [created] = await this.deps.db
      .insert(alPredictiveAssessments)
      .values({
        companyId: scope.companyId,
        assetId,
        failureRiskScore: String(failureRiskScore),
        remainingUsefulLifeDays: Math.max(30, 365 - emergencyCount * 30),
        maintenanceRecommendation:
          failureRiskScore >= 50
            ? 'Schedule preventive maintenance inspection based on maintenance history and telemetry.'
            : 'Continue monitoring — no immediate maintenance required.',
        inspectionRecommendation:
          openAlertCount > 0 ? 'Review open alerts and inspect affected components.' : null,
        partsRecommendation:
          emergencyCount > 2 ? 'Review frequently replaced parts from maintenance history.' : null,
        confidenceScore: String(confidenceScore),
        supportingEvidence: {
          emergencyMaintenanceCount: emergencyCount,
          openAlertCount,
          telemetryReadingCount: telemetryCount,
          assetCondition: asset.condition,
        },
        explanation: `Assessment based on ${maintenanceRecords.length} maintenance record(s), ${telemetryCount} telemetry reading(s), and ${openAlertCount} open alert(s). Recommendations only — approval required for actions.`,
      })
      .returning();

    await this.recordAudit(
      scope,
      'predictive_assessment_generated',
      'al_predictive_assessment',
      created!.id,
    );
    return toPredictiveSummary(created!);
  }

  async createWorkOrderDraft(
    scope: StaffScope,
    input: CreateAlWorkOrderDraftRequest,
  ): Promise<AlWorkOrderDraftSummary> {
    const [created] = await this.deps.db
      .insert(alWorkOrderDrafts)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId ?? null,
        alertId: input.alertId ?? null,
        draftType: input.draftType,
        status: 'draft',
        subject: input.subject.trim(),
        description: input.description?.trim() ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordAudit(scope, 'work_order_draft_created', 'al_work_order_draft', created!.id);
    return toWorkOrderDraftSummary(created!);
  }

  async approveWorkOrderDraft(
    scope: StaffScope,
    draftId: string,
  ): Promise<AlWorkOrderDraftSummary> {
    const [updated] = await this.deps.db
      .update(alWorkOrderDrafts)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(
        and(eq(alWorkOrderDrafts.id, draftId), eq(alWorkOrderDrafts.companyId, scope.companyId)),
      )
      .returning();

    if (!updated) {
      throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Work order draft not found');
    }

    await this.recordAudit(scope, 'work_order_draft_approved', 'al_work_order_draft', draftId);
    return toWorkOrderDraftSummary(updated);
  }

  async captureAnalytics(scope: StaffScope): Promise<AlAnalyticsSummary> {
    const [assets, devices, alerts, maintenanceRecords, predictiveRows] = await Promise.all([
      this.deps.assetEquipmentIntelligenceService.listAssets(scope.companyId),
      this.listIotDevices(scope.companyId),
      this.listAlerts(scope.companyId, {}),
      this.deps.db.query.assetMaintenanceRecords.findMany({
        where: eq(assetMaintenanceRecords.companyId, scope.companyId),
      }),
      this.listPredictiveAssessments(scope.companyId),
    ]);

    const maintenanceCostCents = maintenanceRecords.reduce((sum, r) => sum + r.totalCostCents, 0);
    const connectedDevices = devices.filter((d) => d.connectivityStatus === 'connected').length;
    const deviceConnectivityPercent =
      devices.length > 0 ? (connectedDevices / devices.length) * 100 : null;

    const resolvedAlerts = alerts.filter((a) => a.resolvedAt);
    const avgResponseHours =
      resolvedAlerts.length > 0
        ? resolvedAlerts.reduce((sum, a) => {
            const created = new Date(a.createdAt).getTime();
            const resolved = new Date(a.resolvedAt!).getTime();
            return sum + (resolved - created) / (1000 * 60 * 60);
          }, 0) / resolvedAlerts.length
        : null;

    const predictiveRiskAvg =
      predictiveRows.length > 0
        ? predictiveRows.reduce((sum, p) => sum + (p.failureRiskScore ?? 0), 0) /
          predictiveRows.length
        : null;

    const [snapshot] = await this.deps.db
      .insert(alAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        maintenanceCostCents,
        deviceConnectivityPercent:
          deviceConnectivityPercent != null ? String(deviceConnectivityPercent) : null,
        alertResponseTimeHours: avgResponseHours != null ? String(avgResponseHours) : null,
        predictiveRiskAvg: predictiveRiskAvg != null ? String(predictiveRiskAvg) : null,
        metrics: {
          assetCount: assets.length,
          deviceCount: devices.length,
          alertCount: alerts.length,
          maintenanceRecordCount: maintenanceRecords.length,
        },
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(snapshot!);
  }

  async listCustomerAssets(
    companyId: string,
    customerId: string,
  ): Promise<AlCustomerAssetSummary[]> {
    const profiles = await this.deps.db.query.alAssetRegistryProfiles.findMany({
      where: and(
        eq(alAssetRegistryProfiles.companyId, companyId),
        eq(alAssetRegistryProfiles.customerId, customerId),
      ),
    });

    const summaries: AlCustomerAssetSummary[] = [];
    for (const profile of profiles) {
      const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(
        companyId,
        profile.assetId,
      );
      if (!asset) continue;

      const [warranty, alertCount] = await Promise.all([
        this.deps.db.query.alWarrantyComplianceRecords.findFirst({
          where: and(
            eq(alWarrantyComplianceRecords.companyId, companyId),
            eq(alWarrantyComplianceRecords.assetId, profile.assetId),
          ),
        }),
        this.deps.db
          .select({ count: count() })
          .from(alAssetAlerts)
          .where(
            and(
              eq(alAssetAlerts.companyId, companyId),
              eq(alAssetAlerts.assetId, profile.assetId),
              eq(alAssetAlerts.status, 'open'),
            ),
          ),
      ]);

      summaries.push({
        assetId: profile.assetId,
        name: asset.name,
        categoryName: profile.customCategoryName,
        lifecycleStage: profile.lifecycleStage,
        warrantyStatus: warranty?.warrantyStatus ?? null,
        warrantyExpiresAt: warranty?.expiresAt?.toISOString() ?? asset.warrantyExpiresAt,
        nextMaintenanceDueAt: null,
        openAlertCount: alertCount[0]?.count ?? 0,
      });
    }

    return summaries;
  }

  async getCustomerAssetDetail(
    companyId: string,
    customerId: string,
    assetId: string,
  ): Promise<AlCustomerAssetDetail | null> {
    const profile = await this.deps.db.query.alAssetRegistryProfiles.findFirst({
      where: and(
        eq(alAssetRegistryProfiles.companyId, companyId),
        eq(alAssetRegistryProfiles.customerId, customerId),
        eq(alAssetRegistryProfiles.assetId, assetId),
      ),
    });
    if (!profile) return null;

    const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(companyId, assetId);
    if (!asset) return null;

    const [records, schedules, warranty] = await Promise.all([
      this.deps.assetEquipmentIntelligenceService.listMaintenanceRecords(companyId),
      this.deps.assetEquipmentIntelligenceService.listMaintenanceSchedules(companyId),
      this.deps.db.query.alWarrantyComplianceRecords.findFirst({
        where: and(
          eq(alWarrantyComplianceRecords.companyId, companyId),
          eq(alWarrantyComplianceRecords.assetId, assetId),
        ),
      }),
    ]);

    return {
      assetId,
      name: asset.name,
      categoryName: profile.customCategoryName,
      lifecycleStage: profile.lifecycleStage,
      warrantyStatus: warranty?.warrantyStatus ?? null,
      warrantyExpiresAt: warranty?.expiresAt?.toISOString() ?? asset.warrantyExpiresAt,
      nextMaintenanceDueAt: null,
      openAlertCount: 0,
      manufacturer: profile.manufacturer,
      model: profile.model,
      serialNumber: asset.serialNumber,
      serviceHistory: records.filter((r) => r.assetId === assetId),
      maintenanceSchedules: schedules.filter((s) => s.assetId === assetId),
      certificates: (warranty?.certificateDocumentIds as string[] | undefined) ?? [],
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseAssetLifecycleAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      assetCount: dashboard.assetCount,
      openAlertCount: dashboard.openAlertCount,
      maintenanceDueCount: dashboard.maintenanceDueCount,
      iotDeviceCount: dashboard.iotDeviceCount,
      predictiveAssessmentCount: dashboard.predictiveAssessmentCount,
      recentAlerts: dashboard.recentAlerts.slice(0, 5).map((a) => ({
        title: a.title,
        severity: a.severity,
        status: a.status,
      })),
    };
  }

  async buildDigitalTwinAssetState(companyId: string, assetId: string) {
    const asset = await this.deps.assetEquipmentIntelligenceService.getAsset(companyId, assetId);
    if (!asset) return null;

    const [profile, telemetry, alerts, maintenance] = await Promise.all([
      this.deps.db.query.alAssetRegistryProfiles.findFirst({
        where: and(
          eq(alAssetRegistryProfiles.companyId, companyId),
          eq(alAssetRegistryProfiles.assetId, assetId),
        ),
      }),
      this.deps.db.query.alTelemetryReadings.findMany({
        where: and(
          eq(alTelemetryReadings.companyId, companyId),
          eq(alTelemetryReadings.assetId, assetId),
        ),
        orderBy: [desc(alTelemetryReadings.recordedAt)],
        limit: 20,
      }),
      this.listAlerts(companyId, { assetId, limit: 10 }),
      this.deps.db.query.assetMaintenanceRecords.findMany({
        where: and(
          eq(assetMaintenanceRecords.companyId, companyId),
          eq(assetMaintenanceRecords.assetId, assetId),
        ),
        limit: 10,
      }),
    ]);

    return {
      simulation: true,
      assetId,
      assetName: asset.name,
      lifecycleStage: profile?.lifecycleStage ?? 'active_operation',
      condition: asset.condition,
      status: asset.status,
      liveTelemetry: telemetry.map(toTelemetrySummary),
      openAlerts: alerts.filter((a) => a.status === 'open'),
      maintenanceHistoryCount: maintenance.length,
      note: 'Digital twin asset state — simulation context for scenario analysis only.',
    };
  }

  private async evaluateThresholds(
    scope: StaffScope,
    device: typeof alIotDevices.$inferSelect,
    input: IngestAlTelemetryRequest,
  ) {
    const thresholds = device.thresholdConfig as Record<string, { min?: number; max?: number }>;
    const fieldKey = input.field === 'custom' ? (input.customFieldName ?? 'custom') : input.field;
    const threshold = thresholds[fieldKey];
    if (!threshold) return;

    let alertType: import('@titan/shared').AlAlertType | null = null;
    if (threshold.max != null && input.normalizedValue > threshold.max) {
      alertType =
        input.field === 'temperature'
          ? 'high_temperature'
          : input.field === 'pressure'
            ? 'low_pressure'
            : 'custom';
    }
    if (threshold.min != null && input.normalizedValue < threshold.min) {
      alertType = input.field === 'pressure' ? 'low_pressure' : 'custom';
    }
    if (!alertType) return;

    await this.deps.db.insert(alAssetAlerts).values({
      companyId: scope.companyId,
      assetId: device.assetId,
      deviceId: device.id,
      alertType,
      severity: 'warning',
      status: 'open',
      title: `Threshold breach: ${fieldKey}`,
      description: `Value ${input.normalizedValue}${input.unit ? ` ${input.unit}` : ''} exceeded configured threshold.`,
      metadata: { field: input.field, value: input.normalizedValue, threshold },
    });
  }

  private async buildRegistryEntries(
    companyId: string,
    assets: Awaited<ReturnType<AssetEquipmentIntelligenceService['listAssets']>>,
  ): Promise<AlAssetRegistryEntry[]> {
    const profiles = await this.deps.db.query.alAssetRegistryProfiles.findMany({
      where: eq(alAssetRegistryProfiles.companyId, companyId),
    });
    const profileMap = new Map(profiles.map((p) => [p.assetId, p]));

    return assets.map((asset) => ({
      ...asset,
      profile: profileMap.has(asset.id)
        ? toRegistryProfileSummary(profileMap.get(asset.id)!)
        : null,
    }));
  }

  private async listRegistryProfiles(companyId: string) {
    return this.deps.db.query.alAssetRegistryProfiles.findMany({
      where: eq(alAssetRegistryProfiles.companyId, companyId),
    });
  }

  private async listIotProviders(companyId: string): Promise<AlIotProviderAdapterSummary[]> {
    const rows = await this.deps.db.query.alIotProviderAdapters.findMany({
      where: eq(alIotProviderAdapters.companyId, companyId),
      orderBy: [desc(alIotProviderAdapters.createdAt)],
    });
    return rows.map(toIotProviderSummary);
  }

  private async listIotDevices(companyId: string): Promise<AlIotDeviceSummary[]> {
    const rows = await this.deps.db.query.alIotDevices.findMany({
      where: eq(alIotDevices.companyId, companyId),
      orderBy: [desc(alIotDevices.updatedAt)],
    });

    const summaries: AlIotDeviceSummary[] = [];
    for (const row of rows) {
      const summary = await this.getIotDevice(companyId, row.id);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  private async getIotDevice(
    companyId: string,
    deviceId: string,
  ): Promise<AlIotDeviceSummary | null> {
    const row = await this.deps.db.query.alIotDevices.findFirst({
      where: and(eq(alIotDevices.id, deviceId), eq(alIotDevices.companyId, companyId)),
    });
    if (!row) return null;

    const asset = row.assetId
      ? await this.deps.assetEquipmentIntelligenceService.getAsset(companyId, row.assetId)
      : null;

    return {
      id: row.id,
      assetId: row.assetId,
      assetName: asset?.name ?? null,
      providerAdapterId: row.providerAdapterId,
      externalDeviceId: row.externalDeviceId,
      deviceName: row.deviceName,
      isActive: row.isActive,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      connectivityStatus: row.connectivityStatus,
      batteryLevel: row.batteryLevel != null ? Number(row.batteryLevel) : null,
      signalStrength: row.signalStrength != null ? Number(row.signalStrength) : null,
    };
  }

  private async listRecentTelemetry(
    companyId: string,
    limit: number,
  ): Promise<AlTelemetryReadingSummary[]> {
    const rows = await this.deps.db.query.alTelemetryReadings.findMany({
      where: eq(alTelemetryReadings.companyId, companyId),
      orderBy: [desc(alTelemetryReadings.recordedAt)],
      limit,
    });
    return rows.map(toTelemetrySummary);
  }

  private async listAlerts(
    companyId: string,
    options?: { status?: string; assetId?: string; limit?: number },
  ): Promise<AlAssetAlertSummary[]> {
    const rows = await this.deps.db.query.alAssetAlerts.findMany({
      where: and(
        eq(alAssetAlerts.companyId, companyId),
        options?.status ? eq(alAssetAlerts.status, options.status as never) : undefined,
        options?.assetId ? eq(alAssetAlerts.assetId, options.assetId) : undefined,
      ),
      orderBy: [desc(alAssetAlerts.createdAt)],
      limit: options?.limit ?? 50,
    });
    return rows.map(toAlertSummary);
  }

  private async listMaintenanceDue(
    companyId: string,
  ): Promise<AlPreventiveMaintenanceDueSummary[]> {
    const rows = await this.deps.db.query.alPreventiveMaintenanceDue.findMany({
      where: and(
        eq(alPreventiveMaintenanceDue.companyId, companyId),
        inArray(alPreventiveMaintenanceDue.status, ['due', 'overdue'] as never[]),
      ),
      orderBy: [desc(alPreventiveMaintenanceDue.dueAt)],
      limit: 50,
    });
    return rows.map(toMaintenanceDueSummary);
  }

  private async listPredictiveAssessments(
    companyId: string,
  ): Promise<AlPredictiveAssessmentSummary[]> {
    const rows = await this.deps.db.query.alPredictiveAssessments.findMany({
      where: eq(alPredictiveAssessments.companyId, companyId),
      orderBy: [desc(alPredictiveAssessments.createdAt)],
      limit: 50,
    });
    return rows.map(toPredictiveSummary);
  }

  private async listWorkOrderDrafts(companyId: string): Promise<AlWorkOrderDraftSummary[]> {
    const rows = await this.deps.db.query.alWorkOrderDrafts.findMany({
      where: eq(alWorkOrderDrafts.companyId, companyId),
      orderBy: [desc(alWorkOrderDrafts.createdAt)],
      limit: 30,
    });
    return rows.map(toWorkOrderDraftSummary);
  }

  private async getLatestAnalytics(companyId: string): Promise<AlAnalyticsSummary> {
    const row = await this.deps.db.query.alAnalyticsSnapshots.findFirst({
      where: eq(alAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(alAnalyticsSnapshots.capturedAt)],
    });

    if (!row) {
      return {
        assetUptimePercent: null,
        downtimeHours: null,
        failureRate: null,
        mtbfHours: null,
        mttrHours: null,
        maintenanceCostCents: 0,
        energyUsageKwh: null,
        predictiveRiskAvg: null,
        deviceConnectivityPercent: null,
        alertResponseTimeHours: null,
        capturedAt: null,
      };
    }

    return toAnalyticsSummary(row);
  }

  private async countOpenAlerts(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(alAssetAlerts)
      .where(and(eq(alAssetAlerts.companyId, companyId), eq(alAssetAlerts.status, 'open')));
    return row?.count ?? 0;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.alPlatformConfig.findFirst({
      where: eq(alPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db.insert(alPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async getIotProviderOrThrow(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.alIotProviderAdapters.findFirst({
      where: and(
        eq(alIotProviderAdapters.id, providerId),
        eq(alIotProviderAdapters.companyId, companyId),
      ),
    });
    if (!provider) throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'IoT provider not found');
    return provider;
  }

  private async getIotDeviceOrThrow(companyId: string, deviceId: string) {
    const device = await this.deps.db.query.alIotDevices.findFirst({
      where: and(eq(alIotDevices.id, deviceId), eq(alIotDevices.companyId, companyId)),
    });
    if (!device) throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'IoT device not found');
    return device;
  }

  private async getLifecycleHistoryOrThrow(companyId: string, historyId: string) {
    const row = await this.deps.db.query.alLifecycleStageHistory.findFirst({
      where: and(
        eq(alLifecycleStageHistory.id, historyId),
        eq(alLifecycleStageHistory.companyId, companyId),
      ),
    });
    if (!row) throw new EnterpriseAssetLifecycleError('NOT_FOUND', 'Lifecycle history not found');
    return row;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(alAuditLogs).values({
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
  row: typeof alPlatformConfig.$inferSelect,
): AlPlatformConfigSummary {
  return {
    globalPolicies: row.globalPolicies,
    iotAdapterTemplates: row.iotAdapterTemplates,
    telemetryStandards: row.telemetryStandards,
    retentionPolicies: row.retentionPolicies,
    defaultAlertPolicies: row.defaultAlertPolicies,
  };
}

function toCategorySummary(row: typeof alAssetCategories.$inferSelect): AlAssetCategorySummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRegistryProfileSummary(
  row: typeof alAssetRegistryProfiles.$inferSelect,
): AlAssetRegistryProfileSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    categoryId: row.categoryId,
    categoryName: row.customCategoryName,
    customCategoryName: row.customCategoryName,
    ownershipType: row.ownershipType,
    customerId: row.customerId,
    propertyId: row.propertyId,
    manufacturer: row.manufacturer,
    model: row.model,
    installationDate: row.installationDate,
    commissioningDate: row.commissioningDate,
    warrantyDetails: row.warrantyDetails,
    criticality: row.criticality,
    lifecycleStage: row.lifecycleStage,
  };
}

function toIotProviderSummary(
  row: typeof alIotProviderAdapters.$inferSelect,
): AlIotProviderAdapterSummary {
  return {
    id: row.id,
    providerType: row.providerType,
    providerKey: row.providerKey,
    name: row.name,
    status: row.status,
    endpointUrl: row.endpointUrl,
    isPrimary: row.isPrimary,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
    lastTestMessage: row.lastTestMessage,
  };
}

function toTelemetrySummary(
  row: typeof alTelemetryReadings.$inferSelect,
): AlTelemetryReadingSummary {
  return {
    id: row.id,
    deviceId: row.deviceId,
    assetId: row.assetId,
    field: row.field,
    customFieldName: row.customFieldName,
    normalizedValue: Number(row.normalizedValue),
    unit: row.unit,
    quality: row.quality,
    recordedAt: row.recordedAt.toISOString(),
  };
}

function toAlertSummary(row: typeof alAssetAlerts.$inferSelect): AlAssetAlertSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    deviceId: row.deviceId,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    assignedUserId: row.assignedUserId,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLifecycleSummary(
  row: typeof alLifecycleStageHistory.$inferSelect,
): AlLifecycleStageHistorySummary {
  return {
    id: row.id,
    assetId: row.assetId,
    stage: row.stage,
    status: row.status,
    title: row.title,
    description: row.description,
    responsibleUserId: row.responsibleUserId,
    costCents: row.costCents,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toMaintenanceDueSummary(
  row: typeof alPreventiveMaintenanceDue.$inferSelect,
): AlPreventiveMaintenanceDueSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    title: row.title,
    dueReason: row.dueReason,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
  };
}

function toPredictiveSummary(
  row: typeof alPredictiveAssessments.$inferSelect,
): AlPredictiveAssessmentSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    status: row.status,
    failureRiskScore: row.failureRiskScore != null ? Number(row.failureRiskScore) : null,
    remainingUsefulLifeDays: row.remainingUsefulLifeDays,
    maintenanceRecommendation: row.maintenanceRecommendation,
    inspectionRecommendation: row.inspectionRecommendation,
    partsRecommendation: row.partsRecommendation,
    confidenceScore: row.confidenceScore != null ? Number(row.confidenceScore) : null,
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWorkOrderDraftSummary(
  row: typeof alWorkOrderDrafts.$inferSelect,
): AlWorkOrderDraftSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    alertId: row.alertId,
    draftType: row.draftType,
    status: row.status,
    subject: row.subject,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof alAnalyticsSnapshots.$inferSelect): AlAnalyticsSummary {
  return {
    assetUptimePercent: row.assetUptimePercent != null ? Number(row.assetUptimePercent) : null,
    downtimeHours: row.downtimeHours != null ? Number(row.downtimeHours) : null,
    failureRate: row.failureRate != null ? Number(row.failureRate) : null,
    mtbfHours: row.mtbfHours != null ? Number(row.mtbfHours) : null,
    mttrHours: row.mttrHours != null ? Number(row.mttrHours) : null,
    maintenanceCostCents: row.maintenanceCostCents,
    energyUsageKwh: row.energyUsageKwh != null ? Number(row.energyUsageKwh) : null,
    predictiveRiskAvg: row.predictiveRiskAvg != null ? Number(row.predictiveRiskAvg) : null,
    deviceConnectivityPercent:
      row.deviceConnectivityPercent != null ? Number(row.deviceConnectivityPercent) : null,
    alertResponseTimeHours:
      row.alertResponseTimeHours != null ? Number(row.alertResponseTimeHours) : null,
    capturedAt: row.capturedAt.toISOString(),
  };
}
