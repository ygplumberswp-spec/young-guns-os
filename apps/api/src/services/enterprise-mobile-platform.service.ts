import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateMobileFleetProviderRequest,
  CreateMobileMediaAssetRequest,
  EnterpriseMobilePlatformAuraContext,
  EnterpriseMobilePlatformDashboard,
  MobileDeviceSummary,
  MobileDispatcherWorkspace,
  MobileFieldIntelligenceSummary,
  MobileFleetTrackingProviderSummary,
  MobileMediaAssetSummary,
  MobilePlatformConfigSummary,
  MobileSyncHistorySummary,
  RegisterMobileDeviceRequest,
  RegisterMobilePushTokenRequest,
  UpdateMobilePlatformConfigRequest,
} from '@titan/shared';
import { MOBILE_FLEET_PROVIDER_TYPES, MOBILE_OFFLINE_RESOURCE_TYPES } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  mobileAuditLogs,
  mobileDevices,
  mobileFieldIntelligenceSnapshots,
  mobileFleetTrackingProviders,
  mobileMediaAssets,
  mobilePlatformConfig,
  mobilePushTokens,
  mobileSyncConflicts,
  mobileSyncHistory,
  mobileSyncQueue,
  mobileSyncState,
  users,
  vehicles,
} from '@titan/db';
import type { DispatchIntelligenceService } from './dispatch-intelligence.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { MobileSyncService } from './mobile-sync.service.js';
import type { MobileWorkforceService } from './mobile-workforce.service.js';

export class EnterpriseMobilePlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseMobilePlatformError';
  }
}

type StaffScope = { companyId: string; userId: string };

type MobilePlatformDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  mobileSyncService: MobileSyncService;
  mobileWorkforceService: MobileWorkforceService;
  integrationsService: IntegrationsService;
  dispatchIntelligenceService: DispatchIntelligenceService;
};

export class EnterpriseMobilePlatformService {
  constructor(private readonly deps: MobilePlatformDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseMobilePlatformDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      devices,
      syncHistory,
      pendingSyncQueueCount,
      pendingConflictCount,
      fleetProviders,
      fieldIntelligence,
      recentMediaAssets,
      fleetContext,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listDevices(companyId),
      this.listSyncHistory(companyId, 20),
      this.countPendingSyncQueue(companyId),
      this.countPendingConflicts(companyId),
      this.listFleetProviders(companyId),
      this.getLatestFieldIntelligence(companyId),
      this.listRecentMediaAssets(companyId, 20),
      this.deps.integrationsService.buildFleetTrackingContext(companyId),
    ]);

    const activeDeviceCount = devices.filter((d) => d.status === 'active').length;

    return {
      summary: `${devices.length} registered device(s), ${activeDeviceCount} active, ${pendingSyncQueueCount} pending sync item(s), ${pendingConflictCount} conflict(s).`,
      isPlatformOwner,
      platformConfig,
      devices,
      activeDeviceCount,
      syncHistory,
      pendingSyncQueueCount,
      pendingConflictCount,
      fleetProviders,
      fieldIntelligence,
      recentMediaAssets,
      offlineResourceTypes: MOBILE_OFFLINE_RESOURCE_TYPES,
      cartrackConnected: fleetContext.cartrackConnected,
    };
  }

  async getDispatcherWorkspace(companyId: string): Promise<MobileDispatcherWorkspace> {
    const [
      dispatchDashboard,
      fleetProviders,
      fleetContext,
      technicianUsers,
      deviceRows,
      syncStates,
    ] = await Promise.all([
      this.deps.dispatchIntelligenceService.getOperationsDashboard(companyId),
      this.listFleetProviders(companyId),
      this.deps.integrationsService.buildFleetTrackingContext(companyId),
      this.deps.db.query.users.findMany({
        where: eq(users.companyId, companyId),
        columns: { id: true, firstName: true, lastName: true },
        limit: 100,
      }),
      this.deps.db.query.mobileDevices.findMany({
        where: and(eq(mobileDevices.companyId, companyId), eq(mobileDevices.status, 'active')),
      }),
      this.deps.db.query.mobileSyncState.findMany({
        where: and(
          eq(mobileSyncState.companyId, companyId),
          eq(mobileSyncState.scope, 'technician'),
        ),
      }),
    ]);

    const vehicleCount = await this.deps.db
      .select({ value: count() })
      .from(vehicles)
      .where(eq(vehicles.companyId, companyId));

    const assignedJobCounts = await this.deps.db
      .select({
        assignedUserId: jobs.assignedUserId,
        value: count(),
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          inArray(jobs.status, ['scheduled', 'in_progress']),
          sql`${jobs.assignedUserId} IS NOT NULL`,
        ),
      )
      .groupBy(jobs.assignedUserId);

    const activeProvider = fleetProviders.find((p) => p.isActive)?.providerType ?? null;

    const technicianStatuses = technicianUsers.map((user) => {
      const jobCount = assignedJobCounts.find((row) => row.assignedUserId === user.id)?.value ?? 0;
      const device = deviceRows.find((d) => d.userId === user.id);
      const syncState = syncStates.find((s) => s.userId === user.id);
      return {
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        assignedJobCount: Number(jobCount),
        activeJobTitle: null,
        lastSyncAt: syncState?.lastSyncedAt?.toISOString() ?? null,
        deviceStatus: device?.status ?? null,
      };
    });

    const recommendations: string[] = [];
    const conflictCount = await this.countPendingConflicts(companyId);
    if (conflictCount > 0) {
      recommendations.push('Resolve pending mobile sync conflicts before dispatching new jobs.');
    }
    if (!activeProvider && !fleetContext.cartrackConnected) {
      recommendations.push('Configure a fleet tracking provider for live route monitoring.');
    }
    if (dispatchDashboard.recentRecommendations.length > 0) {
      recommendations.push(
        ...dispatchDashboard.recentRecommendations.slice(0, 3).map((r) => r.subject),
      );
    }

    return {
      summary: `${technicianStatuses.length} technician(s), ${dispatchDashboard.pendingCallbackCount} pending callback(s), ${Number(vehicleCount[0]?.value ?? 0)} fleet vehicle(s).`,
      technicianStatuses,
      pendingDispatchCount: dispatchDashboard.pendingCallbackCount,
      fleetVehicleCount: Number(vehicleCount[0]?.value ?? 0),
      activeTrackingProvider: activeProvider,
      incidentAlertCount: dispatchDashboard.emergencyAssessmentCount,
      recommendations,
    };
  }

  async registerDevice(
    scope: StaffScope,
    input: RegisterMobileDeviceRequest,
  ): Promise<MobileDeviceSummary> {
    const existing = await this.deps.db.query.mobileDevices.findFirst({
      where: and(
        eq(mobileDevices.companyId, scope.companyId),
        eq(mobileDevices.deviceKey, input.deviceKey),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(mobileDevices)
        .set({
          userId: scope.userId,
          deviceName: input.deviceName ?? existing.deviceName,
          platform: input.platform ?? existing.platform,
          appVersion: input.appVersion ?? existing.appVersion,
          osVersion: input.osVersion ?? existing.osVersion,
          encryptionVerified: input.encryptionVerified ?? existing.encryptionVerified,
          status: 'active',
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mobileDevices.id, existing.id))
        .returning();
      await this.logAudit(scope, 'device_registered', 'mobile_device', updated!.id);
      return this.toDeviceSummary(updated!);
    }

    const [created] = await this.deps.db
      .insert(mobileDevices)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        deviceKey: input.deviceKey,
        deviceName: input.deviceName ?? null,
        platform: input.platform ?? 'web',
        appVersion: input.appVersion ?? null,
        osVersion: input.osVersion ?? null,
        encryptionVerified: input.encryptionVerified ?? false,
        lastSeenAt: new Date(),
      })
      .returning();

    await this.logAudit(scope, 'device_registered', 'mobile_device', created!.id);
    return this.toDeviceSummary(created!);
  }

  async revokeDevice(scope: StaffScope, deviceId: string): Promise<MobileDeviceSummary> {
    const device = await this.ensureDevice(scope.companyId, deviceId);
    const [updated] = await this.deps.db
      .update(mobileDevices)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(mobileDevices.id, device.id))
      .returning();

    await this.deps.db
      .update(mobilePushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(mobilePushTokens.deviceId, device.id));

    await this.logAudit(scope, 'device_revoked', 'mobile_device', device.id);
    return this.toDeviceSummary(updated!);
  }

  async registerPushToken(
    scope: StaffScope,
    input: RegisterMobilePushTokenRequest,
  ): Promise<{ id: string }> {
    await this.ensureDevice(scope.companyId, input.deviceId);
    const [created] = await this.deps.db
      .insert(mobilePushTokens)
      .values({
        companyId: scope.companyId,
        deviceId: input.deviceId,
        userId: scope.userId,
        token: input.token,
        provider: input.provider ?? 'web_push',
        isActive: true,
      })
      .returning();
    return { id: created!.id };
  }

  async createMediaAsset(
    scope: StaffScope,
    input: CreateMobileMediaAssetRequest,
  ): Promise<MobileMediaAssetSummary> {
    const [created] = await this.deps.db
      .insert(mobileMediaAssets)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        jobId: input.jobId ?? null,
        mediaType: input.mediaType,
        title: input.title,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        storageKey: input.storageKey ?? null,
        latitude: input.latitude != null ? String(input.latitude) : null,
        longitude: input.longitude != null ? String(input.longitude) : null,
        capturedAt: input.capturedAt ? new Date(input.capturedAt) : new Date(),
        metadata: input.metadata ?? {},
      })
      .returning();

    await this.logAudit(scope, 'media_captured', 'mobile_media_asset', created!.id, {
      mediaType: input.mediaType,
      jobId: input.jobId,
    });
    return this.toMediaSummary(created!);
  }

  async processSyncWithHistory(scope: StaffScope, deviceId?: string, triggerType = 'manual') {
    const startedAt = new Date();
    const result = await this.deps.mobileSyncService.processStaffSyncQueue(
      scope.companyId,
      scope.userId,
    );

    const status =
      result.failed > 0 && result.processed === 0
        ? 'failed'
        : result.failed > 0 || result.conflicts > 0
          ? 'partial'
          : 'completed';

    const [history] = await this.deps.db
      .insert(mobileSyncHistory)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        deviceId: deviceId ?? null,
        status,
        processedCount: result.processed,
        failedCount: result.failed,
        conflictCount: result.conflicts,
        retriedCount: result.retried,
        triggerType,
        startedAt,
        completedAt: new Date(),
      })
      .returning();

    await this.deps.mobileSyncService.touchStaffSync(
      { companyId: scope.companyId, userId: scope.userId, scope: 'technician' },
      deviceId,
    );

    await this.logAudit(
      scope,
      'sync_processed',
      'mobile_sync_history',
      history!.id,
      result as unknown as Record<string, unknown>,
    );
    return { history: this.toSyncHistorySummary(history!), result };
  }

  async captureFieldIntelligence(companyId: string): Promise<MobileFieldIntelligenceSummary> {
    const [
      completedJobs,
      syncFailures,
      activeDevices,
      totalDevices,
      vehicleCount,
      documentationCount,
    ] = await Promise.all([
      this.deps.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')),
        columns: { id: true, createdAt: true, updatedAt: true },
        limit: 200,
      }),
      this.deps.db
        .select({ value: count() })
        .from(mobileSyncQueue)
        .where(and(eq(mobileSyncQueue.companyId, companyId), eq(mobileSyncQueue.status, 'failed'))),
      this.deps.db
        .select({ value: count() })
        .from(mobileDevices)
        .where(and(eq(mobileDevices.companyId, companyId), eq(mobileDevices.status, 'active'))),
      this.deps.db
        .select({ value: count() })
        .from(mobileDevices)
        .where(eq(mobileDevices.companyId, companyId)),
      this.deps.db
        .select({ value: count() })
        .from(vehicles)
        .where(eq(vehicles.companyId, companyId)),
      this.deps.db
        .select({ value: count() })
        .from(mobileMediaAssets)
        .where(eq(mobileMediaAssets.companyId, companyId)),
    ]);

    const durations = completedJobs
      .filter((j) => j.createdAt && j.updatedAt)
      .map((j) => (j.updatedAt.getTime() - j.createdAt.getTime()) / 60000);
    const avgJobDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    const syncHealthScore =
      Number(syncFailures[0]?.value ?? 0) === 0
        ? 100
        : Math.max(0, 100 - Number(syncFailures[0]?.value ?? 0) * 5);
    const deviceHealthScore =
      Number(totalDevices[0]?.value ?? 0) === 0
        ? null
        : Math.round(
            (Number(activeDevices[0]?.value ?? 0) / Number(totalDevices[0]?.value ?? 1)) * 100,
          );

    const [snapshot] = await this.deps.db
      .insert(mobileFieldIntelligenceSnapshots)
      .values({
        companyId,
        technicianProductivityScore:
          completedJobs.length > 0 ? String(Math.min(100, completedJobs.length * 2)) : null,
        travelEfficiencyScore: null,
        avgJobDurationMinutes: avgJobDuration != null ? String(Math.round(avgJobDuration)) : null,
        firstTimeFixRate: null,
        offlineUsageCount: Number(syncFailures[0]?.value ?? 0),
        syncHealthScore: String(syncHealthScore),
        deviceHealthScore: deviceHealthScore != null ? String(deviceHealthScore) : null,
        fleetUtilizationPercent: Number(vehicleCount[0]?.value ?? 0) > 0 ? '50' : null,
        safetyComplianceScore: Number(documentationCount[0]?.value ?? 0) > 0 ? '80' : null,
        metrics: {
          completedJobCount: completedJobs.length,
          failedSyncCount: Number(syncFailures[0]?.value ?? 0),
          activeDeviceCount: Number(activeDevices[0]?.value ?? 0),
        },
      })
      .returning();

    return this.toFieldIntelligenceSummary(snapshot!);
  }

  async createFleetProvider(
    scope: StaffScope,
    input: CreateMobileFleetProviderRequest,
  ): Promise<MobileFleetTrackingProviderSummary> {
    if (!MOBILE_FLEET_PROVIDER_TYPES.includes(input.providerType)) {
      throw new EnterpriseMobilePlatformError('VALIDATION_ERROR', 'Invalid fleet provider type');
    }

    const [created] = await this.deps.db
      .insert(mobileFleetTrackingProviders)
      .values({
        companyId: scope.companyId,
        providerType: input.providerType,
        name: input.name,
        endpointUrl: input.endpointUrl ?? null,
        credentialsVaultKey: input.credentialsVaultKey ?? null,
        vehicleMapping: input.vehicleMapping ?? {},
        isActive: input.isActive ?? false,
      })
      .returning();

    await this.logAudit(
      scope,
      'fleet_provider_created',
      'mobile_fleet_tracking_provider',
      created!.id,
    );
    return this.toFleetProviderSummary(created!);
  }

  async testFleetProvider(
    scope: StaffScope,
    providerId: string,
  ): Promise<MobileFleetTrackingProviderSummary> {
    const provider = await this.ensureFleetProvider(scope.companyId, providerId);
    const fleetContext = await this.deps.integrationsService.buildFleetTrackingContext(
      scope.companyId,
    );

    let status = 'failed';
    let message = 'Provider connectivity test failed — configure credentials and endpoint.';

    if (provider.providerType === 'cartrack' && fleetContext.cartrackConnected) {
      status = 'passed';
      message = 'Cartrack connection verified via existing integration.';
    } else if (provider.endpointUrl) {
      status = 'pending';
      message = 'Endpoint configured — live connectivity test requires provider credentials.';
    }

    const [updated] = await this.deps.db
      .update(mobileFleetTrackingProviders)
      .set({
        lastTestAt: new Date(),
        lastTestStatus: status,
        lastTestMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(mobileFleetTrackingProviders.id, providerId))
      .returning();

    return this.toFleetProviderSummary(updated!);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateMobilePlatformConfigRequest,
  ): Promise<MobilePlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(mobilePlatformConfig)
      .set({
        offlineRetentionDays: input.offlineRetentionDays ?? existing.offlineRetentionDays,
        syncFrequencyMinutes: input.syncFrequencyMinutes ?? existing.syncFrequencyMinutes,
        pushNotificationsEnabled:
          input.pushNotificationsEnabled ?? existing.pushNotificationsEnabled,
        biometricLoginRequired: input.biometricLoginRequired ?? existing.biometricLoginRequired,
        pwaEnabled: input.pwaEnabled ?? existing.pwaEnabled,
        backgroundSyncEnabled: input.backgroundSyncEnabled ?? existing.backgroundSyncEnabled,
        notificationPolicies: input.notificationPolicies ?? existing.notificationPolicies,
        mobilePolicies: input.mobilePolicies ?? existing.mobilePolicies,
        updatedAt: new Date(),
      })
      .where(eq(mobilePlatformConfig.id, existing.id))
      .returning();

    await this.logAudit(scope, 'platform_config_updated', 'mobile_platform_config', updated!.id);
    return this.toPlatformConfigSummary(updated!);
  }

  async buildAuraContext(scope: StaffScope): Promise<EnterpriseMobilePlatformAuraContext> {
    const dashboard = await this.getDashboard(scope.companyId);
    const workforceContext =
      await this.deps.mobileWorkforceService.buildWorkforceAuraContext(scope);

    return {
      summary: `${workforceContext.summary} ${dashboard.activeDeviceCount} active device(s), ${dashboard.pendingSyncQueueCount} pending sync item(s).`,
      assignedJobCount: workforceContext.assignedJobCount,
      activeDeviceCount: dashboard.activeDeviceCount,
      pendingSyncCount: dashboard.pendingSyncQueueCount,
      pendingConflictCount: dashboard.pendingConflictCount,
      fleetProviderCount: dashboard.fleetProviders.length,
      cartrackConnected: dashboard.cartrackConnected,
    };
  }

  private async getPlatformConfig(companyId: string): Promise<MobilePlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return this.toPlatformConfigSummary(row);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.mobilePlatformConfig.findFirst({
      where: eq(mobilePlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(mobilePlatformConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async listDevices(companyId: string): Promise<MobileDeviceSummary[]> {
    const rows = await this.deps.db.query.mobileDevices.findMany({
      where: eq(mobileDevices.companyId, companyId),
      orderBy: [desc(mobileDevices.lastSeenAt)],
      limit: 100,
    });

    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const userRows =
      userIds.length > 0
        ? await this.deps.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), inArray(users.id, userIds)),
            columns: { id: true, firstName: true, lastName: true },
          })
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.userId ? (userMap.get(row.userId) ?? null) : null,
      deviceKey: row.deviceKey,
      deviceName: row.deviceName,
      platform: row.platform,
      status: row.status,
      appVersion: row.appVersion,
      osVersion: row.osVersion,
      encryptionVerified: row.encryptionVerified,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      registeredAt: row.registeredAt.toISOString(),
    }));
  }

  private async listSyncHistory(
    companyId: string,
    limit: number,
  ): Promise<MobileSyncHistorySummary[]> {
    const rows = await this.deps.db.query.mobileSyncHistory.findMany({
      where: eq(mobileSyncHistory.companyId, companyId),
      orderBy: [desc(mobileSyncHistory.startedAt)],
      limit,
    });
    return rows.map((row) => this.toSyncHistorySummary(row));
  }

  private async listFleetProviders(
    companyId: string,
  ): Promise<MobileFleetTrackingProviderSummary[]> {
    const rows = await this.deps.db.query.mobileFleetTrackingProviders.findMany({
      where: eq(mobileFleetTrackingProviders.companyId, companyId),
      orderBy: [desc(mobileFleetTrackingProviders.createdAt)],
    });
    return rows.map((row) => this.toFleetProviderSummary(row));
  }

  private async listRecentMediaAssets(
    companyId: string,
    limit: number,
  ): Promise<MobileMediaAssetSummary[]> {
    const rows = await this.deps.db.query.mobileMediaAssets.findMany({
      where: eq(mobileMediaAssets.companyId, companyId),
      orderBy: [desc(mobileMediaAssets.createdAt)],
      limit,
    });
    return rows.map((row) => this.toMediaSummary(row));
  }

  private async getLatestFieldIntelligence(
    companyId: string,
  ): Promise<MobileFieldIntelligenceSummary | null> {
    const row = await this.deps.db.query.mobileFieldIntelligenceSnapshots.findFirst({
      where: eq(mobileFieldIntelligenceSnapshots.companyId, companyId),
      orderBy: [desc(mobileFieldIntelligenceSnapshots.capturedAt)],
    });
    return row ? this.toFieldIntelligenceSummary(row) : null;
  }

  private async countPendingSyncQueue(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ value: count() })
      .from(mobileSyncQueue)
      .where(and(eq(mobileSyncQueue.companyId, companyId), eq(mobileSyncQueue.status, 'pending')));
    return Number(row?.value ?? 0);
  }

  private async countPendingConflicts(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ value: count() })
      .from(mobileSyncConflicts)
      .where(
        and(
          eq(mobileSyncConflicts.companyId, companyId),
          eq(mobileSyncConflicts.status, 'pending'),
        ),
      );
    return Number(row?.value ?? 0);
  }

  private async ensureDevice(companyId: string, deviceId: string) {
    const device = await this.deps.db.query.mobileDevices.findFirst({
      where: and(eq(mobileDevices.id, deviceId), eq(mobileDevices.companyId, companyId)),
    });
    if (!device) throw new EnterpriseMobilePlatformError('NOT_FOUND', 'Device not found');
    return device;
  }

  private async ensureFleetProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.mobileFleetTrackingProviders.findFirst({
      where: and(
        eq(mobileFleetTrackingProviders.id, providerId),
        eq(mobileFleetTrackingProviders.companyId, companyId),
      ),
    });
    if (!provider) throw new EnterpriseMobilePlatformError('NOT_FOUND', 'Fleet provider not found');
    return provider;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.deps.db.insert(mobileAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata,
    });
  }

  private toDeviceSummary(row: typeof mobileDevices.$inferSelect): MobileDeviceSummary {
    return {
      id: row.id,
      userId: row.userId,
      userName: null,
      deviceKey: row.deviceKey,
      deviceName: row.deviceName,
      platform: row.platform,
      status: row.status,
      appVersion: row.appVersion,
      osVersion: row.osVersion,
      encryptionVerified: row.encryptionVerified,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      registeredAt: row.registeredAt.toISOString(),
    };
  }

  private toPlatformConfigSummary(
    row: typeof mobilePlatformConfig.$inferSelect,
  ): MobilePlatformConfigSummary {
    return {
      offlineRetentionDays: row.offlineRetentionDays,
      syncFrequencyMinutes: row.syncFrequencyMinutes,
      pushNotificationsEnabled: row.pushNotificationsEnabled,
      biometricLoginRequired: row.biometricLoginRequired,
      pwaEnabled: row.pwaEnabled,
      backgroundSyncEnabled: row.backgroundSyncEnabled,
      notificationPolicies: row.notificationPolicies ?? {},
      mobilePolicies: row.mobilePolicies ?? {},
    };
  }

  private toSyncHistorySummary(
    row: typeof mobileSyncHistory.$inferSelect,
  ): MobileSyncHistorySummary {
    return {
      id: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      status: row.status,
      processedCount: row.processedCount,
      failedCount: row.failedCount,
      conflictCount: row.conflictCount,
      retriedCount: row.retriedCount,
      triggerType: row.triggerType,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  private toMediaSummary(row: typeof mobileMediaAssets.$inferSelect): MobileMediaAssetSummary {
    return {
      id: row.id,
      jobId: row.jobId,
      mediaType: row.mediaType,
      title: row.title,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toFleetProviderSummary(
    row: typeof mobileFleetTrackingProviders.$inferSelect,
  ): MobileFleetTrackingProviderSummary {
    const mapping = row.vehicleMapping ?? {};
    return {
      id: row.id,
      providerType: row.providerType,
      name: row.name,
      isActive: row.isActive,
      endpointUrl: row.endpointUrl,
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus,
      lastTestMessage: row.lastTestMessage,
      vehicleMappingCount: Object.keys(mapping).length,
    };
  }

  private toFieldIntelligenceSummary(
    row: typeof mobileFieldIntelligenceSnapshots.$inferSelect,
  ): MobileFieldIntelligenceSummary {
    return {
      technicianProductivityScore:
        row.technicianProductivityScore != null ? Number(row.technicianProductivityScore) : null,
      travelEfficiencyScore:
        row.travelEfficiencyScore != null ? Number(row.travelEfficiencyScore) : null,
      avgJobDurationMinutes:
        row.avgJobDurationMinutes != null ? Number(row.avgJobDurationMinutes) : null,
      firstTimeFixRate: row.firstTimeFixRate != null ? Number(row.firstTimeFixRate) : null,
      offlineUsageCount: row.offlineUsageCount,
      syncHealthScore: row.syncHealthScore != null ? Number(row.syncHealthScore) : null,
      deviceHealthScore: row.deviceHealthScore != null ? Number(row.deviceHealthScore) : null,
      fleetUtilizationPercent:
        row.fleetUtilizationPercent != null ? Number(row.fleetUtilizationPercent) : null,
      safetyComplianceScore:
        row.safetyComplianceScore != null ? Number(row.safetyComplianceScore) : null,
      capturedAt: row.capturedAt.toISOString(),
    };
  }
}
