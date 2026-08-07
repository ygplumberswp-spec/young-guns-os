import type {
  CreateSaasCheckoutRequest,
  ManualSaasBillingActivationRequest,
  SaasBillingHistoryItem,
  SaasBillingProviderCapability,
  SaasCheckoutSessionView,
  SaasCheckoutSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchSaasBillingProviderCapability(accessToken: string) {
  const data = await request<{ capability: SaasBillingProviderCapability }>(
    '/saas-billing/provider-capability',
    { accessToken },
  );
  return data.capability;
}

export async function previewSaasCheckout(accessToken: string, body: CreateSaasCheckoutRequest) {
  const data = await request<{ summary: SaasCheckoutSummary }>('/saas-billing/checkout/preview', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.summary;
}

export async function createSaasCheckout(accessToken: string, body: CreateSaasCheckoutRequest) {
  const data = await request<{ session: SaasCheckoutSessionView }>('/saas-billing/checkout', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.session;
}

export async function fetchSaasCheckoutSession(accessToken: string, sessionId: string) {
  const data = await request<{ session: SaasCheckoutSessionView }>(
    `/saas-billing/checkout/${sessionId}`,
    { accessToken },
  );
  return data.session;
}

export async function markSaasCheckoutBrowserReturn(accessToken: string, sessionId: string) {
  const data = await request<{ session: SaasCheckoutSessionView }>(
    `/saas-billing/checkout/${sessionId}/browser-return`,
    { accessToken, method: 'POST' },
  );
  return data.session;
}

export async function fetchSaasBillingHistory(accessToken: string) {
  const data = await request<{ history: SaasBillingHistoryItem[] }>('/saas-billing/history', {
    accessToken,
  });
  return data.history;
}

export async function cancelSaasAtPeriodEnd(accessToken: string) {
  const data = await request<{ cancelAtPeriodEnd: boolean; paidThroughAt: string | null }>(
    '/saas-billing/cancel-at-period-end',
    { accessToken, method: 'POST' },
  );
  return data;
}

export async function activateManualSaasBilling(
  accessToken: string,
  body: ManualSaasBillingActivationRequest,
) {
  const data = await request<{ companyId: string; paidThroughAt: string }>(
    '/saas-billing/manual-activation',
    { accessToken, method: 'POST', body },
  );
  return data;
}
