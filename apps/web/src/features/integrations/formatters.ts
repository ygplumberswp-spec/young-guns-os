import {
  INTEGRATION_CONNECTION_STATUS_OPTIONS,
  INTEGRATION_SYNC_JOB_STATUS_OPTIONS,
  INTEGRATION_WEBHOOK_EVENT_STATUS_OPTIONS,
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
