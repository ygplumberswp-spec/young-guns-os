import {
  INTEGRATION_CAPABILITY_STATE_OPTIONS,
  INTEGRATION_CONNECTION_STATUS_OPTIONS,
  INTEGRATION_SYNC_JOB_STATUS_OPTIONS,
  INTEGRATION_WEBHOOK_EVENT_STATUS_OPTIONS,
  type IntegrationCapabilityState,
  type IntegrationConnectionStatus,
  type IntegrationConnectorStatus,
  type IntegrationSyncJobStatus,
  type IntegrationWebhookEventStatus,
} from '@titan/shared';

export function formatConnectionStatus(status: IntegrationConnectionStatus): string {
  return (
    INTEGRATION_CONNECTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

export function formatSyncJobStatus(status: IntegrationSyncJobStatus): string {
  return (
    INTEGRATION_SYNC_JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

export function formatWebhookEventStatus(status: IntegrationWebhookEventStatus): string {
  return (
    INTEGRATION_WEBHOOK_EVENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function formatProviderCategory(category: string): string {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Decision 4 / UX-G — CSS-safe modifier for the capability-state status pill. */
export function capabilityStateToPillModifier(state: IntegrationCapabilityState): string {
  switch (state) {
    case 'connected_usable':
      return 'connected';
    case 'configured_unverified':
      return 'pending';
    case 'not_configured':
      return 'disconnected';
    case 'disconnected':
      return 'disconnected';
    case 'failed_degraded':
      return 'error';
    case 'temporarily_unavailable':
      return 'warning';
    case 'not_implemented':
    default:
      return 'disabled';
  }
}

export function formatCapabilityStateDescription(state: IntegrationCapabilityState): string {
  return (
    INTEGRATION_CAPABILITY_STATE_OPTIONS.find((option) => option.value === state)?.description ??
    ''
  );
}

export function formatConnectorStatus(status: IntegrationConnectorStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'pending':
      return 'Pending';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}
