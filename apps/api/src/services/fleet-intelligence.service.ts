import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import type {
  CreateFleetActionRequest,
  CreateFleetOperatingCostRequest,
  FleetActionSummary,
  FleetCostAnalytics,
  FleetDriverBehaviourSummary,
  FleetExecutiveDashboard,
  FleetIntelligenceAuraContext,
  FleetMonthlyReportSummary,
  FleetOperatingCostSummary,
  FleetPerformanceAnalytics,
  FleetRecommendationSummary,
  FleetTripSummary,
  FleetVehicleUtilizationSummary,
  GenerateFleetMonthlyReportRequest,
  GenerateFleetRecommendationsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  fleetActions,
  fleetDriverBehaviourEvents,
  fleetMonthlyReports,
  fleetOperatingCosts,
  fleetRecommendations,
  gpsPositions,
  jobs,
} from '@titan/db';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { NotificationService } from './notification.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class FleetIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FleetIntelligenceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

type GpsPoint = {
  id: string;
  vehicleId: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: Date;
};

const TRIP_GAP_MINUTES = 30;
const IDLE_SPEED_KMH = 5;
const SPEEDING_THRESHOLD_KMH = 120;
const HARSH_ACCEL_DELTA_KMH = 15;
const HARSH_BRAKE_DELTA_KMH = 15;
const EXCESSIVE_IDLE_MINUTES = 10;

export class FleetIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly fleetService: FleetService,
    private readonly integrationsService: IntegrationsService,
    private readonly assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService,
    private readonly schedulingService: SchedulingService,
    private readonly notificationService: NotificationService,
  ) {}

  async getExecutiveDashboard(companyId: string): Promise<FleetExecutiveDashboard> {
    const [
      stats,
      tracking,
      costs,
      performance,
      costAnalytics,
      recommendations,
      pendingActions,
      totalKm,
    ] = await Promise.all([
      this.fleetService.getStats(companyId),
      this.integrationsService.buildFleetTrackingContext(companyId),
      this.getCostAnalytics(companyId),
      this.getPerformanceAnalytics(companyId),
      this.getCostAnalytics(companyId),
      this.listRecommendations(companyId),
      this.listActions(companyId, 'pending_approval'),
      this.computeTotalKilometres(companyId),
    ]);

    const activeVehicles = stats.availableCount + stats.inUseCount;
    const utilizationPercent =
      stats.totalCount > 0 ? Math.round((stats.inUseCount / stats.totalCount) * 100) : null;
    const downtimePercent =
      stats.totalCount > 0 ? Math.round((stats.maintenanceCount / stats.totalCount) * 100) : null;

    const fleetHealthScore = computeFleetHealthScore({
      totalVehicles: stats.totalCount,
      maintenanceCount: stats.maintenanceCount,
      gpsConnected: tracking.cartrackConnected,
      positionCount: tracking.positionCount,
      pendingActionCount: pendingActions.length,
    });

    return {
      summary: `${stats.totalCount} vehicle(s), ${totalKm.toFixed(1)} km tracked, ${costs.totalOperatingCostCents} operating cost (cents), ${pendingActions.length} pending action(s).`,
      totalVehicles: stats.totalCount,
      activeVehicles,
      inServiceVehicles: stats.inUseCount,
      maintenanceDueCount: performance.maintenanceDueCount,
      inspectionsDueCount: performance.inspectionsDueCount,
      totalKilometres: Math.round(totalKm),
      totalOperatingCostCents: costs.totalOperatingCostCents,
      fleetHealthScore,
      utilizationPercent,
      downtimePercent,
      pendingActionCount: pendingActions.length,
      gpsPositionCount: tracking.positionCount,
      cartrackConnected: tracking.cartrackConnected,
      performance,
      costAnalytics,
      recentRecommendations: recommendations.slice(0, 10),
    };
  }

  async getTripHistory(companyId: string, vehicleId?: string): Promise<FleetTripSummary[]> {
    const points = await this.loadGpsPoints(companyId, vehicleId);
    if (points.length < 2) {
      return [];
    }

    const vehicleMap = await this.loadVehicleMap(companyId);
    const segments = segmentTrips(points);

    return segments.map((segment) => {
      const vehicle = segment.vehicleId ? vehicleMap.get(segment.vehicleId) : null;
      return {
        vehicleId: segment.vehicleId,
        vehicleName: vehicle?.name ?? null,
        licensePlate: vehicle?.licensePlate ?? null,
        startedAt: segment.startedAt.toISOString(),
        endedAt: segment.endedAt.toISOString(),
        durationMinutes: Math.round(segment.durationMinutes),
        distanceKm: Math.round(segment.distanceKm * 10) / 10,
        averageSpeedKmh: segment.averageSpeedKmh,
        maxSpeedKmh: segment.maxSpeedKmh,
        idleMinutes: Math.round(segment.idleMinutes),
        drivingMinutes: Math.round(segment.drivingMinutes),
        stopCount: segment.stopCount,
        pointCount: segment.pointCount,
      };
    });
  }

  async listMonthlyReports(companyId: string): Promise<FleetMonthlyReportSummary[]> {
    const rows = await this.db.query.fleetMonthlyReports.findMany({
      where: eq(fleetMonthlyReports.companyId, companyId),
      orderBy: [desc(fleetMonthlyReports.generatedAt)],
      limit: 24,
    });

    return rows.map((row) => ({
      id: row.id,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      totalKilometres: row.totalKilometres,
      totalTrips: row.totalTrips,
      drivingHours: row.drivingHours,
      idleHours: row.idleHours,
      averageTripDistanceKm: row.averageTripDistanceKm,
      averageTripDurationMinutes: row.averageTripDurationMinutes,
      vehicleSummaries: row.vehicleSummaries,
      exportMetadata: row.exportMetadata,
      generatedAt: row.generatedAt.toISOString(),
    }));
  }

  async generateMonthlyReport(
    companyId: string,
    input: GenerateFleetMonthlyReportRequest,
  ): Promise<FleetMonthlyReportSummary> {
    if (input.periodMonth < 1 || input.periodMonth > 12) {
      throw new FleetIntelligenceError('VALIDATION_ERROR', 'Period month must be between 1 and 12');
    }

    const from = new Date(Date.UTC(input.periodYear, input.periodMonth - 1, 1));
    const to = new Date(Date.UTC(input.periodYear, input.periodMonth, 1));

    const points = await this.db.query.gpsPositions.findMany({
      where: and(
        eq(gpsPositions.companyId, companyId),
        gte(gpsPositions.recordedAt, from),
        lt(gpsPositions.recordedAt, to),
      ),
      orderBy: [asc(gpsPositions.recordedAt)],
    });

    const gpsPoints: GpsPoint[] = points.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      latitude: row.latitude,
      longitude: row.longitude,
      speedKmh: row.speedKmh,
      recordedAt: row.recordedAt,
    }));

    const trips = segmentTrips(gpsPoints);
    const vehicleMap = await this.loadVehicleMap(companyId);

    const vehicleSummaryMap = new Map<string | null, { kilometres: number; trips: number }>();
    let totalKm = 0;
    let totalDrivingMinutes = 0;
    let totalIdleMinutes = 0;

    for (const trip of trips) {
      totalKm += trip.distanceKm;
      totalDrivingMinutes += trip.drivingMinutes;
      totalIdleMinutes += trip.idleMinutes;
      const key = trip.vehicleId;
      const existing = vehicleSummaryMap.get(key) ?? { kilometres: 0, trips: 0 };
      existing.kilometres += trip.distanceKm;
      existing.trips += 1;
      vehicleSummaryMap.set(key, existing);
    }

    const vehicleSummaries = [...vehicleSummaryMap.entries()].map(([vehicleId, summary]) => ({
      vehicleId,
      vehicleName: vehicleId ? (vehicleMap.get(vehicleId)?.name ?? null) : null,
      kilometres: Math.round(summary.kilometres),
      trips: summary.trips,
    }));

    const exportMetadata = {
      format: 'fleet_monthly_trip_report',
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      generatedAt: new Date().toISOString(),
      businessTrips: trips.length,
      privateTrips: 0,
      firstTripAt: trips[0]?.startedAt.toISOString() ?? null,
      lastTripAt: trips[trips.length - 1]?.endedAt.toISOString() ?? null,
      technicianSummary: [],
      branchSummary: [],
      pdfExportReady: trips.length > 0,
      excelExportReady: trips.length > 0,
    };

    const [created] = await this.db
      .insert(fleetMonthlyReports)
      .values({
        companyId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        totalKilometres: Math.round(totalKm),
        totalTrips: trips.length,
        drivingHours: Math.round(totalDrivingMinutes / 60),
        idleHours: Math.round(totalIdleMinutes / 60),
        averageTripDistanceKm: trips.length > 0 ? Math.round(totalKm / trips.length) : null,
        averageTripDurationMinutes:
          trips.length > 0
            ? Math.round((totalDrivingMinutes + totalIdleMinutes) / trips.length)
            : null,
        vehicleSummaries,
        exportMetadata,
      })
      .returning();

    return {
      id: created!.id,
      periodYear: created!.periodYear,
      periodMonth: created!.periodMonth,
      totalKilometres: created!.totalKilometres,
      totalTrips: created!.totalTrips,
      drivingHours: created!.drivingHours,
      idleHours: created!.idleHours,
      averageTripDistanceKm: created!.averageTripDistanceKm,
      averageTripDurationMinutes: created!.averageTripDurationMinutes,
      vehicleSummaries: created!.vehicleSummaries,
      exportMetadata: created!.exportMetadata,
      generatedAt: created!.generatedAt.toISOString(),
    };
  }

  async listDriverBehaviourEvents(companyId: string): Promise<FleetDriverBehaviourSummary[]> {
    const rows = await this.db.query.fleetDriverBehaviourEvents.findMany({
      where: eq(fleetDriverBehaviourEvents.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(fleetDriverBehaviourEvents.occurredAt)],
      limit: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicle?.name ?? null,
      eventType: row.eventType,
      severity: row.severity,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async analyzeDriverBehaviour(companyId: string): Promise<FleetDriverBehaviourSummary[]> {
    const points = await this.loadGpsPoints(companyId);
    if (points.length < 2) {
      return [];
    }

    const events: Array<{
      vehicleId: string | null;
      eventType: FleetDriverBehaviourSummary['eventType'];
      severity: number;
      occurredAt: Date;
      metadata: Record<string, unknown>;
    }> = [];

    const byVehicle = groupPointsByVehicle(points);
    for (const [vehicleId, vehiclePoints] of byVehicle) {
      for (let index = 1; index < vehiclePoints.length; index += 1) {
        const prev = vehiclePoints[index - 1]!;
        const current = vehiclePoints[index]!;
        const speed = current.speedKmh ?? 0;
        const prevSpeed = prev.speedKmh ?? 0;
        const deltaMinutes =
          (current.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60);

        if (speed > SPEEDING_THRESHOLD_KMH) {
          events.push({
            vehicleId,
            eventType: 'speeding',
            severity: speed > 140 ? 3 : 2,
            occurredAt: current.recordedAt,
            metadata: { speedKmh: speed },
          });
        }

        if (deltaMinutes > 0 && deltaMinutes <= 2) {
          const speedDelta = speed - prevSpeed;
          if (speedDelta >= HARSH_ACCEL_DELTA_KMH) {
            events.push({
              vehicleId,
              eventType: 'harsh_acceleration',
              severity: 2,
              occurredAt: current.recordedAt,
              metadata: { speedDeltaKmh: speedDelta },
            });
          }
          if (speedDelta <= -HARSH_BRAKE_DELTA_KMH) {
            events.push({
              vehicleId,
              eventType: 'harsh_braking',
              severity: 2,
              occurredAt: current.recordedAt,
              metadata: { speedDeltaKmh: speedDelta },
            });
          }
        }

        if (speed <= IDLE_SPEED_KMH && deltaMinutes >= EXCESSIVE_IDLE_MINUTES) {
          events.push({
            vehicleId,
            eventType: 'excessive_idling',
            severity: deltaMinutes >= 30 ? 3 : 2,
            occurredAt: current.recordedAt,
            metadata: { idleMinutes: Math.round(deltaMinutes) },
          });
        }
      }
    }

    if (events.length === 0) {
      return [];
    }

    const inserted = await this.db
      .insert(fleetDriverBehaviourEvents)
      .values(
        events.map((event) => ({
          companyId,
          vehicleId: event.vehicleId,
          eventType: event.eventType,
          severity: event.severity,
          occurredAt: event.occurredAt,
          metadata: event.metadata,
        })),
      )
      .returning();

    const vehicleMap = await this.loadVehicleMap(companyId);
    return inserted.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleId ? (vehicleMap.get(row.vehicleId)?.name ?? null) : null,
      eventType: row.eventType,
      severity: row.severity,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async getVehicleUtilization(companyId: string): Promise<FleetVehicleUtilizationSummary[]> {
    const [vehicleRows, points, completedJobs] = await Promise.all([
      this.fleetService.listVehicles(companyId),
      this.loadGpsPoints(companyId),
      this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')),
        columns: { id: true, assignedUserId: true },
      }),
    ]);

    const pointsByVehicle = new Map<string, GpsPoint[]>();
    for (const point of points) {
      if (!point.vehicleId) continue;
      const list = pointsByVehicle.get(point.vehicleId) ?? [];
      list.push(point);
      pointsByVehicle.set(point.vehicleId, list);
    }

    const jobsByAssignee = new Map<string, number>();
    for (const job of completedJobs) {
      if (!job.assignedUserId) continue;
      jobsByAssignee.set(job.assignedUserId, (jobsByAssignee.get(job.assignedUserId) ?? 0) + 1);
    }

    return vehicleRows.map((vehicle) => {
      const vehiclePoints = pointsByVehicle.get(vehicle.id) ?? [];
      const trips = segmentTrips(vehiclePoints);
      const totalKm = trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
      const operatingHours =
        trips.reduce((sum, trip) => sum + trip.drivingMinutes + trip.idleMinutes, 0) / 60;

      const daySpan =
        vehiclePoints.length >= 2
          ? Math.max(
              1,
              (vehiclePoints[vehiclePoints.length - 1]!.recordedAt.getTime() -
                vehiclePoints[0]!.recordedAt.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

      const utilizationPercent =
        vehicle.status === 'in_use'
          ? 100
          : vehicle.status === 'available'
            ? vehiclePoints.length > 0
              ? 50
              : 0
            : vehicle.status === 'maintenance'
              ? 0
              : null;

      const downtimePercent =
        vehicle.status === 'maintenance' ? 100 : vehicle.status === 'available' ? 0 : null;

      return {
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        licensePlate: vehicle.licensePlate,
        status: vehicle.status,
        utilizationPercent,
        downtimePercent,
        kilometresPerDay: daySpan ? Math.round((totalKm / daySpan) * 10) / 10 : null,
        operatingHours: operatingHours > 0 ? Math.round(operatingHours * 10) / 10 : null,
        jobsCompleted: vehicle.assignedUserId
          ? (jobsByAssignee.get(vehicle.assignedUserId) ?? 0)
          : 0,
        gpsPointCount: vehiclePoints.length,
      };
    });
  }

  async listOperatingCosts(companyId: string): Promise<FleetOperatingCostSummary[]> {
    const rows = await this.db.query.fleetOperatingCosts.findMany({
      where: eq(fleetOperatingCosts.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(fleetOperatingCosts.recordedAt)],
      limit: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicle?.name ?? null,
      costType: row.costType,
      amountCents: row.amountCents,
      currency: row.currency,
      recordedAt: row.recordedAt.toISOString(),
      notes: row.notes,
    }));
  }

  async createOperatingCost(
    scope: StaffScope,
    input: CreateFleetOperatingCostRequest,
  ): Promise<FleetOperatingCostSummary> {
    if (input.amountCents <= 0) {
      throw new FleetIntelligenceError('VALIDATION_ERROR', 'Amount must be greater than zero');
    }

    if (input.vehicleId) {
      const vehicle = await this.fleetService.getVehicle(scope.companyId, input.vehicleId);
      if (!vehicle) {
        throw new FleetIntelligenceError('NOT_FOUND', 'Vehicle not found');
      }
    }

    const [created] = await this.db
      .insert(fleetOperatingCosts)
      .values({
        companyId: scope.companyId,
        vehicleId: input.vehicleId ?? null,
        costType: input.costType,
        amountCents: input.amountCents,
        currency: input.currency ?? 'USD',
        notes: input.notes?.trim() || null,
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
        createdByUserId: scope.userId,
      })
      .returning();

    const costs = await this.listOperatingCosts(scope.companyId);
    return costs.find((item) => item.id === created!.id)!;
  }

  async getCostAnalytics(companyId: string): Promise<FleetCostAnalytics> {
    const [costRows, totalKm] = await Promise.all([
      this.listOperatingCosts(companyId),
      this.computeTotalKilometres(companyId),
    ]);

    const totalOperatingCostCents = costRows.reduce((sum, row) => sum + row.amountCents, 0);
    const costByTypeMap = new Map<string, number>();
    const costByVehicleMap = new Map<string, { vehicleName: string; amountCents: number }>();

    for (const row of costRows) {
      costByTypeMap.set(row.costType, (costByTypeMap.get(row.costType) ?? 0) + row.amountCents);
      if (row.vehicleId && row.vehicleName) {
        const existing = costByVehicleMap.get(row.vehicleId) ?? {
          vehicleName: row.vehicleName,
          amountCents: 0,
        };
        existing.amountCents += row.amountCents;
        costByVehicleMap.set(row.vehicleId, existing);
      }
    }

    return {
      totalOperatingCostCents,
      totalKilometres: Math.round(totalKm),
      costPerKilometreCents:
        totalKm > 0 && totalOperatingCostCents > 0
          ? Math.round(totalOperatingCostCents / totalKm)
          : null,
      costByType: [...costByTypeMap.entries()].map(([costType, amountCents]) => ({
        costType: costType as FleetCostAnalytics['costByType'][number]['costType'],
        amountCents,
      })),
      costByVehicle: [...costByVehicleMap.entries()].map(([vehicleId, summary]) => ({
        vehicleId,
        vehicleName: summary.vehicleName,
        amountCents: summary.amountCents,
      })),
    };
  }

  async getPerformanceAnalytics(companyId: string): Promise<FleetPerformanceAnalytics> {
    const [utilization, costAnalytics, assetDashboard] = await Promise.all([
      this.getVehicleUtilization(companyId),
      this.getCostAnalytics(companyId),
      this.assetEquipmentIntelligenceService.getExecutiveDashboard(companyId),
    ]);

    const withUtilization = utilization.filter((row) => row.utilizationPercent !== null);
    const bestPerformingVehicle =
      withUtilization.sort((a, b) => (b.utilizationPercent ?? 0) - (a.utilizationPercent ?? 0))[0]
        ?.vehicleName ?? null;
    const lowestUtilizationVehicle =
      withUtilization.sort((a, b) => (a.utilizationPercent ?? 0) - (b.utilizationPercent ?? 0))[0]
        ?.vehicleName ?? null;
    const highestOperatingCostVehicle =
      costAnalytics.costByVehicle.sort((a, b) => b.amountCents - a.amountCents)[0]?.vehicleName ??
      null;

    const totalGpsPoints = utilization.reduce((sum, row) => sum + row.gpsPointCount, 0);
    const totalJobs = utilization.reduce((sum, row) => sum + row.jobsCompleted, 0);
    const travelEfficiencyScore =
      totalGpsPoints > 0 && totalJobs > 0
        ? Math.min(100, Math.round((totalJobs / totalGpsPoints) * 1000))
        : null;

    return {
      bestPerformingVehicle,
      lowestUtilizationVehicle,
      highestOperatingCostVehicle,
      travelEfficiencyScore,
      maintenanceDueCount: assetDashboard.upcomingMaintenance.length,
      inspectionsDueCount: assetDashboard.overdueInspections.length,
    };
  }

  async listRecommendations(companyId: string): Promise<FleetRecommendationSummary[]> {
    const rows = await this.db.query.fleetRecommendations.findMany({
      where: eq(fleetRecommendations.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(fleetRecommendations.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      recommendationType: row.recommendationType,
      subject: row.subject,
      recommendation: row.recommendation,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicle?.name ?? null,
      branchKey: row.branchKey,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async generateRecommendations(
    companyId: string,
    input: GenerateFleetRecommendationsRequest = {},
  ): Promise<FleetRecommendationSummary[]> {
    const [utilization, costAnalytics, performance, schedulingContext] = await Promise.all([
      this.getVehicleUtilization(companyId),
      this.getCostAnalytics(companyId),
      this.getPerformanceAnalytics(companyId),
      this.schedulingService.buildAuraContext(companyId),
    ]);

    const generated: FleetRecommendationSummary[] = [];

    const lowUtil = utilization
      .filter((row) => row.utilizationPercent !== null && (row.utilizationPercent ?? 0) < 25)
      .slice(0, 3);
    for (const vehicle of lowUtil) {
      const [created] = await this.db
        .insert(fleetRecommendations)
        .values({
          companyId,
          recommendationType: 'fleet_balancing',
          subject: `Low utilization: ${vehicle.vehicleName}`,
          recommendation: `${vehicle.vehicleName} (${vehicle.licensePlate}) shows ${vehicle.utilizationPercent}% utilization. Review technician allocation or route planning — no automatic reassignment.`,
          vehicleId: vehicle.vehicleId,
          branchKey: input.branchKey ?? null,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'fleet_balancing',
        subject: created!.subject,
        recommendation: created!.recommendation,
        vehicleId: created!.vehicleId,
        vehicleName: vehicle.vehicleName,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    if (performance.maintenanceDueCount > 0) {
      const [created] = await this.db
        .insert(fleetRecommendations)
        .values({
          companyId,
          recommendationType: 'maintenance_planning',
          subject: `${performance.maintenanceDueCount} maintenance schedule(s) due`,
          recommendation:
            'Review upcoming asset maintenance schedules linked to fleet operations. Maintenance actions require explicit approval — no automatic scheduling.',
          branchKey: input.branchKey ?? null,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'maintenance_planning',
        subject: created!.subject,
        recommendation: created!.recommendation,
        vehicleId: null,
        vehicleName: null,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    const highCostVehicle = costAnalytics.costByVehicle[0];
    if (highCostVehicle && highCostVehicle.amountCents > 0) {
      const [created] = await this.db
        .insert(fleetRecommendations)
        .values({
          companyId,
          recommendationType: 'operating_cost_reduction',
          subject: `Highest operating cost: ${highCostVehicle.vehicleName}`,
          recommendation: `${highCostVehicle.vehicleName} has recorded operating costs of ${highCostVehicle.amountCents} cents. Review fuel, maintenance, and repair records for cost reduction opportunities.`,
          vehicleId: highCostVehicle.vehicleId,
          branchKey: input.branchKey ?? null,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'operating_cost_reduction',
        subject: created!.subject,
        recommendation: created!.recommendation,
        vehicleId: created!.vehicleId,
        vehicleName: highCostVehicle.vehicleName,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    const overloaded = schedulingContext.assigneeWorkload
      .filter((row) => row.scheduledJobCount >= 6)
      .slice(0, 2);
    for (const assignee of overloaded) {
      const [created] = await this.db
        .insert(fleetRecommendations)
        .values({
          companyId,
          recommendationType: 'technician_allocation',
          subject: `Technician workload: ${assignee.userName}`,
          recommendation: `${assignee.userName} has ${assignee.scheduledJobCount} scheduled job(s). Review fleet allocation and travel load — no automatic reassignment.`,
          branchKey: input.branchKey ?? null,
          metadata: { technicianId: assignee.userId },
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'technician_allocation',
        subject: created!.subject,
        recommendation: created!.recommendation,
        vehicleId: null,
        vehicleName: null,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    if (generated.length === 0) {
      const [created] = await this.db
        .insert(fleetRecommendations)
        .values({
          companyId,
          recommendationType: 'route_optimization',
          subject: 'No urgent fleet issues detected',
          recommendation:
            'Current fleet utilization, GPS, and cost data show no urgent recommendations. Re-run after more GPS sync data or operating costs are recorded.',
          branchKey: input.branchKey ?? null,
        })
        .returning();
      generated.push({
        id: created!.id,
        recommendationType: 'route_optimization',
        subject: created!.subject,
        recommendation: created!.recommendation,
        vehicleId: null,
        vehicleName: null,
        branchKey: created!.branchKey,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    return generated;
  }

  async listActions(companyId: string, status?: string): Promise<FleetActionSummary[]> {
    const rows = await this.db.query.fleetActions.findMany({
      where: status
        ? and(eq(fleetActions.companyId, companyId), eq(fleetActions.status, status as never))
        : eq(fleetActions.companyId, companyId),
      orderBy: [desc(fleetActions.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      vehicleId: row.vehicleId,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreateFleetActionRequest,
  ): Promise<FleetActionSummary> {
    const subject = input.subject.trim();
    const recommendation = input.recommendation.trim();

    if (!subject || !recommendation) {
      throw new FleetIntelligenceError(
        'VALIDATION_ERROR',
        'Subject and recommendation are required',
      );
    }

    if (input.vehicleId) {
      const vehicle = await this.fleetService.getVehicle(scope.companyId, input.vehicleId);
      if (!vehicle) {
        throw new FleetIntelligenceError('NOT_FOUND', 'Vehicle not found');
      }
    }

    const [created] = await this.db
      .insert(fleetActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        status: 'pending_approval',
        subject,
        recommendation,
        vehicleId: input.vehicleId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'fleet_alert',
      title: 'Fleet action pending approval',
      body: subject,
      entityType: 'fleet_action',
      entityId: created!.id,
    });

    const actions = await this.listActions(scope.companyId);
    return actions.find((item) => item.id === created!.id)!;
  }

  async buildFleetIntelligenceAuraContext(
    companyId: string,
  ): Promise<FleetIntelligenceAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      totalVehicles: dashboard.totalVehicles,
      activeVehicles: dashboard.activeVehicles,
      totalKilometres: dashboard.totalKilometres,
      totalOperatingCostCents: dashboard.totalOperatingCostCents,
      pendingActionCount: dashboard.pendingActionCount,
      cartrackConnected: dashboard.cartrackConnected,
    };
  }

  private async loadGpsPoints(companyId: string, vehicleId?: string): Promise<GpsPoint[]> {
    const rows = await this.db.query.gpsPositions.findMany({
      where: vehicleId
        ? and(eq(gpsPositions.companyId, companyId), eq(gpsPositions.vehicleId, vehicleId))
        : eq(gpsPositions.companyId, companyId),
      orderBy: [asc(gpsPositions.recordedAt)],
      limit: 10000,
    });

    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      latitude: row.latitude,
      longitude: row.longitude,
      speedKmh: row.speedKmh,
      recordedAt: row.recordedAt,
    }));
  }

  private async loadVehicleMap(companyId: string) {
    const rows = await this.fleetService.listVehicles(companyId);
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async computeTotalKilometres(companyId: string): Promise<number> {
    const points = await this.loadGpsPoints(companyId);
    const trips = segmentTrips(points);
    return trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
  }
}

type TripSegment = {
  vehicleId: string | null;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  distanceKm: number;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  idleMinutes: number;
  drivingMinutes: number;
  stopCount: number;
  pointCount: number;
};

function segmentTrips(points: GpsPoint[]): TripSegment[] {
  if (points.length < 2) {
    return [];
  }

  const segments: TripSegment[] = [];
  const byVehicle = groupPointsByVehicle(points);

  for (const [vehicleId, vehiclePoints] of byVehicle) {
    let current: GpsPoint[] = [vehiclePoints[0]!];

    for (let index = 1; index < vehiclePoints.length; index += 1) {
      const prev = vehiclePoints[index - 1]!;
      const currentPoint = vehiclePoints[index]!;
      const gapMinutes =
        (currentPoint.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60);

      if (gapMinutes > TRIP_GAP_MINUTES) {
        segments.push(buildTripSegment(vehicleId, current));
        current = [currentPoint];
      } else {
        current.push(currentPoint);
      }
    }

    if (current.length >= 2) {
      segments.push(buildTripSegment(vehicleId, current));
    }
  }

  return segments.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

function buildTripSegment(vehicleId: string | null, points: GpsPoint[]): TripSegment {
  const startedAt = points[0]!.recordedAt;
  const endedAt = points[points.length - 1]!.recordedAt;
  const durationMinutes = (endedAt.getTime() - startedAt.getTime()) / (1000 * 60);

  let distanceKm = 0;
  let idleMinutes = 0;
  let drivingMinutes = 0;
  let stopCount = 0;
  let maxSpeedKmh: number | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const current = points[index]!;
    distanceKm += haversineKm(prev.latitude, prev.longitude, current.latitude, current.longitude);

    const deltaMinutes = (current.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60);
    const speed = current.speedKmh ?? 0;

    if (speed > (maxSpeedKmh ?? 0)) {
      maxSpeedKmh = speed;
    }

    if (speed <= IDLE_SPEED_KMH) {
      idleMinutes += deltaMinutes;
      if (deltaMinutes >= 5) {
        stopCount += 1;
      }
    } else {
      drivingMinutes += deltaMinutes;
    }
  }

  const averageSpeedKmh =
    drivingMinutes > 0 ? Math.round((distanceKm / (drivingMinutes / 60)) * 10) / 10 : null;

  return {
    vehicleId,
    startedAt,
    endedAt,
    durationMinutes,
    distanceKm,
    averageSpeedKmh,
    maxSpeedKmh,
    idleMinutes,
    drivingMinutes,
    stopCount,
    pointCount: points.length,
  };
}

function groupPointsByVehicle(points: GpsPoint[]): Map<string | null, GpsPoint[]> {
  const map = new Map<string | null, GpsPoint[]>();
  for (const point of points) {
    const list = map.get(point.vehicleId) ?? [];
    list.push(point);
    map.set(point.vehicleId, list);
  }
  return map;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function computeFleetHealthScore(input: {
  totalVehicles: number;
  maintenanceCount: number;
  gpsConnected: boolean;
  positionCount: number;
  pendingActionCount: number;
}): number | null {
  if (input.totalVehicles === 0) {
    return null;
  }

  let score = 100;
  score -= Math.round((input.maintenanceCount / input.totalVehicles) * 30);
  if (!input.gpsConnected) {
    score -= 15;
  }
  if (input.positionCount === 0) {
    score -= 10;
  }
  score -= Math.min(20, input.pendingActionCount * 2);
  return Math.max(0, Math.min(100, score));
}
