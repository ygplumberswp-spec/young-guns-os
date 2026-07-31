import { request, ApiClientError } from './api-client';
import type {
  AbActionDraftSummary,
  AbAppBuilderAlertSummary,
  AbApprovalRecordSummary,
  AbArchitectureImpactSummary,
  AbAuditLogSummary,
  AbCodeGenerationRecordSummary,
  AbDatabaseChangePlanSummary,
  AbDeploymentSummary,
  AbDevelopmentWorkspaceSummary,
  AbDocumentationUpdateSummary,
  AbFeatureRegistryEntrySummary,
  AbFeatureRequestSummary,
  AbPreviewRecordSummary,
  AbRequirementsAnalysisSummary,
  AbRollbackSummary,
  AbTestRunSummary,
  EnterpriseAppBuilderDashboard,
} from '@titan/shared';

export { ApiClientError as EnterpriseAppBuilderApiClientError };

export async function fetchAppBuilderDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseAppBuilderDashboard }>(
    '/enterprise-app-builder/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function captureAppBuilderAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-app-builder/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function syncAppBuilderAlerts(accessToken: string) {
  const data = await request<{ appBuilderAlerts: AbAppBuilderAlertSummary[] }>(
    '/enterprise-app-builder/app-builder-alerts/sync',
    { method: 'POST', accessToken },
  );
  return data.appBuilderAlerts;
}

export async function analyzeRequirements(accessToken: string, featureRequestId: string) {
  const data = await request<{ requirementsAnalysis: AbRequirementsAnalysisSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/requirements/analyze`,
    { method: 'POST', accessToken },
  );
  return data.requirementsAnalysis;
}

export async function analyzeArchitectureImpact(accessToken: string, featureRequestId: string) {
  const data = await request<{ architectureImpact: AbArchitectureImpactSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/architecture-impact/analyze`,
    { method: 'POST', accessToken },
  );
  return data.architectureImpact;
}

export async function createDevelopmentWorkspace(accessToken: string, featureRequestId: string) {
  const data = await request<{ workspace: AbDevelopmentWorkspaceSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/development-workspaces`,
    { method: 'POST', accessToken },
  );
  return data.workspace;
}

export async function runTestValidation(accessToken: string, featureRequestId: string) {
  const data = await request<{ testRun: AbTestRunSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/test-runs/validate`,
    { method: 'POST', accessToken },
  );
  return data.testRun;
}

export async function createPreview(accessToken: string, featureRequestId: string) {
  const data = await request<{ preview: AbPreviewRecordSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/previews`,
    { method: 'POST', accessToken },
  );
  return data.preview;
}

export async function submitForApproval(accessToken: string, featureRequestId: string) {
  const data = await request<{ approval: AbApprovalRecordSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/approvals/submit`,
    { method: 'POST', accessToken },
  );
  return data.approval;
}

export async function approveFeature(accessToken: string, featureRequestId: string) {
  const data = await request<{ approval: AbApprovalRecordSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/approvals/approve`,
    { method: 'POST', accessToken },
  );
  return data.approval;
}

export async function rejectFeature(accessToken: string, featureRequestId: string, reason: string) {
  const data = await request<{ approval: AbApprovalRecordSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/approvals/reject`,
    { method: 'POST', accessToken, body: { reason } },
  );
  return data.approval;
}

export async function deployApprovedFeature(accessToken: string, featureRequestId: string) {
  const data = await request<{ deployment: AbDeploymentSummary }>(
    `/enterprise-app-builder/feature-requests/${featureRequestId}/deployments/deploy`,
    { method: 'POST', accessToken },
  );
  return data.deployment;
}

export async function rollbackDeployment(
  accessToken: string,
  deploymentId: string,
  reason?: string,
) {
  const data = await request<{ rollback: AbRollbackSummary }>(
    `/enterprise-app-builder/deployments/${deploymentId}/rollbacks`,
    { method: 'POST', accessToken, body: reason ? { reason } : undefined },
  );
  return data.rollback;
}

export async function fetchAbFeatureRequests(accessToken: string) {
  const data = await request<{ featureRequests: AbFeatureRequestSummary[] }>(
    '/enterprise-app-builder/feature-requests',
    { accessToken },
  );
  return data.featureRequests;
}

export async function fetchAbRequirementsAnalyses(accessToken: string) {
  const data = await request<{ requirementsAnalyses: AbRequirementsAnalysisSummary[] }>(
    '/enterprise-app-builder/requirements-analyses',
    { accessToken },
  );
  return data.requirementsAnalyses;
}

export async function fetchAbArchitectureImpacts(accessToken: string) {
  const data = await request<{ architectureImpacts: AbArchitectureImpactSummary[] }>(
    '/enterprise-app-builder/architecture-impact-analyses',
    { accessToken },
  );
  return data.architectureImpacts;
}

export async function fetchAbDevelopmentWorkspaces(accessToken: string) {
  const data = await request<{ workspaces: AbDevelopmentWorkspaceSummary[] }>(
    '/enterprise-app-builder/development-workspaces',
    { accessToken },
  );
  return data.workspaces;
}

export async function fetchAbCodeGenerationRecords(accessToken: string) {
  const data = await request<{ codeGenerationRecords: AbCodeGenerationRecordSummary[] }>(
    '/enterprise-app-builder/code-generation-records',
    { accessToken },
  );
  return data.codeGenerationRecords;
}

export async function fetchAbDatabaseChangePlans(accessToken: string) {
  const data = await request<{ databaseChangePlans: AbDatabaseChangePlanSummary[] }>(
    '/enterprise-app-builder/database-change-plans',
    { accessToken },
  );
  return data.databaseChangePlans;
}

export async function fetchAbTestRuns(accessToken: string) {
  const data = await request<{ testRuns: AbTestRunSummary[] }>(
    '/enterprise-app-builder/test-runs',
    {
      accessToken,
    },
  );
  return data.testRuns;
}

export async function fetchAbPreviewRecords(accessToken: string) {
  const data = await request<{ previewRecords: AbPreviewRecordSummary[] }>(
    '/enterprise-app-builder/preview-records',
    { accessToken },
  );
  return data.previewRecords;
}

export async function fetchAbApprovalRecords(accessToken: string) {
  const data = await request<{ approvalRecords: AbApprovalRecordSummary[] }>(
    '/enterprise-app-builder/approval-records',
    { accessToken },
  );
  return data.approvalRecords;
}

export async function fetchAbDeployments(accessToken: string) {
  const data = await request<{ deployments: AbDeploymentSummary[] }>(
    '/enterprise-app-builder/deployments',
    {
      accessToken,
    },
  );
  return data.deployments;
}

export async function fetchAbRollbacks(accessToken: string) {
  const data = await request<{ rollbacks: AbRollbackSummary[] }>(
    '/enterprise-app-builder/rollbacks',
    {
      accessToken,
    },
  );
  return data.rollbacks;
}

export async function fetchAbDocumentationUpdates(accessToken: string) {
  const data = await request<{ documentationUpdates: AbDocumentationUpdateSummary[] }>(
    '/enterprise-app-builder/documentation-updates',
    { accessToken },
  );
  return data.documentationUpdates;
}

export async function fetchAbFeatureRegistryEntries(accessToken: string) {
  const data = await request<{ registryEntries: AbFeatureRegistryEntrySummary[] }>(
    '/enterprise-app-builder/feature-registry-entries',
    { accessToken },
  );
  return data.registryEntries;
}

export async function fetchAbAppBuilderAlerts(accessToken: string) {
  const data = await request<{ appBuilderAlerts: AbAppBuilderAlertSummary[] }>(
    '/enterprise-app-builder/app-builder-alerts',
    { accessToken },
  );
  return data.appBuilderAlerts;
}

export async function fetchAbActionDrafts(accessToken: string) {
  const data = await request<{ actionDrafts: AbActionDraftSummary[] }>(
    '/enterprise-app-builder/action-drafts',
    { accessToken },
  );
  return data.actionDrafts;
}

export async function fetchAbAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: AbAuditLogSummary[] }>(
    '/enterprise-app-builder/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}
