import { and, desc, eq } from 'drizzle-orm';
import type {
  AssetAuraContext,
  AssetCalibrationSummary,
  AssetEquipmentSummary,
  AssetExecutiveDashboard,
  AssetInspectionSummary,
  AssetLifecycleEventSummary,
  AssetLifecycleEventType,
  AssetMaintenanceActionSummary,
  AssetMaintenanceCostSummary,
  AssetMaintenanceRecordSummary,
  AssetMaintenanceScheduleSummary,
  AssetPerformanceAnalytics,
  CreateAssetCalibrationRequest,
  CreateAssetEquipmentRequest,
  CreateAssetInspectionRequest,
  CreateAssetMaintenanceActionRequest,
  CreateAssetMaintenanceCostRequest,
  CreateAssetMaintenanceRecordRequest,
  CreateAssetMaintenanceScheduleRequest,
  UpdateAssetEquipmentRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetCalibrations,
  assetEquipment,
  assetInspections,
  assetLifecycleEvents,
  assetMaintenanceActions,
  assetMaintenanceCosts,
  assetMaintenanceRecords,
  assetMaintenanceSchedules,
} from '@titan/db';
import type { FleetService } from './fleet.service.js';
import type { NotificationService } from './notification.service.js';

export class AssetEquipmentIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssetEquipmentIntelligenceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

export class AssetEquipmentIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly fleetService: FleetService,
    private readonly notificationService: NotificationService,
  ) {}

  async listAssets(companyId: string): Promise<AssetEquipmentSummary[]> {
    const rows = await this.db.query.assetEquipment.findMany({
      where: eq(assetEquipment.companyId, companyId),
      with: { vehicle: true, supplier: true, assignedTechnician: true },
      orderBy: [desc(assetEquipment.createdAt)],
      limit: 200,
    });
    return rows.map(toAssetSummary);
  }

  async getAsset(companyId: string, assetId: string): Promise<AssetEquipmentSummary | null> {
    const row = await this.db.query.assetEquipment.findFirst({
      where: and(eq(assetEquipment.id, assetId), eq(assetEquipment.companyId, companyId)),
      with: { vehicle: true, supplier: true, assignedTechnician: true },
    });
    return row ? toAssetSummary(row) : null;
  }

  async createAsset(
    scope: StaffScope,
    input: CreateAssetEquipmentRequest,
  ): Promise<AssetEquipmentSummary> {
    const name = input.name.trim();
    if (!name) {
      throw new AssetEquipmentIntelligenceError('VALIDATION_ERROR', 'Asset name is required');
    }

    if (input.vehicleId) {
      const vehicle = await this.fleetService.getVehicle(scope.companyId, input.vehicleId);
      if (!vehicle) {
        throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Linked vehicle not found');
      }
    }

    const [created] = await this.db
      .insert(assetEquipment)
      .values({
        companyId: scope.companyId,
        assetType: input.assetType,
        name,
        description: input.description?.trim() || null,
        serialNumber: input.serialNumber?.trim() || null,
        barcodeReference: input.barcodeReference?.trim() || null,
        vehicleId: input.vehicleId ?? null,
        supplierId: input.supplierId ?? null,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
        warrantyExpiresAt: input.warrantyExpiresAt ? new Date(input.warrantyExpiresAt) : null,
        depreciationReference: input.depreciationReference?.trim() || null,
        assignedTechnicianId: input.assignedTechnicianId ?? null,
        branchKey: input.branchKey?.trim() || null,
        status: input.status ?? 'active',
        condition: input.condition ?? 'good',
        locationText: input.locationText?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordLifecycleEvent(
      scope,
      created!.id,
      'acquisition',
      'Asset acquired',
      input.description,
    );

    return (await this.getAsset(scope.companyId, created!.id))!;
  }

  async updateAsset(
    companyId: string,
    assetId: string,
    input: UpdateAssetEquipmentRequest,
  ): Promise<AssetEquipmentSummary> {
    const existing = await this.getAsset(companyId, assetId);
    if (!existing) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    await this.db
      .update(assetEquipment)
      .set({
        name: input.name?.trim() ?? undefined,
        description: input.description?.trim() ?? undefined,
        status: input.status ?? undefined,
        condition: input.condition ?? undefined,
        assignedTechnicianId: input.assignedTechnicianId ?? undefined,
        branchKey: input.branchKey?.trim() ?? undefined,
        locationText: input.locationText?.trim() ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(assetEquipment.id, assetId), eq(assetEquipment.companyId, companyId)));

    return (await this.getAsset(companyId, assetId))!;
  }

  async listLifecycleHistory(
    companyId: string,
    assetId?: string,
  ): Promise<AssetLifecycleEventSummary[]> {
    const rows = await this.db.query.assetLifecycleEvents.findMany({
      where: assetId
        ? and(
            eq(assetLifecycleEvents.companyId, companyId),
            eq(assetLifecycleEvents.assetId, assetId),
          )
        : eq(assetLifecycleEvents.companyId, companyId),
      with: { asset: true },
      orderBy: [desc(assetLifecycleEvents.occurredAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      eventType: row.eventType,
      title: row.title,
      description: row.description,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listMaintenanceSchedules(companyId: string): Promise<AssetMaintenanceScheduleSummary[]> {
    const rows = await this.db.query.assetMaintenanceSchedules.findMany({
      where: eq(assetMaintenanceSchedules.companyId, companyId),
      with: { asset: true },
      orderBy: [desc(assetMaintenanceSchedules.nextDueAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      scheduleType: row.scheduleType,
      title: row.title,
      description: row.description,
      intervalDays: row.intervalDays,
      intervalUsageHours: row.intervalUsageHours,
      nextDueAt: row.nextDueAt?.toISOString() ?? null,
      lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createMaintenanceSchedule(
    scope: StaffScope,
    input: CreateAssetMaintenanceScheduleRequest,
  ): Promise<AssetMaintenanceScheduleSummary> {
    const asset = await this.getAsset(scope.companyId, input.assetId);
    if (!asset) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    const [created] = await this.db
      .insert(assetMaintenanceSchedules)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        scheduleType: input.scheduleType,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        intervalDays: input.intervalDays ?? null,
        intervalUsageHours: input.intervalUsageHours ?? null,
        nextDueAt: input.nextDueAt ? new Date(input.nextDueAt) : null,
      })
      .returning();

    const schedules = await this.listMaintenanceSchedules(scope.companyId);
    return schedules.find((row) => row.id === created!.id)!;
  }

  async listMaintenanceRecords(companyId: string): Promise<AssetMaintenanceRecordSummary[]> {
    const rows = await this.db.query.assetMaintenanceRecords.findMany({
      where: eq(assetMaintenanceRecords.companyId, companyId),
      with: { asset: true, assignedTechnician: true },
      orderBy: [desc(assetMaintenanceRecords.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      maintenanceType: row.maintenanceType,
      status: row.status,
      title: row.title,
      description: row.description,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      assignedTechnicianId: row.assignedTechnicianId,
      assignedTechnicianName: row.assignedTechnician
        ? `${row.assignedTechnician.firstName} ${row.assignedTechnician.lastName}`.trim()
        : null,
      jobId: row.jobId,
      labourCostCents: row.labourCostCents,
      partsCostCents: row.partsCostCents,
      totalCostCents: row.totalCostCents,
      downtimeHours: row.downtimeHours != null ? Number(row.downtimeHours) : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createMaintenanceRecord(
    scope: StaffScope,
    input: CreateAssetMaintenanceRecordRequest,
  ): Promise<AssetMaintenanceRecordSummary> {
    const asset = await this.getAsset(scope.companyId, input.assetId);
    if (!asset) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    const labourCostCents = input.labourCostCents ?? 0;
    const partsCostCents = input.partsCostCents ?? 0;

    const [created] = await this.db
      .insert(assetMaintenanceRecords)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        maintenanceType: input.maintenanceType,
        status: 'pending_approval',
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        assignedTechnicianId: input.assignedTechnicianId ?? null,
        jobId: input.jobId ?? null,
        labourCostCents,
        partsCostCents,
        totalCostCents: labourCostCents + partsCostCents,
        downtimeHours: input.downtimeHours != null ? String(input.downtimeHours) : null,
        notes: input.notes?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordLifecycleEvent(
      scope,
      input.assetId,
      'maintenance',
      input.title,
      input.description,
    );

    const records = await this.listMaintenanceRecords(scope.companyId);
    return records.find((row) => row.id === created!.id)!;
  }

  async listInspections(companyId: string): Promise<AssetInspectionSummary[]> {
    const rows = await this.db.query.assetInspections.findMany({
      where: eq(assetInspections.companyId, companyId),
      with: { asset: true, inspector: true },
      orderBy: [desc(assetInspections.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      inspectionType: row.inspectionType,
      status: row.status,
      findings: row.findings,
      inspectorUserId: row.inspectorUserId,
      inspectorName: row.inspector
        ? `${row.inspector.firstName} ${row.inspector.lastName}`.trim()
        : null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createInspection(
    scope: StaffScope,
    input: CreateAssetInspectionRequest,
  ): Promise<AssetInspectionSummary> {
    const asset = await this.getAsset(scope.companyId, input.assetId);
    if (!asset) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    const [created] = await this.db
      .insert(assetInspections)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        inspectionType: input.inspectionType,
        status: 'scheduled',
        checklist: input.checklist ?? [],
        findings: input.findings?.trim() || null,
        inspectorUserId: input.inspectorUserId ?? scope.userId,
      })
      .returning();

    const inspections = await this.listInspections(scope.companyId);
    return inspections.find((row) => row.id === created!.id)!;
  }

  async listCalibrations(companyId: string): Promise<AssetCalibrationSummary[]> {
    const rows = await this.db.query.assetCalibrations.findMany({
      where: eq(assetCalibrations.companyId, companyId),
      with: { asset: true },
      orderBy: [desc(assetCalibrations.expiresAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      certificationName: row.certificationName,
      calibratedAt: row.calibratedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      complianceStatus: row.complianceStatus,
      renewalRecommendation: row.renewalRecommendation,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createCalibration(
    scope: StaffScope,
    input: CreateAssetCalibrationRequest,
  ): Promise<AssetCalibrationSummary> {
    const asset = await this.getAsset(scope.companyId, input.assetId);
    if (!asset) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    const [created] = await this.db
      .insert(assetCalibrations)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        certificationName: input.certificationName.trim(),
        calibratedAt: input.calibratedAt ? new Date(input.calibratedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        complianceStatus: input.complianceStatus ?? 'valid',
        renewalRecommendation: input.renewalRecommendation?.trim() || null,
      })
      .returning();

    await this.recordLifecycleEvent(
      scope,
      input.assetId,
      'calibration',
      input.certificationName,
      input.renewalRecommendation,
    );

    const calibrations = await this.listCalibrations(scope.companyId);
    return calibrations.find((row) => row.id === created!.id)!;
  }

  async listMaintenanceCosts(companyId: string): Promise<AssetMaintenanceCostSummary[]> {
    const rows = await this.db.query.assetMaintenanceCosts.findMany({
      where: eq(assetMaintenanceCosts.companyId, companyId),
      with: { asset: true },
      orderBy: [desc(assetMaintenanceCosts.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      maintenanceRecordId: row.maintenanceRecordId,
      costType: row.costType,
      amountCents: row.amountCents,
      currency: row.currency,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createMaintenanceCost(
    scope: StaffScope,
    input: CreateAssetMaintenanceCostRequest,
  ): Promise<AssetMaintenanceCostSummary> {
    const asset = await this.getAsset(scope.companyId, input.assetId);
    if (!asset) {
      throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
    }

    const [created] = await this.db
      .insert(assetMaintenanceCosts)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId,
        maintenanceRecordId: input.maintenanceRecordId ?? null,
        costType: input.costType,
        amountCents: input.amountCents ?? 0,
        currency: input.currency ?? 'USD',
        notes: input.notes?.trim() || null,
      })
      .returning();

    const costs = await this.listMaintenanceCosts(scope.companyId);
    return costs.find((row) => row.id === created!.id)!;
  }

  async listActions(companyId: string, status?: string): Promise<AssetMaintenanceActionSummary[]> {
    const rows = await this.db.query.assetMaintenanceActions.findMany({
      where: status
        ? and(
            eq(assetMaintenanceActions.companyId, companyId),
            eq(assetMaintenanceActions.status, status as never),
          )
        : eq(assetMaintenanceActions.companyId, companyId),
      with: { asset: true },
      orderBy: [desc(assetMaintenanceActions.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreateAssetMaintenanceActionRequest,
  ): Promise<AssetMaintenanceActionSummary> {
    const subject = input.subject.trim();
    const recommendation = input.recommendation.trim();
    if (!subject || !recommendation) {
      throw new AssetEquipmentIntelligenceError(
        'VALIDATION_ERROR',
        'Subject and recommendation are required',
      );
    }

    if (input.assetId) {
      const asset = await this.getAsset(scope.companyId, input.assetId);
      if (!asset) {
        throw new AssetEquipmentIntelligenceError('NOT_FOUND', 'Asset not found');
      }
    }

    const [created] = await this.db
      .insert(assetMaintenanceActions)
      .values({
        companyId: scope.companyId,
        assetId: input.assetId ?? null,
        actionType: input.actionType,
        status: 'pending_approval',
        subject,
        recommendation,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'asset_alert',
      title: 'Asset action pending approval',
      body: subject,
      entityType: 'asset_maintenance_action',
      entityId: created!.id,
    });

    const actions = await this.listActions(scope.companyId);
    return actions.find((row) => row.id === created!.id)!;
  }

  async getPerformanceAnalytics(companyId: string): Promise<AssetPerformanceAnalytics> {
    const [assets, records, costs, lifecycleEvents] = await Promise.all([
      this.listAssets(companyId),
      this.listMaintenanceRecords(companyId),
      this.listMaintenanceCosts(companyId),
      this.listLifecycleHistory(companyId),
    ]);

    const now = Date.now();
    const ages = assets
      .filter((asset) => asset.purchaseDate)
      .map(
        (asset) => (now - new Date(asset.purchaseDate!).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
    const averageAssetAgeYears =
      ages.length > 0
        ? Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10
        : null;

    const maintenanceFrequencyByAsset = assets.map((asset) => ({
      assetId: asset.id,
      name: asset.name,
      maintenanceCount: records.filter((record) => record.assetId === asset.id).length,
    }));

    const totalDowntimeHours = records.reduce(
      (sum, record) => sum + (record.downtimeHours ?? 0),
      0,
    );
    const totalMaintenanceCostCents = costs.reduce((sum, cost) => sum + cost.amountCents, 0);
    const warrantyRecoveryCents = costs
      .filter((cost) => cost.costType === 'warranty_recovery')
      .reduce((sum, cost) => sum + cost.amountCents, 0);

    const reliabilityScores = maintenanceFrequencyByAsset.map((row) => ({
      assetId: row.assetId,
      name: row.name,
      reliabilityScore:
        row.maintenanceCount === 0 ? 100 : Math.max(0, 100 - row.maintenanceCount * 5),
    }));

    const replacementRecommendations = assets
      .filter(
        (asset) =>
          asset.condition === 'poor' ||
          asset.condition === 'critical' ||
          asset.status === 'maintenance',
      )
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        reason:
          asset.condition === 'critical'
            ? 'Critical condition'
            : asset.condition === 'poor'
              ? 'Poor condition'
              : 'Extended maintenance status',
      }));

    const lifecycleTrends = buildLifecycleTrends(lifecycleEvents);

    return {
      totalAssets: assets.length,
      activeAssetCount: assets.filter((asset) => asset.status === 'active').length,
      maintenanceAssetCount: assets.filter((asset) => asset.status === 'maintenance').length,
      retiredAssetCount: assets.filter(
        (asset) => asset.status === 'retired' || asset.status === 'disposed',
      ).length,
      averageAssetAgeYears,
      totalMaintenanceCostCents,
      totalDowntimeHours,
      warrantyRecoveryCents,
      currency: costs[0]?.currency ?? 'USD',
      maintenanceFrequencyByAsset,
      reliabilityScores,
      replacementRecommendations,
      lifecycleTrends,
    };
  }

  async getExecutiveDashboard(companyId: string): Promise<AssetExecutiveDashboard> {
    const [analytics, schedules, inspections, calibrations, pendingActions] = await Promise.all([
      this.getPerformanceAnalytics(companyId),
      this.listMaintenanceSchedules(companyId),
      this.listInspections(companyId),
      this.listCalibrations(companyId),
      this.listActions(companyId, 'pending_approval'),
    ]);

    const now = Date.now();
    const upcomingMaintenance = schedules
      .filter((schedule) => schedule.isActive && schedule.nextDueAt)
      .sort((a, b) => new Date(a.nextDueAt!).getTime() - new Date(b.nextDueAt!).getTime())
      .slice(0, 10);

    const overdueInspections = inspections.filter(
      (inspection) => inspection.status === 'overdue' || inspection.status === 'scheduled',
    );

    const expiringCalibrations = calibrations.filter((calibration) => {
      if (!calibration.expiresAt) return calibration.complianceStatus === 'expiring';
      return new Date(calibration.expiresAt).getTime() <= now + 30 * 24 * 60 * 60 * 1000;
    });

    return {
      summary: `${analytics.totalAssets} asset(s), ${pendingActions.length} pending action(s), ${analytics.totalMaintenanceCostCents} total maintenance cost (cents).`,
      analytics,
      upcomingMaintenance,
      overdueInspections,
      expiringCalibrations,
      pendingActions,
    };
  }

  async buildAssetAuraContext(companyId: string): Promise<AssetAuraContext> {
    const [analytics, schedules, inspections, calibrations, pendingActions, pendingRecords] =
      await Promise.all([
        this.getPerformanceAnalytics(companyId),
        this.listMaintenanceSchedules(companyId),
        this.listInspections(companyId),
        this.listCalibrations(companyId),
        this.listActions(companyId, 'pending_approval'),
        this.db.query.assetMaintenanceRecords.findMany({
          where: and(
            eq(assetMaintenanceRecords.companyId, companyId),
            eq(assetMaintenanceRecords.status, 'pending_approval'),
          ),
        }),
      ]);

    const now = Date.now();
    const overdueInspectionCount = inspections.filter((row) => row.status === 'overdue').length;
    const expiringCalibrationCount = calibrations.filter((row) => {
      if (!row.expiresAt)
        return row.complianceStatus === 'expiring' || row.complianceStatus === 'expired';
      return new Date(row.expiresAt).getTime() <= now + 30 * 24 * 60 * 60 * 1000;
    }).length;

    const dueScheduleCount = schedules.filter(
      (row) => row.isActive && row.nextDueAt && new Date(row.nextDueAt).getTime() <= now,
    ).length;

    return {
      summary: `${analytics.totalAssets} asset(s), ${pendingRecords.length} pending maintenance record(s), ${dueScheduleCount} due schedule(s).`,
      totalAssets: analytics.totalAssets,
      activeAssetCount: analytics.activeAssetCount,
      pendingMaintenanceCount: pendingRecords.length,
      overdueInspectionCount,
      expiringCalibrationCount,
      pendingActionCount: pendingActions.length,
      totalMaintenanceCostCents: analytics.totalMaintenanceCostCents,
      currency: analytics.currency,
    };
  }

  private async recordLifecycleEvent(
    scope: StaffScope,
    assetId: string,
    eventType: AssetLifecycleEventType,
    title: string,
    description?: string | null,
  ) {
    await this.db.insert(assetLifecycleEvents).values({
      companyId: scope.companyId,
      assetId,
      eventType,
      title: title.trim(),
      description: description?.trim() || null,
      createdByUserId: scope.userId,
    });
  }
}

function toAssetSummary(row: {
  id: string;
  assetType: AssetEquipmentSummary['assetType'];
  name: string;
  description: string | null;
  serialNumber: string | null;
  barcodeReference: string | null;
  vehicleId: string | null;
  supplierId: string | null;
  purchaseDate: Date | null;
  warrantyExpiresAt: Date | null;
  depreciationReference: string | null;
  assignedTechnicianId: string | null;
  branchKey: string | null;
  status: AssetEquipmentSummary['status'];
  condition: AssetEquipmentSummary['condition'];
  locationText: string | null;
  createdAt: Date;
  updatedAt: Date;
  vehicle?: { name: string } | null;
  supplier?: { name: string } | null;
  assignedTechnician?: { firstName: string; lastName: string } | null;
}): AssetEquipmentSummary {
  return {
    id: row.id,
    assetType: row.assetType,
    name: row.name,
    description: row.description,
    serialNumber: row.serialNumber,
    barcodeReference: row.barcodeReference,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicle?.name ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    purchaseDate: row.purchaseDate?.toISOString() ?? null,
    warrantyExpiresAt: row.warrantyExpiresAt?.toISOString() ?? null,
    depreciationReference: row.depreciationReference,
    assignedTechnicianId: row.assignedTechnicianId,
    assignedTechnicianName: row.assignedTechnician
      ? `${row.assignedTechnician.firstName} ${row.assignedTechnician.lastName}`.trim()
      : null,
    branchKey: row.branchKey,
    status: row.status,
    condition: row.condition,
    locationText: row.locationText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildLifecycleTrends(events: AssetLifecycleEventSummary[]) {
  const buckets = new Map<string, { acquisitionCount: number; retirementCount: number }>();
  for (const event of events) {
    const date = new Date(event.occurredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entry = buckets.get(key) ?? { acquisitionCount: 0, retirementCount: 0 };
    if (event.eventType === 'acquisition') entry.acquisitionCount += 1;
    if (event.eventType === 'retirement' || event.eventType === 'disposal')
      entry.retirementCount += 1;
    buckets.set(key, entry);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, counts]) => ({ period, ...counts }));
}
