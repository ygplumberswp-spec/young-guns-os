import type {
  CreateSnActionDraftRequest,
  DecideSnActionRequest,
  SnActionDraftSummary,
  SnAuditEntry,
  SnCategory,
  SnCategoryControl,
  SnDashboard,
  SnSettings,
  SnSignalActionRequest,
  UpdateSnCategoryControlRequest,
  UpdateSnSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SmartNotificationsApiClientError };

export async function fetchSnDashboard(accessToken: string) {
  const data = await request<{ dashboard: SnDashboard }>('/smart-notifications/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchSnSettings(accessToken: string) {
  const data = await request<{ settings: SnSettings }>('/smart-notifications/settings', {
    accessToken,
  });
  return data.settings;
}

export async function updateSnSettings(accessToken: string, body: UpdateSnSettingsRequest) {
  const data = await request<{ settings: SnSettings }>('/smart-notifications/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function fetchSnCategoryControls(accessToken: string) {
  const data = await request<{ controls: SnCategoryControl[] }>('/smart-notifications/categories', {
    accessToken,
  });
  return data.controls;
}

export async function updateSnCategoryControl(
  accessToken: string,
  category: SnCategory,
  body: UpdateSnCategoryControlRequest,
) {
  const data = await request<{ control: SnCategoryControl }>(
    `/smart-notifications/categories/${category}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.control;
}

export async function actOnSnSignal(accessToken: string, body: SnSignalActionRequest) {
  return request<{ status: string; snoozedUntil: string | null }>('/smart-notifications/signals/act', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function fetchSnSignalAudit(accessToken: string, groupKey: string) {
  const data = await request<{ entries: SnAuditEntry[] }>(
    `/smart-notifications/signals/${encodeURIComponent(groupKey)}/audit`,
    { accessToken },
  );
  return data.entries;
}

export async function fetchSnCompanyAudit(accessToken: string) {
  const data = await request<{ entries: SnAuditEntry[] }>('/smart-notifications/audit', {
    accessToken,
  });
  return data.entries;
}

export async function fetchSnActionDrafts(accessToken: string) {
  const data = await request<{ actions: SnActionDraftSummary[] }>('/smart-notifications/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createSnActionDraft(
  accessToken: string,
  body: CreateSnActionDraftRequest,
) {
  const data = await request<{ action: SnActionDraftSummary }>('/smart-notifications/actions', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.action;
}

export async function refreshSnActionDrafts(
  accessToken: string,
  body: { submitForApproval?: boolean } = {},
) {
  const data = await request<{ actions: SnActionDraftSummary[] }>(
    '/smart-notifications/actions/refresh',
    { method: 'POST', accessToken, body },
  );
  return data.actions;
}

export async function decideSnActionDraft(
  accessToken: string,
  actionId: string,
  body: DecideSnActionRequest,
) {
  const data = await request<{ action: SnActionDraftSummary }>(
    `/smart-notifications/actions/${actionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.action;
}
