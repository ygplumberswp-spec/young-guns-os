import type { IntegrationCapabilityState, IntegrationCapabilityStateLabel } from './integration-capability.js';
import { formatCapabilityStateLabel } from './integration-capability.js';

/** UX-J connector capability — never CONNECTED without verified config. */
export type N8nCapabilityState =
  | 'not_configured'
  | 'configured_unverified'
  | 'connected_usable'
  | 'temporarily_unavailable'
  | 'failed_degraded'
  | 'disconnected';

export type N8nExecutionStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'awaiting_approval';

export type N8nWorkflowRegistrationStatus = 'draft' | 'active' | 'paused' | 'disabled';

export const N8N_EXECUTION_STATUS_OPTIONS: Array<{
  value: N8nExecutionStatus;
  label: string;
}> = [
  { value: 'queued', label: 'Queued' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'timed_out', label: 'Timed Out' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
];

export const N8N_CAPABILITY_TO_INTEGRATION: Record<N8nCapabilityState, IntegrationCapabilityState> =
  {
    not_configured: 'not_configured',
    configured_unverified: 'configured_unverified',
    connected_usable: 'connected_usable',
    temporarily_unavailable: 'temporarily_unavailable',
    failed_degraded: 'failed_degraded',
    disconnected: 'disconnected',
  };

export type N8nConnectionSummary = {
  status: N8nCapabilityState;
  capabilityLabel: IntegrationCapabilityStateLabel;
  baseUrlHost: string | null;
  hasCredentials: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  dispatchEnabled: boolean;
  automationsPath: '/automation/n8n';
};

export type N8nWorkflowRegistrationSummary = {
  id: string;
  name: string;
  purpose: string | null;
  externalWorkflowKey: string;
  triggerEvent: string;
  status: N8nWorkflowRegistrationStatus;
  version: number;
  requiresApproval: boolean;
  ownerUserId: string | null;
  nativeWorkflowId: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type N8nExecutionSummary = {
  id: string;
  workflowRegistrationId: string;
  workflowName: string | null;
  correlationId: string;
  triggerEvent: string;
  status: N8nExecutionStatus;
  workflowVersion: number;
  attemptCount: number;
  maxAttempts: number;
  providerAccepted: boolean;
  businessOutcome: string | null;
  sanitizedError: string | null;
  nextRetryAt: string | null;
  dispatchedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type ConfigureN8nConnectionRequest = {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
};

export type RegisterN8nWorkflowRequest = {
  name: string;
  purpose?: string | null;
  externalWorkflowKey: string;
  triggerEvent: string;
  requiresApproval?: boolean;
  nativeWorkflowId?: string | null;
  status?: N8nWorkflowRegistrationStatus;
};

export type DispatchN8nExecutionRequest = {
  externalWorkflowKey: string;
  triggerEvent: string;
  idempotencyKey: string;
  /** Minimum permitted payload — never secrets. */
  payload: Record<string, unknown>;
};

export type N8nCallbackRequest = {
  callbackId: string;
  correlationId: string;
  companyId: string;
  externalWorkflowKey: string;
  status: 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  providerAccepted?: boolean;
  businessOutcome?: string | null;
  errorMessage?: string | null;
  timestamp: string;
};

export type N8nSignedHeaders = {
  'x-titan-company-id': string;
  'x-titan-correlation-id': string;
  'x-titan-timestamp': string;
  'x-titan-signature': string;
};

export const N8N_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;
export const N8N_DEFAULT_TIMEOUT_MS = 8_000;
export const N8N_RETRY_BACKOFF_MS = [2_000, 8_000, 30_000] as const;

/** Only loopback hosts — never live/external n8n cloud. */
export function isAllowedN8nBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

export function baseUrlHostOnly(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function deriveN8nCapabilityState(input: {
  status: N8nCapabilityState | string | null | undefined;
  hasCredentials: boolean;
  lastError?: string | null;
}): N8nCapabilityState {
  if (!input.hasCredentials || !input.status || input.status === 'not_configured') {
    return 'not_configured';
  }
  if (input.status === 'disconnected') return 'disconnected';
  if (input.status === 'connected_usable') return 'connected_usable';
  if (input.status === 'temporarily_unavailable') return 'temporarily_unavailable';
  if (input.status === 'failed_degraded') return 'failed_degraded';
  if (input.status === 'configured_unverified') return 'configured_unverified';
  return input.hasCredentials ? 'configured_unverified' : 'not_configured';
}

export function formatN8nCapabilityLabel(state: N8nCapabilityState): IntegrationCapabilityStateLabel {
  return formatCapabilityStateLabel(N8N_CAPABILITY_TO_INTEGRATION[state]);
}

/** Minimum outbound payload — strips secrets and oversized blobs. */
export function buildMinimumN8nPayload(input: {
  companyId: string;
  correlationId: string;
  externalWorkflowKey: string;
  triggerEvent: string;
  workflowVersion: number;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  const allowed = new Set([
    'entityType',
    'entityId',
    'jobId',
    'customerId',
    'eventType',
    'status',
    'summary',
  ]);
  const safePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.payload ?? {})) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'string' && value.length > 500) {
      safePayload[key] = value.slice(0, 500);
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safePayload[key] = value;
    }
  }
  return {
    companyId: input.companyId,
    correlationId: input.correlationId,
    externalWorkflowKey: input.externalWorkflowKey,
    triggerEvent: input.triggerEvent,
    workflowVersion: input.workflowVersion,
    payload: safePayload,
  };
}

export function buildN8nSignaturePayload(
  timestamp: string,
  correlationId: string,
  body: string,
): string {
  return `${timestamp}.${correlationId}.${body}`;
}

export function sanitizeN8nErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 400);
}

export function nextN8nRetryAt(attemptCount: number, fromMs = Date.now()): Date | null {
  const delay = N8N_RETRY_BACKOFF_MS[Math.min(attemptCount, N8N_RETRY_BACKOFF_MS.length - 1)];
  if (delay == null) return null;
  return new Date(fromMs + delay);
}

export function formatN8nExecutionStatus(status: N8nExecutionStatus): string {
  return N8N_EXECUTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}
