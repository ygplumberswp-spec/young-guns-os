import type {
  CreateMktOpportunityRequest,
  DecideMktInsightRequest,
  DecideMktOpportunityRequest,
  MktAuditEntry,
  MktDashboard,
  MktInsightStatus,
  MktOpportunitySummary,
  MktSettings,
  MktSourceSummary,
  RegisterMktSourceRequest,
  UpdateMktSettingsRequest,
  UpdateMktSourceRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as MarketIntelligenceApiClientError };

export async function fetchMktDashboard(accessToken: string) {
  const data = await request<{ dashboard: MktDashboard }>('/market-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchMktSettings(accessToken: string) {
  const data = await request<{ settings: MktSettings }>('/market-intelligence/settings', {
    accessToken,
  });
  return data.settings;
}

export async function updateMktSettings(accessToken: string, body: UpdateMktSettingsRequest) {
  const data = await request<{ settings: MktSettings }>('/market-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function fetchMktSources(accessToken: string) {
  const data = await request<{ sources: MktSourceSummary[] }>('/market-intelligence/sources', {
    accessToken,
  });
  return data.sources;
}

export async function registerMktSource(accessToken: string, body: RegisterMktSourceRequest) {
  const data = await request<{ source: MktSourceSummary }>('/market-intelligence/sources', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.source;
}

export async function updateMktSource(
  accessToken: string,
  sourceId: string,
  body: UpdateMktSourceRequest,
) {
  const data = await request<{ source: MktSourceSummary }>(
    `/market-intelligence/sources/${sourceId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.source;
}

export async function decideMktInsight(
  accessToken: string,
  insightKey: string,
  body: DecideMktInsightRequest,
) {
  return request<{ insightKey: string; status: MktInsightStatus }>(
    `/market-intelligence/insights/${encodeURIComponent(insightKey)}/decide`,
    { method: 'POST', accessToken, body },
  );
}

export async function fetchMktInsightAudit(accessToken: string, insightKey: string) {
  const data = await request<{ entries: MktAuditEntry[] }>(
    `/market-intelligence/insights/${encodeURIComponent(insightKey)}/audit`,
    { accessToken },
  );
  return data.entries;
}

export async function fetchMktCompanyAudit(accessToken: string) {
  const data = await request<{ entries: MktAuditEntry[] }>('/market-intelligence/audit', {
    accessToken,
  });
  return data.entries;
}

export async function fetchMktOpportunities(accessToken: string) {
  const data = await request<{ opportunities: MktOpportunitySummary[] }>(
    '/market-intelligence/opportunities',
    { accessToken },
  );
  return data.opportunities;
}

export async function createMktOpportunity(
  accessToken: string,
  body: CreateMktOpportunityRequest,
) {
  const data = await request<{ opportunity: MktOpportunitySummary }>(
    '/market-intelligence/opportunities',
    { method: 'POST', accessToken, body },
  );
  return data.opportunity;
}

export async function refreshMktOpportunities(
  accessToken: string,
  body: { submitForApproval?: boolean } = {},
) {
  const data = await request<{ opportunities: MktOpportunitySummary[] }>(
    '/market-intelligence/opportunities/refresh',
    { method: 'POST', accessToken, body },
  );
  return data.opportunities;
}

export async function decideMktOpportunity(
  accessToken: string,
  opportunityId: string,
  body: DecideMktOpportunityRequest,
) {
  const data = await request<{ opportunity: MktOpportunitySummary }>(
    `/market-intelligence/opportunities/${opportunityId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.opportunity;
}
