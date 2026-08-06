import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  buildViCartrackSnapshot,
  buildViCostSnapshot,
  buildViFuelSnapshot,
  buildViInsightDraft,
  buildViMaintenanceSnapshot,
  buildViUsageSnapshot,
  canAccessVehicleIntelligence,
  canApproveVehicleIntelligenceDrafts,
  canManageVehicleIntelligenceSettings,
  canWriteVehicleIntelligence,
  defaultViSettings,
  listViAuraConnections,
  VI_PRODUCT_COPY,
  type AcknowledgeViInsightRequest,
  type CreateViAuraInsightRequest,
  type DecideViInsightDraftRequest,
  type RefreshViInsightsRequest,
  type UpdateViSettingsRequest,
  type ViAuraInsightSummary,
  type ViCostRow,
  type ViDashboard,
  type ViFuelRow,
  type ViInsightDraftSummary,
  type ViInsightKind,
  type ViMaintenanceRow,
  type ViSettings,
  type ViUsageRow,
  type ViVehicleProfile,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetMaintenanceSchedules,
  fleetOperatingCosts,
  gpsPositions,
  integrationConnections,
  integrationVehicleMappings,
  jobVehicleAssignments,
  jobs,
  securityAuditLogs,
  users,
  vehicles,
  viAuraInsights,
  viInsightDrafts,
  viSettings,
} from '@titan/db';

export class VehicleIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VehicleIntelligenceError';
  }
}

export type ViActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class VehicleIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: ViActor): void {
    if (!canAccessVehicleIntelligence(actor)) {
      throw new VehicleIntelligenceError(
        'FORBIDDEN',
        'Vehicle Intelligence requires fleet access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: ViActor): void {
    this.assertRead(actor);
    if (!canWriteVehicleIntelligence(actor)) {
      throw new VehicleIntelligenceError(
        'FORBIDDEN',
        'Write actions require fleet:write or fleet_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: ViActor): void {
    this.assertWrite(actor);
    if (!canApproveVehicleIntelligenceDrafts(actor)) {
      throw new VehicleIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve vehicle intelligence insight drafts.',
      );
    }
  }

  private assertManageSettings(actor: ViActor): void {
    this.assertWrite(actor);
    if (!canManageVehicleIntelligenceSettings(actor)) {
      throw new VehicleIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Vehicle Intelligence sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: ViActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'vehicle_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoFleetMutation: false,
        inventedTracking: false,
      },
    });
  }

  private toDraft(row: typeof viInsightDrafts.$inferSelect): ViInsightDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      vehicleId: row.vehicleId,
      jobId: row.jobId,
      autoFleetMutation: false,
      inventedTracking: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof viAuraInsights.$inferSelect): ViAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceInsightDraftId: row.sourceInsightDraftId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof viSettings.$inferSelect): ViSettings {
    return defaultViSettings({
      id: row.id,
      insightDraftsEnabled: row.insightDraftsEnabled,
      fuelSignalsEnabled: row.fuelSignalsEnabled,
      maintenanceSignalsEnabled: row.maintenanceSignalsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: ViActor): Promise<ViSettings> {
    const existing = await this.db.query.viSettings.findFirst({
      where: eq(viSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(viSettings)
      .values({
        companyId: actor.companyId,
        autoFleetMutationEnabled: false,
        inventTrackingEnabled: false,
        insightDraftsEnabled: true,
        fuelSignalsEnabled: true,
        maintenanceSignalsEnabled: true,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async loadCartrackSignals(companyId: string) {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });

    const hasCredentials = Boolean(connection?.credentialsEncrypted);
    const cartrackConnected = connection?.status === 'connected' && hasCredentials;

    const mappings = connection
      ? await this.db.query.integrationVehicleMappings.findMany({
          where: and(
            eq(integrationVehicleMappings.companyId, companyId),
            eq(integrationVehicleMappings.integrationConnectionId, connection.id),
            eq(integrationVehicleMappings.status, 'mapped'),
            isNotNull(integrationVehicleMappings.vehicleId),
          ),
        })
      : [];

    const [positionCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(gpsPositions)
      .where(eq(gpsPositions.companyId, companyId));

    return {
      cartrackConnected,
      connectionStatus: connection?.status ?? null,
      mappedVehicleCount: mappings.length,
      gpsPositionCount: positionCountRow?.count ?? 0,
      lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
      mappings,
    };
  }

  private async loadCostRows(companyId: string): Promise<ViCostRow[]> {
    const rows = await this.db.query.fleetOperatingCosts.findMany({
      where: eq(fleetOperatingCosts.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(fleetOperatingCosts.recordedAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicle?.name ?? null,
      costType: row.costType,
      amountCents: row.amountCents,
      currency: row.currency,
      notes: row.notes,
      recordedAt: row.recordedAt.toISOString(),
    }));
  }

  private async loadFuelRows(companyId: string): Promise<ViFuelRow[]> {
    const costs = await this.loadCostRows(companyId);
    return costs
      .filter((row) => row.costType === 'fuel')
      .map((row) => ({
        id: row.id,
        vehicleId: row.vehicleId,
        vehicleName: row.vehicleName,
        amountCents: row.amountCents,
        currency: row.currency,
        notes: row.notes,
        recordedAt: row.recordedAt,
      }));
  }

  private async loadUsageHistory(companyId: string): Promise<ViUsageRow[]> {
    const rows = await this.db
      .select({
        id: jobVehicleAssignments.id,
        vehicleId: jobVehicleAssignments.vehicleId,
        vehicleName: vehicles.name,
        jobId: jobVehicleAssignments.jobId,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        assignedUserId: jobs.assignedUserId,
        scheduledAt: jobs.scheduledAt,
        assignedAt: jobVehicleAssignments.assignedAt,
        unassignedAt: jobVehicleAssignments.unassignedAt,
      })
      .from(jobVehicleAssignments)
      .innerJoin(vehicles, eq(jobVehicleAssignments.vehicleId, vehicles.id))
      .innerJoin(jobs, eq(jobVehicleAssignments.jobId, jobs.id))
      .where(eq(jobVehicleAssignments.companyId, companyId))
      .orderBy(desc(jobVehicleAssignments.assignedAt))
      .limit(100);

    const assigneeIds = [
      ...new Set(rows.map((r) => r.assignedUserId).filter((id): id is string => Boolean(id))),
    ];
    const assignees =
      assigneeIds.length > 0
        ? await this.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), inArray(users.id, assigneeIds)),
            columns: { id: true, firstName: true, lastName: true },
          })
        : [];
    const nameById = new Map(
      assignees.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || null]),
    );

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      jobStatus: row.jobStatus,
      assignedUserId: row.assignedUserId,
      assignedUserName: row.assignedUserId ? (nameById.get(row.assignedUserId) ?? null) : null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      assignedAt: row.assignedAt.toISOString(),
      unassignedAt: row.unassignedAt?.toISOString() ?? null,
    }));
  }

  private async loadMaintenanceRows(companyId: string): Promise<ViMaintenanceRow[]> {
    const vehicleRows = await this.db.query.vehicles.findMany({
      where: and(eq(vehicles.companyId, companyId), eq(vehicles.status, 'maintenance')),
      orderBy: [desc(vehicles.updatedAt)],
      limit: 50,
    });

    const fromStatus: ViMaintenanceRow[] = vehicleRows.map((v) => ({
      id: `vehicle-status:${v.id}`,
      source: 'vehicle_status',
      vehicleId: v.id,
      vehicleName: v.name,
      assetId: null,
      title: `${v.name} marked maintenance`,
      status: v.status,
      nextDueAt: null,
    }));

    const schedules = await this.db.query.assetMaintenanceSchedules.findMany({
      where: and(
        eq(assetMaintenanceSchedules.companyId, companyId),
        eq(assetMaintenanceSchedules.isActive, true),
      ),
      with: { asset: true },
      orderBy: [desc(assetMaintenanceSchedules.updatedAt)],
      limit: 100,
    });

    const fromSchedules: ViMaintenanceRow[] = schedules
      .filter((s) => Boolean(s.asset?.vehicleId))
      .map((s) => ({
        id: s.id,
        source: 'asset_schedule' as const,
        vehicleId: s.asset?.vehicleId ?? null,
        vehicleName: s.asset?.name ?? null,
        assetId: s.assetId,
        title: s.title,
        status: s.isActive ? 'active' : 'inactive',
        nextDueAt: s.nextDueAt?.toISOString() ?? null,
      }));

    return [...fromStatus, ...fromSchedules].slice(0, 100);
  }

  private async loadVehicleProfiles(companyId: string): Promise<ViVehicleProfile[]> {
    const [vehicleRows, mappings, costs, usage] = await Promise.all([
      this.db.query.vehicles.findMany({
        where: eq(vehicles.companyId, companyId),
        with: { assignedUser: true },
        orderBy: [desc(vehicles.updatedAt)],
        limit: 200,
      }),
      this.db.query.integrationVehicleMappings.findMany({
        where: and(
          eq(integrationVehicleMappings.companyId, companyId),
          eq(integrationVehicleMappings.status, 'mapped'),
          isNotNull(integrationVehicleMappings.vehicleId),
        ),
      }),
      this.loadCostRows(companyId),
      this.loadUsageHistory(companyId),
    ]);

    const mappingByVehicle = new Map(
      mappings
        .filter((m) => m.vehicleId)
        .map((m) => [m.vehicleId!, m]),
    );

    return vehicleRows.map((v) => {
      const vehicleCosts = costs.filter((c) => c.vehicleId === v.id);
      const fuelCostCents = vehicleCosts
        .filter((c) => c.costType === 'fuel')
        .reduce((sum, c) => sum + c.amountCents, 0);
      const totalCostCents = vehicleCosts.reduce((sum, c) => sum + c.amountCents, 0);
      const mapping = mappingByVehicle.get(v.id);
      const assignee = v.assignedUser
        ? `${v.assignedUser.firstName} ${v.assignedUser.lastName}`.trim() || null
        : null;

      return {
        vehicleId: v.id,
        name: v.name,
        make: v.make,
        model: v.model,
        year: v.year,
        licensePlate: v.licensePlate,
        vin: v.vin,
        status: v.status,
        assignedUserId: v.assignedUserId,
        assignedUserName: assignee,
        cartrackMapped: Boolean(mapping),
        externalVehicleId: mapping?.externalVehicleId ?? null,
        jobAssignmentCount: usage.filter((u) => u.vehicleId === v.id).length,
        fuelCostCents,
        totalCostCents,
      };
    });
  }

  async getDashboard(actor: ViActor): Promise<ViDashboard> {
    this.assertRead(actor);

    const settings = await this.ensureSettings(actor);
    const [
      cartrackSignals,
      vehicleProfiles,
      fuelRows,
      costRows,
      usageHistory,
      maintenanceRows,
      drafts,
      insights,
    ] = await Promise.all([
      this.loadCartrackSignals(actor.companyId),
      this.loadVehicleProfiles(actor.companyId),
      this.loadFuelRows(actor.companyId),
      this.loadCostRows(actor.companyId),
      this.loadUsageHistory(actor.companyId),
      this.loadMaintenanceRows(actor.companyId),
      this.db.query.viInsightDrafts.findMany({
        where: eq(viInsightDrafts.companyId, actor.companyId),
        orderBy: [desc(viInsightDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.viAuraInsights.findMany({
        where: eq(viAuraInsights.companyId, actor.companyId),
        orderBy: [desc(viAuraInsights.createdAt)],
        limit: 50,
      }),
    ]);

    const cartrack = buildViCartrackSnapshot({
      cartrackConnected: cartrackSignals.cartrackConnected,
      connectionStatus: cartrackSignals.connectionStatus,
      mappedVehicleCount: cartrackSignals.mappedVehicleCount,
      gpsPositionCount: cartrackSignals.gpsPositionCount,
      lastSyncAt: cartrackSignals.lastSyncAt,
    });

    const totalFuelCostCents = fuelRows.reduce((sum, r) => sum + r.amountCents, 0);
    const fuel = buildViFuelSnapshot({
      fuelRecordCount: fuelRows.length,
      totalFuelCostCents,
    });

    const usage = buildViUsageSnapshot({
      assignmentCount: usageHistory.length,
      distinctVehicles: new Set(usageHistory.map((u) => u.vehicleId)).size,
      distinctJobs: new Set(usageHistory.map((u) => u.jobId)).size,
    });

    const vehiclesInMaintenance = vehicleProfiles.filter((v) => v.status === 'maintenance').length;
    const maintenance = buildViMaintenanceSnapshot({
      signalCount: maintenanceRows.length,
      vehiclesInMaintenance,
    });

    const totalCostCents = costRows.reduce((sum, r) => sum + r.amountCents, 0);
    const costs = buildViCostSnapshot({
      costRecordCount: costRows.length,
      totalCostCents,
    });

    const insightDrafts = drafts.map((d) => this.toDraft(d));
    const pendingApprovals = insightDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;

    const technicianLinkCount = vehicleProfiles.filter((v) => v.assignedUserId).length;
    const scheduledJobLinkCount = usageHistory.filter((u: ViUsageRow) => u.scheduledAt).length;

    let summary: string;
    if (vehicleProfiles.length === 0) {
      summary =
        'Vehicle Intelligence is ready. No real vehicles yet — profiles, fuel, GPS, and usage stay unavailable (not invented).';
    } else {
      summary = `Real fleet signals: ${vehicleProfiles.length} vehicle(s), Cartrack ${cartrack.availability}, fuel ${fuel.availability}, usage ${usage.availability}, ${pendingApprovals} pending insight draft(s). Never invents GPS/fuel.`;
    }

    return {
      summary,
      productClarification: { ...VI_PRODUCT_COPY },
      policy: {
        autoFleetMutationEnabled: false,
        inventTrackingEnabled: false,
        requiresOwnerApproval: true,
        fakeTracking: false,
      },
      cartrack,
      fuel,
      usage,
      maintenance,
      costs,
      vehicleProfiles,
      fuelRows,
      maintenanceRows,
      costRows,
      usageHistory,
      insightDrafts,
      auraInsights: insights.map((i: typeof viAuraInsights.$inferSelect) => this.toInsight(i)),
      auraConnections: listViAuraConnections(),
      settings,
      pendingApprovals,
      totalVehicles: vehicleProfiles.length,
      technicianLinkCount,
      scheduledJobLinkCount,
    };
  }

  async refreshInsightDrafts(
    actor: ViActor,
    input: RefreshViInsightsRequest = {},
  ): Promise<{ created: number; drafts: ViInsightDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightDraftsEnabled) {
      throw new VehicleIntelligenceError(
        'INVALID_STATE',
        'Insight drafts are disabled in Vehicle Intelligence settings.',
      );
    }

    const [profiles, fuelRows, costRows, usageHistory, maintenanceRows, cartrack] =
      await Promise.all([
        this.loadVehicleProfiles(actor.companyId),
        this.loadFuelRows(actor.companyId),
        this.loadCostRows(actor.companyId),
        this.loadUsageHistory(actor.companyId),
        this.loadMaintenanceRows(actor.companyId),
        this.loadCartrackSignals(actor.companyId),
      ]);

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: ViInsightDraftSummary[] = [];

    const tryCreate = async (
      kind: ViInsightKind,
      vehicleId: string | null,
      vehicleName: string | null,
      detail: string,
      jobId: string | null = null,
      metadata: Record<string, unknown> = {},
    ) => {
      const existingOpen = await this.db.query.viInsightDrafts.findFirst({
        where: and(
          eq(viInsightDrafts.companyId, actor.companyId),
          eq(viInsightDrafts.kind, kind),
          vehicleId
            ? eq(viInsightDrafts.vehicleId, vehicleId)
            : sql`${viInsightDrafts.vehicleId} is null`,
          inArray(viInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) return;

      const draft = buildViInsightDraft({ kind, vehicleName, detail });
      const [inserted] = await this.db
        .insert(viInsightDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          vehicleId,
          jobId,
          autoFleetMutation: false,
          inventedTracking: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_fleet_signals', ...metadata },
        })
        .returning();

      created.push(this.toDraft(inserted));
      await this.recordAudit(actor, 'vi_insight_draft_created', inserted.id, {
        kind,
        vehicleId,
        jobId,
      });
    };

    if (settings.maintenanceSignalsEnabled) {
      for (const row of maintenanceRows) {
        await tryCreate(
          'maintenance_need',
          row.vehicleId,
          row.vehicleName,
          `${row.title} (source: ${row.source}${row.nextDueAt ? `, next due ${row.nextDueAt}` : ''}).`,
          null,
          { maintenanceSource: row.source, assetId: row.assetId },
        );
      }
    }

    const costsByVehicle = new Map<string, number>();
    for (const row of costRows) {
      if (!row.vehicleId) continue;
      costsByVehicle.set(row.vehicleId, (costsByVehicle.get(row.vehicleId) ?? 0) + row.amountCents);
    }
    const highCost = [...costsByVehicle.entries()].sort((a, b) => b[1] - a[1])[0];
    if (highCost && highCost[1] > 0) {
      const profile = profiles.find((p) => p.vehicleId === highCost[0]);
      await tryCreate(
        'cost_trend',
        highCost[0],
        profile?.name ?? null,
        `Highest recorded operating cost among vehicles with real cost rows: ${highCost[1]} cents across ${costRows.filter((c) => c.vehicleId === highCost[0]).length} record(s).`,
        null,
        { totalCostCents: highCost[1] },
      );
    }

    if (settings.fuelSignalsEnabled && fuelRows.length > 0) {
      const topFuel = [...fuelRows].sort((a, b) => b.amountCents - a.amountCents)[0];
      if (topFuel) {
        await tryCreate(
          'fuel_attention',
          topFuel.vehicleId,
          topFuel.vehicleName,
          `Latest high fuel operating-cost row: ${topFuel.amountCents} cents recorded at ${topFuel.recordedAt}. Fuel foundation only — not invented litres/GPS.`,
          null,
          { fuelCostId: topFuel.id },
        );
      }
    }

    const unmappedInUse = profiles.filter(
      (p) => p.status === 'in_use' && !p.cartrackMapped && !cartrack.cartrackConnected,
    );
    if (unmappedInUse.length > 0) {
      await tryCreate(
        'fleet_risk',
        unmappedInUse[0]?.vehicleId ?? null,
        unmappedInUse[0]?.name ?? null,
        `${unmappedInUse.length} in-use vehicle(s) without Cartrack connection/mapping — tracking risk is observational only (GPS not invented).`,
        null,
        { unmappedInUseCount: unmappedInUse.length },
      );
    }

    const assignedNoJobs = profiles.filter(
      (p) => p.assignedUserId && p.jobAssignmentCount === 0,
    );
    if (assignedNoJobs.length > 0 && usageHistory.length > 0) {
      // Only surface usage_gap when some usage exists company-wide (honest signal contrast).
      await tryCreate(
        'usage_gap',
        assignedNoJobs[0]!.vehicleId,
        assignedNoJobs[0]!.name,
        `${assignedNoJobs[0]!.name} has an assigned technician but no job–vehicle assignment rows yet — usage gap from real assignment contrast, not invented trips.`,
        null,
        { assignedNoJobCount: assignedNoJobs.length },
      );
    }

    return { created: created.length, drafts: created };
  }

  async decideInsightDraft(
    actor: ViActor,
    draftId: string,
    input: DecideViInsightDraftRequest,
  ): Promise<ViInsightDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.viInsightDrafts.findFirst({
      where: and(eq(viInsightDrafts.id, draftId), eq(viInsightDrafts.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new VehicleIntelligenceError('NOT_FOUND', 'Insight draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new VehicleIntelligenceError(
        'INVALID_STATE',
        `Insight draft is already ${existing.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'acknowledge'
          ? 'acknowledged'
          : 'rejected';

    const [updated] = await this.db
      .update(viInsightDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoFleetMutation: false,
        inventedTracking: false,
        updatedAt: new Date(),
      })
      .where(and(eq(viInsightDrafts.id, draftId), eq(viInsightDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `vi_insight_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      fleetMutated: false,
      trackingInvented: false,
    });

    return this.toDraft(updated);
  }

  async updateSettings(actor: ViActor, input: UpdateViSettingsRequest): Promise<ViSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof viSettings.$inferInsert> = {
      autoFleetMutationEnabled: false,
      inventTrackingEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.insightDraftsEnabled !== undefined) {
      patch.insightDraftsEnabled = input.insightDraftsEnabled;
    }
    if (input.fuelSignalsEnabled !== undefined) {
      patch.fuelSignalsEnabled = input.fuelSignalsEnabled;
    }
    if (input.maintenanceSignalsEnabled !== undefined) {
      patch.maintenanceSignalsEnabled = input.maintenanceSignalsEnabled;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(viSettings)
      .set(patch)
      .where(eq(viSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'vi_settings_updated', updated.id, {
      insightDraftsEnabled: updated.insightDraftsEnabled,
      fuelSignalsEnabled: updated.fuelSignalsEnabled,
      maintenanceSignalsEnabled: updated.maintenanceSignalsEnabled,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: ViActor,
    input: CreateViAuraInsightRequest,
  ): Promise<ViAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceInsightDraftId) {
      const source = await this.db.query.viInsightDrafts.findFirst({
        where: and(
          eq(viInsightDrafts.id, input.sourceInsightDraftId),
          eq(viInsightDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new VehicleIntelligenceError('NOT_FOUND', 'Source insight draft not found.');
      }
    }

    const [inserted] = await this.db
      .insert(viAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title,
        insight: input.insight,
        href: input.href ?? null,
        sourceInsightDraftId: input.sourceInsightDraftId ?? null,
        createdByUserId: actor.userId,
        metadata: { invented: false, autoFleetMutation: false },
      })
      .returning();

    await this.recordAudit(actor, 'vi_aura_insight_created', inserted.id, {
      target: input.target,
      sourceInsightDraftId: input.sourceInsightDraftId ?? null,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeInsight(
    actor: ViActor,
    insightId: string,
    input: AcknowledgeViInsightRequest,
  ): Promise<ViAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.viAuraInsights.findFirst({
      where: and(eq(viAuraInsights.id, insightId), eq(viAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new VehicleIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(viAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(viAuraInsights.id, insightId), eq(viAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `vi_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
