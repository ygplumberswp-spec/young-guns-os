import type {
  AcknowledgeCriInsightRequest,
  CreateCriAuraInsightRequest,
  CreateCriCompetitorRequest,
  CreateCriObservationRequest,
  CreateCriReviewRequest,
  CreateCriReviewResponseDraftRequest,
  CriAuraInsightSummary,
  CriCompetitorObservationSummary,
  CriCompetitorSummary,
  CriContentQualityResult,
  CriContentSuggestionSummary,
  CriDashboard,
  CriReviewResponseDraftSummary,
  CriReviewSummary,
  DecideCriReviewResponseRequest,
  DecideCriSuggestionRequest,
  GenerateCriContentSuggestionRequest,
  ScoreCriContentRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as ContentReputationApiClientError };

export async function fetchCriDashboard(accessToken: string) {
  const data = await request<{ dashboard: CriDashboard }>(
    '/content-reputation-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function scoreCriContent(accessToken: string, body: ScoreCriContentRequest) {
  const data = await request<{ quality: CriContentQualityResult }>(
    '/content-reputation-intelligence/content/score',
    { method: 'POST', accessToken, body },
  );
  return data.quality;
}

export async function generateCriSuggestion(
  accessToken: string,
  body: GenerateCriContentSuggestionRequest,
) {
  const data = await request<{ suggestion: CriContentSuggestionSummary }>(
    '/content-reputation-intelligence/content/suggestions/generate',
    { method: 'POST', accessToken, body },
  );
  return data.suggestion;
}

export async function decideCriSuggestion(
  accessToken: string,
  suggestionId: string,
  body: DecideCriSuggestionRequest,
) {
  const data = await request<{ suggestion: CriContentSuggestionSummary }>(
    `/content-reputation-intelligence/content/suggestions/${suggestionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.suggestion;
}

export async function createCriReview(accessToken: string, body: CreateCriReviewRequest) {
  const data = await request<{ review: CriReviewSummary }>(
    '/content-reputation-intelligence/reviews',
    { method: 'POST', accessToken, body },
  );
  return data.review;
}

export async function syncCriSocialReviews(accessToken: string) {
  const data = await request<{ imported: number }>(
    '/content-reputation-intelligence/reviews/sync-social',
    { method: 'POST', accessToken, body: {} },
  );
  return data;
}

export async function createCriReviewResponseDraft(
  accessToken: string,
  body: CreateCriReviewResponseDraftRequest,
) {
  const data = await request<{ draft: CriReviewResponseDraftSummary }>(
    '/content-reputation-intelligence/reviews/response-drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideCriReviewResponse(
  accessToken: string,
  draftId: string,
  body: DecideCriReviewResponseRequest,
) {
  const data = await request<{ draft: CriReviewResponseDraftSummary }>(
    `/content-reputation-intelligence/reviews/response-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function createCriCompetitor(
  accessToken: string,
  body: CreateCriCompetitorRequest,
) {
  const data = await request<{ competitor: CriCompetitorSummary }>(
    '/content-reputation-intelligence/competitors',
    { method: 'POST', accessToken, body },
  );
  return data.competitor;
}

export async function createCriObservation(
  accessToken: string,
  body: CreateCriObservationRequest,
) {
  const data = await request<{ observation: CriCompetitorObservationSummary }>(
    '/content-reputation-intelligence/observations',
    { method: 'POST', accessToken, body },
  );
  return data.observation;
}

export async function createCriAuraInsight(
  accessToken: string,
  body: CreateCriAuraInsightRequest,
) {
  const data = await request<{ insight: CriAuraInsightSummary }>(
    '/content-reputation-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeCriInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeCriInsightRequest,
) {
  const data = await request<{ insight: CriAuraInsightSummary }>(
    `/content-reputation-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
