import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  agentOrchestrationApprovals,
  agentOrchestrationLogs,
  agentOrchestrationRunSteps,
  agentOrchestrationRuns,
  agentOrchestrationSteps,
  agentOrchestrationTriggers,
  agentOrchestrations,
  automationQueueJobs,
  users,
} from '@titan/db';
import type { BusinessEvent } from '../lib/automation-events.js';
import type { AgentOrchestrationService } from './agent-orchestration.service.js';
import type { AgentRuntimeService } from './agent-runtime.service.js';

export class AgentOrchestrationEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentOrchestrationEngineError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type EngineDeps = {
  db: DatabaseClient;
  orchestrationService: AgentOrchestrationService;
  agentRuntimeService: AgentRuntimeService;
};

export class AgentOrchestrationEngineService {
  constructor(private readonly deps: EngineDeps) {}

  async emit(event: BusinessEvent): Promise<void> {
    await this.deps.db.insert(automationQueueJobs).values({
      companyId: event.companyId,
      jobType: 'execute_orchestration_event',
      payload: event,
      status: 'pending',
    });
  }

  async processPendingJobs(limit = 10): Promise<number> {
    const now = new Date();
    const pendingJobs = await this.deps.db.query.automationQueueJobs.findMany({
      where: and(
        inArray(automationQueueJobs.status, ['pending', 'retry']),
        inArray(automationQueueJobs.jobType, ['execute_orchestration_event', 'execute_orchestration_run']),
        lte(automationQueueJobs.scheduledFor, now),
      ),
      orderBy: [asc(automationQueueJobs.scheduledFor)],
      limit,
    });

    let processed = 0;

    for (const job of pendingJobs) {
      const [claimed] = await this.deps.db
        .update(automationQueueJobs)
        .set({ status: 'running', startedAt: now, attempts: job.attempts + 1 })
        .where(
          and(
            eq(automationQueueJobs.id, job.id),
            inArray(automationQueueJobs.status, ['pending', 'retry']),
          ),
        )
        .returning();

      if (!claimed) continue;

      try {
        if (claimed.jobType === 'execute_orchestration_event') {
          await this.processEvent(claimed.payload as unknown as BusinessEvent);
        } else if (claimed.jobType === 'execute_orchestration_run') {
          const runId = String((claimed.payload as { runId?: string }).runId ?? '');
          if (runId) await this.executeRun(runId);
        }

        await this.deps.db
          .update(automationQueueJobs)
          .set({ status: 'completed', completedAt: new Date(), errorMessage: null })
          .where(eq(automationQueueJobs.id, claimed.id));

        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Orchestration job failed';
        const shouldRetry = claimed.attempts < claimed.maxAttempts;
        await this.deps.db
          .update(automationQueueJobs)
          .set({
            status: shouldRetry ? 'retry' : 'failed',
            errorMessage: message,
            scheduledFor: shouldRetry
              ? new Date(Date.now() + claimed.attempts * 30_000)
              : claimed.scheduledFor,
          })
          .where(eq(automationQueueJobs.id, claimed.id));
      }
    }

    return processed;
  }

  async processEvent(event: BusinessEvent): Promise<void> {
    const triggers = await this.deps.db.query.agentOrchestrationTriggers.findMany({
      where: and(
        eq(agentOrchestrationTriggers.companyId, event.companyId),
        eq(agentOrchestrationTriggers.eventType, event.eventType),
        eq(agentOrchestrationTriggers.enabled, true),
      ),
      with: { orchestration: true },
    });

    for (const trigger of triggers) {
      if (!trigger.orchestration || trigger.orchestration.status !== 'active') continue;
      await this.startRun({
        companyId: event.companyId,
        orchestrationId: trigger.orchestrationId,
        triggerEvent: event.eventType,
        triggerEntityType: event.entityType,
        triggerEntityId: event.entityId,
        initiatedByUserId: event.actorUserId ?? (await this.resolveSystemUserId(event.companyId)),
        initialContext: {
          event: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          payload: event.payload,
        },
      });
    }
  }

  async runManual(
    scope: TenantScope,
    orchestrationId: string,
    payload: Record<string, unknown> = {},
  ) {
    const orchestration = await this.deps.orchestrationService.getOrchestration(
      scope.companyId,
      orchestrationId,
    );

    if (!orchestration) {
      throw new AgentOrchestrationEngineError('NOT_FOUND', 'Orchestration not found');
    }

    if (orchestration.status !== 'active') {
      throw new AgentOrchestrationEngineError('INVALID_STATUS', 'Orchestration must be active to run');
    }

    return this.startRun({
      companyId: scope.companyId,
      orchestrationId,
      triggerEvent: 'manual',
      triggerEntityType: null,
      triggerEntityId: null,
      initiatedByUserId: scope.userId,
      initialContext: payload,
    });
  }

  async approveStep(scope: TenantScope, approvalId: string) {
    const approval = await this.deps.db.query.agentOrchestrationApprovals.findFirst({
      where: and(
        eq(agentOrchestrationApprovals.id, approvalId),
        eq(agentOrchestrationApprovals.companyId, scope.companyId),
      ),
    });

    if (!approval) {
      throw new AgentOrchestrationEngineError('NOT_FOUND', 'Approval not found');
    }

    if (approval.status !== 'pending') {
      throw new AgentOrchestrationEngineError('INVALID_STATUS', 'Approval is not pending');
    }

    await this.deps.db
      .update(agentOrchestrationApprovals)
      .set({ status: 'approved', decidedByUserId: scope.userId, decidedAt: new Date() })
      .where(eq(agentOrchestrationApprovals.id, approvalId));

    await this.deps.db
      .update(agentOrchestrationRunSteps)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(agentOrchestrationRunSteps.id, approval.runStepId));

    await this.log(approval.companyId, approval.runId, approval.runStepId, 'info', 'Step approved', {
      approvalId,
      userId: scope.userId,
    });

    await this.enqueueRunExecution(approval.runId);
  }

  async rejectStep(scope: TenantScope, approvalId: string) {
    const approval = await this.deps.db.query.agentOrchestrationApprovals.findFirst({
      where: and(
        eq(agentOrchestrationApprovals.id, approvalId),
        eq(agentOrchestrationApprovals.companyId, scope.companyId),
      ),
    });

    if (!approval) {
      throw new AgentOrchestrationEngineError('NOT_FOUND', 'Approval not found');
    }

    await this.deps.db
      .update(agentOrchestrationApprovals)
      .set({ status: 'rejected', decidedByUserId: scope.userId, decidedAt: new Date() })
      .where(eq(agentOrchestrationApprovals.id, approvalId));

    await this.deps.db
      .update(agentOrchestrationRuns)
      .set({ status: 'cancelled', completedAt: new Date(), errorMessage: 'Step rejected by reviewer' })
      .where(eq(agentOrchestrationRuns.id, approval.runId));

    await this.log(approval.companyId, approval.runId, approval.runStepId, 'warn', 'Step rejected', {
      approvalId,
      userId: scope.userId,
    });
  }

  private async startRun(input: {
    companyId: string;
    orchestrationId: string;
    triggerEvent: string;
    triggerEntityType: string | null;
    triggerEntityId: string | null;
    initiatedByUserId: string;
    initialContext: Record<string, unknown>;
  }) {
    const definitionSteps = await this.deps.db.query.agentOrchestrationSteps.findMany({
      where: eq(agentOrchestrationSteps.orchestrationId, input.orchestrationId),
      orderBy: [asc(agentOrchestrationSteps.sortOrder), asc(agentOrchestrationSteps.createdAt)],
    });

    if (definitionSteps.length === 0) {
      throw new AgentOrchestrationEngineError('VALIDATION_ERROR', 'Orchestration has no steps');
    }

    const [run] = await this.deps.db
      .insert(agentOrchestrationRuns)
      .values({
        companyId: input.companyId,
        orchestrationId: input.orchestrationId,
        triggerEvent: input.triggerEvent,
        triggerEntityType: input.triggerEntityType,
        triggerEntityId: input.triggerEntityId,
        status: 'pending',
        context: input.initialContext,
        initiatedByUserId: input.initiatedByUserId,
      })
      .returning();

    for (const step of definitionSteps) {
      await this.deps.db.insert(agentOrchestrationRunSteps).values({
        companyId: input.companyId,
        runId: run!.id,
        definitionStepId: step.id,
        agentKey: step.agentKey,
        stepKey: step.stepKey,
        executionMode: step.executionMode,
        parallelGroupKey: step.parallelGroupKey,
        sortOrder: step.sortOrder,
        requiresApproval: step.requiresApproval,
        contextIn: input.initialContext,
        status: 'pending',
      });
    }

    await this.log(input.companyId, run!.id, null, 'info', 'Orchestration run created', {
      triggerEvent: input.triggerEvent,
    });

    await this.enqueueRunExecution(run!.id);
    return this.deps.orchestrationService.getRun(input.companyId, run!.id);
  }

  private async enqueueRunExecution(runId: string) {
    const run = await this.deps.db.query.agentOrchestrationRuns.findFirst({
      where: eq(agentOrchestrationRuns.id, runId),
    });

    if (!run) return;

    await this.deps.db.insert(automationQueueJobs).values({
      companyId: run.companyId,
      jobType: 'execute_orchestration_run',
      payload: { runId },
      status: 'pending',
    });
  }

  private async executeRun(runId: string) {
    const run = await this.deps.db.query.agentOrchestrationRuns.findFirst({
      where: eq(agentOrchestrationRuns.id, runId),
      with: { orchestration: true },
    });

    if (!run) return;

    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
      return;
    }

    if (run.status === 'awaiting_approval') {
      return;
    }

    await this.deps.db
      .update(agentOrchestrationRuns)
      .set({ status: 'running', startedAt: run.startedAt ?? new Date() })
      .where(eq(agentOrchestrationRuns.id, runId));

    const steps = await this.deps.db.query.agentOrchestrationRunSteps.findMany({
      where: eq(agentOrchestrationRunSteps.runId, runId),
      orderBy: [asc(agentOrchestrationRunSteps.sortOrder), asc(agentOrchestrationRunSteps.createdAt)],
    });

    const pendingSteps = steps.filter((step) => step.status === 'pending');
    if (pendingSteps.length === 0) {
      await this.completeRun(run);
      return;
    }

    const groups = groupStepsForExecution(pendingSteps);
    let sharedContext = { ...(run.context ?? {}) };

    for (const group of groups) {
      if (group.length === 1) {
        const result = await this.executeStep(run, group[0]!, sharedContext);
        if (result.awaitingApproval) {
          await this.deps.db
            .update(agentOrchestrationRuns)
            .set({ status: 'awaiting_approval', context: sharedContext })
            .where(eq(agentOrchestrationRuns.id, runId));
          return;
        }
        if (result.failed) {
          await this.failRun(runId, result.errorMessage ?? 'Step failed');
          return;
        }
        sharedContext = { ...sharedContext, ...result.contextOut };
      } else {
        const results = await Promise.all(
          group.map((step) => this.executeStep(run, step, sharedContext)),
        );

        if (results.some((result) => result.awaitingApproval)) {
          await this.deps.db
            .update(agentOrchestrationRuns)
            .set({ status: 'awaiting_approval', context: sharedContext })
            .where(eq(agentOrchestrationRuns.id, runId));
          return;
        }

        const failed = results.find((result) => result.failed);
        if (failed) {
          await this.failRun(runId, failed.errorMessage ?? 'Parallel step failed');
          return;
        }

        for (const result of results) {
          sharedContext = { ...sharedContext, ...result.contextOut };
        }
      }
    }

    await this.deps.db
      .update(agentOrchestrationRuns)
      .set({ context: sharedContext })
      .where(eq(agentOrchestrationRuns.id, runId));

    await this.completeRun(run);
  }

  private async executeStep(
    run: typeof agentOrchestrationRuns.$inferSelect & {
      orchestration?: typeof agentOrchestrations.$inferSelect | null;
    },
    step: typeof agentOrchestrationRunSteps.$inferSelect,
    sharedContext: Record<string, unknown>,
  ): Promise<{ awaitingApproval: boolean; failed: boolean; errorMessage?: string; contextOut: Record<string, unknown> }> {
    const definitionStep = step.definitionStepId
      ? await this.deps.db.query.agentOrchestrationSteps.findFirst({
          where: eq(agentOrchestrationSteps.id, step.definitionStepId),
        })
      : null;

    const requestTemplate = definitionStep?.requestTemplate ?? 'Analyze the current business context.';
    const request = renderTemplate(requestTemplate, sharedContext);

    await this.deps.db
      .update(agentOrchestrationRunSteps)
      .set({ status: 'running', startedAt: new Date(), contextIn: sharedContext })
      .where(eq(agentOrchestrationRunSteps.id, step.id));

    await this.log(run.companyId, run.id, step.id, 'info', `Executing ${step.agentKey} step ${step.stepKey}`, {
      agentKey: step.agentKey,
    });

    try {
      const userId = run.initiatedByUserId ?? (await this.resolveSystemUserId(run.companyId));
      const response = await this.deps.agentRuntimeService.runAgent(
        { companyId: run.companyId, userId },
        {
          request,
          agentKey: step.agentKey,
          pageContext: extractPageContext(sharedContext),
        },
      );

      const contextOut: Record<string, unknown> = {
        [`${step.stepKey}.response`]: response.assistantMessage,
        [`${step.stepKey}.agentRunId`]: response.run.id,
        [`${step.stepKey}.toolsUsed`]: response.run.toolsUsed,
      };

      for (const key of definitionStep?.handoffKeys ?? []) {
        contextOut[key] = response.assistantMessage;
      }

      if (definitionStep?.capabilityRequest) {
        contextOut[`${step.stepKey}.capabilityRequest`] = definitionStep.capabilityRequest;
      }

      const needsApproval =
        step.requiresApproval ||
        run.orchestration?.requiresApproval ||
        response.pendingTasks.length > 0;

      if (needsApproval) {
        await this.deps.db.insert(agentOrchestrationApprovals).values({
          companyId: run.companyId,
          runId: run.id,
          runStepId: step.id,
          status: 'pending',
          preview: response.assistantMessage.slice(0, 500),
          payload: {
            agentRunId: response.run.id,
            pendingTaskIds: response.pendingTasks.map((task) => task.id),
            contextOut,
          },
          requestedByUserId: userId,
        });

        await this.deps.db
          .update(agentOrchestrationRunSteps)
          .set({
            status: 'awaiting_approval',
            agentRunId: response.run.id,
            contextOut,
          })
          .where(eq(agentOrchestrationRunSteps.id, step.id));

        await this.log(run.companyId, run.id, step.id, 'info', 'Step awaiting approval', {
          pendingTasks: response.pendingTasks.length,
        });

        return { awaitingApproval: true, failed: false, contextOut };
      }

      await this.deps.db
        .update(agentOrchestrationRunSteps)
        .set({
          status: 'completed',
          agentRunId: response.run.id,
          contextOut,
          completedAt: new Date(),
        })
        .where(eq(agentOrchestrationRunSteps.id, step.id));

      return { awaitingApproval: false, failed: false, contextOut };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent step failed';

      await this.deps.db
        .update(agentOrchestrationRunSteps)
        .set({ status: 'failed', errorMessage: message, completedAt: new Date() })
        .where(eq(agentOrchestrationRunSteps.id, step.id));

      await this.log(run.companyId, run.id, step.id, 'error', message, {});

      return { awaitingApproval: false, failed: true, errorMessage: message, contextOut: {} };
    }
  }

  private async completeRun(run: typeof agentOrchestrationRuns.$inferSelect) {
    await this.deps.db
      .update(agentOrchestrationRuns)
      .set({ status: 'completed', completedAt: new Date(), errorMessage: null })
      .where(eq(agentOrchestrationRuns.id, run.id));

    await this.log(run.companyId, run.id, null, 'info', 'Orchestration run completed', {});
  }

  private async failRun(runId: string, message: string) {
    const run = await this.deps.db.query.agentOrchestrationRuns.findFirst({
      where: eq(agentOrchestrationRuns.id, runId),
    });

    if (!run) return;

    await this.deps.db
      .update(agentOrchestrationRuns)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: message })
      .where(eq(agentOrchestrationRuns.id, runId));

    await this.log(run.companyId, run.id, null, 'error', message, {});
  }

  private async resolveSystemUserId(companyId: string): Promise<string> {
    const user = await this.deps.db.query.users.findFirst({
      where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      orderBy: [asc(users.createdAt)],
    });

    if (!user) {
      throw new AgentOrchestrationEngineError('NO_ACTIVE_USER', 'No active user found for orchestration run');
    }

    return user.id;
  }

  private async log(
    companyId: string,
    runId: string,
    runStepId: string | null,
    logLevel: 'info' | 'warn' | 'error',
    message: string,
    metadata: Record<string, unknown>,
  ) {
    await this.deps.db.insert(agentOrchestrationLogs).values({
      companyId,
      runId,
      runStepId,
      logLevel,
      message,
      metadata,
    });
  }
}

function groupStepsForExecution(steps: Array<typeof agentOrchestrationRunSteps.$inferSelect>) {
  const groups: Array<Array<typeof agentOrchestrationRunSteps.$inferSelect>> = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index]!;
    if (step.executionMode === 'parallel' && step.parallelGroupKey) {
      const groupKey = step.parallelGroupKey;
      const group = [step];
      index += 1;
      while (
        index < steps.length &&
        steps[index]!.executionMode === 'parallel' &&
        steps[index]!.parallelGroupKey === groupKey
      ) {
        group.push(steps[index]!);
        index += 1;
      }
      groups.push(group);
    } else {
      groups.push([step]);
      index += 1;
    }
  }

  return groups;
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    const value = context[trimmed];
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function extractPageContext(context: Record<string, unknown>) {
  return {
    customerId: typeof context.customerId === 'string' ? context.customerId : undefined,
    jobId: typeof context.jobId === 'string' ? context.jobId : undefined,
    vehicleId: typeof context.vehicleId === 'string' ? context.vehicleId : undefined,
    ...(typeof context.payload === 'object' && context.payload !== null
      ? {
          customerId:
            typeof (context.payload as Record<string, unknown>).customerId === 'string'
              ? ((context.payload as Record<string, unknown>).customerId as string)
              : undefined,
          jobId:
            typeof (context.payload as Record<string, unknown>).jobId === 'string'
              ? ((context.payload as Record<string, unknown>).jobId as string)
              : undefined,
        }
      : {}),
  };
}
