import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type {
  CreateSmActionDraftRequest,
  CreateSmAddOnRequest,
  CreateSmBillingPolicyRequest,
  CreateSmCouponRequest,
  CreateSmFeatureAccessRuleRequest,
  CreateSmLicenseRequest,
  CreateSmPartnerAccountRequest,
  CreateSmPaymentProviderRequest,
  CreateSmUsageThresholdRequest,
  EnterpriseSaasManagementAuraContext,
  EnterpriseSaasManagementDashboard,
  SmAccountTypeSummary,
  SmActionDraftSummary,
  SmAddOnSummary,
  SmAnalyticsSummary,
  SmAuditLogSummary,
  SmBillingHealthSummary,
  SmBillingPolicySummary,
  SmCouponSummary,
  SmLicenseHistorySummary,
  SmLicenseSummary,
  SmNotificationSummary,
  SmOwnerBillingSummary,
  SmPartnerAccountSummary,
  SmPartnerCommissionSummary,
  SmPaymentProviderSummary,
  SmPlatformConfigSummary,
  SmSaasAlertSummary,
  SmTenantAddOnSummary,
  SmUsageMonitoringSummary,
  SmUsageThresholdSummary,
  UpdateSmPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  documents,
  ipPackInstallations,
  smAccountTypeCatalog,
  smActionDrafts,
  smAddOnCatalog,
  smAnalyticsSnapshots,
  smAuditLogs,
  smBillingPolicies,
  smCoupons,
  smFeatureAccessRules,
  smLicenseHistory,
  smLicenseRecords,
  smManagedTenantLinks,
  smNotifications,
  smPartnerAccounts,
  smPartnerCommissions,
  smPaymentProviderConfigs,
  smPlatformConfig,
  smSaasAlerts,
  smTenantAddOns,
  smUsageMonitoringSnapshots,
  smUsageThresholds,
  workflowRuns,
} from '@titan/db';
import type { AiOperationsService } from './ai-operations.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceService } from './finance.service.js';

export class EnterpriseSaasManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseSaasManagementError';
  }
}

type StaffScope = { companyId: string; userId: string };

const SYSTEM_ACCOUNT_TYPES: Array<{ accountTypeKey: SmAccountTypeSummary['accountTypeKey']; name: string; description: string }> = [
  { accountTypeKey: 'trial', name: 'Trial', description: 'Trial account with limited access.' },
  { accountTypeKey: 'active', name: 'Active', description: 'Active paying subscription.' },
  { accountTypeKey: 'suspended', name: 'Suspended', description: 'Suspended account.' },
  { accountTypeKey: 'cancelled', name: 'Cancelled', description: 'Cancelled subscription.' },
  { accountTypeKey: 'expired_trial', name: 'Expired Trial', description: 'Trial period has expired.' },
  { accountTypeKey: 'enterprise', name: 'Enterprise', description: 'Enterprise account with custom terms.' },
  { accountTypeKey: 'lifetime', name: 'Lifetime', description: 'Lifetime license account.' },
  { accountTypeKey: 'internal', name: 'Internal', description: 'Internal TITAN account.' },
];

type SaasManagementDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  financeService: FinanceService;
  aiOperationsService: AiOperationsService;
};

export class EnterpriseSaasManagementService {
  constructor(private readonly deps: SaasManagementDeps) {}

  async getPlatformDashboard(companyId: string) {
    return this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
  }

  async provisionTenant(scope: StaffScope, input: Parameters<EnterpriseSaasPlatformService['provisionTenant']>[1]) {
    return this.deps.enterpriseSaasPlatformService.provisionTenant(scope, input);
  }

  async createPlan(scope: StaffScope, input: Parameters<EnterpriseSaasPlatformService['createPlan']>[1]) {
    return this.deps.enterpriseSaasPlatformService.createPlan(scope, input);
  }

  async upgradePlan(scope: StaffScope, input: Parameters<EnterpriseSaasPlatformService['upgradePlan']>[1]) {
    return this.deps.enterpriseSaasPlatformService.upgradePlan(scope, input);
  }

  async downgradePlan(scope: StaffScope, input: Parameters<EnterpriseSaasPlatformService['downgradePlan']>[1]) {
    return this.deps.enterpriseSaasPlatformService.downgradePlan(scope, input);
  }

  async cancelSubscription(scope: StaffScope) {
    return this.deps.enterpriseSaasPlatformService.cancelSubscription(scope);
  }

  async suspendTenant(scope: StaffScope, targetCompanyId: string) {
    return this.deps.enterpriseSaasPlatformService.suspendTenant(scope, targetCompanyId);
  }

  async reactivateTenant(scope: StaffScope, targetCompanyId: string) {
    return this.deps.enterpriseSaasPlatformService.reactivateTenant(scope, targetCompanyId);
  }

  async getDashboard(companyId: string): Promise<EnterpriseSaasManagementDashboard> {
    await this.ensureSystemCatalog();
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      legacySaasPlatform,
      accountTypes,
      alerts,
      analytics,
      billingHealth,
      usageMonitoring,
      licenses,
      addOns,
      partners,
      notifications,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.getPlatformDashboard(companyId).catch(() => null),
      this.listAccountTypes(),
      this.listSaasAlerts(companyId, { status: 'open' }),
      this.getLatestAnalytics(companyId),
      this.getBillingHealth(companyId),
      this.getUsageMonitoring(companyId),
      this.listLicenses(companyId),
      this.listAddOns(companyId),
      this.listPartners(companyId),
      this.listNotifications(companyId, { limit: 10 }),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const isPlatformOwner = legacySaasPlatform?.isPlatformOwner ?? false;
    const tenants = legacySaasPlatform?.tenants ?? [];
    const plans = legacySaasPlatform?.plans ?? [];
    const subscriptions = legacySaasPlatform?.subscription ? [legacySaasPlatform.subscription] : [];
    const billingRecords = legacySaasPlatform?.billingRecords ?? [];
    const trialExpirationCount = tenants.filter((t) => t.subscriptionStatus === 'trial').length;
    const activeSubscriptionCount =
      legacySaasPlatform?.platformAnalytics?.activeSubscriptions ??
      (legacySaasPlatform?.subscription?.status === 'active' ? 1 : 0);

    return {
      summary: `${accountTypes.length} account type(s), ${activeSubscriptionCount} active subscription(s), ${licenses.length} license(s), ${partners.length} partner(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      legacySaasPlatform,
      accountTypeCount: accountTypes.length,
      activeSubscriptionCount,
      trialExpirationCount,
      failedPaymentCount: billingHealth.failedPaymentCount,
      openAlertCount: alerts.length,
      licenseCount: licenses.length,
      partnerCount: partners.length,
      overallBillingHealthStatus: billingHealth.overallBillingHealthStatus,
      billingHealth,
      usageMonitoring,
      analytics,
      tenants,
      plans,
      subscriptions,
      licenses,
      billingRecords,
      addOns,
      partners,
      recentAlerts: alerts.slice(0, 10),
      recentNotifications: notifications,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseSaasManagementAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      isPlatformOwner: dashboard.isPlatformOwner,
      activeSubscriptionCount: dashboard.activeSubscriptionCount,
      trialExpirationCount: dashboard.trialExpirationCount,
      failedPaymentCount: dashboard.failedPaymentCount,
      openAlertCount: dashboard.openAlertCount,
      licenseCount: dashboard.licenseCount,
      overallBillingHealthStatus: dashboard.overallBillingHealthStatus,
    };
  }

  async getOwnerBillingSummary(companyId: string): Promise<SmOwnerBillingSummary> {
    const legacy = await this.getPlatformDashboard(companyId);
    const tenantAddOns = await this.listTenantAddOns(companyId, companyId);
    return {
      subscription: legacy.subscription,
      billingRecords: legacy.billingRecords,
      usage: legacy.usage,
      plans: legacy.plans,
      addOns: tenantAddOns,
    };
  }

  async getPlatformConfig(companyId: string): Promise<SmPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateSmPlatformConfigRequest): Promise<SmPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(smPlatformConfig)
      .set({
        billingPolicy: input.billingPolicy ?? existing.billingPolicy,
        provisioningPolicy: input.provisioningPolicy ?? existing.provisioningPolicy,
        licensingPolicy: input.licensingPolicy ?? existing.licensingPolicy,
        partnerPolicy: input.partnerPolicy ?? existing.partnerPolicy,
        usagePolicy: input.usagePolicy ?? existing.usagePolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(smPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async listAccountTypes(): Promise<SmAccountTypeSummary[]> {
    await this.ensureSystemCatalog();
    const rows = await this.deps.db.query.smAccountTypeCatalog.findMany({
      where: isNull(smAccountTypeCatalog.companyId),
      orderBy: [desc(smAccountTypeCatalog.createdAt)],
    });
    return rows.map(toAccountTypeSummary);
  }

  async listLicenses(companyId: string): Promise<SmLicenseSummary[]> {
    const rows = await this.deps.db.query.smLicenseRecords.findMany({
      where: eq(smLicenseRecords.companyId, companyId),
      orderBy: [desc(smLicenseRecords.createdAt)],
    });
    return rows.map(toLicenseSummary);
  }

  async createLicense(scope: StaffScope, input: CreateSmLicenseRequest): Promise<SmLicenseSummary> {
    const [created] = await this.deps.db
      .insert(smLicenseRecords)
      .values({
        companyId: scope.companyId,
        targetCompanyId: input.targetCompanyId,
        licenseKey: input.licenseKey,
        licenseType: input.licenseType,
        seatLimit: input.seatLimit ?? null,
        deviceTrackingEnabled: input.deviceTrackingEnabled ?? false,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        status: 'pending',
      })
      .returning();
    await this.recordLicenseHistory(scope, created!.id, 'created', null, 'pending', 'License created');
    await this.recordAudit(scope, 'license_created', 'license', created!.id);
    return toLicenseSummary(created!);
  }

  async activateLicense(scope: StaffScope, licenseId: string): Promise<SmLicenseSummary> {
    const license = await this.ensureLicense(scope.companyId, licenseId);
    const [updated] = await this.deps.db
      .update(smLicenseRecords)
      .set({ status: 'active', activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(smLicenseRecords.id, license.id))
      .returning();
    await this.recordLicenseHistory(scope, license.id, 'activated', license.status, 'active', 'License activated');
    await this.recordAudit(scope, 'license_activated', 'license', license.id);
    return toLicenseSummary(updated!);
  }

  async suspendLicense(scope: StaffScope, licenseId: string): Promise<SmLicenseSummary> {
    const license = await this.ensureLicense(scope.companyId, licenseId);
    const [updated] = await this.deps.db
      .update(smLicenseRecords)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(smLicenseRecords.id, license.id))
      .returning();
    await this.recordLicenseHistory(scope, license.id, 'suspended', license.status, 'suspended', 'License suspended');
    return toLicenseSummary(updated!);
  }

  async listLicenseHistory(companyId: string, licenseId: string): Promise<SmLicenseHistorySummary[]> {
    await this.ensureLicense(companyId, licenseId);
    const rows = await this.deps.db.query.smLicenseHistory.findMany({
      where: and(eq(smLicenseHistory.companyId, companyId), eq(smLicenseHistory.licenseId, licenseId)),
      orderBy: [desc(smLicenseHistory.createdAt)],
    });
    return rows.map(toLicenseHistorySummary);
  }

  async listPaymentProviders(companyId: string): Promise<SmPaymentProviderSummary[]> {
    const rows = await this.deps.db.query.smPaymentProviderConfigs.findMany({
      where: eq(smPaymentProviderConfigs.companyId, companyId),
      orderBy: [desc(smPaymentProviderConfigs.createdAt)],
    });
    return rows.map(toPaymentProviderSummary);
  }

  async createPaymentProvider(scope: StaffScope, input: CreateSmPaymentProviderRequest): Promise<SmPaymentProviderSummary> {
    const [created] = await this.deps.db
      .insert(smPaymentProviderConfigs)
      .values({
        companyId: scope.companyId,
        providerKey: input.providerKey,
        name: input.name,
        enabled: input.enabled ?? false,
        config: input.config ?? {},
        supportedCurrencies: input.supportedCurrencies ?? ['USD'],
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'payment_provider_created', 'payment_provider', created!.id);
    return toPaymentProviderSummary(created!);
  }

  async listBillingPolicies(companyId: string): Promise<SmBillingPolicySummary[]> {
    const rows = await this.deps.db.query.smBillingPolicies.findMany({
      where: eq(smBillingPolicies.companyId, companyId),
      orderBy: [desc(smBillingPolicies.createdAt)],
    });
    return rows.map(toBillingPolicySummary);
  }

  async createBillingPolicy(scope: StaffScope, input: CreateSmBillingPolicyRequest): Promise<SmBillingPolicySummary> {
    const [created] = await this.deps.db
      .insert(smBillingPolicies)
      .values({
        companyId: scope.companyId,
        policyKey: input.policyKey,
        name: input.name,
        retryPolicy: input.retryPolicy ?? {},
        prorationPolicy: input.prorationPolicy ?? {},
        taxPolicy: input.taxPolicy ?? {},
        currencyPolicy: input.currencyPolicy ?? {},
        config: input.config ?? {},
        workflowStatus: 'published',
      })
      .returning();
    await this.recordAudit(scope, 'billing_policy_created', 'billing_policy', created!.id);
    return toBillingPolicySummary(created!);
  }

  async listCoupons(companyId: string): Promise<SmCouponSummary[]> {
    const rows = await this.deps.db.query.smCoupons.findMany({
      where: eq(smCoupons.companyId, companyId),
      orderBy: [desc(smCoupons.createdAt)],
    });
    return rows.map(toCouponSummary);
  }

  async createCoupon(scope: StaffScope, input: CreateSmCouponRequest): Promise<SmCouponSummary> {
    const [created] = await this.deps.db
      .insert(smCoupons)
      .values({
        companyId: scope.companyId,
        couponCode: input.couponCode,
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        currency: input.currency ?? 'USD',
        maxRedemptions: input.maxRedemptions ?? null,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        workflowStatus: 'published',
      })
      .returning();
    await this.recordAudit(scope, 'coupon_created', 'coupon', created!.id);
    return toCouponSummary(created!);
  }

  async listAddOns(companyId: string): Promise<SmAddOnSummary[]> {
    const rows = await this.deps.db.query.smAddOnCatalog.findMany({
      where: eq(smAddOnCatalog.companyId, companyId),
      orderBy: [desc(smAddOnCatalog.createdAt)],
    });
    return rows.map(toAddOnSummary);
  }

  async createAddOn(scope: StaffScope, input: CreateSmAddOnRequest): Promise<SmAddOnSummary> {
    const [created] = await this.deps.db
      .insert(smAddOnCatalog)
      .values({
        companyId: scope.companyId,
        addOnKey: input.addOnKey,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents ?? 0,
        currency: input.currency ?? 'USD',
        billingInterval: input.billingInterval ?? 'monthly',
        features: input.features ?? [],
        limits: input.limits ?? {},
        workflowStatus: 'published',
      })
      .returning();
    await this.recordAudit(scope, 'add_on_created', 'add_on', created!.id);
    return toAddOnSummary(created!);
  }

  async listTenantAddOns(companyId: string, targetCompanyId: string): Promise<SmTenantAddOnSummary[]> {
    const rows = await this.deps.db.query.smTenantAddOns.findMany({
      where: and(eq(smTenantAddOns.companyId, companyId), eq(smTenantAddOns.targetCompanyId, targetCompanyId)),
      orderBy: [desc(smTenantAddOns.purchasedAt)],
    });
    const summaries: SmTenantAddOnSummary[] = [];
    for (const row of rows) {
      const catalog = await this.deps.db.query.smAddOnCatalog.findFirst({
        where: eq(smAddOnCatalog.id, row.addOnCatalogId),
      });
      summaries.push({
        id: row.id,
        targetCompanyId: row.targetCompanyId,
        addOnKey: catalog?.addOnKey ?? 'unknown',
        addOnName: catalog?.name ?? 'Unknown add-on',
        status: row.status,
        purchasedAt: row.purchasedAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
    }
    return summaries;
  }

  async listPartners(companyId: string): Promise<SmPartnerAccountSummary[]> {
    const rows = await this.deps.db.query.smPartnerAccounts.findMany({
      where: eq(smPartnerAccounts.companyId, companyId),
      orderBy: [desc(smPartnerAccounts.createdAt)],
    });
    const summaries: SmPartnerAccountSummary[] = [];
    for (const row of rows) {
      const managed = await this.deps.db.query.smManagedTenantLinks.findMany({
        where: eq(smManagedTenantLinks.partnerAccountId, row.id),
        columns: { id: true },
      });
      summaries.push({
        id: row.id,
        partnerCompanyId: row.partnerCompanyId,
        partnerType: row.partnerType,
        name: row.name,
        whiteLabelEnabled: row.whiteLabelEnabled,
        workflowStatus: row.workflowStatus,
        managedTenantCount: managed.length,
      });
    }
    return summaries;
  }

  async createPartner(scope: StaffScope, input: CreateSmPartnerAccountRequest): Promise<SmPartnerAccountSummary> {
    const [created] = await this.deps.db
      .insert(smPartnerAccounts)
      .values({
        companyId: scope.companyId,
        partnerCompanyId: input.partnerCompanyId,
        partnerType: input.partnerType,
        name: input.name,
        whiteLabelEnabled: input.whiteLabelEnabled ?? false,
        pricingPolicy: input.pricingPolicy ?? {},
        workflowStatus: 'published',
      })
      .returning();
    await this.recordAudit(scope, 'partner_created', 'partner', created!.id);
    const partners = await this.listPartners(scope.companyId);
    return partners.find((p) => p.id === created!.id)!;
  }

  async listPartnerCommissions(companyId: string): Promise<SmPartnerCommissionSummary[]> {
    const rows = await this.deps.db.query.smPartnerCommissions.findMany({
      where: eq(smPartnerCommissions.companyId, companyId),
      orderBy: [desc(smPartnerCommissions.earnedAt)],
    });
    return rows.map(toPartnerCommissionSummary);
  }

  async listUsageThresholds(companyId: string): Promise<SmUsageThresholdSummary[]> {
    const rows = await this.deps.db.query.smUsageThresholds.findMany({
      where: eq(smUsageThresholds.companyId, companyId),
      orderBy: [desc(smUsageThresholds.createdAt)],
    });
    return rows.map(toUsageThresholdSummary);
  }

  async createUsageThreshold(scope: StaffScope, input: CreateSmUsageThresholdRequest): Promise<SmUsageThresholdSummary> {
    const [created] = await this.deps.db
      .insert(smUsageThresholds)
      .values({
        companyId: scope.companyId,
        targetCompanyId: input.targetCompanyId ?? null,
        metricKey: input.metricKey,
        warningPercent: input.warningPercent ?? 80,
        criticalPercent: input.criticalPercent ?? 95,
        limitValue: input.limitValue ?? null,
        config: input.config ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'usage_threshold_created', 'usage_threshold', created!.id);
    return toUsageThresholdSummary(created!);
  }

  async listFeatureAccessRules(companyId: string) {
    const rows = await this.deps.db.query.smFeatureAccessRules.findMany({
      where: eq(smFeatureAccessRules.companyId, companyId),
      orderBy: [desc(smFeatureAccessRules.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      featureKey: row.featureKey,
      scopeType: row.scopeType,
      scopeRef: row.scopeRef,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createFeatureAccessRule(scope: StaffScope, input: CreateSmFeatureAccessRuleRequest) {
    const [created] = await this.deps.db
      .insert(smFeatureAccessRules)
      .values({
        companyId: scope.companyId,
        featureKey: input.featureKey,
        scopeType: input.scopeType,
        scopeRef: input.scopeRef ?? null,
        enabled: input.enabled ?? true,
        config: input.config ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'feature_access_rule_created', 'feature_access_rule', created!.id);
    return {
      id: created!.id,
      featureKey: created!.featureKey,
      scopeType: created!.scopeType,
      scopeRef: created!.scopeRef,
      enabled: created!.enabled,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  async listNotifications(companyId: string, filters?: { limit?: number }): Promise<SmNotificationSummary[]> {
    const rows = await this.deps.db.query.smNotifications.findMany({
      where: eq(smNotifications.companyId, companyId),
      orderBy: [desc(smNotifications.createdAt)],
      limit: filters?.limit ?? 50,
    });
    return rows.map(toNotificationSummary);
  }

  async syncSaasAlerts(scope: StaffScope): Promise<SmSaasAlertSummary[]> {
    const companyId = scope.companyId;
    const legacy = await this.getPlatformDashboard(companyId);
    const now = new Date();
    const trialWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (legacy.subscription?.status === 'trial' && legacy.subscription.trialEndsAt) {
      const trialEnds = new Date(legacy.subscription.trialEndsAt);
      if (trialEnds <= trialWindow) {
        await this.upsertSaasAlert(companyId, {
          alertType: 'trial_ending',
          severity: trialEnds <= now ? 'critical' : 'warning',
          title: 'Trial ending soon',
          description: `Trial ends ${trialEnds.toISOString()}.`,
          targetCompanyId: companyId,
        });
      }
    }

    const failedPayments = legacy.billingRecords.filter((r) => r.status === 'failed');
    if (failedPayments.length > 0) {
      await this.upsertSaasAlert(companyId, {
        alertType: 'payment_failed',
        severity: failedPayments.length > 2 ? 'critical' : 'warning',
        title: 'Payment failures detected',
        description: `${failedPayments.length} failed billing record(s).`,
        targetCompanyId: companyId,
      });
    }

    if (legacy.subscription?.currentPeriodEnd) {
      const renewalDue = new Date(legacy.subscription.currentPeriodEnd);
      const renewalWindow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (renewalDue <= renewalWindow && legacy.subscription.status === 'active') {
        await this.upsertSaasAlert(companyId, {
          alertType: 'renewal_due',
          severity: 'info',
          title: 'Renewal due',
          description: `Subscription renews ${renewalDue.toISOString()}.`,
          targetCompanyId: companyId,
        });
      }
    }

    const licenses = await this.listLicenses(companyId);
    for (const license of licenses) {
      if (license.expiresAt && new Date(license.expiresAt) <= trialWindow) {
        await this.upsertSaasAlert(companyId, {
          alertType: 'license_expiry',
          severity: 'warning',
          title: 'License expiring',
          description: `License ${license.licenseKey} expires ${license.expiresAt}.`,
          targetCompanyId: license.targetCompanyId,
        });
      }
    }

    const usage = await this.getUsageMonitoring(companyId);
    if (usage.alerts.length > 0) {
      await this.upsertSaasAlert(companyId, {
        alertType: 'usage_limit',
        severity: 'warning',
        title: 'Usage limits approaching',
        description: usage.alerts.join('; '),
        targetCompanyId: companyId,
      });
    }

    if (legacy.isPlatformOwner) {
      for (const tenant of legacy.tenants) {
        if (tenant.subscriptionStatus === 'trial') {
          await this.upsertSaasAlert(companyId, {
            alertType: 'tenant_trial',
            severity: 'info',
            title: `Trial tenant: ${tenant.companyName}`,
            description: `Tenant ${tenant.companySlug} on trial.`,
            targetCompanyId: tenant.companyId,
          });
        }
      }
    }

    return this.listSaasAlerts(companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<SmAnalyticsSummary> {
    const legacy = await this.getPlatformDashboard(scope.companyId);
    const [automationCount] = await this.deps.db
      .select({ value: count() })
      .from(workflowRuns)
      .where(eq(workflowRuns.companyId, scope.companyId));
    const [documentCount] = await this.deps.db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.companyId, scope.companyId));
    const [packCount] = await this.deps.db
      .select({ value: count() })
      .from(ipPackInstallations)
      .where(and(eq(ipPackInstallations.companyId, scope.companyId), eq(ipPackInstallations.status, 'installed')));

    const metrics: Record<string, unknown> = {
      isPlatformOwner: legacy.isPlatformOwner,
      tenantCount: legacy.tenants.length,
      activeSubscriptions: legacy.platformAnalytics?.activeSubscriptions ?? 0,
      trialTenants: legacy.platformAnalytics?.trialTenants ?? 0,
      suspendedTenants: legacy.platformAnalytics?.suspendedTenants ?? 0,
      userCount: legacy.usage.userCount,
      apiRequestCount: legacy.usage.apiRequestCount,
      aiUsageCount: legacy.usage.aiUsageCount,
      integrationCount: legacy.usage.integrationCount,
      automationCount: automationCount?.value ?? 0,
      documentCount: documentCount?.value ?? 0,
      industryPackCount: packCount?.value ?? 0,
      failedPaymentCount: legacy.billingRecords.filter((r) => r.status === 'failed').length,
      capturedAt: new Date().toISOString(),
    };

    const [snapshot] = await this.deps.db
      .insert(smAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(snapshot!);
  }

  async captureUsageSnapshot(scope: StaffScope, targetCompanyId?: string): Promise<SmUsageMonitoringSummary> {
    const targetId = targetCompanyId ?? scope.companyId;
    const legacy = await this.getPlatformDashboard(targetId);
    const monitoring = await this.buildUsageMetrics(targetId, legacy.usage);
    await this.deps.db.insert(smUsageMonitoringSnapshots).values({
      companyId: scope.companyId,
      targetCompanyId: targetId,
      metrics: monitoring as unknown as Record<string, unknown>,
    });
    await this.recordAudit(scope, 'usage_snapshot_captured', 'tenant', targetId);
    return monitoring;
  }

  async getBillingHealth(companyId: string): Promise<SmBillingHealthSummary> {
    const legacy = await this.getPlatformDashboard(companyId).catch(() => null);
    const failedPaymentCount = legacy?.billingRecords.filter((r) => r.status === 'failed').length ?? 0;
    const pendingRenewalCount =
      legacy?.subscription?.status === 'active' && legacy.subscription.currentPeriodEnd ? 1 : 0;
    const openAlerts = await this.listSaasAlerts(companyId, { status: 'open' });
    const billingAlerts = openAlerts.filter((a) =>
      ['payment_failed', 'renewal_due', 'trial_ending'].includes(a.alertType),
    );
    const overallBillingHealthStatus =
      failedPaymentCount > 2 || billingAlerts.some((a) => a.severity === 'critical')
        ? 'critical'
        : failedPaymentCount > 0 || billingAlerts.length > 0
          ? 'degraded'
          : 'healthy';
    return {
      failedPaymentCount,
      pendingRenewalCount,
      openAlertCount: billingAlerts.length,
      overallBillingHealthStatus,
    };
  }

  async getUsageMonitoring(companyId: string): Promise<SmUsageMonitoringSummary> {
    const legacy = await this.getPlatformDashboard(companyId).catch(() => null);
    const usage = legacy?.usage ?? {
      userCount: 0,
      storageBytes: 0,
      apiRequestCount: 0,
      aiUsageCount: 0,
      integrationCount: 0,
      capturedAt: null,
    };
    return this.buildUsageMetrics(companyId, usage);
  }

  async listSaasAlerts(companyId: string, filters?: { status?: string }): Promise<SmSaasAlertSummary[]> {
    const rows = await this.deps.db.query.smSaasAlerts.findMany({
      where: filters?.status
        ? and(eq(smSaasAlerts.companyId, companyId), eq(smSaasAlerts.status, filters.status as never))
        : eq(smSaasAlerts.companyId, companyId),
      orderBy: [desc(smSaasAlerts.createdAt)],
    });
    return rows.map(toSaasAlertSummary);
  }

  async acknowledgeSaasAlert(scope: StaffScope, alertId: string): Promise<SmSaasAlertSummary> {
    await this.ensureSaasAlert(scope.companyId, alertId);
    const [updated] = await this.deps.db
      .update(smSaasAlerts)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(smSaasAlerts.id, alertId))
      .returning();
    await this.recordAudit(scope, 'alert_acknowledged', 'saas_alert', alertId);
    return toSaasAlertSummary(updated!);
  }

  async createActionDraft(scope: StaffScope, input: CreateSmActionDraftRequest): Promise<SmActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(smActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType,
        title: input.title,
        content: input.content,
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'action_draft_created', 'action_draft', created!.id);
    return toActionDraftSummary(created!);
  }

  async listAuditLogs(companyId: string, limit = 100): Promise<SmAuditLogSummary[]> {
    const rows = await this.deps.db.query.smAuditLogs.findMany({
      where: eq(smAuditLogs.companyId, companyId),
      orderBy: [desc(smAuditLogs.createdAt)],
      limit,
    });
    return rows.map(toAuditLogSummary);
  }

  private async buildUsageMetrics(
    companyId: string,
    usage: { userCount: number; storageBytes: number; apiRequestCount: number; aiUsageCount: number; integrationCount: number },
  ): Promise<SmUsageMonitoringSummary> {
    const [automationCount] = await this.deps.db
      .select({ value: count() })
      .from(workflowRuns)
      .where(eq(workflowRuns.companyId, companyId));
    const [documentCount] = await this.deps.db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.companyId, companyId));
    const [packCount] = await this.deps.db
      .select({ value: count() })
      .from(ipPackInstallations)
      .where(and(eq(ipPackInstallations.companyId, companyId), eq(ipPackInstallations.status, 'installed')));

    const thresholds = await this.listUsageThresholds(companyId);
    const alerts: string[] = [];
    const metrics = [
      { key: 'users', value: usage.userCount },
      { key: 'storage', value: usage.storageBytes },
      { key: 'api_calls', value: usage.apiRequestCount },
      { key: 'ai_requests', value: usage.aiUsageCount },
      { key: 'integrations', value: usage.integrationCount },
      { key: 'automations', value: automationCount?.value ?? 0 },
      { key: 'documents', value: documentCount?.value ?? 0 },
      { key: 'industry_packs', value: packCount?.value ?? 0 },
    ];

    for (const metric of metrics) {
      const threshold = thresholds.find((t) => t.metricKey === metric.key && t.limitValue);
      if (!threshold?.limitValue) continue;
      const percent = (metric.value / threshold.limitValue) * 100;
      if (percent >= threshold.criticalPercent) {
        alerts.push(`${metric.key} at ${percent.toFixed(0)}% of limit`);
      } else if (percent >= threshold.warningPercent) {
        alerts.push(`${metric.key} approaching limit (${percent.toFixed(0)}%)`);
      }
    }

    return {
      userCount: usage.userCount,
      storageBytes: usage.storageBytes,
      apiRequestCount: usage.apiRequestCount,
      aiUsageCount: usage.aiUsageCount,
      documentCount: documentCount?.value ?? 0,
      automationCount: automationCount?.value ?? 0,
      integrationCount: usage.integrationCount,
      industryPackCount: packCount?.value ?? 0,
      alerts,
    };
  }

  private async ensureSystemCatalog() {
    for (const accountType of SYSTEM_ACCOUNT_TYPES) {
      const existing = await this.deps.db.query.smAccountTypeCatalog.findFirst({
        where: and(
          isNull(smAccountTypeCatalog.companyId),
          eq(smAccountTypeCatalog.accountTypeKey, accountType.accountTypeKey),
        ),
      });
      if (existing) continue;
      await this.deps.db.insert(smAccountTypeCatalog).values({
        companyId: null,
        accountTypeKey: accountType.accountTypeKey,
        name: accountType.name,
        description: accountType.description,
        isSystemType: true,
      });
    }
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.smPlatformConfig.findFirst({
      where: eq(smPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(smPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureLicense(companyId: string, licenseId: string) {
    const row = await this.deps.db.query.smLicenseRecords.findFirst({
      where: and(eq(smLicenseRecords.id, licenseId), eq(smLicenseRecords.companyId, companyId)),
    });
    if (!row) throw new EnterpriseSaasManagementError('NOT_FOUND', 'License not found');
    return row;
  }

  private async ensureSaasAlert(companyId: string, alertId: string) {
    const row = await this.deps.db.query.smSaasAlerts.findFirst({
      where: and(eq(smSaasAlerts.id, alertId), eq(smSaasAlerts.companyId, companyId)),
    });
    if (!row) throw new EnterpriseSaasManagementError('NOT_FOUND', 'SaaS alert not found');
    return row;
  }

  private async upsertSaasAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      targetCompanyId?: string;
    },
  ): Promise<SmSaasAlertSummary> {
    const existing = await this.deps.db.query.smSaasAlerts.findFirst({
      where: and(
        eq(smSaasAlerts.companyId, companyId),
        eq(smSaasAlerts.alertType, input.alertType),
        eq(smSaasAlerts.status, 'open'),
        ...(input.targetCompanyId ? [eq(smSaasAlerts.targetCompanyId, input.targetCompanyId)] : []),
      ),
    });
    if (existing) {
      const [updated] = await this.deps.db
        .update(smSaasAlerts)
        .set({
          title: input.title,
          description: input.description,
          severity: input.severity,
          updatedAt: new Date(),
        })
        .where(eq(smSaasAlerts.id, existing.id))
        .returning();
      return toSaasAlertSummary(updated!);
    }
    const [created] = await this.deps.db
      .insert(smSaasAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        targetCompanyId: input.targetCompanyId ?? null,
        sourceModule: 'saas_management',
        status: 'open',
      })
      .returning();
    return toSaasAlertSummary(created!);
  }

  private async recordLicenseHistory(
    scope: StaffScope,
    licenseId: string,
    changeType: string,
    previousStatus: string | null,
    newStatus: string,
    notes: string,
  ) {
    await this.deps.db.insert(smLicenseHistory).values({
      companyId: scope.companyId,
      licenseId,
      changeType,
      previousStatus,
      newStatus,
      notes,
      changedByUserId: scope.userId,
    });
  }

  private async getLatestAnalytics(companyId: string): Promise<SmAnalyticsSummary | null> {
    const row = await this.deps.db.query.smAnalyticsSnapshots.findFirst({
      where: eq(smAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(smAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(smAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof smPlatformConfig.$inferSelect): SmPlatformConfigSummary {
  return {
    billingPolicy: row.billingPolicy ?? {},
    provisioningPolicy: row.provisioningPolicy ?? {},
    licensingPolicy: row.licensingPolicy ?? {},
    partnerPolicy: row.partnerPolicy ?? {},
    usagePolicy: row.usagePolicy ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toAccountTypeSummary(row: typeof smAccountTypeCatalog.$inferSelect): SmAccountTypeSummary {
  return {
    id: row.id,
    accountTypeKey: row.accountTypeKey,
    name: row.name,
    description: row.description,
    isSystemType: row.isSystemType,
  };
}

function toLicenseSummary(row: typeof smLicenseRecords.$inferSelect): SmLicenseSummary {
  return {
    id: row.id,
    targetCompanyId: row.targetCompanyId,
    licenseKey: row.licenseKey,
    licenseType: row.licenseType,
    status: row.status,
    seatLimit: row.seatLimit,
    seatsUsed: row.seatsUsed,
    deviceTrackingEnabled: row.deviceTrackingEnabled,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLicenseHistorySummary(row: typeof smLicenseHistory.$inferSelect): SmLicenseHistorySummary {
  return {
    id: row.id,
    licenseId: row.licenseId,
    changeType: row.changeType,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPaymentProviderSummary(row: typeof smPaymentProviderConfigs.$inferSelect): SmPaymentProviderSummary {
  return {
    id: row.id,
    providerKey: row.providerKey,
    name: row.name,
    enabled: row.enabled,
    supportedCurrencies: row.supportedCurrencies ?? ['USD'],
    workflowStatus: row.workflowStatus,
  };
}

function toBillingPolicySummary(row: typeof smBillingPolicies.$inferSelect): SmBillingPolicySummary {
  return {
    id: row.id,
    policyKey: row.policyKey,
    name: row.name,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCouponSummary(row: typeof smCoupons.$inferSelect): SmCouponSummary {
  return {
    id: row.id,
    couponCode: row.couponCode,
    name: row.name,
    discountType: row.discountType,
    discountValue: row.discountValue,
    currency: row.currency,
    redemptionCount: row.redemptionCount,
    maxRedemptions: row.maxRedemptions,
    workflowStatus: row.workflowStatus,
  };
}

function toAddOnSummary(row: typeof smAddOnCatalog.$inferSelect): SmAddOnSummary {
  return {
    id: row.id,
    addOnKey: row.addOnKey,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    billingInterval: row.billingInterval,
    features: row.features ?? [],
    workflowStatus: row.workflowStatus,
  };
}

function toPartnerCommissionSummary(row: typeof smPartnerCommissions.$inferSelect): SmPartnerCommissionSummary {
  return {
    id: row.id,
    partnerAccountId: row.partnerAccountId,
    targetCompanyId: row.targetCompanyId,
    amountCents: row.amountCents,
    currency: row.currency,
    commissionType: row.commissionType,
    status: row.status,
    earnedAt: row.earnedAt.toISOString(),
  };
}

function toUsageThresholdSummary(row: typeof smUsageThresholds.$inferSelect): SmUsageThresholdSummary {
  return {
    id: row.id,
    targetCompanyId: row.targetCompanyId,
    metricKey: row.metricKey,
    warningPercent: row.warningPercent,
    criticalPercent: row.criticalPercent,
    limitValue: row.limitValue,
  };
}

function toNotificationSummary(row: typeof smNotifications.$inferSelect): SmNotificationSummary {
  return {
    id: row.id,
    notificationType: row.notificationType,
    title: row.title,
    message: row.message,
    status: row.status,
    targetCompanyId: row.targetCompanyId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSaasAlertSummary(row: typeof smSaasAlerts.$inferSelect): SmSaasAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    targetCompanyId: row.targetCompanyId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof smActionDrafts.$inferSelect): SmActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof smAuditLogs.$inferSelect): SmAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof smAnalyticsSnapshots.$inferSelect): SmAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}
