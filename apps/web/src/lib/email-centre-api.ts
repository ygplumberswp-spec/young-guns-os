import { request } from './api-client';
import type {
  CommAttachmentLinkSummary,
  CommTimelineNoteSummary,
  CommunicationTimelineFilter,
  CommunicationTimelineResult,
  CreateCommAttachmentLinkRequest,
  CreateCommTimelineNoteRequest,
  EmailCentreDashboard,
  EmailCentreDraftSummary,
  EmailCentreMailboxFilter,
  EmailCentreMessageSummary,
  EmailCentreReplyRequest,
  EmailCentreThreadHistory,
} from '@titan/shared';

function toQuery(filter: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchEmailCentreDashboard(accessToken: string) {
  const data = await request<{ dashboard: EmailCentreDashboard }>('/email-centre/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchEmailCentreMailbox(
  accessToken: string,
  filter: EmailCentreMailboxFilter = {},
) {
  const data = await request<{
    mailbox: {
      items: EmailCentreMessageSummary[];
      total: number;
      emptyReason: EmailCentreDashboard['mailbox']['emptyReason'];
    };
  }>(
    `/email-centre/mailbox${toQuery(filter as Record<string, string | number | boolean | undefined>)}`,
    { accessToken },
  );
  return data.mailbox;
}

export async function fetchEmailThread(accessToken: string, inboxItemId: string) {
  const data = await request<{ thread: EmailCentreThreadHistory }>(
    `/email-centre/threads/${inboxItemId}`,
    { accessToken },
  );
  return data.thread;
}

export async function listEmailCentreDrafts(accessToken: string) {
  const data = await request<{ drafts: EmailCentreDraftSummary[] }>('/email-centre/drafts', {
    accessToken,
  });
  return data.drafts;
}

export async function createEmailCentreDraft(
  accessToken: string,
  body: EmailCentreReplyRequest,
) {
  const data = await request<{ draft: EmailCentreDraftSummary }>('/email-centre/drafts', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.draft;
}

export async function approveEmailCentreDraft(accessToken: string, draftId: string) {
  const data = await request<{ draft: EmailCentreDraftSummary }>(
    `/email-centre/drafts/${draftId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.draft;
}

export async function executeEmailCentreDraft(accessToken: string, draftId: string) {
  const data = await request<{ draft: EmailCentreDraftSummary }>(
    `/email-centre/drafts/${draftId}/execute`,
    { method: 'POST', accessToken },
  );
  return data.draft;
}

export async function linkEmailCentreMessage(
  accessToken: string,
  inboxItemId: string,
  body: {
    linkTargetType: 'customer' | 'job' | 'lead' | 'quote' | 'invoice';
    linkTargetId: string;
  },
) {
  const data = await request<{ item: EmailCentreMessageSummary }>(
    `/email-centre/mailbox/${inboxItemId}/link`,
    { method: 'POST', accessToken, body },
  );
  return data.item;
}

export async function createEmailCentreAttachment(
  accessToken: string,
  body: CreateCommAttachmentLinkRequest,
) {
  const data = await request<{ attachment: CommAttachmentLinkSummary }>(
    '/email-centre/attachments',
    { method: 'POST', accessToken, body },
  );
  return data.attachment;
}

export async function fetchEmailCentreAttachments(
  accessToken: string,
  filter: {
    anchorType?: string;
    anchorId?: string;
    customerId?: string;
    jobId?: string;
    limit?: number;
  } = {},
) {
  const data = await request<{ attachments: CommAttachmentLinkSummary[] }>(
    `/email-centre/attachments${toQuery(filter)}`,
    { accessToken },
  );
  return data.attachments;
}

export async function fetchCommunicationTimeline(
  accessToken: string,
  filter: CommunicationTimelineFilter = {},
) {
  const data = await request<{ timeline: CommunicationTimelineResult }>(
    `/email-centre/timeline${toQuery(filter as Record<string, string | number | boolean | undefined>)}`,
    { accessToken },
  );
  return data.timeline;
}

export async function syncCommunicationTimelineIndex(accessToken: string) {
  const data = await request<{ timeline: CommunicationTimelineResult }>(
    '/email-centre/timeline/sync',
    { method: 'POST', accessToken },
  );
  return data.timeline;
}

export async function createCommunicationTimelineNote(
  accessToken: string,
  body: CreateCommTimelineNoteRequest,
) {
  const data = await request<{ note: CommTimelineNoteSummary }>('/email-centre/timeline/notes', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.note;
}
