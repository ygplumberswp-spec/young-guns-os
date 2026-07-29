import { request, ApiClientError } from './api-client';
import type {
  EnterpriseItOperationsDashboard,
  ItoApiReliabilitySnapshotSummary,
  ItoAiProviderHealthSummary,
  ItoBackupVerificationSummary,
  ItoBuildRecordSummary,
  ItoDatabaseHealthSnapshotSummary,
  ItoDependencyRecordSummary,
  ItoIntegrationHealthSummary,
  ItoPerformanceSnapshotSummary,
  ItoSelfHealingActionSummary,
  ItoTechnicalDebtRecordSummary,
  ItoTestRunSummary,
  UpdateItoPlatformConfigRequest,
} from '@titan/shared';

type ItoAuditLogEntry = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export { ApiClientError as EnterpriseItOperationsApiClientError };

export async function fetchItOperationsDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseItOperationsDashboard }>(
    '/enterprise-it-operations/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureItAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-it-operations/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function syncItAlerts(accessToken: string) {
  const data = await request<{ itAlerts: unknown[] }>('/enterprise-it-operations/it-alerts/sync', {
    method: 'POST',
    accessToken,
  });
  return data.itAlerts;
}

export async function syncItBugDetections(accessToken: string) {
  const data = await request<{ bugDetections: unknown[] }>('/enterprise-it-operations/bug-detections/sync', {
    method: 'POST',
    accessToken,
  });
  return data.bugDetections;
}

export async function captureItHealthSignals(accessToken: string) {
  const data = await request<{ captured: boolean }>('/enterprise-it-operations/health-signals/capture', {
    method: 'POST',
    accessToken,
  });
  return data.captured;
}

export async function fetchItBuildRecords(accessToken: string) {
  const data = await request<{ buildrecords: ItoBuildRecordSummary[] }>('/enterprise-it-operations/build-records', {
    accessToken,
  });
  return data.buildrecords;
}

export async function fetchItTestRuns(accessToken: string) {
  const data = await request<{ testruns: ItoTestRunSummary[] }>('/enterprise-it-operations/test-runs', {
    accessToken,
  });
  return data.testruns;
}

export async function fetchItDatabaseHealthSnapshots(accessToken: string) {
  const data = await request<{ databaseHealthSnapshots: ItoDatabaseHealthSnapshotSummary[] }>(
    '/enterprise-it-operations/database-health-snapshots',
    { accessToken },
  );
  return data.databaseHealthSnapshots;
}

export async function fetchItApiReliabilitySnapshots(accessToken: string) {
  const data = await request<{ apiReliabilitySnapshots: ItoApiReliabilitySnapshotSummary[] }>(
    '/enterprise-it-operations/api-reliability-snapshots',
    { accessToken },
  );
  return data.apiReliabilitySnapshots;
}

export async function fetchItAiProviderHealth(accessToken: string) {
  const data = await request<{ aiProviderHealth: ItoAiProviderHealthSummary[] }>(
    '/enterprise-it-operations/ai-provider-health',
    { accessToken },
  );
  return data.aiProviderHealth;
}

export async function fetchItIntegrationHealth(accessToken: string) {
  const data = await request<{ integrationHealth: ItoIntegrationHealthSummary[] }>(
    '/enterprise-it-operations/integration-health',
    { accessToken },
  );
  return data.integrationHealth;
}

export async function fetchItPerformanceSnapshots(accessToken: string) {
  const data = await request<{ performanceSnapshots: ItoPerformanceSnapshotSummary[] }>(
    '/enterprise-it-operations/performance-snapshots',
    { accessToken },
  );
  return data.performanceSnapshots;
}

export async function fetchItBackupVerifications(accessToken: string) {
  const data = await request<{ backupverifications: ItoBackupVerificationSummary[] }>(
    '/enterprise-it-operations/backup-verifications',
    { accessToken },
  );
  return data.backupverifications;
}

export async function fetchItTechnicalDebtRecords(accessToken: string) {
  const data = await request<{ technicaldebtrecords: ItoTechnicalDebtRecordSummary[] }>(
    '/enterprise-it-operations/technical-debt-records',
    { accessToken },
  );
  return data.technicaldebtrecords;
}

export async function fetchItDependencyRecords(accessToken: string) {
  const data = await request<{ dependencyrecords: ItoDependencyRecordSummary[] }>(
    '/enterprise-it-operations/dependency-records',
    { accessToken },
  );
  return data.dependencyrecords;
}

export async function fetchItSelfHealingActions(accessToken: string) {
  const data = await request<{ selfHealingActions: ItoSelfHealingActionSummary[] }>(
    '/enterprise-it-operations/self-healing-actions',
    { accessToken },
  );
  return data.selfHealingActions;
}

export async function fetchItAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: ItoAuditLogEntry[] }>('/enterprise-it-operations/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function updateItPlatformConfig(accessToken: string, body: UpdateItoPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-it-operations/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}
