export type LncCheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped' | 'blocked';

export type LncReadinessStatus = 'not_ready' | 'blocked' | 'warning' | 'ready' | 'unknown';

export type LncCheckCategory =
  | 'platform'
  | 'tenant'
  | 'feature'
  | 'integration'
  | 'infrastructure'
  | 'security'
  | 'mobile'
  | 'saas'
  | 'authentication'
  | 'rbac'
  | 'database'
  | 'api'
  | 'workers'
  | 'scheduler'
  | 'ai'
  | 'connectors'
  | 'payments'
  | 'accounting'
  | 'fleet'
  | 'communications'
  | 'notifications'
  | 'document_ai'
  | 'backup'
  | 'disaster_recovery'
  | 'monitoring'
  | 'audit';

export type LncWizardStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'completed' | 'cancelled';

export type LncWizardStepStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked' | 'skipped';

export type LncDeploymentStatus = 'planned' | 'pending_validation' | 'validated' | 'failed' | 'cancelled';

export type LncIssueSeverity = 'info' | 'warning' | 'high' | 'critical';

export type LncPlatformConfigSummary = {
  readinessPolicy: Record<string, unknown>;
  scoringWeights: Record<string, unknown>;
  acceptancePolicy: Record<string, unknown>;
  goLivePolicy: Record<string, unknown>;
  rollbackPolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type UpdateLncPlatformConfigRequest = Partial<LncPlatformConfigSummary>;

export type LncReadinessScanSummary = {
  id: string;
  scanKey: string;
  status: LncCheckStatus;
  overallStatus: LncReadinessStatus;
  checkCount: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  criticalBlockerCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type LncReadinessCheckResultSummary = {
  id: string;
  readinessScanId: string;
  checkKey: string;
  checkName: string;
  category: LncCheckCategory | null;
  status: LncCheckStatus;
  severity: LncIssueSeverity;
  message: string | null;
  recommendation: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type LncReadinessScanDetailSummary = LncReadinessScanSummary & {
  results: LncReadinessCheckResultSummary[];
};

export type LncAcceptanceTestSuiteSummary = {
  id: string;
  suiteKey: string;
  suiteName: string;
  description: string | null;
  isEnabled: boolean;
  testKeys: string[];
  createdAt: string;
};

export type LncAcceptanceTestRunSummary = {
  id: string;
  suiteId: string | null;
  runKey: string;
  status: LncCheckStatus;
  testCount: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type LncAcceptanceTestResultSummary = {
  id: string;
  acceptanceTestRunId: string;
  testKey: string;
  testName: string;
  status: LncCheckStatus;
  message: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type LncAcceptanceTestRunDetailSummary = LncAcceptanceTestRunSummary & {
  results: LncAcceptanceTestResultSummary[];
};

export type LncReadinessScoreSummary = {
  id: string;
  readinessScanId: string | null;
  overallScore: number | null;
  overallStatus: LncReadinessStatus;
  criticalBlockerCount: number;
  highPriorityCount: number;
  warningCount: number;
  passedCount: number;
  recommendations: Array<Record<string, unknown>>;
  scoreBreakdown: Record<string, unknown>;
  capturedAt: string;
};

export type LncGoLiveWizardStepSummary = {
  id: string;
  stepKey: string;
  stepName: string;
  stepOrder: number;
  status: LncWizardStepStatus;
  completedAt: string | null;
  notes: string | null;
};

export type LncGoLiveWizardSummary = {
  id: string;
  wizardKey: string;
  title: string;
  status: LncWizardStatus;
  currentStepKey: string | null;
  ownerUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  steps: LncGoLiveWizardStepSummary[];
};

export type LncRollbackPlanLinkSummary = {
  id: string;
  goLiveWizardId: string | null;
  recoveryPlanId: string | null;
  planName: string;
  planDescription: string | null;
  isSelected: boolean;
  validationStatus: LncCheckStatus;
  validationReport: Record<string, unknown>;
  createdAt: string;
};

export type LncDeploymentValidationSummary = {
  id: string;
  goLiveWizardId: string | null;
  validationKey: string;
  status: LncDeploymentStatus;
  deploymentRecordId: string | null;
  passedCheckCount: number;
  failedCheckCount: number;
  report: Record<string, unknown>;
  validatedAt: string | null;
  createdAt: string;
};

export type LncPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type LncAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type LncAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type LncActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type CreateLncActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type CreateLncGoLiveWizardRequest = {
  title: string;
  ownerUserId?: string;
};

export type ApproveLncGoLiveWizardRequest = {
  notes?: string;
};

export type UpdateLncGoLiveWizardStepRequest = {
  status: LncWizardStepStatus;
  notes?: string;
};

export type SelectLncRollbackPlanRequest = {
  rollbackPlanLinkId: string;
};

export type LncLaunchReadinessSummary = {
  overallScore: number | null;
  overallStatus: LncReadinessStatus;
  criticalBlockerCount: number;
  highPriorityCount: number;
  warningCount: number;
  passedCheckCount: number;
  pendingApprovalCount: number;
  deploymentStatus: string | null;
};

export type EnterpriseLaunchCenterDashboard = {
  summary: string;
  platformConfig: LncPlatformConfigSummary;
  launchReadiness: LncLaunchReadinessSummary;
  latestReadinessScan: LncReadinessScanSummary | null;
  latestReadinessScore: LncReadinessScoreSummary | null;
  latestCheckResults: LncReadinessCheckResultSummary[];
  acceptanceTestSuites: LncAcceptanceTestSuiteSummary[];
  acceptanceTestRuns: LncAcceptanceTestRunSummary[];
  goLiveWizards: LncGoLiveWizardSummary[];
  rollbackPlanLinks: LncRollbackPlanLinkSummary[];
  deploymentValidations: LncDeploymentValidationSummary[];
  integrations: Array<{ key: string; status: string; provider: string | null }>;
  securitySummary: Record<string, unknown>;
  analytics: LncAnalyticsSummary | null;
  recentAlerts: LncPlatformAlertSummary[];
  openAlertCount: number;
  overallLaunchReadinessStatus: string;
};

export type EnterpriseLaunchCenterAuraContext = {
  summary: string;
  overallScore: number | null;
  criticalBlockerCount: number;
  failedCheckCount: number;
  pendingApprovalCount: number;
  openAlertCount: number;
  overallLaunchReadinessStatus: string;
};
