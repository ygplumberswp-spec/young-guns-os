import { and, eq } from 'drizzle-orm';
import { canWriteCompanyMemory } from '@titan/auth';
import type {
  DashboardSummary,
  DayPlanFollowUpItem,
  DayPlanFollowUpPriority,
  DayPlanFollowUpStatus,
  UpdateDayPlanFollowUpRequest,
} from '@titan/shared';
import {
  countFollowUpsNeedingReview,
  dedupeFollowUpRecommendations,
  localPlanDateIso,
  mapRecommendationPriority,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { companyDayPlanFollowUps, customers, securityAuditLogs } from '@titan/db';
import type { CompanyDayPlanService } from './company-day-plan.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { RecommendationsService } from './recommendations.service.js';

export class DayPlanFollowUpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DayPlanFollowUpError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

function parsePlanDate(value: string | undefined): string {
  if (!value) {
    return localPlanDateIso();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DayPlanFollowUpError('VALIDATION_ERROR', 'planDate must be YYYY-MM-DD');
  }

  return value;
}

function assertFollowUpWrite(scope: TenantScope): void {
  if (
    !scope.roleName ||
    !canWriteCompanyMemory({ roleName: scope.roleName, permissions: scope.permissions ?? [] })
  ) {
    throw new DayPlanFollowUpError(
      'FORBIDDEN',
      'Only company owners and admins may manage follow-up plan items',
    );
  }
}

function resolveStatusForAction(
  action: UpdateDayPlanFollowUpRequest['action'],
  current: DayPlanFollowUpStatus,
): DayPlanFollowUpStatus {
  switch (action) {
    case 'review':
      return 'pending_review';
    case 'approve':
      return 'approved';
    case 'decline':
      return 'declined';
    case 'assign':
      return 'assigned';
    case 'complete':
      return 'completed';
    case 'edit':
      return current === 'draft' ? 'draft' : current;
    default:
      return current;
  }
}

function extractCustomerName(title: string): string {
  const match = title.match(/^Follow up with (.+)$/i);
  return match?.[1]?.trim() ?? title;
}

export class CompanyDayPlanFollowUpsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly intelligenceService: IntelligenceService,
    private readonly recommendationsService: RecommendationsService,
    private readonly dayPlanService: CompanyDayPlanService,
  ) {}

  async getDashboardSummary(companyId: string, planDate?: string): Promise<DashboardSummary> {
    const date = parsePlanDate(planDate);
    const [dashboard, { plans }, followUps, recommendations] = await Promise.all([
      this.intelligenceService.getDashboard(companyId),
      this.dayPlanService.listPlansForDate(companyId, date),
      this.listFollowUps(companyId, date),
      this.recommendationsService.getRecommendations(companyId),
    ]);

    const activePriorities = plans.filter((plan) => plan.status === 'active').length;

    const urgentItems = recommendations.recommendations
      .filter((item) => item.priority === 'high')
      .slice(0, 2)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        priority: item.category === 'scheduling' ? ('blocked' as const) : ('urgent' as const),
        category: item.category,
      }));

    return {
      jobsToday: dashboard.todaysJobs.count,
      priorities: activePriorities,
      followUpsNeedingReview: countFollowUpsNeedingReview(followUps.followUps),
      urgentItems,
    };
  }

  async listFollowUps(
    companyId: string,
    planDate?: string,
  ): Promise<{ planDate: string; followUps: DayPlanFollowUpItem[] }> {
    const date = parsePlanDate(planDate);
    const [{ recommendations }, savedRows] = await Promise.all([
      this.recommendationsService.getRecommendations(companyId),
      this.db.query.companyDayPlanFollowUps.findMany({
        where: and(
          eq(companyDayPlanFollowUps.companyId, companyId),
          eq(companyDayPlanFollowUps.planDate, date),
        ),
        with: { customer: true },
      }),
    ]);

    const deduped = dedupeFollowUpRecommendations(recommendations);
    const savedByCustomer = new Map(savedRows.map((row) => [row.customerId, row]));
    const followUps: DayPlanFollowUpItem[] = [];

    for (const [customerId, recommendation] of deduped.entries()) {
      const saved = savedByCustomer.get(customerId);
      const customerName = extractCustomerName(recommendation.title);

      followUps.push({
        id: saved?.id ?? `draft-${customerId}`,
        customerId,
        customerName: saved?.customer?.name ?? customerName,
        reason: saved?.reason ?? recommendation.description,
        responsibleAgent: saved?.responsibleAgent ?? 'Sales Agent',
        priority: saved?.priority ?? mapRecommendationPriority(recommendation.priority),
        status: saved?.status ?? 'draft',
        nextAction: saved?.nextAction ?? recommendation.actionHint,
        planDate: date,
        isDraftRecommendation: !saved || saved.status === 'draft',
        mergedSourceCount: saved?.mergedSourceCount ?? recommendation.mergedSourceCount,
      });
    }

    followUps.sort((left, right) => {
      const statusOrder = (status: DayPlanFollowUpStatus) =>
        status === 'draft' || status === 'pending_review' ? 0 : 1;
      const priorityOrder: Record<DayPlanFollowUpPriority, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };

      const statusDiff = statusOrder(left.status) - statusOrder(right.status);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return priorityOrder[left.priority] - priorityOrder[right.priority];
    });

    return { planDate: date, followUps };
  }

  async applyFollowUpAction(
    scope: TenantScope,
    customerId: string,
    input: UpdateDayPlanFollowUpRequest,
    planDate?: string,
  ): Promise<DayPlanFollowUpItem> {
    assertFollowUpWrite(scope);

    const date = parsePlanDate(planDate);
    const { followUps } = await this.listFollowUps(scope.companyId, date);
    const existingItem = followUps.find((item) => item.customerId === customerId);

    if (!existingItem) {
      throw new DayPlanFollowUpError('NOT_FOUND', 'Follow-up item not found for customer');
    }

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)),
    });

    if (!customer) {
      throw new DayPlanFollowUpError('NOT_FOUND', 'Customer not found');
    }

    const saved = await this.db.query.companyDayPlanFollowUps.findFirst({
      where: and(
        eq(companyDayPlanFollowUps.companyId, scope.companyId),
        eq(companyDayPlanFollowUps.planDate, date),
        eq(companyDayPlanFollowUps.customerId, customerId),
      ),
    });

    const nextStatus = resolveStatusForAction(input.action, saved?.status ?? 'draft');
    const nextReason = input.reason?.trim() || saved?.reason || existingItem.reason;
    const nextAction =
      input.nextAction?.trim() || saved?.nextAction || existingItem.nextAction || null;
    const nextAgent =
      input.responsibleAgent?.trim() || saved?.responsibleAgent || existingItem.responsibleAgent;
    const nextPriority = input.priority ?? saved?.priority ?? existingItem.priority;

    let row = saved;

    if (!row) {
      const [created] = await this.db
        .insert(companyDayPlanFollowUps)
        .values({
          companyId: scope.companyId,
          customerId,
          planDate: date,
          reason: nextReason,
          responsibleAgent: nextAgent,
          priority: nextPriority,
          status: nextStatus,
          nextAction,
          mergedSourceCount: existingItem.mergedSourceCount,
          assignedUserId: input.assignedUserId ?? null,
          createdByUserId: scope.userId,
          updatedByUserId: scope.userId,
        })
        .returning();

      if (!created) {
        throw new DayPlanFollowUpError('CREATE_FAILED', 'Unable to save follow-up item');
      }

      row = created;
    } else {
      const [updated] = await this.db
        .update(companyDayPlanFollowUps)
        .set({
          reason: nextReason,
          responsibleAgent: nextAgent,
          priority: nextPriority,
          status: nextStatus,
          nextAction,
          assignedUserId:
            input.assignedUserId !== undefined ? input.assignedUserId : row.assignedUserId,
          updatedByUserId: scope.userId,
          updatedAt: new Date(),
        })
        .where(eq(companyDayPlanFollowUps.id, row.id))
        .returning();

      if (!updated) {
        throw new DayPlanFollowUpError('UPDATE_FAILED', 'Unable to update follow-up item');
      }

      row = updated;
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'ai',
      action: `day_plan_follow_up_${input.action}`,
      entityType: 'company_day_plan_follow_up',
      entityId: row.id,
      userId: scope.userId,
      metadata: {
        customerId,
        planDate: date,
        status: nextStatus,
        action: input.action,
      },
    });

    return {
      id: row.id,
      customerId,
      customerName: customer.name,
      reason: row.reason,
      responsibleAgent: row.responsibleAgent,
      priority: row.priority,
      status: row.status,
      nextAction: row.nextAction,
      planDate: date,
      isDraftRecommendation: row.status === 'draft',
      mergedSourceCount: row.mergedSourceCount,
    };
  }
}
