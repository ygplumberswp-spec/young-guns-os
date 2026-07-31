import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateOrchestrationRequest,
  CreateOrchestrationStepRequest,
  CreateOrchestrationTriggerRequest,
  OrchestrationApprovalSummary,
  OrchestrationDetail,
  OrchestrationLogSummary,
  OrchestrationRunDetail,
  OrchestrationRunSummary,
  OrchestrationSummary,
  OrchestrationAuraContext,
  UpdateOrchestrationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentOrchestrationApprovals,
  agentOrchestrationLogs,
  agentOrchestrationRunSteps,
  agentOrchestrationRuns,
  agentOrchestrationSteps,
  agentOrchestrationTriggers,
  agentOrchestrations,
} from '@titan/db';

export class AgentOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentOrchestrationError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

export class AgentOrchestrationService {
  constructor(private readonly db: DatabaseClient) {}

  async listOrchestrations(companyId: string): Promise<OrchestrationSummary[]> {
    const rows = await this.db.query.agentOrchestrations.findMany({
      where: eq(agentOrchestrations.companyId, companyId),
      orderBy: [desc(agentOrchestrations.updatedAt)],
    });

    const summaries = await Promise.all(rows.map((row) => this.toOrchestrationSummary(row)));
    return summaries;
  }

  async getOrchestration(
    companyId: string,
    orchestrationId: string,
  ): Promise<OrchestrationDetail | null> {
    const row = await this.db.query.agentOrchestrations.findFirst({
      where: and(
        eq(agentOrchestrations.id, orchestrationId),
        eq(agentOrchestrations.companyId, companyId),
      ),
    });

    if (!row) return null;

    const [steps, triggers, summary] = await Promise.all([
      this.db.query.agentOrchestrationSteps.findMany({
        where: eq(agentOrchestrationSteps.orchestrationId, orchestrationId),
        orderBy: [asc(agentOrchestrationSteps.sortOrder), asc(agentOrchestrationSteps.createdAt)],
      }),
      this.db.query.agentOrchestrationTriggers.findMany({
        where: eq(agentOrchestrationTriggers.orchestrationId, orchestrationId),
        orderBy: [desc(agentOrchestrationTriggers.updatedAt)],
      }),
      this.toOrchestrationSummary(row),
    ]);

    return {
      ...summary,
      steps: steps.map(toStepSummary),
      triggers: triggers.map(toTriggerSummary),
    };
  }

  async createOrchestration(
    scope: TenantScope,
    input: CreateOrchestrationRequest,
  ): Promise<OrchestrationDetail> {
    const name = input.name.trim();
    if (!name) {
      throw new AgentOrchestrationError('VALIDATION_ERROR', 'Orchestration name is required');
    }

    const [created] = await this.db
      .insert(agentOrchestrations)
      .values({
        companyId: scope.companyId,
        name,
        description: input.description?.trim() || null,
        status: input.status ?? 'draft',
        requiresApproval: input.requiresApproval ?? false,
        config: input.config ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    const detail = await this.getOrchestration(scope.companyId, created!.id);
    if (!detail) {
      throw new AgentOrchestrationError('CREATE_FAILED', 'Unable to load orchestration');
    }

    return detail;
  }

  async updateOrchestration(
    companyId: string,
    orchestrationId: string,
    input: UpdateOrchestrationRequest,
  ): Promise<OrchestrationDetail> {
    const existing = await this.getOrchestration(companyId, orchestrationId);
    if (!existing) {
      throw new AgentOrchestrationError('NOT_FOUND', 'Orchestration not found');
    }

    await this.db
      .update(agentOrchestrations)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.requiresApproval !== undefined
          ? { requiresApproval: input.requiresApproval }
          : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentOrchestrations.id, orchestrationId),
          eq(agentOrchestrations.companyId, companyId),
        ),
      );

    const detail = await this.getOrchestration(companyId, orchestrationId);
    if (!detail) {
      throw new AgentOrchestrationError('UPDATE_FAILED', 'Unable to load orchestration');
    }

    return detail;
  }

  async addStep(
    companyId: string,
    orchestrationId: string,
    input: CreateOrchestrationStepRequest,
  ): Promise<OrchestrationDetail> {
    const orchestration = await this.getOrchestration(companyId, orchestrationId);
    if (!orchestration) {
      throw new AgentOrchestrationError('NOT_FOUND', 'Orchestration not found');
    }

    const stepKey = input.stepKey.trim();
    const name = input.name.trim();
    const requestTemplate = input.requestTemplate.trim();

    if (!stepKey || !name || !requestTemplate) {
      throw new AgentOrchestrationError(
        'VALIDATION_ERROR',
        'Step key, name, and request template are required',
      );
    }

    await this.db.insert(agentOrchestrationSteps).values({
      companyId,
      orchestrationId,
      agentKey: input.agentKey,
      stepKey,
      name,
      executionMode: input.executionMode ?? 'sequential',
      parallelGroupKey: input.parallelGroupKey ?? null,
      sortOrder: input.sortOrder ?? orchestration.steps.length,
      requestTemplate,
      capabilityRequest: input.capabilityRequest ?? null,
      requiresApproval: input.requiresApproval ?? false,
      handoffKeys: input.handoffKeys ?? [],
      config: input.config ?? {},
    });

    const detail = await this.getOrchestration(companyId, orchestrationId);
    return detail!;
  }

  async addTrigger(
    companyId: string,
    orchestrationId: string,
    input: CreateOrchestrationTriggerRequest,
  ): Promise<OrchestrationDetail> {
    const orchestration = await this.getOrchestration(companyId, orchestrationId);
    if (!orchestration) {
      throw new AgentOrchestrationError('NOT_FOUND', 'Orchestration not found');
    }

    await this.db.insert(agentOrchestrationTriggers).values({
      companyId,
      orchestrationId,
      eventType: input.eventType,
      enabled: input.enabled ?? true,
      conditionConfig: input.conditionConfig ?? {},
    });

    const detail = await this.getOrchestration(companyId, orchestrationId);
    return detail!;
  }

  async listRuns(companyId: string): Promise<OrchestrationRunSummary[]> {
    const rows = await this.db.query.agentOrchestrationRuns.findMany({
      where: eq(agentOrchestrationRuns.companyId, companyId),
      with: { orchestration: true },
      orderBy: [desc(agentOrchestrationRuns.createdAt)],
      limit: 50,
    });

    return rows.map(toRunSummary);
  }

  async getRun(companyId: string, runId: string): Promise<OrchestrationRunDetail | null> {
    const row = await this.db.query.agentOrchestrationRuns.findFirst({
      where: and(
        eq(agentOrchestrationRuns.id, runId),
        eq(agentOrchestrationRuns.companyId, companyId),
      ),
      with: { orchestration: true },
    });

    if (!row) return null;

    const [steps, logs] = await Promise.all([
      this.db.query.agentOrchestrationRunSteps.findMany({
        where: eq(agentOrchestrationRunSteps.runId, runId),
        orderBy: [
          asc(agentOrchestrationRunSteps.sortOrder),
          asc(agentOrchestrationRunSteps.createdAt),
        ],
      }),
      this.db.query.agentOrchestrationLogs.findMany({
        where: eq(agentOrchestrationLogs.runId, runId),
        orderBy: [asc(agentOrchestrationLogs.createdAt)],
        limit: 100,
      }),
    ]);

    return {
      ...toRunSummary(row),
      context: row.context ?? {},
      steps: steps.map(toRunStepSummary),
      logs: logs.map(toLogSummary),
    };
  }

  async listApprovals(companyId: string): Promise<OrchestrationApprovalSummary[]> {
    const rows = await this.db.query.agentOrchestrationApprovals.findMany({
      where: eq(agentOrchestrationApprovals.companyId, companyId),
      with: {
        run: { with: { orchestration: true } },
        runStep: true,
      },
      orderBy: [desc(agentOrchestrationApprovals.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      runStepId: row.runStepId,
      orchestrationName: row.run?.orchestration?.name ?? null,
      stepKey: row.runStep?.stepKey ?? 'unknown',
      agentKey: row.runStep?.agentKey ?? 'executive',
      status: row.status,
      preview: row.preview,
      payload: row.payload ?? {},
      requestedByUserId: row.requestedByUserId,
      decidedByUserId: row.decidedByUserId,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    }));
  }

  async listLogs(companyId: string, runId: string): Promise<OrchestrationLogSummary[]> {
    const rows = await this.db.query.agentOrchestrationLogs.findMany({
      where: and(
        eq(agentOrchestrationLogs.companyId, companyId),
        eq(agentOrchestrationLogs.runId, runId),
      ),
      orderBy: [asc(agentOrchestrationLogs.createdAt)],
      limit: 200,
    });

    return rows.map(toLogSummary);
  }

  async buildAuraContext(companyId: string): Promise<OrchestrationAuraContext> {
    const [activeOrchestrations, activeRuns, pendingApprovals, recentRuns] = await Promise.all([
      this.db.query.agentOrchestrations.findMany({
        where: and(
          eq(agentOrchestrations.companyId, companyId),
          eq(agentOrchestrations.status, 'active'),
        ),
      }),
      this.db.query.agentOrchestrationRuns.findMany({
        where: and(
          eq(agentOrchestrationRuns.companyId, companyId),
          inArray(agentOrchestrationRuns.status, ['pending', 'running', 'awaiting_approval']),
        ),
        limit: 20,
      }),
      this.db.query.agentOrchestrationApprovals.findMany({
        where: and(
          eq(agentOrchestrationApprovals.companyId, companyId),
          eq(agentOrchestrationApprovals.status, 'pending'),
        ),
      }),
      this.db.query.agentOrchestrationRuns.findMany({
        where: eq(agentOrchestrationRuns.companyId, companyId),
        with: { orchestration: true },
        orderBy: [desc(agentOrchestrationRuns.createdAt)],
        limit: 5,
      }),
    ]);

    return {
      activeOrchestrationCount: activeOrchestrations.length,
      activeRunCount: activeRuns.length,
      pendingApprovalCount: pendingApprovals.length,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        orchestrationName: run.orchestration?.name ?? null,
        status: run.status,
        triggerEvent: run.triggerEvent,
        startedAt: run.startedAt?.toISOString() ?? null,
      })),
    };
  }

  private async toOrchestrationSummary(
    row: typeof agentOrchestrations.$inferSelect,
  ): Promise<OrchestrationSummary> {
    const [stepCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentOrchestrationSteps)
      .where(eq(agentOrchestrationSteps.orchestrationId, row.id));

    const [triggerCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentOrchestrationTriggers)
      .where(eq(agentOrchestrationTriggers.orchestrationId, row.id));

    const [runCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentOrchestrationRuns)
      .where(eq(agentOrchestrationRuns.orchestrationId, row.id));

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      requiresApproval: row.requiresApproval,
      stepCount: stepCountRow?.count ?? 0,
      triggerCount: triggerCountRow?.count ?? 0,
      runCount: runCountRow?.count ?? 0,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function toStepSummary(row: typeof agentOrchestrationSteps.$inferSelect) {
  return {
    id: row.id,
    agentKey: row.agentKey,
    stepKey: row.stepKey,
    name: row.name,
    executionMode: row.executionMode,
    parallelGroupKey: row.parallelGroupKey,
    sortOrder: row.sortOrder,
    requestTemplate: row.requestTemplate,
    capabilityRequest: row.capabilityRequest,
    requiresApproval: row.requiresApproval,
    handoffKeys: row.handoffKeys ?? [],
  };
}

function toTriggerSummary(row: typeof agentOrchestrationTriggers.$inferSelect) {
  return {
    id: row.id,
    eventType: row.eventType as OrchestrationDetail['triggers'][number]['eventType'],
    enabled: row.enabled,
    conditionConfig: row.conditionConfig ?? {},
  };
}

function toRunSummary(
  row: typeof agentOrchestrationRuns.$inferSelect & {
    orchestration?: typeof agentOrchestrations.$inferSelect | null;
  },
): OrchestrationRunSummary {
  return {
    id: row.id,
    orchestrationId: row.orchestrationId,
    orchestrationName: row.orchestration?.name ?? null,
    triggerEvent: row.triggerEvent,
    triggerEntityType: row.triggerEntityType,
    triggerEntityId: row.triggerEntityId,
    status: row.status,
    initiatedByUserId: row.initiatedByUserId,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRunStepSummary(row: typeof agentOrchestrationRunSteps.$inferSelect) {
  return {
    id: row.id,
    stepKey: row.stepKey,
    agentKey: row.agentKey,
    agentRunId: row.agentRunId,
    executionMode: row.executionMode,
    parallelGroupKey: row.parallelGroupKey,
    sortOrder: row.sortOrder,
    status: row.status,
    requiresApproval: row.requiresApproval,
    contextIn: row.contextIn ?? {},
    contextOut: row.contextOut ?? {},
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toLogSummary(row: typeof agentOrchestrationLogs.$inferSelect): OrchestrationLogSummary {
  return {
    id: row.id,
    runId: row.runId,
    runStepId: row.runStepId,
    logLevel: row.logLevel,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}
