import { request } from './api-client';
import type {
  EnterpriseSaasManagementDashboard,
  SmBillingPolicySummary,
  SmCouponSummary,
  SmLicenseSummary,
  SmOwnerBillingSummary,
  SmPartnerAccountSummary,
  SmPaymentProviderSummary,
  SmSaasAlertSummary,
  SmUsageThresholdSummary,
} from '@titan/shared';

export async function fetchSaasManagementDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseSaasManagementDashboard }>('/enterprise-saas-management/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchOwnerBilling(accessToken: string) {
  const data = await request<{ ownerBilling: SmOwnerBillingSummary }>('/enterprise-saas-management/owner-billing', {
    accessToken,
  });
  return data.ownerBilling;
}

export async function syncSaasAlerts(accessToken: string) {
  const data = await request<{ saasAlerts: SmSaasAlertSummary[] }>('/enterprise-saas-management/saas-alerts/sync', {
    method: 'POST',
    accessToken,
  });
  return data.saasAlerts;
}

export async function captureSaasAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-saas-management/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function fetchSaasLicenses(accessToken: string) {
  const data = await request<{ licenses: SmLicenseSummary[] }>('/enterprise-saas-management/licenses', { accessToken });
  return data.licenses;
}

export async function fetchPaymentProviders(accessToken: string) {
  const data = await request<{ paymentProviders: SmPaymentProviderSummary[] }>(
    '/enterprise-saas-management/payment-providers',
    { accessToken },
  );
  return data.paymentProviders;
}

export async function fetchBillingPolicies(accessToken: string) {
  const data = await request<{ billingPolicies: SmBillingPolicySummary[] }>(
    '/enterprise-saas-management/billing-policies',
    { accessToken },
  );
  return data.billingPolicies;
}

export async function fetchSaasCoupons(accessToken: string) {
  const data = await request<{ coupons: SmCouponSummary[] }>('/enterprise-saas-management/coupons', { accessToken });
  return data.coupons;
}

export async function fetchSaasPartners(accessToken: string) {
  const data = await request<{ partners: SmPartnerAccountSummary[] }>('/enterprise-saas-management/partners', {
    accessToken,
  });
  return data.partners;
}

export async function fetchUsageThresholds(accessToken: string) {
  const data = await request<{ usageThresholds: SmUsageThresholdSummary[] }>(
    '/enterprise-saas-management/usage-thresholds',
    { accessToken },
  );
  return data.usageThresholds;
}

export async function fetchSaasAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: Array<{ id: string; actionType: string; createdAt: string }> }>(
    '/enterprise-saas-management/audit-logs',
    { accessToken },
  );
  return data.auditLogs;
}

export async function upgradeSubscription(accessToken: string, planId: string) {
  const data = await request<{ subscription: unknown }>('/enterprise-saas-management/subscriptions/upgrade', {
    method: 'POST',
    accessToken,
    body: { planId },
  });
  return data.subscription;
}

export async function downgradeSubscription(accessToken: string, planId: string) {
  const data = await request<{ subscription: unknown }>('/enterprise-saas-management/subscriptions/downgrade', {
    method: 'POST',
    accessToken,
    body: { planId },
  });
  return data.subscription;
}

export async function cancelSubscription(accessToken: string) {
  const data = await request<{ subscription: unknown }>('/enterprise-saas-management/subscriptions/cancel', {
    method: 'POST',
    accessToken,
  });
  return data.subscription;
}
