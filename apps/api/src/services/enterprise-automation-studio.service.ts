import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  AutomationStudioApprovalChainSummary,
  AutomationStudioApprovalRecordSummary,
  AutomationStudioConnectionSummary,
  AutomationStudioDesignerSummary,
  AutomationStudioMonitoringSummary,
  AutomationStudioNodeSummary,
  AutomationStudioPlatformActionSummary,
  AutomationStudioRecommendationSummary,
  AutomationStudioTestRunSummary,
  AutomationStudioVariableSummary,
  AutomationStudioVersionSummary,
  CreateAutomationApprovalChainRequest,
  CreateAutomationStudioActionRequest,
  CreateAutomationStudioVersionRequest,
  EnterpriseAutomationAuraContext,
  EnterpriseAutomationStudioDashboard,
  RunAutomationTestRequest,
  SaveAutomationDesignerRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  automationQueueJobs,
  automationStudioApprovalChains,
  automationStudioApprovalRecords,
  automationStudioConnections,
  automationStudioMetrics,
  automationStudioNodes,
  automationStudioPlatformActions,
  automationStudioRecommendations,
  automationStudioTestRuns,
  automationStudioVariables,
  automationStudioVersions,
  workflowRuns,
  workflows,
} from '@titan/db';
import type { AutomationService } from './automation.service.js';
import type { WorkflowEngineService } from './workflow-engine.service.js';
import type { WorkflowStudioService } from './workflow-studio.service.js';

export class EnterpriseAutomationStudioError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseAutomationStudioError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseAutomationStudioDeps = {
  db: DatabaseClient;
  automationService: AutomationService;
  workflowStudioService: WorkflowStudioService;
  workflowEngineService: WorkflowEngineService;
};

export class EnterpriseAutomationStudioService {
  constructor(private readonly deps: EnterpriseAutomationStudioDeps) {}

  async getExecutiveDashboard(companyId: string): Promise<EnterpriseAutomationStudioDashboard> {
    const [stats, studio, monitoring, workflowList, recentRuns, recommendations, pendingActions] =
      await Promise.all([
        this.deps.automationService.getStats(companyId),
        this.deps.workflowStudioService.buildStudioAuraContext(companyId),
        this.getMonitoringSummary(companyId),
        this.deps.automationService.listWorkflows(companyId),
        this.deps.workflowEngineService.listRuns(companyId),
        this.listRecommendations(companyId),
        this.listActions(companyId, 'pending_approval'),
      ]);

    return {
      summary: `${stats.activeWorkflowCount} active workflow(s), ${monitoring.runningCount} running, ${monitoring.failedCount} failed, ${recommendations.filter((r) => r.status === 'pending').length} pending recommendation(s).`,
      stats,
      studio,
      monitoring,
      workflows: workflowList.slice(0, 20),
      recentRuns: recentRuns.slice(0, 20),
      recommendations: recommendations.slice(0, 15),
      pendingActionCount: pendingActions.length,
    };
  }

  async buildAutomationAuraContext(companyId: string): Promise<EnterpriseAutomationAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      workflowCount: dashboard.stats.workflowCount,
      activeWorkflowCount: dashboard.stats.activeWorkflowCount,
      pendingApprovalCount: dashboard.stats.pendingApprovalCount,
      failedRunCount: dashboard.monitoring.failedCount,
      recommendationCount: dashboard.recommendations.filter((r) => r.status === 'pending').length,
    };
  }

  async getMonitoringSummary(companyId: string): Promise<AutomationStudioMonitoringSummary> {
    const [runs, queueJobs, stats] = await Promise.all([
      this.deps.db.query.workflowRuns.findMany({
        where: eq(workflowRuns.companyId, companyId),
        orderBy: [desc(workflowRuns.startedAt)],
        limit: 500,
      }),
      this.deps.db.query.automationQueueJobs.findMany({
        where: and(
          eq(automationQueueJobs.companyId, companyId),
          inArray(automationQueueJobs.status, ['pending', 'running', 'retry']),
        ),
      }),
      this.deps.automationService.getStats(companyId),
    ]);

    const runningCount = runs.filter((row) => row.status === 'running').length;
    const completedCount = runs.filter((row) => row.status === 'completed').length;
    const failedCount = runs.filter((row) => row.status === 'failed').length;
    const totalFinished = completedCount + failedCount;
    const durations = runs
      .map((row) => row.durationMs)
      .filter((value): value is number => value != null);
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null;

    return {
      runningCount,
      completedCount,
      failedCount,
      queueDepth: queueJobs.length,
      successRatePercent:
        totalFinished > 0 ? Math.round((completedCount / totalFinished) * 100) : null,
      avgDurationMs,
      pendingApprovalCount: stats.pendingApprovalCount,
    };
  }

  async recordMetricsSnapshot(companyId: string): Promise<void> {
    const monitoring = await this.getMonitoringSummary(companyId);
    await this.deps.db.insert(automationStudioMetrics).values({
      companyId,
      successCount: monitoring.completedCount,
      failureCount: monitoring.failedCount,
      avgDurationMs: monitoring.avgDurationMs,
      queueDepth: monitoring.queueDepth,
    });
  }

  async getDesigner(
    companyId: string,
    workflowId: string,
  ): Promise<AutomationStudioDesignerSummary> {
    await this.ensureWorkflow(companyId, workflowId);
    const [workflow, nodes, connections, variables] = await Promise.all([
      this.deps.db.query.workflows.findFirst({ where: eq(workflows.id, workflowId) }),
      this.listNodes(companyId, workflowId),
      this.listConnections(companyId, workflowId),
      this.listVariables(companyId, workflowId),
    ]);

    return {
      workflowId,
      nodes,
      connections,
      variables,
      canvasConfig: workflow?.canvasConfig ?? {},
    };
  }

  async saveDesigner(
    scope: StaffScope,
    workflowId: string,
    input: SaveAutomationDesignerRequest,
  ): Promise<AutomationStudioDesignerSummary> {
    await this.ensureWorkflow(scope.companyId, workflowId);

    await this.deps.db
      .delete(automationStudioNodes)
      .where(
        and(
          eq(automationStudioNodes.companyId, scope.companyId),
          eq(automationStudioNodes.workflowId, workflowId),
        ),
      );
    await this.deps.db
      .delete(automationStudioConnections)
      .where(
        and(
          eq(automationStudioConnections.companyId, scope.companyId),
          eq(automationStudioConnections.workflowId, workflowId),
        ),
      );

    if (input.nodes.length > 0) {
      await this.deps.db.insert(automationStudioNodes).values(
        input.nodes.map((node) => ({
          companyId: scope.companyId,
          workflowId,
          nodeKey: node.nodeKey,
          nodeType: node.nodeType,
          title: node.title,
          positionX: node.positionX ?? 0,
          positionY: node.positionY ?? 0,
          config: node.config ?? {},
        })),
      );
    }

    if (input.connections.length > 0) {
      await this.deps.db.insert(automationStudioConnections).values(
        input.connections.map((connection) => ({
          companyId: scope.companyId,
          workflowId,
          sourceNodeKey: connection.sourceNodeKey,
          targetNodeKey: connection.targetNodeKey,
          conditionExpression: connection.conditionExpression ?? null,
          metadata: connection.metadata ?? {},
        })),
      );
    }

    if (input.variables?.length) {
      for (const variable of input.variables) {
        const existing = await this.deps.db.query.automationStudioVariables.findFirst({
          where: and(
            eq(automationStudioVariables.companyId, scope.companyId),
            eq(automationStudioVariables.workflowId, workflowId),
            eq(automationStudioVariables.variableKey, variable.variableKey),
          ),
        });

        if (existing) {
          await this.deps.db
            .update(automationStudioVariables)
            .set({
              label: variable.label,
              variableType: variable.variableType ?? 'string',
              defaultValue: variable.defaultValue ?? null,
              required: variable.required ?? false,
              validation: variable.validation ?? {},
              updatedAt: new Date(),
            })
            .where(eq(automationStudioVariables.id, existing.id));
        } else {
          await this.deps.db.insert(automationStudioVariables).values({
            companyId: scope.companyId,
            workflowId,
            variableKey: variable.variableKey,
            label: variable.label,
            variableType: variable.variableType ?? 'string',
            defaultValue: variable.defaultValue ?? null,
            required: variable.required ?? false,
            validation: variable.validation ?? {},
          });
        }
      }
    }

    if (input.canvasConfig) {
      await this.deps.db
        .update(workflows)
        .set({
          canvasConfig: input.canvasConfig,
          updatedAt: new Date(),
          updatedByUserId: scope.userId,
        })
        .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, scope.companyId)));
    }

    await this.createVersion(scope, workflowId, { changeSummary: 'Designer updated' });
    return this.getDesigner(scope.companyId, workflowId);
  }

  async createVersion(
    scope: StaffScope,
    workflowId: string,
    input: CreateAutomationStudioVersionRequest = {},
  ): Promise<AutomationStudioVersionSummary> {
    const workflow = await this.ensureWorkflow(scope.companyId, workflowId);
    const designer = await this.getDesigner(scope.companyId, workflowId);
    const detail = await this.deps.automationService.getWorkflow(scope.companyId, workflowId);
    const versionNumber = workflow.version + 1;

    const [row] = await this.deps.db
      .insert(automationStudioVersions)
      .values({
        companyId: scope.companyId,
        workflowId,
        versionNumber,
        changeSummary: input.changeSummary ?? null,
        snapshot: {
          workflow: detail,
          designer,
        },
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db
      .update(workflows)
      .set({ version: versionNumber, updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));

    return {
      id: row!.id,
      workflowId,
      versionNumber,
      changeSummary: row!.changeSummary,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async listVersions(
    companyId: string,
    workflowId: string,
  ): Promise<AutomationStudioVersionSummary[]> {
    const rows = await this.deps.db.query.automationStudioVersions.findMany({
      where: and(
        eq(automationStudioVersions.companyId, companyId),
        eq(automationStudioVersions.workflowId, workflowId),
      ),
      orderBy: [desc(automationStudioVersions.versionNumber)],
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      versionNumber: row.versionNumber,
      changeSummary: row.changeSummary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async runTestMode(
    scope: StaffScope,
    workflowId: string,
    input: RunAutomationTestRequest = {},
  ): Promise<AutomationStudioTestRunSummary> {
    await this.ensureWorkflow(scope.companyId, workflowId);
    const startedAt = new Date();

    const [testRun] = await this.deps.db
      .insert(automationStudioTestRuns)
      .values({
        companyId: scope.companyId,
        workflowId,
        status: 'running',
        inputPayload: input.inputPayload ?? {},
        createdByUserId: scope.userId,
        startedAt,
      })
      .returning();

    try {
      const simulation = await this.deps.workflowStudioService.simulateWorkflow(scope, workflowId, {
        payload: input.inputPayload,
      });

      const [updated] = await this.deps.db
        .update(automationStudioTestRuns)
        .set({
          status: 'completed',
          resultSummary: simulation.summary,
          simulationRunId: simulation.runId,
          completedAt: new Date(),
        })
        .where(eq(automationStudioTestRuns.id, testRun!.id))
        .returning();

      return toTestRunSummary(updated!);
    } catch (error) {
      const [updated] = await this.deps.db
        .update(automationStudioTestRuns)
        .set({
          status: 'failed',
          resultSummary: error instanceof Error ? error.message : 'Test run failed',
          completedAt: new Date(),
        })
        .where(eq(automationStudioTestRuns.id, testRun!.id))
        .returning();

      return toTestRunSummary(updated!);
    }
  }

  async listTestRuns(
    companyId: string,
    workflowId?: string,
  ): Promise<AutomationStudioTestRunSummary[]> {
    const rows = await this.deps.db.query.automationStudioTestRuns.findMany({
      where: workflowId
        ? and(
            eq(automationStudioTestRuns.companyId, companyId),
            eq(automationStudioTestRuns.workflowId, workflowId),
          )
        : eq(automationStudioTestRuns.companyId, companyId),
      orderBy: [desc(automationStudioTestRuns.createdAt)],
      limit: 50,
    });

    return rows.map(toTestRunSummary);
  }

  async createApprovalChain(
    companyId: string,
    workflowId: string,
    input: CreateAutomationApprovalChainRequest,
  ): Promise<AutomationStudioApprovalChainSummary> {
    await this.ensureWorkflow(companyId, workflowId);

    const existing = await this.deps.db.query.automationStudioApprovalChains.findFirst({
      where: and(
        eq(automationStudioApprovalChains.companyId, companyId),
        eq(automationStudioApprovalChains.workflowId, workflowId),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(automationStudioApprovalChains)
        .set({
          approvalType: input.approvalType,
          levels: input.levels ?? [],
          enabled: input.enabled ?? true,
          updatedAt: new Date(),
        })
        .where(eq(automationStudioApprovalChains.id, existing.id))
        .returning();

      return toApprovalChainSummary(updated!);
    }

    const [created] = await this.deps.db
      .insert(automationStudioApprovalChains)
      .values({
        companyId,
        workflowId,
        approvalType: input.approvalType,
        levels: input.levels ?? [],
        enabled: input.enabled ?? true,
      })
      .returning();

    return toApprovalChainSummary(created!);
  }

  async listApprovalChains(companyId: string): Promise<AutomationStudioApprovalChainSummary[]> {
    const rows = await this.deps.db.query.automationStudioApprovalChains.findMany({
      where: eq(automationStudioApprovalChains.companyId, companyId),
    });
    return rows.map(toApprovalChainSummary);
  }

  async listApprovalRecords(
    companyId: string,
    workflowId?: string,
  ): Promise<AutomationStudioApprovalRecordSummary[]> {
    const rows = await this.deps.db.query.automationStudioApprovalRecords.findMany({
      where: workflowId
        ? and(
            eq(automationStudioApprovalRecords.companyId, companyId),
            eq(automationStudioApprovalRecords.workflowId, workflowId),
          )
        : eq(automationStudioApprovalRecords.companyId, companyId),
      orderBy: [desc(automationStudioApprovalRecords.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowRunId: row.workflowRunId,
      approvalType: row.approvalType,
      status: row.status,
      approverUserId: row.approverUserId,
      comment: row.comment,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async generateRecommendations(
    companyId: string,
  ): Promise<AutomationStudioRecommendationSummary[]> {
    const [monitoring, stats, workflowList] = await Promise.all([
      this.getMonitoringSummary(companyId),
      this.deps.automationService.getStats(companyId),
      this.deps.automationService.listWorkflows(companyId),
    ]);

    const signals: Array<{
      workflowId?: string;
      title: string;
      recommendation: string;
      priority: string;
    }> = [];

    if (monitoring.failedCount > 0) {
      signals.push({
        title: 'Review failed workflow runs',
        recommendation: `${monitoring.failedCount} failed run(s) detected — review execution history and retry or fix workflow configuration.`,
        priority: 'high',
      });
    }

    if (monitoring.queueDepth > 5) {
      signals.push({
        title: 'Queue backlog detected',
        recommendation: `${monitoring.queueDepth} job(s) in queue — consider optimizing slow actions or increasing retry intervals.`,
        priority: 'medium',
      });
    }

    const draftWorkflows = workflowList.filter((row) => row.status === 'draft');
    if (draftWorkflows.length > 0) {
      signals.push({
        title: 'Unpublished draft workflows',
        recommendation: `${draftWorkflows.length} workflow(s) remain in draft — submit for approval and activate when ready.`,
        priority: 'low',
      });
    }

    if (stats.activeWorkflowCount === 0 && stats.workflowCount > 0) {
      signals.push({
        title: 'No active automations',
        recommendation:
          'Workflows exist but none are active — review pending approvals and publish approved workflows.',
        priority: 'medium',
      });
    }

    const created: AutomationStudioRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 8)) {
      const [row] = await this.deps.db
        .insert(automationStudioRecommendations)
        .values({
          companyId,
          workflowId: signal.workflowId ?? null,
          title: signal.title,
          recommendation: signal.recommendation,
          priority: signal.priority,
        })
        .returning();

      created.push(toRecommendationSummary(row!));
    }

    return created;
  }

  async listRecommendations(companyId: string): Promise<AutomationStudioRecommendationSummary[]> {
    const rows = await this.deps.db.query.automationStudioRecommendations.findMany({
      where: eq(automationStudioRecommendations.companyId, companyId),
      orderBy: [desc(automationStudioRecommendations.createdAt)],
      limit: 50,
    });
    return rows.map(toRecommendationSummary);
  }

  async listActions(
    companyId: string,
    status?: AutomationStudioPlatformActionSummary['status'],
  ): Promise<AutomationStudioPlatformActionSummary[]> {
    const rows = await this.deps.db.query.automationStudioPlatformActions.findMany({
      where: status
        ? and(
            eq(automationStudioPlatformActions.companyId, companyId),
            eq(automationStudioPlatformActions.status, status),
          )
        : eq(automationStudioPlatformActions.companyId, companyId),
      orderBy: [desc(automationStudioPlatformActions.createdAt)],
      limit: 50,
    });

    return rows.map(toActionSummary);
  }

  async createAction(
    scope: StaffScope,
    input: CreateAutomationStudioActionRequest,
  ): Promise<AutomationStudioPlatformActionSummary> {
    const [row] = await this.deps.db
      .insert(automationStudioPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        workflowId: input.workflowId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    return toActionSummary(row!);
  }

  private async listNodes(
    companyId: string,
    workflowId: string,
  ): Promise<AutomationStudioNodeSummary[]> {
    const rows = await this.deps.db.query.automationStudioNodes.findMany({
      where: and(
        eq(automationStudioNodes.companyId, companyId),
        eq(automationStudioNodes.workflowId, workflowId),
      ),
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      nodeKey: row.nodeKey,
      nodeType: row.nodeType,
      title: row.title,
      positionX: row.positionX,
      positionY: row.positionY,
      config: row.config,
    }));
  }

  private async listConnections(
    companyId: string,
    workflowId: string,
  ): Promise<AutomationStudioConnectionSummary[]> {
    const rows = await this.deps.db.query.automationStudioConnections.findMany({
      where: and(
        eq(automationStudioConnections.companyId, companyId),
        eq(automationStudioConnections.workflowId, workflowId),
      ),
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      sourceNodeKey: row.sourceNodeKey,
      targetNodeKey: row.targetNodeKey,
      conditionExpression: row.conditionExpression,
    }));
  }

  private async listVariables(
    companyId: string,
    workflowId: string,
  ): Promise<AutomationStudioVariableSummary[]> {
    const rows = await this.deps.db.query.automationStudioVariables.findMany({
      where: and(
        eq(automationStudioVariables.companyId, companyId),
        eq(automationStudioVariables.workflowId, workflowId),
      ),
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      variableKey: row.variableKey,
      label: row.label,
      variableType: row.variableType,
      defaultValue: row.defaultValue,
      required: row.required,
    }));
  }

  private async ensureWorkflow(companyId: string, workflowId: string) {
    const row = await this.deps.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)),
    });
    if (!row) throw new EnterpriseAutomationStudioError('NOT_FOUND', 'Workflow not found');
    return row;
  }
}

function toTestRunSummary(
  row: typeof automationStudioTestRuns.$inferSelect,
): AutomationStudioTestRunSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    resultSummary: row.resultSummary,
    simulationRunId: row.simulationRunId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toApprovalChainSummary(
  row: typeof automationStudioApprovalChains.$inferSelect,
): AutomationStudioApprovalChainSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    approvalType: row.approvalType,
    levels: row.levels,
    enabled: row.enabled,
  };
}

function toRecommendationSummary(
  row: typeof automationStudioRecommendations.$inferSelect,
): AutomationStudioRecommendationSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    title: row.title,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionSummary(
  row: typeof automationStudioPlatformActions.$inferSelect,
): AutomationStudioPlatformActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    workflowId: row.workflowId,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}
