import type {
  EnterpriseGlobalSearchDashboard,
  GsActivityFeedItemSummary,
  GsAuditLogSummary,
  GsGlobalSearchRequest,
  GsRelationshipLinkSummary,
  GsSearchAlertSummary,
  GsSearchResultSummary,
  GsTimelineEntrySummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchGlobalSearchDashboard(
  accessToken: string,
): Promise<EnterpriseGlobalSearchDashboard> {
  const data = await request<{ dashboard: EnterpriseGlobalSearchDashboard }>(
    '/enterprise-global-search/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function runGlobalSearch(
  accessToken: string,
  input: GsGlobalSearchRequest,
): Promise<GsSearchResultSummary[]> {
  const data = await request<{ results: GsSearchResultSummary[] }>(
    '/enterprise-global-search/search',
    {
      accessToken,
      method: 'POST',
      body: input,
    },
  );
  return data.results;
}

export async function fetchTimeline(
  accessToken: string,
  params: { entityType: string; entityId: string; limit?: number },
): Promise<GsTimelineEntrySummary[]> {
  const query = new URLSearchParams({
    entityType: params.entityType,
    entityId: params.entityId,
    ...(params.limit ? { limit: String(params.limit) } : {}),
  });
  const data = await request<{ timeline: GsTimelineEntrySummary[] }>(
    `/enterprise-global-search/timeline?${query.toString()}`,
    { accessToken },
  );
  return data.timeline;
}

export async function fetchRelationships(
  accessToken: string,
  params: { entityType: string; entityId: string; limit?: number },
): Promise<GsRelationshipLinkSummary[]> {
  const query = new URLSearchParams({
    entityType: params.entityType,
    entityId: params.entityId,
    ...(params.limit ? { limit: String(params.limit) } : {}),
  });
  const data = await request<{ relationships: GsRelationshipLinkSummary[] }>(
    `/enterprise-global-search/relationships?${query.toString()}`,
    { accessToken },
  );
  return data.relationships;
}

export async function fetchActivityFeed(
  accessToken: string,
  params?: { feedScope?: string; moduleKey?: string; limit?: number },
): Promise<GsActivityFeedItemSummary[]> {
  const query = new URLSearchParams();
  if (params?.feedScope) query.set('feedScope', params.feedScope);
  if (params?.moduleKey) query.set('moduleKey', params.moduleKey);
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await request<{ activityFeed: GsActivityFeedItemSummary[] }>(
    `/enterprise-global-search/activity-feed${suffix}`,
    { accessToken },
  );
  return data.activityFeed;
}

export async function syncSearchAlerts(accessToken: string): Promise<GsSearchAlertSummary[]> {
  const data = await request<{ searchAlerts: GsSearchAlertSummary[] }>(
    '/enterprise-global-search/search-alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.searchAlerts;
}

export async function captureGlobalSearchAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-global-search/analytics/capture',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.analytics;
}

export async function refreshSearchIndex(accessToken: string) {
  const data = await request<{ indexedCount: number }>(
    '/enterprise-global-search/search-index/refresh',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data;
}

export async function fetchGlobalSearchAuditLogs(
  accessToken: string,
): Promise<GsAuditLogSummary[]> {
  const data = await request<{ auditLogs: GsAuditLogSummary[] }>(
    '/enterprise-global-search/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}
