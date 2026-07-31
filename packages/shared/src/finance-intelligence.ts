export type FinanceBudgetPeriodType = 'monthly' | 'quarterly' | 'yearly';

export type FinanceBudgetStatus = 'draft' | 'active' | 'closed';

export type FinanceRecommendationType =
  'pricing' | 'margin' | 'expense_reduction' | 'collections' | 'cash_flow' | 'risk';

export type FinanceRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type FinanceForecastType = 'weekly' | 'monthly';

export type CashFlowIntelligence = {
  currency: string;
  currentPositionCents: number;
  inflowCents: number;
  outflowCents: number;
  outstandingReceivableCents: number;
  outstandingPayableCents: number;
  weeklyForecastCents: number;
  monthlyForecastCents: number;
  cashShortageWarning: boolean;
  summary: string;
};

export type ProfitabilityIntelligence = {
  currency: string;
  grossMarginPercent: number | null;
  netMarginPercent: number | null;
  totalRevenueCents: number;
  totalProfitCents: number | null;
  byJob: Array<{
    jobId: string;
    jobTitle: string;
    revenueCents: number;
    marginPercent: number | null;
  }>;
  byCustomer: Array<{ customerName: string; revenueCents: number; jobCount: number }>;
  byService: Array<{ serviceName: string; revenueCents: number; jobCount: number }>;
  byTechnician: Array<{ technicianName: string; revenueCents: number; jobsCompleted: number }>;
  summary: string;
};

export type ReceivablesIntelligence = {
  currency: string;
  overdueCount: number;
  overdueAmountCents: number;
  ageingBuckets: Array<{ bucket: string; count: number; amountCents: number }>;
  collectionPriorities: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    outstandingCents: number;
    daysOverdue: number | null;
    priority: string;
  }>;
  customerPaymentBehaviour: Array<{
    customerId: string;
    customerName: string;
    averageDaysToPay: number | null;
    latePaymentRisk: boolean;
  }>;
  summary: string;
};

export type ExpenseIntelligence = {
  currency: string;
  totalOutflowCents: number;
  byCategory: Array<{ category: string; amountCents: number; transactionCount: number }>;
  supplierSpendingCents: number;
  monthlyTrend: Array<{ period: string; amountCents: number }>;
  unusualSpendingSignals: Array<{ title: string; description: string; priority: string }>;
  summary: string;
};

export type FinanceBudgetSummary = {
  id: string;
  name: string;
  periodType: FinanceBudgetPeriodType;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: FinanceBudgetStatus;
  totalBudgetedCents: number;
  lineCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceBudgetLineSummary = {
  id: string;
  budgetId: string;
  categoryKey: string;
  categoryName: string;
  budgetedAmountCents: number;
  actualAmountCents: number;
  varianceCents: number;
  variancePercent: number | null;
  notes: string | null;
};

export type FinanceBudgetVariance = {
  budget: FinanceBudgetSummary;
  lines: FinanceBudgetLineSummary[];
  totalBudgetedCents: number;
  totalActualCents: number;
  totalVarianceCents: number;
  summary: string;
};

export type FinanceForecast = {
  forecastType: FinanceForecastType;
  horizonStart: string;
  horizonEnd: string;
  receivableForecastCents: number;
  payableForecastCents: number;
  netPositionCents: number;
  cashShortageWarning: boolean;
  summary: string;
};

export type FinanceForecastSnapshotSummary = FinanceForecast & {
  id: string;
  generatedAt: string;
  createdAt: string;
};

export type FinanceRecommendationSummary = {
  id: string;
  recommendationType: FinanceRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: FinanceRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FinanceRiskSignal = {
  riskType: string;
  title: string;
  description: string;
  priority: string;
  context: Record<string, unknown>;
};

export type FinanceIntelligenceStats = {
  pendingRecommendationCount: number;
  activeBudgetCount: number;
  overdueInvoiceCount: number;
  cashShortageWarning: boolean;
};

export type FinanceIntelligenceAuraContext = {
  cashFlow: CashFlowIntelligence;
  profitability: ProfitabilityIntelligence;
  receivables: ReceivablesIntelligence;
  expenses: ExpenseIntelligence;
  forecast: FinanceForecast;
  pendingRecommendationCount: number;
  topRecommendations: Array<{
    title: string;
    recommendationType: FinanceRecommendationType;
    priority: string;
  }>;
  riskSignals: FinanceRiskSignal[];
  summary: string;
};

export type CreateFinanceBudgetRequest = {
  name: string;
  periodType?: FinanceBudgetPeriodType;
  periodStart: string;
  periodEnd: string;
  currency?: string;
  status?: FinanceBudgetStatus;
  notes?: string | null;
  lines?: Array<{
    categoryKey: string;
    categoryName: string;
    budgetedAmountCents: number;
    notes?: string | null;
  }>;
};

export type UpdateFinanceBudgetRequest = Partial<Omit<CreateFinanceBudgetRequest, 'lines'>>;

export type CreateFinanceBudgetLineRequest = {
  categoryKey: string;
  categoryName: string;
  budgetedAmountCents: number;
  notes?: string | null;
};

export type UpdateFinanceRecommendationRequest = {
  status: FinanceRecommendationStatus;
};

export type GenerateFinanceForecastRequest = {
  forecastType: FinanceForecastType;
};
