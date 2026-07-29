export type FpPlatformConfigSummary = {
  financeStandards: Record<string, unknown>;
  providerAdapterTemplates: Record<string, unknown>;
  currencyStandards: Record<string, unknown>;
  planningTemplates: Record<string, unknown>;
  kpiTemplates: Record<string, unknown>;
  riskThresholds: Record<string, unknown>;
  allocationMethods: Record<string, unknown>;
  auditRetentionDays: number;
};

export type FpPlanningCategorySummary = {
  id: string;
  name: string;
  categoryKey: string;
  description: string | null;
  isActive: boolean;
};

export type FpEntitySummary = {
  id: string;
  name: string;
  entityKey: string;
  entityType: string | null;
  currency: string | null;
  taxJurisdiction: string | null;
  isActive: boolean;
};

export type FpBudgetSummary = {
  id: string;
  title: string;
  budgetPeriod: string;
  status: string;
  workflowStatus: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  version: number;
  totalAmountCents: number | null;
  ownerName: string | null;
  varianceAmountCents: number | null;
};

export type FpForecastSummary = {
  id: string;
  title: string;
  forecastType: string;
  workflowStatus: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  confidenceScore: string | null;
  isSimulation: boolean;
  ownerName: string | null;
};

export type FpCashFlowProjectionSummary = {
  id: string;
  projectionDate: string;
  periodType: string;
  openingBalanceCents: number;
  expectedInflowCents: number;
  expectedOutflowCents: number;
  closingBalanceCents: number;
  cashRunwayDays: number | null;
  confidenceScore: string | null;
};

export type FpTreasuryAccountSummary = {
  id: string;
  accountName: string;
  bankName: string | null;
  currency: string;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
  lastRefreshedAt: string | null;
  isActive: boolean;
};

export type FpScenarioSummary = {
  id: string;
  title: string;
  scenarioType: string;
  workflowStatus: string;
  isSimulation: boolean;
  cashImpactCents: number | null;
  profitImpactCents: number | null;
  confidenceScore: string | null;
};

export type FpFinancialTargetSummary = {
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

export type FpFinancialAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type FpAccountingProviderSummary = {
  id: string;
  name: string;
  providerType: string;
  status: string;
  syncDirection: string;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
};

export type FpBankingProviderSummary = {
  id: string;
  name: string;
  providerType: string;
  status: string;
  refreshSchedule: string | null;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
};

export type FpProfitabilitySnapshotSummary = {
  id: string;
  dimensionType: string;
  dimensionName: string | null;
  revenueCents: number;
  directCostCents: number;
  grossProfitCents: number;
  marginPercent: string | null;
  allocationMethod: string | null;
  formula: string | null;
  capturedAt: string;
};

export type FpReceivablesIntelligenceSummary = {
  overdueCount: number;
  overdueAmountCents: number;
  outstandingAmountCents: number;
  averageDaysToPay: number | null;
  collectionPriorities: Array<{
    invoiceId: string;
    customerName: string;
    amountDueCents: number;
    daysOverdue: number;
    priority: string;
  }>;
  summary: string;
};

export type FpPayablesIntelligenceSummary = {
  upcomingCount: number;
  upcomingAmountCents: number;
  duplicateRiskCount: number;
  paymentPriorities: Array<{
    supplierName: string;
    amountCents: number;
    dueDate: string | null;
    priority: string;
  }>;
  summary: string;
};

export type FpWorkingCapitalSummary = {
  receivablesCents: number;
  payablesCents: number;
  inventoryValueCents: number;
  cashConversionCycleDays: number | null;
  daysSalesOutstanding: number | null;
  daysPayableOutstanding: number | null;
  summary: string;
};

export type FpFinancialMonitoringSummary = {
  cashShortfallRisk: boolean;
  lowCashRunway: boolean;
  budgetOverspendCount: number;
  marginDeclineCount: number;
  syncFailureCount: number;
  alerts: string[];
};

export type FpAnalyticsSummary = {
  activeBudgetCount: number;
  activeForecastCount: number;
  cashPositionCents: number;
  cashRunwayDays: number | null;
  overdueReceivableCents: number;
  upcomingPayableCents: number;
  openAlertCount: number;
  budgetVarianceCents: number;
  currency: string;
  capturedAt: string;
};

export type EnterpriseFinancialPlanningDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: FpPlatformConfigSummary;
  budgetCount: number;
  activeBudgetCount: number;
  forecastCount: number;
  activeForecastCount: number;
  scenarioCount: number;
  targetCount: number;
  openAlertCount: number;
  treasuryAccountCount: number;
  accountingProviderCount: number;
  bankingProviderCount: number;
  cashPositionCents: number;
  cashRunwayDays: number | null;
  cashShortageWarning: boolean;
  currency: string;
  analytics: FpAnalyticsSummary | null;
  financialMonitoring: FpFinancialMonitoringSummary;
  receivables: FpReceivablesIntelligenceSummary;
  payables: FpPayablesIntelligenceSummary;
  workingCapital: FpWorkingCapitalSummary;
  recentBudgets: FpBudgetSummary[];
  recentForecasts: FpForecastSummary[];
  recentScenarios: FpScenarioSummary[];
  recentAlerts: FpFinancialAlertSummary[];
  recentCashFlowProjections: FpCashFlowProjectionSummary[];
  recentProfitabilitySnapshots: FpProfitabilitySnapshotSummary[];
};

export type EnterpriseFinancialPlanningAuraContext = {
  budgetCount: number;
  activeBudgetCount: number;
  cashPositionCents: number;
  cashShortageWarning: boolean;
  openAlertCount: number;
  overdueReceivableCents: number;
  summary: string;
};

export type FpPortalFinanceSummary = {
  outstandingBalanceCents: number;
  overdueBalanceCents: number;
  pendingQuoteCount: number;
  currency: string;
  summary: string;
};

export type UpdateFpPlatformConfigRequest = {
  financeStandards?: Record<string, unknown>;
  providerAdapterTemplates?: Record<string, unknown>;
  currencyStandards?: Record<string, unknown>;
  planningTemplates?: Record<string, unknown>;
  kpiTemplates?: Record<string, unknown>;
  riskThresholds?: Record<string, unknown>;
  allocationMethods?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateFpPlanningCategoryRequest = {
  name: string;
  categoryKey: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateFpEntityRequest = {
  name: string;
  entityKey: string;
  entityType?: string;
  currency?: string;
  taxJurisdiction?: string;
  parentEntityId?: string;
  config?: Record<string, unknown>;
};

export type CreateFpBudgetRequest = {
  title: string;
  entityId?: string;
  categoryId?: string;
  budgetPeriod?: string;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  assumptions?: string;
  notes?: string;
  totalAmountCents?: number;
  lines?: Array<{
    lineKey: string;
    description: string;
    department?: string;
    branch?: string;
    project?: string;
    costCentre?: string;
    plannedAmountCents: number;
  }>;
};

export type CreateFpForecastRequest = {
  title: string;
  entityId?: string;
  forecastType?: string;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  assumptions?: Record<string, unknown>;
  isSimulation?: boolean;
};

export type CreateFpScenarioRequest = {
  title: string;
  entityId?: string;
  scenarioType: string;
  assumptions?: Record<string, unknown>;
  lines?: Array<{
    lineKey: string;
    description: string;
    impactType?: string;
    amountCents: number;
  }>;
};

export type CreateFpFinancialTargetRequest = {
  targetKey: string;
  title: string;
  targetType: string;
  entityId?: string;
  periodStart?: string;
  periodEnd?: string;
  targetValue?: number;
  unit?: string;
  currency?: string;
};

export type CreateFpAccountingProviderRequest = {
  name: string;
  providerType: string;
  entityId?: string;
  syncDirection?: string;
  syncFrequency?: string;
  accountMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateFpBankingProviderRequest = {
  name: string;
  providerType: string;
  entityId?: string;
  refreshSchedule?: string;
  accountMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateFpTreasuryAccountRequest = {
  accountName: string;
  entityId?: string;
  bankingProviderId?: string;
  accountNumberMasked?: string;
  bankName?: string;
  currency?: string;
  currentBalanceCents?: number;
};

export type CreateFpPlanningActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type CaptureFpProfitabilityRequest = {
  dimensionType: string;
  dimensionId?: string;
  dimensionName?: string;
  periodStart?: string;
  periodEnd?: string;
};
