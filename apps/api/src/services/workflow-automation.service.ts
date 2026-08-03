import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { isCompanyOwnerRole as isOwnerRole } from '@titan/auth';
import type {
  CreateWorkflowRequest,
  OpsWorkflowApprovalSummary,
  OpsWorkflowAuraSuggestionSummary,
  OpsWorkflowDefinitionSummary,
  OpsWorkflowFollowUpSummary,
  OpsWorkflowMonitorBucket,
  OpsWorkflowMonitorOverview,
  OpsWorkflowRunSummary,
  OpsWorkflowTaskSummary,
  WorkflowActionType,
  WorkflowRunStatus,
  WorkflowTriggerType,
} from '@titan/shared';
import {
  monitorBucketToRunStatuses,
  OPS_WORKFLOW_ACTION_CATALOG,
  OPS_WORKFLOW_TRIGGER_CATALOG,
  WORKFLOW_AUTOMATION_GUARANTEES,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  opsWorkflowAuraSuggestions,
  opsWorkflowFollowUps,
  opsWorkflowTasks,
  securityAuditLogs,
  workflowRuns,
  workflowStepResults,
} from '@titan/db';
import type { AutomationService } from './automation.service.js';
import type { WorkflowEngineService } from './workflow-engine.service.js';

export class WorkflowAutomationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowAutomationError';
  }
}

export type WorkflowAutomationActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
  automationService: AutomationService;
  workflowEngineService: WorkflowEngineService;
};

function assertOwner(actor: WorkflowAutomationActor): void {
  if (!isOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })) {
    throw new WorkflowAutomationError(
      'FORBIDDEN',
      'Only the company Owner may approve sensitive workflow actions',
    );
  }
}

export class WorkflowAutomationService {
  constructor(private readonly deps: ServiceDeps) {}

  async getMonitorOverview(actor: WorkflowAutomationActor): Promise<OpsWorkflowMonitorOverview> {
    const companyId = actor.companyId;

    const [activeCount, completedCount, failedCount, awaitingCount, openTasks, draftFollowUps, pendingAura] =
      await Promise.all([
        this.countRuns(companyId, ['pending', 'running', 'awaiting_approval']),
        this.countRuns(companyId, ['completed', 'skipped']),
        this.countRuns(companyId, ['failed']),
        this.countRuns(companyId, ['awaiting_approval']),
        this.countTasks(companyId, 'open'),
        this.countFollowUps(companyId, ['draft', 'pending_review']),
        this.countAura(companyId, 'pending_approval'),
      ]);

    const [recentActive, recentCompleted, recentFailed, pendingApprovals] = await Promise.all([
      this.listRuns(actor, 'active', 20),
      this.listRuns(actor, 'completed', 20),
      this.listRuns(actor, 'failed', 20),
      this.listPendingApprovals(actor),
    ]);

    await this.deps.db.insert(securityAuditLogs).values({
      companyId,
      category: 'workflow',
      action: 'workflow_automation.monitor.read',
      entityType: 'workflow_automation',
      entityId: companyId,
      userId: actor.userId,
      metadata: {
        noDemoData: true,
        noFakeRuns: true,
        counts: {
          active: activeCount,
          completed: completedCount,
          failed: failedCount,
          awaitingApproval: awaitingCount,
        },
      },
    });

    return {
      counts: {
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        awaitingApproval: awaitingCount,
        openTasks,
        draftFollowUps,
        pendingAuraSuggestions: pendingAura,
      },
      recentActive,
      recentCompleted,
      recentFailed,
      pendingApprovals,
      triggerCatalog: OPS_WORKFLOW_TRIGGER_CATALOG,
      actionCatalog: OPS_WORKFLOW_ACTION_CATALOG,
      guarantees: WORKFLOW_AUTOMATION_GUARANTEES,
    };
  }

  async listRuns(
    actor: WorkflowAutomationActor,
    bucket: OpsWorkflowMonitorBucket,
    limit = 50,
  ): Promise<OpsWorkflowRunSummary[]> {
    const statuses = monitorBucketToRunStatuses(bucket);
    if (statuses.length === 0) return [];

    const rows = await this.deps.db.query.workflowRuns.findMany({
      where: and(
        eq(workflowRuns.companyId, actor.companyId),
        inArray(workflowRuns.status, statuses),
        eq(workflowRuns.isSimulation, false),
      ),
      with: { workflow: true },
      orderBy: [desc(workflowRuns.startedAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflow?.name ?? null,
      triggerEvent: row.triggerEvent,
      triggerEntityType: row.triggerEntityType,
      triggerEntityId: row.triggerEntityId,
      status: row.status as WorkflowRunStatus,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
      isSimulation: row.isSimulation,
    }));
  }

  async listDefinitions(actor: WorkflowAutomationActor): Promise<OpsWorkflowDefinitionSummary[]> {
    const summaries = await this.deps.automationService.listWorkflows(actor.companyId);
    const details = await Promise.all(
      summaries.slice(0, 100).map(async (summary) => {
        const detail = await this.deps.automationService.getWorkflow(actor.companyId, summary.id);
        if (!detail) return null;
        return {
          id: detail.id,
          name: detail.name,
          description: detail.description,
          status: detail.status,
          triggerCount: detail.triggers.length,
          actionCount: detail.actions.length,
          triggers: detail.triggers.map((t) => t.triggerType as WorkflowTriggerType),
          actions: detail.actions.map((a) => a.actionType as WorkflowActionType),
          updatedAt: detail.updatedAt,
        } satisfies OpsWorkflowDefinitionSummary;
      }),
    );
    return details.filter((item): item is OpsWorkflowDefinitionSummary => item !== null);
  }

  async createDefinition(
    actor: WorkflowAutomationActor,
    input: CreateWorkflowRequest,
  ): Promise<OpsWorkflowDefinitionSummary> {
    const created = await this.deps.automationService.createWorkflow(
      { companyId: actor.companyId, userId: actor.userId },
      input,
    );

    await this.deps.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action: 'workflow_automation.definition.create',
      entityType: 'workflow',
      entityId: created.id,
      userId: actor.userId,
      metadata: { name: created.name, status: created.status },
    });

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      status: created.status,
      triggerCount: created.triggers.length,
      actionCount: created.actions.length,
      triggers: created.triggers.map((t) => t.triggerType as WorkflowTriggerType),
      actions: created.actions.map((a) => a.actionType as WorkflowActionType),
      updatedAt: created.updatedAt,
    };
  }

  async listPendingApprovals(actor: WorkflowAutomationActor): Promise<OpsWorkflowApprovalSummary[]> {
    const results = await this.deps.db.query.workflowStepResults.findMany({
      where: and(
        eq(workflowStepResults.companyId, actor.companyId),
        eq(workflowStepResults.status, 'awaiting_approval'),
      ),
      with: {
        workflowStep: {
          with: {
            workflowRun: {
              with: { workflow: true },
            },
          },
        },
      },
      orderBy: [desc(workflowStepResults.createdAt)],
      limit: 100,
    });

    return results.map((result) => ({
      stepResultId: result.id,
      workflowRunId: result.workflowStep.workflowRunId,
      workflowId: result.workflowStep.workflowRun.workflowId,
      workflowName: result.workflowStep.workflowRun.workflow?.name ?? null,
      actionType: result.workflowStep.actionType,
      preview: result.preview,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
      triggerEvent: result.workflowStep.workflowRun.triggerEvent,
    }));
  }

  async decideApproval(
    actor: WorkflowAutomationActor,
    stepResultId: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ): Promise<OpsWorkflowApprovalSummary | null> {
    assertOwner(actor);

    if (decision === 'approve') {
      await this.deps.workflowEngineService.approveStepResult(
        { companyId: actor.companyId, userId: actor.userId },
        stepResultId,
      );
    } else {
      await this.deps.workflowEngineService.rejectStepResult(
        { companyId: actor.companyId, userId: actor.userId },
        stepResultId,
      );
    }

    await this.deps.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action:
        decision === 'approve'
          ? 'workflow_automation.approval.approved'
          : 'workflow_automation.approval.rejected',
      entityType: 'workflow_step_result',
      entityId: stepResultId,
      userId: actor.userId,
      metadata: {
        decision,
        notes: notes ?? null,
        ownerApprovalRequired: true,
        noAutoExternalCommunication: true,
      },
    });

    const remaining = await this.listPendingApprovals(actor);
    return remaining.find((item) => item.stepResultId === stepResultId) ?? null;
  }

  async listTasks(actor: WorkflowAutomationActor): Promise<OpsWorkflowTaskSummary[]> {
    const rows = await this.deps.db.query.opsWorkflowTasks.findMany({
      where: eq(opsWorkflowTasks.companyId, actor.companyId),
      orderBy: [desc(opsWorkflowTasks.createdAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      assigneeUserId: row.assigneeUserId,
      entityType: row.entityType,
      entityId: row.entityId,
      workflowRunId: row.workflowRunId,
      workflowId: row.workflowId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listFollowUps(actor: WorkflowAutomationActor): Promise<OpsWorkflowFollowUpSummary[]> {
    const rows = await this.deps.db.query.opsWorkflowFollowUps.findMany({
      where: eq(opsWorkflowFollowUps.companyId, actor.companyId),
      orderBy: [desc(opsWorkflowFollowUps.createdAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      customerId: row.customerId,
      entityType: row.entityType,
      entityId: row.entityId,
      dueAt: row.dueAt?.toISOString() ?? null,
      workflowRunId: row.workflowRunId,
      workflowId: row.workflowId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listAuraSuggestions(
    actor: WorkflowAutomationActor,
  ): Promise<OpsWorkflowAuraSuggestionSummary[]> {
    const rows = await this.deps.db.query.opsWorkflowAuraSuggestions.findMany({
      where: eq(opsWorkflowAuraSuggestions.companyId, actor.companyId),
      orderBy: [desc(opsWorkflowAuraSuggestions.createdAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      status: row.status,
      supportingSignals: row.supportingSignals ?? [],
      autoExecuted: false as const,
      entityType: row.entityType,
      entityId: row.entityId,
      workflowRunId: row.workflowRunId,
      workflowId: row.workflowId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNotes: row.decisionNotes,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async decideAuraSuggestion(
    actor: WorkflowAutomationActor,
    suggestionId: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ): Promise<OpsWorkflowAuraSuggestionSummary> {
    assertOwner(actor);

    const existing = await this.deps.db.query.opsWorkflowAuraSuggestions.findFirst({
      where: and(
        eq(opsWorkflowAuraSuggestions.id, suggestionId),
        eq(opsWorkflowAuraSuggestions.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new WorkflowAutomationError('NOT_FOUND', 'AURA suggestion not found');
    }
    if (existing.status !== 'pending_approval') {
      throw new WorkflowAutomationError('CONFLICT', 'Suggestion is not pending approval');
    }

    const [updated] = await this.deps.db
      .update(opsWorkflowAuraSuggestions)
      .set({
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opsWorkflowAuraSuggestions.id, suggestionId),
          eq(opsWorkflowAuraSuggestions.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.deps.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'workflow',
      action:
        decision === 'approve'
          ? 'workflow_automation.aura_suggestion.approved'
          : 'workflow_automation.aura_suggestion.rejected',
      entityType: 'ops_workflow_aura_suggestion',
      entityId: suggestionId,
      userId: actor.userId,
      metadata: {
        decision,
        notes: notes ?? null,
        autoExecuted: false,
        message:
          'Approval does not execute schedule, dispatch, messaging, or financial changes.',
      },
    });

    return {
      id: updated!.id,
      subject: updated!.subject,
      body: updated!.body,
      status: updated!.status,
      supportingSignals: updated!.supportingSignals ?? [],
      autoExecuted: false as const,
      entityType: updated!.entityType,
      entityId: updated!.entityId,
      workflowRunId: updated!.workflowRunId,
      workflowId: updated!.workflowId,
      decidedAt: updated!.decidedAt?.toISOString() ?? null,
      decisionNotes: updated!.decisionNotes,
      createdAt: updated!.createdAt.toISOString(),
    };
  }

  private async countRuns(companyId: string, statuses: WorkflowRunStatus[]): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.companyId, companyId),
          inArray(workflowRuns.status, statuses),
          eq(workflowRuns.isSimulation, false),
        ),
      );
    return row?.count ?? 0;
  }

  private async countTasks(companyId: string, status: 'open' | 'completed' | 'cancelled') {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsWorkflowTasks)
      .where(and(eq(opsWorkflowTasks.companyId, companyId), eq(opsWorkflowTasks.status, status)));
    return row?.count ?? 0;
  }

  private async countFollowUps(
    companyId: string,
    statuses: Array<'draft' | 'pending_review' | 'approved' | 'declined' | 'completed' | 'cancelled'>,
  ) {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsWorkflowFollowUps)
      .where(
        and(
          eq(opsWorkflowFollowUps.companyId, companyId),
          inArray(opsWorkflowFollowUps.status, statuses),
        ),
      );
    return row?.count ?? 0;
  }

  private async countAura(
    companyId: string,
    status: 'pending_approval' | 'approved' | 'rejected' | 'cancelled',
  ) {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsWorkflowAuraSuggestions)
      .where(
        and(
          eq(opsWorkflowAuraSuggestions.companyId, companyId),
          eq(opsWorkflowAuraSuggestions.status, status),
        ),
      );
    return row?.count ?? 0;
  }
}
