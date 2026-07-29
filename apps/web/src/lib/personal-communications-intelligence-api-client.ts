import type {
  CreatePersonalCommAccountRequest,
  CreatePersonalCommActionRequest,
  PersonalCommAccountSummary,
  PersonalCommActionSummary,
  PersonalCommConversationSummary,
  PersonalCommExecutiveDashboard,
  PersonalCommFollowUpSummary,
  PersonalCommLeadSignalSummary,
  PersonalCommPrivacySettings,
  UpdatePersonalCommPrivacyRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as PersonalCommunicationsApiClientError };

export async function fetchPersonalCommDashboard(accessToken: string) {
  const data = await request<{ dashboard: PersonalCommExecutiveDashboard }>(
    '/personal-communications-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchAccounts(accessToken: string) {
  const data = await request<{ accounts: PersonalCommAccountSummary[] }>(
    '/personal-communications-intelligence/accounts',
    { accessToken },
  );
  return data.accounts;
}

export async function createAccount(accessToken: string, body: CreatePersonalCommAccountRequest) {
  const data = await request<{ account: PersonalCommAccountSummary }>(
    '/personal-communications-intelligence/accounts',
    { accessToken, method: 'POST', body },
  );
  return data.account;
}

export async function syncConversations(accessToken: string) {
  const data = await request<{ conversations: PersonalCommConversationSummary[] }>(
    '/personal-communications-intelligence/conversations/sync',
    { accessToken, method: 'POST', body: {} },
  );
  return data.conversations;
}

export async function fetchConversations(accessToken: string) {
  const data = await request<{ conversations: PersonalCommConversationSummary[] }>(
    '/personal-communications-intelligence/conversations',
    { accessToken },
  );
  return data.conversations;
}

export async function fetchFollowUps(accessToken: string) {
  const data = await request<{ followUps: PersonalCommFollowUpSummary[] }>(
    '/personal-communications-intelligence/follow-ups',
    { accessToken },
  );
  return data.followUps;
}

export async function generateFollowUps(accessToken: string) {
  const data = await request<{ followUps: PersonalCommFollowUpSummary[] }>(
    '/personal-communications-intelligence/follow-ups/generate',
    { accessToken, method: 'POST', body: {} },
  );
  return data.followUps;
}

export async function fetchLeadSignals(accessToken: string) {
  const data = await request<{ signals: PersonalCommLeadSignalSummary[] }>(
    '/personal-communications-intelligence/lead-signals',
    { accessToken },
  );
  return data.signals;
}

export async function detectLeadSignals(accessToken: string) {
  const data = await request<{ signals: PersonalCommLeadSignalSummary[] }>(
    '/personal-communications-intelligence/lead-signals/detect',
    { accessToken, method: 'POST', body: {} },
  );
  return data.signals;
}

export async function fetchPrivacySettings(accessToken: string) {
  const data = await request<{ privacy: PersonalCommPrivacySettings }>(
    '/personal-communications-intelligence/privacy',
    { accessToken },
  );
  return data.privacy;
}

export async function updatePrivacySettings(accessToken: string, body: UpdatePersonalCommPrivacyRequest) {
  const data = await request<{ privacy: PersonalCommPrivacySettings }>(
    '/personal-communications-intelligence/privacy',
    { accessToken, method: 'PUT', body },
  );
  return data.privacy;
}

export async function fetchPersonalCommActions(accessToken: string) {
  const data = await request<{ actions: PersonalCommActionSummary[] }>(
    '/personal-communications-intelligence/actions',
    { accessToken },
  );
  return data.actions;
}

export async function createPersonalCommAction(accessToken: string, body: CreatePersonalCommActionRequest) {
  const data = await request<{ action: PersonalCommActionSummary }>(
    '/personal-communications-intelligence/actions',
    { accessToken, method: 'POST', body },
  );
  return data.action;
}
