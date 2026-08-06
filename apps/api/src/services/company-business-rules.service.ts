import { and, desc, eq, ne } from 'drizzle-orm';
import { canWriteCompanyMemory } from '@titan/auth';
import type {
  BusinessRuleSummary,
  CreateBusinessRuleRequest,
  UpdateBusinessRuleRequest,
} from '@titan/shared';
import {
  findDuplicateBusinessRule,
  isBusinessRuleDueOnDate,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  businessRuleTasks,
  companyBusinessRules,
  companyDayPlans,
  securityAuditLogs,
} from '@titan/db';

export class BusinessRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

export type BusinessRulesAuraContext = {
  ruleCount: number;
  rules: Array<{
    name: string;
    instruction: string;
    ruleType: string;
    category: string;
    department: string | null;
    assignedAgentRole: string | null;
    approvalRequired: boolean;
  }>;
};

function assertBusinessRuleWrite(scope: TenantScope): void {
  if (
    !scope.roleName ||
    !canWriteCompanyMemory({ roleName: scope.roleName, permissions: scope.permissions ?? [] })
  ) {
    throw new BusinessRuleError(
      'FORBIDDEN',
      'Only company owners and admins may manage business rules',
    );
  }
}

export class CompanyBusinessRulesService {
  constructor(private readonly db: DatabaseClient) {}

  async listRules(companyId: string): Promise<BusinessRuleSummary[]> {
    const rows = await this.db.query.companyBusinessRules.findMany({
      where: and(
        eq(companyBusinessRules.companyId, companyId),
        ne(companyBusinessRules.status, 'archived'),
      ),
      orderBy: [desc(companyBusinessRules.updatedAt), desc(companyBusinessRules.createdAt)],
    });

    return rows.map(toRuleSummary);
  }

  async createRule(scope: TenantScope, input: CreateBusinessRuleRequest): Promise<BusinessRuleSummary> {
    assertBusinessRuleWrite(scope);

    const instruction = input.instruction.trim();
    const name = input.name.trim();

    if (!name || !instruction) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'Name and instruction are required');
    }

    const siblings = await this.db.query.companyBusinessRules.findMany({
      where: and(
        eq(companyBusinessRules.companyId, scope.companyId),
        ne(companyBusinessRules.status, 'archived'),
      ),
    });
    const duplicate = findDuplicateBusinessRule(siblings.map(toRuleSummary), instruction);

    if (duplicate) {
      throw new BusinessRuleError('DUPLICATE', 'A rule with this instruction already exists');
    }

    const [created] = await this.db
      .insert(companyBusinessRules)
      .values({
        companyId: scope.companyId,
        name,
        department: input.department?.trim() || null,
        instruction,
        ruleType: input.ruleType ?? 'always_follow',
        category: input.category ?? 'company_wide',
        frequencyCron: input.frequencyCron ?? null,
        assignedAgentRole: input.assignedAgentRole ?? null,
        approvalRequired: input.approvalRequired ?? input.ruleType === 'approval',
        approvalType: input.approvalType ?? null,
        status: 'active',
        createdByUserId: scope.userId,
        updatedByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new BusinessRuleError('CREATE_FAILED', 'Unable to create business rule');
    }

    await this.recordAudit(scope, 'business_rule_created', created.id, {
      name,
      instruction,
      ruleType: created.ruleType,
    });

    return toRuleSummary(created);
  }

  async updateRule(
    scope: TenantScope,
    ruleId: string,
    input: UpdateBusinessRuleRequest,
  ): Promise<BusinessRuleSummary> {
    assertBusinessRuleWrite(scope);

    const existing = await this.db.query.companyBusinessRules.findFirst({
      where: and(
        eq(companyBusinessRules.id, ruleId),
        eq(companyBusinessRules.companyId, scope.companyId),
      ),
    });

    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', 'Business rule not found');
    }

    const instruction = input.instruction?.trim();
    if (instruction) {
      const siblings = await this.db.query.companyBusinessRules.findMany({
        where: and(
          eq(companyBusinessRules.companyId, scope.companyId),
          ne(companyBusinessRules.status, 'archived'),
        ),
      });
      const duplicate = findDuplicateBusinessRule(
        siblings.filter((row) => row.id !== ruleId).map(toRuleSummary),
        instruction,
      );

      if (duplicate) {
        throw new BusinessRuleError('DUPLICATE', 'A rule with this instruction already exists');
      }
    }

    const [updated] = await this.db
      .update(companyBusinessRules)
      .set({
        name: input.name?.trim() ?? existing.name,
        department: input.department !== undefined ? input.department : existing.department,
        instruction: instruction ?? existing.instruction,
        ruleType: input.ruleType ?? existing.ruleType,
        category: input.category ?? existing.category,
        frequencyCron:
          input.frequencyCron !== undefined ? input.frequencyCron : existing.frequencyCron,
        assignedAgentRole:
          input.assignedAgentRole !== undefined
            ? input.assignedAgentRole
            : existing.assignedAgentRole,
        approvalRequired: input.approvalRequired ?? existing.approvalRequired,
        approvalType: input.approvalType !== undefined ? input.approvalType : existing.approvalType,
        status: input.status ?? existing.status,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(companyBusinessRules.id, ruleId), eq(companyBusinessRules.companyId, scope.companyId)),
      )
      .returning();

    if (!updated) {
      throw new BusinessRuleError('UPDATE_FAILED', 'Unable to update business rule');
    }

    const action =
      input.status === 'paused'
        ? 'business_rule_paused'
        : input.status === 'archived'
          ? 'business_rule_archived'
          : 'business_rule_updated';

    await this.recordAudit(scope, action, updated.id, {
      name: updated.name,
      status: updated.status,
    });

    return toRuleSummary(updated);
  }

  async buildAuraContext(companyId: string): Promise<BusinessRulesAuraContext> {
    const rows = await this.db.query.companyBusinessRules.findMany({
      where: and(
        eq(companyBusinessRules.companyId, companyId),
        eq(companyBusinessRules.status, 'active'),
      ),
      orderBy: [desc(companyBusinessRules.updatedAt)],
      limit: 30,
    });

    return {
      ruleCount: rows.length,
      rules: rows.map((row) => ({
        name: row.name,
        instruction: row.instruction,
        ruleType: row.ruleType,
        category: row.category,
        department: row.department,
        assignedAgentRole: row.assignedAgentRole,
        approvalRequired: row.approvalRequired,
      })),
    };
  }

  /**
   * Creates review tasks for scheduled rules due today — never triggers payments or outbound sends.
   */
  async ensureScheduledTasksForDate(companyId: string, planDate: string): Promise<number> {
    const rules = await this.db.query.companyBusinessRules.findMany({
      where: and(
        eq(companyBusinessRules.companyId, companyId),
        eq(companyBusinessRules.status, 'active'),
        eq(companyBusinessRules.ruleType, 'scheduled'),
      ),
    });

    let created = 0;

    for (const rule of rules) {
      if (!isBusinessRuleDueOnDate(rule.frequencyCron, planDate)) {
        continue;
      }

      const existingTask = await this.db.query.businessRuleTasks.findFirst({
        where: and(
          eq(businessRuleTasks.companyId, companyId),
          eq(businessRuleTasks.businessRuleId, rule.id),
          eq(businessRuleTasks.taskDate, planDate),
        ),
      });

      if (existingTask) {
        continue;
      }

      const [task] = await this.db
        .insert(businessRuleTasks)
        .values({
          companyId,
          businessRuleId: rule.id,
          taskDate: planDate,
          status: 'pending',
          nextRun: new Date(`${planDate}T09:00:00`),
        })
        .returning();

      if (!task) {
        continue;
      }

      const category =
        rule.category === 'finance'
          ? 'finance'
          : rule.category === 'marketing'
            ? 'marketing'
            : rule.category === 'operations'
              ? 'operations'
              : rule.category === 'customers'
                ? 'communications'
                : 'other';

      const [planItem] = await this.db
        .insert(companyDayPlans)
        .values({
          companyId,
          planDate,
          content: rule.instruction,
          department: rule.department,
          category,
          priority: rule.approvalRequired ? 'high' : 'normal',
          status: 'active',
          assignedAgentRole: rule.assignedAgentRole,
          approvalRequired: rule.approvalRequired,
          source: 'business_rule',
          businessRuleId: rule.id,
        })
        .returning();

      if (planItem) {
        await this.db
          .update(businessRuleTasks)
          .set({ dayPlanId: planItem.id, updatedAt: new Date() })
          .where(eq(businessRuleTasks.id, task.id));
      }

      created += 1;
    }

    return created;
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
      entityType: 'company_business_rule',
      entityId,
      userId: scope.userId,
      metadata,
    });
  }
}

function toRuleSummary(row: typeof companyBusinessRules.$inferSelect): BusinessRuleSummary {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    instruction: row.instruction,
    ruleType: row.ruleType,
    category: row.category,
    frequencyCron: row.frequencyCron,
    assignedAgentRole: row.assignedAgentRole,
    approvalRequired: row.approvalRequired,
    approvalType: row.approvalType,
    status: row.status,
    nextScheduledAt: row.nextScheduledAt?.toISOString() ?? null,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
