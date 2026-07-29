import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CloneDigitalTwinScenarioRequest,
  CompareDigitalTwinScenariosRequest,
  CreateDigitalTwinActionRequest,
  CreateDigitalTwinScenarioRequest,
  DigitalTwinCapacityUtilization,
  DigitalTwinHeatMapSummary,
  DigitalTwinHeatMapType,
  DigitalTwinOperationalState,
  DigitalTwinPlatformActionSummary,
  DigitalTwinRecommendationSummary,
  DigitalTwinReplayEventSummary,
  DigitalTwinRiskIndicators,
  DigitalTwinScenarioComparisonSummary,
  DigitalTwinScenarioSummary,
  DigitalTwinSimulationSummary,
  DigitalTwinSimulationType,
  DigitalTwinStateSnapshotSummary,
  EnterpriseDigitalTwinAuraContext,
  EnterpriseDigitalTwinDashboard,
  RunDigitalTwinSimulationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  digitalTwinHeatMapSnapshots,
  digitalTwinPlatformActions,
  digitalTwinRecommendations,
  digitalTwinReplayEvents,
  digitalTwinScenarioComparisons,
  digitalTwinScenarios,
  digitalTwinSimulations,
  digitalTwinStateSnapshots,
  jobs,
} from '@titan/db';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { WorkforceService } from './workforce.service.js';

export class EnterpriseDigitalTwinError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseDigitalTwinError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseDigitalTwinDeps = {
  db: DatabaseClient;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  fleetService: FleetService;
  inventoryService: InventoryService;
  financeService: FinanceService;
  workforceService: WorkforceService;
  procurementService: ProcurementService;
  executiveService: ExecutiveService;
};

export class EnterpriseDigitalTwinService {
  constructor(private readonly deps: EnterpriseDigitalTwinDeps) {}

  async getExecutiveDashboard(companyId: string): Promise<EnterpriseDigitalTwinDashboard> {
    const [
      operationalState,
      executiveStats,
      capacityUtilization,
      riskIndicators,
      activeScenarios,
      recentSimulations,
      heatMaps,
      recommendations,
      recentReplayEvents,
      pendingActions,
    ] = await Promise.all([
      this.buildOperationalState(companyId),
      this.deps.executiveService.getStats(companyId),
      this.computeCapacityUtilization(companyId),
      this.computeRiskIndicators(companyId),
      this.listScenarios(companyId, 'active'),
      this.listSimulations(companyId),
      this.listHeatMaps(companyId),
      this.listRecommendations(companyId),
      this.listReplayEvents(companyId),
      this.listActions(companyId, 'pending_approval'),
    ]);

    return {
      summary: `Digital twin live — health ${executiveStats.healthScore ?? '—'}/100, ${activeScenarios.length} active scenario(s), ${recentSimulations.filter((s) => s.status === 'completed').length} completed simulation(s), ${riskIndicators.bottleneckCount} bottleneck(s) detected.`,
      operationalState,
      executiveStats,
      capacityUtilization,
      riskIndicators,
      activeScenarios: activeScenarios.slice(0, 10),
      recentSimulations: recentSimulations.slice(0, 10),
      heatMaps: heatMaps.slice(0, 7),
      recommendations: recommendations.slice(0, 15),
      recentReplayEvents: recentReplayEvents.slice(0, 20),
      pendingActionCount: pendingActions.length,
    };
  }

  async buildDigitalTwinAuraContext(companyId: string): Promise<EnterpriseDigitalTwinAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      healthScore: dashboard.executiveStats.healthScore,
      activeScenarioCount: dashboard.activeScenarios.length,
      completedSimulationCount: dashboard.recentSimulations.filter((s) => s.status === 'completed').length,
      pendingRecommendationCount: dashboard.recommendations.filter((r) => r.status === 'pending').length,
      operationalRiskLevel: dashboard.riskIndicators.operationalRiskLevel,
      pendingActionCount: dashboard.pendingActionCount,
    };
  }

  async buildOperationalState(companyId: string): Promise<DigitalTwinOperationalState> {
    const [jobsStats, schedulingContext, fleetStats, inventoryStats, financeStats, workforceStats, procurementStats, executiveStats] =
      await Promise.all([
        this.deps.jobsService.getStats(companyId),
        this.deps.schedulingService.buildAuraContext(companyId),
        this.deps.fleetService.getStats(companyId),
        this.deps.inventoryService.getStats(companyId),
        this.deps.financeService.getStats(companyId),
        this.deps.workforceService.getStats(companyId),
        this.deps.procurementService.getStats(companyId),
        this.deps.executiveService.getStats(companyId),
      ]);

    return {
      jobs: jobsStats as unknown as Record<string, unknown>,
      scheduling: schedulingContext as unknown as Record<string, unknown>,
      fleet: fleetStats as unknown as Record<string, unknown>,
      inventory: inventoryStats as unknown as Record<string, unknown>,
      finance: financeStats as unknown as Record<string, unknown>,
      workforce: workforceStats as unknown as Record<string, unknown>,
      procurement: procurementStats as unknown as Record<string, unknown>,
      executive: executiveStats as unknown as Record<string, unknown>,
      capturedAt: new Date().toISOString(),
    };
  }

  async captureStateSnapshot(
    scope: StaffScope,
    label?: string | null,
  ): Promise<DigitalTwinStateSnapshotSummary> {
    const operationalState = await this.buildOperationalState(scope.companyId);
    const summary = `Operational snapshot — ${(operationalState.jobs as { activeCount?: number }).activeCount ?? 0} active job(s), ${(operationalState.scheduling as { scheduledCount?: number }).scheduledCount ?? 0} scheduled.`;

    const [row] = await this.deps.db
      .insert(digitalTwinStateSnapshots)
      .values({
        companyId: scope.companyId,
        label: label ?? null,
        operationalState,
        summary,
        capturedByUserId: scope.userId,
      })
      .returning();

    return toSnapshotSummary(row!);
  }

  async listStateSnapshots(companyId: string): Promise<DigitalTwinStateSnapshotSummary[]> {
    const rows = await this.deps.db.query.digitalTwinStateSnapshots.findMany({
      where: eq(digitalTwinStateSnapshots.companyId, companyId),
      orderBy: [desc(digitalTwinStateSnapshots.capturedAt)],
      limit: 30,
    });
    return rows.map(toSnapshotSummary);
  }

  async createScenario(
    scope: StaffScope,
    input: CreateDigitalTwinScenarioRequest,
  ): Promise<DigitalTwinScenarioSummary> {
    if (input.baselineSnapshotId) {
      await this.ensureSnapshot(scope.companyId, input.baselineSnapshotId);
    }

    const [row] = await this.deps.db
      .insert(digitalTwinScenarios)
      .values({
        companyId: scope.companyId,
        name: input.name,
        description: input.description ?? null,
        simulationType: input.simulationType,
        assumptions: input.assumptions ?? {},
        variables: input.variables ?? {},
        baselineSnapshotId: input.baselineSnapshotId ?? null,
        createdByUserId: scope.userId,
      })
      .returning();

    return toScenarioSummary(row!);
  }

  async cloneScenario(
    scope: StaffScope,
    scenarioId: string,
    input: CloneDigitalTwinScenarioRequest,
  ): Promise<DigitalTwinScenarioSummary> {
    const source = await this.ensureScenario(scope.companyId, scenarioId);

    const [row] = await this.deps.db
      .insert(digitalTwinScenarios)
      .values({
        companyId: scope.companyId,
        name: input.name,
        description: input.description ?? source.description,
        simulationType: source.simulationType,
        assumptions: source.assumptions,
        variables: source.variables,
        baselineSnapshotId: source.baselineSnapshotId,
        clonedFromScenarioId: source.id,
        createdByUserId: scope.userId,
      })
      .returning();

    return toScenarioSummary(row!);
  }

  async listScenarios(
    companyId: string,
    status?: DigitalTwinScenarioSummary['status'],
  ): Promise<DigitalTwinScenarioSummary[]> {
    const rows = await this.deps.db.query.digitalTwinScenarios.findMany({
      where: status
        ? and(eq(digitalTwinScenarios.companyId, companyId), eq(digitalTwinScenarios.status, status))
        : eq(digitalTwinScenarios.companyId, companyId),
      orderBy: [desc(digitalTwinScenarios.updatedAt)],
      limit: 50,
    });
    return rows.map(toScenarioSummary);
  }

  async runSimulation(
    scope: StaffScope,
    input: RunDigitalTwinSimulationRequest,
  ): Promise<DigitalTwinSimulationSummary> {
    const scenario = await this.ensureScenario(scope.companyId, input.scenarioId);
    const operationalState = await this.buildOperationalState(scope.companyId);
    const projectedOutcomes = this.projectOutcomes(scenario.simulationType, operationalState, scenario.variables);
    const comparisonMetrics = this.buildComparisonMetrics(operationalState, projectedOutcomes);
    const resultSummary = `Read-only ${scenario.simulationType.replace(/_/g, ' ')} simulation completed. No production data modified.`;

    const [row] = await this.deps.db
      .insert(digitalTwinSimulations)
      .values({
        companyId: scope.companyId,
        scenarioId: scenario.id,
        simulationType: scenario.simulationType,
        status: 'completed',
        inputState: operationalState,
        projectedOutcomes,
        comparisonMetrics,
        resultSummary,
        isReadOnly: true,
        createdByUserId: scope.userId,
        completedAt: new Date(),
      })
      .returning();

    return toSimulationSummary(row!, scenario.name);
  }

  async listSimulations(companyId: string): Promise<DigitalTwinSimulationSummary[]> {
    const rows = await this.deps.db.query.digitalTwinSimulations.findMany({
      where: eq(digitalTwinSimulations.companyId, companyId),
      orderBy: [desc(digitalTwinSimulations.startedAt)],
      limit: 50,
    });

    const scenarioIds = [...new Set(rows.map((row) => row.scenarioId))];
    const scenarioRows =
      scenarioIds.length > 0
        ? await this.deps.db.query.digitalTwinScenarios.findMany({
            where: inArray(digitalTwinScenarios.id, scenarioIds),
          })
        : [];
    const scenarioNameById = new Map(scenarioRows.map((row) => [row.id, row.name]));

    return rows.map((row) => toSimulationSummary(row, scenarioNameById.get(row.scenarioId) ?? null));
  }

  async compareScenarios(
    scope: StaffScope,
    input: CompareDigitalTwinScenariosRequest,
  ): Promise<DigitalTwinScenarioComparisonSummary> {
    if (input.scenarioIds.length < 2) {
      throw new EnterpriseDigitalTwinError('VALIDATION_ERROR', 'At least two scenarios are required for comparison');
    }

    const scenarios = await Promise.all(
      input.scenarioIds.map((id) => this.ensureScenario(scope.companyId, id)),
    );
    const operationalState = await this.buildOperationalState(scope.companyId);

    const scenarioResults = scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      simulationType: scenario.simulationType,
      projectedOutcomes: this.projectOutcomes(scenario.simulationType, operationalState, scenario.variables),
      comparisonMetrics: this.buildComparisonMetrics(
        operationalState,
        this.projectOutcomes(scenario.simulationType, operationalState, scenario.variables),
      ),
    }));

    const summary = `Compared ${scenarios.length} scenario(s) against current operational state.`;

    const [row] = await this.deps.db
      .insert(digitalTwinScenarioComparisons)
      .values({
        companyId: scope.companyId,
        name: input.name,
        scenarioIds: input.scenarioIds,
        comparisonResults: { scenarios: scenarioResults, baseline: operationalState },
        summary,
        createdByUserId: scope.userId,
      })
      .returning();

    return toComparisonSummary(row!);
  }

  async listComparisons(companyId: string): Promise<DigitalTwinScenarioComparisonSummary[]> {
    const rows = await this.deps.db.query.digitalTwinScenarioComparisons.findMany({
      where: eq(digitalTwinScenarioComparisons.companyId, companyId),
      orderBy: [desc(digitalTwinScenarioComparisons.createdAt)],
      limit: 20,
    });
    return rows.map(toComparisonSummary);
  }

  async captureHeatMaps(companyId: string): Promise<DigitalTwinHeatMapSummary[]> {
    const operationalState = await this.buildOperationalState(companyId);
    const heatMapTypes: DigitalTwinHeatMapType[] = [
      'technician_workload',
      'fleet_activity',
      'job_density',
      'customer_demand',
      'inventory_pressure',
      'financial_hotspots',
      'branch_performance',
    ];

    const created: DigitalTwinHeatMapSummary[] = [];
    for (const heatMapType of heatMapTypes) {
      const dataPoints = this.buildHeatMapDataPoints(heatMapType, operationalState);
      const summary = `${heatMapType.replace(/_/g, ' ')} heat map from live operational data.`;

      const [row] = await this.deps.db
        .insert(digitalTwinHeatMapSnapshots)
        .values({
          companyId,
          heatMapType,
          dataPoints,
          summary,
        })
        .returning();

      created.push(toHeatMapSummary(row!));
    }

    return created;
  }

  async listHeatMaps(companyId: string): Promise<DigitalTwinHeatMapSummary[]> {
    const rows = await this.deps.db.query.digitalTwinHeatMapSnapshots.findMany({
      where: eq(digitalTwinHeatMapSnapshots.companyId, companyId),
      orderBy: [desc(digitalTwinHeatMapSnapshots.capturedAt)],
      limit: 50,
    });
    return rows.map(toHeatMapSummary);
  }

  async syncReplayEvents(companyId: string): Promise<DigitalTwinReplayEventSummary[]> {
    const jobRows = await this.deps.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      orderBy: [desc(jobs.updatedAt)],
      limit: 30,
    });

    const created: DigitalTwinReplayEventSummary[] = [];
    for (const job of jobRows) {
      const [row] = await this.deps.db
        .insert(digitalTwinReplayEvents)
        .values({
          companyId,
          eventType: 'job_event',
          title: `Job ${job.title}`,
          description: `Status: ${job.status}`,
          entityType: 'job',
          entityId: job.id,
          eventAt: job.updatedAt,
          stateDelta: { status: job.status, title: job.title },
          metadata: { customerId: job.customerId },
        })
        .returning();

      created.push(toReplayEventSummary(row!));
    }

    return created;
  }

  async listReplayEvents(companyId: string): Promise<DigitalTwinReplayEventSummary[]> {
    const rows = await this.deps.db.query.digitalTwinReplayEvents.findMany({
      where: eq(digitalTwinReplayEvents.companyId, companyId),
      orderBy: [desc(digitalTwinReplayEvents.eventAt)],
      limit: 50,
    });
    return rows.map(toReplayEventSummary);
  }

  async generateRecommendations(companyId: string): Promise<DigitalTwinRecommendationSummary[]> {
    const [operationalState, riskIndicators, capacityUtilization, executiveStats] = await Promise.all([
      this.buildOperationalState(companyId),
      this.computeRiskIndicators(companyId),
      this.computeCapacityUtilization(companyId),
      this.deps.executiveService.getStats(companyId),
    ]);

    const signals: Array<{ title: string; recommendation: string; priority: string }> = [];

    if (riskIndicators.overdueJobCount > 0) {
      signals.push({
        title: 'Overdue job backlog',
        recommendation: `${riskIndicators.overdueJobCount} job(s) may be overdue — run a dispatch optimization scenario to evaluate reallocation options.`,
        priority: 'high',
      });
    }

    if (riskIndicators.lowStockItemCount > 0) {
      signals.push({
        title: 'Inventory pressure',
        recommendation: `${riskIndicators.lowStockItemCount} low-stock item(s) detected — simulate inventory demand scenarios before placing purchase orders.`,
        priority: 'high',
      });
    }

    if (capacityUtilization.technicianUtilizationPercent != null && capacityUtilization.technicianUtilizationPercent > 85) {
      signals.push({
        title: 'Technician capacity constraint',
        recommendation: `Technician utilization at ${capacityUtilization.technicianUtilizationPercent}% — consider staffing or technician allocation simulations.`,
        priority: 'medium',
      });
    }

    if (capacityUtilization.fleetUtilizationPercent != null && capacityUtilization.fleetUtilizationPercent > 80) {
      signals.push({
        title: 'Fleet utilization high',
        recommendation: `Fleet utilization at ${capacityUtilization.fleetUtilizationPercent}% — run fleet utilization simulation to assess expansion or reallocation.`,
        priority: 'medium',
      });
    }

    if (executiveStats.pendingAlertCount > 0) {
      signals.push({
        title: 'Executive alerts pending',
        recommendation: `${executiveStats.pendingAlertCount} executive alert(s) require review — compare current vs predicted state in scenario builder.`,
        priority: 'medium',
      });
    }

    const jobsActive = (operationalState.jobs as { activeCount?: number }).activeCount ?? 0;
    if (jobsActive === 0) {
      signals.push({
        title: 'No active jobs',
        recommendation: 'No active jobs in current state — use customer demand or growth scenario simulations to plan capacity.',
        priority: 'low',
      });
    }

    const created: DigitalTwinRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 8)) {
      const [row] = await this.deps.db
        .insert(digitalTwinRecommendations)
        .values({
          companyId,
          title: signal.title,
          recommendation: signal.recommendation,
          priority: signal.priority,
          context: { riskIndicators, capacityUtilization },
        })
        .returning();

      created.push(toRecommendationSummary(row!));
    }

    return created;
  }

  async listRecommendations(companyId: string): Promise<DigitalTwinRecommendationSummary[]> {
    const rows = await this.deps.db.query.digitalTwinRecommendations.findMany({
      where: eq(digitalTwinRecommendations.companyId, companyId),
      orderBy: [desc(digitalTwinRecommendations.createdAt)],
      limit: 50,
    });
    return rows.map(toRecommendationSummary);
  }

  async listActions(
    companyId: string,
    status?: DigitalTwinPlatformActionSummary['status'],
  ): Promise<DigitalTwinPlatformActionSummary[]> {
    const rows = await this.deps.db.query.digitalTwinPlatformActions.findMany({
      where: status
        ? and(eq(digitalTwinPlatformActions.companyId, companyId), eq(digitalTwinPlatformActions.status, status))
        : eq(digitalTwinPlatformActions.companyId, companyId),
      orderBy: [desc(digitalTwinPlatformActions.createdAt)],
      limit: 50,
    });
    return rows.map(toActionSummary);
  }

  async createAction(
    scope: StaffScope,
    input: CreateDigitalTwinActionRequest,
  ): Promise<DigitalTwinPlatformActionSummary> {
    if (input.scenarioId) {
      await this.ensureScenario(scope.companyId, input.scenarioId);
    }

    const [row] = await this.deps.db
      .insert(digitalTwinPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        scenarioId: input.scenarioId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    return toActionSummary(row!);
  }

  private async computeCapacityUtilization(companyId: string): Promise<DigitalTwinCapacityUtilization> {
    const [schedulingContext, fleetStats, inventoryStats, financeStats] = await Promise.all([
      this.deps.schedulingService.buildAuraContext(companyId),
      this.deps.fleetService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    const workload = schedulingContext.assigneeWorkload;
    const maxJobs = workload.length > 0 ? Math.max(...workload.map((w) => w.scheduledJobCount)) : 0;
    const avgJobs =
      workload.length > 0
        ? workload.reduce((sum, w) => sum + w.scheduledJobCount, 0) / workload.length
        : 0;
    const technicianUtilizationPercent =
      maxJobs > 0 ? Math.min(100, Math.round((avgJobs / maxJobs) * 100)) : null;

    const fleetTotal = fleetStats.totalCount ?? 0;
    const fleetAssigned = fleetStats.assignedCount ?? 0;
    const fleetUtilizationPercent =
      fleetTotal > 0 ? Math.round((fleetAssigned / fleetTotal) * 100) : null;

    const inventoryPressureScore =
      inventoryStats.lowStockCount != null && inventoryStats.itemCount != null && inventoryStats.itemCount > 0
        ? Math.round((inventoryStats.lowStockCount / inventoryStats.itemCount) * 100)
        : null;

    const cashFlowHealthScore =
      financeStats.revenueMtdCents > 0
        ? Math.min(100, Math.round(financeStats.revenueMtdCents / 10000))
        : financeStats.invoiceCount > 0
          ? 75
          : null;

    return {
      technicianUtilizationPercent,
      fleetUtilizationPercent,
      inventoryPressureScore,
      cashFlowHealthScore,
    };
  }

  private async computeRiskIndicators(companyId: string): Promise<DigitalTwinRiskIndicators> {
    const [executiveStats, inventoryStats, overdueRow] = await Promise.all([
      this.deps.executiveService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, companyId),
            inArray(jobs.status, ['scheduled', 'in_progress']),
            sql`${jobs.scheduledAt} < now() - interval '1 day'`,
          ),
        ),
    ]);

    const overdueJobCount = overdueRow[0]?.count ?? 0;
    const lowStockItemCount = inventoryStats.lowStockCount ?? 0;
    let bottleneckCount = 0;
    if (overdueJobCount > 0) bottleneckCount += 1;
    if (lowStockItemCount > 0) bottleneckCount += 1;
    if (executiveStats.pendingAlertCount > 0) bottleneckCount += 1;

    const operationalRiskLevel: DigitalTwinRiskIndicators['operationalRiskLevel'] =
      bottleneckCount >= 3 ? 'high' : bottleneckCount >= 1 ? 'medium' : 'low';

    return {
      operationalRiskLevel,
      bottleneckCount,
      overdueJobCount,
      lowStockItemCount,
      pendingExecutiveAlertCount: executiveStats.pendingAlertCount,
    };
  }

  private projectOutcomes(
    simulationType: DigitalTwinSimulationType,
    currentState: DigitalTwinOperationalState,
    variables: Record<string, unknown>,
  ): Record<string, unknown> {
    const jobsActive = (currentState.jobs as { activeCount?: number }).activeCount ?? 0;
    const scheduledCount = (currentState.scheduling as { scheduledCount?: number }).scheduledCount ?? 0;
    const fleetTotal = (currentState.fleet as { totalCount?: number }).totalCount ?? 0;
    const growthFactor = typeof variables.growthFactor === 'number' ? variables.growthFactor : 1.1;
    const staffingChange = typeof variables.staffingChange === 'number' ? variables.staffingChange : 0;

    switch (simulationType) {
      case 'job_scheduling':
        return {
          projectedScheduledJobs: Math.round(scheduledCount * growthFactor),
          capacityDelta: Math.round((growthFactor - 1) * 100),
        };
      case 'technician_allocation':
        return {
          projectedWorkloadPerTechnician: Math.round(jobsActive / Math.max(1, 1 + staffingChange)),
          reallocationBenefit: staffingChange !== 0 ? `${staffingChange > 0 ? '+' : ''}${staffingChange} technicians` : 'No change',
        };
      case 'dispatch_optimization':
        return {
          projectedDispatchEfficiency: Math.min(100, 70 + Math.round(growthFactor * 10)),
          estimatedTravelReductionPercent: Math.round((growthFactor - 1) * 15),
        };
      case 'fleet_utilization':
        return {
          projectedFleetUtilization: fleetTotal > 0 ? Math.min(100, Math.round((jobsActive / fleetTotal) * 100 * growthFactor)) : 0,
          vehiclesRequired: Math.max(0, Math.ceil(jobsActive / Math.max(1, growthFactor)) - fleetTotal),
        };
      case 'inventory_demand':
        return {
          projectedDemandIncreasePercent: Math.round((growthFactor - 1) * 100),
          reorderRecommendation: growthFactor > 1.2 ? 'Increase safety stock' : 'Maintain current levels',
        };
      case 'purchasing':
        return {
          projectedPurchaseVolumeChange: Math.round((growthFactor - 1) * 100),
          cashImpactDirection: growthFactor > 1 ? 'increase' : 'stable',
        };
      case 'cash_flow':
        return {
          projectedCashFlowChangePercent: Math.round((growthFactor - 1) * 100),
          runwayImpact: growthFactor >= 1 ? 'neutral to positive' : 'review required',
        };
      case 'staffing':
        return {
          projectedHeadcountChange: staffingChange,
          capacityImpactPercent: Math.round(staffingChange * 15),
        };
      case 'customer_demand':
        return {
          projectedDemandGrowthPercent: Math.round((growthFactor - 1) * 100),
          jobsRequired: Math.round(jobsActive * growthFactor),
        };
      case 'growth':
        return {
          projectedRevenueGrowthPercent: Math.round((growthFactor - 1) * 100),
          operationalScaleRequired: growthFactor > 1.3 ? 'significant' : growthFactor > 1.1 ? 'moderate' : 'minimal',
        };
      default:
        return { note: 'Simulation projection based on current operational state.' };
    }
  }

  private buildComparisonMetrics(
    currentState: DigitalTwinOperationalState,
    projectedOutcomes: Record<string, unknown>,
  ): Record<string, unknown> {
    const jobsActive = (currentState.jobs as { activeCount?: number }).activeCount ?? 0;
    return {
      currentActiveJobs: jobsActive,
      projectedOutcomes,
      costImpact: 'Estimated from scenario variables — approval required before execution',
      profitImpact: 'Projected from operational ratios — not applied to production',
      resourceUtilization: currentState.scheduling,
      operationalRisk: 'Read-only simulation — no production changes',
    };
  }

  private buildHeatMapDataPoints(
    heatMapType: DigitalTwinHeatMapType,
    operationalState: DigitalTwinOperationalState,
  ): Array<Record<string, unknown>> {
    switch (heatMapType) {
      case 'technician_workload': {
        const workload = (operationalState.scheduling as { assigneeWorkload?: Array<{ userName: string; scheduledJobCount: number }> })
          .assigneeWorkload ?? [];
        return workload.map((w) => ({
          label: w.userName,
          intensity: w.scheduledJobCount,
          metric: 'scheduled_jobs',
        }));
      }
      case 'fleet_activity':
        return [
          {
            label: 'Fleet total',
            intensity: (operationalState.fleet as { totalCount?: number }).totalCount ?? 0,
            metric: 'vehicles',
          },
          {
            label: 'Assigned',
            intensity: (operationalState.fleet as { assignedCount?: number }).assignedCount ?? 0,
            metric: 'assigned',
          },
        ];
      case 'job_density':
        return [
          {
            label: 'Active jobs',
            intensity: (operationalState.jobs as { activeCount?: number }).activeCount ?? 0,
            metric: 'jobs',
          },
          {
            label: 'Scheduled',
            intensity: (operationalState.scheduling as { scheduledCount?: number }).scheduledCount ?? 0,
            metric: 'scheduled',
          },
        ];
      case 'customer_demand':
        return [
          {
            label: 'Open quotes',
            intensity: (operationalState.finance as { openQuoteCount?: number }).openQuoteCount ?? 0,
            metric: 'quotes',
          },
        ];
      case 'inventory_pressure':
        return [
          {
            label: 'Low stock items',
            intensity: (operationalState.inventory as { lowStockCount?: number }).lowStockCount ?? 0,
            metric: 'low_stock',
          },
          {
            label: 'Total items',
            intensity: (operationalState.inventory as { itemCount?: number }).itemCount ?? 0,
            metric: 'items',
          },
        ];
      case 'financial_hotspots':
        return [
          {
            label: 'Revenue MTD',
            intensity: (operationalState.finance as { revenueMtdCents?: number }).revenueMtdCents ?? 0,
            metric: 'revenue_mtd_cents',
          },
          {
            label: 'Invoices',
            intensity: (operationalState.finance as { invoiceCount?: number }).invoiceCount ?? 0,
            metric: 'invoices',
          },
        ];
      case 'branch_performance':
        return [
          {
            label: 'Health score',
            intensity: (operationalState.executive as { healthScore?: number }).healthScore ?? 0,
            metric: 'health',
          },
        ];
      default:
        return [];
    }
  }

  private async ensureScenario(companyId: string, scenarioId: string) {
    const row = await this.deps.db.query.digitalTwinScenarios.findFirst({
      where: and(eq(digitalTwinScenarios.companyId, companyId), eq(digitalTwinScenarios.id, scenarioId)),
    });
    if (!row) {
      throw new EnterpriseDigitalTwinError('NOT_FOUND', 'Scenario not found');
    }
    return row;
  }

  private async ensureSnapshot(companyId: string, snapshotId: string) {
    const row = await this.deps.db.query.digitalTwinStateSnapshots.findFirst({
      where: and(eq(digitalTwinStateSnapshots.companyId, companyId), eq(digitalTwinStateSnapshots.id, snapshotId)),
    });
    if (!row) {
      throw new EnterpriseDigitalTwinError('NOT_FOUND', 'State snapshot not found');
    }
    return row;
  }
}

function toSnapshotSummary(row: typeof digitalTwinStateSnapshots.$inferSelect): DigitalTwinStateSnapshotSummary {
  return {
    id: row.id,
    label: row.label,
    summary: row.summary,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toScenarioSummary(row: typeof digitalTwinScenarios.$inferSelect): DigitalTwinScenarioSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    simulationType: row.simulationType,
    status: row.status,
    assumptions: row.assumptions,
    variables: row.variables,
    baselineSnapshotId: row.baselineSnapshotId,
    clonedFromScenarioId: row.clonedFromScenarioId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSimulationSummary(
  row: typeof digitalTwinSimulations.$inferSelect,
  scenarioName: string | null,
): DigitalTwinSimulationSummary {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    scenarioName,
    simulationType: row.simulationType,
    status: row.status,
    resultSummary: row.resultSummary,
    projectedOutcomes: row.projectedOutcomes,
    comparisonMetrics: row.comparisonMetrics,
    isReadOnly: row.isReadOnly,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toComparisonSummary(
  row: typeof digitalTwinScenarioComparisons.$inferSelect,
): DigitalTwinScenarioComparisonSummary {
  return {
    id: row.id,
    name: row.name,
    scenarioIds: row.scenarioIds,
    comparisonResults: row.comparisonResults,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

function toHeatMapSummary(row: typeof digitalTwinHeatMapSnapshots.$inferSelect): DigitalTwinHeatMapSummary {
  return {
    id: row.id,
    heatMapType: row.heatMapType,
    dataPoints: row.dataPoints,
    summary: row.summary,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toReplayEventSummary(row: typeof digitalTwinReplayEvents.$inferSelect): DigitalTwinReplayEventSummary {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    entityType: row.entityType,
    entityId: row.entityId,
    eventAt: row.eventAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof digitalTwinRecommendations.$inferSelect,
): DigitalTwinRecommendationSummary {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    title: row.title,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionSummary(row: typeof digitalTwinPlatformActions.$inferSelect): DigitalTwinPlatformActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    scenarioId: row.scenarioId,
    createdAt: row.createdAt.toISOString(),
  };
}
