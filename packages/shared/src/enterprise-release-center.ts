export type RcValidationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export type RcReleaseStatus = 'not_ready' | 'blocked' | 'warning' | 'ready' | 'unknown';

export type RcIntegrationCategory =
  | 'authentication'
  | 'rbac'
  | 'multi_tenancy'
  | 'crm'
  | 'leads'
  | 'customers'
  | 'jobs'
  | 'scheduling'
  | 'dispatch'
  | 'fleet'
  | 'inventory'
  | 'procurement'
  | 'finance'
  | 'payments'
  | 'xero'
  | 'connectors'
  | 'communications'
  | 'whatsapp'
  | 'email'
  | 'voice_reception'
  | 'documents'
  | 'document_ai'
  | 'knowledge_graph'
  | 'ai_orchestration'
  | 'mission_control'
  | 'security'
  | 'saas'
  | 'industry_packs'
  | 'business_continuity'
  | 'launch_center';

export type RcWorkflowCategory =
  | 'lead_to_customer'
  | 'quote_to_job'
  | 'dispatch'
  | 'completion'
  | 'invoice'
  | 'payment'
  | 'customer_history'
  | 'procurement'
  | 'inventory'
  | 'fleet'
  | 'notifications'
  | 'automation'
  | 'ai_workflow'
  | 'customer_portal'
  | 'mobile';

export type RcInsightSeverity = 'info' | 'warning' | 'high' | 'critical';

export type RcChecklistStatus = 'pending' | 'passed' | 'failed' | 'skipped' | 'manual';

export type RcPlatformConfigSummary = {
  validationPolicy: Record<string, unknown>;
  performancePolicy: Record<string, unknown>;
  releasePolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type UpdateRcPlatformConfigRequest = Partial<RcPlatformConfigSummary>;

export type RcIntegrationValidationRunSummary = {
  id: string;
  runKey: string;
  status: RcValidationStatus;
  checkCount: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type RcIntegrationValidationResultSummary = {
  id: string;
  validationRunId: string;
  checkKey: string;
  checkName: string;
  category: RcIntegrationCategory | null;
  status: RcValidationStatus;
  severity: RcInsightSeverity;
  message: string | null;
  recommendation: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type RcIntegrationValidationRunDetailSummary = RcIntegrationValidationRunSummary & {
  results: RcIntegrationValidationResultSummary[];
};

export type RcWorkflowValidationRunSummary = {
  id: string;
  runKey: string;
  status: RcValidationStatus;
  stepCount: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type RcWorkflowValidationResultSummary = {
  id: string;
  workflowRunId: string;
  stepKey: string;
  stepName: string;
  category: RcWorkflowCategory | null;
  status: RcValidationStatus;
  message: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type RcWorkflowValidationRunDetailSummary = RcWorkflowValidationRunSummary & {
  results: RcWorkflowValidationResultSummary[];
};

export type RcPerformanceSnapshotSummary = {
  id: string;
  snapshotKey: string;
  slowEndpointCount: number;
  slowQueryCount: number;
  queueDepth: number;
  aiLatencyMs: number | null;
  searchIndexCount: number;
  dashboardLoadMs: number | null;
  optimizationOpportunities: Array<Record<string, unknown>>;
  capturedAt: string;
};

export type RcSecurityVerificationRunSummary = {
  id: string;
  runKey: string;
  status: RcValidationStatus;
  findingCount: number;
  criticalCount: number;
  warningCount: number;
  report: Record<string, unknown>;
  completedAt: string | null;
  createdAt: string;
};

export type RcConfigurationReviewSummary = {
  id: string;
  reviewKey: string;
  missingConfigCount: number;
  warningCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type RcReleaseCandidateReportSummary = {
  id: string;
  reportKey: string;
  readinessScore: number | null;
  overallStatus: RcReleaseStatus;
  passedValidationCount: number;
  failedValidationCount: number;
  warningCount: number;
  optimizationCount: number;
  manualTaskCount: number;
  report: Record<string, unknown>;
  generatedAt: string;
};

export type RcReleaseChecklistItemSummary = {
  id: string;
  itemKey: string;
  itemName: string;
  category: string;
  status: RcChecklistStatus;
  isRequired: boolean;
  notes: string | null;
  completedAt: string | null;
};

export type RcPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type RcAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type RcAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type RcActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type CreateRcActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type RcReleaseReadinessSummary = {
  readinessScore: number | null;
  overallStatus: RcReleaseStatus;
  failedValidationCount: number;
  warningCount: number;
  optimizationCount: number;
  configurationWarningCount: number;
  securityAlertCount: number;
  passedChecklistCount: number;
  pendingChecklistCount: number;
};

export type EnterpriseReleaseCenterDashboard = {
  summary: string;
  platformConfig: RcPlatformConfigSummary;
  releaseReadiness: RcReleaseReadinessSummary;
  latestIntegrationRun: RcIntegrationValidationRunSummary | null;
  latestIntegrationResults: RcIntegrationValidationResultSummary[];
  latestWorkflowRun: RcWorkflowValidationRunSummary | null;
  latestWorkflowResults: RcWorkflowValidationResultSummary[];
  latestPerformanceSnapshot: RcPerformanceSnapshotSummary | null;
  latestSecurityVerification: RcSecurityVerificationRunSummary | null;
  latestConfigurationReview: RcConfigurationReviewSummary | null;
  latestReleaseReport: RcReleaseCandidateReportSummary | null;
  releaseChecklist: RcReleaseChecklistItemSummary[];
  analytics: RcAnalyticsSummary | null;
  recentAlerts: RcPlatformAlertSummary[];
  openAlertCount: number;
  overallReleaseStatus: string;
};

export type EnterpriseReleaseCenterAuraContext = {
  summary: string;
  readinessScore: number | null;
  failedValidationCount: number;
  warningCount: number;
  optimizationCount: number;
  openAlertCount: number;
  overallReleaseStatus: string;
};
