import { request } from './api-client';
import type {
  CommPlatformAuraDraftAssistResult,
  CommPlatformGmailDraftRequest,
  CommPlatformGmailDraftSummary,
  CommPlatformGmailMailboxView,
  CommPlatformGmailOAuthStatus,
  CommPlatformGmailSyncResult,
  CommPlatformHubDashboard,
  CommPlatformImportDecisionRequest,
  CommPlatformImportDecisionSummary,
  CommPlatformInboxFilter,
  CommPlatformInboxResult,
  CommPlatformSearchResult,
  CommPlatformSettingsSummary,
  CommPlatformSmartDetectionPrompt,
  CommPlatformTestConnectionResult,
  CommPlatformWhatsappChatSummary,
  CommPlatformConnectionHealth,
  SaveCommPlatformGmailConnectionRequest,
  SaveCommPlatformPersonalWhatsappRequest,
} from '@titan/shared';

function toQuery(filter: CommPlatformInboxFilter): string {
  const params = new URLSearchParams();
  if (filter.channel) params.set('channel', filter.channel);
  if (filter.accountKind) params.set('accountKind', filter.accountKind);
  if (filter.unread) params.set('unread', 'true');
  if (filter.urgent) params.set('urgent', 'true');
  if (filter.participantKind) params.set('participantKind', filter.participantKind);
  if (filter.folder) params.set('folder', filter.folder);
  if (filter.q) params.set('q', filter.q);
  if (filter.linkTargetType) params.set('linkTargetType', filter.linkTargetType);
  if (filter.linkTargetId) params.set('linkTargetId', filter.linkTargetId);
  if (filter.includePersonal) params.set('includePersonal', 'true');
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchCommunicationsPlatformHub(accessToken: string) {
  const data = await request<{ dashboard: CommPlatformHubDashboard }>(
    '/communications-platform/hub',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchCommunicationsPlatformInbox(
  accessToken: string,
  filter: CommPlatformInboxFilter = {},
) {
  const data = await request<{ inbox: CommPlatformInboxResult }>(
    `/communications-platform/inbox${toQuery(filter)}`,
    { accessToken },
  );
  return data.inbox;
}

export async function searchCommunicationsPlatformBusiness(
  accessToken: string,
  q: string,
  limit = 50,
) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const data = await request<{ search: CommPlatformSearchResult }>(
    `/communications-platform/search?${params.toString()}`,
    { accessToken },
  );
  return data.search;
}

export async function fetchCommunicationsPlatformSettings(accessToken: string) {
  const data = await request<{ settings: CommPlatformSettingsSummary }>(
    '/communications-platform/settings',
    { accessToken },
  );
  return data.settings;
}

export async function fetchGmailMailbox(
  accessToken: string,
  folder: 'inbox' | 'sent' | 'drafts' | 'labels' | 'all' = 'inbox',
) {
  const data = await request<{ mailbox: CommPlatformGmailMailboxView }>(
    `/communications-platform/gmail/${folder}`,
    { accessToken },
  );
  return data.mailbox;
}

export async function createGmailDraft(
  accessToken: string,
  body: CommPlatformGmailDraftRequest,
) {
  const data = await request<{ draft: CommPlatformGmailDraftSummary }>(
    '/communications-platform/gmail/drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function approveGmailDraft(accessToken: string, draftId: string) {
  const data = await request<{ draft: CommPlatformGmailDraftSummary }>(
    `/communications-platform/gmail/drafts/${draftId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.draft;
}

export async function executeGmailDraft(accessToken: string, draftId: string) {
  const data = await request<{ draft: CommPlatformGmailDraftSummary }>(
    `/communications-platform/gmail/drafts/${draftId}/execute`,
    { method: 'POST', accessToken },
  );
  return data.draft;
}

export async function saveBusinessGmailConnection(
  accessToken: string,
  body: SaveCommPlatformGmailConnectionRequest,
) {
  const data = await request<{ connection: CommPlatformConnectionHealth }>(
    '/communications-platform/connections/gmail',
    { method: 'PUT', accessToken, body },
  );
  return data.connection;
}

export async function disconnectBusinessGmail(accessToken: string) {
  const data = await request<{ connection: CommPlatformConnectionHealth }>(
    '/communications-platform/connections/gmail',
    { method: 'DELETE', accessToken },
  );
  return data.connection;
}

export async function fetchGmailOAuthStatus(accessToken: string) {
  const data = await request<{ status: CommPlatformGmailOAuthStatus }>(
    '/communications-platform/gmail/oauth/status',
    { accessToken },
  );
  return data.status;
}

export async function startGmailOAuth(
  accessToken: string,
  returnPath = '/communications-hub',
) {
  const data = await request<{ authorizationUrl: string }>(
    '/communications-platform/gmail/oauth/start',
    { method: 'POST', accessToken, body: { returnPath } },
  );
  return data.authorizationUrl;
}

export async function syncGmailMailbox(
  accessToken: string,
  body: { folder?: 'inbox' | 'sent' | 'drafts' | 'labels' | 'all'; maxMessages?: number } = {},
) {
  const data = await request<{ sync: CommPlatformGmailSyncResult }>(
    '/communications-platform/gmail/sync',
    { method: 'POST', accessToken, body },
  );
  return data.sync;
}

export async function auraAssistGmail(
  accessToken: string,
  inboxItemId: string,
  mode: 'summarize' | 'draft_reply',
) {
  const data = await request<{ assist: CommPlatformAuraDraftAssistResult }>(
    `/communications-platform/gmail/inbox/${inboxItemId}/aura-assist`,
    { method: 'POST', accessToken, body: { mode } },
  );
  return data.assist;
}

export async function fetchBusinessWhatsappChats(accessToken: string) {
  const data = await request<{ chats: CommPlatformWhatsappChatSummary[] }>(
    '/communications-platform/whatsapp/business/chats',
    { accessToken },
  );
  return data.chats;
}

export async function fetchPersonalWhatsappChats(accessToken: string) {
  const data = await request<{ chats: CommPlatformWhatsappChatSummary[] }>(
    '/communications-platform/whatsapp/personal/chats',
    { accessToken },
  );
  return data.chats;
}

export async function fetchSmartDetectionPrompts(accessToken: string) {
  const data = await request<{
    prompts: CommPlatformSmartDetectionPrompt[];
    autoImport: false;
  }>('/communications-platform/whatsapp/personal/smart-detection', { accessToken });
  return data;
}

export async function recordImportDecision(
  accessToken: string,
  body: CommPlatformImportDecisionRequest,
) {
  const data = await request<{ decision: CommPlatformImportDecisionSummary }>(
    '/communications-platform/whatsapp/personal/import-decisions',
    { method: 'POST', accessToken, body },
  );
  return data.decision;
}

export async function savePersonalWhatsappConnection(
  accessToken: string,
  body: SaveCommPlatformPersonalWhatsappRequest,
) {
  const data = await request<{ connection: CommPlatformConnectionHealth }>(
    '/communications-platform/connections/personal-whatsapp',
    { method: 'PUT', accessToken, body },
  );
  return data.connection;
}

export async function disconnectPersonalWhatsapp(accessToken: string) {
  const data = await request<{ connection: CommPlatformConnectionHealth }>(
    '/communications-platform/connections/personal-whatsapp',
    { method: 'DELETE', accessToken },
  );
  return data.connection;
}

export async function testCommunicationsConnection(
  accessToken: string,
  accountKind: 'business_gmail' | 'business_whatsapp' | 'personal_whatsapp',
) {
  const data = await request<{ result: CommPlatformTestConnectionResult }>(
    '/communications-platform/connections/test',
    { method: 'POST', accessToken, body: { accountKind } },
  );
  return data.result;
}
