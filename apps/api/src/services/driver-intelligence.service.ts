import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  buildDriBehaviourSnapshot,
  buildDriCartrackSnapshot,
  buildDriRecommendationDraft,
  buildDriRouteEfficiencyRow,
  buildDriTripSnapshot,
  buildDriUsageSnapshot,
  canAccessDriverIntelligence,
  canManageDriverIntelligenceSettings,
  canWriteDriverIntelligence,
  computeIdleRatio,
  defaultDriSettings,
  DRI_PRODUCT_COPY,
  listDriAuraConnections,
  type AcknowledgeDriInsightRequest,
  type CreateDriAuraInsightRequest,
  type DecideDriRecommendationRequest,
  type DriAuraInsightSummary,
  type DriBehaviourEventType,
  type DriBehaviourRow,
  type DriDashboard,
  type DriDriverProfile,
  type DriRecommendationKind,
  type DriRecommendationSummary,
  type DriRouteEfficiencyRow,
  type DriSettings,
  type DriTripRow,
  type DriVehicleUsageRow,
  type RefreshDriRecommendationsRequest,
  type UpdateDriSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  driAuraInsights,
  driRecommendationDrafts,
  driSettings,
  fleetDriverBehaviourEvents,
  gpsPositions,
  integrationConnections,
  integrationVehicleMappings,
  jobVehicleAssignments,
  jobs,
  roles,
  securityAuditLogs,
  users,
  vehicles,
} from '@titan/db';
import type { FleetIntelligenceService } from './fleet-intelligence.service.js';

export class DriverIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DriverIntelligenceError';
  }
}

export type DriActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const BEHAVIOUR_TYPES = new Set<string>([
  'speeding',
  'harsh_braking',
  'harsh_acceleration',
  'excessive_idling',
  'route_deviation',
]);

function asBehaviourType(value: string): DriBehaviourEventType {
  if (BEHAVIOUR_TYPES.has(value)) return value as DriBehaviourEventType;
  return 'route_deviation';
}

export class DriverIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly fleetIntelligenceService: FleetIntelligenceService,
  ) {}

  private assertOwnerAdmin(actor: DriActor): void {
    if (!canAccessDriverIntelligence(actor)) {
      throw new DriverIntelligenceError(
        'FORBIDDEN',
        'Driver Intelligence requires Owner or Admin access. Technicians and clients cannot view driver behaviour intelligence.',
      );
    }
  }

  private assertWrite(actor: DriActor): void {
    this.assertOwnerAdmin(actor);
    if (!canWriteDriverIntelligence(actor)) {
      throw new DriverIntelligenceError(
        'FORBIDDEN',
        'Write actions require Owner or Admin access.',
      );
    }
  }

  private assertManageSettings(actor: DriActor): void {
    this.assertWrite(actor);
    if (!canManageDriverIntelligenceSettings(actor)) {
      throw new DriverIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may change Driver Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: DriActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'driver_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoDiscipline: false,
        inventGps: false,
        fakeGps: false,
        fakeBehaviour: false,
        disciplineExecuted: false,
        ownerAdminOnly: true,
      },
    });
  }

  private displayName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  private toRecommendation(
    row: typeof driRecommendationDrafts.$inferSelect,
  ): DriRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      driverUserId: row.driverUserId,
      vehicleId: row.vehicleId,
      autoDiscipline: false,
      inventedGps: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof driAuraInsights.$inferSelect): DriAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceRecommendationId: row.sourceRecommendationId,
      driverUserId: row.driverUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof driSettings.$inferSelect): DriSettings {
    return defaultDriSettings({
      id: row.id,
      recommendationDraftsEnabled: row.recommendationDraftsEnabled,
      behaviourSignalsEnabled: row.behaviourSignalsEnabled,
      tripSignalsEnabled: row.tripSignalsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: DriActor): Promise<DriSettings> {
    const existing = await this.db.query.driSettings.findFirst({
      where: eq(driSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(driSettings)
      .values({
        companyId: actor.companyId,
        recommendationDraftsEnabled: true,
        behaviourSignalsEnabled: true,
        tripSignalsEnabled: true,
        autoDisciplineEnabled: false,
        inventGpsEnabled: false,
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

  private async loadVehicles(companyId: string) {
    return this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
      with: { assignedUser: true },
      orderBy: [desc(vehicles.updatedAt)],
      limit: 300,
    });
  }

  private async loadUsageAssignments(companyId: string) {
    return this.db
      .select({
        id: jobVehicleAssignments.id,
        vehicleId: jobVehicleAssignments.vehicleId,
        vehicleName: vehicles.name,
        licensePlate: vehicles.licensePlate,
        vehicleStatus: vehicles.status,
        vehicleAssignedUserId: vehicles.assignedUserId,
        jobId: jobVehicleAssignments.jobId,
        assignedUserId: jobs.assignedUserId,
        assignedAt: jobVehicleAssignments.assignedAt,
      })
      .from(jobVehicleAssignments)
      .innerJoin(vehicles, eq(jobVehicleAssignments.vehicleId, vehicles.id))
      .innerJoin(jobs, eq(jobVehicleAssignments.jobId, jobs.id))
      .where(eq(jobVehicleAssignments.companyId, companyId))
      .orderBy(desc(jobVehicleAssignments.assignedAt))
      .limit(500);
  }

  private async loadBehaviourRows(
    companyId: string,
    vehicleAssigneeById: Map<string, { userId: string; name: string }>,
  ): Promise<DriBehaviourRow[]> {
    const rows = await this.db.query.fleetDriverBehaviourEvents.findMany({
      where: eq(fleetDriverBehaviourEvents.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(fleetDriverBehaviourEvents.occurredAt)],
      limit: 500,
    });

    return rows.map((row) => {
      const assignee = row.vehicleId ? vehicleAssigneeById.get(row.vehicleId) : undefined;
      return {
        id: row.id,
        vehicleId: row.vehicleId,
        vehicleName: row.vehicle?.name ?? null,
        driverUserId: assignee?.userId ?? null,
        driverName: assignee?.name ?? null,
        eventType: asBehaviourType(row.eventType),
        severity: row.severity,
        occurredAt: row.occurredAt.toISOString(),
      };
    });
  }

  private async loadTripRows(
    companyId: string,
    vehicleAssigneeById: Map<string, { userId: string; name: string }>,
  ): Promise<DriTripRow[]> {
    const trips = await this.fleetIntelligenceService.getTripHistory(companyId);
    return trips.map((trip) => {
      const assignee = trip.vehicleId ? vehicleAssigneeById.get(trip.vehicleId) : undefined;
      return {
        vehicleId: trip.vehicleId,
        vehicleName: trip.vehicleName,
        licensePlate: trip.licensePlate,
        driverUserId: assignee?.userId ?? null,
        driverName: assignee?.name ?? null,
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        durationMinutes: trip.durationMinutes,
        distanceKm: trip.distanceKm,
        averageSpeedKmh: trip.averageSpeedKmh,
        maxSpeedKmh: trip.maxSpeedKmh,
        idleMinutes: trip.idleMinutes,
        drivingMinutes: trip.drivingMinutes,
        stopCount: trip.stopCount,
        pointCount: trip.pointCount,
        idleRatio: computeIdleRatio(trip.idleMinutes, trip.drivingMinutes),
      };
    });
  }

  private buildRouteEfficiency(tripRows: DriTripRow[]): DriRouteEfficiencyRow[] {
    type Agg = {
      driverUserId: string | null;
      driverName: string | null;
      vehicleId: string | null;
      vehicleName: string | null;
      tripCount: number;
      totalDistanceKm: number;
      totalDrivingMinutes: number;
      totalIdleMinutes: number;
    };
    const byKey = new Map<string, Agg>();
    for (const trip of tripRows) {
      const key = `${trip.driverUserId ?? 'none'}::${trip.vehicleId ?? 'none'}`;
      const existing = byKey.get(key) ?? {
        driverUserId: trip.driverUserId,
        driverName: trip.driverName,
        vehicleId: trip.vehicleId,
        vehicleName: trip.vehicleName,
        tripCount: 0,
        totalDistanceKm: 0,
        totalDrivingMinutes: 0,
        totalIdleMinutes: 0,
      };
      existing.tripCount += 1;
      existing.totalDistanceKm += trip.distanceKm;
      existing.totalDrivingMinutes += trip.drivingMinutes;
      existing.totalIdleMinutes += trip.idleMinutes;
      byKey.set(key, existing);
    }
    return [...byKey.values()]
      .map((agg) =>
        buildDriRouteEfficiencyRow({
          ...agg,
          totalDistanceKm: Math.round(agg.totalDistanceKm * 10) / 10,
        }),
      )
      .sort((a, b) => b.tripCount - a.tripCount);
  }

  private async buildDriverProfiles(
    companyId: string,
    vehicleRows: Awaited<ReturnType<DriverIntelligenceService['loadVehicles']>>,
    assignments: Awaited<ReturnType<DriverIntelligenceService['loadUsageAssignments']>>,
    tripRows: DriTripRow[],
    behaviourRows: DriBehaviourRow[],
  ): Promise<DriDriverProfile[]> {
    const driverIds = new Set<string>();
    for (const v of vehicleRows) {
      if (v.assignedUserId) driverIds.add(v.assignedUserId);
    }
    for (const a of assignments) {
      if (a.assignedUserId) driverIds.add(a.assignedUserId);
      if (a.vehicleAssignedUserId) driverIds.add(a.vehicleAssignedUserId);
    }
    for (const t of tripRows) {
      if (t.driverUserId) driverIds.add(t.driverUserId);
    }
    for (const b of behaviourRows) {
      if (b.driverUserId) driverIds.add(b.driverUserId);
    }

    if (driverIds.size === 0) return [];

    const userRows = await this.db.query.users.findMany({
      where: and(eq(users.companyId, companyId), inArray(users.id, [...driverIds])),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        roleId: true,
      },
    });
    const roleIds = [...new Set(userRows.map((u) => u.roleId).filter(Boolean))];
    const roleRows =
      roleIds.length > 0
        ? await this.db.query.roles.findMany({
            where: and(eq(roles.companyId, companyId), inArray(roles.id, roleIds)),
            columns: { id: true, name: true },
          })
        : [];
    const roleNameById = new Map(roleRows.map((r) => [r.id, r.name]));

    return userRows
      .map((user) => {
        const assignedVehicles = vehicleRows.filter((v) => v.assignedUserId === user.id);
        const jobAssignments = assignments.filter(
          (a) => a.assignedUserId === user.id || a.vehicleAssignedUserId === user.id,
        );
        const trips = tripRows.filter((t) => t.driverUserId === user.id);
        const behaviour = behaviourRows.filter((b) => b.driverUserId === user.id);
        return {
          userId: user.id,
          displayName: this.displayName(user.firstName, user.lastName),
          email: user.email,
          roleName: roleNameById.get(user.roleId) ?? 'Unknown',
          isActive: user.isActive,
          assignedVehicleIds: assignedVehicles.map((v) => v.id),
          assignedVehicleNames: assignedVehicles.map((v) => v.name),
          jobAssignmentCount: jobAssignments.length,
          tripCount: trips.length,
          behaviourEventCount: behaviour.length,
          totalDistanceKm: Math.round(trips.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
          totalIdleMinutes: trips.reduce((s, t) => s + t.idleMinutes, 0),
          totalDrivingMinutes: trips.reduce((s, t) => s + t.drivingMinutes, 0),
        } satisfies DriDriverProfile;
      })
      .sort((a, b) => b.tripCount - a.tripCount || a.displayName.localeCompare(b.displayName));
  }

  private buildVehicleUsage(
    vehicleRows: Awaited<ReturnType<DriverIntelligenceService['loadVehicles']>>,
    assignments: Awaited<ReturnType<DriverIntelligenceService['loadUsageAssignments']>>,
    tripRows: DriTripRow[],
  ): DriVehicleUsageRow[] {
    return vehicleRows.map((v) => {
      const vehicleAssignments = assignments.filter((a) => a.vehicleId === v.id);
      const trips = tripRows.filter((t) => t.vehicleId === v.id);
      const assignee = v.assignedUser
        ? this.displayName(v.assignedUser.firstName, v.assignedUser.lastName) || null
        : null;
      return {
        vehicleId: v.id,
        vehicleName: v.name,
        licensePlate: v.licensePlate,
        status: v.status,
        assignedUserId: v.assignedUserId,
        assignedUserName: assignee,
        jobAssignmentCount: vehicleAssignments.length,
        distinctJobCount: new Set(vehicleAssignments.map((a) => a.jobId)).size,
        tripCount: trips.length,
        totalDistanceKm: Math.round(trips.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
      };
    });
  }

  async getDashboard(actor: DriActor): Promise<DriDashboard> {
    this.assertOwnerAdmin(actor);
    const settings = await this.ensureSettings(actor);

    const [cartrackSignals, vehicleRows, assignments, draftRows, insightRows] = await Promise.all([
      this.loadCartrackSignals(actor.companyId),
      this.loadVehicles(actor.companyId),
      this.loadUsageAssignments(actor.companyId),
      this.db.query.driRecommendationDrafts.findMany({
        where: eq(driRecommendationDrafts.companyId, actor.companyId),
        orderBy: [desc(driRecommendationDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.driAuraInsights.findMany({
        where: eq(driAuraInsights.companyId, actor.companyId),
        orderBy: [desc(driAuraInsights.createdAt)],
        limit: 50,
      }),
    ]);

    const vehicleAssigneeById = new Map<string, { userId: string; name: string }>();
    for (const v of vehicleRows) {
      if (v.assignedUserId && v.assignedUser) {
        vehicleAssigneeById.set(v.id, {
          userId: v.assignedUserId,
          name: this.displayName(v.assignedUser.firstName, v.assignedUser.lastName),
        });
      }
    }

    const [behaviourRowsRaw, tripRowsRaw] = await Promise.all([
      settings.behaviourSignalsEnabled
        ? this.loadBehaviourRows(actor.companyId, vehicleAssigneeById)
        : Promise.resolve([] as DriBehaviourRow[]),
      settings.tripSignalsEnabled
        ? this.loadTripRows(actor.companyId, vehicleAssigneeById)
        : Promise.resolve([] as DriTripRow[]),
    ]);

    const behaviourRows = behaviourRowsRaw;
    const tripRows = tripRowsRaw;
    const routeEfficiency = this.buildRouteEfficiency(tripRows);
    const vehicleUsage = this.buildVehicleUsage(vehicleRows, assignments, tripRows);
    const driverProfiles = await this.buildDriverProfiles(
      actor.companyId,
      vehicleRows,
      assignments,
      tripRows,
      behaviourRows,
    );

    const cartrack = buildDriCartrackSnapshot(cartrackSignals);
    const behaviour = buildDriBehaviourSnapshot({
      eventCount: behaviourRows.length,
      distinctDrivers: new Set(behaviourRows.map((r) => r.driverUserId).filter(Boolean)).size,
    });
    const trips = buildDriTripSnapshot({
      tripCount: tripRows.length,
      totalDistanceKm: Math.round(tripRows.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
    });
    const usage = buildDriUsageSnapshot({
      assignmentCount: assignments.length,
      distinctDrivers: new Set(
        assignments
          .flatMap((a) => [a.assignedUserId, a.vehicleAssignedUserId])
          .filter((id): id is string => Boolean(id)),
      ).size,
      distinctVehicles: new Set(assignments.map((a) => a.vehicleId)).size,
    });

    const recommendations = draftRows.map((d) => this.toRecommendation(d));
    const auraInsights = insightRows.map((i) => this.toInsight(i));
    const pendingRecommendations = recommendations.filter((r) => r.status === 'draft').length;

    let summary: string;
    if (driverProfiles.length === 0 && tripRows.length === 0 && behaviourRows.length === 0) {
      summary =
        'Driver Intelligence is ready. No real assigned drivers, trips, or behaviour events yet — signals stay unavailable (not invented). Never auto-discipline.';
    } else {
      summary = `Real driver signals: ${driverProfiles.length} driver profile(s), trips ${trips.availability}, behaviour ${behaviour.availability}, usage ${usage.availability}, ${pendingRecommendations} pending recommendation draft(s). Owner/Admin only. Never auto-discipline. Never invent GPS.`;
    }

    return {
      summary,
      productClarification: { ...DRI_PRODUCT_COPY },
      policy: {
        ownerAdminOnly: true,
        autoDisciplineEnabled: false,
        inventGpsEnabled: false,
        requiresOwnerApproval: true,
        fakeGps: false,
        fakeBehaviour: false,
      },
      cartrack,
      behaviour,
      trips,
      usage,
      driverProfiles,
      behaviourRows,
      tripRows,
      routeEfficiency,
      vehicleUsage,
      recommendations,
      auraInsights,
      auraConnections: listDriAuraConnections(),
      settings,
      pendingRecommendations,
      totalDrivers: driverProfiles.length,
    };
  }

  async refreshRecommendations(
    actor: DriActor,
    input: RefreshDriRecommendationsRequest = {},
  ): Promise<{ created: number; recommendations: DriRecommendationSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.recommendationDraftsEnabled) {
      throw new DriverIntelligenceError(
        'INVALID_STATE',
        'Recommendation drafts are disabled in Driver Intelligence settings.',
      );
    }

    const dashboard = await this.getDashboard(actor);
    const created: DriRecommendationSummary[] = [];
    void input.submitForReview;

    const tryCreate = async (
      kind: DriRecommendationKind,
      driverUserId: string | null,
      vehicleId: string | null,
      driverName: string | null,
      detail: string,
      metadata: Record<string, unknown> = {},
    ) => {
      const existingOpen = await this.db.query.driRecommendationDrafts.findFirst({
        where: and(
          eq(driRecommendationDrafts.companyId, actor.companyId),
          eq(driRecommendationDrafts.kind, kind),
          driverUserId
            ? eq(driRecommendationDrafts.driverUserId, driverUserId)
            : sql`${driRecommendationDrafts.driverUserId} is null`,
          vehicleId
            ? eq(driRecommendationDrafts.vehicleId, vehicleId)
            : sql`${driRecommendationDrafts.vehicleId} is null`,
          eq(driRecommendationDrafts.status, 'draft'),
        ),
      });
      if (existingOpen) return;

      const draft = buildDriRecommendationDraft({ kind, driverName, detail });
      const [inserted] = await this.db
        .insert(driRecommendationDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status: 'draft',
          title: draft.title,
          body: draft.body,
          driverUserId,
          vehicleId,
          autoDiscipline: false,
          inventedGps: false,
          createdByUserId: actor.userId,
          metadata: {
            source: 'real_fleet_driver_signals',
            autoDiscipline: false,
            inventGps: false,
            ...metadata,
          },
        })
        .returning();

      created.push(this.toRecommendation(inserted));
      await this.recordAudit(actor, 'di_recommendation_draft_created', inserted.id, {
        kind,
        driverUserId,
        vehicleId,
        autoDiscipline: false,
        inventGps: false,
        disciplineExecuted: false,
      });
    };

    for (const row of dashboard.routeEfficiency.filter((r) => r.efficiencyLabel === 'idle_heavy')) {
      await tryCreate(
        'efficiency_opportunity',
        row.driverUserId,
        row.vehicleId,
        row.driverName,
        row.rationale,
        { efficiencyLabel: row.efficiencyLabel, tripCount: row.tripCount },
      );
    }

    const riskByDriver = new Map<string, DriBehaviourRow[]>();
    for (const event of dashboard.behaviourRows) {
      if (!event.driverUserId) continue;
      if (event.severity < 2) continue;
      const list = riskByDriver.get(event.driverUserId) ?? [];
      list.push(event);
      riskByDriver.set(event.driverUserId, list);
    }
    for (const [driverUserId, events] of riskByDriver) {
      if (events.length < 2) continue;
      const profile = dashboard.driverProfiles.find((p) => p.userId === driverUserId);
      await tryCreate(
        'risk_pattern',
        driverUserId,
        events[0]?.vehicleId ?? null,
        profile?.displayName ?? events[0]?.driverName ?? null,
        `${events.length} real high-severity behaviour event(s) (e.g. ${events[0]!.eventType}) — observational risk pattern draft only; not a disciplinary finding and never auto-discipline.`,
        { eventCount: events.length, sampleEventType: events[0]!.eventType },
      );
    }

    for (const profile of dashboard.driverProfiles) {
      const hasRiskEvents = profile.behaviourEventCount > 0;
      const idleHeavy = dashboard.routeEfficiency.some(
        (r) => r.driverUserId === profile.userId && r.efficiencyLabel === 'idle_heavy',
      );
      if (!hasRiskEvents && !idleHeavy) continue;
      if (profile.tripCount === 0) continue;
      await tryCreate(
        'training_opportunity',
        profile.userId,
        profile.assignedVehicleIds[0] ?? null,
        profile.displayName,
        `Training opportunity draft from real signals: ${profile.behaviourEventCount} behaviour event(s), ${profile.tripCount} trip(s). Coaching suggestion only — never auto-discipline or invent GPS.`,
        {
          behaviourEventCount: profile.behaviourEventCount,
          tripCount: profile.tripCount,
        },
      );
    }

    return { created: created.length, recommendations: created };
  }

  async decideRecommendation(
    actor: DriActor,
    recommendationId: string,
    input: DecideDriRecommendationRequest,
  ): Promise<DriRecommendationSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.driRecommendationDrafts.findFirst({
      where: and(
        eq(driRecommendationDrafts.id, recommendationId),
        eq(driRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new DriverIntelligenceError('NOT_FOUND', 'Recommendation draft not found.');
    }
    if (existing.status !== 'draft') {
      throw new DriverIntelligenceError(
        'INVALID_STATE',
        `Recommendation is already ${existing.status}.`,
      );
    }

    const nextStatus = input.decision === 'acknowledge' ? 'acknowledged' : 'dismissed';
    const [updated] = await this.db
      .update(driRecommendationDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoDiscipline: false,
        inventedGps: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(driRecommendationDrafts.id, recommendationId),
          eq(driRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `di_recommendation_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      autoDiscipline: false,
      inventGps: false,
      disciplineExecuted: false,
    });

    return this.toRecommendation(updated);
  }

  async updateSettings(actor: DriActor, input: UpdateDriSettingsRequest): Promise<DriSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof driSettings.$inferInsert> = {
      autoDisciplineEnabled: false,
      inventGpsEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.recommendationDraftsEnabled !== undefined) {
      patch.recommendationDraftsEnabled = input.recommendationDraftsEnabled;
    }
    if (input.behaviourSignalsEnabled !== undefined) {
      patch.behaviourSignalsEnabled = input.behaviourSignalsEnabled;
    }
    if (input.tripSignalsEnabled !== undefined) {
      patch.tripSignalsEnabled = input.tripSignalsEnabled;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(driSettings)
      .set(patch)
      .where(eq(driSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'di_settings_updated', updated.id, {
      recommendationDraftsEnabled: updated.recommendationDraftsEnabled,
      behaviourSignalsEnabled: updated.behaviourSignalsEnabled,
      tripSignalsEnabled: updated.tripSignalsEnabled,
      autoDisciplineEnabled: false,
      inventGpsEnabled: false,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: DriActor,
    input: CreateDriAuraInsightRequest,
  ): Promise<DriAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceRecommendationId) {
      const source = await this.db.query.driRecommendationDrafts.findFirst({
        where: and(
          eq(driRecommendationDrafts.id, input.sourceRecommendationId),
          eq(driRecommendationDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new DriverIntelligenceError('NOT_FOUND', 'Source recommendation draft not found.');
      }
    }

    if (input.driverUserId) {
      const driver = await this.db.query.users.findFirst({
        where: and(eq(users.companyId, actor.companyId), eq(users.id, input.driverUserId)),
      });
      if (!driver) {
        throw new DriverIntelligenceError('NOT_FOUND', 'Driver user not found in this tenant.');
      }
    }

    const [inserted] = await this.db
      .insert(driAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title,
        insight: input.insight,
        href: input.href ?? null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        driverUserId: input.driverUserId ?? null,
        createdByUserId: actor.userId,
        metadata: {
          invented: false,
          inventGps: false,
          autoDiscipline: false,
          disciplineExecuted: false,
        },
      })
      .returning();

    await this.recordAudit(actor, 'di_aura_insight_created', inserted.id, {
      target: input.target,
      sourceRecommendationId: input.sourceRecommendationId ?? null,
      driverUserId: input.driverUserId ?? null,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeInsight(
    actor: DriActor,
    insightId: string,
    input: AcknowledgeDriInsightRequest,
  ): Promise<DriAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.driAuraInsights.findFirst({
      where: and(eq(driAuraInsights.id, insightId), eq(driAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new DriverIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }
    if (existing.status !== 'open') {
      throw new DriverIntelligenceError(
        'INVALID_STATE',
        `Insight is already ${existing.status}.`,
      );
    }

    const [updated] = await this.db
      .update(driAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(driAuraInsights.id, insightId), eq(driAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `di_aura_insight_${input.status}`, updated.id, {
      status: input.status,
      disciplineExecuted: false,
    });

    return this.toInsight(updated);
  }
}
