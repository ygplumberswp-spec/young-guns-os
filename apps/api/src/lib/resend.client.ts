import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';

export class ResendError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ResendError';
  }
}

export type ResendConnectionVerification = {
  connected: true;
  domainCount: number;
  raw: Record<string, unknown>;
};

export type ResendSendEmailInput = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  idempotencyKey?: string;
};

export type ResendSendEmailResult = {
  id: string;
  raw: Record<string, unknown>;
};

type ResendClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

const API_BASE_URL = 'https://api.resend.com';

export class ResendClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ apiKey, fetchImpl }: ResendClientOptions) {
    this.apiKey = apiKey.trim().replace(/^Bearer\s+/i, '').trim();
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Probe credentials via domains list — does not send mail. */
  async testConnection(): Promise<ResendConnectionVerification> {
    const payload = await this.request<Record<string, unknown>>('/domains', { method: 'GET' });
    const data = Array.isArray(payload.data) ? payload.data : [];
    return {
      connected: true,
      domainCount: data.length,
      raw: payload,
    };
  }

  async sendEmail(input: ResendSendEmailInput): Promise<ResendSendEmailResult> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const body: Record<string, unknown> = {
      from: input.from,
      to,
      subject: input.subject,
    };
    if (input.html !== undefined) body.html = input.html;
    if (input.text !== undefined) body.text = input.text;
    if (input.replyTo) body.reply_to = input.replyTo;
    if (input.tags?.length) body.tags = input.tags;

    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers['Idempotency-Key'] = input.idempotencyKey.slice(0, 256);
    }

    const payload = await this.request<Record<string, unknown>>('/emails', {
      method: 'POST',
      body,
      headers,
    });

    const id = typeof payload.id === 'string' ? payload.id : null;
    if (!id) {
      throw new ResendError('INVALID_RESPONSE', 'Resend send response missing email id');
    }

    return { id, raw: payload };
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE_URL}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers ?? {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: providerTimeoutSignal(PROVIDER_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ResendError('TIMEOUT', 'Resend API request timed out');
      }
      throw new ResendError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Resend API',
      );
    }

    const text = await response.text();
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = { message: text };
      }
    }

    if (!response.ok) {
      const message =
        (typeof json.message === 'string' && json.message) ||
        (typeof json.error === 'string' && json.error) ||
        `Resend API error (${response.status})`;
      const code =
        response.status === 401 || response.status === 403
          ? 'AUTH_FAILED'
          : response.status === 422
            ? 'VALIDATION_ERROR'
            : 'API_ERROR';
      throw new ResendError(code, message, response.status);
    }

    return json as T;
  }
}
