/**
 * Thin Gmail API client (Google REST). No invented messages — empty/error on failure.
 */

export const GMAIL_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export type GmailMessageListItem = {
  id: string;
  threadId: string;
};

export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type GmailLabel = {
  id: string;
  name: string;
  type?: string;
};

export type GmailProfile = {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
};

export type GmailAttachment = {
  size: number;
  data: string;
};

export class GmailClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GmailClientError';
  }
}

type FetchLike = typeof fetch;

export class GmailClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getProfile(): Promise<GmailProfile> {
    const payload = await this.requestJson<{ emailAddress?: string; messagesTotal?: number; threadsTotal?: number }>(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    );
    if (!payload.emailAddress?.trim()) {
      throw new GmailClientError('PROFILE_MISSING', 'Gmail profile did not return an email address');
    }
    return {
      emailAddress: payload.emailAddress.trim(),
      messagesTotal: payload.messagesTotal,
      threadsTotal: payload.threadsTotal,
    };
  }

  async listLabels(): Promise<GmailLabel[]> {
    const payload = await this.requestJson<{ labels?: GmailLabel[] }>(
      'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    );
    return payload.labels ?? [];
  }

  async listMessages(input: {
    q?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: GmailMessageListItem[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    if (input.q) params.set('q', input.q);
    if (input.maxResults) params.set('maxResults', String(input.maxResults));
    if (input.pageToken) params.set('pageToken', input.pageToken);
    for (const labelId of input.labelIds ?? []) {
      params.append('labelIds', labelId);
    }
    const qs = params.toString();
    const payload = await this.requestJson<{
      messages?: GmailMessageListItem[];
      nextPageToken?: string;
    }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages${qs ? `?${qs}` : ''}`);
    return {
      messages: payload.messages ?? [],
      nextPageToken: payload.nextPageToken,
    };
  }

  async getMessage(messageId: string, format: 'metadata' | 'full' | 'minimal' = 'full'): Promise<GmailMessage> {
    const params = new URLSearchParams({ format });
    if (format === 'metadata') {
      params.append('metadataHeaders', 'From');
      params.append('metadataHeaders', 'To');
      params.append('metadataHeaders', 'Subject');
      params.append('metadataHeaders', 'Date');
    }
    return this.requestJson<GmailMessage>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params}`,
    );
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<GmailAttachment> {
    return this.requestJson<GmailAttachment>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
  }

  async createDraft(rawMimeBase64Url: string): Promise<{ id: string; message?: { id?: string } }> {
    return this.requestJson(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        body: JSON.stringify({ message: { raw: rawMimeBase64Url } }),
      },
    );
  }

  async sendRaw(rawMimeBase64Url: string): Promise<{ id: string; threadId?: string; labelIds?: string[] }> {
    return this.requestJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: rawMimeBase64Url }),
    });
  }

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      });
    } catch (error) {
      throw new GmailClientError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Gmail API',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new GmailClientError(
        'AUTH_FAILED',
        'Gmail rejected the access token. Reconnect Business Gmail.',
        response.status,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GmailClientError(
        'GMAIL_API_ERROR',
        `Gmail API failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}

export function getHeader(message: GmailMessage, name: string): string | null {
  const headers = message.payload?.headers ?? [];
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() || null;
}

export function collectAttachments(part: GmailMessagePart | undefined): Array<{
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}> {
  if (!part) return [];
  const out: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];
  if (part.filename && part.body?.attachmentId) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) {
    out.push(...collectAttachments(child));
  }
  return out;
}

export function extractTextBody(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const text = extractTextBody(child);
    if (text) return text;
  }
  return '';
}

export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function encodeRawMime(input: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${input.to.join(', ')}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(', ')}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(', ')}`] : []),
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    '',
    input.bodyText,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function folderQuery(folder: string): { q?: string; labelIds?: string[] } {
  switch (folder) {
    case 'inbox':
      return { labelIds: ['INBOX'] };
    case 'sent':
      return { labelIds: ['SENT'] };
    case 'drafts':
      return { labelIds: ['DRAFT'] };
    case 'chats':
      return { q: 'label:chats' };
    case 'labels':
    case 'all':
    default:
      return {};
  }
}
