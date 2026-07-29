import type {
  EnterpriseVoiceReceptionDashboard,
  VrActionDraftSummary,
  VrAuditLogSummary,
  VrVoiceAlertSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchVoiceReceptionDashboard(accessToken: string): Promise<EnterpriseVoiceReceptionDashboard> {
  const data = await request<{ dashboard: EnterpriseVoiceReceptionDashboard }>('/enterprise-voice-reception/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function syncVoiceAlerts(accessToken: string): Promise<VrVoiceAlertSummary[]> {
  const data = await request<{ voiceAlerts: VrVoiceAlertSummary[] }>('/enterprise-voice-reception/voice-alerts/sync', {
    accessToken,
    method: 'POST',
  });
  return data.voiceAlerts;
}

export async function captureVoiceAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-voice-reception/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function captureVoiceQuality(accessToken: string) {
  const data = await request<{ quality: unknown }>('/enterprise-voice-reception/quality/capture', {
    accessToken,
    method: 'POST',
  });
  return data.quality;
}

export async function fetchVoiceAuditLogs(accessToken: string): Promise<VrAuditLogSummary[]> {
  const data = await request<{ auditLogs: VrAuditLogSummary[] }>('/enterprise-voice-reception/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function fetchVoiceActionDrafts(accessToken: string): Promise<VrActionDraftSummary[]> {
  const data = await request<{ actionDrafts: VrActionDraftSummary[] }>('/enterprise-voice-reception/action-drafts', {
    accessToken,
  });
  return data.actionDrafts;
}

export async function updateAiReceptionistConfig(
  accessToken: string,
  input: { enabled?: boolean; welcomeMessage?: string; confidenceThreshold?: number },
) {
  const data = await request<{ aiReceptionist: unknown }>('/enterprise-voice-reception/ai-receptionist', {
    accessToken,
    method: 'PUT',
    body: input,
  });
  return data.aiReceptionist;
}
