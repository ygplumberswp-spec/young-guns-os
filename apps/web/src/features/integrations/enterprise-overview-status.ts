import type { SocialConnectionStatus } from '@titan/shared';
import {
  ENTERPRISE_CONNECTION_STATUS_LABELS,
  type EnterpriseConnectionStatus,
} from './enterprise-connection-status';

/** Map legacy/overview enums to the five enterprise customer-facing labels. */
export function enterpriseLabelForStatus(status: EnterpriseConnectionStatus): string {
  return ENTERPRISE_CONNECTION_STATUS_LABELS[status];
}

/** Social Media Integrations foundation statuses — never surface Credentials stored on overview. */
export function mapSocialMediaFoundationStatusToEnterprise(
  status: SocialConnectionStatus,
): EnterpriseConnectionStatus {
  switch (status) {
    case 'connected':
      return 'attention_required';
    case 'degraded':
    case 'error':
      return 'attention_required';
    case 'disconnected':
    case 'not_configured':
    case 'awaiting_credentials':
      return 'not_connected';
    default:
      return 'not_connected';
  }
}

export function mapSocialMediaFoundationStatusLabel(status: SocialConnectionStatus): string {
  return enterpriseLabelForStatus(mapSocialMediaFoundationStatusToEnterprise(status));
}

/** Fleet tracking display labels on dashboard overview strips. */
export function mapFleetConnectionDisplayToEnterpriseLabel(displayLabel: string): string {
  const normalized = displayLabel.trim().toLowerCase();
  if (normalized === 'connected') {
    return ENTERPRISE_CONNECTION_STATUS_LABELS.connected;
  }
  if (
    normalized === 'disconnected' ||
    normalized === 'not configured' ||
    normalized === 'not connected'
  ) {
    return ENTERPRISE_CONNECTION_STATUS_LABELS.not_connected;
  }
  if (normalized === 'degraded' || normalized === 'error' || normalized.includes('stale')) {
    return ENTERPRISE_CONNECTION_STATUS_LABELS.attention_required;
  }
  if (normalized.includes('unavailable')) {
    return ENTERPRISE_CONNECTION_STATUS_LABELS.temporarily_unavailable;
  }
  return ENTERPRISE_CONNECTION_STATUS_LABELS.attention_required;
}

/** Boolean hub connection flags on overview StatCards. */
export function mapBooleanConnectionToEnterpriseLabel(connected: boolean): string {
  return connected
    ? ENTERPRISE_CONNECTION_STATUS_LABELS.connected
    : ENTERPRISE_CONNECTION_STATUS_LABELS.not_connected;
}

/** Dashboard source-meta states — avoid Partial/Disconnected on integration overview footers. */
export function mapDashboardSourceStateForIntegrations(
  state: 'live' | 'partial' | 'unavailable' | 'disconnected' | 'needs_setup',
): string {
  switch (state) {
    case 'live':
      return 'Live';
    case 'needs_setup':
      return 'Needs setup';
    case 'unavailable':
      return 'Unavailable';
    case 'partial':
      return 'Needs setup';
    case 'disconnected':
      return 'Not connected';
    default:
      return 'Unavailable';
  }
}
