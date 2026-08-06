import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  buildHsCustomerLifetimeValueSnapshot,
  buildHsCustomerValueInsightDraft,
  buildHsMaintenanceOpportunityDraft,
  buildHsMembershipSnapshot,
  buildHsRenewalOpportunityDraft,
  buildHsRetentionInsightDraft,
  buildHsRetentionSnapshot,
  canAccessHomeshieldExperience,
  canApproveHomeshieldActions,
  canManageHomeshieldSettings,
  canWriteHomeshieldExperience,
  defaultHsSettings,
  HOMESHIELD_PRODUCT_COPY,
  listHsConnections,
  type CreateHsBenefitRequest,
  type CreateHsOutreachRequest,
  type CreateHsPlanRequest,
  type CreateHsReminderRequest,
  type CreateHsSubscriptionRequest,
  type DecideHsOutreachRequest,
  type DecideHsRenewalRequest,
  type HsBenefitSummary,
  type HsDashboard,
  type RefreshHsAuraInsightsRequest,
  type HsAuraInsightSummary,
  type DecideHsAuraInsightRequest,
  type HsMaintenanceHistoryRow,
  type HsMembershipPlanSummary,
  type HsOutreachDraftSummary,
  type HsPortalMembershipView,
  type HsRenewalOpportunitySummary,
  type HsServiceReminderSummary,
  type HsSettings,
  type HsSubscriptionSummary,
  type RefreshHsRenewalsRequest,
  type UpdateHsPlanRequest,
  type UpdateHsSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  hsAuraInsights,
  hsBenefits,
  hsMembershipPlans,
  hsOutreachDrafts,
  hsRenewalOpportunities,
  hsServiceReminders,
  hsSettings,
  hsSubscriptions,
  opsMaintenanceRuns,
  opsRecurringMaintenancePlans,
  securityAuditLogs,
} from '@titan/db';

export class HomeshieldExperienceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HomeshieldExperienceError';
  }
}

export type HsActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export type HsPortalScope = {
  companyId: string;
  customerId: string;
  portalUserId: string;
  permissions: string[];
};

export class HomeshieldExperienceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: HsActor): void {
    if (!canAccessHomeshieldExperience(actor)) {
      throw new HomeshieldExperienceError(
        'FORBIDDEN',
        'HomeShield Experience requires customers, portal, agents, or finance access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: HsActor): void {
    this.assertRead(actor);
    if (!canWriteHomeshieldExperience(actor)) {
      throw new HomeshieldExperienceError(
        'FORBIDDEN',
        'Write actions require customers:write, portal:manage, or finance:write.',
      );
    }
  }

  private assertApprove(actor: HsActor): void {
    this.assertWrite(actor);
    if (!canApproveHomeshieldActions(actor)) {
      throw new HomeshieldExperienceError(
        'FORBIDDEN',
        'Only Company Owner may approve HomeShield renewals or outreach drafts.',
      );
    }
  }

  private assertManageSettings(actor: HsActor): void {
    this.assertWrite(actor);
    if (!canManageHomeshieldSettings(actor)) {
      throw new HomeshieldExperienceError(
        'FORBIDDEN',
        'Only Company Owner may change HomeShield sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: HsActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'homeshield_experience',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoBilling: false,
        autoCharge: false,
        billingCharged: false,
      },
    });
  }

  private async ensureSettings(companyId: string): Promise<typeof hsSettings.$inferSelect> {
    const [existing] = await this.db
      .select()
      .from(hsSettings)
      .where(eq(hsSettings.companyId, companyId))
      .limit(1);
    if (existing) {
      if (existing.autoBillingEnabled || existing.autoChargeEnabled) {
        const [locked] = await this.db
          .update(hsSettings)
          .set({
            autoBillingEnabled: false,
            autoChargeEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(hsSettings.id, existing.id))
          .returning();
        return locked ?? existing;
      }
      return existing;
    }
    const [created] = await this.db
      .insert(hsSettings)
      .values({
        companyId,
        autoBillingEnabled: false,
        autoChargeEnabled: false,
      })
      .returning();
    if (!created) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create HomeShield settings.');
    }
    return created;
  }

  private toSettings(row: typeof hsSettings.$inferSelect): HsSettings {
    return defaultHsSettings({
      id: row.id,
      renewalDraftsEnabled: row.renewalDraftsEnabled,
      outreachDraftsEnabled: row.outreachDraftsEnabled,
      reminderDraftsEnabled: row.reminderDraftsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private toPlan(
    row: typeof hsMembershipPlans.$inferSelect,
    benefitCount = 0,
  ): HsMembershipPlanSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      billingInterval: row.billingInterval,
      priceCents: row.priceCents,
      currency: row.currency,
      status: row.status,
      benefitCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toSubscription(
    row: typeof hsSubscriptions.$inferSelect,
    planName: string | null,
    customerName: string | null,
  ): HsSubscriptionSummary {
    return {
      id: row.id,
      planId: row.planId,
      planName,
      customerId: row.customerId,
      customerName,
      status: row.status,
      startsAt: row.startsAt?.toISOString() ?? null,
      renewsAt: row.renewsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      autoBilling: false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toBenefit(row: typeof hsBenefits.$inferSelect): HsBenefitSummary {
    return {
      id: row.id,
      planId: row.planId,
      title: row.title,
      description: row.description,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toReminder(row: typeof hsServiceReminders.$inferSelect): HsServiceReminderSummary {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      customerId: row.customerId,
      maintenancePlanId: row.maintenancePlanId,
      title: row.title,
      body: row.body,
      remindAt: row.remindAt.toISOString(),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRenewal(row: typeof hsRenewalOpportunities.$inferSelect): HsRenewalOpportunitySummary {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      customerId: row.customerId,
      planId: row.planId,
      status: row.status,
      title: row.title,
      body: row.body,
      autoBilling: false,
      billingCharged: false,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOutreach(row: typeof hsOutreachDrafts.$inferSelect): HsOutreachDraftSummary {
    return {
      id: row.id,
      customerId: row.customerId,
      subscriptionId: row.subscriptionId,
      renewalOpportunityId: row.renewalOpportunityId,
      status: row.status,
      subject: row.subject,
      body: row.body,
      emailDraftId: row.emailDraftId,
      autoExecuted: false,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }


  private toAuraInsight(row: typeof hsAuraInsights.$inferSelect): HsAuraInsightSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      customerId: row.customerId,
      subscriptionId: row.subscriptionId,
      planId: row.planId,
      maintenancePlanId: row.maintenancePlanId,
      autoBilling: false,
      autoExecuted: false,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async listMaintenanceHistory(
    companyId: string,
    customerId?: string,
  ): Promise<HsMaintenanceHistoryRow[]> {
    const conditions = [eq(opsMaintenanceRuns.companyId, companyId)];
    if (customerId) {
      conditions.push(eq(opsRecurringMaintenancePlans.customerId, customerId));
    }
    const rows = await this.db
      .select({
        runId: opsMaintenanceRuns.id,
        planId: opsMaintenanceRuns.planId,
        planName: opsRecurringMaintenancePlans.name,
        customerId: opsRecurringMaintenancePlans.customerId,
        status: opsMaintenanceRuns.status,
        completedAt: opsMaintenanceRuns.completedAt,
        notes: opsMaintenanceRuns.notes,
        plumbingKind: opsRecurringMaintenancePlans.plumbingKind,
      })
      .from(opsMaintenanceRuns)
      .innerJoin(
        opsRecurringMaintenancePlans,
        and(
          eq(opsMaintenanceRuns.planId, opsRecurringMaintenancePlans.id),
          eq(opsRecurringMaintenancePlans.companyId, companyId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(opsMaintenanceRuns.completedAt), desc(opsMaintenanceRuns.createdAt))
      .limit(50);

    return rows.map((row) => ({
      runId: row.runId,
      planId: row.planId,
      planName: row.planName,
      customerId: row.customerId,
      status: row.status,
      completedAt: row.completedAt?.toISOString() ?? null,
      notes: row.notes,
      plumbingKind: row.plumbingKind,
    }));
  }

  async getDashboard(actor: HsActor): Promise<HsDashboard> {
    this.assertRead(actor);
    const settingsRow = await this.ensureSettings(actor.companyId);

    const [plans, subscriptions, benefits, reminders, renewals, outreach, auraRows] = await Promise.all([
      this.db
        .select()
        .from(hsMembershipPlans)
        .where(eq(hsMembershipPlans.companyId, actor.companyId))
        .orderBy(desc(hsMembershipPlans.updatedAt))
        .limit(100),
      this.db
        .select({
          sub: hsSubscriptions,
          planName: hsMembershipPlans.name,
          customerName: customers.name,
        })
        .from(hsSubscriptions)
        .leftJoin(
          hsMembershipPlans,
          and(
            eq(hsSubscriptions.planId, hsMembershipPlans.id),
            eq(hsMembershipPlans.companyId, actor.companyId),
          ),
        )
        .leftJoin(
          customers,
          and(eq(hsSubscriptions.customerId, customers.id), eq(customers.companyId, actor.companyId)),
        )
        .where(eq(hsSubscriptions.companyId, actor.companyId))
        .orderBy(desc(hsSubscriptions.updatedAt))
        .limit(100),
      this.db
        .select()
        .from(hsBenefits)
        .where(eq(hsBenefits.companyId, actor.companyId))
        .orderBy(asc(hsBenefits.sortOrder), desc(hsBenefits.createdAt))
        .limit(200),
      this.db
        .select()
        .from(hsServiceReminders)
        .where(eq(hsServiceReminders.companyId, actor.companyId))
        .orderBy(desc(hsServiceReminders.remindAt))
        .limit(100),
      this.db
        .select()
        .from(hsRenewalOpportunities)
        .where(eq(hsRenewalOpportunities.companyId, actor.companyId))
        .orderBy(desc(hsRenewalOpportunities.createdAt))
        .limit(100),
      this.db
        .select()
        .from(hsOutreachDrafts)
        .where(eq(hsOutreachDrafts.companyId, actor.companyId))
        .orderBy(desc(hsOutreachDrafts.createdAt))
        .limit(100),
      this.db
        .select()
        .from(hsAuraInsights)
        .where(eq(hsAuraInsights.companyId, actor.companyId))
        .orderBy(desc(hsAuraInsights.createdAt))
        .limit(100),
    ]);

    const benefitCounts = new Map<string, number>();
    for (const benefit of benefits) {
      if (!benefit.planId) continue;
      benefitCounts.set(benefit.planId, (benefitCounts.get(benefit.planId) ?? 0) + 1);
    }

    const activeSubscriptionCount = subscriptions.filter((s) => s.sub.status === 'active').length;
    const membership = buildHsMembershipSnapshot({
      planCount: plans.length,
      activeSubscriptionCount,
    });
    const maintenanceHistory = await this.listMaintenanceHistory(actor.companyId);

    const pendingRenewalApprovals = renewals.filter(
      (r) => r.status === 'draft' || r.status === 'pending_approval',
    ).length;
    const pendingOutreachApprovals = outreach.filter(
      (o) => o.status === 'draft' || o.status === 'pending_approval',
    ).length;


    const now = new Date();
    const horizon = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    const upcomingRenewalCount = subscriptions.filter(
      (s) =>
        s.sub.status === 'active' &&
        s.sub.renewsAt != null &&
        s.sub.renewsAt >= now &&
        s.sub.renewsAt <= horizon,
    ).length;
    const pausedOrExpiredCount = subscriptions.filter((s) =>
      ['paused', 'expired', 'cancelled'].includes(s.sub.status),
    ).length;
    const atRiskSubscriptionCount = subscriptions.filter((s) => s.sub.status === 'past_due').length;
    const retention = buildHsRetentionSnapshot({
      atRiskSubscriptionCount,
      pausedOrExpiredCount,
      upcomingRenewalCount,
    });
    const pricedPlanCount = plans.filter((p) => (p.priceCents ?? 0) > 0).length;
    const customerLifetimeValue = buildHsCustomerLifetimeValueSnapshot({
      activeSubscriptionCount,
      pricedPlanCount,
      maintenanceRunCount: maintenanceHistory.length,
      // HomeShield never invents CLV — only surface stored value if a future real source provides it.
      storedValueCents: null,
      currency: null,
    });
    const pendingAuraApprovals = auraRows.filter((r) =>
      ['draft', 'pending_approval'].includes(r.status),
    ).length;

    return {
      summary:
        membership.availability === 'unavailable'
          ? 'HomeShield membership data unavailable until real plans and subscriptions exist.'
          : `HomeShield: ${plans.length} plan(s), ${activeSubscriptionCount} active subscription(s). Renewals and billing actions require Owner approval.`,
      productClarification: { ...HOMESHIELD_PRODUCT_COPY },
      policy: {
        autoBillingEnabled: false,
        autoChargeEnabled: false,
        requiresOwnerApprovalForRenewals: true,
        requiresOwnerApprovalForOutreach: true,
        fakeMemberships: false,
      },
      membership,
      plans: plans.map((p) => this.toPlan(p, benefitCounts.get(p.id) ?? 0)),
      subscriptions: subscriptions.map((s) =>
        this.toSubscription(s.sub, s.planName, s.customerName),
      ),
      benefits: benefits.map((b) => this.toBenefit(b)),
      reminders: reminders.map((r) => this.toReminder(r)),
      maintenanceHistory,
      renewalOpportunities: renewals.map((r) => this.toRenewal(r)),
      outreachDrafts: outreach.map((o) => this.toOutreach(o)),
      auraInsights: auraRows.map((r) => this.toAuraInsight(r)),
      retention,
      customerLifetimeValue,
      settings: this.toSettings(settingsRow),
      pendingRenewalApprovals,
      pendingOutreachApprovals,
      pendingAuraApprovals,
      connections: listHsConnections(),
    };
  }

  async createPlan(actor: HsActor, input: CreateHsPlanRequest): Promise<HsMembershipPlanSummary> {
    this.assertWrite(actor);
    const [row] = await this.db
      .insert(hsMembershipPlans)
      .values({
        companyId: actor.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        billingInterval: input.billingInterval ?? 'annual',
        priceCents: input.priceCents,
        currency: input.currency?.trim() || 'ZAR',
        status: input.status ?? 'draft',
        createdByUserId: actor.userId,
      })
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create membership plan.');
    }
    await this.recordAudit(actor, 'hs_plan_created', row.id, { name: row.name });
    return this.toPlan(row, 0);
  }

  async updatePlan(
    actor: HsActor,
    planId: string,
    input: UpdateHsPlanRequest,
  ): Promise<HsMembershipPlanSummary> {
    this.assertWrite(actor);
    const [existing] = await this.db
      .select()
      .from(hsMembershipPlans)
      .where(
        and(eq(hsMembershipPlans.id, planId), eq(hsMembershipPlans.companyId, actor.companyId)),
      )
      .limit(1);
    if (!existing) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'Membership plan not found.');
    }
    const [row] = await this.db
      .update(hsMembershipPlans)
      .set({
        name: input.name?.trim() ?? existing.name,
        description:
          input.description !== undefined ? input.description?.trim() || null : existing.description,
        billingInterval: input.billingInterval ?? existing.billingInterval,
        priceCents: input.priceCents ?? existing.priceCents,
        currency: input.currency?.trim() || existing.currency,
        status: input.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(hsMembershipPlans.id, planId), eq(hsMembershipPlans.companyId, actor.companyId)),
      )
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to update membership plan.');
    }
    await this.recordAudit(actor, 'hs_plan_updated', row.id, { status: row.status });
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hsBenefits)
      .where(and(eq(hsBenefits.companyId, actor.companyId), eq(hsBenefits.planId, row.id)));
    return this.toPlan(row, Number(count ?? 0));
  }

  async createSubscription(
    actor: HsActor,
    input: CreateHsSubscriptionRequest,
  ): Promise<HsSubscriptionSummary> {
    this.assertWrite(actor);
    const [plan] = await this.db
      .select()
      .from(hsMembershipPlans)
      .where(
        and(
          eq(hsMembershipPlans.id, input.planId),
          eq(hsMembershipPlans.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!plan) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'Membership plan not found in this tenant.');
    }
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)))
      .limit(1);
    if (!customer) {
      throw new HomeshieldExperienceError(
        'NOT_FOUND',
        'Customer not found in this tenant — subscriptions require a real customer.',
      );
    }
    const [row] = await this.db
      .insert(hsSubscriptions)
      .values({
        companyId: actor.companyId,
        planId: input.planId,
        customerId: input.customerId,
        status: input.status ?? 'draft',
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        renewsAt: input.renewsAt ? new Date(input.renewsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        autoBilling: false,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create subscription.');
    }
    await this.recordAudit(actor, 'hs_subscription_created', row.id, {
      planId: row.planId,
      customerId: row.customerId,
      autoBilling: false,
    });
    return this.toSubscription(row, plan.name, customer.name);
  }

  async createBenefit(actor: HsActor, input: CreateHsBenefitRequest): Promise<HsBenefitSummary> {
    this.assertWrite(actor);
    if (input.planId) {
      const [plan] = await this.db
        .select({ id: hsMembershipPlans.id })
        .from(hsMembershipPlans)
        .where(
          and(
            eq(hsMembershipPlans.id, input.planId),
            eq(hsMembershipPlans.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!plan) {
        throw new HomeshieldExperienceError('NOT_FOUND', 'Membership plan not found.');
      }
    }
    const [row] = await this.db
      .insert(hsBenefits)
      .values({
        companyId: actor.companyId,
        planId: input.planId ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create benefit.');
    }
    await this.recordAudit(actor, 'hs_benefit_created', row.id, { planId: row.planId });
    return this.toBenefit(row);
  }

  async createReminder(
    actor: HsActor,
    input: CreateHsReminderRequest,
  ): Promise<HsServiceReminderSummary> {
    this.assertWrite(actor);
    if (input.customerId) {
      const [customer] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)))
        .limit(1);
      if (!customer) {
        throw new HomeshieldExperienceError('NOT_FOUND', 'Customer not found in this tenant.');
      }
    }
    const [row] = await this.db
      .insert(hsServiceReminders)
      .values({
        companyId: actor.companyId,
        subscriptionId: input.subscriptionId ?? null,
        customerId: input.customerId ?? null,
        maintenancePlanId: input.maintenancePlanId ?? null,
        title: input.title.trim(),
        body: input.body.trim(),
        remindAt: new Date(input.remindAt),
        createdByUserId: actor.userId,
      })
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create service reminder.');
    }
    await this.recordAudit(actor, 'hs_reminder_created', row.id, {
      customerId: row.customerId,
    });
    return this.toReminder(row);
  }

  async refreshRenewalOpportunities(
    actor: HsActor,
    input: RefreshHsRenewalsRequest = {},
  ): Promise<{ created: number; opportunities: HsRenewalOpportunitySummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.renewalDraftsEnabled) {
      throw new HomeshieldExperienceError(
        'INVALID_STATE',
        'Renewal drafts are disabled in HomeShield settings.',
      );
    }

    const withinDays = input.withinDays ?? 45;
    const now = new Date();
    const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const candidates = await this.db
      .select({
        sub: hsSubscriptions,
        planName: hsMembershipPlans.name,
        customerName: customers.name,
      })
      .from(hsSubscriptions)
      .innerJoin(
        hsMembershipPlans,
        and(
          eq(hsSubscriptions.planId, hsMembershipPlans.id),
          eq(hsMembershipPlans.companyId, actor.companyId),
        ),
      )
      .innerJoin(
        customers,
        and(eq(hsSubscriptions.customerId, customers.id), eq(customers.companyId, actor.companyId)),
      )
      .where(
        and(
          eq(hsSubscriptions.companyId, actor.companyId),
          inArray(hsSubscriptions.status, ['active', 'past_due']),
          gte(hsSubscriptions.renewsAt, now),
          lte(hsSubscriptions.renewsAt, horizon),
        ),
      )
      .limit(50);

    const existingOpen = await this.db
      .select({
        subscriptionId: hsRenewalOpportunities.subscriptionId,
      })
      .from(hsRenewalOpportunities)
      .where(
        and(
          eq(hsRenewalOpportunities.companyId, actor.companyId),
          inArray(hsRenewalOpportunities.status, ['draft', 'pending_approval', 'approved']),
        ),
      );
    const openSubIds = new Set(
      existingOpen.map((r) => r.subscriptionId).filter((id): id is string => Boolean(id)),
    );

    const created: HsRenewalOpportunitySummary[] = [];
    for (const candidate of candidates) {
      if (openSubIds.has(candidate.sub.id)) continue;
      const renewsAt = candidate.sub.renewsAt;
      const daysUntil =
        renewsAt != null
          ? Math.ceil((renewsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null;
      const draft = buildHsRenewalOpportunityDraft({
        customerName: candidate.customerName,
        planName: candidate.planName,
        renewsAt: renewsAt?.toISOString() ?? null,
        daysUntilRenewal: daysUntil,
      });
      const [row] = await this.db
        .insert(hsRenewalOpportunities)
        .values({
          companyId: actor.companyId,
          subscriptionId: candidate.sub.id,
          customerId: candidate.sub.customerId,
          planId: candidate.sub.planId,
          status: input.submitForApproval ? 'pending_approval' : 'draft',
          title: draft.title,
          body: draft.body,
          autoBilling: false,
          billingCharged: false,
          createdByUserId: actor.userId,
        })
        .returning();
      if (row) {
        created.push(this.toRenewal(row));
        await this.recordAudit(actor, 'hs_renewal_draft_created', row.id, {
          subscriptionId: row.subscriptionId,
          status: row.status,
          autoBilling: false,
          billingCharged: false,
        });
      }
    }

    return { created: created.length, opportunities: created };
  }

  async decideRenewalOpportunity(
    actor: HsActor,
    opportunityId: string,
    input: DecideHsRenewalRequest,
  ): Promise<HsRenewalOpportunitySummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(hsRenewalOpportunities)
      .where(
        and(
          eq(hsRenewalOpportunities.id, opportunityId),
          eq(hsRenewalOpportunities.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'Renewal opportunity not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new HomeshieldExperienceError(
        'INVALID_STATE',
        `Cannot decide renewal in status ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'cancelled';
    const [row] = await this.db
      .update(hsRenewalOpportunities)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoBilling: false,
        billingCharged: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hsRenewalOpportunities.id, opportunityId),
          eq(hsRenewalOpportunities.companyId, actor.companyId),
        ),
      )
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to decide renewal opportunity.');
    }
    await this.recordAudit(actor, `hs_renewal_${nextStatus}`, row.id, {
      decision: input.decision,
      billingCharged: false,
      invoiceCreated: false,
      chargeCreated: false,
    });
    return this.toRenewal(row);
  }

  async createOutreachDraft(
    actor: HsActor,
    input: CreateHsOutreachRequest,
  ): Promise<HsOutreachDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.outreachDraftsEnabled) {
      throw new HomeshieldExperienceError(
        'INVALID_STATE',
        'Outreach drafts are disabled in HomeShield settings.',
      );
    }
    const [customer] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)))
      .limit(1);
    if (!customer) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'Customer not found in this tenant.');
    }
    const [row] = await this.db
      .insert(hsOutreachDrafts)
      .values({
        companyId: actor.companyId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId ?? null,
        renewalOpportunityId: input.renewalOpportunityId ?? null,
        status: input.submitForApproval ? 'pending_approval' : 'draft',
        subject: input.subject.trim(),
        body: input.body.trim(),
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to create outreach draft.');
    }
    await this.recordAudit(actor, 'hs_outreach_draft_created', row.id, {
      customerId: row.customerId,
      autoExecuted: false,
    });
    return this.toOutreach(row);
  }

  async decideOutreachDraft(
    actor: HsActor,
    draftId: string,
    input: DecideHsOutreachRequest,
  ): Promise<HsOutreachDraftSummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(hsOutreachDrafts)
      .where(
        and(eq(hsOutreachDrafts.id, draftId), eq(hsOutreachDrafts.companyId, actor.companyId)),
      )
      .limit(1);
    if (!existing) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'Outreach draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new HomeshieldExperienceError(
        'INVALID_STATE',
        `Cannot decide outreach in status ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'cancelled';
    const [row] = await this.db
      .update(hsOutreachDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(hsOutreachDrafts.id, draftId), eq(hsOutreachDrafts.companyId, actor.companyId)),
      )
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to decide outreach draft.');
    }
    await this.recordAudit(actor, `hs_outreach_${nextStatus}`, row.id, {
      decision: input.decision,
      autoExecuted: false,
      sent: false,
    });
    return this.toOutreach(row);
  }

  async updateSettings(actor: HsActor, input: UpdateHsSettingsRequest): Promise<HsSettings> {
    this.assertManageSettings(actor);
    const existing = await this.ensureSettings(actor.companyId);
    const [row] = await this.db
      .update(hsSettings)
      .set({
        autoBillingEnabled: false,
        autoChargeEnabled: false,
        renewalDraftsEnabled: input.renewalDraftsEnabled ?? existing.renewalDraftsEnabled,
        outreachDraftsEnabled: input.outreachDraftsEnabled ?? existing.outreachDraftsEnabled,
        reminderDraftsEnabled: input.reminderDraftsEnabled ?? existing.reminderDraftsEnabled,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(hsSettings.id, existing.id), eq(hsSettings.companyId, actor.companyId)))
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to update HomeShield settings.');
    }
    await this.recordAudit(actor, 'hs_settings_updated', row.id, {
      autoBillingEnabled: false,
      autoChargeEnabled: false,
    });
    return this.toSettings(row);
  }


  async refreshAuraInsights(
    actor: HsActor,
    input: RefreshHsAuraInsightsRequest = {},
  ): Promise<{ created: number; insights: HsAuraInsightSummary[] }> {
    this.assertWrite(actor);
    const now = new Date();
    const horizon = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    const created: HsAuraInsightSummary[] = [];

    const open = await this.db
      .select({
        kind: hsAuraInsights.kind,
        customerId: hsAuraInsights.customerId,
        subscriptionId: hsAuraInsights.subscriptionId,
        maintenancePlanId: hsAuraInsights.maintenancePlanId,
      })
      .from(hsAuraInsights)
      .where(
        and(
          eq(hsAuraInsights.companyId, actor.companyId),
          inArray(hsAuraInsights.status, ['draft', 'pending_approval', 'approved']),
        ),
      );
    const openKeys = new Set(
      open.map(
        (r) =>
          `${r.kind}:${r.subscriptionId ?? ''}:${r.customerId ?? ''}:${r.maintenancePlanId ?? ''}`,
      ),
    );

    const subs = await this.db
      .select({
        sub: hsSubscriptions,
        planName: hsMembershipPlans.name,
        customerName: customers.name,
      })
      .from(hsSubscriptions)
      .innerJoin(
        hsMembershipPlans,
        and(
          eq(hsSubscriptions.planId, hsMembershipPlans.id),
          eq(hsMembershipPlans.companyId, actor.companyId),
        ),
      )
      .innerJoin(
        customers,
        and(eq(hsSubscriptions.customerId, customers.id), eq(customers.companyId, actor.companyId)),
      )
      .where(eq(hsSubscriptions.companyId, actor.companyId))
      .limit(100);

    for (const row of subs) {
      // Retention: paused / expired / past_due
      if (['paused', 'expired', 'past_due', 'cancelled'].includes(row.sub.status)) {
        const key = `retention:${row.sub.id}:${row.sub.customerId}:`;
        if (!openKeys.has(key)) {
          const draft = buildHsRetentionInsightDraft({
            customerName: row.customerName,
            planName: row.planName,
            subscriptionStatus: row.sub.status,
            reason:
              row.sub.status === 'past_due'
                ? 'past_due membership'
                : `${row.sub.status} membership`,
          });
          const [inserted] = await this.db
            .insert(hsAuraInsights)
            .values({
              companyId: actor.companyId,
              kind: 'retention',
              status: input.submitForApproval ? 'pending_approval' : 'draft',
              title: draft.title,
              body: draft.body,
              customerId: row.sub.customerId,
              subscriptionId: row.sub.id,
              planId: row.sub.planId,
              autoBilling: false,
              autoExecuted: false,
              createdByUserId: actor.userId,
            })
            .returning();
          if (inserted) {
            created.push(this.toAuraInsight(inserted));
            openKeys.add(key);
            await this.recordAudit(actor, 'hs_aura_insight_created', inserted.id, {
              kind: 'retention',
              autoBilling: false,
            });
          }
        }
      }

      // Customer value: active members with real maintenance linkage counts
      if (row.sub.status === 'active') {
        const key = `customer_value:${row.sub.id}:${row.sub.customerId}:`;
        if (!openKeys.has(key)) {
          const runs = await this.db
            .select({ id: opsMaintenanceRuns.id })
            .from(opsMaintenanceRuns)
            .innerJoin(
              opsRecurringMaintenancePlans,
              and(
                eq(opsMaintenanceRuns.planId, opsRecurringMaintenancePlans.id),
                eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
              ),
            )
            .where(
              and(
                eq(opsMaintenanceRuns.companyId, actor.companyId),
                eq(opsRecurringMaintenancePlans.customerId, row.sub.customerId),
              ),
            )
            .limit(50);
          const draft = buildHsCustomerValueInsightDraft({
            customerName: row.customerName,
            planName: row.planName,
            subscriptionStatus: row.sub.status,
            maintenanceRunCount: runs.length,
            renewsAt: row.sub.renewsAt?.toISOString() ?? null,
          });
          const [inserted] = await this.db
            .insert(hsAuraInsights)
            .values({
              companyId: actor.companyId,
              kind: 'customer_value',
              status: input.submitForApproval ? 'pending_approval' : 'draft',
              title: draft.title,
              body: draft.body,
              customerId: row.sub.customerId,
              subscriptionId: row.sub.id,
              planId: row.sub.planId,
              autoBilling: false,
              autoExecuted: false,
              createdByUserId: actor.userId,
              metadata: { maintenanceRunCount: runs.length },
            })
            .returning();
          if (inserted) {
            created.push(this.toAuraInsight(inserted));
            openKeys.add(key);
            await this.recordAudit(actor, 'hs_aura_insight_created', inserted.id, {
              kind: 'customer_value',
              autoBilling: false,
            });
          }
        }
      }

      // Renewal opportunity aura (mirrors renewals window; draft recommendation only)
      if (
        row.sub.status === 'active' &&
        row.sub.renewsAt != null &&
        row.sub.renewsAt >= now &&
        row.sub.renewsAt <= horizon
      ) {
        const key = `renewal_opportunity:${row.sub.id}:${row.sub.customerId}:`;
        if (!openKeys.has(key)) {
          const daysUntil = Math.ceil(
            (row.sub.renewsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          );
          const draft = buildHsRenewalOpportunityDraft({
            customerName: row.customerName,
            planName: row.planName,
            renewsAt: row.sub.renewsAt.toISOString(),
            daysUntilRenewal: daysUntil,
          });
          const [inserted] = await this.db
            .insert(hsAuraInsights)
            .values({
              companyId: actor.companyId,
              kind: 'renewal_opportunity',
              status: input.submitForApproval ? 'pending_approval' : 'draft',
              title: `AURA: ${draft.title}`.slice(0, 200),
              body: draft.body,
              customerId: row.sub.customerId,
              subscriptionId: row.sub.id,
              planId: row.sub.planId,
              autoBilling: false,
              autoExecuted: false,
              createdByUserId: actor.userId,
            })
            .returning();
          if (inserted) {
            created.push(this.toAuraInsight(inserted));
            openKeys.add(key);
            await this.recordAudit(actor, 'hs_aura_insight_created', inserted.id, {
              kind: 'renewal_opportunity',
              autoBilling: false,
            });
          }
        }
      }
    }

    // Maintenance opportunities from recurring maintenance plans linked to subscribed customers
    const customerIds = [...new Set(subs.map((s) => s.sub.customerId))];
    if (customerIds.length > 0) {
      const maintPlans = await this.db
        .select()
        .from(opsRecurringMaintenancePlans)
        .where(
          and(
            eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
            inArray(opsRecurringMaintenancePlans.customerId, customerIds),
            inArray(opsRecurringMaintenancePlans.status, ['active', 'draft']),
          ),
        )
        .limit(50);
      const nameByCustomer = new Map(subs.map((s) => [s.sub.customerId, s.customerName]));
      for (const plan of maintPlans) {
        if (!plan.customerId) continue;
        const key = `maintenance_opportunity::${plan.customerId}:${plan.id}`;
        if (openKeys.has(key)) continue;
        const draft = buildHsMaintenanceOpportunityDraft({
          customerName: nameByCustomer.get(plan.customerId) ?? 'Customer',
          planName: plan.name,
          nextDueAt: plan.nextDueAt?.toISOString() ?? null,
          plumbingKind: plan.plumbingKind,
        });
        const [inserted] = await this.db
          .insert(hsAuraInsights)
          .values({
            companyId: actor.companyId,
            kind: 'maintenance_opportunity',
            status: input.submitForApproval ? 'pending_approval' : 'draft',
            title: draft.title,
            body: draft.body,
            customerId: plan.customerId,
            maintenancePlanId: plan.id,
            autoBilling: false,
            autoExecuted: false,
            createdByUserId: actor.userId,
          })
          .returning();
        if (inserted) {
          created.push(this.toAuraInsight(inserted));
          openKeys.add(key);
          await this.recordAudit(actor, 'hs_aura_insight_created', inserted.id, {
            kind: 'maintenance_opportunity',
            autoBilling: false,
          });
        }
      }
    }

    return { created: created.length, insights: created };
  }

  async decideAuraInsight(
    actor: HsActor,
    insightId: string,
    input: DecideHsAuraInsightRequest,
  ): Promise<HsAuraInsightSummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(hsAuraInsights)
      .where(
        and(eq(hsAuraInsights.id, insightId), eq(hsAuraInsights.companyId, actor.companyId)),
      )
      .limit(1);
    if (!existing) {
      throw new HomeshieldExperienceError('NOT_FOUND', 'AURA insight not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new HomeshieldExperienceError(
        'INVALID_STATE',
        `Cannot decide insight in status ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : input.decision === 'acknowledge'
            ? 'acknowledged'
            : 'cancelled';
    const [row] = await this.db
      .update(hsAuraInsights)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoBilling: false,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(hsAuraInsights.id, insightId), eq(hsAuraInsights.companyId, actor.companyId)),
      )
      .returning();
    if (!row) {
      throw new HomeshieldExperienceError('INVALID_STATE', 'Unable to decide AURA insight.');
    }
    await this.recordAudit(actor, `hs_aura_insight_${nextStatus}`, row.id, {
      decision: input.decision,
      kind: row.kind,
      billingCharged: false,
      autoExecuted: false,
    });
    return this.toAuraInsight(row);
  }

  /** Customer portal — own membership only. */
  async getPortalMembership(scope: HsPortalScope): Promise<HsPortalMembershipView> {
    if (!scope.customerId) {
      throw new HomeshieldExperienceError(
        'FORBIDDEN',
        'Portal HomeShield requires a linked customer account.',
      );
    }

    const subscriptions = await this.db
      .select({
        sub: hsSubscriptions,
        planName: hsMembershipPlans.name,
      })
      .from(hsSubscriptions)
      .leftJoin(
        hsMembershipPlans,
        and(
          eq(hsSubscriptions.planId, hsMembershipPlans.id),
          eq(hsMembershipPlans.companyId, scope.companyId),
        ),
      )
      .where(
        and(
          eq(hsSubscriptions.companyId, scope.companyId),
          eq(hsSubscriptions.customerId, scope.customerId),
        ),
      )
      .orderBy(desc(hsSubscriptions.updatedAt))
      .limit(50);

    const planIds = [
      ...new Set(subscriptions.map((s) => s.sub.planId).filter((id): id is string => Boolean(id))),
    ];
    const benefits =
      planIds.length === 0
        ? []
        : await this.db
            .select()
            .from(hsBenefits)
            .where(
              and(
                eq(hsBenefits.companyId, scope.companyId),
                inArray(hsBenefits.planId, planIds),
                eq(hsBenefits.isActive, true),
              ),
            )
            .orderBy(asc(hsBenefits.sortOrder));

    const reminders = await this.db
      .select()
      .from(hsServiceReminders)
      .where(
        and(
          eq(hsServiceReminders.companyId, scope.companyId),
          eq(hsServiceReminders.customerId, scope.customerId),
        ),
      )
      .orderBy(desc(hsServiceReminders.remindAt))
      .limit(50);

    const maintenanceHistory = await this.listMaintenanceHistory(
      scope.companyId,
      scope.customerId,
    );

    const snapshot = buildHsMembershipSnapshot({
      planCount: planIds.length,
      activeSubscriptionCount: subscriptions.filter((s) => s.sub.status === 'active').length,
    });

    return {
      availability: snapshot.availability,
      rationale:
        snapshot.availability === 'unavailable'
          ? 'No HomeShield membership linked to your account yet (not invented).'
          : snapshot.rationale,
      subscriptions: subscriptions.map((s) => ({
        id: s.sub.id,
        planName: s.planName,
        status: s.sub.status,
        startsAt: s.sub.startsAt?.toISOString() ?? null,
        renewsAt: s.sub.renewsAt?.toISOString() ?? null,
        endsAt: s.sub.endsAt?.toISOString() ?? null,
        benefits: benefits
          .filter((b) => b.planId === s.sub.planId)
          .map((b) => ({ title: b.title, description: b.description })),
      })),
      reminders: reminders.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        remindAt: r.remindAt.toISOString(),
        status: r.status,
      })),
      maintenanceHistory: maintenanceHistory.map((m) => ({
        planName: m.planName,
        status: m.status,
        completedAt: m.completedAt,
        notes: m.notes,
      })),
    };
  }
}
