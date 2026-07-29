import { request } from './api-client';
import type {
  EnterpriseIndustryPackDashboard,
  IpCertificateSummary,
  IpComplianceFrameworkSummary,
  IpEquipmentCatalogSummary,
  IpIndustryAlertSummary,
  IpPackCatalogSummary,
  IpPackInstallationSummary,
  IpTemplateSummary,
} from '@titan/shared';

export async function fetchIndustryPacksDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseIndustryPackDashboard }>('/enterprise-industry-packs/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function syncIndustryAlerts(accessToken: string) {
  const data = await request<{ industryAlerts: IpIndustryAlertSummary[] }>(
    '/enterprise-industry-packs/industry-alerts/sync',
    { method: 'POST', accessToken },
  );
  return data.industryAlerts;
}

export async function captureIndustryAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-industry-packs/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function fetchMarketplacePacks(accessToken: string) {
  const data = await request<{ marketplacePacks: IpPackCatalogSummary[] }>(
    '/enterprise-industry-packs/marketplace-packs',
    { accessToken },
  );
  return data.marketplacePacks;
}

export async function fetchInstalledPacks(accessToken: string) {
  const data = await request<{ installedPacks: IpPackInstallationSummary[] }>(
    '/enterprise-industry-packs/installed-packs',
    { accessToken },
  );
  return data.installedPacks;
}

export async function installIndustryPack(accessToken: string, packCatalogId: string) {
  const data = await request<{ installation: IpPackInstallationSummary }>('/enterprise-industry-packs/installed-packs', {
    method: 'POST',
    accessToken,
    body: { packCatalogId },
  });
  return data.installation;
}

export async function fetchIndustryTemplates(accessToken: string, templateType?: string) {
  const query = templateType ? `?templateType=${encodeURIComponent(templateType)}` : '';
  const data = await request<{ templates: IpTemplateSummary[] }>(`/enterprise-industry-packs/templates${query}`, {
    accessToken,
  });
  return data.templates;
}

export async function fetchComplianceFrameworks(accessToken: string) {
  const data = await request<{ complianceFrameworks: IpComplianceFrameworkSummary[] }>(
    '/enterprise-industry-packs/compliance-frameworks',
    { accessToken },
  );
  return data.complianceFrameworks;
}

export async function fetchIndustryCertificates(accessToken: string) {
  const data = await request<{ certificates: IpCertificateSummary[] }>('/enterprise-industry-packs/certificates', {
    accessToken,
  });
  return data.certificates;
}

export async function fetchEquipmentCatalog(accessToken: string) {
  const data = await request<{ equipmentCatalog: IpEquipmentCatalogSummary[] }>(
    '/enterprise-industry-packs/equipment-catalog',
    { accessToken },
  );
  return data.equipmentCatalog;
}

export async function fetchIndustryAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: Array<{ id: string; actionType: string; createdAt: string }> }>(
    '/enterprise-industry-packs/audit-logs',
    { accessToken },
  );
  return data.auditLogs;
}
