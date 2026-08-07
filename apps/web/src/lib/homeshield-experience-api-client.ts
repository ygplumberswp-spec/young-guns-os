import type {
  CreateHsBenefitRequest,
  CreateHsOutreachRequest,
  CreateHsPlanRequest,
  CreateHsReminderRequest,
  CreateHsSubscriptionRequest,
  DecideHsAuraInsightRequest,
  DecideHsOutreachRequest,
  DecideHsRenewalRequest,
  HsAuraInsightSummary,
  HsBenefitSummary,
  HsDashboard,
  HsMembershipPlanSummary,
  HsOutreachDraftSummary,
  HsPortalMembershipView,
  HsRenewalOpportunitySummary,
  HsServiceReminderSummary,
  HsSettings,
  HsSubscriptionSummary,
  RefreshHsAuraInsightsRequest,
  RefreshHsRenewalsRequest,
  UpdateHsPlanRequest,
  UpdateHsSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';
import { portalRequest } from './portal-api-client';

export { ApiClientError as HomeshieldExperienceApiClientError };

export async function fetchHsDashboard(accessToken: string) {
  const data = await request<{ dashboard: HsDashboard }>('/homeshield-experience/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function createHsPlan(accessToken: string, body: CreateHsPlanRequest) {
  const data = await request<{ plan: HsMembershipPlanSummary }>('/homeshield-experience/plans', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.plan;
}

export async function updateHsPlan(
  accessToken: string,
  planId: string,
  body: UpdateHsPlanRequest,
) {
  const data = await request<{ plan: HsMembershipPlanSummary }>(
    `/homeshield-experience/plans/${planId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.plan;
}

export async function createHsSubscription(
  accessToken: string,
  body: CreateHsSubscriptionRequest,
) {
  const data = await request<{ subscription: HsSubscriptionSummary }>(
    '/homeshield-experience/subscriptions',
    { method: 'POST', accessToken, body },
  );
  return data.subscription;
}

export async function createHsBenefit(accessToken: string, body: CreateHsBenefitRequest) {
  const data = await request<{ benefit: HsBenefitSummary }>('/homeshield-experience/benefits', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.benefit;
}

export async function createHsReminder(accessToken: string, body: CreateHsReminderRequest) {
  const data = await request<{ reminder: HsServiceReminderSummary }>(
    '/homeshield-experience/reminders',
    { method: 'POST', accessToken, body },
  );
  return data.reminder;
}

export async function refreshHsRenewals(
  accessToken: string,
  body: RefreshHsRenewalsRequest = {},
) {
  const data = await request<{
    created: number;
    opportunities: HsRenewalOpportunitySummary[];
  }>('/homeshield-experience/renewals/refresh', { method: 'POST', accessToken, body });
  return data;
}

export async function decideHsRenewal(
  accessToken: string,
  opportunityId: string,
  body: DecideHsRenewalRequest,
) {
  const data = await request<{ opportunity: HsRenewalOpportunitySummary }>(
    `/homeshield-experience/renewals/${opportunityId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.opportunity;
}

export async function createHsOutreach(accessToken: string, body: CreateHsOutreachRequest) {
  const data = await request<{ draft: HsOutreachDraftSummary }>(
    '/homeshield-experience/outreach',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideHsOutreach(
  accessToken: string,
  draftId: string,
  body: DecideHsOutreachRequest,
) {
  const data = await request<{ draft: HsOutreachDraftSummary }>(
    `/homeshield-experience/outreach/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updateHsSettings(accessToken: string, body: UpdateHsSettingsRequest) {
  const data = await request<{ settings: HsSettings }>('/homeshield-experience/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function fetchHsPortalMembership(
  accessToken: string,
): Promise<HsPortalMembershipView> {
  const data = await portalRequest<{ membership: HsPortalMembershipView }>(
    '/homeshield-experience/portal/membership',
    { accessToken },
  );
  return data.membership;
}


export async function refreshHsAuraInsights(
  accessToken: string,
  body: RefreshHsAuraInsightsRequest = {},
) {
  const data = await request<{
    created: number;
    insights: HsAuraInsightSummary[];
  }>('/homeshield-experience/aura-insights/refresh', { method: 'POST', accessToken, body });
  return data;
}

export async function decideHsAuraInsight(
  accessToken: string,
  insightId: string,
  body: DecideHsAuraInsightRequest,
) {
  const data = await request<{ insight: HsAuraInsightSummary }>(
    `/homeshield-experience/aura-insights/${insightId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
