import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateWorkflowScheduleRequest,
  CreateWorkflowTemplateRequest,
  InstantiateWorkflowTemplateRequest,
  SimulateWorkflowRequest,
  UpdateWorkflowScheduleRequest,
  UpdateWorkflowTemplateRequest,
  WorkflowAuditLogSummary,
  WorkflowScheduleSummary,
  WorkflowSimulationResult,
  WorkflowStudioAuraContext,
  WorkflowTemplateSummary,
  WorkflowValidationResult,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { workflowAuditLogs, workflowSchedules, workflowTemplates, workflows } from '@titan/db';
import type { AutomationService } from './automation.service.js';
import type { WorkflowEngineService } from './workflow-engine.service.js';

export class WorkflowStudioError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowStudioError';
  }
}

type TenantScope = { companyId: string; userId: string };

type WorkflowStudioServiceDeps = {
  db: DatabaseClient;
  automationService: AutomationService;
  workflowEngineService: WorkflowEngineService;
};

const MAX_LOOP_ITERATIONS = 10;

export class WorkflowStudioService {
  constructor(private readonly deps: WorkflowStudioServiceDeps) {}

  async listTemplates(companyId: string): Promise<WorkflowTemplateSummary[]> {
    const rows = await this.deps.db.query.workflowTemplates.findMany({
      where: eq(workflowTemplates.companyId, companyId),
      orderBy: [desc(workflowTemplates.updatedAt)],
    });

    return rows.map(toTemplateSummary);
  }

  async createTemplate(
    scope: TenantScope,
    input: CreateWorkflowTemplateRequest,
  ): Promise<WorkflowTemplateSummary> {
    const name = input.name.trim();
    if (!name) throw new WorkflowStudioError('VALIDATION_ERROR', 'Template name is required');

    const [created] = await this.deps.db
      .insert(workflowTemplates)
      .values({
        companyId: scope.companyId,
        name,
        description: normalizeOptionalText(input.description),
        category: input.category ?? 'custom',
        templateKey: input.templateKey.trim(),
        definition: input.definition ?? {},
        isActive: input.isActive ?? true,
        createdByUserId: scope.userId,
      })
      .returning();

    return toTemplateSummary(created!);
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    input: UpdateWorkflowTemplateRequest,
  ): Promise<WorkflowTemplateSummary> {
    await this.ensureTemplate(companyId, templateId);

    await this.deps.db
      .update(workflowTemplates)
      .set({
        name: input.name?.trim(),
        description:
          input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        category: input.category,
        templateKey: input.templateKey?.trim(),
        definition: input.definition,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(workflowTemplates.id, templateId), eq(workflowTemplates.companyId, companyId)));

    const row = await this.deps.db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.id, templateId),
    });
    return toTemplateSummary(row!);
  }

  async instantiateTemplate(
    scope: TenantScope,
    templateId: string,
    input: InstantiateWorkflowTemplateRequest,
  ) {
    const template = await this.ensureTemplate(scope.companyId, templateId);
    const definition = template.definition as {
      triggers?: Array<{ triggerType: string; config?: Record<string, unknown> }>;
      actions?: Array<{ actionType: string; sortOrder?: number; config?: Record<string, unknown> }>;
      conditions?: Array<{
        field: string;
        operator?: string;
        value?: string | null;
        sortOrder?: number;
      }>;
      canvasConfig?: Record<string, unknown>;
      category?: string;
    };

    return this.deps.automationService.createWorkflow(scope, {
      name: input.name.trim(),
      description: input.description ?? template.description,
      status: 'draft',
      category: definition.category ?? template.category,
      canvasConfig: definition.canvasConfig ?? {},
      triggers: definition.triggers as never[] | undefined,
      actions: definition.actions as never[] | undefined,
      conditions: definition.conditions as never[] | undefined,
    });
  }

  async submitWorkflow(scope: TenantScope, workflowId: string) {
    const workflow = await this.ensureWorkflow(scope.companyId, workflowId);
    if (workflow.status !== 'draft') {
      throw new WorkflowStudioError('INVALID_STATE', 'Only draft workflows can be submitted');
    }

    const validation = await this.validateWorkflow(scope.companyId, workflowId);
    if (!validation.valid) {
      throw new WorkflowStudioError('VALIDATION_ERROR', validation.errors.join('; '));
    }

    await this.deps.db
      .update(workflows)
      .set({
        status: 'pending_approval',
        submittedAt: new Date(),
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, scope.companyId)));

    await this.logAudit(
      scope,
      workflowId,
      null,
      'workflow_submitted',
      null,
      'Workflow submitted for approval',
    );

    return this.deps.automationService.getWorkflow(scope.companyId, workflowId);
  }

  async activateWorkflow(scope: TenantScope, workflowId: string) {
    const workflow = await this.ensureWorkflow(scope.companyId, workflowId);
    if (workflow.status !== 'pending_approval' && workflow.status !== 'paused') {
      throw new WorkflowStudioError(
        'INVALID_STATE',
        'Workflow must be pending approval or paused to activate',
      );
    }

    await this.deps.db
      .update(workflows)
      .set({
        status: 'active',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, scope.companyId)));

    await this.logAudit(scope, workflowId, null, 'workflow_activated', null, 'Workflow activated');

    return this.deps.automationService.getWorkflow(scope.companyId, workflowId);
  }

  async validateWorkflow(companyId: string, workflowId: string): Promise<WorkflowValidationResult> {
    const workflow = await this.deps.automationService.getWorkflow(companyId, workflowId);
    if (!workflow) {
      return { valid: false, errors: ['Workflow not found'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflow.name.trim()) errors.push('Workflow name is required');
    if (workflow.actions.length === 0) errors.push('At least one action is required');
    if (workflow.triggers.length === 0) warnings.push('No triggers configured — manual run only');

    const canvas = workflow.canvasConfig;
    const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
    const loopNodes = nodes.filter((node) => {
      const record = node as Record<string, unknown>;
      return record.type === 'loop';
    });

    for (const node of loopNodes) {
      const record = node as Record<string, unknown>;
      const maxIterations = Number(record.maxIterations ?? MAX_LOOP_ITERATIONS);
      if (maxIterations > MAX_LOOP_ITERATIONS) {
        errors.push(`Loop node exceeds safe limit of ${MAX_LOOP_ITERATIONS} iterations`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async simulateWorkflow(
    scope: TenantScope,
    workflowId: string,
    input: SimulateWorkflowRequest = {},
  ): Promise<WorkflowSimulationResult> {
    return this.deps.workflowEngineService.simulateRun(scope, workflowId, input.payload ?? {});
  }

  async executeWorkflow(
    scope: TenantScope,
    workflowId: string,
    payload: Record<string, unknown> = {},
  ) {
    const workflow = await this.ensureWorkflow(scope.companyId, workflowId);
    if (workflow.status !== 'active') {
      throw new WorkflowStudioError('INVALID_STATE', 'Workflow must be active before execution');
    }

    const run = await this.deps.workflowEngineService.runManual(scope, workflowId, payload);
    await this.logAudit(
      scope,
      workflowId,
      run.id,
      'workflow_executed',
      null,
      `Workflow executed manually — run ${run.id}`,
    );
    return run;
  }

  async listSchedules(companyId: string): Promise<WorkflowScheduleSummary[]> {
    const rows = await this.deps.db.query.workflowSchedules.findMany({
      where: eq(workflowSchedules.companyId, companyId),
      orderBy: [desc(workflowSchedules.updatedAt)],
    });

    return rows.map(toScheduleSummary);
  }

  async createSchedule(
    scope: TenantScope,
    input: CreateWorkflowScheduleRequest,
  ): Promise<WorkflowScheduleSummary> {
    await this.ensureWorkflow(scope.companyId, input.workflowId);

    const [created] = await this.deps.db
      .insert(workflowSchedules)
      .values({
        companyId: scope.companyId,
        workflowId: input.workflowId,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression?.trim() || null,
        intervalMinutes: input.intervalMinutes ?? null,
        runAt: input.runAt ? new Date(input.runAt) : null,
        timezone: input.timezone ?? 'UTC',
        enabled: input.enabled ?? false,
        nextRunAt: computeNextRunAt(input),
        createdByUserId: scope.userId,
      })
      .returning();

    return toScheduleSummary(created!);
  }

  async updateSchedule(
    companyId: string,
    scheduleId: string,
    input: UpdateWorkflowScheduleRequest,
  ): Promise<WorkflowScheduleSummary> {
    const existing = await this.deps.db.query.workflowSchedules.findFirst({
      where: and(eq(workflowSchedules.id, scheduleId), eq(workflowSchedules.companyId, companyId)),
    });

    if (!existing) throw new WorkflowStudioError('NOT_FOUND', 'Schedule not found');

    const merged = {
      scheduleType: input.scheduleType ?? existing.scheduleType,
      cronExpression:
        input.cronExpression !== undefined ? input.cronExpression : existing.cronExpression,
      intervalMinutes:
        input.intervalMinutes !== undefined ? input.intervalMinutes : existing.intervalMinutes,
      runAt:
        input.runAt !== undefined ? (input.runAt ? new Date(input.runAt) : null) : existing.runAt,
      timezone: input.timezone ?? existing.timezone,
      enabled: input.enabled ?? existing.enabled,
    };

    await this.deps.db
      .update(workflowSchedules)
      .set({
        scheduleType: merged.scheduleType,
        cronExpression: merged.cronExpression,
        intervalMinutes: merged.intervalMinutes,
        runAt: merged.runAt,
        timezone: merged.timezone,
        enabled: merged.enabled,
        nextRunAt: computeNextRunAt({
          scheduleType: merged.scheduleType,
          cronExpression: merged.cronExpression,
          intervalMinutes: merged.intervalMinutes,
          runAt: merged.runAt?.toISOString() ?? null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(workflowSchedules.id, scheduleId));

    const row = await this.deps.db.query.workflowSchedules.findFirst({
      where: eq(workflowSchedules.id, scheduleId),
    });
    return toScheduleSummary(row!);
  }

  async listAuditLogs(companyId: string, workflowId?: string): Promise<WorkflowAuditLogSummary[]> {
    const rows = await this.deps.db.query.workflowAuditLogs.findMany({
      where: workflowId
        ? and(
            eq(workflowAuditLogs.companyId, companyId),
            eq(workflowAuditLogs.workflowId, workflowId),
          )
        : eq(workflowAuditLogs.companyId, companyId),
      orderBy: [desc(workflowAuditLogs.createdAt)],
      limit: 100,
    });

    return rows.map(toAuditLogSummary);
  }

  async listWorkflowHistory(companyId: string, workflowId?: string) {
    const [runs, executions, auditLogs] = await Promise.all([
      this.deps.workflowEngineService.listRuns(companyId, workflowId),
      workflowId
        ? this.deps.automationService.listWorkflowExecutions(companyId, workflowId)
        : this.deps.automationService.listExecutions(companyId),
      this.listAuditLogs(companyId, workflowId),
    ]);

    return { runs, executions, auditLogs };
  }

  async buildStudioAuraContext(companyId: string): Promise<WorkflowStudioAuraContext> {
    const [stats, templates, schedules, auditLogs] = await Promise.all([
      this.deps.automationService.getStats(companyId),
      this.listTemplates(companyId),
      this.listSchedules(companyId),
      this.listAuditLogs(companyId),
    ]);

    return {
      stats,
      templates: templates.slice(0, 10).map((row) => ({
        name: row.name,
        category: row.category,
        templateKey: row.templateKey,
      })),
      schedules: schedules.slice(0, 10).map((row) => ({
        workflowId: row.workflowId,
        scheduleType: row.scheduleType,
        enabled: row.enabled,
      })),
      recentAuditLogs: auditLogs.slice(0, 10).map((row) => ({
        eventType: row.eventType,
        message: row.message,
        createdAt: row.createdAt,
      })),
      summary: `${stats.workflowCount} workflow(s), ${stats.templateCount} template(s), ${stats.scheduleCount} schedule(s), ${stats.pendingApprovalCount} pending approval(s).`,
    };
  }

  async listWorkflows(companyId: string) {
    return this.deps.automationService.listWorkflows(companyId);
  }

  async createWebhook(
    scope: TenantScope,
    workflowId: string,
  ): Promise<{ webhookKey: string; secret: string }> {
    await this.ensureWorkflow(scope.companyId, workflowId);
    const secret = randomBytes(24).toString('hex');
    const webhookKey = `wh_${randomBytes(12).toString('hex')}`;

    const { workflowWebhooks } = await import('@titan/db');
    await this.deps.db.insert(workflowWebhooks).values({
      companyId: scope.companyId,
      workflowId,
      webhookKey,
      secretHash: hashSecret(secret),
      enabled: false,
    });

    return { webhookKey, secret };
  }

  async logAudit(
    scope: TenantScope,
    workflowId: string | null,
    runId: string | null,
    eventType: string,
    nodeKey: string | null,
    message: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.deps.db.insert(workflowAuditLogs).values({
      companyId: scope.companyId,
      workflowId,
      workflowRunId: runId,
      eventType,
      nodeKey,
      message,
      metadata,
      userId: scope.userId,
    });
  }

  private async ensureWorkflow(companyId: string, workflowId: string) {
    const row = await this.deps.db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)),
    });
    if (!row) throw new WorkflowStudioError('NOT_FOUND', 'Workflow not found');
    return row;
  }

  private async ensureTemplate(companyId: string, templateId: string) {
    const row = await this.deps.db.query.workflowTemplates.findFirst({
      where: and(eq(workflowTemplates.id, templateId), eq(workflowTemplates.companyId, companyId)),
    });
    if (!row) throw new WorkflowStudioError('NOT_FOUND', 'Template not found');
    return row;
  }
}

function toTemplateSummary(row: typeof workflowTemplates.$inferSelect): WorkflowTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    templateKey: row.templateKey,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toScheduleSummary(row: typeof workflowSchedules.$inferSelect): WorkflowScheduleSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    scheduleType: row.scheduleType,
    cronExpression: row.cronExpression,
    intervalMinutes: row.intervalMinutes,
    runAt: row.runAt?.toISOString() ?? null,
    timezone: row.timezone,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof workflowAuditLogs.$inferSelect): WorkflowAuditLogSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowRunId: row.workflowRunId,
    eventType: row.eventType,
    nodeKey: row.nodeKey,
    message: row.message,
    metadata: row.metadata ?? {},
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function computeNextRunAt(input: {
  scheduleType: string;
  cronExpression?: string | null;
  intervalMinutes?: number | null;
  runAt?: string | null;
}): Date | null {
  const now = new Date();

  if (input.scheduleType === 'one_time' && input.runAt) {
    const runAt = new Date(input.runAt);
    return runAt > now ? runAt : null;
  }

  if (input.scheduleType === 'interval' && input.intervalMinutes) {
    return new Date(now.getTime() + input.intervalMinutes * 60_000);
  }

  if (input.scheduleType === 'daily') {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return next;
  }

  if (input.scheduleType === 'weekly') {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (input.scheduleType === 'monthly') {
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  return null;
}
