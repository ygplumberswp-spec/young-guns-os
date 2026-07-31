import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';

const DEFAULT_API_VERSION = 'v21.0';

export class WhatsappError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsappError';
  }
}

type WhatsappClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
};

type WhatsappPhoneNumberResponse = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

type WhatsappSendMessageResponse = {
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type?: string;
    code?: number;
  };
};

export class WhatsappClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;

  constructor(config: WhatsappClientConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  }

  async verifyConnection(): Promise<{
    displayPhoneNumber: string | null;
    verifiedName: string | null;
  }> {
    const response = await this.request<WhatsappPhoneNumberResponse>(
      `/${this.phoneNumberId}?fields=id,display_phone_number,verified_name`,
      { method: 'GET' },
    );

    if (!response.id) {
      throw new WhatsappError('CONNECTION_FAILED', 'WhatsApp phone number could not be verified');
    }

    return {
      displayPhoneNumber: response.display_phone_number ?? null,
      verifiedName: response.verified_name ?? null,
    };
  }

  async sendTextMessage(input: { to: string; body: string }): Promise<string> {
    const response = await this.request<WhatsappSendMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizePhoneNumber(input.to),
          type: 'text',
          text: {
            preview_url: false,
            body: input.body,
          },
        }),
      },
    );

    const messageId = response.messages?.[0]?.id;

    if (!messageId) {
      throw new WhatsappError(
        'SEND_FAILED',
        response.error?.message ?? 'WhatsApp message could not be sent',
      );
    }

    return messageId;
  }

  async sendTemplateMessage(input: {
    to: string;
    templateName: string;
    languageCode?: string;
    components?: Array<Record<string, unknown>>;
  }): Promise<string> {
    const response = await this.request<WhatsappSendMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizePhoneNumber(input.to),
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: input.languageCode ?? 'en' },
            components: input.components,
          },
        }),
      },
    );

    const messageId = response.messages?.[0]?.id;

    if (!messageId) {
      throw new WhatsappError(
        'SEND_FAILED',
        response.error?.message ?? 'WhatsApp template message could not be sent',
      );
    }

    return messageId;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`https://graph.facebook.com/${this.apiVersion}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? providerTimeoutSignal(),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new WhatsappError(
          'TIMEOUT',
          `WhatsApp request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new WhatsappError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach WhatsApp API',
      );
    }

    const payload = (await response.json()) as T & {
      error?: { message: string; type?: string; code?: number };
    };

    if (!response.ok) {
      throw new WhatsappError(
        'API_ERROR',
        payload.error?.message ?? `WhatsApp API request failed (${response.status})`,
      );
    }

    return payload;
  }
}

export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export type WhatsappWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
        }>;
      };
    }>;
  }>;
};

export function parseIncomingWebhookMessages(payload: WhatsappWebhookPayload) {
  const results: Array<{
    phoneNumberId: string;
    from: string;
    externalMessageId: string;
    body: string;
    contactName: string | null;
    timestamp: string | null;
  }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      for (const message of value?.messages ?? []) {
        if (!message.from || !message.id) {
          continue;
        }

        const body =
          message.type === 'text' && message.text?.body
            ? message.text.body
            : `[${message.type ?? 'unknown'} message]`;

        results.push({
          phoneNumberId,
          from: message.from,
          externalMessageId: message.id,
          body,
          contactName: value?.contacts?.[0]?.profile?.name ?? null,
          timestamp: message.timestamp ?? null,
        });
      }
    }
  }

  return results;
}

export function parseWebhookDeliveryStatuses(payload: WhatsappWebhookPayload) {
  const results: Array<{
    phoneNumberId: string;
    externalMessageId: string;
    status: string;
    timestamp: string | null;
  }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      for (const statusUpdate of value?.statuses ?? []) {
        if (!statusUpdate.id || !statusUpdate.status) {
          continue;
        }

        results.push({
          phoneNumberId,
          externalMessageId: statusUpdate.id,
          status: statusUpdate.status,
          timestamp: statusUpdate.timestamp ?? null,
        });
      }
    }
  }

  return results;
}
