import type {
  CompleteVairCallSessionRequest,
  CreateVairBookingDraftRequest,
  CreateVairLeadDraftRequest,
  DecideVairApprovalRequest,
  LookupVairCustomerRequest,
  RecordVairIncomingCallRequest,
  ReleaseVairTakeoverRequest,
  RequestVairTakeoverRequest,
  UpdateVairSettingsRequest,
  UpsertVairRoutingRuleRequest,
  VairApprovalDraftSummary,
  VairCallSessionSummary,
  VairCustomerLookupResult,
  VairOwnerDashboard,
  VairRoutingRuleSummary,
  VairSettings,
  VairTakeoverEventSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as VoiceAiReceptionistApiClientError };

export async function fetchVairDashboard(accessToken: string) {
  const data = await request<{ dashboard: VairOwnerDashboard }>(
    '/voice-ai-receptionist/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function lookupVairCustomer(
  accessToken: string,
  body: LookupVairCustomerRequest,
) {
  const data = await request<{ result: VairCustomerLookupResult }>(
    '/voice-ai-receptionist/customers/lookup',
    { method: 'POST', accessToken, body },
  );
  return data.result;
}

export async function recordVairIncomingCall(
  accessToken: string,
  body: RecordVairIncomingCallRequest,
) {
  const data = await request<{ session: VairCallSessionSummary }>(
    '/voice-ai-receptionist/calls/incoming',
    { method: 'POST', accessToken, body },
  );
  return data.session;
}

export async function completeVairCallSession(
  accessToken: string,
  sessionId: string,
  body: CompleteVairCallSessionRequest = {},
) {
  const data = await request<{ session: VairCallSessionSummary }>(
    `/voice-ai-receptionist/calls/${sessionId}/complete`,
    { method: 'POST', accessToken, body },
  );
  return data.session;
}

export async function createVairLeadDraft(
  accessToken: string,
  body: CreateVairLeadDraftRequest,
) {
  const data = await request<{ draft: VairApprovalDraftSummary }>(
    '/voice-ai-receptionist/approvals/lead-draft',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function createVairBookingDraft(
  accessToken: string,
  body: CreateVairBookingDraftRequest,
) {
  const data = await request<{ draft: VairApprovalDraftSummary }>(
    '/voice-ai-receptionist/approvals/booking-draft',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideVairApproval(
  accessToken: string,
  draftId: string,
  body: DecideVairApprovalRequest,
) {
  const data = await request<{ draft: VairApprovalDraftSummary }>(
    `/voice-ai-receptionist/approvals/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function requestVairTakeover(
  accessToken: string,
  body: RequestVairTakeoverRequest,
) {
  const data = await request<{
    session: VairCallSessionSummary;
    event: VairTakeoverEventSummary;
  }>('/voice-ai-receptionist/takeover', { method: 'POST', accessToken, body });
  return data;
}

export async function releaseVairTakeover(
  accessToken: string,
  body: ReleaseVairTakeoverRequest,
) {
  const data = await request<{ session: VairCallSessionSummary }>(
    '/voice-ai-receptionist/takeover/release',
    { method: 'POST', accessToken, body },
  );
  return data.session;
}

export async function upsertVairRoutingRule(
  accessToken: string,
  body: UpsertVairRoutingRuleRequest,
) {
  const data = await request<{ rule: VairRoutingRuleSummary }>(
    '/voice-ai-receptionist/routing',
    { method: 'POST', accessToken, body },
  );
  return data.rule;
}

export async function updateVairSettings(
  accessToken: string,
  body: UpdateVairSettingsRequest,
) {
  const data = await request<{ settings: VairSettings }>(
    '/voice-ai-receptionist/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}
