/**
 * FIN-004 — Budget, Targets & Forecast Control service.
 *
 * Persists PLAN data only. Actuals from OperatingProfitService (JPE/CASH/FIN-003).
 * Forecast is recalculated, never stored as actual. No Growth Planner logic.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  financeMonthlyPlanOverheadLines,
  financeMonthlyPlans,
  securityAuditLogs,
} from '@titan/db';
import type {
  BudgetControlDashboard,
  BudgetControlPlan,
  OperatingProfitDashboard,
} from '@titan/shared';
import {
  availablePlanMonths,
  budgetMonthRange,
  buildBudgetAlerts,
  buildForecast,
  buildOverheadSpendRows,
  canViewBudgetControl,
  canWriteBudgetControl,
  compareMargin,
  compareMetric,
  deriveGrossProfitTargetCents,
  emptyBudgetPlan,
  isValidBudgetCategory,
  resolveBudgetPlanMonth,
  safeAnalyticsCents,
} from '@titan/shared';
import type { OperatingProfitService } from './operating-profit.service.js';

export class BudgetControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BudgetControlError';
  }
}

export type BudgetControlActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export type UpsertBudgetPlanInput = {
  revenueTargetCents?: number | null;
  grossMarginTargetPct?: number | null;
  grossProfitTargetCents?: number | null;
  overheadBudgetCents?: number | null;
  operatingProfitTargetCents?: number | null;
  cashCollectionTargetCents?: number | null;
  notes?: string | null;
  overheadLines?: Array<{ category: string; budgetCents: number }>;
  currency?: string;
};

export class BudgetControlService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly operatingProfitService: OperatingProfitService,
  ) {}

  private assertView(actor: BudgetControlActor): void {
    if (!canViewBudgetControl(actor)) {
      throw new BudgetControlError(
        'FORBIDDEN',
        'Budget control requires finance access. Technician and Client are blocked.',
      );
    }
  }

  private assertWrite(actor: BudgetControlActor): void {
    if (!canWriteBudgetControl(actor)) {
      throw new BudgetControlError(
        'FORBIDDEN',
        'Budget plan updates require Owner or finance:write. Technician and Client are blocked.',
      );
    }
  }

  private async recordAudit(
    actor: BudgetControlActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'finance_monthly_plan',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        technicianClientDenied: true,
        fakeDataInvented: false,
        forecastNeverStoredAsActual: true,
      },
    });
  }

  private async loadPlan(
    companyId: string,
    planMonth: string,
  ): Promise<BudgetControlPlan> {
    const month = resolveBudgetPlanMonth(planMonth);
    const [row] = await this.db
      .select()
      .from(financeMonthlyPlans)
      .where(
        and(
          eq(financeMonthlyPlans.companyId, companyId),
          eq(financeMonthlyPlans.planMonth, month),
        ),
      )
      .limit(1);

    if (!row) return emptyBudgetPlan(month);

    const lines = await this.db
      .select()
      .from(financeMonthlyPlanOverheadLines)
      .where(
        and(
          eq(financeMonthlyPlanOverheadLines.companyId, companyId),
          eq(financeMonthlyPlanOverheadLines.planId, row.id),
        ),
      );

    return {
      id: row.id,
      planMonth: String(row.planMonth).slice(0, 10),
      currency: row.currency,
      revenueTargetCents: row.revenueTargetCents,
      grossMarginTargetPct:
        row.grossMarginTargetPct == null ? null : Number(row.grossMarginTargetPct),
      grossProfitTargetCents: row.grossProfitTargetCents,
      overheadBudgetCents: row.overheadBudgetCents,
      operatingProfitTargetCents: row.operatingProfitTargetCents,
      cashCollectionTargetCents: row.cashCollectionTargetCents,
      notes: row.notes,
      overheadLines: lines.map((l) => ({
        category: l.category,
        budgetCents: l.budgetCents,
      })),
      isEmpty: false,
    };
  }

  private async loadActuals(
    actor: BudgetControlActor,
    planMonth: string,
  ): Promise<{
    op: OperatingProfitDashboard;
    fromDate: string;
    toDate: string;
  }> {
    const range = budgetMonthRange(planMonth);
    const op = await this.operatingProfitService.getDashboard(
      {
        companyId: actor.companyId,
        userId: actor.userId,
        roleName: actor.roleName,
        permissions: actor.permissions,
      },
      {
        period: 'custom',
        fromDate: range.fromDate,
        toDate: range.toDate,
      },
    );
    return { op, fromDate: range.fromDate, toDate: range.toDate };
  }

  async getDashboard(
    actor: BudgetControlActor,
    monthKey?: string,
  ): Promise<BudgetControlDashboard> {
    this.assertView(actor);
    const planMonth = resolveBudgetPlanMonth(monthKey);
    const [plan, { op, fromDate, toDate }] = await Promise.all([
      this.loadPlan(actor.companyId, planMonth),
      this.loadActuals(actor, planMonth),
    ]);

    const derivedGpTarget = deriveGrossProfitTargetCents({
      revenueTargetCents: plan.revenueTargetCents,
      grossMarginTargetPct: plan.grossMarginTargetPct,
      grossProfitTargetCents: plan.grossProfitTargetCents,
    });

    const actuals = {
      planMonth,
      fromDate,
      toDate,
      currency: op.summary.currency,
      revenueCents: op.summary.economicRevenueCents,
      grossProfitCents: op.summary.companyGrossProfitCents,
      grossMarginPct: op.summary.grossMarginPct,
      knownOverheadCents: op.summary.knownOverheadCents,
      knownOperatingProfitCents: op.summary.knownOperatingProfitCents,
      cashCollectedCents: op.summary.customerCashCollectedCents,
      overheadByCategory: op.overhead.categories.map((c) => ({
        category: c.category,
        amountCents: c.amountCents,
      })),
      completeness: (op.summary.completeness === 'VERIFIED'
        ? 'VERIFIED'
        : op.summary.completeness === 'PROVISIONAL'
          ? 'PROVISIONAL'
          : 'INCOMPLETE') as 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE',
      completenessReasons: op.summary.completenessReasons,
      sourceTrace: [
        'operating_profit',
        'jpe_snapshot',
        'bank_overhead_allocation',
        'cash_control',
        'finance_monthly_plan',
      ],
    };

    const compares = {
      revenue: compareMetric('Revenue', actuals.revenueCents, plan.revenueTargetCents),
      grossProfit: compareMetric('Gross profit', actuals.grossProfitCents, derivedGpTarget),
      grossMargin: compareMargin(actuals.grossMarginPct, plan.grossMarginTargetPct),
      overhead: compareMetric(
        'Known overhead',
        actuals.knownOverheadCents,
        plan.overheadBudgetCents,
      ),
      operatingProfit: compareMetric(
        'Known operating profit',
        actuals.knownOperatingProfitCents,
        plan.operatingProfitTargetCents,
      ),
      cashCollected: compareMetric(
        'Cash collected',
        actuals.cashCollectedCents,
        plan.cashCollectionTargetCents,
      ),
    };

    const overheadSpend = buildOverheadSpendRows({
      budgetLines: plan.overheadLines,
      actualByCategory: actuals.overheadByCategory,
      totalOverheadBudgetCents: plan.overheadBudgetCents,
      actualCompleteness: actuals.completeness,
    });

    const forecast = buildForecast({
      planMonth,
      revenueCents: actuals.revenueCents,
      grossProfitCents: actuals.grossProfitCents,
      overheadCents: actuals.knownOverheadCents,
      operatingProfitCents: actuals.knownOperatingProfitCents,
      cashCollectedCents: actuals.cashCollectedCents,
      actualCompleteness: actuals.completeness,
      jobsIncluded: op.summary.jobsIncluded,
    });

    const alerts = buildBudgetAlerts({
      revenue: compares.revenue,
      grossMargin: compares.grossMargin,
      overhead: compares.overhead,
      operatingProfit: compares.operatingProfit,
      cashCollected: compares.cashCollected,
      overheadSpend,
    });

    return {
      plan: {
        ...plan,
        grossProfitTargetCents: derivedGpTarget ?? plan.grossProfitTargetCents,
      },
      actuals,
      compares,
      forecast,
      overheadSpend,
      alerts,
      availableMonths: availablePlanMonths(),
    };
  }

  async upsertPlan(
    actor: BudgetControlActor,
    monthKey: string,
    input: UpsertBudgetPlanInput,
  ): Promise<BudgetControlPlan> {
    this.assertWrite(actor);
    const planMonth = resolveBudgetPlanMonth(monthKey);
    const before = await this.loadPlan(actor.companyId, planMonth);

    const overheadLines = (input.overheadLines ?? []).map((l) => ({
      category: l.category.trim().toLowerCase(),
      budgetCents: safeAnalyticsCents(l.budgetCents),
    }));
    for (const line of overheadLines) {
      if (!isValidBudgetCategory(line.category)) {
        throw new BudgetControlError(
          'VALIDATION_ERROR',
          `Invalid overhead category '${line.category}'. Reuse BANK_TRANSACTION_CATEGORIES.`,
        );
      }
    }

    const derivedGp = deriveGrossProfitTargetCents({
      revenueTargetCents:
        input.revenueTargetCents === undefined
          ? before.revenueTargetCents
          : input.revenueTargetCents,
      grossMarginTargetPct:
        input.grossMarginTargetPct === undefined
          ? before.grossMarginTargetPct
          : input.grossMarginTargetPct,
      grossProfitTargetCents:
        input.grossProfitTargetCents === undefined
          ? before.grossProfitTargetCents
          : input.grossProfitTargetCents,
    });

    const values = {
      companyId: actor.companyId,
      planMonth,
      currency: input.currency?.trim() || before.currency || 'ZAR',
      revenueTargetCents:
        input.revenueTargetCents === undefined
          ? before.revenueTargetCents
          : input.revenueTargetCents == null
            ? null
            : safeAnalyticsCents(input.revenueTargetCents),
      grossMarginTargetPct:
        input.grossMarginTargetPct === undefined
          ? before.grossMarginTargetPct == null
            ? null
            : String(before.grossMarginTargetPct)
          : input.grossMarginTargetPct == null
            ? null
            : String(input.grossMarginTargetPct),
      grossProfitTargetCents: derivedGp,
      overheadBudgetCents:
        input.overheadBudgetCents === undefined
          ? before.overheadBudgetCents
          : input.overheadBudgetCents == null
            ? null
            : safeAnalyticsCents(input.overheadBudgetCents),
      operatingProfitTargetCents:
        input.operatingProfitTargetCents === undefined
          ? before.operatingProfitTargetCents
          : input.operatingProfitTargetCents == null
            ? null
            : safeAnalyticsCents(input.operatingProfitTargetCents),
      cashCollectionTargetCents:
        input.cashCollectionTargetCents === undefined
          ? before.cashCollectionTargetCents
          : input.cashCollectionTargetCents == null
            ? null
            : safeAnalyticsCents(input.cashCollectionTargetCents),
      notes:
        input.notes === undefined ? before.notes : input.notes?.trim() || null,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };

    let planId = before.id;
    if (!planId) {
      const [inserted] = await this.db
        .insert(financeMonthlyPlans)
        .values({
          ...values,
          createdByUserId: actor.userId,
        })
        .returning();
      planId = inserted!.id;
    } else {
      await this.db
        .update(financeMonthlyPlans)
        .set(values)
        .where(
          and(
            eq(financeMonthlyPlans.id, planId),
            eq(financeMonthlyPlans.companyId, actor.companyId),
          ),
        );
    }

    if (input.overheadLines !== undefined) {
      await this.db
        .delete(financeMonthlyPlanOverheadLines)
        .where(
          and(
            eq(financeMonthlyPlanOverheadLines.companyId, actor.companyId),
            eq(financeMonthlyPlanOverheadLines.planId, planId),
          ),
        );
      if (overheadLines.length > 0) {
        await this.db.insert(financeMonthlyPlanOverheadLines).values(
          overheadLines.map((l) => ({
            companyId: actor.companyId,
            planId: planId!,
            category: l.category,
            budgetCents: l.budgetCents,
          })),
        );
      }
    }

    await this.recordAudit(actor, 'finance_monthly_plan_upserted', planId!, {
      planMonth,
      before: {
        revenueTargetCents: before.revenueTargetCents,
        grossMarginTargetPct: before.grossMarginTargetPct,
        grossProfitTargetCents: before.grossProfitTargetCents,
        overheadBudgetCents: before.overheadBudgetCents,
        operatingProfitTargetCents: before.operatingProfitTargetCents,
        cashCollectionTargetCents: before.cashCollectionTargetCents,
        overheadLines: before.overheadLines,
      },
      after: {
        revenueTargetCents: values.revenueTargetCents,
        grossMarginTargetPct: values.grossMarginTargetPct,
        grossProfitTargetCents: values.grossProfitTargetCents,
        overheadBudgetCents: values.overheadBudgetCents,
        operatingProfitTargetCents: values.operatingProfitTargetCents,
        cashCollectionTargetCents: values.cashCollectionTargetCents,
        overheadLines,
      },
    });

    return this.loadPlan(actor.companyId, planMonth);
  }

  async listRecentPlanMonths(actor: BudgetControlActor): Promise<string[]> {
    this.assertView(actor);
    const rows = await this.db
      .select({ planMonth: financeMonthlyPlans.planMonth })
      .from(financeMonthlyPlans)
      .where(eq(financeMonthlyPlans.companyId, actor.companyId))
      .orderBy(desc(financeMonthlyPlans.planMonth))
      .limit(24);
    const set = new Set(availablePlanMonths());
    for (const r of rows) set.add(String(r.planMonth).slice(0, 10));
    return [...set].sort().reverse();
  }
}
