export type SiPlatformConfigSummary = {
  salesStandards: Record<string, unknown>;
  providerAdapterTemplates: Record<string, unknown>;
  pipelineTemplates: Record<string, unknown>;
  playbookTemplates: Record<string, unknown>;
  targetTemplates: Record<string, unknown>;
  forecastMethodology: Record<string, unknown>;
  attributionStandards: Record<string, unknown>;
  auditRetentionDays: number;
};

export type SiSalesCategorySummary = {
  id: string;
  name: string;
  categoryKey: string;
  description: string | null;
  isActive: boolean;
};

export type SiTerritorySummary = {
  id: string;
  name: string;
  territoryKey: string;
  territoryType: string | null;
  branch: string | null;
  isActive: boolean;
};

export type SiSalesTeamSummary = {
  id: string;
  name: string;
  teamKey: string;
  territoryId: string | null;
  leaderUserId: string | null;
  isActive: boolean;
};

export type SiPipelineSummary = {
  id: string;
  name: string;
  pipelineKey: string;
  pipelineType: string | null;
  isActive: boolean;
  stageCount: number;
};

export type SiPipelineStageSummary = {
  id: string;
  pipelineId: string;
  name: string;
  stageKey: string;
  sortOrder: number;
  probabilityPercent: string | null;
  slaHours: number | null;
};

export type SiLeadDeduplicationCandidateSummary = {
  id: string;
  primaryLeadId: string | null;
  duplicateLeadId: string | null;
  matchScore: string | null;
  matchReason: string | null;
  status: string;
  reviewedAt: string | null;
};

export type SiPlaybookSummary = {
  id: string;
  name: string;
  playbookKey: string;
  playbookType: string | null;
  isActive: boolean;
};

export type SiForecastSummary = {
  id: string;
  title: string;
  forecastType: string;
  workflowStatus: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  pipelineValueCents: number | null;
  weightedPipelineCents: number | null;
  commitCents: number | null;
  confidenceScore: string | null;
  isSimulation: boolean;
  ownerName: string | null;
};

export type SiSalesTargetSummary = {
  id: string;
  targetKey: string;
  title: string;
  targetType: string;
  status: string;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  progressPercent: string | null;
};

export type SiAccountSummary = {
  id: string;
  name: string;
  accountType: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  territoryId: string | null;
  isActive: boolean;
};

export type SiAccountPlanSummary = {
  id: string;
  accountId: string;
  title: string;
  workflowStatus: string;
};

export type SiRenewalSummary = {
  id: string;
  title: string;
  renewalType: string | null;
  renewalDate: string | null;
  currentValueCents: number | null;
  proposedValueCents: number | null;
  renewalProbability: string | null;
  workflowStatus: string;
};

export type SiCustomerGrowthSnapshotSummary = {
  id: string;
  customerId: string | null;
  opportunityType: string;
  title: string;
  confidenceScore: string | null;
  capturedAt: string;
};

export type SiRetentionRiskSnapshotSummary = {
  id: string;
  customerId: string | null;
  riskLevel: string;
  riskFactors: unknown[];
  confidenceScore: string | null;
  capturedAt: string;
};

export type SiPricingRuleSummary = {
  id: string;
  name: string;
  ruleKey: string;
  ruleType: string;
  isActive: boolean;
};

export type SiDiscountPolicySummary = {
  id: string;
  name: string;
  policyKey: string;
  maxDiscountPercent: string | null;
  marginFloorPercent: string | null;
  approvalThresholdPercent: string | null;
  isActive: boolean;
};

export type SiDiscountRequestSummary = {
  id: string;
  quoteId: string | null;
  discountPercent: string | null;
  discountAmountCents: number | null;
  reason: string | null;
  workflowStatus: string;
  approvedAt: string | null;
};

export type SiCommissionPlanSummary = {
  id: string;
  name: string;
  planKey: string;
  formula: string | null;
  isActive: boolean;
};

export type SiCommissionEntrySummary = {
  id: string;
  planId: string | null;
  userId: string | null;
  status: string;
  amountCents: number;
  workflowStatus: string;
};

export type SiQualificationAnalysisSummary = {
  id: string;
  leadId: string | null;
  recommendation: string | null;
  priority: string | null;
  confidenceScore: string | null;
  supportingEvidence: Record<string, unknown>;
  limitations: string | null;
  requiresHumanReview: boolean;
  createdAt: string;
};

export type SiWinLossRecordSummary = {
  id: string;
  opportunityId: string | null;
  outcome: string;
  reason: string | null;
  competitor: string | null;
  createdAt: string;
};

export type SiRevenueLeakageFindingSummary = {
  id: string;
  findingType: string;
  title: string;
  description: string | null;
  estimatedAmountCents: number | null;
  status: string;
  createdAt: string;
};

export type SiPartnerSummary = {
  id: string;
  name: string;
  partnerType: string | null;
  isActive: boolean;
};

export type SiReferralSummary = {
  id: string;
  partnerId: string | null;
  leadId: string | null;
  customerId: string | null;
  status: string;
  revenueCents: number | null;
};

export type SiTenderSummary = {
  id: string;
  title: string;
  tenderNumber: string | null;
  deadline: string | null;
  status: string;
  workflowStatus: string;
};

export type SiCrmProviderSummary = {
  id: string;
  name: string;
  providerType: string;
  status: string;
  syncDirection: string;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
};

export type SiSalesAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type SiRevenueMonitoringSummary = {
  unassignedLeadCount: number;
  stalledOpportunityCount: number;
  expiringQuoteCount: number;
  slaBreachCount: number;
  crmSyncFailureCount: number;
  alerts: string[];
};

export type SiAnalyticsSummary = {
  pipelineValueCents: number;
  weightedPipelineCents: number;
  openOpportunityCount: number;
  activeLeadCount: number;
  openAlertCount: number;
  renewalExposureCents: number;
  revenueLeakageCents: number;
  currency: string;
  capturedAt: string;
};

export type EnterpriseSalesIntelligenceDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: SiPlatformConfigSummary;
  salesStats: {
    openOpportunityCount: number;
    wonOpportunityCount: number;
    pipelineValueCents: number;
    quoteConversionRatePercent: number | null;
  };
  leadStats: {
    activeLeadCount: number;
    qualifiedLeadCount: number;
    convertedLeadCount: number;
  };
  crmStats: {
    customerCount: number;
  };
  pipelineCount: number;
  forecastCount: number;
  activeForecastCount: number;
  targetCount: number;
  renewalCount: number;
  openAlertCount: number;
  crmProviderCount: number;
  currency: string;
  analytics: SiAnalyticsSummary | null;
  revenueMonitoring: SiRevenueMonitoringSummary;
  recentPipelines: SiPipelineSummary[];
  recentForecasts: SiForecastSummary[];
  recentTargets: SiSalesTargetSummary[];
  recentRenewals: SiRenewalSummary[];
  recentAlerts: SiSalesAlertSummary[];
  recentGrowthSnapshots: SiCustomerGrowthSnapshotSummary[];
  recentRetentionSnapshots: SiRetentionRiskSnapshotSummary[];
  recentLeakageFindings: SiRevenueLeakageFindingSummary[];
};

export type EnterpriseSalesIntelligenceAuraContext = {
  pipelineValueCents: number;
  openOpportunityCount: number;
  activeLeadCount: number;
  openAlertCount: number;
  renewalExposureCents: number;
  summary: string;
};

export type SiPortalSalesSummary = {
  openOpportunityCount: number;
  pendingQuoteCount: number;
  activeLeadCount: number;
  currency: string;
  summary: string;
};

export type UpdateSiPlatformConfigRequest = {
  salesStandards?: Record<string, unknown>;
  providerAdapterTemplates?: Record<string, unknown>;
  pipelineTemplates?: Record<string, unknown>;
  playbookTemplates?: Record<string, unknown>;
  targetTemplates?: Record<string, unknown>;
  forecastMethodology?: Record<string, unknown>;
  attributionStandards?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateSiSalesCategoryRequest = {
  name: string;
  categoryKey: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateSiTerritoryRequest = {
  name: string;
  territoryKey: string;
  territoryType?: string;
  branch?: string;
  config?: Record<string, unknown>;
};

export type CreateSiSalesTeamRequest = {
  name: string;
  teamKey: string;
  territoryId?: string;
  leaderUserId?: string;
  config?: Record<string, unknown>;
};

export type CreateSiPipelineRequest = {
  name: string;
  pipelineKey: string;
  pipelineType?: string;
  config?: Record<string, unknown>;
  stages?: Array<{
    name: string;
    stageKey: string;
    sortOrder?: number;
    probabilityPercent?: number;
    slaHours?: number;
  }>;
};

export type CreateSiPlaybookRequest = {
  name: string;
  playbookKey: string;
  playbookType?: string;
  config?: Record<string, unknown>;
};

export type CreateSiForecastRequest = {
  title: string;
  forecastType?: string;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  assumptions?: Record<string, unknown>;
  isSimulation?: boolean;
};

export type CreateSiSalesTargetRequest = {
  targetKey: string;
  title: string;
  targetType: string;
  teamId?: string;
  periodStart?: string;
  periodEnd?: string;
  targetValue?: number;
  unit?: string;
  currency?: string;
};

export type CreateSiAccountRequest = {
  name: string;
  accountType?: string;
  customerId?: string;
  territoryId?: string;
  config?: Record<string, unknown>;
};

export type CreateSiAccountPlanRequest = {
  accountId: string;
  title: string;
  goals?: Record<string, unknown>;
  stakeholders?: unknown[];
  actionPlan?: Record<string, unknown>;
};

export type CreateSiRenewalRequest = {
  title: string;
  accountId?: string;
  customerId?: string;
  renewalType?: string;
  renewalDate?: string;
  noticePeriodDays?: number;
  currentValueCents?: number;
  proposedValueCents?: number;
};

export type CreateSiPricingRuleRequest = {
  name: string;
  ruleKey: string;
  ruleType: string;
  config?: Record<string, unknown>;
};

export type CreateSiDiscountPolicyRequest = {
  name: string;
  policyKey: string;
  maxDiscountPercent?: number;
  marginFloorPercent?: number;
  approvalThresholdPercent?: number;
  config?: Record<string, unknown>;
};

export type CreateSiDiscountRequestRequest = {
  quoteId?: string;
  discountPercent?: number;
  discountAmountCents?: number;
  reason?: string;
  marginImpactPercent?: number;
};

export type CreateSiCommissionPlanRequest = {
  name: string;
  planKey: string;
  formula?: string;
  config?: Record<string, unknown>;
};

export type RequestSiLeadQualificationRequest = {
  leadId: string;
};

export type CreateSiWinLossRecordRequest = {
  opportunityId?: string;
  outcome: string;
  reason?: string;
  competitor?: string;
  priceImpact?: string;
  customerFeedback?: string;
  metadata?: Record<string, unknown>;
};

export type CreateSiPartnerRequest = {
  name: string;
  partnerType?: string;
  config?: Record<string, unknown>;
};

export type CreateSiTenderRequest = {
  title: string;
  tenderNumber?: string;
  deadline?: string;
  config?: Record<string, unknown>;
};

export type CreateSiCrmProviderRequest = {
  name: string;
  providerType: string;
  syncDirection?: string;
  syncFrequency?: string;
  fieldMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateSiSalesActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type ApproveSiLeadMergeRequest = {
  candidateId: string;
  mergeReason: string;
};
