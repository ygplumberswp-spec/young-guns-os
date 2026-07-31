import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';

export class YocoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'YocoError';
  }
}

export type YocoBusinessRecord = {
  businessId: string;
  name: string;
  raw: Record<string, unknown>;
};

type YocoClientOptions = {
  secretKey: string;
  environment: 'test' | 'live';
};

const API_BASE_URL = 'https://api.yoco.com/v1';

export class YocoClient {
  private readonly secretKey: string;

  constructor({ secretKey }: YocoClientOptions) {
    this.secretKey = secretKey.trim();
  }

  async testConnection(): Promise<YocoBusinessRecord> {
    return this.fetchBusiness();
  }

  async fetchBusiness(): Promise<YocoBusinessRecord> {
    const payload = await this.request('/business/');
    return parseBusinessRecord(payload);
  }

  private async request(path: string): Promise<unknown> {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json',
        },
        signal: providerTimeoutSignal(),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new YocoError(
          'TIMEOUT',
          `Yoco request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new YocoError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Yoco API',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new YocoError('AUTH_FAILED', 'Yoco rejected the provided secret key');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new YocoError(
        'API_ERROR',
        `Yoco API returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      throw new YocoError('API_ERROR', 'Yoco API returned a non-JSON response');
    }

    return response.json();
  }
}

function parseBusinessRecord(payload: unknown): YocoBusinessRecord {
  if (!payload || typeof payload !== 'object') {
    throw new YocoError('API_ERROR', 'Yoco returned an invalid business payload');
  }

  const record = payload as Record<string, unknown>;
  const businessId = pickString(record, ['id', 'business_id', 'businessId']);
  const name = pickString(record, ['name', 'display_name', 'business_name', 'trading_name']);

  if (!businessId || !name) {
    throw new YocoError('API_ERROR', 'Yoco business payload is missing required fields');
  }

  return {
    businessId,
    name,
    raw: record,
  };
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
