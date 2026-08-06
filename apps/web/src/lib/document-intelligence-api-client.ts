import type {
  AcknowledgeDiInsightRequest,
  AcknowledgeDiReminderRequest,
  CreateDiAuraInsightRequest,
  CreateDiVersionRequest,
  DecideDiRecommendationRequest,
  DocIAuraInsightSummary,
  DocIDashboard,
  DocIDocumentIntelligenceRow,
  DocIExpiryReminderSummary,
  DocIRecommendationDraftSummary,
  DocISearchRequest,
  DocISettings,
  DocIVersionSummary,
  RefreshDiRecommendationsRequest,
  UpdateDiSettingsRequest,
  UpsertDiDocumentProfileRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DocumentIntelligenceApiClientError };

function toQuery(params: DocISearchRequest = {}): string {
  const q = new URLSearchParams();
  if (params.query) q.set('query', params.query);
  if (params.documentType) q.set('documentType', params.documentType);
  if (params.customerId) q.set('customerId', params.customerId);
  if (params.jobId) q.set('jobId', params.jobId);
  if (params.propertyId) q.set('propertyId', params.propertyId);
  if (params.expiringWithinDays != null) {
    q.set('expiringWithinDays', String(params.expiringWithinDays));
  }
  if (params.limit != null) q.set('limit', String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function fetchDocIDashboard(accessToken: string, params: DocISearchRequest = {}) {
  const data = await request<{ dashboard: DocIDashboard }>(
    `/document-intelligence/dashboard${toQuery(params)}`,
    { accessToken },
  );
  return data.dashboard;
}

export async function searchDocIDocuments(accessToken: string, params: DocISearchRequest = {}) {
  return request<{
    documents: DocIDocumentIntelligenceRow[];
    search: DocIDashboard['search'];
  }>(`/document-intelligence/search${toQuery(params)}`, { accessToken });
}

export async function upsertDocIDocumentProfile(
  accessToken: string,
  body: UpsertDiDocumentProfileRequest,
) {
  const data = await request<{ document: DocIDocumentIntelligenceRow }>(
    '/document-intelligence/profiles',
    { method: 'POST', accessToken, body },
  );
  return data.document;
}

export async function fetchDocIVersions(accessToken: string, documentId: string) {
  const data = await request<{ versions: DocIVersionSummary[] }>(
    `/document-intelligence/documents/${documentId}/versions`,
    { accessToken },
  );
  return data.versions;
}

export async function createDocIVersion(accessToken: string, body: CreateDiVersionRequest) {
  const data = await request<{ version: DocIVersionSummary }>('/document-intelligence/versions', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.version;
}

export async function refreshDocIRecommendations(
  accessToken: string,
  body: RefreshDiRecommendationsRequest = {},
) {
  return request<{
    created: number;
    drafts: DocIRecommendationDraftSummary[];
    remindersCreated: number;
  }>('/document-intelligence/recommendations/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function decideDocIRecommendation(
  accessToken: string,
  draftId: string,
  body: DecideDiRecommendationRequest,
) {
  const data = await request<{ draft: DocIRecommendationDraftSummary }>(
    `/document-intelligence/recommendations/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function acknowledgeDocIReminder(
  accessToken: string,
  reminderId: string,
  body: AcknowledgeDiReminderRequest,
) {
  const data = await request<{ reminder: DocIExpiryReminderSummary }>(
    `/document-intelligence/reminders/${reminderId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.reminder;
}

export async function updateDocISettings(accessToken: string, body: UpdateDiSettingsRequest) {
  const data = await request<{ settings: DocISettings }>('/document-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createDocIAuraInsight(
  accessToken: string,
  body: CreateDiAuraInsightRequest,
) {
  const data = await request<{ insight: DocIAuraInsightSummary }>(
    '/document-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeDocIInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeDiInsightRequest,
) {
  const data = await request<{ insight: DocIAuraInsightSummary }>(
    `/document-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
