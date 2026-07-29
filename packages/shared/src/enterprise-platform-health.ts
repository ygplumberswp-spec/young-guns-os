import type { ItoIncidentSummary } from './enterprise-it-operations.js';

export type PhHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type PhDiagnosticStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export type PhServiceCategory =
  | 'backend'
  | 'frontend'
  | 'database'
  | 'cache'
  | 'storage'
  | 'ai_provider'
  | 'communication_provider'
  | 'accounting_provider'
  | 'fleet_provider'
  | 'connector_platform'
  | 'api'
  | 'authentication'
  | 'scheduler'
  | 'automation';

export type PhInsightSeverity = 'info' | 'warning' | 'critical';

export type PhPlatformConfigSummary = {
  monitoringPolicy: Record<string, unknown>;
  diagnosticsPolicy: Record<string, unknown>;
  capacityPolicy: Record<string, unknown>;
  incidentPolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type PhHealthSnapshotSummary = {
  id: string;
  overallHealthScore: number | null;
  overallHealthStatus: PhHealthStatus;
  uptimePercent: number | null;
  availabilityPercent: number | null;
  errorRatePercent: number | null;
  apiP95LatencyMs: number | null;
  queueDepth: number;
  failedJobCount: number;
  activeSessionCount: number;
  capturedAt: string;
};

export type PhServiceHealthSummary = {
  moduleKey: string;
  moduleName: string;
  status: PhHealthStatus;
  latencyMs: number | null;
  errorRatePercent: number | null;
  queueDepth: number | null;
  lastCheckedAt: string | null;
};

export type PhDiagnosticRunSummary = {
  id: string;
  runKey: string;
  status: PhDiagnosticStatus;
  testCount: number;
  passedCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PhDiagnosticResultSummary = {
  id: string;
  diagnosticRunId: string;
  testKey: string;
  testName: string;
  serviceCategory: PhServiceCategory | null;
  status: PhDiagnosticStatus;
  message: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type PhPerformanceInsightSummary = {
  id: string;
  insightType: string;
  severity: PhInsightSeverity;
  title: string;
  description: string | null;
  sourceModule: string | null;
  metricValue: number | null;
  thresholdValue: number | null;
  recommendation: string | null;
  createdAt: string;
};

export type PhCapacitySnapshotSummary = {
  id: string;
  storageUsageMb: number | null;
  databaseGrowthMb: number | null;
  aiUsageCount: number;
  apiRequestCount: number;
  queueGrowthCount: number;
  activeTenantCount: number;
  activeUserCount: number;
  backgroundJobLoad: number;
  forecast: Record<string, unknown>;
  capturedAt: string;
};

export type PhPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceIncidentId: string | null;
  createdAt: string;
};

export type PhAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type PhAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type PhActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type PhPlatformHealthSummary = {
  overallHealthScore: number | null;
  overallHealthStatus: PhHealthStatus;
  criticalIncidentCount: number;
  failedDiagnosticCount: number;
  openAlertCount: number;
  capacityWarningCount: number;
  degradedServiceCount: number;
};

export type EnterprisePlatformHealthDashboard = {
  summary: string;
  platformConfig: PhPlatformConfigSummary;
  platformHealth: PhPlatformHealthSummary;
  latestHealthSnapshot: PhHealthSnapshotSummary | null;
  serviceHealth: PhServiceHealthSummary[];
  diagnosticRuns: PhDiagnosticRunSummary[];
  latestDiagnosticResults: PhDiagnosticResultSummary[];
  performanceInsights: PhPerformanceInsightSummary[];
  latestCapacitySnapshot: PhCapacitySnapshotSummary | null;
  incidents: ItoIncidentSummary[];
  integrations: Array<{ key: string; status: string; provider: string | null }>;
  backgroundJobs: { queueDepth: number; failedCount: number; pendingCount: number };
  analytics: PhAnalyticsSummary | null;
  recentAlerts: PhPlatformAlertSummary[];
  openAlertCount: number;
  overallPlatformHealthStatus: 'healthy' | 'degraded' | 'critical';
};

export type EnterprisePlatformHealthAuraContext = {
  summary: string;
  overallHealthScore: number | null;
  criticalIncidentCount: number;
  failedDiagnosticCount: number;
  openAlertCount: number;
  overallPlatformHealthStatus: 'healthy' | 'degraded' | 'critical';
};

export type UpdatePhPlatformConfigRequest = {
  monitoringPolicy?: Record<string, unknown>;
  diagnosticsPolicy?: Record<string, unknown>;
  capacityPolicy?: Record<string, unknown>;
  incidentPolicy?: Record<string, unknown>;
  alertLevelConfig?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreatePhIncidentRequest = {
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  sourceModule?: string;
  assignedUserId?: string;
};

export type UpdatePhIncidentRequest = {
  title?: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'open' | 'investigating' | 'mitigated' | 'resolved' | 'closed';
  assignedUserId?: string;
};

export type CreatePhActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type PhDiagnosticRunDetailSummary = PhDiagnosticRunSummary & {
  results: PhDiagnosticResultSummary[];
};

// Re-export incident type from IT ops for convenience
export type { ItoIncidentSummary as PhIncidentSummary } from './enterprise-it-operations.js';
