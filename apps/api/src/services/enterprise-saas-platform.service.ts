import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_TEAM_ROLES,
  slugifyCompanyName,
  withUniqueSuffix,
} from '@titan/auth';
import type {
  ChangeSaasSubscriptionPlanRequest,
  CreateSaasFeatureFlagRequest,
  CreateSaasPlatformActionRequest,
  CreateSaasSubscriptionPlanRequest,
  CreateSaasTenantBranchRequest,
  EnterpriseSaasPlatformAuraContext,
  EnterpriseSaasPlatformDashboard,
  ProvisionSaasTenantRequest,
  SaasBillingRecordSummary,
  SaasBrandingProfileSummary,
  SaasFeatureEntitlementSummary,
  SaasFeatureFlagSummary,
  SaasPlatformActionSummary,
  SaasPlatformAnalyticsSummary,
  SaasPlatformAuditSummary,
  SaasSubscriptionPlanSummary,
  SaasSubscriptionSummary,
  SaasTenantBranchSummary,
  SaasTenantSummary,
  SaasUsageSummary,
  UpdateSaasBrandingRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiUsageRecords,
  companies,
  integrationConnections,
  roles,
  saasBillingRecords,
  saasBrandingProfiles,
  saasFeatureEntitlements,
  saasFeatureFlags,
  saasPlatformActions,
  saasPlatformAudits,
  saasSubscriptionPlans,
  saasSubscriptions,
  saasTenantBranches,
  saasTenantFeatureFlags,
  saasTenantProfiles,
  saasUsageSnapshots,
  users,
} from '@titan/db';
import type { TeamService } from './team.service.js';

export class EnterpriseSaasPlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseSaasPlatformError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseSaasPlatformDeps = {
  db: DatabaseClient;
  teamService: TeamService;
};

const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;

export class EnterpriseSaasPlatformService {
  constructor(private readonly deps: EnterpriseSaasPlatformDeps) {}

  async isPlatformOwnerTenant(companyId: string): Promise<boolean> {
    const profile = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, companyId),
    });
    return profile?.tenantKind === 'platform_owner';
  }

  async shouldEnforceSubscription(companyId: string): Promise<boolean> {
    return !(await this.isPlatformOwnerTenant(companyId));
  }

  async getAiAllowanceSnapshot(companyId: string): Promise<{
    isPlatformOwner: boolean;
    subscriptionStatus: string | null;
    subscriptionUsable: boolean;
    monthlyTokenLimit: number | null;
  }> {
    await this.ensureTenantProfile(companyId);

    const [profile, subscription, tokenEntitlement] = await Promise.all([
      this.deps.db.query.saasTenantProfiles.findFirst({
        where: eq(saasTenantProfiles.companyId, companyId),
      }),
      this.deps.db.query.saasSubscriptions.findFirst({
        where: eq(saasSubscriptions.companyId, companyId),
      }),
      this.deps.db.query.saasFeatureEntitlements.findFirst({
        where: and(
          eq(saasFeatureEntitlements.companyId, companyId),
          eq(saasFeatureEntitlements.featureKey, 'ai_tokens'),
        ),
      }),
    ]);

    const isPlatformOwner = profile?.tenantKind === 'platform_owner';
    let monthlyTokenLimit: number | null = tokenEntitlement?.limitValue ?? null;

    if (subscription?.planId) {
      const plan = await this.deps.db.query.saasSubscriptionPlans.findFirst({
        where: eq(saasSubscriptionPlans.id, subscription.planId),
      });
      const planLimit = plan?.limits?.aiTokens;
      if (planLimit != null) {
        monthlyTokenLimit = planLimit;
      }
    }

    const subscriptionStatus = subscription?.status ?? null;
    const subscriptionUsable =
      subscriptionStatus != null &&
      ['trial', 'active', 'grace_period'].includes(subscriptionStatus);

    return {
      isPlatformOwner,
      subscriptionStatus,
      subscriptionUsable,
      monthlyTokenLimit,
    };
  }

  async getPlatformDashboard(companyId: string): Promise<EnterpriseSaasPlatformDashboard> {
    await this.ensureTenantProfile(companyId);
    const isPlatformOwner = await this.isPlatformOwnerTenant(companyId);
    const subscriptionEnforced = !isPlatformOwner;

    const [
      tenantProfile,
      subscription,
      branding,
      usage,
      entitlements,
      featureFlags,
      tenants,
      plans,
      billingRecords,
      branches,
      platformAnalytics,
      recentAudits,
      pendingActions,
    ] = await Promise.all([
      this.getTenantProfileRow(companyId),
      this.getSubscriptionSummary(companyId),
      this.getBrandingSummary(companyId),
      this.getUsageSummary(companyId),
      this.listFeatureEntitlements(companyId),
      this.listFeatureFlags(companyId),
      isPlatformOwner ? this.listCustomerTenants() : Promise.resolve([]),
      this.listPlans(companyId),
      this.listBillingRecords(companyId),
      this.listBranches(companyId),
      isPlatformOwner ? this.getPlatformAnalytics() : Promise.resolve(null),
      isPlatformOwner ? this.listRecentAudits(companyId) : Promise.resolve([]),
      this.listPlatformActions(companyId, 'pending_approval'),
    ]);

    const summary = isPlatformOwner
      ? `Platform owner — ${tenants.length} customer tenant(s), ${plans.length} plan(s), ${pendingActions.length} pending action(s).`
      : `SaaS tenant — lifecycle ${tenantProfile?.lifecycleStatus ?? 'provisioning'}, subscription ${subscription?.status ?? 'none'}, ${entitlements.length} entitlement(s).`;

    return {
      summary,
      isPlatformOwner,
      subscriptionEnforced,
      tenantProfile: tenantProfile
        ? {
            tenantKind: tenantProfile.tenantKind,
            lifecycleStatus: tenantProfile.lifecycleStatus,
            branchLabel: tenantProfile.branchLabel,
            storageAllocationMb: tenantProfile.storageAllocationMb,
            provisionedAt: tenantProfile.provisionedAt?.toISOString() ?? null,
          }
        : null,
      subscription,
      branding,
      usage,
      entitlements,
      featureFlags,
      tenants,
      plans,
      billingRecords,
      branches,
      platformAnalytics,
      recentAudits,
      pendingActionCount: pendingActions.length,
    };
  }

  async buildSaasAuraContext(companyId: string): Promise<EnterpriseSaasPlatformAuraContext> {
    const dashboard = await this.getPlatformDashboard(companyId);
    return {
      summary: dashboard.summary,
      isPlatformOwner: dashboard.isPlatformOwner,
      tenantCount: dashboard.tenants.length,
      activeSubscriptionCount: dashboard.platformAnalytics?.activeSubscriptions ?? (dashboard.subscription?.status === 'active' ? 1 : 0),
      pendingActionCount: dashboard.pendingActionCount,
      subscriptionStatus: dashboard.subscription?.status ?? null,
    };
  }

  async markPlatformOwner(scope: StaffScope): Promise<{ companyId: string; tenantKind: 'platform_owner' }> {
    const existingOwner = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.tenantKind, 'platform_owner'),
    });

    if (existingOwner && existingOwner.companyId !== scope.companyId) {
      throw new EnterpriseSaasPlatformError('VALIDATION_ERROR', 'A platform owner tenant already exists');
    }

    await this.ensureTenantProfile(scope.companyId);
    await this.deps.db
      .update(saasTenantProfiles)
      .set({
        tenantKind: 'platform_owner',
        lifecycleStatus: 'active',
        provisionedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(saasTenantProfiles.companyId, scope.companyId));

    await this.recordAudit(scope, {
      actionType: 'platform_owner_marked',
      subject: 'Tenant marked as platform owner',
      details: 'Subscription enforcement bypass enabled for this tenant',
    });

    return { companyId: scope.companyId, tenantKind: 'platform_owner' };
  }

  async provisionTenant(scope: StaffScope, input: ProvisionSaasTenantRequest): Promise<SaasTenantSummary> {
    if (!(await this.isPlatformOwnerTenant(scope.companyId))) {
      throw new EnterpriseSaasPlatformError('FORBIDDEN', 'Only the platform owner can provision tenants');
    }

    const baseSlug = slugifyCompanyName(input.companyName);
    const slug = withUniqueSuffix(baseSlug, randomBytes(3).toString('hex'));
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const tenantCompanyId = await this.deps.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({ name: input.companyName.trim(), slug })
        .returning();

      if (!company) {
        throw new EnterpriseSaasPlatformError('PROVISION_FAILED', 'Unable to create tenant company');
      }

      await tx.insert(roles).values(
        DEFAULT_TEAM_ROLES.map((role) => ({
          companyId: company.id,
          name: role.name,
          permissions: [...role.permissions],
          isSystem: role.isSystem,
        })),
      );

      await tx.insert(saasTenantProfiles).values({
        companyId: company.id,
        tenantKind: 'customer',
        lifecycleStatus: 'active',
        branchLabel: input.branchLabel ?? null,
        storageAllocationMb: 1024,
        aiConfig: { tone: 'professional' },
        auditConfig: { enabled: true },
        securityPolicyConfig: { mfaRecommended: true },
        provisionedAt: new Date(),
      });

      await tx.insert(saasBrandingProfiles).values({
        companyId: company.id,
        companyDisplayName: input.companyName.trim(),
      });

      await tx.insert(saasSubscriptions).values({
        companyId: company.id,
        planId: input.planId ?? null,
        status: 'trial',
        trialEndsAt,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
      });

      return company.id;
    });

    await this.deps.teamService.ensureDefaultRoles(tenantCompanyId);

    await this.recordAudit(scope, {
      actionType: 'tenant_provisioned',
      subject: input.companyName,
      details: `Provisioned tenant ${tenantCompanyId}`,
      targetCompanyId: tenantCompanyId,
    });

    const tenants = await this.listCustomerTenants();
    const tenant = tenants.find((entry) => entry.companyId === tenantCompanyId);
    if (!tenant) {
      throw new EnterpriseSaasPlatformError('NOT_FOUND', 'Provisioned tenant not found');
    }
    return tenant;
  }

  async suspendTenant(scope: StaffScope, targetCompanyId: string): Promise<SaasTenantSummary> {
    await this.requirePlatformOwner(scope.companyId);
    await this.updateTenantLifecycle(targetCompanyId, 'suspended', { suspendedAt: new Date() });
    await this.deps.db
      .update(saasSubscriptions)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(saasSubscriptions.companyId, targetCompanyId));
    await this.recordAudit(scope, {
      actionType: 'tenant_suspended',
      subject: targetCompanyId,
      targetCompanyId,
    });
    return this.getTenantSummary(targetCompanyId);
  }

  async reactivateTenant(scope: StaffScope, targetCompanyId: string): Promise<SaasTenantSummary> {
    await this.requirePlatformOwner(scope.companyId);
    await this.updateTenantLifecycle(targetCompanyId, 'active', { suspendedAt: null });
    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, targetCompanyId),
    });
    if (subscription && subscription.status === 'suspended') {
      await this.deps.db
        .update(saasSubscriptions)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(saasSubscriptions.companyId, targetCompanyId));
    }
    await this.recordAudit(scope, {
      actionType: 'tenant_reactivated',
      subject: targetCompanyId,
      targetCompanyId,
    });
    return this.getTenantSummary(targetCompanyId);
  }

  async createPlan(scope: StaffScope, input: CreateSaasSubscriptionPlanRequest): Promise<SaasSubscriptionPlanSummary> {
    await this.requirePlatformOwner(scope.companyId);
    const [row] = await this.deps.db
      .insert(saasSubscriptionPlans)
      .values({
        ownerCompanyId: scope.companyId,
        planKey: input.planKey,
        name: input.name,
        description: input.description,
        tier: input.tier,
        priceCents: input.priceCents ?? 0,
        billingInterval: input.billingInterval ?? 'monthly',
        features: input.features ?? [],
        limits: input.limits ?? {},
      })
      .returning();
    const plans = await this.listPlans(scope.companyId);
    const plan = plans.find((entry) => entry.id === row!.id);
    if (!plan) {
      throw new EnterpriseSaasPlatformError('NOT_FOUND', 'Plan not found after creation');
    }
    return plan;
  }

  async upgradePlan(scope: StaffScope, input: ChangeSaasSubscriptionPlanRequest): Promise<SaasSubscriptionSummary> {
    if (await this.shouldEnforceSubscription(scope.companyId)) {
      await this.assertSubscriptionActive(scope.companyId);
    }
    return this.changePlan(scope, input.planId, 'plan_upgrade');
  }

  async downgradePlan(scope: StaffScope, input: ChangeSaasSubscriptionPlanRequest): Promise<SaasSubscriptionSummary> {
    if (await this.shouldEnforceSubscription(scope.companyId)) {
      await this.assertSubscriptionActive(scope.companyId);
    }
    return this.changePlan(scope, input.planId, 'plan_downgrade');
  }

  async cancelSubscription(scope: StaffScope): Promise<SaasSubscriptionSummary> {
    if (await this.shouldEnforceSubscription(scope.companyId)) {
      await this.assertSubscriptionActive(scope.companyId);
    }
    const gracePeriodEndsAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    await this.deps.db
      .update(saasSubscriptions)
      .set({
        status: 'cancelled',
        gracePeriodEndsAt,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(saasSubscriptions.companyId, scope.companyId));
    await this.recordAudit(scope, {
      actionType: 'subscription_cancelled',
      subject: scope.companyId,
    });
    return (await this.getSubscriptionSummary(scope.companyId))!;
  }

  async updateBranding(scope: StaffScope, input: UpdateSaasBrandingRequest): Promise<SaasBrandingProfileSummary> {
    await this.ensureBrandingProfile(scope.companyId);
    await this.deps.db
      .update(saasBrandingProfiles)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(saasBrandingProfiles.companyId, scope.companyId));
    const branding = await this.getBrandingSummary(scope.companyId);
    if (!branding) {
      throw new EnterpriseSaasPlatformError('NOT_FOUND', 'Branding profile not found');
    }
    return branding;
  }

  async createFeatureFlag(
    scope: StaffScope,
    input: CreateSaasFeatureFlagRequest,
  ): Promise<SaasFeatureFlagSummary> {
    await this.requirePlatformOwner(scope.companyId);
    const [row] = await this.deps.db
      .insert(saasFeatureFlags)
      .values({
        ownerCompanyId: scope.companyId,
        flagKey: input.flagKey,
        name: input.name,
        description: input.description,
        defaultEnabled: input.defaultEnabled ?? false,
      })
      .returning();
    const flags = await this.listFeatureFlags(scope.companyId);
    const flag = flags.find((entry) => entry.id === row!.id);
    if (!flag) {
      throw new EnterpriseSaasPlatformError('NOT_FOUND', 'Feature flag not found after creation');
    }
    return flag;
  }

  async createBranch(scope: StaffScope, input: CreateSaasTenantBranchRequest): Promise<SaasTenantBranchSummary> {
    const [row] = await this.deps.db
      .insert(saasTenantBranches)
      .values({
        companyId: scope.companyId,
        branchKey: input.branchKey,
        name: input.name,
      })
      .returning();
    return {
      id: row!.id,
      branchKey: row!.branchKey,
      name: row!.name,
      isActive: row!.isActive,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async captureUsageSnapshot(companyId: string) {
    const [userCountRow] = await this.deps.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.companyId, companyId));
    const [integrationCountRow] = await this.deps.db
      .select({ value: count() })
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, companyId));

    const profile = await this.getTenantProfileRow(companyId);
    const storageBytes = (profile?.storageAllocationMb ?? 1024) * 1024 * 1024;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [aiUsageCountRow] = await this.deps.db
      .select({ value: count() })
      .from(aiUsageRecords)
      .where(and(eq(aiUsageRecords.companyId, companyId), gte(aiUsageRecords.recordedAt, monthStart)));

    const [row] = await this.deps.db
      .insert(saasUsageSnapshots)
      .values({
        companyId,
        userCount: Number(userCountRow?.value ?? 0),
        storageBytes,
        apiRequestCount: 0,
        aiUsageCount: Number(aiUsageCountRow?.value ?? 0),
        integrationCount: Number(integrationCountRow?.value ?? 0),
      })
      .returning();

    return row!;
  }

  async createPlatformAction(
    scope: StaffScope,
    input: CreateSaasPlatformActionRequest,
  ): Promise<SaasPlatformActionSummary> {
    const [row] = await this.deps.db
      .insert(saasPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        targetCompanyId: input.targetCompanyId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();
    return this.toActionSummary(row!);
  }

  async listPlatformActions(companyId: string, status?: SaasPlatformActionSummary['status']) {
    const rows = await this.deps.db.query.saasPlatformActions.findMany({
      where: status
        ? and(eq(saasPlatformActions.companyId, companyId), eq(saasPlatformActions.status, status))
        : eq(saasPlatformActions.companyId, companyId),
      orderBy: [desc(saasPlatformActions.createdAt)],
      limit: 50,
    });
    return rows.map((row) => this.toActionSummary(row));
  }

  async checkFeatureAccess(companyId: string, featureKey: string): Promise<boolean> {
    if (await this.isPlatformOwnerTenant(companyId)) {
      return true;
    }
    if (!(await this.isSubscriptionUsable(companyId))) {
      return false;
    }
    const entitlement = await this.deps.db.query.saasFeatureEntitlements.findFirst({
      where: and(eq(saasFeatureEntitlements.companyId, companyId), eq(saasFeatureEntitlements.featureKey, featureKey)),
    });
    if (entitlement) {
      return entitlement.enabled;
    }
    const subscription = await this.getSubscriptionSummary(companyId);
    return subscription?.plan?.features.includes(featureKey) ?? false;
  }

  private async changePlan(scope: StaffScope, planId: string, actionType: 'plan_upgrade' | 'plan_downgrade') {
    const plan = await this.deps.db.query.saasSubscriptionPlans.findFirst({
      where: eq(saasSubscriptionPlans.id, planId),
    });
    if (!plan) {
      throw new EnterpriseSaasPlatformError('NOT_FOUND', 'Subscription plan not found');
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.deps.db
      .insert(saasSubscriptions)
      .values({
        companyId: scope.companyId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: saasSubscriptions.companyId,
        set: {
          planId,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      });

    await this.deps.db.insert(saasBillingRecords).values({
      companyId: scope.companyId,
      recordType: 'renewal',
      status: 'pending',
      amountCents: plan.priceCents,
      description: `${actionType === 'plan_upgrade' ? 'Upgrade' : 'Downgrade'} to ${plan.name}`,
      metadata: { planId, actionType },
    });

    await this.recordAudit(scope, {
      actionType,
      subject: plan.name,
      details: `Changed to plan ${plan.planKey}`,
    });

    return (await this.getSubscriptionSummary(scope.companyId))!;
  }

  private async ensureTenantProfile(companyId: string) {
    const existing = await this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, companyId),
    });
    if (existing) {
      return existing;
    }

    const [row] = await this.deps.db
      .insert(saasTenantProfiles)
      .values({
        companyId,
        tenantKind: 'customer',
        lifecycleStatus: 'provisioning',
        storageAllocationMb: 1024,
        aiConfig: {},
        auditConfig: { enabled: true },
        securityPolicyConfig: {},
      })
      .returning();

    await this.ensureBrandingProfile(companyId);
    await this.deps.db.insert(saasSubscriptions).values({
      companyId,
      status: 'trial',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    });

    await this.deps.db
      .update(saasTenantProfiles)
      .set({ lifecycleStatus: 'active', provisionedAt: new Date(), updatedAt: new Date() })
      .where(eq(saasTenantProfiles.companyId, companyId));

    return row!;
  }

  private async ensureBrandingProfile(companyId: string) {
    const existing = await this.deps.db.query.saasBrandingProfiles.findFirst({
      where: eq(saasBrandingProfiles.companyId, companyId),
    });
    if (existing) {
      return existing;
    }
    const company = await this.deps.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    const [row] = await this.deps.db
      .insert(saasBrandingProfiles)
      .values({
        companyId,
        companyDisplayName: company?.name ?? null,
      })
      .returning();
    return row!;
  }

  private async getTenantProfileRow(companyId: string) {
    return this.deps.db.query.saasTenantProfiles.findFirst({
      where: eq(saasTenantProfiles.companyId, companyId),
    });
  }

  private async getSubscriptionSummary(companyId: string): Promise<SaasSubscriptionSummary | null> {
    const row = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, companyId),
    });
    if (!row) {
      return null;
    }

    let plan: SaasSubscriptionPlanSummary | null = null;
    if (row.planId) {
      const planRow = await this.deps.db.query.saasSubscriptionPlans.findFirst({
        where: eq(saasSubscriptionPlans.id, row.planId),
      });
      if (planRow) {
        plan = this.toPlanSummary(planRow);
      }
    }

    return {
      id: row.id,
      status: row.status,
      plan,
      trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      gracePeriodEndsAt: row.gracePeriodEndsAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      subscriptionEnforced: await this.shouldEnforceSubscription(companyId),
    };
  }

  private async getBrandingSummary(companyId: string): Promise<SaasBrandingProfileSummary | null> {
    const row = await this.deps.db.query.saasBrandingProfiles.findFirst({
      where: eq(saasBrandingProfiles.companyId, companyId),
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      logoUrl: row.logoUrl,
      companyDisplayName: row.companyDisplayName,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      accentColor: row.accentColor,
      emailBranding: row.emailBranding,
      pdfBranding: row.pdfBranding,
      invoiceBranding: row.invoiceBranding,
      portalBranding: row.portalBranding,
      loginBranding: row.loginBranding,
      mobileBranding: row.mobileBranding,
    };
  }

  private async getUsageSummary(companyId: string): Promise<SaasUsageSummary> {
    const latest = await this.deps.db.query.saasUsageSnapshots.findFirst({
      where: eq(saasUsageSnapshots.companyId, companyId),
      orderBy: [desc(saasUsageSnapshots.capturedAt)],
    });
    if (latest) {
      return {
        userCount: latest.userCount,
        storageBytes: latest.storageBytes,
        apiRequestCount: latest.apiRequestCount,
        aiUsageCount: latest.aiUsageCount,
        integrationCount: latest.integrationCount,
        capturedAt: latest.capturedAt.toISOString(),
      };
    }

    const [userCountRow] = await this.deps.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.companyId, companyId));

    return {
      userCount: Number(userCountRow?.value ?? 0),
      storageBytes: 0,
      apiRequestCount: 0,
      aiUsageCount: 0,
      integrationCount: 0,
      capturedAt: null,
    };
  }

  private async listFeatureEntitlements(companyId: string): Promise<SaasFeatureEntitlementSummary[]> {
    const rows = await this.deps.db.query.saasFeatureEntitlements.findMany({
      where: eq(saasFeatureEntitlements.companyId, companyId),
      orderBy: [desc(saasFeatureEntitlements.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      featureKey: row.featureKey,
      enabled: row.enabled,
      limitValue: row.limitValue,
    }));
  }

  private async listFeatureFlags(companyId: string): Promise<SaasFeatureFlagSummary[]> {
    const isOwner = await this.isPlatformOwnerTenant(companyId);
    const ownerCompanyId = isOwner
      ? companyId
      : (
          await this.deps.db.query.saasTenantProfiles.findFirst({
            where: eq(saasTenantProfiles.tenantKind, 'platform_owner'),
          })
        )?.companyId;

    if (!ownerCompanyId) {
      return [];
    }

    const flags = await this.deps.db.query.saasFeatureFlags.findMany({
      where: eq(saasFeatureFlags.ownerCompanyId, ownerCompanyId),
      orderBy: [desc(saasFeatureFlags.createdAt)],
    });

    const overrides = await this.deps.db.query.saasTenantFeatureFlags.findMany({
      where: eq(saasTenantFeatureFlags.companyId, companyId),
    });
    const overrideMap = new Map(overrides.map((row) => [row.flagKey, row.enabled]));

    return flags.map((row) => ({
      id: row.id,
      flagKey: row.flagKey,
      name: row.name,
      description: row.description,
      defaultEnabled: row.defaultEnabled,
      tenantEnabled: overrideMap.get(row.flagKey) ?? null,
    }));
  }

  private async listPlans(companyId: string): Promise<SaasSubscriptionPlanSummary[]> {
    const isOwner = await this.isPlatformOwnerTenant(companyId);
    const ownerCompanyId = isOwner
      ? companyId
      : (
          await this.deps.db.query.saasTenantProfiles.findFirst({
            where: eq(saasTenantProfiles.tenantKind, 'platform_owner'),
          })
        )?.companyId;

    if (!ownerCompanyId) {
      return [];
    }

    const rows = await this.deps.db.query.saasSubscriptionPlans.findMany({
      where: and(eq(saasSubscriptionPlans.ownerCompanyId, ownerCompanyId), eq(saasSubscriptionPlans.isActive, true)),
      orderBy: [desc(saasSubscriptionPlans.createdAt)],
    });
    return rows.map((row) => this.toPlanSummary(row));
  }

  private async listBillingRecords(companyId: string): Promise<SaasBillingRecordSummary[]> {
    const rows = await this.deps.db.query.saasBillingRecords.findMany({
      where: eq(saasBillingRecords.companyId, companyId),
      orderBy: [desc(saasBillingRecords.issuedAt)],
      limit: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      recordType: row.recordType,
      status: row.status,
      amountCents: row.amountCents,
      currency: row.currency,
      description: row.description,
      issuedAt: row.issuedAt.toISOString(),
    }));
  }

  private async listBranches(companyId: string): Promise<SaasTenantBranchSummary[]> {
    const rows = await this.deps.db.query.saasTenantBranches.findMany({
      where: eq(saasTenantBranches.companyId, companyId),
      orderBy: [desc(saasTenantBranches.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      branchKey: row.branchKey,
      name: row.name,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async listCustomerTenants(): Promise<SaasTenantSummary[]> {
    const rows = await this.deps.db
      .select({
        companyId: saasTenantProfiles.companyId,
        tenantKind: saasTenantProfiles.tenantKind,
        lifecycleStatus: saasTenantProfiles.lifecycleStatus,
        provisionedAt: saasTenantProfiles.provisionedAt,
        createdAt: saasTenantProfiles.createdAt,
        companyName: companies.name,
        companySlug: companies.slug,
      })
      .from(saasTenantProfiles)
      .innerJoin(companies, eq(companies.id, saasTenantProfiles.companyId))
      .where(eq(saasTenantProfiles.tenantKind, 'customer'))
      .orderBy(desc(saasTenantProfiles.createdAt));

    if (rows.length === 0) {
      return [];
    }

    const companyIds = rows.map((row) => row.companyId);

    const [userCounts, branchCounts, subscriptions] = await Promise.all([
      this.deps.db
        .select({ companyId: users.companyId, value: count() })
        .from(users)
        .where(inArray(users.companyId, companyIds))
        .groupBy(users.companyId),
      this.deps.db
        .select({ companyId: saasTenantBranches.companyId, value: count() })
        .from(saasTenantBranches)
        .where(inArray(saasTenantBranches.companyId, companyIds))
        .groupBy(saasTenantBranches.companyId),
      this.deps.db.query.saasSubscriptions.findMany({
        where: inArray(saasSubscriptions.companyId, companyIds),
      }),
    ]);

    const planIds = [
      ...new Set(subscriptions.map((subscription) => subscription.planId).filter(Boolean)),
    ] as string[];
    const plans =
      planIds.length > 0
        ? await this.deps.db.query.saasSubscriptionPlans.findMany({
            where: inArray(saasSubscriptionPlans.id, planIds),
          })
        : [];
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const subscriptionByCompany = new Map(subscriptions.map((subscription) => [subscription.companyId, subscription]));
    const userCountByCompany = new Map(userCounts.map((row) => [row.companyId, Number(row.value)]));
    const branchCountByCompany = new Map(branchCounts.map((row) => [row.companyId, Number(row.value)]));

    return rows.map((row) => {
      const subscription = subscriptionByCompany.get(row.companyId);
      const plan = subscription?.planId ? planById.get(subscription.planId) : null;

      return {
        companyId: row.companyId,
        companyName: row.companyName ?? 'Unknown',
        companySlug: row.companySlug ?? '',
        tenantKind: row.tenantKind ?? 'customer',
        lifecycleStatus: row.lifecycleStatus ?? 'provisioning',
        subscriptionStatus: subscription?.status ?? null,
        planName: plan?.name ?? null,
        branchCount: branchCountByCompany.get(row.companyId) ?? 0,
        userCount: userCountByCompany.get(row.companyId) ?? 0,
        provisionedAt: row.provisionedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async getTenantSummary(companyId: string): Promise<SaasTenantSummary> {
    const profile = await this.getTenantProfileRow(companyId);
    const company = await this.deps.db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    const subscription = await this.getSubscriptionSummary(companyId);
    const [userCountRow] = await this.deps.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.companyId, companyId));
    const [branchCountRow] = await this.deps.db
      .select({ value: count() })
      .from(saasTenantBranches)
      .where(eq(saasTenantBranches.companyId, companyId));

    return {
      companyId,
      companyName: company?.name ?? 'Unknown',
      companySlug: company?.slug ?? '',
      tenantKind: profile?.tenantKind ?? 'customer',
      lifecycleStatus: profile?.lifecycleStatus ?? 'provisioning',
      subscriptionStatus: subscription?.status ?? null,
      planName: subscription?.plan?.name ?? null,
      branchCount: Number(branchCountRow?.value ?? 0),
      userCount: Number(userCountRow?.value ?? 0),
      provisionedAt: profile?.provisionedAt?.toISOString() ?? null,
      createdAt: profile?.createdAt.toISOString() ?? company?.createdAt.toISOString() ?? new Date().toISOString(),
    };
  }

  private async getPlatformAnalytics(): Promise<SaasPlatformAnalyticsSummary> {
    const [totalTenantsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasTenantProfiles)
      .where(eq(saasTenantProfiles.tenantKind, 'customer'));
    const [activeTenantsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasTenantProfiles)
      .where(and(eq(saasTenantProfiles.tenantKind, 'customer'), eq(saasTenantProfiles.lifecycleStatus, 'active')));
    const [suspendedTenantsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasTenantProfiles)
      .where(and(eq(saasTenantProfiles.tenantKind, 'customer'), eq(saasTenantProfiles.lifecycleStatus, 'suspended')));
    const [trialTenantsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.status, 'trial'));
    const [activeSubscriptionsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.status, 'active'));
    const [cancelledSubscriptionsRow] = await this.deps.db
      .select({ value: count() })
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.status, 'cancelled'));

    return {
      totalTenants: Number(totalTenantsRow?.value ?? 0),
      activeTenants: Number(activeTenantsRow?.value ?? 0),
      suspendedTenants: Number(suspendedTenantsRow?.value ?? 0),
      trialTenants: Number(trialTenantsRow?.value ?? 0),
      activeSubscriptions: Number(activeSubscriptionsRow?.value ?? 0),
      cancelledSubscriptions: Number(cancelledSubscriptionsRow?.value ?? 0),
    };
  }

  private async listRecentAudits(companyId: string): Promise<SaasPlatformAuditSummary[]> {
    const rows = await this.deps.db.query.saasPlatformAudits.findMany({
      where: eq(saasPlatformAudits.companyId, companyId),
      orderBy: [desc(saasPlatformAudits.performedAt)],
      limit: 25,
    });
    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      subject: row.subject,
      details: row.details,
      performedAt: row.performedAt.toISOString(),
    }));
  }

  private async requirePlatformOwner(companyId: string) {
    if (!(await this.isPlatformOwnerTenant(companyId))) {
      throw new EnterpriseSaasPlatformError('FORBIDDEN', 'Platform owner access required');
    }
  }

  private async assertSubscriptionActive(companyId: string) {
    if (!(await this.isSubscriptionUsable(companyId))) {
      throw new EnterpriseSaasPlatformError('SUBSCRIPTION_REQUIRED', 'An active subscription is required for this action');
    }
  }

  private async isSubscriptionUsable(companyId: string): Promise<boolean> {
    if (!(await this.shouldEnforceSubscription(companyId))) {
      return true;
    }
    const subscription = await this.deps.db.query.saasSubscriptions.findFirst({
      where: eq(saasSubscriptions.companyId, companyId),
    });
    if (!subscription) {
      return false;
    }
    return ['trial', 'active', 'grace_period'].includes(subscription.status);
  }

  private async updateTenantLifecycle(
    companyId: string,
    lifecycleStatus: 'active' | 'suspended' | 'cancelled',
    extras: { suspendedAt?: Date | null; cancelledAt?: Date | null } = {},
  ) {
    await this.deps.db
      .update(saasTenantProfiles)
      .set({
        lifecycleStatus,
        suspendedAt: extras.suspendedAt ?? null,
        cancelledAt: extras.cancelledAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(saasTenantProfiles.companyId, companyId));
  }

  private async recordAudit(
    scope: StaffScope,
    input: { actionType: string; subject: string; details?: string; targetCompanyId?: string },
  ) {
    await this.deps.db.insert(saasPlatformAudits).values({
      companyId: input.targetCompanyId ?? scope.companyId,
      actionType: input.actionType,
      subject: input.subject,
      details: input.details ?? null,
      performedByUserId: scope.userId,
    });
  }

  private toPlanSummary(row: typeof saasSubscriptionPlans.$inferSelect): SaasSubscriptionPlanSummary {
    return {
      id: row.id,
      planKey: row.planKey,
      name: row.name,
      description: row.description,
      tier: row.tier,
      priceCents: row.priceCents,
      billingInterval: row.billingInterval,
      features: row.features,
      limits: row.limits,
      isActive: row.isActive,
    };
  }

  private toActionSummary(row: typeof saasPlatformActions.$inferSelect): SaasPlatformActionSummary {
    return {
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      targetCompanyId: row.targetCompanyId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
