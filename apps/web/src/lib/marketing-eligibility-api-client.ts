import { request, ApiClientError } from './api-client';
import type {
  BuyerClassificationSummary,
  CorrectCustomerContactRequest,
  CreateMarketingAudienceRequestInput,
  CreateXeroSyncBackRequestInput,
  CustomerContactCorrectionSummary,
  CustomerContactFieldSummary,
  CustomerMarketingConsentSummary,
  MarketingAudienceRequestSummary,
  ReactivationEligibilityCounts,
  ReactivationEligibilitySummary,
  UpsertMarketingConsentRequest,
  XeroContactSyncBackRequestSummary,
} from '@titan/shared';

export { ApiClientError as MarketingEligibilityApiClientError };

export async function fetchClassifications(accessToken: string) {
  const data = await request<{ classifications: BuyerClassificationSummary[] }>(
    '/marketing-eligibility/classifications',
    { accessToken },
  );
  return data.classifications;
}

export async function recomputeClassifications(accessToken: string, clientActionId?: string) {
  const data = await request<{ classifications: BuyerClassificationSummary[] }>(
    '/marketing-eligibility/classifications/recompute',
    { method: 'POST', accessToken, body: { clientActionId: clientActionId ?? null } },
  );
  return data.classifications;
}

export async function fetchEligibility(accessToken: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request<{ eligibility: ReactivationEligibilitySummary[] }>(
    `/marketing-eligibility/eligibility${query}`,
    { accessToken },
  );
  return data.eligibility;
}

export async function fetchEligibilityCounts(accessToken: string) {
  const data = await request<{ counts: ReactivationEligibilityCounts }>(
    '/marketing-eligibility/eligibility/counts',
    { accessToken },
  );
  return data.counts;
}

export async function recomputeEligibility(accessToken: string) {
  const data = await request<{ eligibility: ReactivationEligibilitySummary[] }>(
    '/marketing-eligibility/eligibility/recompute',
    { method: 'POST', accessToken },
  );
  return data.eligibility;
}

export async function fetchContactFields(accessToken: string, customerId: string) {
  const data = await request<{ contactFields: CustomerContactFieldSummary[] }>(
    `/marketing-eligibility/customers/${customerId}/contact-fields`,
    { accessToken },
  );
  return data.contactFields;
}

export async function fetchContactCorrections(accessToken: string, customerId: string) {
  const data = await request<{ contactCorrections: CustomerContactCorrectionSummary[] }>(
    `/marketing-eligibility/customers/${customerId}/contact-corrections`,
    { accessToken },
  );
  return data.contactCorrections;
}

export async function ensureContactQuality(accessToken: string, customerId: string) {
  const data = await request<{ contactFields: CustomerContactFieldSummary[] }>(
    `/marketing-eligibility/customers/${customerId}/contact-fields/ensure`,
    { method: 'POST', accessToken },
  );
  return data.contactFields;
}

export async function correctCustomerContact(
  accessToken: string,
  customerId: string,
  body: CorrectCustomerContactRequest,
) {
  const data = await request<{ contactField: CustomerContactFieldSummary }>(
    `/marketing-eligibility/customers/${customerId}/contact-correct`,
    { method: 'POST', accessToken, body },
  );
  return data.contactField;
}

export async function fetchConsents(accessToken: string, customerId: string) {
  const data = await request<{ consents: CustomerMarketingConsentSummary[] }>(
    `/marketing-eligibility/customers/${customerId}/consents`,
    { accessToken },
  );
  return data.consents;
}

export async function upsertConsent(
  accessToken: string,
  customerId: string,
  body: UpsertMarketingConsentRequest,
) {
  const data = await request<{ consent: CustomerMarketingConsentSummary }>(
    `/marketing-eligibility/customers/${customerId}/consents`,
    { method: 'POST', accessToken, body },
  );
  return data.consent;
}

export async function fetchAudienceRequests(accessToken: string) {
  const data = await request<{ audienceRequests: MarketingAudienceRequestSummary[] }>(
    '/marketing-eligibility/audience-requests',
    { accessToken },
  );
  return data.audienceRequests;
}

export async function createAudienceRequest(
  accessToken: string,
  body: CreateMarketingAudienceRequestInput,
) {
  const data = await request<{ audienceRequest: MarketingAudienceRequestSummary }>(
    '/marketing-eligibility/audience-requests',
    { method: 'POST', accessToken, body },
  );
  return data.audienceRequest;
}

export async function submitAudienceRequestForApproval(accessToken: string, requestId: string) {
  const data = await request<{ audienceRequest: MarketingAudienceRequestSummary }>(
    `/marketing-eligibility/audience-requests/${requestId}/submit-for-approval`,
    { method: 'POST', accessToken },
  );
  return data.audienceRequest;
}

export async function approveAudienceRequest(accessToken: string, requestId: string) {
  const data = await request<{ audienceRequest: MarketingAudienceRequestSummary }>(
    `/marketing-eligibility/audience-requests/${requestId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.audienceRequest;
}

export async function rejectAudienceRequest(
  accessToken: string,
  requestId: string,
  rejectionReason: string,
) {
  const data = await request<{ audienceRequest: MarketingAudienceRequestSummary }>(
    `/marketing-eligibility/audience-requests/${requestId}/reject`,
    { method: 'POST', accessToken, body: { rejectionReason } },
  );
  return data.audienceRequest;
}

export async function fetchXeroSyncBackRequests(accessToken: string, customerId: string) {
  const data = await request<{ syncBackRequests: XeroContactSyncBackRequestSummary[] }>(
    `/marketing-eligibility/customers/${customerId}/xero-sync-back-requests`,
    { accessToken },
  );
  return data.syncBackRequests;
}

export async function createXeroSyncBackRequest(
  accessToken: string,
  body: CreateXeroSyncBackRequestInput,
) {
  const data = await request<{ syncBackRequest: XeroContactSyncBackRequestSummary }>(
    '/marketing-eligibility/xero-sync-back-requests',
    { method: 'POST', accessToken, body },
  );
  return data.syncBackRequest;
}

export async function fetchHumanQualityContentStandard(accessToken: string) {
  const data = await request<{ standard: unknown }>(
    '/marketing-eligibility/human-quality-content-standard',
    { accessToken },
  );
  return data.standard;
}
