import type {
  AcknowledgeCmiExpiryRequest,
  AcknowledgeCmiInsightRequest,
  CreateCmiAuditPackRequest,
  CreateCmiAuraInsightRequest,
  CmiAuditPrepPackSummary,
  CmiAuraInsightSummary,
  CmiCocWorkflowSummary,
  CmiComplianceCheckSummary,
  CmiDashboard,
  CmiExpiryItemSummary,
  CmiRecommendationDraftSummary,
  CmiSansStandardSummary,
  CmiSettings,
  DecideCmiRecommendationRequest,
  RefreshCmiRecommendationsRequest,
  RunCmiChecksRequest,
  UpdateCmiCocWorkflowStatusRequest,
  UpdateCmiSettingsRequest,
  UpsertCmiCocWorkflowRequest,
  UpsertCmiSansStandardRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as ComplianceIntelligenceApiClientError };

export async function fetchCmiDashboard(accessToken: string) {
  const data = await request<{ dashboard: CmiDashboard }>('/compliance-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function upsertCmiSansStandard(
  accessToken: string,
  body: UpsertCmiSansStandardRequest,
) {
  const data = await request<{ standard: CmiSansStandardSummary }>(
    '/compliance-intelligence/sans-standards',
    { method: 'POST', accessToken, body },
  );
  return data.standard;
}

export async function upsertCmiCocWorkflow(
  accessToken: string,
  body: UpsertCmiCocWorkflowRequest,
) {
  const data = await request<{ workflow: CmiCocWorkflowSummary }>(
    '/compliance-intelligence/coc-workflows',
    { method: 'POST', accessToken, body },
  );
  return data.workflow;
}

export async function updateCmiCocWorkflowStatus(
  accessToken: string,
  workflowId: string,
  body: UpdateCmiCocWorkflowStatusRequest,
) {
  const data = await request<{ workflow: CmiCocWorkflowSummary }>(
    `/compliance-intelligence/coc-workflows/${workflowId}/status`,
    { method: 'POST', accessToken, body },
  );
  return data.workflow;
}

export async function runCmiChecks(accessToken: string, body: RunCmiChecksRequest = {}) {
  return request<{ created: number; checks: CmiComplianceCheckSummary[] }>(
    '/compliance-intelligence/checks/run',
    { method: 'POST', accessToken, body },
  );
}

export async function refreshCmiRecommendations(
  accessToken: string,
  body: RefreshCmiRecommendationsRequest = {},
) {
  return request<{
    created: number;
    drafts: CmiRecommendationDraftSummary[];
    expiryItemsCreated: number;
  }>('/compliance-intelligence/recommendations/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function decideCmiRecommendation(
  accessToken: string,
  draftId: string,
  body: DecideCmiRecommendationRequest,
) {
  const data = await request<{ draft: CmiRecommendationDraftSummary }>(
    `/compliance-intelligence/recommendations/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function acknowledgeCmiExpiry(
  accessToken: string,
  itemId: string,
  body: AcknowledgeCmiExpiryRequest,
) {
  const data = await request<{ item: CmiExpiryItemSummary }>(
    `/compliance-intelligence/expiry/${itemId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.item;
}

export async function createCmiAuditPack(accessToken: string, body: CreateCmiAuditPackRequest) {
  const data = await request<{ pack: CmiAuditPrepPackSummary }>(
    '/compliance-intelligence/audit-packs',
    { method: 'POST', accessToken, body },
  );
  return data.pack;
}

export async function updateCmiSettings(accessToken: string, body: UpdateCmiSettingsRequest) {
  const data = await request<{ settings: CmiSettings }>('/compliance-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createCmiAuraInsight(
  accessToken: string,
  body: CreateCmiAuraInsightRequest,
) {
  const data = await request<{ insight: CmiAuraInsightSummary }>(
    '/compliance-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeCmiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeCmiInsightRequest,
) {
  const data = await request<{ insight: CmiAuraInsightSummary }>(
    `/compliance-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
