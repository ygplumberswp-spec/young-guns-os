import type { EnterpriseProductionReadinessDashboard } from './enterprise-production-readiness.js';

export type ItoPlatformConfigSummary = {
  healthThresholds: Record<string, unknown>;
  monitoringConfig: Record<string, unknown>;
  healingPolicies: Record<string, unknown>;
  deploymentStandards: Record<string, unknown>;
  alertRouting: Record<string, unknown>;
  changeManagementPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type ItoHealthMonitorSummary = {
  id: string;
  monitorKey: string;
  name: string;
  monitorType: string;
  targetModule: string | null;
  healthStatus: string;
  isActive: boolean;
  lastCheckedAt: string | null;
};

export type ItoHealthSnapshotSummary = {
  id: string;
  monitorId: string | null;
  snapshotKey: string;
  healthStatus: string;
  capturedAt: string;
};

export type ItoSelfHealingActionSummary = {
  id: string;
  monitorId: string | null;
  actionType: string;
  workflowStatus: string;
  riskLevel: string;
  outcome: string | null;
  executedAt: string | null;
};

export type ItoBugDetectionSummary = {
  id: string;
  detectionSource: string;
  severity: string;
  title: string;
  description: string | null;
  workflowStatus: string;
  sourceModule: string | null;
  detectedAt: string;
};

export type ItoRootCauseAnalysisSummary = {
  id: string;
  bugDetectionId: string | null;
  incidentId: string | null;
  title: string;
  rootCause: string | null;
  workflowStatus: string;
  analyzedByUserId: string | null;
  completedAt: string | null;
};

export type ItoRepairAttemptSummary = {
  id: string;
  bugDetectionId: string | null;
  rootCauseAnalysisId: string | null;
  repairType: string;
  workflowStatus: string;
  riskLevel: string;
  success: boolean | null;
  attemptedAt: string | null;
};

export type ItoTestRunSummary = {
  id: string;
  runKey: string;
  testSuite: string;
  workflowStatus: string;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type ItoDeploymentSummary = {
  id: string;
  deploymentKey: string;
  environment: string;
  deploymentStatus: string;
  version: string | null;
  deployedByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type ItoBuildRecordSummary = {
  id: string;
  buildKey: string;
  version: string | null;
  branch: string | null;
  commitSha: string | null;
  workflowStatus: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ItoDependencyRecordSummary = {
  id: string;
  dependencyName: string;
  dependencyType: string;
  version: string | null;
  healthStatus: string;
  isCritical: boolean;
  lastCheckedAt: string | null;
};

export type ItoDatabaseHealthSnapshotSummary = {
  id: string;
  healthStatus: string;
  connectionPoolUsagePercent: string | null;
  queryLatencyMs: number | null;
  slowQueryCount: number;
  replicationLagMs: number | null;
  capturedAt: string;
};

export type ItoApiReliabilitySnapshotSummary = {
  id: string;
  endpointGroup: string;
  healthStatus: string;
  availabilityPercent: string | null;
  errorRatePercent: string | null;
  p95LatencyMs: number | null;
  capturedAt: string;
};

export type ItoAiProviderHealthSummary = {
  id: string;
  providerKey: string;
  healthStatus: string;
  latencyMs: number | null;
  errorRatePercent: string | null;
  rateLimitEvents: number;
  failoverCount: number;
  capturedAt: string;
};

export type ItoIntegrationHealthSummary = {
  id: string;
  integrationKey: string;
  healthStatus: string;
  lastSuccessAt: string | null;
  failureCount: number;
  latencyMs: number | null;
  capturedAt: string;
};

export type ItoIncidentSummary = {
  id: string;
  incidentNumber: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  sourceModule: string | null;
  assignedUserId: string | null;
  startedAt: string;
  resolvedAt: string | null;
};

export type ItoTechnicalDebtRecordSummary = {
  id: string;
  debtKey: string;
  title: string;
  category: string;
  severity: string;
  workflowStatus: string;
  estimatedEffortHours: string | null;
  ownerUserId: string | null;
};

export type ItoPerformanceSnapshotSummary = {
  id: string;
  healthStatus: string;
  cpuUsagePercent: string | null;
  memoryUsageMb: number | null;
  apiP95LatencyMs: number | null;
  queueDepth: number;
  backgroundJobFailureCount: number;
  capturedAt: string;
};

export type ItoBackupVerificationSummary = {
  id: string;
  backupRef: string;
  verificationStatus: string;
  verificationPassed: boolean | null;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
};

export type ItoChangeRequestSummary = {
  id: string;
  changeNumber: string | null;
  title: string;
  description: string | null;
  workflowStatus: string;
  riskLevel: string;
  scheduledAt: string | null;
  approvedAt: string | null;
};

export type ItoItAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  incidentId: string | null;
  createdAt: string;
};

export type ItoOperationsMonitoringSummary = {
  openIncidentCount: number;
  openAlertCount: number;
  degradedMonitorCount: number;
  openBugCount: number;
  pendingChangeRequestCount: number;
  failedDeploymentCount: number;
  overallHealthStatus: string;
  alerts: string[];
};

export type ItoAnalyticsSummary = {
  openIncidentCount: number;
  openAlertCount: number;
  degradedMonitorCount: number;
  openBugCount: number;
  pendingChangeRequestCount: number;
  failedDeploymentCount: number;
  technicalDebtCount: number;
  overallHealthStatus: string;
  capturedAt: string;
};

export type EnterpriseItOperationsDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: ItoPlatformConfigSummary;
  productionReadiness: EnterpriseProductionReadinessDashboard | null;
  monitorCount: number;
  degradedMonitorCount: number;
  openIncidentCount: number;
  openAlertCount: number;
  openBugCount: number;
  pendingChangeRequestCount: number;
  failedDeploymentCount: number;
  technicalDebtCount: number;
  overallHealthStatus: string;
  analytics: ItoAnalyticsSummary | null;
  operationsMonitoring: ItoOperationsMonitoringSummary;
  recentIncidents: ItoIncidentSummary[];
  recentAlerts: ItoItAlertSummary[];
  recentDeployments: ItoDeploymentSummary[];
  recentBugDetections: ItoBugDetectionSummary[];
  recentChangeRequests: ItoChangeRequestSummary[];
  recentRepairAttempts: ItoRepairAttemptSummary[];
  recentHealthMonitors: ItoHealthMonitorSummary[];
};

export type EnterpriseItOperationsAuraContext = {
  openIncidentCount: number;
  openAlertCount: number;
  degradedMonitorCount: number;
  overallHealthStatus: string;
  failedDeploymentCount: number;
  summary: string;
};

export type UpdateItoPlatformConfigRequest = {
  healthThresholds?: Record<string, unknown>;
  monitoringConfig?: Record<string, unknown>;
  healingPolicies?: Record<string, unknown>;
  deploymentStandards?: Record<string, unknown>;
  alertRouting?: Record<string, unknown>;
  changeManagementPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateItoHealthMonitorRequest = {
  monitorKey: string;
  name: string;
  monitorType: string;
  targetModule?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoHealthMonitorRequest = Partial<CreateItoHealthMonitorRequest> & {
  healthStatus?: string;
  isActive?: boolean;
};

export type CreateItoBugDetectionRequest = {
  detectionSource: string;
  severity?: string;
  title: string;
  description?: string;
  sourceModule?: string;
  sourceEntityId?: string;
  fingerprint?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoBugDetectionRequest = Partial<CreateItoBugDetectionRequest> & {
  workflowStatus?: string;
};

export type CreateItoIncidentRequest = {
  incidentNumber?: string;
  title: string;
  description?: string;
  severity?: string;
  sourceModule?: string;
  assignedUserId?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoIncidentRequest = Partial<CreateItoIncidentRequest> & {
  status?: string;
  mitigatedAt?: string;
  resolvedAt?: string;
};

export type CreateItoRootCauseAnalysisRequest = {
  bugDetectionId?: string;
  incidentId?: string;
  title: string;
  rootCause?: string;
  analysis?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type UpdateItoRootCauseAnalysisRequest = Partial<CreateItoRootCauseAnalysisRequest> & {
  workflowStatus?: string;
  completedAt?: string;
};

export type CreateItoRepairAttemptRequest = {
  bugDetectionId?: string;
  rootCauseAnalysisId?: string;
  repairType: string;
  riskLevel?: string;
  notes?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoRepairAttemptRequest = Partial<CreateItoRepairAttemptRequest> & {
  workflowStatus?: string;
  success?: boolean;
  attemptedAt?: string;
};

export type CreateItoBuildRecordRequest = {
  buildKey: string;
  version?: string;
  branch?: string;
  commitSha?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoBuildRecordRequest = Partial<CreateItoBuildRecordRequest> & {
  workflowStatus?: string;
  startedAt?: string;
  completedAt?: string;
};

export type CreateItoTestRunRequest = {
  runKey: string;
  testSuite: string;
  buildRecordId?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoTestRunRequest = Partial<CreateItoTestRunRequest> & {
  workflowStatus?: string;
  passedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  startedAt?: string;
  completedAt?: string;
};

export type CreateItoChangeRequestRequest = {
  changeNumber?: string;
  title: string;
  description?: string;
  riskLevel?: string;
  scheduledAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoChangeRequestRequest = Partial<CreateItoChangeRequestRequest> & {
  workflowStatus?: string;
  approvedAt?: string;
};

export type CreateItoDeploymentRequest = {
  deploymentKey: string;
  environment: string;
  version?: string;
  buildRecordId?: string;
  changeRequestId?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoDeploymentRequest = Partial<CreateItoDeploymentRequest> & {
  deploymentStatus?: string;
  startedAt?: string;
  completedAt?: string;
};

export type CreateItoDependencyRecordRequest = {
  dependencyName: string;
  dependencyType: string;
  version?: string;
  isCritical?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateItoDependencyRecordRequest = Partial<CreateItoDependencyRecordRequest> & {
  healthStatus?: string;
};

export type CreateItoTechnicalDebtRecordRequest = {
  debtKey: string;
  title: string;
  category: string;
  severity?: string;
  estimatedEffortHours?: number;
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoTechnicalDebtRecordRequest = Partial<CreateItoTechnicalDebtRecordRequest> & {
  workflowStatus?: string;
};

export type CreateItoBackupVerificationRequest = {
  backupRef: string;
  notes?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoBackupVerificationRequest = Partial<CreateItoBackupVerificationRequest> & {
  verificationStatus?: string;
  verificationPassed?: boolean;
  verifiedAt?: string;
};

export type CreateItoSelfHealingActionRequest = {
  monitorId?: string;
  actionType: string;
  riskLevel?: string;
  triggeredBy?: string;
  config?: Record<string, unknown>;
};

export type UpdateItoSelfHealingActionRequest = Partial<CreateItoSelfHealingActionRequest> & {
  workflowStatus?: string;
  outcome?: string;
  executedAt?: string;
};

export type CreateItoItActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};
