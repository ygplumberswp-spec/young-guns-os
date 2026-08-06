import type {
  CeiCommunicationScoreSummary,
  CeiDashboard,
  CeiOutreachDraftSummary,
  CreateCeiDraftRequest,
  DecideCeiDraftRequest,
  GenerateCeiEtaDraftsRequest,
  GenerateCeiFollowUpDraftsRequest,
  GenerateCeiMaintenanceReminderDraftsRequest,
  GenerateCeiReviewRequestDraftsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';
export { ApiClientError as CustomerEngagementIntelligenceApiClientError };
export async function fetchCeiDashboard(accessToken: string) {
  const data = await request<{ dashboard: CeiDashboard }>('/customer-engagement-intelligence/dashboard', { accessToken });
  return data.dashboard;
}
export async function fetchCeiDrafts(accessToken: string) {
  const data = await request<{ drafts: CeiOutreachDraftSummary[] }>('/customer-engagement-intelligence/drafts', { accessToken });
  return data.drafts;
}
export async function createCeiDraft(accessToken: string, body: CreateCeiDraftRequest) {
  const data = await request<{ draft: CeiOutreachDraftSummary }>('/customer-engagement-intelligence/drafts', { method: 'POST', accessToken, body });
  return data.draft;
}
export async function decideCeiDraft(accessToken: string, draftId: string, body: DecideCeiDraftRequest) {
  const data = await request<{ draft: CeiOutreachDraftSummary }>(`/customer-engagement-intelligence/drafts/${draftId}/decide`, { method: 'POST', accessToken, body });
  return data.draft;
}
export async function generateCeiEtaDrafts(accessToken: string, body: GenerateCeiEtaDraftsRequest = {}) {
  return request<{ created: number; drafts: CeiOutreachDraftSummary[] }>('/customer-engagement-intelligence/eta-drafts/generate', { method: 'POST', accessToken, body });
}
export async function generateCeiReviewRequestDrafts(accessToken: string, body: GenerateCeiReviewRequestDraftsRequest = {}) {
  return request<{ created: number; drafts: CeiOutreachDraftSummary[] }>('/customer-engagement-intelligence/review-requests/generate', { method: 'POST', accessToken, body });
}
export async function syncCeiCommunicationScores(accessToken: string) {
  return request<{ synced: number; availability: 'available' | 'unavailable'; scores: CeiCommunicationScoreSummary[] }>('/customer-engagement-intelligence/communication-scores/sync', { method: 'POST', accessToken });
}
export async function generateCeiFollowUpDrafts(accessToken: string, body: GenerateCeiFollowUpDraftsRequest = {}) {
  return request<{ created: number; drafts: CeiOutreachDraftSummary[] }>('/customer-engagement-intelligence/follow-ups/generate', { method: 'POST', accessToken, body });
}
export async function generateCeiMaintenanceReminderDrafts(accessToken: string, body: GenerateCeiMaintenanceReminderDraftsRequest = {}) {
  return request<{ created: number; drafts: CeiOutreachDraftSummary[] }>('/customer-engagement-intelligence/maintenance-reminders/generate', { method: 'POST', accessToken, body });
}
