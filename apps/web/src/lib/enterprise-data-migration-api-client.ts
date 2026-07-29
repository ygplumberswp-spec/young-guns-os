import type {
  DmAuditLogSummary,
  DmEntityType,
  DmImportJobDetailSummary,
  DmImportJobSummary,
  DmMigrationAlertSummary,
  DmSourceFormat,
  EnterpriseDataMigrationDashboard,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchDataMigrationDashboard(accessToken: string): Promise<EnterpriseDataMigrationDashboard> {
  const data = await request<{ dashboard: EnterpriseDataMigrationDashboard }>('/enterprise-data-migration/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function createImportJob(
  accessToken: string,
  input: { title: string; sourceFormat: DmSourceFormat; entityType: DmEntityType },
): Promise<DmImportJobSummary> {
  const data = await request<{ importJob: DmImportJobSummary }>('/enterprise-data-migration/import-jobs', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.importJob;
}

export async function uploadImportFile(
  accessToken: string,
  importJobId: string,
  input: { fileName: string; fileContent: string },
): Promise<DmImportJobSummary> {
  const data = await request<{ importJob: DmImportJobSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}/upload`,
    { accessToken, method: 'POST', body: input },
  );
  return data.importJob;
}

export async function autoMapImportJob(accessToken: string, importJobId: string): Promise<DmImportJobSummary> {
  const data = await request<{ importJob: DmImportJobSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}/auto-map`,
    { accessToken, method: 'POST' },
  );
  return data.importJob;
}

export async function validateImportJob(accessToken: string, importJobId: string): Promise<DmImportJobDetailSummary> {
  const data = await request<{ importJob: DmImportJobDetailSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}/validate`,
    { accessToken, method: 'POST' },
  );
  return data.importJob;
}

export async function approveImportJob(accessToken: string, importJobId: string): Promise<DmImportJobSummary> {
  const data = await request<{ importJob: DmImportJobSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}/approve`,
    { accessToken, method: 'POST' },
  );
  return data.importJob;
}

export async function executeImportJob(accessToken: string, importJobId: string): Promise<DmImportJobDetailSummary> {
  const data = await request<{ importJob: DmImportJobDetailSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}/execute`,
    { accessToken, method: 'POST' },
  );
  return data.importJob;
}

export async function createExportJob(
  accessToken: string,
  input: { title: string; entityType?: DmEntityType; sourceFormat?: DmSourceFormat },
) {
  const data = await request<{ exportJob: unknown }>('/enterprise-data-migration/export-jobs', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.exportJob;
}

export async function executeExportJob(accessToken: string, exportJobId: string) {
  const data = await request<{ exportJob: unknown }>(`/enterprise-data-migration/export-jobs/${exportJobId}/execute`, {
    accessToken,
    method: 'POST',
  });
  return data.exportJob;
}

export async function syncMigrationAlerts(accessToken: string): Promise<DmMigrationAlertSummary[]> {
  const data = await request<{ migrationAlerts: DmMigrationAlertSummary[] }>(
    '/enterprise-data-migration/migration-alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.migrationAlerts;
}

export async function captureDataMigrationAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-data-migration/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchDataMigrationAuditLogs(accessToken: string): Promise<DmAuditLogSummary[]> {
  const data = await request<{ auditLogs: DmAuditLogSummary[] }>('/enterprise-data-migration/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function fetchImportJobDetail(accessToken: string, importJobId: string): Promise<DmImportJobDetailSummary> {
  const data = await request<{ importJob: DmImportJobDetailSummary }>(
    `/enterprise-data-migration/import-jobs/${importJobId}`,
    { accessToken },
  );
  return data.importJob;
}
