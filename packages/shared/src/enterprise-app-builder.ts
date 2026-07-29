import type { EnterpriseDeveloperPlatformDashboard } from './enterprise-developer-platform.js';

export type AbPlatformConfigSummary = {
  autoApproveRules: Record<string, unknown>;
  deploymentStandards: Record<string, unknown>;
  testingRequirements: Record<string, unknown>;
  documentationPolicy: Record<string, unknown>;
  rollbackPolicy: Record<string, unknown>;
  ownerApprovalRequiredAreas: Record<string, unknown>;
  auditRetentionDays: number;
};

export type AbFeatureRequestSummary = {
  id: string;
  requestKey: string;
  title: string;
  naturalLanguageRequest: string | null;
  requestType: string;
  workflowStatus: string;
  riskLevel: string;
  requestedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AbRequirementsAnalysisSummary = {
  id: string;
  featureRequestId: string;
  estimatedComplexity: string | null;
  riskLevel: string;
  implementationPlan: string | null;
  analyzedAt: string | null;
  createdAt: string;
};

export type AbArchitectureImpactSummary = {
  id: string;
  featureRequestId: string;
  frontendImpact: string | null;
  backendImpact: string | null;
  databaseImpact: string | null;
  apiImpact: string | null;
  sharedTypesImpact: string | null;
  rbacImpact: string | null;
  securityImpact: string | null;
  tenantIsolationImpact: string | null;
  affectedModules: Record<string, unknown>;
  breakingChangeRisk: string | null;
  analyzedAt: string | null;
  createdAt: string;
};

export type AbDevelopmentWorkspaceSummary = {
  id: string;
  featureRequestId: string;
  workspaceKey: string;
  branchName: string | null;
  isolationMode: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AbCodeGenerationRecordSummary = {
  id: string;
  featureRequestId: string;
  workspaceId: string | null;
  generationKey: string;
  artifactType: string;
  artifactPath: string | null;
  language: string | null;
  workflowStatus: string;
  generatedAt: string | null;
  createdAt: string;
};

export type AbDatabaseChangePlanSummary = {
  id: string;
  featureRequestId: string;
  migrationKey: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  requiresOwnerApproval: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type AbTestRunSummary = {
  id: string;
  featureRequestId: string;
  runKey: string;
  testSuite: string;
  workflowStatus: string;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AbPreviewRecordSummary = {
  id: string;
  featureRequestId: string;
  previewKey: string;
  previewUrl: string | null;
  changeSummary: string | null;
  databaseImpact: string | null;
  apiImpact: string | null;
  performanceImpact: string | null;
  securityImpact: string | null;
  capturedAt: string;
  createdAt: string;
};

export type AbApprovalRecordSummary = {
  id: string;
  featureRequestId: string;
  approvalType: string;
  workflowStatus: string;
  approvedByUserId: string | null;
  rejectedReason: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type AbDeploymentSummary = {
  id: string;
  featureRequestId: string;
  deploymentKey: string;
  environment: string;
  workflowStatus: string;
  version: string | null;
  deployedByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  verificationStatus: string | null;
  createdAt: string;
};

export type AbRollbackSummary = {
  id: string;
  deploymentId: string;
  rollbackKey: string;
  reason: string | null;
  workflowStatus: string;
  executedByUserId: string | null;
  executedAt: string | null;
  verified: boolean;
  createdAt: string;
};

export type AbDocumentationUpdateSummary = {
  id: string;
  featureRequestId: string;
  docType: string;
  docPath: string | null;
  changeSummary: string | null;
  workflowStatus: string;
  updatedAt: string;
  createdAt: string;
};

export type AbFeatureRegistryEntrySummary = {
  id: string;
  registryKey: string;
  featureType: string;
  name: string;
  description: string | null;
  version: string;
  status: string;
  ownerUserId: string | null;
  moduleKey: string | null;
  routePath: string | null;
  apiPath: string | null;
  createdAt: string;
};

export type AbAppBuilderAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  featureRequestId: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type AbActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  featureRequestId: string | null;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type AbAnalyticsSummary = {
  featureRequestCount: number;
  pendingApprovalCount: number;
  activeWorkspaceCount: number;
  failedTestCount: number;
  failedDeploymentCount: number;
  openAlertCount: number;
  registryEntryCount: number;
  overallBuildHealthStatus: string;
  capturedAt: string;
};

export type AbAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AbBuildMonitoringSummary = {
  activeFeatureRequestCount: number;
  pendingApprovalCount: number;
  failedBuildCount: number;
  failedTestCount: number;
  pendingDeploymentCount: number;
  openAlertCount: number;
  alerts: string[];
};

export type EnterpriseAppBuilderDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: AbPlatformConfigSummary;
  legacyDeveloperPlatform: EnterpriseDeveloperPlatformDashboard | null;
  featureRequestCount: number;
  pendingApprovalCount: number;
  activeWorkspaceCount: number;
  failedTestCount: number;
  failedDeploymentCount: number;
  openAlertCount: number;
  registryEntryCount: number;
  overallBuildHealthStatus: string;
  buildMonitoring: AbBuildMonitoringSummary;
  analytics: AbAnalyticsSummary | null;
  recentFeatureRequests: AbFeatureRequestSummary[];
  recentRequirements: AbRequirementsAnalysisSummary[];
  recentArchitectureImpacts: AbArchitectureImpactSummary[];
  recentWorkspaces: AbDevelopmentWorkspaceSummary[];
  recentTestRuns: AbTestRunSummary[];
  recentPreviews: AbPreviewRecordSummary[];
  recentApprovals: AbApprovalRecordSummary[];
  recentDeployments: AbDeploymentSummary[];
  recentRollbacks: AbRollbackSummary[];
  recentRegistryEntries: AbFeatureRegistryEntrySummary[];
  recentAlerts: AbAppBuilderAlertSummary[];
};

export type EnterpriseAppBuilderAuraContext = {
  summary: string;
  featureRequestCount: number;
  pendingApprovalCount: number;
  activeWorkspaceCount: number;
  failedTestCount: number;
  failedDeploymentCount: number;
  openAlertCount: number;
  registryEntryCount: number;
  overallBuildHealthStatus: string;
};

export type UpdateAbPlatformConfigRequest = {
  autoApproveRules?: Record<string, unknown>;
  deploymentStandards?: Record<string, unknown>;
  testingRequirements?: Record<string, unknown>;
  documentationPolicy?: Record<string, unknown>;
  rollbackPolicy?: Record<string, unknown>;
  ownerApprovalRequiredAreas?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateAbFeatureRequestRequest = {
  requestKey: string;
  title: string;
  naturalLanguageRequest?: string;
  requestType: string;
  workflowStatus?: string;
  riskLevel?: string;
  requestedByUserId?: string;
  config?: Record<string, unknown>;
};

export type CreateAbRequirementsAnalysisRequest = {
  featureRequestId: string;
  functionalRequirements?: Record<string, unknown>;
  technicalRequirements?: Record<string, unknown>;
  acceptanceCriteria?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  estimatedComplexity?: string;
  riskLevel?: string;
  implementationPlan?: string;
  analyzedAt?: string;
};

export type CreateAbDevelopmentWorkspaceRequest = {
  featureRequestId: string;
  workspaceKey: string;
  branchName?: string;
  isolationMode?: string;
  status?: string;
  filesChanged?: Record<string, unknown>;
  startedAt?: string;
};

export type CreateAbCodeGenerationRecordRequest = {
  featureRequestId: string;
  workspaceId?: string;
  generationKey: string;
  artifactType: string;
  artifactPath?: string;
  language?: string;
  workflowStatus?: string;
  generatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type CreateAbDatabaseChangePlanRequest = {
  featureRequestId: string;
  migrationKey: string;
  description?: string;
  impactAnalysis?: Record<string, unknown>;
  conflictDetection?: Record<string, unknown>;
  breakingChanges?: Record<string, unknown>;
  estimatedDurationMinutes?: number;
  requiresOwnerApproval?: boolean;
  workflowStatus?: string;
};

export type CreateAbTestRunRequest = {
  featureRequestId: string;
  runKey: string;
  testSuite: string;
  workflowStatus?: string;
  passedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  startedAt?: string;
  completedAt?: string;
  results?: Record<string, unknown>;
};

export type CreateAbPreviewRecordRequest = {
  featureRequestId: string;
  previewKey: string;
  previewUrl?: string;
  changeSummary?: string;
  filesModified?: Record<string, unknown>;
  databaseImpact?: string;
  apiImpact?: string;
  performanceImpact?: string;
  securityImpact?: string;
  capturedAt?: string;
};

export type CreateAbApprovalRecordRequest = {
  featureRequestId: string;
  approvalType: string;
  workflowStatus?: string;
  requiredAreas?: Record<string, unknown>;
  approvedByUserId?: string;
  rejectedReason?: string;
  approvedAt?: string;
};

export type CreateAbDeploymentRequest = {
  featureRequestId: string;
  deploymentKey: string;
  environment: string;
  workflowStatus?: string;
  version?: string;
  deployedByUserId?: string;
  startedAt?: string;
  completedAt?: string;
  verificationStatus?: string;
};

export type CreateAbRollbackRequest = {
  deploymentId: string;
  rollbackKey: string;
  reason?: string;
  workflowStatus?: string;
  executedByUserId?: string;
  executedAt?: string;
  verified?: boolean;
};

export type CreateAbDocumentationUpdateRequest = {
  featureRequestId: string;
  docType: string;
  docPath?: string;
  changeSummary?: string;
  workflowStatus?: string;
  updatedAt?: string;
};

export type CreateAbFeatureRegistryEntryRequest = {
  registryKey: string;
  featureType: string;
  name: string;
  description?: string;
  version?: string;
  status?: string;
  ownerUserId?: string;
  dependencies?: Record<string, unknown>;
  moduleKey?: string;
  routePath?: string;
  apiPath?: string;
};

export type CreateAbAppBuilderActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  featureRequestId?: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
  workflowStatus?: string;
};

export type UpdateAbFeatureRequestRequest = Partial<CreateAbFeatureRequestRequest> & {
  workflowStatus?: string;
};

export type UpdateAbDeploymentRequest = Partial<CreateAbDeploymentRequest> & {
  workflowStatus?: string;
  startedAt?: string;
  completedAt?: string;
  verificationStatus?: string;
};

export type UpdateAbApprovalRecordRequest = Partial<CreateAbApprovalRecordRequest> & {
  workflowStatus?: string;
  approvedAt?: string;
};

export type ExecuteAbSafeBuildActionRequest = {
  actionKey: string;
  input?: Record<string, unknown>;
};
