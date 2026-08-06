import type {
  CreateSocialOutboundDraftRequest,
  DecideSocialOutboundDraftRequest,
  QueueMarketingDraftForSocialRequest,
  RequestSocialOutboundPublishRequest,
  RequestSocialSyncRequest,
  SocialConnectionSummary,
  SocialHealthCheckResult,
  SocialMediaDashboard,
  SocialMonitoredItemSummary,
  SocialOutboundDraftSummary,
  SocialPlatform,
  SocialSyncRunSummary,
  SuggestSocialReplyRequest,
  UpsertSocialConnectionRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SocialMediaIntegrationsApiClientError };

export async function fetchSocialMediaDashboard(accessToken: string) {
  const data = await request<{ dashboard: SocialMediaDashboard }>(
    '/social-media-integrations/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function upsertSocialConnection(
  accessToken: string,
  body: UpsertSocialConnectionRequest,
) {
  const data = await request<{ connection: SocialConnectionSummary }>(
    '/social-media-integrations/connections',
    { method: 'POST', accessToken, body },
  );
  return data.connection;
}

export async function disconnectSocialConnection(accessToken: string, platform: SocialPlatform) {
  const data = await request<{ connection: SocialConnectionSummary }>(
    '/social-media-integrations/connections/disconnect',
    { method: 'POST', accessToken, body: { platform } },
  );
  return data.connection;
}

export async function checkSocialConnectionHealth(accessToken: string, platform: SocialPlatform) {
  const data = await request<SocialHealthCheckResult>(
    '/social-media-integrations/connections/health',
    { method: 'POST', accessToken, body: { platform } },
  );
  return data;
}

export async function requestSocialSync(accessToken: string, body: RequestSocialSyncRequest) {
  const data = await request<{ syncRun: SocialSyncRunSummary }>(
    '/social-media-integrations/sync',
    { method: 'POST', accessToken, body },
  );
  return data.syncRun;
}

export async function fetchSocialMonitoring(accessToken: string) {
  const data = await request<{ items: SocialMonitoredItemSummary[] }>(
    '/social-media-integrations/monitoring',
    { accessToken },
  );
  return data.items;
}

export async function createSocialOutboundDraft(
  accessToken: string,
  body: CreateSocialOutboundDraftRequest,
) {
  const data = await request<{ draft: SocialOutboundDraftSummary }>(
    '/social-media-integrations/outbound-drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function queueMarketingDraftForSocial(
  accessToken: string,
  body: QueueMarketingDraftForSocialRequest,
) {
  const data = await request<{ draft: SocialOutboundDraftSummary }>(
    '/social-media-integrations/outbound-drafts/queue-marketing',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function suggestSocialReply(accessToken: string, body: SuggestSocialReplyRequest) {
  const data = await request<{ draft: SocialOutboundDraftSummary }>(
    '/social-media-integrations/outbound-drafts/suggest-reply',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideSocialOutboundDraft(
  accessToken: string,
  draftId: string,
  body: DecideSocialOutboundDraftRequest,
) {
  const data = await request<{ draft: SocialOutboundDraftSummary }>(
    `/social-media-integrations/outbound-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function requestSocialOutboundPublish(
  accessToken: string,
  draftId: string,
  body: RequestSocialOutboundPublishRequest = {},
) {
  const data = await request<{
    draft: SocialOutboundDraftSummary;
    published: false;
    gated: true;
    reason: string;
  }>(`/social-media-integrations/outbound-drafts/${draftId}/publish`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}
