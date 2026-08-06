import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  buildFarCartrackSnapshot,
  buildFarCostSnapshot,
  buildFarEfficiencySnapshot,
  buildFarMaintenanceSnapshot,
  buildFarRecommendationDraft,
  buildFarUsageSnapshot,
  canAccessFleetAiRecommendations,
  canApproveFleetAiRecommendations,
  canManageFleetAiRecommendationsSettings,
  canWriteFleetAiRecommendations,
  defaultFarSettings,
  FAR_PRODUCT_COPY,
  listFarAuraConnections,
  type AcknowledgeFarInsightRequest,
  type CreateFarAuraInsightRequest,
  type DecideFarRecommendationRequest,
  type FarAuraInsightSummary,
  type FarCostSignal,
  type FarDashboard,
  type FarMaintenanceSignal,
  type FarRecommendationDraftSummary,
  type FarRecommendationKind,
  type FarSettings,
  type FarUsageSignal,
  type FarVehicleSignal,
  type RefreshFarRecommendationsRequest,
  type UpdateFarSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetMaintenanceSchedules,
  farAuraInsights,
  farRecommendationDrafts,
  farSettings,
  fleetOperatingCosts,
  gpsPositions,
  integrationConnections,
  integrationVehicleMappings,
  jobVehicleAssignments,
  jobs,
  securityAuditLogs,
  vehicles,
} from '@titan/db';

export class FleetAiRecommendationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FleetAiRecommendationsError';
  }
}

export type FarActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class FleetAiRecommendationsService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: FarActor): void {
    if (!canAccessFleetAiRecommendations(actor)) {
      throw new FleetAiRecommendationsError(
        'FORBIDDEN',
        'Fleet AI Recommendations requires Owner/Admin or fleet access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: FarActor): void {
    this.assertRead(actor);
    if (!canWriteFleetAiRecommendations(actor)) {
      throw new FleetAiRecommendationsError(
        'FORBIDDEN',
        'Write actions require Owner/Admin or fleet:write / fleet_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: FarActor): void {
    this.assertWrite(actor);
    if (!canApproveFleetAiRecommendations(actor)) {
      throw new FleetAiRecommendationsError(
        'FORBIDDEN',
        'Only Company Owner/Admin may approve Fleet AI recommendation drafts.',
      );
    }
  }

  private assertManageSettings(actor: FarActor): void {
    this.assertWrite(actor);
    if (!canManageFleetAiRecommendationsSettings(actor)) {
      throw new FleetAiRecommendationsError(
        'FORBIDDEN',
        'Only Company Owner/Admin may change Fleet AI Recommendations settings.',
      );
    }
  }

  private async recordAudit(
    actor: FarActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'fleet_ai_recommendations',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoVehicleDecision: false,
        inventedGps: false,
        inventedCosts: false,
      },
    });
  }

  private toDraft(row: typeof farRecommendationDrafts.$inferSelect): FarRecommendationDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      vehicleId: row.vehicleId,
      jobId: row.jobId,
      autoVehicleDecision: false,
      inventedGps: false,
      inventedCosts: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof farAuraInsights.$inferSelect): FarAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceRecommendationId: row.sourceRecommendationId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof farSettings.$inferSelect): FarSettings {
    return defaultFarSettings({
      id: row.id,
      recommendationDraftsEnabled: row.recommendationDraftsEnabled,
      maintenanceSuggestionsEnabled: row.maintenanceSuggestionsEnabled,
      costReductionEnabled: row.costReductionEnabled,
      routeImprovementsEnabled: row.routeImprovementsEnabled,
      efficiencyInsightsEnabled: row.efficiencyInsightsEnabled,
      replacementPlanningEnabled: row.replacementPlanningEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: FarActor): Promise<FarSettings> {
    const existing = await this.db.query.farSettings.findFirst({
      where: eq(farSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(farSettings)
      .values({
        companyId: actor.companyId,
        autoVehicleDecisionEnabled: false,
        inventGpsEnabled: false,
        inventCostsEnabled: false,
        recommendationDraftsEnabled: true,
        maintenanceSuggestionsEnabled: true,
        costReductionEnabled: true,
        routeImprovementsEnabled: true,
        efficiencyInsightsEnabled: true,
        replacementPlanningEnabled: true,
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
    };
  }

  private async loadCostSignals(companyId: string): Promise<FarCostSignal[]> {
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
      recordedAt: row.recordedAt.toISOString(),
    }));
  }

  private async loadUsageSignals(companyId: string): Promise<FarUsageSignal[]> {
    const rows = await this.db
      .select({
        id: jobVehicleAssignments.id,
        vehicleId: jobVehicleAssignments.vehicleId,
        vehicleName: vehicles.name,
        jobId: jobVehicleAssignments.jobId,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        scheduledAt: jobs.scheduledAt,
        assignedAt: jobVehicleAssignments.assignedAt,
      })
      .from(jobVehicleAssignments)
      .innerJoin(vehicles, eq(jobVehicleAssignments.vehicleId, vehicles.id))
      .innerJoin(jobs, eq(jobVehicleAssignments.jobId, jobs.id))
      .where(eq(jobVehicleAssignments.companyId, companyId))
      .orderBy(desc(jobVehicleAssignments.assignedAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      jobStatus: row.jobStatus,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      assignedAt: row.assignedAt.toISOString(),
    }));
  }

  private async loadMaintenanceSignals(companyId: string): Promise<FarMaintenanceSignal[]> {
    const vehicleRows = await this.db.query.vehicles.findMany({
      where: and(eq(vehicles.companyId, companyId), eq(vehicles.status, 'maintenance')),
      orderBy: [desc(vehicles.updatedAt)],
      limit: 50,
    });

    const fromStatus: FarMaintenanceSignal[] = vehicleRows.map((v) => ({
      id: `vehicle-status:${v.id}`,
      source: 'vehicle_status',
      vehicleId: v.id,
      vehicleName: v.name,
      title: `${v.name} marked maintenance`,
      status: v.status,
      nextDueAt: null,
      amountCents: null,
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

    const fromSchedules: FarMaintenanceSignal[] = schedules
      .filter((s) => Boolean(s.asset?.vehicleId))
      .map((s) => ({
        id: s.id,
        source: 'asset_schedule' as const,
        vehicleId: s.asset?.vehicleId ?? null,
        vehicleName: s.asset?.name ?? null,
        title: s.title,
        status: s.isActive ? 'active' : 'inactive',
        nextDueAt: s.nextDueAt?.toISOString() ?? null,
        amountCents: null,
      }));

    const maintenanceCosts = await this.db.query.fleetOperatingCosts.findMany({
      where: and(
        eq(fleetOperatingCosts.companyId, companyId),
        inArray(fleetOperatingCosts.costType, ['maintenance', 'repair', 'tyre']),
      ),
      with: { vehicle: true },
      orderBy: [desc(fleetOperatingCosts.recordedAt)],
      limit: 50,
    });

    const fromCosts: FarMaintenanceSignal[] = maintenanceCosts.map((row) => ({
      id: `cost:${row.id}`,
      source: 'operating_cost' as const,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicle?.name ?? null,
      title: `${row.costType} cost ${row.amountCents}¢`,
      status: row.costType,
      nextDueAt: null,
      amountCents: row.amountCents,
    }));

    return [...fromStatus, ...fromSchedules, ...fromCosts].slice(0, 100);
  }

  private async loadVehicleSignals(companyId: string): Promise<FarVehicleSignal[]> {
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
      this.loadCostSignals(companyId),
      this.loadUsageSignals(companyId),
    ]);

    const mappedIds = new Set(
      mappings.filter((m) => m.vehicleId).map((m) => m.vehicleId as string),
    );

    return vehicleRows.map((v) => {
      const vehicleCosts = costs.filter((c) => c.vehicleId === v.id);
      const fuelCostCents = vehicleCosts
        .filter((c) => c.costType === 'fuel')
        .reduce((sum, c) => sum + c.amountCents, 0);
      const maintenanceCostCents = vehicleCosts
        .filter((c) => ['maintenance', 'repair', 'tyre'].includes(c.costType))
        .reduce((sum, c) => sum + c.amountCents, 0);
      const totalCostCents = vehicleCosts.reduce((sum, c) => sum + c.amountCents, 0);
      const assignee = v.assignedUser
        ? `${v.assignedUser.firstName} ${v.assignedUser.lastName}`.trim() || null
        : null;

      return {
        vehicleId: v.id,
        name: v.name,
        licensePlate: v.licensePlate,
        status: v.status,
        year: v.year,
        cartrackMapped: mappedIds.has(v.id),
        jobAssignmentCount: usage.filter((u) => u.vehicleId === v.id).length,
        totalCostCents,
        fuelCostCents,
        maintenanceCostCents,
        assignedUserId: v.assignedUserId,
        assignedUserName: assignee,
      };
    });
  }

  async getDashboard(actor: FarActor): Promise<FarDashboard> {
    this.assertRead(actor);

    const settings = await this.ensureSettings(actor);
    const [
      cartrackSignals,
      vehicleSignals,
      costSignals,
      usageSignals,
      maintenanceSignals,
      drafts,
      insights,
    ] = await Promise.all([
      this.loadCartrackSignals(actor.companyId),
      this.loadVehicleSignals(actor.companyId),
      this.loadCostSignals(actor.companyId),
      this.loadUsageSignals(actor.companyId),
      this.loadMaintenanceSignals(actor.companyId),
      this.db.query.farRecommendationDrafts.findMany({
        where: eq(farRecommendationDrafts.companyId, actor.companyId),
        orderBy: [desc(farRecommendationDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.farAuraInsights.findMany({
        where: eq(farAuraInsights.companyId, actor.companyId),
        orderBy: [desc(farAuraInsights.createdAt)],
        limit: 50,
      }),
    ]);

    const cartrack = buildFarCartrackSnapshot(cartrackSignals);
    const totalCostCents = costSignals.reduce((sum, r) => sum + r.amountCents, 0);
    const costs = buildFarCostSnapshot({
      costRecordCount: costSignals.length,
      totalCostCents,
    });
    const usage = buildFarUsageSnapshot({
      assignmentCount: usageSignals.length,
      distinctVehicles: new Set(usageSignals.map((u) => u.vehicleId)).size,
      distinctJobs: new Set(usageSignals.map((u) => u.jobId)).size,
    });
    const vehiclesInMaintenance = vehicleSignals.filter((v) => v.status === 'maintenance').length;
    const maintenance = buildFarMaintenanceSnapshot({
      signalCount: maintenanceSignals.length,
      vehiclesInMaintenance,
    });
    const efficiency = buildFarEfficiencySnapshot({
      vehicleCount: vehicleSignals.length,
      mappedVehicleCount: vehicleSignals.filter((v) => v.cartrackMapped).length,
      assignedVehicleCount: vehicleSignals.filter((v) => v.assignedUserId).length,
    });

    const recommendationDrafts = drafts.map((d) => this.toDraft(d));
    const pendingApprovals = recommendationDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;

    const summary =
      vehicleSignals.length === 0
        ? 'Fleet AI Recommendations is ready. No real vehicles yet — maintenance, cost, route, efficiency, and replacement drafts stay unavailable (not invented).'
        : `Real fleet optimisation signals: ${vehicleSignals.length} vehicle(s), Cartrack ${cartrack.availability}, costs ${costs.availability}, usage ${usage.availability}, ${pendingApprovals} pending recommendation draft(s). Recommendations only — never auto vehicle decisions.`;

    return {
      summary,
      productClarification: { ...FAR_PRODUCT_COPY },
      policy: {
        autoVehicleDecisionEnabled: false,
        inventGpsEnabled: false,
        inventCostsEnabled: false,
        requiresOwnerApproval: true,
        recommendationsOnly: true,
      },
      cartrack,
      costs,
      maintenance,
      usage,
      efficiency,
      vehicleSignals,
      maintenanceSignals,
      costSignals,
      usageSignals,
      recommendationDrafts,
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listFarAuraConnections(),
      settings,
      pendingApprovals,
      totalVehicles: vehicleSignals.length,
    };
  }

  async refreshRecommendationDrafts(
    actor: FarActor,
    input: RefreshFarRecommendationsRequest = {},
  ): Promise<{ created: number; drafts: FarRecommendationDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.recommendationDraftsEnabled) {
      throw new FleetAiRecommendationsError(
        'INVALID_STATE',
        'Recommendation drafts are disabled in Fleet AI Recommendations settings.',
      );
    }

    const [vehicleSignals, costSignals, usageSignals, maintenanceSignals, cartrack] =
      await Promise.all([
        this.loadVehicleSignals(actor.companyId),
        this.loadCostSignals(actor.companyId),
        this.loadUsageSignals(actor.companyId),
        this.loadMaintenanceSignals(actor.companyId),
        this.loadCartrackSignals(actor.companyId),
      ]);

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: FarRecommendationDraftSummary[] = [];

    const tryCreate = async (
      kind: FarRecommendationKind,
      vehicleId: string | null,
      vehicleName: string | null,
      detail: string,
      jobId: string | null = null,
      metadata: Record<string, unknown> = {},
    ) => {
      const existingOpen = await this.db.query.farRecommendationDrafts.findFirst({
        where: and(
          eq(farRecommendationDrafts.companyId, actor.companyId),
          eq(farRecommendationDrafts.kind, kind),
          vehicleId
            ? eq(farRecommendationDrafts.vehicleId, vehicleId)
            : sql`${farRecommendationDrafts.vehicleId} is null`,
          inArray(farRecommendationDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) return;

      const draft = buildFarRecommendationDraft({ kind, vehicleName, detail });
      const [inserted] = await this.db
        .insert(farRecommendationDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          vehicleId,
          jobId,
          autoVehicleDecision: false,
          inventedGps: false,
          inventedCosts: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_fleet_signals', ...metadata },
        })
        .returning();

      created.push(this.toDraft(inserted));
      await this.recordAudit(actor, 'far_recommendation_draft_created', inserted.id, {
        kind,
        vehicleId,
        jobId,
      });
    };

    if (settings.maintenanceSuggestionsEnabled) {
      for (const row of maintenanceSignals.slice(0, 10)) {
        await tryCreate(
          'maintenance_suggestion',
          row.vehicleId,
          row.vehicleName,
          `${row.title} (source: ${row.source}${row.nextDueAt ? `, next due ${row.nextDueAt}` : ''}${row.amountCents != null ? `, amount ${row.amountCents}¢` : ''}). Review and schedule manually — not executed automatically.`,
          null,
          { maintenanceSource: row.source },
        );
      }
    }

    if (settings.costReductionEnabled && costSignals.length > 0) {
      const costsByVehicle = new Map<string, number>();
      for (const row of costSignals) {
        if (!row.vehicleId) continue;
        costsByVehicle.set(
          row.vehicleId,
          (costsByVehicle.get(row.vehicleId) ?? 0) + row.amountCents,
        );
      }
      const highCost = [...costsByVehicle.entries()].sort((a, b) => b[1] - a[1])[0];
      if (highCost && highCost[1] > 0) {
        const profile = vehicleSignals.find((p) => p.vehicleId === highCost[0]);
        await tryCreate(
          'cost_reduction',
          highCost[0],
          profile?.name ?? null,
          `Highest recorded operating cost among vehicles with real cost rows: ${highCost[1]} cents across ${costSignals.filter((c) => c.vehicleId === highCost[0]).length} record(s). Review fuel/maintenance/repair spend — no automatic purchase or sell.`,
          null,
          { totalCostCents: highCost[1] },
        );
      }
    }

    if (settings.routeImprovementsEnabled && usageSignals.length > 0) {
      const busy = [...vehicleSignals]
        .filter((v) => v.jobAssignmentCount > 0)
        .sort((a, b) => b.jobAssignmentCount - a.jobAssignmentCount)[0];
      if (busy) {
        const sampleJob = usageSignals.find((u) => u.vehicleId === busy.vehicleId);
        if (cartrack.cartrackConnected && cartrack.gpsPositionCount > 0) {
          await tryCreate(
            'route_improvement',
            busy.vehicleId,
            busy.name,
            `${busy.name} has ${busy.jobAssignmentCount} real job–vehicle assignment(s) with ${cartrack.gpsPositionCount} GPS position record(s). Review routing/clustering against live Cartrack + jobs — GPS not invented; no auto reassignment.`,
            sampleJob?.jobId ?? null,
            { gpsPositionCount: cartrack.gpsPositionCount },
          );
        } else {
          await tryCreate(
            'route_improvement',
            busy.vehicleId,
            busy.name,
            `${busy.name} has ${busy.jobAssignmentCount} job assignment(s), but Cartrack GPS is unavailable — route improvement is limited to job–vehicle contrast only (GPS not invented). Connect/sync Cartrack for richer route signals.`,
            null,
            { cartrackAvailable: false },
          );
        }
      }
    }

    if (settings.efficiencyInsightsEnabled && vehicleSignals.length > 0) {
      const unmappedInUse = vehicleSignals.filter(
        (v) => (v.status === 'in_use' || v.jobAssignmentCount > 0) && !v.cartrackMapped,
      );
      const idleAssigned = vehicleSignals.filter(
        (v) => v.assignedUserId && v.jobAssignmentCount === 0,
      );
      if (unmappedInUse.length > 0) {
        await tryCreate(
          'fleet_efficiency',
          unmappedInUse[0]!.vehicleId,
          unmappedInUse[0]!.name,
          `${unmappedInUse.length} active/in-use vehicle(s) without Cartrack mapping — utilisation visibility is limited (GPS not invented). Map vehicles under Integrations when ready.`,
          null,
          { unmappedInUseCount: unmappedInUse.length },
        );
      } else if (idleAssigned.length > 0 && usageSignals.length > 0) {
        await tryCreate(
          'fleet_efficiency',
          idleAssigned[0]!.vehicleId,
          idleAssigned[0]!.name,
          `${idleAssigned[0]!.name} is assigned to ${idleAssigned[0]!.assignedUserName ?? 'a technician'} but has no job–vehicle assignment rows — efficiency gap from real assignment contrast, not invented trips.`,
          null,
          { idleAssignedCount: idleAssigned.length },
        );
      }
    }

    if (settings.replacementPlanningEnabled && costSignals.length > 0) {
      const costlyAging = [...vehicleSignals]
        .filter((v) => v.totalCostCents > 0)
        .sort((a, b) => b.totalCostCents - a.totalCostCents)[0];
      if (costlyAging && costlyAging.totalCostCents > 0) {
        const yearHint =
          costlyAging.year != null
            ? ` recorded year ${costlyAging.year}`
            : ' (year unknown — not invented)';
        await tryCreate(
          'replacement_planning',
          costlyAging.vehicleId,
          costlyAging.name,
          `${costlyAging.name}${yearHint} has the highest real operating-cost total (${costlyAging.totalCostCents}¢; fuel ${costlyAging.fuelCostCents}¢, maintenance-related ${costlyAging.maintenanceCostCents}¢). Replacement planning draft only — does not sell or replace the vehicle.`,
          null,
          { totalCostCents: costlyAging.totalCostCents, year: costlyAging.year },
        );
      }
    }

    return { created: created.length, drafts: created };
  }

  async decideRecommendationDraft(
    actor: FarActor,
    draftId: string,
    input: DecideFarRecommendationRequest,
  ): Promise<FarRecommendationDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.farRecommendationDrafts.findFirst({
      where: and(
        eq(farRecommendationDrafts.id, draftId),
        eq(farRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new FleetAiRecommendationsError('NOT_FOUND', 'Recommendation draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new FleetAiRecommendationsError(
        'INVALID_STATE',
        `Recommendation draft is already ${existing.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'acknowledge'
          ? 'acknowledged'
          : 'rejected';

    const [updated] = await this.db
      .update(farRecommendationDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoVehicleDecision: false,
        inventedGps: false,
        inventedCosts: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(farRecommendationDrafts.id, draftId),
          eq(farRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `far_recommendation_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      vehicleMutated: false,
      maintenanceExecuted: false,
      vehicleReplaced: false,
    });

    return this.toDraft(updated);
  }

  async updateSettings(actor: FarActor, input: UpdateFarSettingsRequest): Promise<FarSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof farSettings.$inferInsert> = {
      autoVehicleDecisionEnabled: false,
      inventGpsEnabled: false,
      inventCostsEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.recommendationDraftsEnabled !== undefined) {
      patch.recommendationDraftsEnabled = input.recommendationDraftsEnabled;
    }
    if (input.maintenanceSuggestionsEnabled !== undefined) {
      patch.maintenanceSuggestionsEnabled = input.maintenanceSuggestionsEnabled;
    }
    if (input.costReductionEnabled !== undefined) {
      patch.costReductionEnabled = input.costReductionEnabled;
    }
    if (input.routeImprovementsEnabled !== undefined) {
      patch.routeImprovementsEnabled = input.routeImprovementsEnabled;
    }
    if (input.efficiencyInsightsEnabled !== undefined) {
      patch.efficiencyInsightsEnabled = input.efficiencyInsightsEnabled;
    }
    if (input.replacementPlanningEnabled !== undefined) {
      patch.replacementPlanningEnabled = input.replacementPlanningEnabled;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(farSettings)
      .set(patch)
      .where(eq(farSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'far_settings_updated', updated.id, {
      recommendationDraftsEnabled: updated.recommendationDraftsEnabled,
      maintenanceSuggestionsEnabled: updated.maintenanceSuggestionsEnabled,
      costReductionEnabled: updated.costReductionEnabled,
      routeImprovementsEnabled: updated.routeImprovementsEnabled,
      efficiencyInsightsEnabled: updated.efficiencyInsightsEnabled,
      replacementPlanningEnabled: updated.replacementPlanningEnabled,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: FarActor,
    input: CreateFarAuraInsightRequest,
  ): Promise<FarAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceRecommendationId) {
      const source = await this.db.query.farRecommendationDrafts.findFirst({
        where: and(
          eq(farRecommendationDrafts.id, input.sourceRecommendationId),
          eq(farRecommendationDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new FleetAiRecommendationsError(
          'NOT_FOUND',
          'Source recommendation draft not found.',
        );
      }
    }

    const [inserted] = await this.db
      .insert(farAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title,
        insight: input.insight,
        href: input.href ?? null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        createdByUserId: actor.userId,
        metadata: {
          invented: false,
          autoVehicleDecision: false,
          inventedGps: false,
          inventedCosts: false,
        },
      })
      .returning();

    await this.recordAudit(actor, 'far_aura_insight_created', inserted.id, {
      target: input.target,
      sourceRecommendationId: input.sourceRecommendationId ?? null,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeInsight(
    actor: FarActor,
    insightId: string,
    input: AcknowledgeFarInsightRequest,
  ): Promise<FarAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.farAuraInsights.findFirst({
      where: and(eq(farAuraInsights.id, insightId), eq(farAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new FleetAiRecommendationsError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(farAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(farAuraInsights.id, insightId), eq(farAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `far_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
