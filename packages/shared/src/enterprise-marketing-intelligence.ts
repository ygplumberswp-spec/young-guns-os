import type { MarketingStats } from './marketing.js';

export type MiPlatformConfigSummary = {
  marketingStandards: Record<string, unknown>;
  providerAdapterTemplates: Record<string, unknown>;
  brandTemplates: Record<string, unknown>;
  campaignTemplates: Record<string, unknown>;
  contentTemplates: Record<string, unknown>;
  attributionStandards: Record<string, unknown>;
  auditRetentionDays: number;
};

export type MiMarketingProviderSummary = {
  id: string;
  name: string;
  providerType: string;
  status: string;
  syncDirection: string;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
};

export type MiMarketingStrategySummary = {
  id: string;
  name: string;
  strategyKey: string;
  workflowStatus: string;
  periodStart: string | null;
  periodEnd: string | null;
  isActive: boolean;
  ownerName: string | null;
};

export type MiBrandSummary = {
  id: string;
  name: string;
  brandKey: string;
  description: string | null;
  isActive: boolean;
};

export type MiBrandAssetSummary = {
  id: string;
  brandId: string;
  assetType: string;
  name: string;
  assetKey: string;
  fileUrl: string | null;
};

export type MiAudienceSummary = {
  id: string;
  name: string;
  audienceKey: string;
  audienceType: string | null;
  isActive: boolean;
};

export type MiSuppressionListSummary = {
  id: string;
  name: string;
  listKey: string;
  listType: string | null;
  isActive: boolean;
};

export type MiCampaignPlanSummary = {
  id: string;
  name: string;
  planKey: string;
  lifecycleStatus: string;
  workflowStatus: string;
  budgetCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  strategyId: string | null;
  brandId: string | null;
  audienceId: string | null;
  ownerName: string | null;
};

export type MiContentItemSummary = {
  id: string;
  campaignPlanId: string | null;
  title: string;
  contentType: string;
  contentStatus: string;
  ownerUserId: string | null;
};

export type MiCreativeRequestSummary = {
  id: string;
  campaignPlanId: string | null;
  title: string;
  requestType: string;
  workflowStatus: string;
  requestedByUserId: string | null;
};

export type MiSocialAccountSummary = {
  id: string;
  brandId: string | null;
  providerType: string;
  accountName: string;
  accountHandle: string | null;
  isActive: boolean;
};

export type MiSocialPostSummary = {
  id: string;
  socialAccountId: string | null;
  campaignPlanId: string | null;
  title: string | null;
  contentStatus: string;
  scheduledAt: string | null;
  publishedAt: string | null;
};

export type MiSocialMentionSummary = {
  id: string;
  socialAccountId: string | null;
  mentionType: string | null;
  author: string | null;
  sentiment: string | null;
  capturedAt: string;
};

export type MiReviewSummary = {
  id: string;
  platform: string;
  rating: string | null;
  author: string | null;
  workflowStatus: string;
  reviewedAt: string | null;
};

export type MiAdAccountSummary = {
  id: string;
  providerType: string;
  name: string;
  externalAccountId: string | null;
  isActive: boolean;
};

export type MiAdCampaignSummary = {
  id: string;
  adAccountId: string | null;
  campaignPlanId: string | null;
  name: string;
  lifecycleStatus: string;
  budgetCents: number | null;
};

export type MiAdBudgetSummary = {
  id: string;
  adCampaignId: string;
  budgetType: string;
  amountCents: number;
  periodStart: string | null;
  periodEnd: string | null;
};

export type MiSeoKeywordSummary = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: string | null;
  currentRank: number | null;
  targetUrl: string | null;
};

export type MiLocalPresenceProfileSummary = {
  id: string;
  name: string;
  locationKey: string;
  address: string | null;
  isActive: boolean;
};

export type MiWebsiteSummary = {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
};

export type MiLandingPageSummary = {
  id: string;
  websiteId: string | null;
  campaignPlanId: string | null;
  title: string;
  slug: string;
  contentStatus: string;
};

export type MiEmailCampaignSummary = {
  id: string;
  campaignPlanId: string | null;
  name: string;
  subject: string | null;
  contentStatus: string;
  scheduledAt: string | null;
};

export type MiMessagingCampaignSummary = {
  id: string;
  campaignPlanId: string | null;
  name: string;
  channel: string;
  contentStatus: string;
};

export type MiCustomerJourneySummary = {
  id: string;
  name: string;
  journeyKey: string;
  isActive: boolean;
};

export type MiAttributionRecordSummary = {
  id: string;
  campaignPlanId: string | null;
  channel: string;
  touchpointType: string | null;
  attributedValueCents: number | null;
  capturedAt: string;
};

export type MiRoiSnapshotSummary = {
  id: string;
  campaignPlanId: string | null;
  spendCents: number;
  revenueCents: number;
  roiPercent: string | null;
  capturedAt: string;
};

export type MiReferralCampaignSummary = {
  id: string;
  name: string;
  campaignKey: string;
  lifecycleStatus: string;
  isActive: boolean;
};

export type MiCalendarEventSummary = {
  id: string;
  campaignPlanId: string | null;
  title: string;
  eventType: string | null;
  startsAt: string;
  endsAt: string | null;
};

export type MiExperimentSummary = {
  id: string;
  name: string;
  experimentKey: string;
  experimentType: string | null;
  workflowStatus: string;
  isActive: boolean;
};

export type MiMarketIntelligenceRecordSummary = {
  id: string;
  recordType: string;
  title: string;
  source: string | null;
  confidenceScore: string | null;
  capturedAt: string;
};

export type MiMarketingAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type MiCampaignMonitoringSummary = {
  overdueContentCount: number;
  pendingReviewCount: number;
  budgetOverspendCount: number;
  adapterSyncFailureCount: number;
  unscheduledCampaignCount: number;
  alerts: string[];
};

export type MiAnalyticsSummary = {
  activeCampaignCount: number;
  scheduledContentCount: number;
  openAlertCount: number;
  totalSpendCents: number;
  attributedRevenueCents: number;
  socialPostCount: number;
  emailCampaignCount: number;
  currency: string;
  capturedAt: string;
};

export type EnterpriseMarketingIntelligenceDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: MiPlatformConfigSummary;
  marketingStats: MarketingStats;
  campaignPlanCount: number;
  activeCampaignPlanCount: number;
  strategyCount: number;
  brandCount: number;
  openAlertCount: number;
  providerCount: number;
  currency: string;
  analytics: MiAnalyticsSummary | null;
  campaignMonitoring: MiCampaignMonitoringSummary;
  recentStrategies: MiMarketingStrategySummary[];
  recentCampaignPlans: MiCampaignPlanSummary[];
  recentContentItems: MiContentItemSummary[];
  recentSocialPosts: MiSocialPostSummary[];
  recentEmailCampaigns: MiEmailCampaignSummary[];
  recentAlerts: MiMarketingAlertSummary[];
  recentRoiSnapshots: MiRoiSnapshotSummary[];
  recentMarketIntelligence: MiMarketIntelligenceRecordSummary[];
};

export type EnterpriseMarketingIntelligenceAuraContext = {
  activeCampaignCount: number;
  scheduledContentCount: number;
  openAlertCount: number;
  totalSpendCents: number;
  attributedRevenueCents: number;
  summary: string;
};

export type UpdateMiPlatformConfigRequest = {
  marketingStandards?: Record<string, unknown>;
  providerAdapterTemplates?: Record<string, unknown>;
  brandTemplates?: Record<string, unknown>;
  campaignTemplates?: Record<string, unknown>;
  contentTemplates?: Record<string, unknown>;
  attributionStandards?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateMiMarketingStrategyRequest = {
  name: string;
  strategyKey: string;
  periodStart?: string;
  periodEnd?: string;
  goals?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateMiBrandRequest = {
  name: string;
  brandKey: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateMiAudienceRequest = {
  name: string;
  audienceKey: string;
  audienceType?: string;
  criteria?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateMiCampaignPlanRequest = {
  name: string;
  planKey: string;
  strategyId?: string;
  brandId?: string;
  audienceId?: string;
  budgetCents?: number;
  periodStart?: string;
  periodEnd?: string;
  config?: Record<string, unknown>;
};

export type CreateMiContentItemRequest = {
  campaignPlanId?: string;
  title: string;
  contentType: string;
  body?: string;
  config?: Record<string, unknown>;
};

export type CreateMiCreativeRequestRequest = {
  campaignPlanId?: string;
  title: string;
  requestType: string;
  brief?: string;
  config?: Record<string, unknown>;
};

export type CreateMiSocialAccountRequest = {
  brandId?: string;
  providerType: string;
  accountName: string;
  accountHandle?: string;
  externalId?: string;
  config?: Record<string, unknown>;
};

export type CreateMiSocialPostRequest = {
  socialAccountId?: string;
  campaignPlanId?: string;
  title?: string;
  body: string;
  scheduledAt?: string;
  config?: Record<string, unknown>;
};

export type CreateMiAdAccountRequest = {
  providerType: string;
  name: string;
  externalAccountId?: string;
  config?: Record<string, unknown>;
};

export type CreateMiAdCampaignRequest = {
  adAccountId?: string;
  campaignPlanId?: string;
  name: string;
  budgetCents?: number;
  config?: Record<string, unknown>;
};

export type CreateMiEmailCampaignRequest = {
  campaignPlanId?: string;
  name: string;
  subject?: string;
  scheduledAt?: string;
  config?: Record<string, unknown>;
};

export type CreateMiMessagingCampaignRequest = {
  campaignPlanId?: string;
  name: string;
  channel: string;
  config?: Record<string, unknown>;
};

export type CreateMiLandingPageRequest = {
  websiteId?: string;
  campaignPlanId?: string;
  title: string;
  slug: string;
  config?: Record<string, unknown>;
};

export type CreateMiExperimentRequest = {
  name: string;
  experimentKey: string;
  experimentType?: string;
  config?: Record<string, unknown>;
};

export type CreateMiMarketingProviderRequest = {
  name: string;
  providerType: string;
  syncDirection?: string;
  syncFrequency?: string;
  fieldMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateMiMarketingActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type CreateMiReviewResponseRequest = {
  reviewId: string;
  responseText: string;
};
