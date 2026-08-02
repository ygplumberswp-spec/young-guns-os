import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { canWriteCompanyMemory } from '@titan/auth';
import type {
  CreateDayPlanRequest,
  DayPlanApproveSuggestionsRequest,
  DayPlanMorningSuggestion,
  DayPlanParseRequest,
  DayPlanParseResponse,
  DayPlanSectionKey,
  DayPlanSummary,
  DayPlanTodayResponse,
  UpdateDayPlanRequest,
} from '@titan/shared';
import {
  DAY_PLAN_SECTION_LABELS,
  findDuplicateDayPlan,
  localPlanDateIso,
  parseNaturalLanguageDayPlan,
  resolveDayPlanSection,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  companyDayPlans,
  invoices,
  jobs,
  quotes,
  securityAuditLogs,
  xeroWriteApprovals,
} from '@titan/db';
import type { CompanyBusinessRulesService } from './company-business-rules.service.js';

export class DayPlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DayPlanError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

export type DayPlanAuraContext = {
  planDate: string;
  priorityCount: number;
  priorities: Array<{
    priorityText: string;
    department: string | null;
    status: string;
    planDate: string;
  }>;
};

function assertDayPlanWrite(scope: TenantScope): void {
  if (
    !scope.roleName ||
    !canWriteCompanyMemory({ roleName: scope.roleName, permissions: scope.permissions ?? [] })
  ) {
    throw new DayPlanError(
      'FORBIDDEN',
      'Only company owners and admins may manage daily plans',
    );
  }
}

function parsePlanDate(value: string | undefined): string {
  if (!value) {
    return localPlanDateIso();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DayPlanError('VALIDATION_ERROR', 'planDate must be YYYY-MM-DD');
  }

  return value;
}

function emptySections(): Record<DayPlanSectionKey, DayPlanSummary[]> {
  return {
    top_priorities: [],
    communications: [],
    sales: [],
    marketing: [],
    jobs: [],
    finance: [],
    team: [],
    completed: [],
  };
}

export class CompanyDayPlanService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly businessRulesService?: CompanyBusinessRulesService,
  ) {}

  async listPlansForDate(companyId: string, planDate?: string): Promise<{
    planDate: string;
    plans: DayPlanSummary[];
  }> {
    const date = parsePlanDate(planDate);
    await this.businessRulesService?.ensureScheduledTasksForDate(companyId, date);

    const rows = await this.db.query.companyDayPlans.findMany({
      where: and(
        eq(companyDayPlans.companyId, companyId),
        eq(companyDayPlans.planDate, date),
        inArray(companyDayPlans.status, ['active', 'completed']),
      ),
      orderBy: [
        desc(companyDayPlans.priority),
        desc(companyDayPlans.updatedAt),
        desc(companyDayPlans.createdAt),
      ],
    });

    return {
      planDate: date,
      plans: rows.map(toPlanSummary),
    };
  }

  async getTodayPlan(companyId: string, planDate?: string): Promise<DayPlanTodayResponse> {
    const { planDate: date, plans } = await this.listPlansForDate(companyId, planDate);
    const sections = emptySections();

    for (const plan of plans) {
      const section = resolveDayPlanSection(plan);
      sections[section].push(plan);
    }

    const active = plans.filter((plan) => plan.status === 'active');
    const completed = plans.filter((plan) => plan.status === 'completed');

    return {
      planDate: date,
      sections,
      summary: {
        completed: completed.length,
        running: active.filter((plan) => plan.progressPct > 0 && plan.progressPct < 100).length,
        blocked: 0,
        approvals: active.filter((plan) => plan.approvalRequired).length,
        deadlineRisks: active.filter((plan) => plan.priority === 'high').length,
        total: plans.length,
      },
      endOfDayReview: {
        completed,
        notCompleted: active,
      },
    };
  }

  async createPlan(scope: TenantScope, input: CreateDayPlanRequest): Promise<DayPlanSummary> {
    assertDayPlanWrite(scope);

    const content = input.content.trim();
    if (!content) {
      throw new DayPlanError('VALIDATION_ERROR', 'Plan content is required');
    }

    const planDate = parsePlanDate(input.planDate);
    const siblings = await this.db.query.companyDayPlans.findMany({
      where: and(
        eq(companyDayPlans.companyId, scope.companyId),
        eq(companyDayPlans.planDate, planDate),
        ne(companyDayPlans.status, 'archived'),
      ),
    });
    const duplicate = findDuplicateDayPlan(siblings.map(toPlanSummary), content);

    if (duplicate) {
      throw new DayPlanError('DUPLICATE', 'This priority already exists for today');
    }

    const [created] = await this.db
      .insert(companyDayPlans)
      .values({
        companyId: scope.companyId,
        planDate,
        content,
        department: input.department?.trim() || null,
        category: input.category ?? null,
        priority: input.priority ?? 'normal',
        status: 'active',
        assignedUserId: input.assignedUserId ?? null,
        assignedAgentRole: input.assignedAgentRole ?? null,
        dueTime: input.dueTime ?? null,
        approvalRequired: input.approvalRequired ?? false,
        source: input.source ?? 'manual',
        businessRuleId: input.businessRuleId ?? null,
        createdByUserId: scope.userId,
        updatedByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new DayPlanError('CREATE_FAILED', 'Unable to create day plan');
    }

    await this.recordAudit(scope, 'day_plan_created', created.id, {
      planDate,
      content,
      category: created.category,
      priority: created.priority,
      source: created.source,
    });

    return toPlanSummary(created);
  }

  /**
   * Parse Owner NL priorities into structured draft items.
   * Does not persist — Owner must approve via approveParsedSuggestions.
   */
  async parseNaturalLanguagePriorities(
    scope: TenantScope,
    input: DayPlanParseRequest,
  ): Promise<DayPlanParseResponse> {
    assertDayPlanWrite(scope);

    const planDate = parsePlanDate(input.planDate);
    const parsed = parseNaturalLanguageDayPlan(input.text, planDate);
    if (parsed.items.length === 0) {
      throw new DayPlanError('VALIDATION_ERROR', 'Could not extract any plan items from that text');
    }

    await this.recordAudit(scope, 'day_plan_nl_parsed', planDate, {
      planDate,
      itemCount: parsed.items.length,
      unsafeExecutionHints: parsed.unsafeExecutionHints,
      rawTextPreview: parsed.rawText.slice(0, 240),
    });

    return parsed;
  }

  /** Persist Owner-approved parsed suggestions as aura_suggested day plan rows. */
  async approveParsedSuggestions(
    scope: TenantScope,
    input: DayPlanApproveSuggestionsRequest,
  ): Promise<{ plans: DayPlanSummary[]; skippedDuplicates: number }> {
    assertDayPlanWrite(scope);

    if (!input.items?.length) {
      throw new DayPlanError('VALIDATION_ERROR', 'Select at least one suggestion to approve');
    }

    const plans: DayPlanSummary[] = [];
    let skippedDuplicates = 0;

    for (const item of input.items) {
      try {
        const plan = await this.createPlan(scope, {
          content: item.content,
          planDate: input.planDate,
          category: item.category ?? undefined,
          priority: item.priority ?? 'normal',
          department: item.department ?? undefined,
          approvalRequired: item.approvalRequired ?? false,
          source: 'aura_suggested',
        });
        plans.push(plan);
      } catch (error) {
        if (error instanceof DayPlanError && error.code === 'DUPLICATE') {
          skippedDuplicates += 1;
          continue;
        }
        throw error;
      }
    }

    await this.recordAudit(scope, 'day_plan_nl_approved', input.planDate ?? localPlanDateIso(), {
      approvedCount: plans.length,
      skippedDuplicates,
      planIds: plans.map((plan) => plan.id),
    });

    return { plans, skippedDuplicates };
  }

  async updatePlan(
    scope: TenantScope,
    planId: string,
    input: UpdateDayPlanRequest,
  ): Promise<DayPlanSummary> {
    assertDayPlanWrite(scope);

    const existing = await this.db.query.companyDayPlans.findFirst({
      where: and(eq(companyDayPlans.id, planId), eq(companyDayPlans.companyId, scope.companyId)),
    });

    if (!existing) {
      throw new DayPlanError('NOT_FOUND', 'Day plan not found');
    }

    const content = input.content?.trim();
    if (input.content !== undefined && !content) {
      throw new DayPlanError('VALIDATION_ERROR', 'Plan content is required');
    }

    if (content) {
      const siblings = await this.db.query.companyDayPlans.findMany({
        where: and(
          eq(companyDayPlans.companyId, scope.companyId),
          eq(companyDayPlans.planDate, existing.planDate),
          ne(companyDayPlans.status, 'archived'),
        ),
      });
      const duplicate = findDuplicateDayPlan(
        siblings.filter((row) => row.id !== planId).map(toPlanSummary),
        content,
      );

      if (duplicate) {
        throw new DayPlanError('DUPLICATE', 'This priority already exists for today');
      }
    }

    const [updated] = await this.db
      .update(companyDayPlans)
      .set({
        content: content ?? existing.content,
        department: input.department !== undefined ? input.department : existing.department,
        category: input.category !== undefined ? input.category : existing.category,
        priority: input.priority ?? existing.priority,
        status: input.status ?? existing.status,
        assignedUserId:
          input.assignedUserId !== undefined ? input.assignedUserId : existing.assignedUserId,
        assignedAgentRole:
          input.assignedAgentRole !== undefined
            ? input.assignedAgentRole
            : existing.assignedAgentRole,
        dueTime: input.dueTime !== undefined ? input.dueTime : existing.dueTime,
        progressPct: input.progressPct ?? existing.progressPct,
        approvalRequired: input.approvalRequired ?? existing.approvalRequired,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(companyDayPlans.id, planId), eq(companyDayPlans.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new DayPlanError('UPDATE_FAILED', 'Unable to update day plan');
    }

    const action =
      input.status === 'completed'
        ? 'day_plan_completed'
        : input.status === 'archived'
          ? 'day_plan_archived'
          : 'day_plan_updated';

    await this.recordAudit(scope, action, updated.id, {
      planDate: updated.planDate,
      content: updated.content,
      category: updated.category,
      priority: updated.priority,
      status: updated.status,
    });

    return toPlanSummary(updated);
  }

  async deletePlan(scope: TenantScope, planId: string): Promise<boolean> {
    assertDayPlanWrite(scope);

    const [deleted] = await this.db
      .delete(companyDayPlans)
      .where(and(eq(companyDayPlans.id, planId), eq(companyDayPlans.companyId, scope.companyId)))
      .returning();

    if (!deleted) {
      return false;
    }

    await this.recordAudit(scope, 'day_plan_deleted', deleted.id, {
      planDate: deleted.planDate,
      content: deleted.content,
    });

    return true;
  }

  async getMorningSuggestions(companyId: string, planDate?: string): Promise<{
    planDate: string;
    suggestions: DayPlanMorningSuggestion[];
  }> {
    const date = parsePlanDate(planDate);
    const suggestions: DayPlanMorningSuggestion[] = [];

    const [jobsToday] = await this.db
      .select({ total: count() })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          sql`${jobs.scheduledAt}::date = ${date}::date`,
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
      );

    if (Number(jobsToday?.total ?? 0) > 0) {
      suggestions.push({
        task: `Review ${jobsToday.total} job(s) scheduled for today`,
        department: 'Operations',
        category: 'operations',
        priority: 'high',
        source: 'aura_suggested',
        evidence: `${jobsToday.total} jobs on ${date}`,
      });
    }

    const [unansweredComms] = await this.db
      .select({ total: count() })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.direction, 'inbound'),
          eq(communications.deliveryState, 'logged_only'),
        ),
      );

    if (Number(unansweredComms?.total ?? 0) > 0) {
      suggestions.push({
        task: `Respond to ${unansweredComms.total} unanswered inbound message(s)`,
        department: 'Communications',
        category: 'communications',
        priority: 'normal',
        source: 'aura_suggested',
        evidence: `${unansweredComms.total} inbound messages awaiting response`,
      });
    }

    const [overdueQuotes] = await this.db
      .select({ total: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(quotes.status, 'sent'),
          sql`${quotes.validUntil}::date < ${date}::date`,
        ),
      );

    if (Number(overdueQuotes?.total ?? 0) > 0) {
      suggestions.push({
        task: `Follow up on ${overdueQuotes.total} quote(s) past validity date`,
        department: 'Sales',
        category: 'other',
        priority: 'normal',
        source: 'aura_suggested',
        evidence: `${overdueQuotes.total} sent quotes past validUntil`,
      });
    }

    const [overdueInvoices] = await this.db
      .select({ total: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.status, 'overdue')));

    if (Number(overdueInvoices?.total ?? 0) > 0) {
      suggestions.push({
        task: `Chase ${overdueInvoices.total} overdue invoice(s)`,
        department: 'Finance',
        category: 'finance',
        priority: 'high',
        source: 'aura_suggested',
        evidence: `${overdueInvoices.total} invoices marked overdue`,
      });
    }

    const [pendingApprovals] = await this.db
      .select({ total: count() })
      .from(xeroWriteApprovals)
      .where(
        and(eq(xeroWriteApprovals.companyId, companyId), eq(xeroWriteApprovals.status, 'pending')),
      );

    if (Number(pendingApprovals?.total ?? 0) > 0) {
      suggestions.push({
        task: `Review ${pendingApprovals.total} pending finance approval(s)`,
        department: 'Finance',
        category: 'finance',
        priority: 'high',
        source: 'aura_suggested',
        evidence: `${pendingApprovals.total} Xero write approvals pending`,
      });
    }

    return { planDate: date, suggestions };
  }

  async buildAuraContext(companyId: string): Promise<DayPlanAuraContext> {
    const planDate = localPlanDateIso();
    await this.businessRulesService?.ensureScheduledTasksForDate(companyId, planDate);

    const rows = await this.db.query.companyDayPlans.findMany({
      where: and(
        eq(companyDayPlans.companyId, companyId),
        eq(companyDayPlans.planDate, planDate),
        eq(companyDayPlans.status, 'active'),
      ),
      orderBy: [desc(companyDayPlans.priority), desc(companyDayPlans.updatedAt)],
      limit: 20,
    });

    return {
      planDate,
      priorityCount: rows.length,
      priorities: rows.map((row) => ({
        priorityText: row.content,
        department: row.department,
        status: row.status === 'active' ? 'planned' : row.status,
        planDate: row.planDate,
      })),
    };
  }

  private async recordAudit(
    scope: TenantScope,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'ai',
      action,
      entityType: 'company_day_plan',
      entityId,
      userId: scope.userId,
      metadata,
    });
  }
}

function toPlanSummary(row: typeof companyDayPlans.$inferSelect): DayPlanSummary {
  return {
    id: row.id,
    planDate: row.planDate,
    content: row.content,
    task: row.content,
    department: row.department,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assignedUserId,
    assignedAgentRole: row.assignedAgentRole,
    dueTime: row.dueTime,
    progressPct: row.progressPct,
    approvalRequired: row.approvalRequired,
    source: row.source,
    businessRuleId: row.businessRuleId,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { DAY_PLAN_SECTION_LABELS };
