import type {
  DecideTechnicianInsightRequest,
  GenerateTechnicianInsightsRequest,
  TechnicianAuraInsightSummary,
  TechnicianIntelligenceGuarantees,
  TechnicianIntelligenceOwnerOverview,
  TechnicianIntelligencePeriod,
  TechnicianIntelligenceSelfView,
  TechnicianJobLifecycleSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as TechnicianIntelligenceApiClientError };

function periodQuery(period?: TechnicianIntelligencePeriod): string {
  return period ? `?period=${encodeURIComponent(period)}` : '';
}

export async function fetchTechnicianOwnerOverview(
  accessToken: string,
  period: TechnicianIntelligencePeriod = 'weekly',
): Promise<TechnicianIntelligenceOwnerOverview> {
  const data = await request<{ overview: TechnicianIntelligenceOwnerOverview }>(
    `/technician-intelligence/owner/overview${periodQuery(period)}`,
    { accessToken },
  );
  return data.overview;
}

export async function fetchTechnicianSelfView(
  accessToken: string,
  period: TechnicianIntelligencePeriod = 'weekly',
): Promise<TechnicianIntelligenceSelfView> {
  const data = await request<{ view: TechnicianIntelligenceSelfView }>(
    `/technician-intelligence/me${periodQuery(period)}`,
    { accessToken },
  );
  return data.view;
}

export async function fetchTechnicianJobLifecycle(
  accessToken: string,
  jobId: string,
): Promise<TechnicianJobLifecycleSummary> {
  const data = await request<{ lifecycle: TechnicianJobLifecycleSummary }>(
    `/technician-intelligence/jobs/${encodeURIComponent(jobId)}/lifecycle`,
    { accessToken },
  );
  return data.lifecycle;
}

export async function fetchTechnicianInsights(accessToken: string): Promise<{
  insights: TechnicianAuraInsightSummary[];
  pendingCount: number;
  guarantees: TechnicianIntelligenceGuarantees;
}> {
  return request<{
    insights: TechnicianAuraInsightSummary[];
    pendingCount: number;
    guarantees: TechnicianIntelligenceGuarantees;
    autoExecuted: false;
  }>('/technician-intelligence/insights', { accessToken });
}

export async function generateTechnicianInsights(
  accessToken: string,
  input: GenerateTechnicianInsightsRequest = {},
): Promise<{
  insights: TechnicianAuraInsightSummary[];
  pendingCount: number;
  guarantees: TechnicianIntelligenceGuarantees;
}> {
  return request<{
    insights: TechnicianAuraInsightSummary[];
    pendingCount: number;
    guarantees: TechnicianIntelligenceGuarantees;
    autoExecuted: false;
  }>('/technician-intelligence/insights/generate', {
    accessToken,
    method: 'POST',
    body: input,
  });
}

export async function decideTechnicianInsight(
  accessToken: string,
  insightId: string,
  input: DecideTechnicianInsightRequest,
): Promise<TechnicianAuraInsightSummary> {
  const data = await request<{ insight: TechnicianAuraInsightSummary; autoExecuted: false }>(
    `/technician-intelligence/insights/${encodeURIComponent(insightId)}/decide`,
    {
      accessToken,
      method: 'POST',
      body: input,
    },
  );
  return data.insight;
}
