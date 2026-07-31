import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateMiAdAccountRequest,
  CreateMiAdCampaignRequest,
  CreateMiAudienceRequest,
  CreateMiBrandRequest,
  CreateMiCampaignPlanRequest,
  CreateMiContentItemRequest,
  CreateMiCreativeRequestRequest,
  CreateMiEmailCampaignRequest,
  CreateMiExperimentRequest,
  CreateMiLandingPageRequest,
  CreateMiMarketingActionDraftRequest,
  CreateMiMarketingProviderRequest,
  CreateMiMarketingStrategyRequest,
  CreateMiMessagingCampaignRequest,
  CreateMiReviewResponseRequest,
  CreateMiSocialAccountRequest,
  CreateMiSocialPostRequest,
  EnterpriseMarketingIntelligenceAuraContext,
  EnterpriseMarketingIntelligenceDashboard,
  MiAdAccountSummary,
  MiAdBudgetSummary,
  MiAdCampaignSummary,
  MiAnalyticsSummary,
  MiAttributionRecordSummary,
  MiAudienceSummary,
  MiBrandAssetSummary,
  MiBrandSummary,
  MiCalendarEventSummary,
  MiCampaignMonitoringSummary,
  MiCampaignPlanSummary,
  MiContentItemSummary,
  MiCreativeRequestSummary,
  MiCustomerJourneySummary,
  MiEmailCampaignSummary,
  MiExperimentSummary,
  MiLandingPageSummary,
  MiLocalPresenceProfileSummary,
  MiMarketIntelligenceRecordSummary,
  MiMarketingAlertSummary,
  MiMarketingProviderSummary,
  MiMarketingStrategySummary,
  MiMessagingCampaignSummary,
  MiPlatformConfigSummary,
  MiReferralCampaignSummary,
  MiReviewSummary,
  MiRoiSnapshotSummary,
  MiSeoKeywordSummary,
  MiSocialAccountSummary,
  MiSocialPostSummary,
  MiSuppressionListSummary,
  MiWebsiteSummary,
  UpdateMiPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  miAdAccounts,
  miAdBudgets,
  miAdCampaigns,
  miAnalyticsSnapshots,
  miAttributionRecords,
  miAuditLogs,
  miAudiences,
  miBrandAssets,
  miBrands,
  miCalendarEvents,
  miCampaignPlans,
  miContentItems,
  miCreativeRequests,
  miCustomerJourneys,
  miEmailCampaigns,
  miExperiments,
  miLandingPages,
  miLocalPresenceProfiles,
  miMarketIntelligenceRecords,
  miMarketingActionDrafts,
  miMarketingAlerts,
  miMarketingProviderAdapters,
  miMarketingStrategies,
  miMessagingCampaigns,
  miPlatformConfig,
  miReferralCampaigns,
  miReviews,
  miRoiSnapshots,
  miSeoKeywords,
  miSocialAccounts,
  miSocialPosts,
  miSuppressionLists,
  miWebsites,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { CrmService } from './crm.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceService } from './finance.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';

export class EnterpriseMarketingIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseMarketingIntelligenceError';
  }
}

type StaffScope = { companyId: string; userId: string };

type MarketingIntelligenceDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  marketingService: MarketingService;
  crmService: CrmService;
  leadsService: LeadsService;
  financeService: FinanceService;
  analyticsService: AnalyticsService;
};

const BUDGET_OVERSPEND_THRESHOLD = 0.9;

export class EnterpriseMarketingIntelligenceService {
  constructor(private readonly deps: MarketingIntelligenceDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseMarketingIntelligenceDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      marketingStats,
      strategies,
      campaignPlans,
      brands,
      contentItems,
      socialPosts,
      emailCampaigns,
      alerts,
      providers,
      campaignMonitoring,
      roiSnapshots,
      marketIntelligence,
      analytics,
      financeStats,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.marketingService.getStats(companyId),
      this.listStrategies(companyId),
      this.listCampaignPlans(companyId),
      this.listBrands(companyId),
      this.listContentItems(companyId),
      this.listSocialPosts(companyId),
      this.listEmailCampaigns(companyId),
      this.listMarketingAlerts(companyId, { status: 'open' }),
      this.listProviders(companyId),
      this.getCampaignMonitoring(companyId),
      this.listRoiSnapshots(companyId),
      this.listMarketIntelligenceRecords(companyId),
      this.getLatestAnalytics(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    const activeCampaignPlanCount = campaignPlans.filter(
      (plan) => plan.lifecycleStatus === 'active' || plan.workflowStatus === 'executed',
    ).length;

    return {
      summary: `${campaignPlans.length} campaign plan(s), ${strategies.length} strateg(ies), ${brands.length} brand(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      marketingStats,
      campaignPlanCount: campaignPlans.length,
      activeCampaignPlanCount,
      strategyCount: strategies.length,
      brandCount: brands.length,
      openAlertCount: alerts.length,
      providerCount: providers.length,
      currency: financeStats.currency,
      analytics,
      campaignMonitoring,
      recentStrategies: strategies.slice(0, 10),
      recentCampaignPlans: campaignPlans.slice(0, 10),
      recentContentItems: contentItems.slice(0, 10),
      recentSocialPosts: socialPosts.slice(0, 10),
      recentEmailCampaigns: emailCampaigns.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentRoiSnapshots: roiSnapshots.slice(0, 10),
      recentMarketIntelligence: marketIntelligence.slice(0, 10),
    };
  }

  async getCampaignMonitoring(companyId: string): Promise<MiCampaignMonitoringSummary> {
    const [
      campaignPlans,
      contentItems,
      socialPosts,
      emailCampaigns,
      providers,
      roiSnapshots,
      legacyCampaigns,
    ] = await Promise.all([
      this.deps.db.query.miCampaignPlans.findMany({
        where: eq(miCampaignPlans.companyId, companyId),
      }),
      this.deps.db.query.miContentItems.findMany({
        where: eq(miContentItems.companyId, companyId),
      }),
      this.deps.db.query.miSocialPosts.findMany({ where: eq(miSocialPosts.companyId, companyId) }),
      this.deps.db.query.miEmailCampaigns.findMany({
        where: eq(miEmailCampaigns.companyId, companyId),
      }),
      this.listProviders(companyId),
      this.deps.db.query.miRoiSnapshots.findMany({
        where: eq(miRoiSnapshots.companyId, companyId),
      }),
      this.deps.marketingService.listCampaigns(companyId),
    ]);

    const now = Date.now();
    const pendingReviewCount =
      campaignPlans.filter((row) => ['review', 'pending_approval'].includes(row.workflowStatus))
        .length +
      contentItems.filter((row) => row.contentStatus === 'review').length +
      socialPosts.filter((row) => row.contentStatus === 'review').length +
      emailCampaigns.filter((row) => row.contentStatus === 'review').length;

    const overdueContentCount = [...contentItems, ...socialPosts, ...emailCampaigns].filter(
      (row) => {
        const scheduledAt = 'scheduledAt' in row ? row.scheduledAt : null;
        if (!scheduledAt) return false;
        const status = 'contentStatus' in row ? row.contentStatus : null;
        return new Date(scheduledAt).getTime() < now && status !== 'published';
      },
    ).length;

    const spendByPlan = new Map<string, number>();
    for (const snapshot of roiSnapshots) {
      if (!snapshot.campaignPlanId) continue;
      spendByPlan.set(
        snapshot.campaignPlanId,
        (spendByPlan.get(snapshot.campaignPlanId) ?? 0) + snapshot.spendCents,
      );
    }

    let budgetOverspendCount = 0;
    for (const plan of campaignPlans) {
      if (!plan.budgetCents || plan.budgetCents <= 0) continue;
      const spend = spendByPlan.get(plan.id) ?? 0;
      if (spend >= plan.budgetCents * BUDGET_OVERSPEND_THRESHOLD) budgetOverspendCount += 1;
    }

    const adapterSyncFailureCount = providers.filter(
      (provider) => provider.status === 'error',
    ).length;

    const unscheduledCampaignCount = campaignPlans.filter(
      (plan) =>
        ['approved', 'executed'].includes(plan.workflowStatus) &&
        !['active', 'scheduled', 'completed'].includes(plan.lifecycleStatus),
    ).length;

    const pendingApprovalCount = campaignPlans.filter(
      (row) => row.workflowStatus === 'pending_approval',
    ).length;

    const alerts: string[] = [];
    if (pendingReviewCount > 0) alerts.push(`${pendingReviewCount} item(s) pending review`);
    if (pendingApprovalCount > 0)
      alerts.push(`${pendingApprovalCount} campaign plan(s) pending approval`);
    if (overdueContentCount > 0)
      alerts.push(`${overdueContentCount} overdue scheduled content item(s)`);
    if (budgetOverspendCount > 0)
      alerts.push(`${budgetOverspendCount} campaign plan(s) near or over budget`);
    if (adapterSyncFailureCount > 0)
      alerts.push(`${adapterSyncFailureCount} marketing provider sync failure(s)`);
    if (unscheduledCampaignCount > 0)
      alerts.push(`${unscheduledCampaignCount} approved campaign plan(s) not scheduled`);
    if (legacyCampaigns.filter((row) => row.status === 'draft').length > 0) {
      alerts.push(
        `${legacyCampaigns.filter((row) => row.status === 'draft').length} legacy marketing campaign draft(s)`,
      );
    }

    return {
      overdueContentCount,
      pendingReviewCount,
      budgetOverspendCount,
      adapterSyncFailureCount,
      unscheduledCampaignCount,
      alerts,
    };
  }

  async getPortalMarketingSummary(companyId: string) {
    const [marketingStats, monitoring, financeStats] = await Promise.all([
      this.deps.marketingService.getStats(companyId),
      this.getCampaignMonitoring(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    return {
      activeCampaignCount: marketingStats.activeCampaignCount,
      pendingReviewCount: monitoring.pendingReviewCount,
      openAlertCount: monitoring.alerts.length,
      currency: financeStats.currency,
      summary:
        marketingStats.activeCampaignCount > 0 || monitoring.pendingReviewCount > 0
          ? `${marketingStats.activeCampaignCount} active campaign(s), ${monitoring.pendingReviewCount} item(s) pending review.`
          : 'No active marketing activity.',
    };
  }

  async listMarketingCampaigns(companyId: string) {
    return this.deps.marketingService.listCampaigns(companyId);
  }

  async listMarketingSegments(companyId: string) {
    return this.deps.marketingService.listSegments(companyId);
  }

  async getPlatformConfig(companyId: string): Promise<MiPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateMiPlatformConfigRequest,
  ): Promise<MiPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(miPlatformConfig)
      .set({
        marketingStandards: input.marketingStandards ?? existing.marketingStandards,
        providerAdapterTemplates:
          input.providerAdapterTemplates ?? existing.providerAdapterTemplates,
        brandTemplates: input.brandTemplates ?? existing.brandTemplates,
        campaignTemplates: input.campaignTemplates ?? existing.campaignTemplates,
        contentTemplates: input.contentTemplates ?? existing.contentTemplates,
        attributionStandards: input.attributionStandards ?? existing.attributionStandards,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(miPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createStrategy(
    scope: StaffScope,
    input: CreateMiMarketingStrategyRequest,
  ): Promise<MiMarketingStrategySummary> {
    const [created] = await this.deps.db
      .insert(miMarketingStrategies)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        strategyKey: input.strategyKey.trim(),
        ownerUserId: scope.userId,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        goals: input.goals ?? {},
        config: input.config ?? {},
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'strategy_created', 'mi_marketing_strategy', created!.id);
    return toStrategySummary(created!);
  }

  async listStrategies(companyId: string): Promise<MiMarketingStrategySummary[]> {
    const rows = await this.deps.db.query.miMarketingStrategies.findMany({
      where: eq(miMarketingStrategies.companyId, companyId),
      orderBy: [desc(miMarketingStrategies.createdAt)],
      limit: 100,
    });
    return rows.map(toStrategySummary);
  }

  async createBrand(scope: StaffScope, input: CreateMiBrandRequest): Promise<MiBrandSummary> {
    const [created] = await this.deps.db
      .insert(miBrands)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        brandKey: input.brandKey.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'brand_created', 'mi_brand', created!.id);
    return toBrandSummary(created!);
  }

  async listBrands(companyId: string): Promise<MiBrandSummary[]> {
    const rows = await this.deps.db.query.miBrands.findMany({
      where: eq(miBrands.companyId, companyId),
      orderBy: [desc(miBrands.createdAt)],
      limit: 100,
    });
    return rows.map(toBrandSummary);
  }

  async createBrandAsset(
    scope: StaffScope,
    input: {
      brandId: string;
      assetType: string;
      name: string;
      assetKey: string;
      fileUrl?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<MiBrandAssetSummary> {
    if (input.brandId) await this.ensureBrand(scope.companyId, input.brandId);
    const [created] = await this.deps.db
      .insert(miBrandAssets)
      .values({
        companyId: scope.companyId,
        brandId: input.brandId,
        assetType: input.assetType.trim(),
        name: input.name.trim(),
        assetKey: input.assetKey.trim(),
        fileUrl: input.fileUrl?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'brand_asset_created', 'mi_brand_asset', created!.id);
    return toBrandAssetSummary(created!);
  }

  async listBrandAssets(companyId: string): Promise<MiBrandAssetSummary[]> {
    const rows = await this.deps.db.query.miBrandAssets.findMany({
      where: eq(miBrandAssets.companyId, companyId),
      orderBy: [desc(miBrandAssets.createdAt)],
      limit: 100,
    });
    return rows.map(toBrandAssetSummary);
  }

  async createAudience(
    scope: StaffScope,
    input: CreateMiAudienceRequest,
  ): Promise<MiAudienceSummary> {
    const [created] = await this.deps.db
      .insert(miAudiences)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        audienceKey: input.audienceKey.trim(),
        audienceType: input.audienceType?.trim() ?? null,
        criteria: input.criteria ?? {},
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'audience_created', 'mi_audience', created!.id);
    return toAudienceSummary(created!);
  }

  async listAudiences(companyId: string): Promise<MiAudienceSummary[]> {
    const rows = await this.deps.db.query.miAudiences.findMany({
      where: eq(miAudiences.companyId, companyId),
      orderBy: [desc(miAudiences.createdAt)],
      limit: 100,
    });
    return rows.map(toAudienceSummary);
  }

  async createSuppressionList(
    scope: StaffScope,
    input: { name: string; listKey: string; listType?: string; config?: Record<string, unknown> },
  ): Promise<MiSuppressionListSummary> {
    const [created] = await this.deps.db
      .insert(miSuppressionLists)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        listKey: input.listKey.trim(),
        listType: input.listType?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'suppression_list_created', 'mi_suppression_list', created!.id);
    return toSuppressionListSummary(created!);
  }

  async listSuppressionLists(companyId: string): Promise<MiSuppressionListSummary[]> {
    const rows = await this.deps.db.query.miSuppressionLists.findMany({
      where: eq(miSuppressionLists.companyId, companyId),
      orderBy: [desc(miSuppressionLists.createdAt)],
      limit: 100,
    });
    return rows.map(toSuppressionListSummary);
  }

  async createCampaignPlan(
    scope: StaffScope,
    input: CreateMiCampaignPlanRequest,
  ): Promise<MiCampaignPlanSummary> {
    if (input.strategyId) await this.ensureStrategy(scope.companyId, input.strategyId);
    if (input.brandId) await this.ensureBrand(scope.companyId, input.brandId);
    if (input.audienceId) await this.ensureAudience(scope.companyId, input.audienceId);
    const [created] = await this.deps.db
      .insert(miCampaignPlans)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        planKey: input.planKey.trim(),
        strategyId: input.strategyId ?? null,
        brandId: input.brandId ?? null,
        audienceId: input.audienceId ?? null,
        ownerUserId: scope.userId,
        budgetCents: input.budgetCents ?? null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        config: input.config ?? {},
        lifecycleStatus: 'draft',
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'campaign_plan_created', 'mi_campaign_plan', created!.id);
    return toCampaignPlanSummary(created!);
  }

  async listCampaignPlans(companyId: string): Promise<MiCampaignPlanSummary[]> {
    const rows = await this.deps.db.query.miCampaignPlans.findMany({
      where: eq(miCampaignPlans.companyId, companyId),
      orderBy: [desc(miCampaignPlans.createdAt)],
      limit: 100,
    });
    return rows.map(toCampaignPlanSummary);
  }

  async createContentItem(
    scope: StaffScope,
    input: CreateMiContentItemRequest,
  ): Promise<MiContentItemSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miContentItems)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        title: input.title.trim(),
        contentType: input.contentType.trim(),
        body: input.body?.trim() ?? null,
        ownerUserId: scope.userId,
        config: input.config ?? {},
        contentStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'content_item_created', 'mi_content_item', created!.id);
    return toContentItemSummary(created!);
  }

  async listContentItems(companyId: string): Promise<MiContentItemSummary[]> {
    const rows = await this.deps.db.query.miContentItems.findMany({
      where: eq(miContentItems.companyId, companyId),
      orderBy: [desc(miContentItems.createdAt)],
      limit: 100,
    });
    return rows.map(toContentItemSummary);
  }

  async createCreativeRequest(
    scope: StaffScope,
    input: CreateMiCreativeRequestRequest,
  ): Promise<MiCreativeRequestSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miCreativeRequests)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        title: input.title.trim(),
        requestType: input.requestType.trim(),
        brief: input.brief?.trim() ?? null,
        requestedByUserId: scope.userId,
        config: input.config ?? {},
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'creative_request_created', 'mi_creative_request', created!.id);
    return toCreativeRequestSummary(created!);
  }

  async listCreativeRequests(companyId: string): Promise<MiCreativeRequestSummary[]> {
    const rows = await this.deps.db.query.miCreativeRequests.findMany({
      where: eq(miCreativeRequests.companyId, companyId),
      orderBy: [desc(miCreativeRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toCreativeRequestSummary);
  }

  async createSocialAccount(
    scope: StaffScope,
    input: CreateMiSocialAccountRequest,
  ): Promise<MiSocialAccountSummary> {
    if (input.brandId) await this.ensureBrand(scope.companyId, input.brandId);
    const [created] = await this.deps.db
      .insert(miSocialAccounts)
      .values({
        companyId: scope.companyId,
        brandId: input.brandId ?? null,
        providerType: input.providerType as typeof miSocialAccounts.$inferInsert.providerType,
        accountName: input.accountName.trim(),
        accountHandle: input.accountHandle?.trim() ?? null,
        externalId: input.externalId?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'social_account_created', 'mi_social_account', created!.id);
    return toSocialAccountSummary(created!);
  }

  async listSocialAccounts(companyId: string): Promise<MiSocialAccountSummary[]> {
    const rows = await this.deps.db.query.miSocialAccounts.findMany({
      where: eq(miSocialAccounts.companyId, companyId),
      orderBy: [desc(miSocialAccounts.createdAt)],
      limit: 100,
    });
    return rows.map(toSocialAccountSummary);
  }

  async createSocialPost(
    scope: StaffScope,
    input: CreateMiSocialPostRequest,
  ): Promise<MiSocialPostSummary> {
    if (input.socialAccountId)
      await this.ensureSocialAccount(scope.companyId, input.socialAccountId);
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miSocialPosts)
      .values({
        companyId: scope.companyId,
        socialAccountId: input.socialAccountId ?? null,
        campaignPlanId: input.campaignPlanId ?? null,
        title: input.title?.trim() ?? null,
        body: input.body.trim(),
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        config: input.config ?? {},
        contentStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'social_post_created', 'mi_social_post', created!.id);
    return toSocialPostSummary(created!);
  }

  async listSocialPosts(companyId: string): Promise<MiSocialPostSummary[]> {
    const rows = await this.deps.db.query.miSocialPosts.findMany({
      where: eq(miSocialPosts.companyId, companyId),
      orderBy: [desc(miSocialPosts.createdAt)],
      limit: 100,
    });
    return rows.map(toSocialPostSummary);
  }

  async createReview(
    scope: StaffScope,
    input: {
      platform: string;
      rating?: number;
      reviewText?: string;
      author?: string;
      reviewedAt?: string;
    },
  ): Promise<MiReviewSummary> {
    const [created] = await this.deps.db
      .insert(miReviews)
      .values({
        companyId: scope.companyId,
        platform: input.platform.trim(),
        rating: input.rating != null ? String(input.rating) : null,
        reviewText: input.reviewText?.trim() ?? null,
        author: input.author?.trim() ?? null,
        reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'review_created', 'mi_review', created!.id);
    return toReviewSummary(created!);
  }

  async listReviews(companyId: string): Promise<MiReviewSummary[]> {
    const rows = await this.deps.db.query.miReviews.findMany({
      where: eq(miReviews.companyId, companyId),
      orderBy: [desc(miReviews.createdAt)],
      limit: 100,
    });
    return rows.map(toReviewSummary);
  }

  async createAdAccount(
    scope: StaffScope,
    input: CreateMiAdAccountRequest,
  ): Promise<MiAdAccountSummary> {
    const [created] = await this.deps.db
      .insert(miAdAccounts)
      .values({
        companyId: scope.companyId,
        providerType: input.providerType as typeof miAdAccounts.$inferInsert.providerType,
        name: input.name.trim(),
        externalAccountId: input.externalAccountId?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'ad_account_created', 'mi_ad_account', created!.id);
    return toAdAccountSummary(created!);
  }

  async listAdAccounts(companyId: string): Promise<MiAdAccountSummary[]> {
    const rows = await this.deps.db.query.miAdAccounts.findMany({
      where: eq(miAdAccounts.companyId, companyId),
      orderBy: [desc(miAdAccounts.createdAt)],
      limit: 100,
    });
    return rows.map(toAdAccountSummary);
  }

  async createAdCampaign(
    scope: StaffScope,
    input: CreateMiAdCampaignRequest,
  ): Promise<MiAdCampaignSummary> {
    if (input.adAccountId) await this.ensureAdAccount(scope.companyId, input.adAccountId);
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miAdCampaigns)
      .values({
        companyId: scope.companyId,
        adAccountId: input.adAccountId ?? null,
        campaignPlanId: input.campaignPlanId ?? null,
        name: input.name.trim(),
        budgetCents: input.budgetCents ?? null,
        config: input.config ?? {},
        lifecycleStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'ad_campaign_created', 'mi_ad_campaign', created!.id);
    return toAdCampaignSummary(created!);
  }

  async listAdCampaigns(companyId: string): Promise<MiAdCampaignSummary[]> {
    const rows = await this.deps.db.query.miAdCampaigns.findMany({
      where: eq(miAdCampaigns.companyId, companyId),
      orderBy: [desc(miAdCampaigns.createdAt)],
      limit: 100,
    });
    return rows.map(toAdCampaignSummary);
  }

  async createAdBudget(
    scope: StaffScope,
    input: {
      adCampaignId: string;
      budgetType: string;
      amountCents?: number;
      periodStart?: string;
      periodEnd?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<MiAdBudgetSummary> {
    if (input.adCampaignId) await this.ensureAdCampaign(scope.companyId, input.adCampaignId);
    const [created] = await this.deps.db
      .insert(miAdBudgets)
      .values({
        companyId: scope.companyId,
        adCampaignId: input.adCampaignId,
        budgetType: input.budgetType.trim(),
        amountCents: input.amountCents ?? 0,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'ad_budget_created', 'mi_ad_budget', created!.id);
    return toAdBudgetSummary(created!);
  }

  async listAdBudgets(companyId: string): Promise<MiAdBudgetSummary[]> {
    const rows = await this.deps.db.query.miAdBudgets.findMany({
      where: eq(miAdBudgets.companyId, companyId),
      orderBy: [desc(miAdBudgets.createdAt)],
      limit: 100,
    });
    return rows.map(toAdBudgetSummary);
  }

  async createSeoKeyword(
    scope: StaffScope,
    input: {
      keyword: string;
      searchVolume?: number;
      difficulty?: number;
      currentRank?: number;
      targetUrl?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<MiSeoKeywordSummary> {
    const [created] = await this.deps.db
      .insert(miSeoKeywords)
      .values({
        companyId: scope.companyId,
        keyword: input.keyword.trim(),
        searchVolume: input.searchVolume ?? null,
        difficulty: input.difficulty != null ? String(input.difficulty) : null,
        currentRank: input.currentRank ?? null,
        targetUrl: input.targetUrl?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'seo_keyword_created', 'mi_seo_keyword', created!.id);
    return toSeoKeywordSummary(created!);
  }

  async listSeoKeywords(companyId: string): Promise<MiSeoKeywordSummary[]> {
    const rows = await this.deps.db.query.miSeoKeywords.findMany({
      where: eq(miSeoKeywords.companyId, companyId),
      orderBy: [desc(miSeoKeywords.createdAt)],
      limit: 100,
    });
    return rows.map(toSeoKeywordSummary);
  }

  async createLocalPresenceProfile(
    scope: StaffScope,
    input: {
      name: string;
      locationKey: string;
      address?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<MiLocalPresenceProfileSummary> {
    const [created] = await this.deps.db
      .insert(miLocalPresenceProfiles)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        locationKey: input.locationKey.trim(),
        address: input.address?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(
      scope,
      'local_presence_created',
      'mi_local_presence_profile',
      created!.id,
    );
    return toLocalPresenceProfileSummary(created!);
  }

  async listLocalPresenceProfiles(companyId: string): Promise<MiLocalPresenceProfileSummary[]> {
    const rows = await this.deps.db.query.miLocalPresenceProfiles.findMany({
      where: eq(miLocalPresenceProfiles.companyId, companyId),
      orderBy: [desc(miLocalPresenceProfiles.createdAt)],
      limit: 100,
    });
    return rows.map(toLocalPresenceProfileSummary);
  }

  async createWebsite(
    scope: StaffScope,
    input: { name: string; domain: string; config?: Record<string, unknown> },
  ): Promise<MiWebsiteSummary> {
    const [created] = await this.deps.db
      .insert(miWebsites)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        domain: input.domain.trim(),
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'website_created', 'mi_website', created!.id);
    return toWebsiteSummary(created!);
  }

  async listWebsites(companyId: string): Promise<MiWebsiteSummary[]> {
    const rows = await this.deps.db.query.miWebsites.findMany({
      where: eq(miWebsites.companyId, companyId),
      orderBy: [desc(miWebsites.createdAt)],
      limit: 100,
    });
    return rows.map(toWebsiteSummary);
  }

  async createLandingPage(
    scope: StaffScope,
    input: CreateMiLandingPageRequest,
  ): Promise<MiLandingPageSummary> {
    if (input.websiteId) await this.ensureWebsite(scope.companyId, input.websiteId);
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miLandingPages)
      .values({
        companyId: scope.companyId,
        websiteId: input.websiteId ?? null,
        campaignPlanId: input.campaignPlanId ?? null,
        title: input.title.trim(),
        slug: input.slug.trim(),
        config: input.config ?? {},
        contentStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'landing_page_created', 'mi_landing_page', created!.id);
    return toLandingPageSummary(created!);
  }

  async listLandingPages(companyId: string): Promise<MiLandingPageSummary[]> {
    const rows = await this.deps.db.query.miLandingPages.findMany({
      where: eq(miLandingPages.companyId, companyId),
      orderBy: [desc(miLandingPages.createdAt)],
      limit: 100,
    });
    return rows.map(toLandingPageSummary);
  }

  async createEmailCampaign(
    scope: StaffScope,
    input: CreateMiEmailCampaignRequest,
  ): Promise<MiEmailCampaignSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miEmailCampaigns)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        name: input.name.trim(),
        subject: input.subject?.trim() ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        config: input.config ?? {},
        contentStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'email_campaign_created', 'mi_email_campaign', created!.id);
    return toEmailCampaignSummary(created!);
  }

  async listEmailCampaigns(companyId: string): Promise<MiEmailCampaignSummary[]> {
    const rows = await this.deps.db.query.miEmailCampaigns.findMany({
      where: eq(miEmailCampaigns.companyId, companyId),
      orderBy: [desc(miEmailCampaigns.createdAt)],
      limit: 100,
    });
    return rows.map(toEmailCampaignSummary);
  }

  async createMessagingCampaign(
    scope: StaffScope,
    input: CreateMiMessagingCampaignRequest,
  ): Promise<MiMessagingCampaignSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miMessagingCampaigns)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        name: input.name.trim(),
        channel: input.channel.trim(),
        config: input.config ?? {},
        contentStatus: 'draft',
      })
      .returning();

    await this.recordAudit(
      scope,
      'messaging_campaign_created',
      'mi_messaging_campaign',
      created!.id,
    );
    return toMessagingCampaignSummary(created!);
  }

  async listMessagingCampaigns(companyId: string): Promise<MiMessagingCampaignSummary[]> {
    const rows = await this.deps.db.query.miMessagingCampaigns.findMany({
      where: eq(miMessagingCampaigns.companyId, companyId),
      orderBy: [desc(miMessagingCampaigns.createdAt)],
      limit: 100,
    });
    return rows.map(toMessagingCampaignSummary);
  }

  async createCustomerJourney(
    scope: StaffScope,
    input: { name: string; journeyKey: string; config?: Record<string, unknown> },
  ): Promise<MiCustomerJourneySummary> {
    const [created] = await this.deps.db
      .insert(miCustomerJourneys)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        journeyKey: input.journeyKey.trim(),
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'customer_journey_created', 'mi_customer_journey', created!.id);
    return toCustomerJourneySummary(created!);
  }

  async listCustomerJourneys(companyId: string): Promise<MiCustomerJourneySummary[]> {
    const rows = await this.deps.db.query.miCustomerJourneys.findMany({
      where: eq(miCustomerJourneys.companyId, companyId),
      orderBy: [desc(miCustomerJourneys.createdAt)],
      limit: 100,
    });
    return rows.map(toCustomerJourneySummary);
  }

  async createAttributionRecord(
    scope: StaffScope,
    input: {
      campaignPlanId?: string;
      channel: string;
      touchpointType?: string;
      attributedValueCents?: number;
      config?: Record<string, unknown>;
    },
  ): Promise<MiAttributionRecordSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miAttributionRecords)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        channel: input.channel.trim(),
        touchpointType: input.touchpointType?.trim() ?? null,
        attributedValueCents: input.attributedValueCents ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(
      scope,
      'attribution_record_created',
      'mi_attribution_record',
      created!.id,
    );
    return toAttributionRecordSummary(created!);
  }

  async listAttributionRecords(companyId: string): Promise<MiAttributionRecordSummary[]> {
    const rows = await this.deps.db.query.miAttributionRecords.findMany({
      where: eq(miAttributionRecords.companyId, companyId),
      orderBy: [desc(miAttributionRecords.capturedAt)],
      limit: 100,
    });
    return rows.map(toAttributionRecordSummary);
  }

  async createReferralCampaign(
    scope: StaffScope,
    input: { name: string; campaignKey: string; config?: Record<string, unknown> },
  ): Promise<MiReferralCampaignSummary> {
    const [created] = await this.deps.db
      .insert(miReferralCampaigns)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        campaignKey: input.campaignKey.trim(),
        config: input.config ?? {},
        lifecycleStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'referral_campaign_created', 'mi_referral_campaign', created!.id);
    return toReferralCampaignSummary(created!);
  }

  async listReferralCampaigns(companyId: string): Promise<MiReferralCampaignSummary[]> {
    const rows = await this.deps.db.query.miReferralCampaigns.findMany({
      where: eq(miReferralCampaigns.companyId, companyId),
      orderBy: [desc(miReferralCampaigns.createdAt)],
      limit: 100,
    });
    return rows.map(toReferralCampaignSummary);
  }

  async createCalendarEvent(
    scope: StaffScope,
    input: {
      campaignPlanId?: string;
      title: string;
      eventType?: string;
      startsAt: string;
      endsAt?: string;
      config?: Record<string, unknown>;
    },
  ): Promise<MiCalendarEventSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miCalendarEvents)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        title: input.title.trim(),
        eventType: input.eventType?.trim() ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'calendar_event_created', 'mi_calendar_event', created!.id);
    return toCalendarEventSummary(created!);
  }

  async listCalendarEvents(companyId: string): Promise<MiCalendarEventSummary[]> {
    const rows = await this.deps.db.query.miCalendarEvents.findMany({
      where: eq(miCalendarEvents.companyId, companyId),
      orderBy: [desc(miCalendarEvents.createdAt)],
      limit: 100,
    });
    return rows.map(toCalendarEventSummary);
  }

  async createExperiment(
    scope: StaffScope,
    input: CreateMiExperimentRequest,
  ): Promise<MiExperimentSummary> {
    const [created] = await this.deps.db
      .insert(miExperiments)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        experimentKey: input.experimentKey.trim(),
        experimentType: input.experimentType?.trim() ?? null,
        config: input.config ?? {},
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'experiment_created', 'mi_experiment', created!.id);
    return toExperimentSummary(created!);
  }

  async listExperiments(companyId: string): Promise<MiExperimentSummary[]> {
    const rows = await this.deps.db.query.miExperiments.findMany({
      where: eq(miExperiments.companyId, companyId),
      orderBy: [desc(miExperiments.createdAt)],
      limit: 100,
    });
    return rows.map(toExperimentSummary);
  }

  async createMarketIntelligenceRecord(
    scope: StaffScope,
    input: {
      recordType: string;
      title: string;
      source?: string;
      confidenceScore?: number;
      data?: Record<string, unknown>;
    },
  ): Promise<MiMarketIntelligenceRecordSummary> {
    const [created] = await this.deps.db
      .insert(miMarketIntelligenceRecords)
      .values({
        companyId: scope.companyId,
        recordType: input.recordType.trim(),
        title: input.title.trim(),
        source: input.source?.trim() ?? null,
        confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
        data: input.data ?? {},
      })
      .returning();

    await this.recordAudit(
      scope,
      'market_intelligence_record_created',
      'mi_market_intelligence_record',
      created!.id,
    );
    return toMarketIntelligenceRecordSummary(created!);
  }

  async listMarketIntelligenceRecords(
    companyId: string,
  ): Promise<MiMarketIntelligenceRecordSummary[]> {
    const rows = await this.deps.db.query.miMarketIntelligenceRecords.findMany({
      where: eq(miMarketIntelligenceRecords.companyId, companyId),
      orderBy: [desc(miMarketIntelligenceRecords.capturedAt)],
      limit: 100,
    });
    return rows.map(toMarketIntelligenceRecordSummary);
  }

  async createProvider(
    scope: StaffScope,
    input: CreateMiMarketingProviderRequest,
  ): Promise<MiMarketingProviderSummary> {
    const [created] = await this.deps.db
      .insert(miMarketingProviderAdapters)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        providerType:
          input.providerType as typeof miMarketingProviderAdapters.$inferInsert.providerType,
        syncDirection: input.syncDirection?.trim() ?? 'bidirectional',
        syncFrequency: input.syncFrequency?.trim() ?? null,
        fieldMappings: input.fieldMappings ?? {},
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.recordAudit(scope, 'provider_created', 'mi_marketing_provider', created!.id);
    return toProviderSummary(created!);
  }

  async listProviders(companyId: string): Promise<MiMarketingProviderSummary[]> {
    const rows = await this.deps.db.query.miMarketingProviderAdapters.findMany({
      where: eq(miMarketingProviderAdapters.companyId, companyId),
      orderBy: [desc(miMarketingProviderAdapters.createdAt)],
    });
    return rows.map(toProviderSummary);
  }

  async testMarketingProvider(
    scope: StaffScope,
    providerId: string,
  ): Promise<MiMarketingProviderSummary> {
    const provider = await this.ensureProvider(scope.companyId, providerId);
    const hasConfig = Object.keys(provider.config ?? {}).length > 0;
    const nextStatus = hasConfig ? 'testing' : provider.status;

    const [updated] = await this.deps.db
      .update(miMarketingProviderAdapters)
      .set({ status: nextStatus, lastHealthCheckAt: new Date(), updatedAt: new Date() })
      .where(eq(miMarketingProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'provider_tested', 'mi_marketing_provider', providerId);
    return toProviderSummary(updated!);
  }

  async listRoiSnapshots(companyId: string): Promise<MiRoiSnapshotSummary[]> {
    const rows = await this.deps.db.query.miRoiSnapshots.findMany({
      where: eq(miRoiSnapshots.companyId, companyId),
      orderBy: [desc(miRoiSnapshots.capturedAt)],
      limit: 100,
    });
    return rows.map(toRoiSnapshotSummary);
  }

  async createRoiSnapshot(
    scope: StaffScope,
    input: {
      campaignPlanId?: string;
      spendCents?: number;
      revenueCents?: number;
      config?: Record<string, unknown>;
    },
  ): Promise<MiRoiSnapshotSummary> {
    if (input.campaignPlanId) await this.ensureCampaignPlan(scope.companyId, input.campaignPlanId);
    const [created] = await this.deps.db
      .insert(miRoiSnapshots)
      .values({
        companyId: scope.companyId,
        campaignPlanId: input.campaignPlanId ?? null,
        spendCents: input.spendCents ?? 0,
        revenueCents: input.revenueCents ?? 0,
        roiPercent:
          input.spendCents && input.spendCents > 0 && input.revenueCents != null
            ? String(((input.revenueCents - input.spendCents) / input.spendCents) * 100)
            : null,
        config: input.config ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'roi_snapshot_created', 'mi_roi_snapshot', created!.id);
    return toRoiSnapshotSummary(created!);
  }

  async submitCampaignPlanForReview(
    scope: StaffScope,
    planId: string,
  ): Promise<MiCampaignPlanSummary> {
    const plan = await this.ensureCampaignPlan(scope.companyId, planId);
    if (plan.workflowStatus !== 'draft') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Campaign plan must be in draft to submit',
      );
    }
    const [updated] = await this.deps.db
      .update(miCampaignPlans)
      .set({ workflowStatus: 'review', updatedAt: new Date() })
      .where(eq(miCampaignPlans.id, planId))
      .returning();
    await this.recordAudit(scope, 'campaign_plan_submitted_for_review', 'mi_campaign_plan', planId);
    return toCampaignPlanSummary(updated!);
  }

  async submitCampaignPlanForApproval(
    scope: StaffScope,
    planId: string,
  ): Promise<MiCampaignPlanSummary> {
    const plan = await this.ensureCampaignPlan(scope.companyId, planId);
    if (plan.workflowStatus !== 'review') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Campaign plan must be in review to submit for approval',
      );
    }
    const [updated] = await this.deps.db
      .update(miCampaignPlans)
      .set({ workflowStatus: 'pending_approval', updatedAt: new Date() })
      .where(eq(miCampaignPlans.id, planId))
      .returning();
    await this.recordAudit(
      scope,
      'campaign_plan_submitted_for_approval',
      'mi_campaign_plan',
      planId,
    );
    return toCampaignPlanSummary(updated!);
  }

  async approveCampaignPlan(scope: StaffScope, planId: string): Promise<MiCampaignPlanSummary> {
    const plan = await this.ensureCampaignPlan(scope.companyId, planId);
    if (plan.workflowStatus !== 'pending_approval') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Campaign plan is not pending approval',
      );
    }
    const [updated] = await this.deps.db
      .update(miCampaignPlans)
      .set({ workflowStatus: 'approved', lifecycleStatus: 'scheduled', updatedAt: new Date() })
      .where(eq(miCampaignPlans.id, planId))
      .returning();
    await this.recordAudit(scope, 'campaign_plan_approved', 'mi_campaign_plan', planId);
    return toCampaignPlanSummary(updated!);
  }

  /**
   * UX-H (UX-026): live provider send/execution is out of scope. Approval remains the
   * final authorized state here — sending happens only via the marketing-eligibility
   * audience request approval flow (still never provider-delivered in this scope).
   */
  async executeCampaignPlan(scope: StaffScope, planId: string): Promise<MiCampaignPlanSummary> {
    await this.ensureCampaignPlan(scope.companyId, planId);
    throw new EnterpriseMarketingIntelligenceError(
      'SEND_PATH_NOT_IMPLEMENTED',
      'UX-H blocks live provider send for campaign execution. The campaign plan remains approved — use marketing-eligibility audience request approval instead.',
    );
  }

  async submitContentItemForReview(
    scope: StaffScope,
    contentId: string,
  ): Promise<MiContentItemSummary> {
    const item = await this.ensureContentItem(scope.companyId, contentId);
    if (item.contentStatus !== 'draft') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Content item must be in draft to submit',
      );
    }
    const [updated] = await this.deps.db
      .update(miContentItems)
      .set({ contentStatus: 'review', updatedAt: new Date() })
      .where(eq(miContentItems.id, contentId))
      .returning();
    await this.recordAudit(
      scope,
      'content_item_submitted_for_review',
      'mi_content_item',
      contentId,
    );
    return toContentItemSummary(updated!);
  }

  async approveContentItem(scope: StaffScope, contentId: string): Promise<MiContentItemSummary> {
    const item = await this.ensureContentItem(scope.companyId, contentId);
    if (item.contentStatus !== 'review') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Content item is not in review',
      );
    }
    const [updated] = await this.deps.db
      .update(miContentItems)
      .set({ contentStatus: 'approved', updatedAt: new Date() })
      .where(eq(miContentItems.id, contentId))
      .returning();
    await this.recordAudit(scope, 'content_item_approved', 'mi_content_item', contentId);
    return toContentItemSummary(updated!);
  }

  async submitSocialPostForReview(scope: StaffScope, postId: string): Promise<MiSocialPostSummary> {
    const post = await this.ensureSocialPost(scope.companyId, postId);
    if (post.contentStatus !== 'draft') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Social post must be in draft to submit',
      );
    }
    const [updated] = await this.deps.db
      .update(miSocialPosts)
      .set({ contentStatus: 'review', updatedAt: new Date() })
      .where(eq(miSocialPosts.id, postId))
      .returning();
    await this.recordAudit(scope, 'social_post_submitted_for_review', 'mi_social_post', postId);
    return toSocialPostSummary(updated!);
  }

  async approveSocialPost(scope: StaffScope, postId: string): Promise<MiSocialPostSummary> {
    const post = await this.ensureSocialPost(scope.companyId, postId);
    if (post.contentStatus !== 'review') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Social post is not in review',
      );
    }
    const [updated] = await this.deps.db
      .update(miSocialPosts)
      .set({ contentStatus: 'approved', updatedAt: new Date() })
      .where(eq(miSocialPosts.id, postId))
      .returning();
    await this.recordAudit(scope, 'social_post_approved', 'mi_social_post', postId);
    return toSocialPostSummary(updated!);
  }

  /** UX-H (UX-026): no live publish path. Post remains approved, never fake-published. */
  async executeSocialPost(scope: StaffScope, postId: string): Promise<MiSocialPostSummary> {
    await this.ensureSocialPost(scope.companyId, postId);
    throw new EnterpriseMarketingIntelligenceError(
      'SEND_PATH_NOT_IMPLEMENTED',
      'UX-H blocks live provider send for social post publishing. The post remains approved — use marketing-eligibility audience request approval instead.',
    );
  }

  async submitEmailCampaignForReview(
    scope: StaffScope,
    campaignId: string,
  ): Promise<MiEmailCampaignSummary> {
    const campaign = await this.ensureEmailCampaign(scope.companyId, campaignId);
    if (campaign.contentStatus !== 'draft') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Email campaign must be in draft to submit',
      );
    }
    const [updated] = await this.deps.db
      .update(miEmailCampaigns)
      .set({ contentStatus: 'review', updatedAt: new Date() })
      .where(eq(miEmailCampaigns.id, campaignId))
      .returning();
    await this.recordAudit(
      scope,
      'email_campaign_submitted_for_review',
      'mi_email_campaign',
      campaignId,
    );
    return toEmailCampaignSummary(updated!);
  }

  async approveEmailCampaign(
    scope: StaffScope,
    campaignId: string,
  ): Promise<MiEmailCampaignSummary> {
    const campaign = await this.ensureEmailCampaign(scope.companyId, campaignId);
    if (campaign.contentStatus !== 'review') {
      throw new EnterpriseMarketingIntelligenceError(
        'VALIDATION_ERROR',
        'Email campaign is not in review',
      );
    }
    const [updated] = await this.deps.db
      .update(miEmailCampaigns)
      .set({ contentStatus: 'approved', updatedAt: new Date() })
      .where(eq(miEmailCampaigns.id, campaignId))
      .returning();
    await this.recordAudit(scope, 'email_campaign_approved', 'mi_email_campaign', campaignId);
    return toEmailCampaignSummary(updated!);
  }

  /** UX-H (UX-026): no live send path. Campaign remains approved, never fake-sent. */
  async executeEmailCampaign(
    scope: StaffScope,
    campaignId: string,
  ): Promise<MiEmailCampaignSummary> {
    await this.ensureEmailCampaign(scope.companyId, campaignId);
    throw new EnterpriseMarketingIntelligenceError(
      'SEND_PATH_NOT_IMPLEMENTED',
      'UX-H blocks live provider send for email campaigns. The campaign remains approved — use marketing-eligibility audience request approval instead.',
    );
  }

  async submitReviewResponse(
    scope: StaffScope,
    input: CreateMiReviewResponseRequest,
  ): Promise<MiReviewSummary> {
    const review = await this.ensureReview(scope.companyId, input.reviewId);
    const [updated] = await this.deps.db
      .update(miReviews)
      .set({
        responseText: input.responseText.trim(),
        workflowStatus: 'pending_approval',
        updatedAt: new Date(),
      })
      .where(eq(miReviews.id, input.reviewId))
      .returning();
    await this.recordAudit(scope, 'review_response_submitted', 'mi_review', review.id);
    return toReviewSummary(updated!);
  }

  async listMarketingAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<MiMarketingAlertSummary[]> {
    const conditions = [eq(miMarketingAlerts.companyId, companyId)];
    if (filters?.status) {
      conditions.push(
        eq(
          miMarketingAlerts.status,
          filters.status as typeof miMarketingAlerts.$inferSelect.status,
        ),
      );
    }
    const rows = await this.deps.db.query.miMarketingAlerts.findMany({
      where: and(...conditions),
      orderBy: [desc(miMarketingAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toMarketingAlertSummary);
  }

  async syncMarketingAlerts(scope: StaffScope): Promise<MiMarketingAlertSummary[]> {
    const monitoring = await this.getCampaignMonitoring(scope.companyId);
    const existingOpen = await this.listMarketingAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();

    const alertDefinitions = [
      {
        alertType: 'pending_review',
        severity: 'warning',
        title: 'Pending review items',
        description: `${monitoring.pendingReviewCount} marketing item(s) awaiting review.`,
        active: monitoring.pendingReviewCount > 0,
      },
      {
        alertType: 'overdue_content',
        severity: 'warning',
        title: 'Overdue scheduled content',
        description: `${monitoring.overdueContentCount} scheduled content item(s) are overdue.`,
        active: monitoring.overdueContentCount > 0,
      },
      {
        alertType: 'budget_overspend',
        severity: 'critical',
        title: 'Budget threshold exceeded',
        description: `${monitoring.budgetOverspendCount} campaign plan(s) near or over budget.`,
        active: monitoring.budgetOverspendCount > 0,
      },
      {
        alertType: 'provider_sync_failure',
        severity: 'critical',
        title: 'Marketing provider sync failure',
        description: `${monitoring.adapterSyncFailureCount} marketing provider(s) in error state.`,
        active: monitoring.adapterSyncFailureCount > 0,
      },
      {
        alertType: 'unscheduled_campaign',
        severity: 'warning',
        title: 'Unscheduled approved campaigns',
        description: `${monitoring.unscheduledCampaignCount} approved campaign plan(s) not scheduled.`,
        active: monitoring.unscheduledCampaignCount > 0,
      },
    ] as const;

    for (const definition of alertDefinitions) {
      const existing = existingOpen.find((row) => row.alertType === definition.alertType);
      if (definition.active && !existing) {
        await this.deps.db.insert(miMarketingAlerts).values({
          companyId: scope.companyId,
          alertType: definition.alertType,
          severity: definition.severity,
          status: 'open',
          title: definition.title,
          description: definition.description,
          sourceModule: 'marketing_intelligence',
          context: { syncedAt: syncedAt.toISOString(), monitoring },
        });
      } else if (!definition.active && existing) {
        await this.deps.db
          .update(miMarketingAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(miMarketingAlerts.id, existing.id));
      }
    }

    await this.recordAudit(scope, 'marketing_alerts_synced');
    return this.listMarketingAlerts(scope.companyId, { status: 'open' });
  }

  async createMarketingActionDraft(
    scope: StaffScope,
    input: CreateMiMarketingActionDraftRequest,
  ): Promise<{ id: string; title: string; draftType: string; workflowStatus: string }> {
    const [created] = await this.deps.db
      .insert(miMarketingActionDrafts)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        workflowStatus: 'draft',
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        requiresHumanReview: true,
      })
      .returning();

    await this.recordAudit(
      scope,
      'marketing_draft_created',
      'mi_marketing_action_draft',
      created!.id,
    );
    return {
      id: created!.id,
      title: created!.title,
      draftType: created!.draftType,
      workflowStatus: created!.workflowStatus,
    };
  }

  async captureAnalytics(scope: StaffScope): Promise<MiAnalyticsSummary> {
    const [dashboard, monitoring, legacyCampaigns, socialPosts, emailCampaigns, roiSnapshots] =
      await Promise.all([
        this.getDashboard(scope.companyId),
        this.getCampaignMonitoring(scope.companyId),
        this.deps.marketingService.listCampaigns(scope.companyId),
        this.listSocialPosts(scope.companyId),
        this.listEmailCampaigns(scope.companyId),
        this.listRoiSnapshots(scope.companyId),
      ]);

    const scheduledContentCount =
      socialPosts.filter(
        (row) => row.contentStatus === 'scheduled' || row.contentStatus === 'approved',
      ).length +
      emailCampaigns.filter(
        (row) => row.contentStatus === 'scheduled' || row.contentStatus === 'approved',
      ).length;

    const totalSpendCents = roiSnapshots.reduce((sum, row) => sum + row.spendCents, 0);
    const attributedRevenueCents = roiSnapshots.reduce((sum, row) => sum + row.revenueCents, 0);

    const [created] = await this.deps.db
      .insert(miAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        activeCampaignCount:
          dashboard.activeCampaignPlanCount +
          legacyCampaigns.filter((row) => row.status === 'active').length,
        scheduledContentCount,
        openAlertCount: dashboard.openAlertCount,
        totalSpendCents,
        attributedRevenueCents,
        socialPostCount: socialPosts.length,
        emailCampaignCount: emailCampaigns.length,
        currency: dashboard.currency,
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured', undefined, undefined, { monitoring });
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<MiAnalyticsSummary | null> {
    const row = await this.deps.db.query.miAnalyticsSnapshots.findFirst({
      where: eq(miAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(miAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseMarketingIntelligenceAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    const roiSnapshots = await this.listRoiSnapshots(companyId);
    const totalSpendCents = roiSnapshots.reduce((sum, row) => sum + row.spendCents, 0);
    const attributedRevenueCents = roiSnapshots.reduce((sum, row) => sum + row.revenueCents, 0);
    const scheduledContentCount =
      dashboard.recentSocialPosts.filter((row) =>
        ['scheduled', 'approved'].includes(row.contentStatus),
      ).length +
      dashboard.recentEmailCampaigns.filter((row) =>
        ['scheduled', 'approved'].includes(row.contentStatus),
      ).length;

    return {
      activeCampaignCount: dashboard.activeCampaignPlanCount,
      scheduledContentCount,
      openAlertCount: dashboard.openAlertCount,
      totalSpendCents,
      attributedRevenueCents,
      summary: dashboard.summary,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.miPlatformConfig.findFirst({
      where: eq(miPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(miPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureStrategy(companyId: string, strategyId: string) {
    const row = await this.deps.db.query.miMarketingStrategies.findFirst({
      where: and(
        eq(miMarketingStrategies.companyId, companyId),
        eq(miMarketingStrategies.id, strategyId),
      ),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Strategy not found');
    return row;
  }

  private async ensureBrand(companyId: string, brandId: string) {
    const row = await this.deps.db.query.miBrands.findFirst({
      where: and(eq(miBrands.companyId, companyId), eq(miBrands.id, brandId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Brand not found');
    return row;
  }

  private async ensureAudience(companyId: string, audienceId: string) {
    const row = await this.deps.db.query.miAudiences.findFirst({
      where: and(eq(miAudiences.companyId, companyId), eq(miAudiences.id, audienceId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Audience not found');
    return row;
  }

  private async ensureCampaignPlan(companyId: string, planId: string) {
    const row = await this.deps.db.query.miCampaignPlans.findFirst({
      where: and(eq(miCampaignPlans.companyId, companyId), eq(miCampaignPlans.id, planId)),
    });
    if (!row)
      throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Campaign plan not found');
    return row;
  }

  private async ensureContentItem(companyId: string, contentId: string) {
    const row = await this.deps.db.query.miContentItems.findFirst({
      where: and(eq(miContentItems.companyId, companyId), eq(miContentItems.id, contentId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Content item not found');
    return row;
  }

  private async ensureSocialAccount(companyId: string, accountId: string) {
    const row = await this.deps.db.query.miSocialAccounts.findFirst({
      where: and(eq(miSocialAccounts.companyId, companyId), eq(miSocialAccounts.id, accountId)),
    });
    if (!row)
      throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Social account not found');
    return row;
  }

  private async ensureSocialPost(companyId: string, postId: string) {
    const row = await this.deps.db.query.miSocialPosts.findFirst({
      where: and(eq(miSocialPosts.companyId, companyId), eq(miSocialPosts.id, postId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Social post not found');
    return row;
  }

  private async ensureReview(companyId: string, reviewId: string) {
    const row = await this.deps.db.query.miReviews.findFirst({
      where: and(eq(miReviews.companyId, companyId), eq(miReviews.id, reviewId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Review not found');
    return row;
  }

  private async ensureAdAccount(companyId: string, accountId: string) {
    const row = await this.deps.db.query.miAdAccounts.findFirst({
      where: and(eq(miAdAccounts.companyId, companyId), eq(miAdAccounts.id, accountId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Ad account not found');
    return row;
  }

  private async ensureAdCampaign(companyId: string, campaignId: string) {
    const row = await this.deps.db.query.miAdCampaigns.findFirst({
      where: and(eq(miAdCampaigns.companyId, companyId), eq(miAdCampaigns.id, campaignId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Ad campaign not found');
    return row;
  }

  private async ensureEmailCampaign(companyId: string, campaignId: string) {
    const row = await this.deps.db.query.miEmailCampaigns.findFirst({
      where: and(eq(miEmailCampaigns.companyId, companyId), eq(miEmailCampaigns.id, campaignId)),
    });
    if (!row)
      throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Email campaign not found');
    return row;
  }

  private async ensureWebsite(companyId: string, websiteId: string) {
    const row = await this.deps.db.query.miWebsites.findFirst({
      where: and(eq(miWebsites.companyId, companyId), eq(miWebsites.id, websiteId)),
    });
    if (!row) throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Website not found');
    return row;
  }

  private async ensureProvider(companyId: string, providerId: string) {
    const row = await this.deps.db.query.miMarketingProviderAdapters.findFirst({
      where: and(
        eq(miMarketingProviderAdapters.companyId, companyId),
        eq(miMarketingProviderAdapters.id, providerId),
      ),
    });
    if (!row)
      throw new EnterpriseMarketingIntelligenceError('NOT_FOUND', 'Marketing provider not found');
    return row;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(miAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(
  row: typeof miPlatformConfig.$inferSelect,
): MiPlatformConfigSummary {
  return {
    marketingStandards: row.marketingStandards,
    providerAdapterTemplates: row.providerAdapterTemplates,
    brandTemplates: row.brandTemplates,
    campaignTemplates: row.campaignTemplates,
    contentTemplates: row.contentTemplates,
    attributionStandards: row.attributionStandards,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toProviderSummary(
  row: typeof miMarketingProviderAdapters.$inferSelect,
): MiMarketingProviderSummary {
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    status: row.status,
    syncDirection: row.syncDirection,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
  };
}

function toStrategySummary(
  row: typeof miMarketingStrategies.$inferSelect,
): MiMarketingStrategySummary {
  return {
    id: row.id,
    name: row.name,
    strategyKey: row.strategyKey,
    workflowStatus: row.workflowStatus,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    isActive: row.isActive,
    ownerName: null,
  };
}

function toBrandSummary(row: typeof miBrands.$inferSelect): MiBrandSummary {
  return {
    id: row.id,
    name: row.name,
    brandKey: row.brandKey,
    description: row.description,
    isActive: row.isActive,
  };
}

function toBrandAssetSummary(row: typeof miBrandAssets.$inferSelect): MiBrandAssetSummary {
  return {
    id: row.id,
    brandId: row.brandId,
    assetType: row.assetType,
    name: row.name,
    assetKey: row.assetKey,
    fileUrl: row.fileUrl,
  };
}

function toAudienceSummary(row: typeof miAudiences.$inferSelect): MiAudienceSummary {
  return {
    id: row.id,
    name: row.name,
    audienceKey: row.audienceKey,
    audienceType: row.audienceType,
    isActive: row.isActive,
  };
}

function toSuppressionListSummary(
  row: typeof miSuppressionLists.$inferSelect,
): MiSuppressionListSummary {
  return {
    id: row.id,
    name: row.name,
    listKey: row.listKey,
    listType: row.listType,
    isActive: row.isActive,
  };
}

function toCampaignPlanSummary(row: typeof miCampaignPlans.$inferSelect): MiCampaignPlanSummary {
  return {
    id: row.id,
    name: row.name,
    planKey: row.planKey,
    lifecycleStatus: row.lifecycleStatus,
    workflowStatus: row.workflowStatus,
    budgetCents: row.budgetCents,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    strategyId: row.strategyId,
    brandId: row.brandId,
    audienceId: row.audienceId,
    ownerName: null,
  };
}

function toContentItemSummary(row: typeof miContentItems.$inferSelect): MiContentItemSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    title: row.title,
    contentType: row.contentType,
    contentStatus: row.contentStatus,
    ownerUserId: row.ownerUserId,
  };
}

function toCreativeRequestSummary(
  row: typeof miCreativeRequests.$inferSelect,
): MiCreativeRequestSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    title: row.title,
    requestType: row.requestType,
    workflowStatus: row.workflowStatus,
    requestedByUserId: row.requestedByUserId,
  };
}

function toSocialAccountSummary(row: typeof miSocialAccounts.$inferSelect): MiSocialAccountSummary {
  return {
    id: row.id,
    brandId: row.brandId,
    providerType: row.providerType,
    accountName: row.accountName,
    accountHandle: row.accountHandle,
    isActive: row.isActive,
  };
}

function toSocialPostSummary(row: typeof miSocialPosts.$inferSelect): MiSocialPostSummary {
  return {
    id: row.id,
    socialAccountId: row.socialAccountId,
    campaignPlanId: row.campaignPlanId,
    title: row.title,
    contentStatus: row.contentStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toReviewSummary(row: typeof miReviews.$inferSelect): MiReviewSummary {
  return {
    id: row.id,
    platform: row.platform,
    rating: row.rating != null ? String(row.rating) : null,
    author: row.author,
    workflowStatus: row.workflowStatus,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function toAdAccountSummary(row: typeof miAdAccounts.$inferSelect): MiAdAccountSummary {
  return {
    id: row.id,
    providerType: row.providerType,
    name: row.name,
    externalAccountId: row.externalAccountId,
    isActive: row.isActive,
  };
}

function toAdCampaignSummary(row: typeof miAdCampaigns.$inferSelect): MiAdCampaignSummary {
  return {
    id: row.id,
    adAccountId: row.adAccountId,
    campaignPlanId: row.campaignPlanId,
    name: row.name,
    lifecycleStatus: row.lifecycleStatus,
    budgetCents: row.budgetCents,
  };
}

function toAdBudgetSummary(row: typeof miAdBudgets.$inferSelect): MiAdBudgetSummary {
  return {
    id: row.id,
    adCampaignId: row.adCampaignId,
    budgetType: row.budgetType,
    amountCents: row.amountCents,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
  };
}

function toSeoKeywordSummary(row: typeof miSeoKeywords.$inferSelect): MiSeoKeywordSummary {
  return {
    id: row.id,
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    difficulty: row.difficulty != null ? String(row.difficulty) : null,
    currentRank: row.currentRank,
    targetUrl: row.targetUrl,
  };
}

function toLocalPresenceProfileSummary(
  row: typeof miLocalPresenceProfiles.$inferSelect,
): MiLocalPresenceProfileSummary {
  return {
    id: row.id,
    name: row.name,
    locationKey: row.locationKey,
    address: row.address,
    isActive: row.isActive,
  };
}

function toWebsiteSummary(row: typeof miWebsites.$inferSelect): MiWebsiteSummary {
  return { id: row.id, name: row.name, domain: row.domain, isActive: row.isActive };
}

function toLandingPageSummary(row: typeof miLandingPages.$inferSelect): MiLandingPageSummary {
  return {
    id: row.id,
    websiteId: row.websiteId,
    campaignPlanId: row.campaignPlanId,
    title: row.title,
    slug: row.slug,
    contentStatus: row.contentStatus,
  };
}

function toEmailCampaignSummary(row: typeof miEmailCampaigns.$inferSelect): MiEmailCampaignSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    name: row.name,
    subject: row.subject,
    contentStatus: row.contentStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
  };
}

function toMessagingCampaignSummary(
  row: typeof miMessagingCampaigns.$inferSelect,
): MiMessagingCampaignSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    name: row.name,
    channel: row.channel,
    contentStatus: row.contentStatus,
  };
}

function toCustomerJourneySummary(
  row: typeof miCustomerJourneys.$inferSelect,
): MiCustomerJourneySummary {
  return { id: row.id, name: row.name, journeyKey: row.journeyKey, isActive: row.isActive };
}

function toAttributionRecordSummary(
  row: typeof miAttributionRecords.$inferSelect,
): MiAttributionRecordSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    channel: row.channel,
    touchpointType: row.touchpointType,
    attributedValueCents: row.attributedValueCents,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toReferralCampaignSummary(
  row: typeof miReferralCampaigns.$inferSelect,
): MiReferralCampaignSummary {
  return {
    id: row.id,
    name: row.name,
    campaignKey: row.campaignKey,
    lifecycleStatus: row.lifecycleStatus,
    isActive: row.isActive,
  };
}

function toCalendarEventSummary(row: typeof miCalendarEvents.$inferSelect): MiCalendarEventSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    title: row.title,
    eventType: row.eventType,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

function toExperimentSummary(row: typeof miExperiments.$inferSelect): MiExperimentSummary {
  return {
    id: row.id,
    name: row.name,
    experimentKey: row.experimentKey,
    experimentType: row.experimentType,
    workflowStatus: row.workflowStatus,
    isActive: row.isActive,
  };
}

function toMarketIntelligenceRecordSummary(
  row: typeof miMarketIntelligenceRecords.$inferSelect,
): MiMarketIntelligenceRecordSummary {
  return {
    id: row.id,
    recordType: row.recordType,
    title: row.title,
    source: row.source,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toMarketingAlertSummary(
  row: typeof miMarketingAlerts.$inferSelect,
): MiMarketingAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRoiSnapshotSummary(row: typeof miRoiSnapshots.$inferSelect): MiRoiSnapshotSummary {
  return {
    id: row.id,
    campaignPlanId: row.campaignPlanId,
    spendCents: row.spendCents,
    revenueCents: row.revenueCents,
    roiPercent: row.roiPercent != null ? String(row.roiPercent) : null,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof miAnalyticsSnapshots.$inferSelect): MiAnalyticsSummary {
  return {
    activeCampaignCount: row.activeCampaignCount,
    scheduledContentCount: row.scheduledContentCount,
    openAlertCount: row.openAlertCount,
    totalSpendCents: row.totalSpendCents,
    attributedRevenueCents: row.attributedRevenueCents,
    socialPostCount: row.socialPostCount,
    emailCampaignCount: row.emailCampaignCount,
    currency: row.currency,
    capturedAt: row.capturedAt.toISOString(),
  };
}
