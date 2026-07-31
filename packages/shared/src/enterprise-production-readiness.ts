export type OpsServiceModule =
  | 'api_gateway'
  | 'authentication'
  | 'database'
  | 'cache'
  | 'background_workers'
  | 'queue_services'
  | 'ai_orchestration'
  | 'ai_provider_gateway'
  | 'aura_agent_runtime'
  | 'mission_control'
  | 'knowledge_graph'
  | 'digital_twin'
  | 'evolution_platform'
  | 'saas_platform'
  | 'developer_platform'
  | 'automation_studio'
  | 'integrations'
  | 'crm'
  | 'jobs'
  | 'scheduling'
  | 'dispatch'
  | 'fleet'
  | 'inventory'
  | 'procurement'
  | 'finance'
  | 'communications'
  | 'customer_portal';

export type OpsHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type OpsReadinessStatus = 'ready' | 'warning' | 'critical' | 'unknown';
export type OpsMaintenanceWindowStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type OpsMaintenanceActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';
export type OpsBackupRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';
export type OpsLogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type OpsDeploymentStatus = 'planned' | 'in_progress' | 'completed' | 'rolled_back';

export type OpsServiceHealthSummary = {
  moduleKey: OpsServiceModule;
  status: OpsHealthStatus;
  availabilityPercent: number | null;
  latencyMs: number | null;
  errorRatePercent: number | null;
  throughputPerMinute: number | null;
  dependencyHealth: Record<string, unknown>;
  lastSuccessfulOperationAt: string | null;
  capturedAt: string;
};

export type OpsPerformanceSummary = {
  id: string;
  apiP95LatencyMs: number | null;
  slowEndpointCount: number;
  dbPoolUsagePercent: number | null;
  cacheHitRatePercent: number | null;
  queueDepth: number;
  workerThroughputPerMinute: number | null;
  backgroundJobFailureCount: number;
  memoryUsageMb: number | null;
  cpuUsagePercent: number | null;
  storageUsageMb: number | null;
  webhookLatencyMs: number | null;
  integrationLatencyMs: number | null;
  aiProviderLatencyMs: number | null;
  knowledgeGraphSearchMs: number | null;
  digitalTwinSimulationMs: number | null;
  capturedAt: string;
};

export type OpsAiProviderMonitoringSummary = {
  providerKey: string;
  providerId: string | null;
  displayName: string;
  healthStatus: string;
  isEnabled: boolean;
  averageLatencyMs: number | null;
  errorRatePercent: number | null;
  rateLimitEvents: number;
  failoverCount: number;
  queueDepth: number;
  estimatedCostCents: number;
  modelCount: number;
};

export type OpsBackupPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  description: string | null;
  scheduleCron: string | null;
  retentionDays: number;
  isEnabled: boolean;
  includesDatabase: boolean;
  includesConfiguration: boolean;
  includesCredentials: boolean;
  includesKnowledgeGraph: boolean;
  includesOrganizationalMemory: boolean;
  includesFileStorage: boolean;
};

export type OpsBackupRunSummary = {
  id: string;
  policyId: string | null;
  status: OpsBackupRunStatus;
  backupType: string;
  sizeBytes: number | null;
  verificationPassed: boolean | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type OpsRecoveryReadinessSummary = {
  recoveryPointObjectiveMinutes: number | null;
  recoveryTimeObjectiveMinutes: number | null;
  backupRetentionDays: number;
  latestBackupAt: string | null;
  latestBackupStatus: OpsBackupRunStatus | null;
  restoreTestStatus: string;
  restoreTestPerformedAt: string | null;
  backupFreshnessHours: number | null;
  multiRegionEnabled: boolean;
  readReplicaEnabled: boolean;
};

export type OpsReadinessCheckSummary = {
  id: string;
  checkKey: string;
  title: string;
  description: string;
  status: OpsReadinessStatus;
  category: string;
};

export type OpsReadinessRunSummary = {
  id: string;
  overallStatus: OpsReadinessStatus;
  readyCount: number;
  warningCount: number;
  criticalCount: number;
  unknownCount: number;
  checks: OpsReadinessCheckSummary[];
  executedAt: string;
};

export type OpsOperationalLogSummary = {
  id: string;
  moduleKey: string;
  severity: OpsLogSeverity;
  message: string;
  correlationId: string | null;
  loggedAt: string;
};

export type OpsMaintenanceWindowSummary = {
  id: string;
  title: string;
  description: string | null;
  affectedModules: string[];
  status: OpsMaintenanceWindowStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  serviceNotice: string | null;
};

export type OpsMaintenanceActionSummary = {
  id: string;
  actionType: string;
  subject: string;
  recommendation: string;
  status: OpsMaintenanceActionStatus;
  maintenanceWindowId: string | null;
  checklist: string[];
  rollbackNotes: string | null;
  createdAt: string;
};

export type OpsScalingConfigSummary = {
  horizontalApiScalingEnabled: boolean;
  horizontalWorkerScalingEnabled: boolean;
  queueConcurrencyLimit: number;
  queuePartitionCount: number;
  dbPoolMaxConnections: number;
  aiRequestQueueConcurrency: number;
  searchIndexShards: number;
  webhookConcurrency: number;
  multiRegionReady: boolean;
  multiRegionActive: boolean;
};

export type OpsPlatformConfigSummary = {
  warningThresholds: Record<string, unknown>;
  hardInfrastructureLimits: Record<string, unknown>;
  backupRetentionDays: number;
  logRetentionDays: number;
  recoveryPointObjectiveMinutes: number | null;
  recoveryTimeObjectiveMinutes: number | null;
  multiRegionEnabled: boolean;
  readReplicaEnabled: boolean;
};

export type EnterpriseProductionReadinessDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  overallHealthStatus: OpsHealthStatus;
  systemHealth: OpsServiceHealthSummary[];
  performance: OpsPerformanceSummary | null;
  aiProviders: OpsAiProviderMonitoringSummary[];
  backupPolicies: OpsBackupPolicySummary[];
  recentBackupRuns: OpsBackupRunSummary[];
  recovery: OpsRecoveryReadinessSummary;
  latestReadinessRun: OpsReadinessRunSummary | null;
  recentLogs: OpsOperationalLogSummary[];
  maintenanceWindows: OpsMaintenanceWindowSummary[];
  maintenanceActions: OpsMaintenanceActionSummary[];
  scaling: OpsScalingConfigSummary;
  platformConfig: OpsPlatformConfigSummary;
};

export type EnterpriseProductionReadinessAuraContext = {
  summary: string;
  overallHealthStatus: OpsHealthStatus;
  moduleCount: number;
  unhealthyModuleCount: number;
  queueDepth: number;
  backupPolicyCount: number;
  pendingMaintenanceActionCount: number;
  readinessStatus: OpsReadinessStatus | null;
};

export type CreateOpsBackupPolicyRequest = {
  policyKey: string;
  name: string;
  description?: string;
  scheduleCron?: string;
  retentionDays?: number;
  isEnabled?: boolean;
};

export type CreateOpsMaintenanceWindowRequest = {
  title: string;
  description?: string;
  affectedModules?: string[];
  scheduledStartAt: string;
  scheduledEndAt: string;
  serviceNotice?: string;
};

export type CreateOpsMaintenanceActionRequest = {
  actionType: string;
  subject: string;
  recommendation: string;
  maintenanceWindowId?: string;
  checklist?: string[];
  rollbackNotes?: string;
  payload?: Record<string, unknown>;
};

export type UpdateOpsPlatformConfigRequest = {
  warningThresholds?: Record<string, unknown>;
  hardInfrastructureLimits?: Record<string, unknown>;
  backupRetentionDays?: number;
  logRetentionDays?: number;
  recoveryPointObjectiveMinutes?: number | null;
  recoveryTimeObjectiveMinutes?: number | null;
  multiRegionEnabled?: boolean;
  readReplicaEnabled?: boolean;
};

export type UpdateOpsScalingConfigRequest = {
  horizontalApiScalingEnabled?: boolean;
  horizontalWorkerScalingEnabled?: boolean;
  queueConcurrencyLimit?: number;
  queuePartitionCount?: number;
  dbPoolMaxConnections?: number;
  aiRequestQueueConcurrency?: number;
  searchIndexShards?: number;
  webhookConcurrency?: number;
  multiRegionReady?: boolean;
};

export type OpsLogSearchRequest = {
  moduleKey?: string;
  severity?: OpsLogSeverity;
  from?: string;
  to?: string;
  correlationId?: string;
  limit?: number;
};

export const OPS_SERVICE_MODULES: OpsServiceModule[] = [
  'api_gateway',
  'authentication',
  'database',
  'cache',
  'background_workers',
  'queue_services',
  'ai_orchestration',
  'ai_provider_gateway',
  'aura_agent_runtime',
  'mission_control',
  'knowledge_graph',
  'digital_twin',
  'evolution_platform',
  'saas_platform',
  'developer_platform',
  'automation_studio',
  'integrations',
  'crm',
  'jobs',
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'finance',
  'communications',
  'customer_portal',
];
