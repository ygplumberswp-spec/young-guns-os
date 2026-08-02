export class GmailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

type GmailClientConfig = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiryDate?: number;
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: unknown[];
  };
  internalDate?: string;
  historyId?: string;
  sizeEstimate?: number;
};

type GmailLabel = {
  id: string;
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
};

type GmailListMessagesResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailListLabelsResponse = {
  labels?: GmailLabel[];
};

type GmailProfile = {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
};

type TokenRefreshResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export class GmailClient {
  private accessToken: string;
  private readonly refreshToken?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private expiryDate?: number;
  private readonly baseUrl = 'https://gmail.googleapis.com/gmail/v1';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';

  constructor(config: GmailClientConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.expiryDate = config.expiryDate;
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.expiryDate || Date.now() < this.expiryDate - 60000) {
      return;
    }

    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new GmailError('TOKEN_REFRESH_FAILED', 'Cannot refresh token: missing credentials');
    }

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new GmailError('TOKEN_REFRESH_FAILED', 'Failed to refresh access token');
      }

      const data = (await response.json()) as TokenRefreshResponse;
      this.accessToken = data.access_token;
      this.expiryDate = Date.now() + data.expires_in * 1000;
    } catch (error) {
      throw new GmailError(
        'TOKEN_REFRESH_FAILED',
        error instanceof Error ? error.message : 'Failed to refresh token',
      );
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.ensureValidToken();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = (errorData as { error?: { message?: string } }).error?.message ?? response.statusText;
      throw new GmailError('API_ERROR', `Gmail API error: ${message}`);
    }

    return response.json() as Promise<T>;
  }

  async getProfile(): Promise<GmailProfile> {
    return this.request<GmailProfile>('/users/me/profile');
  }

  async listLabels(): Promise<GmailLabel[]> {
    const response = await this.request<GmailListLabelsResponse>('/users/me/labels');
    return response.labels ?? [];
  }

  async listMessages(params?: {
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
    q?: string;
  }): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
    const queryParams = new URLSearchParams();
    if (params?.labelIds) queryParams.set('labelIds', params.labelIds.join(','));
    if (params?.maxResults) queryParams.set('maxResults', String(params.maxResults));
    if (params?.pageToken) queryParams.set('pageToken', params.pageToken);
    if (params?.q) queryParams.set('q', params.q);

    const endpoint = `/users/me/messages?${queryParams.toString()}`;
    const response = await this.request<GmailListMessagesResponse>(endpoint);

    return {
      messages: response.messages ?? [],
      nextPageToken: response.nextPageToken,
    };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    return this.request<GmailMessage>(`/users/me/messages/${messageId}?format=full`);
  }

  async sendMessage(message: {
    to: string;
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    const headers = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      message.cc ? `Cc: ${message.cc}` : null,
      message.bcc ? `Bcc: ${message.bcc}` : null,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
    ]
      .filter(Boolean)
      .join('\r\n');

    const body = message.bodyHtml ?? message.bodyText ?? '';
    const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return this.request<{ id: string; threadId: string; labelIds: string[] }>('/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw }),
    });
  }

  async createDraft(message: {
    to: string;
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ id: string; message: { id: string; threadId: string } }> {
    const headers = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      message.cc ? `Cc: ${message.cc}` : null,
      message.bcc ? `Bcc: ${message.bcc}` : null,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
    ]
      .filter(Boolean)
      .join('\r\n');

    const body = message.bodyHtml ?? message.bodyText ?? '';
    const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return this.request<{ id: string; message: { id: string; threadId: string } }>('/users/me/drafts', {
      method: 'POST',
      body: JSON.stringify({ message: { raw } }),
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.request(`/users/me/drafts/${draftId}`, { method: 'DELETE' });
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getExpiryDate(): number | undefined {
    return this.expiryDate;
  }
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
}> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = (errorData as { error_description?: string }).error_description ?? 'Token exchange failed';
    throw new GmailError('AUTH_FAILED', message);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}
