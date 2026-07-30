import type {
  CreateSecurityActionRequest,
  CreateSecurityPrivacyRequest,
  SecurityActionSummary,
  SecurityAuditLogSummary,
  SecurityExecutiveDashboard,
  SecurityLoginEventSummary,
  SecurityPrivacyRequestSummary,
  SecurityRiskAlertSummary,
  SecuritySessionSummary,
  SecurityTenantPolicySummary,
  SecurityTrustedDeviceSummary,
  UpdateSecurityTenantPolicyRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as EnterpriseSecurityApiClientError };

export async function fetchSecurityDashboard(accessToken: string) {
  const data = await request<{ dashboard: SecurityExecutiveDashboard }>(
    '/enterprise-security/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function fetchSecurityPolicy(accessToken: string) {
  const data = await request<{ policy: SecurityTenantPolicySummary }>(
    '/enterprise-security/policy',
    { accessToken },
  );
  return data.policy;
}

export async function updateSecurityPolicy(
  accessToken: string,
  body: UpdateSecurityTenantPolicyRequest,
) {
  const data = await request<{ policy: SecurityTenantPolicySummary }>(
    '/enterprise-security/policy',
    {
      accessToken,
      method: 'PATCH',
      body,
    },
  );
  return data.policy;
}

export async function fetchAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: SecurityAuditLogSummary[] }>(
    '/enterprise-security/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}

export async function fetchLoginEvents(accessToken: string) {
  const data = await request<{ loginEvents: SecurityLoginEventSummary[] }>(
    '/enterprise-security/login-events',
    {
      accessToken,
    },
  );
  return data.loginEvents;
}

export async function fetchActiveSessions(accessToken: string) {
  const data = await request<{ sessions: SecuritySessionSummary[] }>(
    '/enterprise-security/sessions',
    { accessToken },
  );
  return data.sessions;
}

export async function revokeSession(accessToken: string, sessionId: string) {
  await request<{ success: boolean }>(`/enterprise-security/sessions/${sessionId}/revoke`, {
    accessToken,
    method: 'POST',
  });
}

export async function revokeAllOtherSessions(accessToken: string) {
  const data = await request<{ success: boolean; revokedCount: number }>(
    '/enterprise-security/sessions/revoke-others',
    { accessToken, method: 'POST' },
  );
  return data.revokedCount;
}

export async function fetchTrustedDevices(accessToken: string) {
  const data = await request<{ trustedDevices: SecurityTrustedDeviceSummary[] }>(
    '/enterprise-security/trusted-devices',
    { accessToken },
  );
  return data.trustedDevices;
}

export async function fetchRiskAlerts(accessToken: string) {
  const data = await request<{ riskAlerts: SecurityRiskAlertSummary[] }>(
    '/enterprise-security/risk-alerts',
    {
      accessToken,
    },
  );
  return data.riskAlerts;
}

export async function resolveRiskAlert(accessToken: string, alertId: string) {
  const data = await request<{ riskAlert: SecurityRiskAlertSummary }>(
    `/enterprise-security/risk-alerts/${alertId}/resolve`,
    { accessToken, method: 'POST' },
  );
  return data.riskAlert;
}

export async function fetchSecurityActions(accessToken: string) {
  const data = await request<{ actions: SecurityActionSummary[] }>('/enterprise-security/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createSecurityAction(accessToken: string, body: CreateSecurityActionRequest) {
  const data = await request<{ action: SecurityActionSummary }>('/enterprise-security/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function fetchPrivacyRequests(accessToken: string) {
  const data = await request<{ privacyRequests: SecurityPrivacyRequestSummary[] }>(
    '/enterprise-security/privacy-requests',
    { accessToken },
  );
  return data.privacyRequests;
}

export async function createPrivacyRequest(
  accessToken: string,
  body: CreateSecurityPrivacyRequest,
) {
  const data = await request<{ privacyRequest: SecurityPrivacyRequestSummary }>(
    '/enterprise-security/privacy-requests',
    { accessToken, method: 'POST', body },
  );
  return data.privacyRequest;
}
