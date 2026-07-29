export type BusinessKpiKey =
  | 'revenue'
  | 'gross_profit'
  | 'net_profit'
  | 'cash_flow'
  | 'job_completion_rate'
  | 'technician_utilization'
  | 'customer_retention'
  | 'quote_conversion'
  | 'lead_conversion'
  | 'marketing_roi'
  | 'inventory_turnover'
  | 'procurement_costs'
  | 'customer_satisfaction'
  | 'automation_savings'
  | 'fleet_efficiency'
  | 'ai_performance';

export type BusinessDashboardType =
  | 'executive'
  | 'finance'
  | 'operations'
  | 'sales'
  | 'marketing'
  | 'workforce'
  | 'fleet'
  | 'customer_support'
  | 'branch'
  | 'personal'
  | 'dispatch'
  | 'procurement'
  | 'hr'
  | 'inventory'
  | 'ai';

export type BusinessReportStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'generated'
  | 'archived';

export type BusinessInsightType =
  | 'business_trend'
  | 'operational_bottleneck'
  | 'revenue_opportunity'
  | 'cost_optimization'
  | 'customer_behavior'
  | 'workforce_efficiency'
  | 'procurement_optimization'
  | 'automation_effectiveness';

export type BusinessInsightStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type PredictiveForecastType =
  | 'revenue'
  | 'workload'
  | 'inventory_demand'
  | 'staffing'
  | 'cash_flow'
  | 'customer_churn'
  | 'demand'
  | 'lead_scoring'
  | 'risk';

export type BusinessKpiSummary = {
  id: string;
  kpiKey: BusinessKpiKey;
  name: string;
  description: string | null;
  targetValue: number | null;
  unit: string;
  isActive: boolean;
  currentValue: number | null;
  changePercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessKpiSnapshotSummary = {
  id: string;
  kpiId: string;
  kpiKey: BusinessKpiKey;
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  createdAt: string;
};

export type BusinessDashboardSummary = {
  id: string;
  dashboardType: BusinessDashboardType;
  name: string;
  description: string | null;
  isDefault: boolean;
  widgetCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDashboardDetail = BusinessDashboardSummary & {
  widgets: DashboardWidgetSummary[];
};

export type DashboardWidgetSummary = {
  id: string;
  dashboardId: string;
  widgetKey: string;
  title: string;
  kpiKey: BusinessKpiKey | null;
  position: number;
  config: Record<string, unknown>;
  currentValue: number | null;
};

export type BiReportTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  templateKey: string;
  modules: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessReportSummary = {
  id: string;
  templateId: string | null;
  name: string;
  description: string | null;
  status: BusinessReportStatus;
  scheduleCron: string | null;
  lastGeneratedAt: string | null;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessReportDetail = BusinessReportSummary & {
  filters: Record<string, unknown>;
  exportMetadata: Record<string, unknown>;
};

export type BusinessInsightSummary = {
  id: string;
  insightType: BusinessInsightType;
  title: string;
  description: string;
  priority: string;
  status: BusinessInsightStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PredictiveForecastSummary = {
  id: string;
  forecastType: PredictiveForecastType;
  horizonStart: string;
  horizonEnd: string;
  forecastValue: number;
  confidencePercent: number | null;
  summary: string;
  generatedAt: string;
  createdAt: string;
};

export type BusinessIntelligenceStats = {
  activeKpiCount: number;
  dashboardCount: number;
  pendingInsightCount: number;
  scheduledReportCount: number;
  latestForecastCount: number;
};

export type DataLakeModuleSummary = {
  module: string;
  recordCount: number;
  lastActivityAt: string | null;
};

export type BusinessIntelligenceAuraContext = {
  stats: BusinessIntelligenceStats;
  topKpis: Array<{ kpiKey: BusinessKpiKey; name: string; value: number | null; unit: string }>;
  dataLakeModules: DataLakeModuleSummary[];
  topInsights: Array<{ title: string; insightType: BusinessInsightType; priority: string }>;
  recentForecasts: Array<{ forecastType: PredictiveForecastType; summary: string }>;
  summary: string;
};

export type CreateBusinessKpiRequest = {
  kpiKey: BusinessKpiKey;
  name: string;
  description?: string | null;
  targetValue?: number | null;
  unit?: string;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateBusinessKpiRequest = Partial<CreateBusinessKpiRequest>;

export type CreateBusinessDashboardRequest = {
  dashboardType: BusinessDashboardType;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  config?: Record<string, unknown>;
  widgets?: Array<{
    widgetKey: string;
    title: string;
    kpiKey?: BusinessKpiKey | null;
    position?: number;
    config?: Record<string, unknown>;
  }>;
};

export type UpdateBusinessDashboardRequest = Partial<Omit<CreateBusinessDashboardRequest, 'widgets'>>;

export type CreateDashboardWidgetRequest = {
  widgetKey: string;
  title: string;
  kpiKey?: BusinessKpiKey | null;
  position?: number;
  config?: Record<string, unknown>;
};

export type CreateBiReportTemplateRequest = {
  name: string;
  description?: string | null;
  templateKey: string;
  modules?: string[];
  defaultFilters?: Record<string, unknown>;
  isActive?: boolean;
};

export type UpdateBiReportTemplateRequest = Partial<CreateBiReportTemplateRequest>;

export type CreateBusinessReportRequest = {
  templateId?: string | null;
  name: string;
  description?: string | null;
  filters?: Record<string, unknown>;
  scheduleCron?: string | null;
};

export type UpdateBusinessReportRequest = Partial<CreateBusinessReportRequest>;

export type UpdateBusinessInsightRequest = {
  status: BusinessInsightStatus;
};

export type GeneratePredictiveForecastRequest = {
  forecastType: PredictiveForecastType;
};

export type GenerateKpiSnapshotsRequest = {
  kpiIds?: string[];
};

export type ScheduleBusinessReportRequest = {
  scheduleCron: string;
};

export type ApproveBusinessReportRequest = {
  status: 'approved';
};

export type GenerateBusinessReportRequest = {
  filters?: Record<string, unknown>;
};
