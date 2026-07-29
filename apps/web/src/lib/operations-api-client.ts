import type {
  CreateOpsBackupPolicyRequest,
  CreateOpsMaintenanceActionRequest,
  CreateOpsMaintenanceWindowRequest,
  EnterpriseProductionReadinessDashboard,
  UpdateOpsPlatformConfigRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as OperationsApiClientError };

export async function fetchOperationsDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseProductionReadinessDashboard }>('/operations/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function captureOperationsHealth(accessToken: string) {
  const data = await request<{ snapshots: EnterpriseProductionReadinessDashboard['systemHealth'] }>(
    '/operations/health/capture',
    { accessToken, method: 'POST' },
  );
  return data.snapshots;
}

export async function captureOperationsPerformance(accessToken: string) {
  const data = await request<{ snapshot: NonNullable<EnterpriseProductionReadinessDashboard['performance']> }>(
    '/operations/performance/capture',
    { accessToken, method: 'POST' },
  );
  return data.snapshot;
}

export async function runOperationsReadinessChecks(accessToken: string) {
  const data = await request<{ run: NonNullable<EnterpriseProductionReadinessDashboard['latestReadinessRun']> }>(
    '/operations/readiness/run',
    { accessToken, method: 'POST' },
  );
  return data.run;
}

export async function syncOperationsLogs(accessToken: string) {
  const data = await request<{ logs: EnterpriseProductionReadinessDashboard['recentLogs'] }>(
    '/operations/logs/sync',
    { accessToken, method: 'POST' },
  );
  return data.logs;
}

export async function syncOperationsAlerts(accessToken: string) {
  const data = await request<{ candidates: Array<{ title: string; description: string; severity: string }> }>(
    '/operations/alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.candidates;
}

export async function createBackupPolicy(accessToken: string, body: CreateOpsBackupPolicyRequest) {
  const data = await request<{ policy: EnterpriseProductionReadinessDashboard['backupPolicies'][number] }>(
    '/operations/backup-policies',
    { accessToken, method: 'POST', body },
  );
  return data.policy;
}

export async function createMaintenanceWindow(accessToken: string, body: CreateOpsMaintenanceWindowRequest) {
  const data = await request<{ window: EnterpriseProductionReadinessDashboard['maintenanceWindows'][number] }>(
    '/operations/maintenance/windows',
    { accessToken, method: 'POST', body },
  );
  return data.window;
}

export async function createMaintenanceAction(accessToken: string, body: CreateOpsMaintenanceActionRequest) {
  const data = await request<{ action: EnterpriseProductionReadinessDashboard['maintenanceActions'][number] }>(
    '/operations/maintenance/actions',
    { accessToken, method: 'POST', body },
  );
  return data.action;
}

export async function updateOperationsPlatformConfig(accessToken: string, body: UpdateOpsPlatformConfigRequest) {
  const data = await request<{ config: EnterpriseProductionReadinessDashboard['platformConfig'] }>(
    '/operations/config/platform',
    { accessToken, method: 'PUT', body },
  );
  return data.config;
}
