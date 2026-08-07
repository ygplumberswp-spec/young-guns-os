import type {
  ActivateItplTemplateRequest,
  CreateItplTemplateRequest,
  DecideItplVersionRequest,
  ItplDashboard,
  ItplSettings,
  ItplTemplateDetail,
  ItplTemplateSummary,
  ItplVersionSummary,
  SaveItplVersionRequest,
  UpdateItplSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as IndustryTemplatesApiClientError };

export type ItplAuditEntry = {
  id: string;
  eventKind: string;
  templateId: string | null;
  subjectKey: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
};

export async function fetchItplDashboard(accessToken: string) {
  const data = await request<{ dashboard: ItplDashboard }>('/industry-templates/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchItplTemplates(accessToken: string) {
  const data = await request<{ templates: ItplTemplateSummary[] }>('/industry-templates/templates', {
    accessToken,
  });
  return data.templates;
}

export async function fetchItplTemplate(accessToken: string, templateId: string) {
  const data = await request<{ template: ItplTemplateDetail }>(
    `/industry-templates/templates/${encodeURIComponent(templateId)}`,
    { accessToken },
  );
  return data.template;
}

export async function createItplTemplate(
  accessToken: string,
  body: CreateItplTemplateRequest,
) {
  const data = await request<{ template: ItplTemplateDetail }>('/industry-templates/templates', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.template;
}

export async function saveItplVersion(
  accessToken: string,
  templateId: string,
  body: SaveItplVersionRequest,
) {
  const data = await request<{ version: ItplVersionSummary }>(
    `/industry-templates/templates/${encodeURIComponent(templateId)}/versions`,
    { method: 'POST', accessToken, body },
  );
  return data.version;
}

export async function submitItplVersion(
  accessToken: string,
  templateId: string,
  versionId: string,
) {
  const data = await request<{ version: ItplVersionSummary }>(
    `/industry-templates/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(
      versionId,
    )}/submit`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.version;
}

export async function decideItplVersion(
  accessToken: string,
  templateId: string,
  versionId: string,
  body: DecideItplVersionRequest,
) {
  const data = await request<{ version: ItplVersionSummary }>(
    `/industry-templates/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(
      versionId,
    )}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.version;
}

export async function activateItplTemplate(
  accessToken: string,
  templateId: string,
  body: ActivateItplTemplateRequest,
) {
  const data = await request<{ template: ItplTemplateDetail }>(
    `/industry-templates/templates/${encodeURIComponent(templateId)}/activate`,
    { method: 'POST', accessToken, body },
  );
  return data.template;
}

export async function updateItplSettings(
  accessToken: string,
  body: UpdateItplSettingsRequest,
) {
  const data = await request<{ settings: ItplSettings }>('/industry-templates/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function fetchItplAudit(accessToken: string, limit = 100) {
  const data = await request<{ entries: ItplAuditEntry[] }>(
    `/industry-templates/audit?limit=${encodeURIComponent(String(limit))}`,
    { accessToken },
  );
  return data.entries;
}
