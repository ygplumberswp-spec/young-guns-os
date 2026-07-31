export type ExecutiveAlertType =
  | 'revenue_decline'
  | 'unpaid_invoices'
  | 'low_margin'
  | 'capacity_issue'
  | 'customer_risk'
  | 'stock_risk'
  | 'operational_issue'
  | 'growth_opportunity';

export type ExecutiveAlertStatus = 'pending' | 'acknowledged' | 'dismissed';

export type ExecutiveRecommendationType =
  'growth' | 'cost_optimization' | 'operational_improvement' | 'customer_retention' | 'strategic';

export type ExecutiveRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type ExecutiveReportType = 'daily_summary' | 'weekly_review' | 'monthly_review';

export type BusinessHealthTrend = 'improving' | 'stable' | 'declining' | 'unknown';

export type BusinessHealthComponent = {
  key: string;
  label: string;
  score: number;
  weight: number;
  summary: string;
};

export type BusinessHealthSnapshotSummary = {
  id: string;
  overallScore: number;
  trend: BusinessHealthTrend;
  components: BusinessHealthComponent[];
  summary: string;
  generatedAt: string;
  createdAt: string;
};

export type ExecutiveAlertSummary = {
  id: string;
  alertType: ExecutiveAlertType;
  title: string;
  description: string;
  priority: string;
  status: ExecutiveAlertStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveRecommendationSummary = {
  id: string;
  recommendationType: ExecutiveRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: ExecutiveRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveReportSummary = {
  id: string;
  reportType: ExecutiveReportType;
  title: string;
  content: string;
  context: Record<string, unknown>;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessSummary = {
  period: string;
  headline: string;
  revenueCents: number;
  currency: string;
  revenueChangePercent: number | null;
  activeJobs: number;
  completedJobs: number;
  outstandingInvoiceCents: number;
  lowStockCount: number;
  pendingAlertCount: number;
  healthScore: number | null;
  highlights: string[];
};

export type ExecutiveStats = {
  healthScore: number | null;
  healthTrend: BusinessHealthTrend;
  pendingAlertCount: number;
  pendingRecommendationCount: number;
  reportCount: number;
};

export type ExecutiveAuraContext = {
  healthScore: number | null;
  healthTrend: BusinessHealthTrend;
  pendingAlertCount: number;
  pendingRecommendationCount: number;
  topAlerts: Array<{ title: string; alertType: ExecutiveAlertType; priority: string }>;
  topRecommendations: Array<{
    title: string;
    recommendationType: ExecutiveRecommendationType;
    priority: string;
  }>;
  businessSummary: BusinessSummary;
  summary: string;
};

export type UpdateExecutiveAlertRequest = {
  status: ExecutiveAlertStatus;
};

export type UpdateExecutiveRecommendationRequest = {
  status: ExecutiveRecommendationStatus;
};

export type GenerateExecutiveReportRequest = {
  reportType: ExecutiveReportType;
};
