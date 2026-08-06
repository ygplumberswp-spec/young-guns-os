import type {
  ClassifyPersonalWaThreadRequest,
  CreatePersonalWaAuraSuggestionRequest,
  CreatePersonalWaLinkProposalRequest,
  DecidePersonalWaAuraSuggestionRequest,
  DecidePersonalWaLinkProposalRequest,
  PersonalWaIntelAuraSuggestionSummary,
  PersonalWaIntelDashboard,
  PersonalWaIntelLinkProposalSummary,
  PersonalWaIntelThreadSummary,
  RunPersonalWaIntelScanRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as PersonalWhatsappIntelligenceApiClientError };

export async function fetchPersonalWaIntelDashboard(accessToken: string) {
  const data = await request<{ dashboard: PersonalWaIntelDashboard }>(
    '/personal-whatsapp-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchPersonalWaIntelThreads(accessToken: string) {
  const data = await request<{ threads: PersonalWaIntelThreadSummary[] }>(
    '/personal-whatsapp-intelligence/threads',
    { accessToken },
  );
  return data.threads;
}

export async function runPersonalWaIntelScan(
  accessToken: string,
  body: RunPersonalWaIntelScanRequest = {},
) {
  const data = await request<{
    result: { classified: number; auraSuggestionsCreated: number };
  }>('/personal-whatsapp-intelligence/scan', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.result;
}

export async function classifyPersonalWaIntelThread(
  accessToken: string,
  body: ClassifyPersonalWaThreadRequest,
) {
  const data = await request<{ thread: PersonalWaIntelThreadSummary }>(
    '/personal-whatsapp-intelligence/classify',
    { method: 'POST', accessToken, body },
  );
  return data.thread;
}

export async function fetchPersonalWaLinkProposals(accessToken: string) {
  const data = await request<{ proposals: PersonalWaIntelLinkProposalSummary[] }>(
    '/personal-whatsapp-intelligence/link-proposals?status=pending_approval',
    { accessToken },
  );
  return data.proposals;
}

export async function createPersonalWaLinkProposal(
  accessToken: string,
  body: CreatePersonalWaLinkProposalRequest,
) {
  const data = await request<{ proposal: PersonalWaIntelLinkProposalSummary }>(
    '/personal-whatsapp-intelligence/link-proposals',
    { method: 'POST', accessToken, body },
  );
  return data.proposal;
}

export async function decidePersonalWaLinkProposal(
  accessToken: string,
  proposalId: string,
  body: DecidePersonalWaLinkProposalRequest,
) {
  const data = await request<{ proposal: PersonalWaIntelLinkProposalSummary }>(
    `/personal-whatsapp-intelligence/link-proposals/${proposalId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.proposal;
}

export async function fetchPersonalWaAuraSuggestions(accessToken: string) {
  const data = await request<{ suggestions: PersonalWaIntelAuraSuggestionSummary[] }>(
    '/personal-whatsapp-intelligence/aura-suggestions',
    { accessToken },
  );
  return data.suggestions;
}

export async function createPersonalWaAuraSuggestion(
  accessToken: string,
  body: CreatePersonalWaAuraSuggestionRequest,
) {
  const data = await request<{ suggestion: PersonalWaIntelAuraSuggestionSummary }>(
    '/personal-whatsapp-intelligence/aura-suggestions',
    { method: 'POST', accessToken, body },
  );
  return data.suggestion;
}

export async function decidePersonalWaAuraSuggestion(
  accessToken: string,
  suggestionId: string,
  body: DecidePersonalWaAuraSuggestionRequest,
) {
  const data = await request<{ suggestion: PersonalWaIntelAuraSuggestionSummary }>(
    `/personal-whatsapp-intelligence/aura-suggestions/${suggestionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.suggestion;
}
