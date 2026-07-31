export type PlValidationStatus =
  'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export type PlLaunchStatus = 'not_ready' | 'blocked' | 'warning' | 'ready' | 'launched' | 'unknown';

export type PlProviderCategory =
  'xero' | 'email' | 'whatsapp' | 'sms' | 'payments' | 'cartrack' | 'ai' | 'storage' | 'connectors';

export type PlDeploymentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type PlWizardStatus =
  'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'launched' | 'blocked' | 'cancelled';

export type PlWizardStepStatus =
  'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked' | 'skipped';

export type PlInsightSeverity = 'info' | 'warning' | 'high' | 'critical';

export type PlPlatformConfigSummary = {
  deploymentPolicy: Record<string, unknown>;
  providerPolicy: Record<string, unknown>;
  launchPolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type UpdatePlPlatformConfigRequest = Partial<PlPlatformConfigSummary>;

export type PlEnvironmentReviewSummary = {
  id: string;
  reviewKey: string;
  status: PlValidationStatus;
  missingConfigCount: number;
  warningCount: number;
  passedCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type PlDomainSecurityReviewSummary = {
  id: string;
  reviewKey: string;
  status: PlValidationStatus;
  findingCount: number;
  criticalCount: number;
  warningCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type PlLiveIntegrationVerificationRunSummary = {
  id: string;
  runKey: string;
  status: PlValidationStatus;
  providerCount: number;
  connectedCount: number;
  failedCount: number;
  warningCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PlLiveIntegrationVerificationResultSummary = {
  id: string;
  verificationRunId: string;
  providerKey: string;
  providerName: string;
  category: PlProviderCategory | null;
  status: PlValidationStatus;
  severity: PlInsightSeverity;
  message: string | null;
  recommendation: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type PlLiveIntegrationVerificationRunDetailSummary =
  PlLiveIntegrationVerificationRunSummary & {
    results: PlLiveIntegrationVerificationResultSummary[];
  };

export type PlDeploymentPipelineRunSummary = {
  id: string;
  runKey: string;
  status: PlDeploymentStatus;
  environment: string;
  healthVerified: boolean;
  smokeTestPassed: boolean;
  ownerApproved: boolean;
  approvedAt: string | null;
  deployedAt: string | null;
  rolledBackAt: string | null;
  smokeTests: Array<Record<string, unknown>>;
  deploymentReport: Record<string, unknown>;
  createdAt: string;
};

export type PlCommercialReadinessReviewSummary = {
  id: string;
  reviewKey: string;
  status: PlValidationStatus;
  findingCount: number;
  warningCount: number;
  report: Record<string, unknown>;
  reviewedAt: string;
};

export type PlMobileProductionReviewSummary = {
  id: string;
  reviewKey: string;
  status: PlValidationStatus;
  findingCount: number;
  warningCount: number;
  report: Record<string, unknown>;
  reviewedAt: string;
};

export type PlGoLiveWizardStepSummary = {
  id: string;
  stepKey: string;
  stepName: string;
  stepOrder: number;
  status: PlWizardStepStatus;
  notes: string | null;
  completedAt: string | null;
};

export type PlGoLiveWizardSummary = {
  id: string;
  wizardKey: string;
  title: string;
  status: PlWizardStatus;
  currentStepKey: string | null;
  ownerUserId: string | null;
  approvedAt: string | null;
  launchedAt: string | null;
  launchConfirmed: boolean;
  steps: PlGoLiveWizardStepSummary[];
  createdAt: string;
};

export type CreatePlGoLiveWizardRequest = {
  title: string;
  ownerUserId?: string;
};

export type UpdatePlGoLiveWizardStepRequest = {
  status: PlWizardStepStatus;
  notes?: string;
};

export type ApprovePlGoLiveWizardRequest = {
  notes?: string;
};

export type CreatePlDeploymentRunRequest = {
  environment?: string;
  title?: string;
};

export type ApprovePlDeploymentRunRequest = {
  notes?: string;
};

export type PlPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type PlAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type PlAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type PlActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type CreatePlActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type PlProductionReadinessSummary = {
  launchStatus: PlLaunchStatus;
  environmentReady: boolean;
  providersConnected: boolean;
  domainSecurityReady: boolean;
  commercialReady: boolean;
  mobileReady: boolean;
  deploymentApproved: boolean;
  wizardApproved: boolean;
  failedProviderCount: number;
  missingConfigCount: number;
  pendingApprovalCount: number;
};

export type EnterpriseProductionLaunchDashboard = {
  summary: string;
  platformConfig: PlPlatformConfigSummary;
  productionReadiness: PlProductionReadinessSummary;
  latestEnvironmentReview: PlEnvironmentReviewSummary | null;
  latestDomainSecurityReview: PlDomainSecurityReviewSummary | null;
  latestLiveIntegrationRun: PlLiveIntegrationVerificationRunSummary | null;
  latestLiveIntegrationResults: PlLiveIntegrationVerificationResultSummary[];
  latestDeploymentRun: PlDeploymentPipelineRunSummary | null;
  deploymentHistory: PlDeploymentPipelineRunSummary[];
  latestCommercialReview: PlCommercialReadinessReviewSummary | null;
  latestMobileReview: PlMobileProductionReviewSummary | null;
  goLiveWizards: PlGoLiveWizardSummary[];
  releaseCenterSummary: Record<string, unknown> | null;
  analytics: PlAnalyticsSummary | null;
  recentAlerts: PlPlatformAlertSummary[];
  openAlertCount: number;
  overallProductionStatus: string;
};

export type EnterpriseProductionLaunchAuraContext = {
  summary: string;
  launchStatus: PlLaunchStatus;
  failedProviderCount: number;
  missingConfigCount: number;
  pendingApprovalCount: number;
  openAlertCount: number;
  overallProductionStatus: string;
};
