import type { ApiResponse } from '@titan/shared';
import { isApiError } from '@titan/shared';
import { resolveApiBase } from './runtime-env';
import { PortalApiClientError } from './portal-api-client';

export type PortalAuraChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PortalAuraPageContext = {
  route: string;
  module: string;
  recordType?: string;
  recordId?: string;
  customerId?: string;
  jobId?: string;
};

export type PortalAuraChatResponse = {
  message: PortalAuraChatMessage;
  safeActionLogged: boolean;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload) ? payload.error.message : 'Request failed';
    throw new PortalApiClientError(
      message,
      response.status,
      isApiError(payload) ? payload.error.code : 'REQUEST_FAILED',
    );
  }
  return payload.data;
}

export async function sendPortalAuraMessage(
  accessToken: string,
  input: {
    content: string;
    pageContext: PortalAuraPageContext;
    history?: PortalAuraChatMessage[];
  },
  options?: { signal?: AbortSignal },
): Promise<PortalAuraChatResponse> {
  const response = await fetch(`${resolveApiBase()}/portal/aura/chat`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    signal: options?.signal,
  });
  return parseResponse<PortalAuraChatResponse>(response);
}

export async function fetchPortalAuraContext(accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${resolveApiBase()}/portal/aura/context`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseResponse<{ context: Record<string, unknown> }>(response);
  return data.context;
}
