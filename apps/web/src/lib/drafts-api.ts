import type {
  DraftWorkspaceDetail,
  DraftWorkspaceSummary,
  DuplicateDraftRequest,
  UpsertDraftRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchDrafts(
  accessToken: string,
  query?: { recordType?: string; status?: string },
): Promise<DraftWorkspaceSummary[]> {
  const params = new URLSearchParams();
  if (query?.recordType) params.set('recordType', query.recordType);
  if (query?.status) params.set('status', query.status);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ drafts: DraftWorkspaceSummary[] }>(`/drafts${suffix}`, {
    accessToken,
  });
  return data.drafts;
}

export async function fetchDraft(
  accessToken: string,
  draftId: string,
): Promise<DraftWorkspaceDetail> {
  const data = await request<{ draft: DraftWorkspaceDetail }>(`/drafts/${draftId}`, { accessToken });
  return data.draft;
}

export async function upsertDraft(
  accessToken: string,
  body: UpsertDraftRequest,
): Promise<DraftWorkspaceDetail> {
  const data = await request<{ draft: DraftWorkspaceDetail }>('/drafts/upsert', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.draft;
}

export async function duplicateDraft(
  accessToken: string,
  draftId: string,
  body?: DuplicateDraftRequest,
): Promise<DraftWorkspaceDetail> {
  const data = await request<{ draft: DraftWorkspaceDetail }>(`/drafts/${draftId}/duplicate`, {
    method: 'POST',
    accessToken,
    body: body ?? {},
  });
  return data.draft;
}

export async function archiveDraft(
  accessToken: string,
  draftId: string,
): Promise<DraftWorkspaceSummary> {
  const data = await request<{ draft: DraftWorkspaceSummary }>(`/drafts/${draftId}/archive`, {
    method: 'POST',
    accessToken,
  });
  return data.draft;
}

export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  await request<void>(`/drafts/${draftId}`, { method: 'DELETE', accessToken });
}
