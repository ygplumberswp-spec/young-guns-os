import type {
  CreateSfiDraftRequest,
  DecideSfiDraftRequest,
  GenerateSfiObjectionDraftsRequest,
  GenerateSfiQuoteReminderDraftsRequest,
  GenerateSfiReactivationDraftsRequest,
  RecordSfiQuoteResponseRequest,
  ScheduleSfiQuoteFollowUpRequest,
  SfiDashboard,
  SfiOutreachDraftSummary,
  SfiSettings,
  UpdateSfiSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SalesFollowupIntelligenceApiClientError };

export async function fetchSfiDashboard(accessToken: string) {
  const data = await request<{ dashboard: SfiDashboard }>(
    '/sales-followup-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchSfiDrafts(accessToken: string) {
  const data = await request<{ drafts: SfiOutreachDraftSummary[] }>(
    '/sales-followup-intelligence/drafts',
    { accessToken },
  );
  return data.drafts;
}

export async function createSfiDraft(accessToken: string, body: CreateSfiDraftRequest) {
  const data = await request<{ draft: SfiOutreachDraftSummary }>(
    '/sales-followup-intelligence/drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideSfiDraft(
  accessToken: string,
  draftId: string,
  body: DecideSfiDraftRequest,
) {
  const data = await request<{ draft: SfiOutreachDraftSummary }>(
    `/sales-followup-intelligence/drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function scheduleSfiQuoteFollowUp(
  accessToken: string,
  body: ScheduleSfiQuoteFollowUpRequest,
) {
  return request<{ quoteId: string; scheduledFollowUpAt: string; autoSend: false }>(
    '/sales-followup-intelligence/quote-follow-ups/schedule',
    { method: 'POST', accessToken, body },
  );
}

export async function recordSfiQuoteResponse(
  accessToken: string,
  body: RecordSfiQuoteResponseRequest,
) {
  return request<{ quoteId: string; responseStatus: string; autoSend: false }>(
    '/sales-followup-intelligence/quote-responses',
    { method: 'POST', accessToken, body },
  );
}

export async function generateSfiQuoteReminderDrafts(
  accessToken: string,
  body: GenerateSfiQuoteReminderDraftsRequest = {},
) {
  return request<{ created: number; drafts: SfiOutreachDraftSummary[] }>(
    '/sales-followup-intelligence/quote-reminders/generate',
    { method: 'POST', accessToken, body },
  );
}

export async function generateSfiObjectionDrafts(
  accessToken: string,
  body: GenerateSfiObjectionDraftsRequest = {},
) {
  return request<{ created: number; drafts: SfiOutreachDraftSummary[] }>(
    '/sales-followup-intelligence/objection-drafts/generate',
    { method: 'POST', accessToken, body },
  );
}

export async function generateSfiReactivationDrafts(
  accessToken: string,
  body: GenerateSfiReactivationDraftsRequest = {},
) {
  return request<{ created: number; drafts: SfiOutreachDraftSummary[] }>(
    '/sales-followup-intelligence/reactivation-drafts/generate',
    { method: 'POST', accessToken, body },
  );
}

export async function updateSfiSettings(accessToken: string, body: UpdateSfiSettingsRequest) {
  const data = await request<{ settings: SfiSettings }>(
    '/sales-followup-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}
