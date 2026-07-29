import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type {
  AutomationStats,
  CreateWorkflowActionRequest,
  CreateWorkflowConditionRequest,
  CreateWorkflowRequest,
  CreateWorkflowTriggerRequest,
  ReorderWorkflowActionsRequest,
  UpdateWorkflowRequest,
  WorkflowActionSummary,
  WorkflowConditionSummary,
  WorkflowDetail,
  WorkflowExecutionSummary,
  WorkflowSummary,
  WorkflowTriggerSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  users,
  workflowActions,
  workflowConditions,
  workflowExecutions,
  workflowRuns,
  workflowSchedules,
  workflowStepResults,
  workflowTemplates,
  workflowTriggers,
  workflows,
} from '@titan/db';

export class AutomationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

export type AuraAutomationContext = {
  workflowCount: number;
  activeWorkflowCount: number;
  executionCount: number;
  runCount: number;
  pendingApprovalCount: number;
  engineActive: boolean;
  availableTriggers: string[];
  availableActions: string[];
  workflows: Array<{
    name: string;
    status: string;
    triggerCount: number;
    actionCount: number;
    triggers: string[];
    actions: string[];
  }>;
  recentExecutions: Array<{
    workflowName: string | null;
    triggerType: string;
    status: string;
    startedAt: string;
    errorMessage: string | null;
  }>;
  focusedWorkflow: {
    name: string;
    status: string;
    description: string | null;
    triggers: string[];
    actions: string[];
    recentExecutions: Array<{
      triggerType: string;
      status: string;
      startedAt: string;
      errorMessage: string | null;
    }>;
  } | null;
};

type TenantScope = {
  companyId: string;
  userId: string;
};

export class AutomationService {
  constructor(private readonly db: DatabaseClient) {}

  async listWorkflows(companyId: string): Promise<WorkflowSummary[]> {
    const rows = await this.db.query.workflows.findMany({
      where: eq(workflows.companyId, companyId),
      with: { createdBy: true },
      orderBy: [desc(workflows.updatedAt)],
    });

    const [triggerCounts, actionCounts, executionCounts, conditionCounts] = await Promise.all([
      this.getWorkflowChildCounts(companyId, 'triggers'),
      this.getWorkflowChildCounts(companyId, 'actions'),
      this.getWorkflowChildCounts(companyId, 'executions'),
      this.getWorkflowChildCounts(companyId, 'conditions'),
    ]);

    return rows.map((row) =>
      toWorkflowSummary(row, triggerCounts, actionCounts, executionCounts, conditionCounts),
    );
  }

  async getWorkflow(companyId: string, workflowId: string): Promise<WorkflowDetail | null> {
    const row = await this.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)),
      with: {
        createdBy: true,
        triggers: { orderBy: [asc(workflowTriggers.createdAt)] },
        actions: { orderBy: [asc(workflowActions.sortOrder), asc(workflowActions.createdAt)] },
        conditions: { orderBy: [asc(workflowConditions.sortOrder), asc(workflowConditions.createdAt)] },
      },
    });

    if (!row) {
      return null;
    }

    const executionCounts = await this.getWorkflowChildCounts(companyId, 'executions');
    const conditionCounts = new Map([[row.id, row.conditions.length]]);

    return {
      ...toWorkflowSummary(
        row,
        new Map([[row.id, row.triggers.length]]),
        new Map([[row.id, row.actions.length]]),
        executionCounts,
        conditionCounts,
      ),
      triggers: row.triggers.map(toTriggerSummary),
      actions: row.actions.map(toActionSummary),
      conditions: row.conditions.map(toConditionSummary),
      canvasConfig: row.canvasConfig ?? {},
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
    };
  }

  async createWorkflow(
    scope: TenantScope,
    input: CreateWorkflowRequest,
  ): Promise<WorkflowDetail> {
    const name = input.name.trim();

    if (!name) {
      throw new AutomationError('VALIDATION_ERROR', 'Workflow name is required');
    }

    const [created] = await this.db
      .insert(workflows)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        ownerUserId: scope.userId,
        updatedByUserId: scope.userId,
        name,
        description: normalizeOptionalText(input.description),
        category: input.category?.trim() || null,
        canvasConfig: input.canvasConfig ?? {},
        status: input.status ?? 'draft',
      })
      .returning();

    if (!created) {
      throw new AutomationError('CREATE_FAILED', 'Unable to create workflow');
    }

    for (const trigger of input.triggers ?? []) {
      await this.createTriggerRecord(scope.companyId, created.id, trigger);
    }

    for (const [index, action] of (input.actions ?? []).entries()) {
      await this.createActionRecord(scope.companyId, created.id, {
        ...action,
        sortOrder: action.sortOrder ?? index,
      });
    }

    for (const [index, condition] of (input.conditions ?? []).entries()) {
      await this.createConditionRecord(scope.companyId, created.id, {
        ...condition,
        sortOrder: condition.sortOrder ?? index,
      });
    }

    const workflow = await this.getWorkflow(scope.companyId, created.id);

    if (!workflow) {
      throw new AutomationError('CREATE_FAILED', 'Unable to load workflow');
    }

    return workflow;
  }

  async updateWorkflow(
    companyId: string,
    workflowId: string,
    input: UpdateWorkflowRequest,
  ): Promise<WorkflowDetail> {
    const existing = await this.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)),
    });

    if (!existing) {
      throw new AutomationError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const name = input.name?.trim();

    if (input.name !== undefined && !name) {
      throw new AutomationError('VALIDATION_ERROR', 'Workflow name is required');
    }

    const [updated] = await this.db
      .update(workflows)
      .set({
        name: name ?? existing.name,
        description:
          input.description !== undefined
            ? normalizeOptionalText(input.description)
            : existing.description,
        category: input.category !== undefined ? input.category?.trim() || null : undefined,
        canvasConfig: input.canvasConfig,
        status: input.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new AutomationError('UPDATE_FAILED', 'Unable to update workflow');
    }

    const workflow = await this.getWorkflow(companyId, workflowId);

    if (!workflow) {
      throw new AutomationError('UPDATE_FAILED', 'Unable to load workflow');
    }

    return workflow;
  }

  async addTrigger(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowTriggerRequest,
  ): Promise<WorkflowTriggerSummary> {
    await this.ensureWorkflowBelongsToCompany(companyId, workflowId);

    const created = await this.createTriggerRecord(companyId, workflowId, input);
    return toTriggerSummary(created);
  }

  async addAction(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowActionRequest,
  ): Promise<WorkflowActionSummary> {
    await this.ensureWorkflowBelongsToCompany(companyId, workflowId);

    const created = await this.createActionRecord(companyId, workflowId, input);
    return toActionSummary(created);
  }

  async addCondition(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowConditionRequest,
  ): Promise<WorkflowConditionSummary> {
    await this.ensureWorkflowBelongsToCompany(companyId, workflowId);

    const created = await this.createConditionRecord(companyId, workflowId, input);
    return toConditionSummary(created);
  }

  async reorderActions(
    companyId: string,
    workflowId: string,
    input: ReorderWorkflowActionsRequest,
  ): Promise<WorkflowDetail> {
    await this.ensureWorkflowBelongsToCompany(companyId, workflowId);

    for (const [index, actionId] of input.actionIds.entries()) {
      await this.db
        .update(workflowActions)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(
            eq(workflowActions.id, actionId),
            eq(workflowActions.workflowId, workflowId),
            eq(workflowActions.companyId, companyId),
          ),
        );
    }

    await this.touchWorkflow(workflowId);

    const workflow = await this.getWorkflow(companyId, workflowId);

    if (!workflow) {
      throw new AutomationError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    return workflow;
  }

  async listExecutions(companyId: string): Promise<WorkflowExecutionSummary[]> {
    const rows = await this.db.query.workflowExecutions.findMany({
      where: eq(workflowExecutions.companyId, companyId),
      with: { workflow: true },
      orderBy: [desc(workflowExecutions.startedAt)],
    });

    return rows.map(toExecutionSummary);
  }

  async listWorkflowExecutions(
    companyId: string,
    workflowId: string,
  ): Promise<WorkflowExecutionSummary[]> {
    await this.ensureWorkflowBelongsToCompany(companyId, workflowId);

    const rows = await this.db.query.workflowExecutions.findMany({
      where: and(
        eq(workflowExecutions.companyId, companyId),
        eq(workflowExecutions.workflowId, workflowId),
      ),
      with: { workflow: true },
      orderBy: [desc(workflowExecutions.startedAt)],
    });

    return rows.map(toExecutionSummary);
  }

  async getStats(companyId: string): Promise<AutomationStats> {
    const [workflowCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflows)
      .where(eq(workflows.companyId, companyId));

    const [activeWorkflowCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflows)
      .where(and(eq(workflows.companyId, companyId), eq(workflows.status, 'active')));

    const [executionCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.companyId, companyId));

    const [runCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(eq(workflowRuns.companyId, companyId));

    const [pendingApprovalCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowStepResults)
      .where(
        and(
          eq(workflowStepResults.companyId, companyId),
          eq(workflowStepResults.status, 'awaiting_approval'),
        ),
      );

    const [templateCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.companyId, companyId));

    const [scheduleCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowSchedules)
      .where(eq(workflowSchedules.companyId, companyId));

    return {
      workflowCount: workflowCountRow?.count ?? 0,
      activeWorkflowCount: activeWorkflowCountRow?.count ?? 0,
      executionCount: executionCountRow?.count ?? 0,
      runCount: runCountRow?.count ?? 0,
      pendingApprovalCount: pendingApprovalCountRow?.count ?? 0,
      templateCount: templateCountRow?.count ?? 0,
      scheduleCount: scheduleCountRow?.count ?? 0,
    };
  }

  async buildAuraContext(
    companyId: string,
    workflowId?: string,
  ): Promise<AuraAutomationContext> {
    const stats = await this.getStats(companyId);

    const workflowRows = await this.db.query.workflows.findMany({
      where: eq(workflows.companyId, companyId),
      with: {
        triggers: true,
        actions: { orderBy: [asc(workflowActions.sortOrder)] },
      },
      orderBy: [desc(workflows.updatedAt)],
      limit: 10,
    });

    const executionRows = await this.db.query.workflowExecutions.findMany({
      where: eq(workflowExecutions.companyId, companyId),
      with: { workflow: true },
      orderBy: [desc(workflowExecutions.startedAt)],
      limit: 10,
    });

    let focusedWorkflow: AuraAutomationContext['focusedWorkflow'] = null;

    if (workflowId) {
      const focused = await this.getWorkflow(companyId, workflowId);

      if (focused) {
        const focusedExecutions = await this.listWorkflowExecutions(companyId, workflowId);

        focusedWorkflow = {
          name: focused.name,
          status: focused.status,
          description: focused.description,
          triggers: focused.triggers.map((trigger) => trigger.triggerType),
          actions: focused.actions.map((action) => action.actionType),
          recentExecutions: focusedExecutions.slice(0, 5).map((execution) => ({
            triggerType: execution.triggerType,
            status: execution.status,
            startedAt: execution.startedAt,
            errorMessage: execution.errorMessage,
          })),
        };
      }
    }

    return {
      workflowCount: stats.workflowCount,
      activeWorkflowCount: stats.activeWorkflowCount,
      executionCount: stats.executionCount,
      runCount: stats.runCount,
      pendingApprovalCount: stats.pendingApprovalCount,
      engineActive: true,
      availableTriggers: [
        'customer_created',
        'customer_updated',
        'job_created',
        'job_scheduled',
        'job_status_changed',
        'job_completed',
        'quote_created',
        'invoice_created',
        'payment_received',
        'invoice_overdue',
        'vehicle_status_changed',
        'gps_event',
        'whatsapp_message_received',
      ],
      availableActions: [
        'log_customer_activity',
        'update_customer',
        'update_job_status',
        'assign_job_task',
        'send_email_draft',
        'send_whatsapp_draft',
        'create_payment_reminder',
        'ask_aura_agent',
        'generate_summary',
      ],
      workflows: workflowRows.map((row) => ({
        name: row.name,
        status: row.status,
        triggerCount: row.triggers.length,
        actionCount: row.actions.length,
        triggers: row.triggers.map((trigger) => trigger.triggerType),
        actions: row.actions.map((action) => action.actionType),
      })),
      recentExecutions: executionRows.map((row) => ({
        workflowName: row.workflow?.name ?? null,
        triggerType: row.triggerType,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        errorMessage: row.errorMessage,
      })),
      focusedWorkflow,
    };
  }

  private async createTriggerRecord(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowTriggerRequest,
  ) {
    const [created] = await this.db
      .insert(workflowTriggers)
      .values({
        companyId,
        workflowId,
        triggerType: input.triggerType,
        config: input.config ?? {},
      })
      .returning();

    if (!created) {
      throw new AutomationError('CREATE_FAILED', 'Unable to create workflow trigger');
    }

    await this.touchWorkflow(workflowId);
    return created;
  }

  private async createActionRecord(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowActionRequest,
  ) {
    const [created] = await this.db
      .insert(workflowActions)
      .values({
        companyId,
        workflowId,
        actionType: input.actionType,
        sortOrder: input.sortOrder ?? 0,
        config: input.config ?? {},
      })
      .returning();

    if (!created) {
      throw new AutomationError('CREATE_FAILED', 'Unable to create workflow action');
    }

    await this.touchWorkflow(workflowId);
    return created;
  }

  private async createConditionRecord(
    companyId: string,
    workflowId: string,
    input: CreateWorkflowConditionRequest,
  ) {
    const field = input.field.trim();

    if (!field) {
      throw new AutomationError('VALIDATION_ERROR', 'Condition field is required');
    }

    const [created] = await this.db
      .insert(workflowConditions)
      .values({
        companyId,
        workflowId,
        field,
        operator: input.operator ?? 'equals',
        value: normalizeOptionalText(input.value),
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    if (!created) {
      throw new AutomationError('CREATE_FAILED', 'Unable to create workflow condition');
    }

    await this.touchWorkflow(workflowId);
    return created;
  }

  private async touchWorkflow(workflowId: string) {
    await this.db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));
  }

  private async ensureWorkflowBelongsToCompany(companyId: string, workflowId: string) {
    const workflow = await this.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)),
    });

    if (!workflow) {
      throw new AutomationError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    }
  }

  private async getWorkflowChildCounts(
    companyId: string,
    kind: 'triggers' | 'actions' | 'executions' | 'conditions',
  ): Promise<Map<string, number>> {
    const table =
      kind === 'triggers'
        ? workflowTriggers
        : kind === 'actions'
          ? workflowActions
          : kind === 'conditions'
            ? workflowConditions
            : workflowExecutions;

    const rows = await this.db
      .select({
        workflowId: table.workflowId,
        count: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(eq(table.companyId, companyId))
      .groupBy(table.workflowId);

    const counts = new Map<string, number>();

    for (const row of rows) {
      if (row.workflowId) {
        counts.set(row.workflowId, row.count);
      }
    }

    return counts;
  }
}

function toWorkflowSummary(
  row: typeof workflows.$inferSelect & { createdBy: typeof users.$inferSelect | null },
  triggerCounts: Map<string, number>,
  actionCounts: Map<string, number>,
  executionCounts: Map<string, number>,
  conditionCounts: Map<string, number>,
): WorkflowSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    version: row.version,
    status: row.status,
    triggerCount: triggerCounts.get(row.id) ?? 0,
    actionCount: actionCounts.get(row.id) ?? 0,
    conditionCount: conditionCounts.get(row.id) ?? 0,
    executionCount: executionCounts.get(row.id) ?? 0,
    createdByUserId: row.createdByUserId,
    createdByName: formatUserName(row.createdBy),
    ownerUserId: row.ownerUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTriggerSummary(row: typeof workflowTriggers.$inferSelect): WorkflowTriggerSummary {
  return {
    id: row.id,
    triggerType: row.triggerType,
    config: row.config ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toActionSummary(row: typeof workflowActions.$inferSelect): WorkflowActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    sortOrder: row.sortOrder,
    config: row.config ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toConditionSummary(row: typeof workflowConditions.$inferSelect): WorkflowConditionSummary {
  return {
    id: row.id,
    field: row.field,
    operator: row.operator,
    value: row.value,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExecutionSummary(
  row: typeof workflowExecutions.$inferSelect & {
    workflow: typeof workflows.$inferSelect | null;
  },
): WorkflowExecutionSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowName: row.workflow?.name ?? null,
    triggerType: row.triggerType,
    status: row.status,
    triggerEntityType: row.triggerEntityType,
    triggerEntityId: row.triggerEntityId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    resultSummary: row.resultSummary ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatUserName(user: typeof users.$inferSelect | null | undefined): string {
  if (!user) {
    return 'Unknown';
  }

  return `${user.firstName} ${user.lastName}`.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
