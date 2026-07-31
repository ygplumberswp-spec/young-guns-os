import type {
  BusinessDashboardType,
  BusinessInsightSummary,
  BusinessIntelligenceStats,
  BusinessKpiSummary,
  BusinessReportSummary,
  DataLakeModuleSummary,
  PredictiveForecastSummary,
} from './business-intelligence.js';

export type AnalyticsDataModule =
  | 'finance'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'dispatch'
  | 'fleet'
  | 'inventory'
  | 'procurement'
  | 'hr'
  | 'customer_success'
  | 'ai'
  | 'productivity';

export type AnalyticsPermissionScope = 'read' | 'write' | 'admin';

export type AnalyticsPlatformActionType =
  'strategic_report' | 'kpi_recommendation' | 'forecast_review' | 'governance_action';

export type AnalyticsPlatformActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type AnalyticsDataSnapshotSummary = {
  id: string;
  module: AnalyticsDataModule;
  snapshotKey: string;
  periodStart: string;
  periodEnd: string;
  recordCount: number;
  metrics: Record<string, unknown>;
  generatedAt: string;
};

export type AnalyticsDataLineageSummary = {
  id: string;
  sourceModule: AnalyticsDataModule;
  targetModule: AnalyticsDataModule;
  transformation: string;
  recordCount: number;
  recordedAt: string;
};

export type AnalyticsDatasetPermissionSummary = {
  id: string;
  datasetKey: string;
  permission: AnalyticsPermissionScope;
  roleId: string | null;
  userId: string | null;
  createdAt: string;
};

export type AnalyticsReportPermissionSummary = {
  id: string;
  reportId: string | null;
  templateKey: string | null;
  permission: AnalyticsPermissionScope;
  roleId: string | null;
  userId: string | null;
  createdAt: string;
};

export type AnalyticsAccessAuditSummary = {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  occurredAt: string;
};

export type AnalyticsRetentionPolicySummary = {
  id: string;
  datasetKey: string;
  retentionDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsSavedLayoutSummary = {
  id: string;
  dashboardType: BusinessDashboardType;
  name: string;
  layout: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsPlatformActionSummary = {
  id: string;
  actionType: AnalyticsPlatformActionType;
  status: AnalyticsPlatformActionStatus;
  subject: string;
  recommendation: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AnalyticsGovernanceSummary = {
  datasetPermissions: AnalyticsDatasetPermissionSummary[];
  reportPermissions: AnalyticsReportPermissionSummary[];
  retentionPolicies: AnalyticsRetentionPolicySummary[];
  recentAudit: AnalyticsAccessAuditSummary[];
};

export type AnalyticsWarehouseSummary = {
  modules: DataLakeModuleSummary[];
  snapshots: AnalyticsDataSnapshotSummary[];
  lineage: AnalyticsDataLineageSummary[];
  lastAggregatedAt: string | null;
};

export type EnterpriseAnalyticsExecutiveDashboard = {
  summary: string;
  stats: BusinessIntelligenceStats;
  kpis: BusinessKpiSummary[];
  insights: BusinessInsightSummary[];
  forecasts: PredictiveForecastSummary[];
  warehouse: AnalyticsWarehouseSummary;
  governance: AnalyticsGovernanceSummary;
  savedLayouts: AnalyticsSavedLayoutSummary[];
  pendingActionCount: number;
  recentReports: BusinessReportSummary[];
};

export type EnterpriseAnalyticsAuraContext = {
  summary: string;
  activeKpiCount: number;
  pendingInsightCount: number;
  pendingActionCount: number;
  moduleCount: number;
  snapshotCount: number;
};

export type CreateAnalyticsPlatformActionRequest = {
  actionType: AnalyticsPlatformActionType;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type CreateAnalyticsSavedLayoutRequest = {
  dashboardType: BusinessDashboardType;
  name: string;
  layout?: Record<string, unknown>;
  isDefault?: boolean;
};

export type CreateAnalyticsDatasetPermissionRequest = {
  datasetKey: string;
  permission: AnalyticsPermissionScope;
  roleId?: string | null;
  userId?: string | null;
};

export type CreateAnalyticsRetentionPolicyRequest = {
  datasetKey: string;
  retentionDays: number;
  enabled?: boolean;
};

export type RunAnalyticsAggregationRequest = {
  modules?: AnalyticsDataModule[];
};
