import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type {
  BusinessEventType,
  WorkflowActionType,
  WorkflowConditionOperator,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowSimulationResult,
  WorkflowTriggerType,
} from '@titan/shared';
import { BUSINESS_EVENT_TO_TRIGGER } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  automationQueueJobs,
  invoices,
  workflowActions,
  workflowConditions,
  workflowExecutions,
  workflowRuns,
  workflowStepResults,
  workflowSteps,
  workflowTriggers,
  workflows,
} from '@titan/db';
import type { BusinessEvent } from '../lib/automation-events.js';
import { resolveTriggerType } from '../lib/automation-events.js';
import type { CommunicationsService } from './communications.service.js';
import type { CrmService } from './crm.service.js';
import type { JobsService } from './jobs.service.js';
import type { WhatsappService } from './whatsapp.service.js';

export class WorkflowEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowEngineError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type WorkflowEngineDeps = {
  db: DatabaseClient;
  crmService: CrmService;
  jobsService: JobsService;
  whatsappService: WhatsappService;
  communicationsService: CommunicationsService;
};

const APPROVAL_REQUIRED_ACTIONS = new Set<WorkflowActionType>([
  'send_communication',
  'send_email_draft',
  'send_whatsapp_template',
  'send_whatsapp_draft',
  'update_job_status',
  'update_customer',
  'assign_job_task',
  'create_payment_reminder',
  'ask_aura_agent',
  'assign_user',
  'create_draft_sms',
  'create_draft_customer_response',
  'create_purchase_order_draft',
  'generate_report',
  'create_follow_up',
  'run_ai_agent',
  'update_record',
]);

export class WorkflowEngineService {
  constructor(private readonly deps: WorkflowEngineDeps) {}

  async emit(event: BusinessEvent): Promise<void> {
    await this.deps.db.insert(automationQueueJobs).values({
      companyId: event.companyId,
      jobType: 'execute_event',
      payload: event,
      status: 'pending',
    });
  }

  async processPendingJobs(limit = 10): Promise<number> {
    const now = new Date();
    const pendingJobs = await this.deps.db.query.automationQueueJobs.findMany({
      where: and(
        inArray(automationQueueJobs.status, ['pending', 'retry']),
        inArray(automationQueueJobs.jobType, ['execute_event', 'retry_step', 'scheduled_workflow']),
        lte(automationQueueJobs.scheduledFor, now),
      ),
      orderBy: [asc(automationQueueJobs.scheduledFor)],
      limit,
    });

    let processed = 0;

    for (const job of pendingJobs) {
      const [claimed] = await this.deps.db
        .update(automationQueueJobs)
        .set({
          status: 'running',
          startedAt: now,
          attempts: job.attempts + 1,
        })
        .where(
          and(
            eq(automationQueueJobs.id, job.id),
            inArray(automationQueueJobs.status, ['pending', 'retry']),
          ),
        )
        .returning();

      if (!claimed) {
        continue;
      }

      try {
        if (claimed.jobType === 'execute_event') {
          await this.processEventJob(claimed.payload as BusinessEvent);
        } else if (claimed.jobType === 'retry_step') {
          await this.processRetryJob(claimed.payload);
        } else if (claimed.jobType === 'scheduled_workflow') {
          await this.processScheduledJob(claimed.companyId);
        }

        await this.deps.db
          .update(automationQueueJobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(automationQueueJobs.id, claimed.id));

        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown queue error';
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

  async simulateRun(
    scope: TenantScope,
    workflowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<WorkflowSimulationResult> {
    const workflow = await this.deps.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, scope.companyId)),
      with: {
        actions: { orderBy: [asc(workflowActions.sortOrder)] },
      },
    });

    if (!workflow) {
      throw new WorkflowEngineError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const startedAt = new Date();
    const [run] = await this.deps.db
      .insert(workflowRuns)
      .values({
        companyId: scope.companyId,
        workflowId: workflow.id,
        triggerEvent: 'simulation',
        triggerEntityType: 'simulation',
        triggerEntityId: workflow.id,
        status: 'running',
        isSimulation: true,
        initiatedByUserId: scope.userId,
        startedAt,
      })
      .returning();

    const steps: WorkflowSimulationResult['steps'] = [];

    for (const [index, action] of workflow.actions.entries()) {
      const requiresApproval = APPROVAL_REQUIRED_ACTIONS.has(action.actionType);
      const preview = await this.buildActionPreview(
        scope,
        action.actionType,
        action.config ?? {},
        'simulation',
        workflow.id,
        payload,
      );

      await this.deps.db.insert(workflowSteps).values({
        companyId: scope.companyId,
        workflowRunId: run!.id,
        workflowActionId: action.id,
        actionType: action.actionType,
        sortOrder: action.sortOrder ?? index,
        status: requiresApproval ? 'awaiting_approval' : 'completed',
        config: action.config ?? {},
      });

      steps.push({
        actionType: action.actionType,
        sortOrder: action.sortOrder ?? index,
        preview,
        requiresApproval,
      });
    }

    const completedAt = new Date();
    await this.deps.db
      .update(workflowRuns)
      .set({
        status: 'completed',
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(workflowRuns.id, run!.id));

    return {
      workflowId,
      runId: run!.id,
      status: 'completed',
      steps,
      summary: `Simulation completed for "${workflow.name}" with ${steps.length} step(s). No production data modified.`,
    };
  }

  async processDueSchedules(limit = 20): Promise<number> {
    const now = new Date();
    const { workflowSchedules } = await import('@titan/db');
    const dueSchedules = await this.deps.db.query.workflowSchedules.findMany({
      where: and(eq(workflowSchedules.enabled, true), lte(workflowSchedules.nextRunAt, now)),
      limit,
    });

    let processed = 0;

    for (const schedule of dueSchedules) {
      const event: BusinessEvent = {
        companyId: schedule.companyId,
        eventType: 'scheduled.time',
        entityType: 'schedule',
        entityId: schedule.id,
        payload: { workflowId: schedule.workflowId, scheduleType: schedule.scheduleType },
      };

      await this.emit(event);

      const nextRunAt =
        schedule.scheduleType === 'interval' && schedule.intervalMinutes
          ? new Date(now.getTime() + schedule.intervalMinutes * 60_000)
          : schedule.scheduleType === 'daily'
            ? new Date(now.getTime() + 24 * 60 * 60_000)
            : schedule.scheduleType === 'weekly'
              ? new Date(now.getTime() + 7 * 24 * 60 * 60_000)
              : schedule.scheduleType === 'monthly'
                ? new Date(now.getTime() + 30 * 24 * 60 * 60_000)
                : null;

      await this.deps.db
        .update(workflowSchedules)
        .set({
          lastRunAt: now,
          nextRunAt,
          updatedAt: now,
        })
        .where(eq(workflowSchedules.id, schedule.id));

      processed += 1;
    }

    return processed;
  }

  async runManual(
    scope: TenantScope,
    workflowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<WorkflowRunDetail> {
    const workflow = await this.deps.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, scope.companyId)),
      with: {
        triggers: true,
        actions: { orderBy: [asc(workflowActions.sortOrder)] },
        conditions: { orderBy: [asc(workflowConditions.sortOrder)] },
      },
    });

    if (!workflow) {
      throw new WorkflowEngineError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const event: BusinessEvent = {
      companyId: scope.companyId,
      eventType: 'job.status_changed',
      entityType: 'manual',
      entityId: workflowId,
      payload: { manual: true, ...payload },
      actorUserId: scope.userId,
    };

    const run = await this.executeWorkflow(workflow, event, 'manual', scope.userId);
    const detail = await this.getRun(scope.companyId, run.id);

    if (!detail) {
      throw new WorkflowEngineError('RUN_NOT_FOUND', 'Workflow run not found');
    }

    return detail;
  }

  async listRuns(companyId: string, workflowId?: string): Promise<WorkflowRunSummary[]> {
    const rows = await this.deps.db.query.workflowRuns.findMany({
      where: workflowId
        ? and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.workflowId, workflowId))
        : eq(workflowRuns.companyId, companyId),
      with: { workflow: true },
      orderBy: [desc(workflowRuns.startedAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflow?.name ?? null,
      triggerEvent: row.triggerEvent,
      triggerEntityType: row.triggerEntityType,
      triggerEntityId: row.triggerEntityId,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      durationMs: row.durationMs ?? null,
      isSimulation: row.isSimulation,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getRun(companyId: string, runId: string): Promise<WorkflowRunDetail | null> {
    const row = await this.deps.db.query.workflowRuns.findFirst({
      where: and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)),
      with: {
        workflow: true,
        steps: {
          orderBy: [asc(workflowSteps.sortOrder)],
          with: {
            results: { orderBy: [desc(workflowStepResults.createdAt)] },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflow?.name ?? null,
      triggerEvent: row.triggerEvent,
      triggerEntityType: row.triggerEntityType,
      triggerEntityId: row.triggerEntityId,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      durationMs: row.durationMs ?? null,
      isSimulation: row.isSimulation,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      steps: row.steps.map((step) => ({
        id: step.id,
        actionType: step.actionType,
        sortOrder: step.sortOrder,
        status: step.status,
        config: step.config ?? {},
        createdAt: step.createdAt.toISOString(),
        results: step.results.map((result) => ({
          id: result.id,
          status: result.status,
          output: result.output ?? null,
          errorMessage: result.errorMessage,
          requiresApproval: result.requiresApproval,
          preview: result.preview,
          approvedByUserId: result.approvedByUserId,
          executedAt: result.executedAt?.toISOString() ?? null,
          createdAt: result.createdAt.toISOString(),
        })),
      })),
    };
  }

  async approveStepResult(scope: TenantScope, stepResultId: string): Promise<WorkflowRunDetail> {
    const result = await this.deps.db.query.workflowStepResults.findFirst({
      where: and(
        eq(workflowStepResults.id, stepResultId),
        eq(workflowStepResults.companyId, scope.companyId),
      ),
      with: {
        workflowStep: {
          with: {
            workflowRun: {
              with: {
                workflow: true,
              },
            },
          },
        },
      },
    });

    if (!result) {
      throw new WorkflowEngineError('STEP_RESULT_NOT_FOUND', 'Step result not found');
    }

    if (result.status !== 'awaiting_approval') {
      throw new WorkflowEngineError('INVALID_STATE', 'Step result is not awaiting approval');
    }

    const step = result.workflowStep;
    const run = step.workflowRun;
    const actorUserId = run.workflow?.createdByUserId ?? scope.userId;

    const output = await this.executeApprovedAction(
      { companyId: scope.companyId, userId: actorUserId },
      step.actionType,
      step.config ?? {},
      run.triggerEntityId,
      result.preview,
      result.output ?? {},
    );

    await this.deps.db
      .update(workflowStepResults)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        executedAt: new Date(),
        output: { ...result.output, ...output },
        updatedAt: new Date(),
      })
      .where(eq(workflowStepResults.id, stepResultId));

    await this.deps.db
      .update(workflowSteps)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(workflowSteps.id, step.id));

    await this.finalizeRunIfReady(run.id);

    const detail = await this.getRun(scope.companyId, run.id);

    if (!detail) {
      throw new WorkflowEngineError('RUN_NOT_FOUND', 'Workflow run not found');
    }

    return detail;
  }

  async rejectStepResult(scope: TenantScope, stepResultId: string): Promise<void> {
    const result = await this.deps.db.query.workflowStepResults.findFirst({
      where: and(
        eq(workflowStepResults.id, stepResultId),
        eq(workflowStepResults.companyId, scope.companyId),
      ),
      with: { workflowStep: true },
    });

    if (!result) {
      throw new WorkflowEngineError('STEP_RESULT_NOT_FOUND', 'Step result not found');
    }

    await this.deps.db
      .update(workflowStepResults)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(workflowStepResults.id, stepResultId));

    await this.deps.db
      .update(workflowSteps)
      .set({ status: 'skipped', updatedAt: new Date() })
      .where(eq(workflowSteps.id, result.workflowStepId));

    await this.finalizeRunIfReady(result.workflowStep.workflowRunId);
  }

  async retryStep(scope: TenantScope, stepId: string): Promise<void> {
    const step = await this.deps.db.query.workflowSteps.findFirst({
      where: and(eq(workflowSteps.id, stepId), eq(workflowSteps.companyId, scope.companyId)),
      with: { workflowRun: true },
    });

    if (!step) {
      throw new WorkflowEngineError('STEP_NOT_FOUND', 'Workflow step not found');
    }

    await this.deps.db.insert(automationQueueJobs).values({
      companyId: scope.companyId,
      jobType: 'retry_step',
      payload: { stepId: step.id, runId: step.workflowRunId },
      status: 'pending',
    });
  }

  async enqueueOverdueInvoiceCheck(companyId: string): Promise<void> {
    await this.deps.db.insert(automationQueueJobs).values({
      companyId,
      jobType: 'scheduled_workflow',
      payload: { kind: 'invoice_overdue' },
      status: 'pending',
    });
  }

  async getPendingApprovalCount(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowStepResults)
      .where(
        and(
          eq(workflowStepResults.companyId, companyId),
          eq(workflowStepResults.status, 'awaiting_approval'),
        ),
      );

    return row?.count ?? 0;
  }

  private async processEventJob(event: BusinessEvent): Promise<void> {
    const triggerType = resolveTriggerType(event);
    const activeWorkflows = await this.deps.db.query.workflows.findMany({
      where: and(eq(workflows.companyId, event.companyId), eq(workflows.status, 'active')),
      with: {
        triggers: true,
        actions: { orderBy: [asc(workflowActions.sortOrder)] },
        conditions: { orderBy: [asc(workflowConditions.sortOrder)] },
      },
    });

    for (const workflow of activeWorkflows) {
      const matchingTrigger = workflow.triggers.find((trigger) =>
        this.matchesTrigger(trigger.triggerType, trigger.config ?? {}, triggerType, event),
      );

      if (!matchingTrigger) {
        continue;
      }

      if (!this.evaluateConditions(workflow.conditions, event.payload)) {
        continue;
      }

      await this.executeWorkflow(workflow, event, triggerType, event.actorUserId);
    }
  }

  private async processRetryJob(payload: Record<string, unknown>): Promise<void> {
    const stepId = String(payload.stepId ?? '');
    const step = await this.deps.db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepId),
      with: {
        workflowRun: {
          with: { workflow: true },
        },
      },
    });

    if (!step) {
      return;
    }

    await this.deps.db
      .update(workflowSteps)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(workflowSteps.id, step.id));

    await this.runStep(
      {
        companyId: step.companyId,
        userId: step.workflowRun.workflow?.createdByUserId ?? step.companyId,
      },
      step,
      step.workflowRun.triggerEntityType,
      step.workflowRun.triggerEntityId,
      {},
    );
  }

  private async processScheduledJob(companyId: string): Promise<void> {
    const now = new Date();
    const overdueInvoices = await this.deps.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, companyId),
        eq(invoices.status, 'sent'),
        lte(invoices.dueDate, now),
      ),
    });

    for (const invoice of overdueInvoices) {
      const event: BusinessEvent = {
        companyId,
        eventType: 'invoice.overdue',
        entityType: 'invoice',
        entityId: invoice.id,
        payload: {
          invoice: {
            id: invoice.id,
            status: invoice.status,
            amountCents: invoice.amountCents,
            dueDate: invoice.dueDate?.toISOString() ?? null,
            customerId: invoice.customerId,
          },
        },
      };

      await this.processEventJob(event);
    }
  }

  private async executeWorkflow(
    workflow: typeof workflows.$inferSelect & {
      triggers: (typeof workflowTriggers.$inferSelect)[];
      actions: (typeof workflowActions.$inferSelect)[];
      conditions: (typeof workflowConditions.$inferSelect)[];
    },
    event: BusinessEvent,
    triggerType: WorkflowTriggerType | 'manual',
    actorUserId?: string,
  ) {
    const [execution] = await this.deps.db
      .insert(workflowExecutions)
      .values({
        companyId: event.companyId,
        workflowId: workflow.id,
        triggerType,
        status: 'running',
        triggerEntityType: event.entityType,
        triggerEntityId: event.entityId,
        startedAt: new Date(),
      })
      .returning();

    const [run] = await this.deps.db
      .insert(workflowRuns)
      .values({
        companyId: event.companyId,
        workflowId: workflow.id,
        workflowExecutionId: execution!.id,
        triggerEvent: triggerType === 'manual' ? 'manual' : event.eventType,
        triggerEntityType: event.entityType,
        triggerEntityId: event.entityId,
        status: 'running',
        initiatedByUserId: actorUserId ?? null,
        startedAt: new Date(),
      })
      .returning();

    const runStartedAt = new Date();

    const scope: TenantScope = {
      companyId: event.companyId,
      userId: actorUserId ?? workflow.createdByUserId,
    };

    let runFailed = false;
    let awaitingApproval = false;

    for (const [index, action] of workflow.actions.entries()) {
      const [step] = await this.deps.db
        .insert(workflowSteps)
        .values({
          companyId: event.companyId,
          workflowRunId: run!.id,
          workflowActionId: action.id,
          actionType: action.actionType,
          sortOrder: action.sortOrder ?? index,
          status: 'running',
          config: action.config ?? {},
        })
        .returning();

      try {
        const stepResult = await this.runStep(
          scope,
          step!,
          event.entityType,
          event.entityId,
          event.payload,
        );

        if (stepResult.requiresApproval) {
          awaitingApproval = true;
        }
      } catch (error) {
        runFailed = true;
        const message = error instanceof Error ? error.message : 'Step failed';

        await this.deps.db
          .update(workflowSteps)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(workflowSteps.id, step!.id));

        await this.deps.db
          .update(workflowRuns)
          .set({
            status: 'failed',
            errorMessage: message,
            completedAt: new Date(),
          })
          .where(eq(workflowRuns.id, run!.id));

        await this.deps.db
          .update(workflowExecutions)
          .set({
            status: 'failed',
            errorMessage: message,
            completedAt: new Date(),
          })
          .where(eq(workflowExecutions.id, execution!.id));

        break;
      }
    }

    if (!runFailed) {
      const finalStatus = awaitingApproval ? 'awaiting_approval' : 'completed';
      const completedAt = awaitingApproval ? null : new Date();

      await this.deps.db
        .update(workflowRuns)
        .set({
          status: finalStatus,
          completedAt,
          durationMs: completedAt ? completedAt.getTime() - runStartedAt.getTime() : null,
        })
        .where(eq(workflowRuns.id, run!.id));

      await this.deps.db
        .update(workflowExecutions)
        .set({
          status: finalStatus === 'awaiting_approval' ? 'running' : 'completed',
          completedAt: awaitingApproval ? null : new Date(),
        })
        .where(eq(workflowExecutions.id, execution!.id));
    }

    return run!;
  }

  private async runStep(
    scope: TenantScope,
    step: typeof workflowSteps.$inferSelect,
    entityType: string | null,
    entityId: string | null,
    payload: Record<string, unknown>,
  ): Promise<{ requiresApproval: boolean }> {
    const requiresApproval = APPROVAL_REQUIRED_ACTIONS.has(step.actionType);

    if (requiresApproval) {
      const preview = await this.buildActionPreview(
        scope,
        step.actionType,
        step.config ?? {},
        entityType,
        entityId,
        payload,
      );

      await this.deps.db.insert(workflowStepResults).values({
        companyId: scope.companyId,
        workflowStepId: step.id,
        status: 'awaiting_approval',
        requiresApproval: true,
        preview,
        output: { draft: true },
      });

      await this.deps.db
        .update(workflowSteps)
        .set({ status: 'awaiting_approval', updatedAt: new Date() })
        .where(eq(workflowSteps.id, step.id));

      return { requiresApproval: true };
    }

    const output = await this.executeImmediateAction(
      scope,
      step.actionType,
      step.config ?? {},
      entityType,
      entityId,
      payload,
    );

    await this.deps.db.insert(workflowStepResults).values({
      companyId: scope.companyId,
      workflowStepId: step.id,
      status: 'completed',
      requiresApproval: false,
      output,
      executedAt: new Date(),
    });

    await this.deps.db
      .update(workflowSteps)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(workflowSteps.id, step.id));

    return { requiresApproval: false };
  }

  private matchesTrigger(
    triggerType: WorkflowTriggerType,
    config: Record<string, unknown>,
    eventTrigger: WorkflowTriggerType | 'manual',
    event: BusinessEvent,
  ): boolean {
    if (triggerType === 'manual' && eventTrigger === 'manual') {
      return true;
    }

    if (triggerType !== eventTrigger) {
      return false;
    }

    if (triggerType === 'job_status_changed' && config.jobStatus) {
      const status = getNestedValue(event.payload, 'job.status');
      return String(status ?? '') === String(config.jobStatus);
    }

    if (triggerType === 'vehicle_status_changed' && config.vehicleStatus) {
      const status = getNestedValue(event.payload, 'vehicle.status');
      return String(status ?? '') === String(config.vehicleStatus);
    }

    return true;
  }

  private evaluateConditions(
    conditions: (typeof workflowConditions.$inferSelect)[],
    payload: Record<string, unknown>,
  ): boolean {
    if (conditions.length === 0) {
      return true;
    }

    return conditions.every((condition) => {
      const actual = getNestedValue(payload, condition.field);
      const expected = condition.value;

      switch (condition.operator as WorkflowConditionOperator) {
        case 'exists':
          return actual !== undefined && actual !== null && actual !== '';
        case 'not_exists':
          return actual === undefined || actual === null || actual === '';
        case 'not_equals':
          return String(actual ?? '') !== String(expected ?? '');
        case 'contains':
          return String(actual ?? '').includes(String(expected ?? ''));
        case 'greater_than':
          return Number(actual ?? 0) > Number(expected ?? 0);
        case 'less_than':
          return Number(actual ?? 0) < Number(expected ?? 0);
        case 'equals':
        default:
          return String(actual ?? '') === String(expected ?? '');
      }
    });
  }

  private async buildActionPreview(
    _scope: TenantScope,
    actionType: WorkflowActionType,
    config: Record<string, unknown>,
    _entityType: string | null,
    entityId: string | null,
    payload: Record<string, unknown>,
  ): Promise<string> {
    switch (actionType) {
      case 'send_whatsapp_draft':
      case 'send_whatsapp_template':
      case 'create_payment_reminder':
        return `WhatsApp draft for customer ${String(payload.customerId ?? config.customerId ?? entityId ?? 'unknown')}`;
      case 'send_email_draft':
      case 'send_communication':
        return `Email draft: ${String(config.subject ?? 'Payment reminder')} — ${String(config.body ?? 'Automated message draft')}`;
      case 'update_job_status':
        return `Update job ${String(entityId ?? config.jobId ?? 'unknown')} status to ${String(config.status ?? 'completed')}`;
      case 'update_customer':
        return `Update customer ${String(entityId ?? config.customerId ?? 'unknown')}: ${JSON.stringify(config)}`;
      case 'assign_job_task':
        return `Assign job ${String(entityId ?? config.jobId ?? 'unknown')} to user ${String(config.assignedUserId ?? 'unassigned')}`;
      case 'ask_aura_agent':
        return `AURA decision request: ${String(config.prompt ?? 'Review workflow context and recommend next action')}`;
      case 'create_task':
        return `Create task: ${String(config.title ?? 'Workflow task')}`;
      case 'assign_user':
        return `Assign user ${String(config.userId ?? 'unknown')} to ${String(config.targetType ?? 'record')}`;
      case 'notify_user':
        return `Notify user ${String(config.userId ?? 'unknown')}: ${String(config.message ?? 'Notification')}`;
      case 'send_internal_notification':
        return `Internal notification: ${String(config.message ?? 'Workflow notification')}`;
      case 'create_draft_sms':
        return `SMS draft: ${String(config.body ?? 'Automated SMS draft')}`;
      case 'create_draft_customer_response':
        return `Customer response draft for conversation ${String(config.conversationId ?? entityId ?? 'unknown')}`;
      case 'generate_recommendation':
        return `Generate recommendation: ${String(config.category ?? 'general')}`;
      case 'create_purchase_order_draft':
        return `Purchase order draft for supplier ${String(config.supplierId ?? 'unknown')}`;
      case 'generate_report':
        return `Generate report: ${String(config.reportName ?? 'Business report')}`;
      case 'create_follow_up':
        return `Create follow-up for ${String(config.customerId ?? entityId ?? 'customer')}`;
      case 'run_ai_agent':
        return `Run AI agent: ${String(config.agentKey ?? 'operations')} — ${String(config.request ?? 'Assist with workflow step')}`;
      case 'update_record':
        return `Update ${String(config.recordType ?? 'record')} ${String(entityId ?? config.recordId ?? 'unknown')}`;
      case 'create_approval_request':
        return `Approval request: ${String(config.title ?? 'Workflow approval required')}`;
      default:
        return `Action ${actionType} requires approval before execution.`;
    }
  }

  private async executeImmediateAction(
    scope: TenantScope,
    actionType: WorkflowActionType,
    config: Record<string, unknown>,
    entityType: string | null,
    entityId: string | null,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'log_customer_activity': {
        const customerId = String(
          config.customerId ?? payload.customerId ?? getNestedValue(payload, 'customer.id') ?? '',
        );

        if (!customerId) {
          throw new WorkflowEngineError('MISSING_CUSTOMER', 'Customer ID required for activity');
        }

        await this.deps.crmService.addActivity(scope, customerId, {
          content: String(config.content ?? 'Automated workflow activity'),
        });

        return { customerId };
      }
      case 'generate_summary':
        return {
          summary: String(
            config.summary ??
              `Workflow summary for ${entityType ?? 'event'} ${entityId ?? ''}`.trim(),
          ),
        };
      case 'notify_user':
      case 'send_internal_notification':
      case 'create_task':
      case 'generate_recommendation':
      case 'create_approval_request':
        return {
          simulated: false,
          actionType,
          message: `Completed ${actionType} without external side effects`,
        };
      default:
        return {};
    }
  }

  private async executeApprovedAction(
    scope: TenantScope,
    actionType: WorkflowActionType,
    config: Record<string, unknown>,
    entityId: string | null,
    preview: string | null,
    storedOutput: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'update_job_status': {
        const jobId = String(config.jobId ?? entityId ?? storedOutput.jobId ?? '');
        const status = String(config.status ?? 'completed') as import('@titan/shared').JobStatus;

        await this.deps.jobsService.updateJob(scope.companyId, jobId, { status });
        return { jobId, status };
      }
      case 'assign_job_task': {
        const jobId = String(config.jobId ?? entityId ?? '');
        const assignedUserId = String(config.assignedUserId ?? '');

        await this.deps.jobsService.updateJob(scope.companyId, jobId, { assignedUserId });
        return { jobId, assignedUserId };
      }
      case 'update_customer': {
        const customerId = String(config.customerId ?? entityId ?? '');
        await this.deps.crmService.updateCustomer(scope.companyId, customerId, {
          notes: config.notes ? String(config.notes) : undefined,
          status: config.status as import('@titan/shared').CustomerStatus | undefined,
        });
        return { customerId };
      }
      case 'send_email_draft':
      case 'send_communication': {
        const customerId = String(config.customerId ?? storedOutput.customerId ?? '');
        await this.deps.communicationsService.createMessage(scope, {
          customerId,
          channel: 'email',
          direction: 'outbound',
          subject: String(config.subject ?? 'Automated message'),
          body: preview ?? String(config.body ?? ''),
        });
        return { customerId, channel: 'email' };
      }
      case 'send_whatsapp_draft':
      case 'send_whatsapp_template':
      case 'create_payment_reminder': {
        const customerId = String(
          config.customerId ??
            storedOutput.customerId ??
            getNestedValue(storedOutput, 'customer.id') ??
            '',
        );

        const draft = await this.deps.whatsappService.createAutomationDraft(scope, {
          customerId,
          messageContent: preview ?? String(config.message ?? 'Payment reminder'),
          templateId: typeof config.templateId === 'string' ? config.templateId : null,
          notificationCategory:
            (config.category as import('@titan/shared').WhatsappTemplateCategory | undefined) ??
            'payment_reminder',
        });

        return { whatsappMessageId: draft.id, customerId };
      }
      case 'ask_aura_agent':
        return {
          decision: preview ?? 'Awaiting AURA agent review',
          approved: true,
        };
      default:
        return storedOutput;
    }
  }

  private async finalizeRunIfReady(runId: string): Promise<void> {
    const steps = await this.deps.db.query.workflowSteps.findMany({
      where: eq(workflowSteps.workflowRunId, runId),
    });

    const hasPending = steps.some((step) =>
      ['pending', 'running', 'awaiting_approval'].includes(step.status),
    );

    if (hasPending) {
      return;
    }

    const hasFailed = steps.some((step) => step.status === 'failed');

    await this.deps.db
      .update(workflowRuns)
      .set({
        status: hasFailed ? 'failed' : 'completed',
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
  }
}

function getNestedValue(payload: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let current: unknown = payload;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function mapBusinessEventType(eventType: BusinessEventType): WorkflowTriggerType {
  return BUSINESS_EVENT_TO_TRIGGER[eventType];
}
