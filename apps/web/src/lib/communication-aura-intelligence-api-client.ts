import type {
  AnalyseCommAuraInboxItemRequest,
  CommAuraCustomerInsight,
  CommAuraDashboard,
  CommAuraDraftSummary,
  CommAuraFollowUpSummary,
  CommAuraLinkProposalSummary,
  CommAuraPrioritisedMessage,
  CreateCommAuraDraftRequest,
  CreateCommAuraFollowUpRequest,
  CreateCommAuraLinkProposalRequest,
  DecideCommAuraDraftRequest,
  DecideCommAuraFollowUpRequest,
  DecideCommAuraLinkProposalRequest,
  RunCommAuraScanRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as CommunicationAuraIntelligenceApiClientError };

export async function fetchCommAuraDashboard(accessToken: string) {
  const data = await request<{ dashboard: CommAuraDashboard }>(
    '/communication-aura-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchCommAuraPrioritised(accessToken: string) {
  const data = await request<{ messages: CommAuraPrioritisedMessage[] }>(
    '/communication-aura-intelligence/prioritised',
    { accessToken },
  );
  return data.messages;
}

export async function fetchCommAuraCustomerInsights(accessToken: string) {
  const data = await request<{ insights: CommAuraCustomerInsight[] }>(
    '/communication-aura-intelligence/customer-insights',
    { accessToken },
  );
  return data.insights;
}

export async function runCommAuraScan(accessToken: string, body: RunCommAuraScanRequest = {}) {
  const data = await request<{
    result: {
      analysed: number;
      draftsCreated: number;
      followUpsCreated: number;
      insightsUpdated: number;
    };
  }>('/communication-aura-intelligence/scan', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.result;
}

export async function analyseCommAuraInboxItem(
  accessToken: string,
  body: AnalyseCommAuraInboxItemRequest,
) {
  const data = await request<{ message: CommAuraPrioritisedMessage }>(
    '/communication-aura-intelligence/analyse',
    { method: 'POST', accessToken, body },
  );
  return data.message;
}

export async function createCommAuraDraft(accessToken: string, body: CreateCommAuraDraftRequest) {
  const data = await request<{ draft: CommAuraDraftSummary }>(
    '/communication-aura-intelligence/drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideCommAuraDraft(
  accessToken: string,
  draftId: string,
  body: DecideCommAuraDraftRequest,
) {
  const data = await request<{ draft: CommAuraDraftSummary }>(
    `/communication-aura-intelligence/drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function createCommAuraFollowUp(
  accessToken: string,
  body: CreateCommAuraFollowUpRequest,
) {
  const data = await request<{ followUp: CommAuraFollowUpSummary }>(
    '/communication-aura-intelligence/follow-ups',
    { method: 'POST', accessToken, body },
  );
  return data.followUp;
}

export async function decideCommAuraFollowUp(
  accessToken: string,
  followUpId: string,
  body: DecideCommAuraFollowUpRequest,
) {
  const data = await request<{ followUp: CommAuraFollowUpSummary }>(
    `/communication-aura-intelligence/follow-ups/${followUpId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.followUp;
}

export async function createCommAuraLinkProposal(
  accessToken: string,
  body: CreateCommAuraLinkProposalRequest,
) {
  const data = await request<{ proposal: CommAuraLinkProposalSummary }>(
    '/communication-aura-intelligence/link-proposals',
    { method: 'POST', accessToken, body },
  );
  return data.proposal;
}

export async function decideCommAuraLinkProposal(
  accessToken: string,
  proposalId: string,
  body: DecideCommAuraLinkProposalRequest,
) {
  const data = await request<{ proposal: CommAuraLinkProposalSummary }>(
    `/communication-aura-intelligence/link-proposals/${proposalId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.proposal;
}
