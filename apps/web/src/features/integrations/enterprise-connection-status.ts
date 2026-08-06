import type {
  IntegrationProviderAutoSyncStatus,
  IntegrationProviderStatus,
  SocialConnectionProviderCard,
} from '@titan/shared';

/** Owner-facing connection states for Integrations overview cards only. */
export type EnterpriseConnectionStatus =
  | 'connected'
  | 'connected_limited'
  | 'attention_required'
  | 'not_connected'
  | 'temporarily_unavailable';

export type EnterpriseConnectionStatusLabel =
  | 'Connected'
  | 'Connected — limited access'
  | 'Action required'
  | 'Not connected'
  | 'Temporarily unavailable';

export type EnterpriseConnectionActionLabel =
  | 'Manage'
  | 'Review'
  | 'Connect'
  | 'View status';

export const ENTERPRISE_CONNECTION_STATUS_LABELS: Record<
  EnterpriseConnectionStatus,
  EnterpriseConnectionStatusLabel
> = {
  connected: 'Connected',
  connected_limited: 'Connected — limited access',
  attention_required: 'Action required',
  not_connected: 'Not connected',
  temporarily_unavailable: 'Temporarily unavailable',
};

export const ENTERPRISE_CONNECTION_ACTION_LABELS: Record<
  EnterpriseConnectionStatus,
  EnterpriseConnectionActionLabel
> = {
  connected: 'Manage',
  connected_limited: 'Review',
  attention_required: 'Review',
  not_connected: 'Connect',
  temporarily_unavailable: 'View status',
};

export const FORBIDDEN_OVERVIEW_STATUS_WORDS = [
  'Synced',
  'Online',
  'Offline',
  'No connection',
  'Failed',
  'Partial',
] as const;

export function enterpriseStatusDotModifier(status: EnterpriseConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'connected_limited':
    case 'attention_required':
      return 'attention';
    case 'not_connected':
      return 'neutral';
    case 'temporarily_unavailable':
      return 'unavailable';
  }
}

/** Hub provider rows — derived from capability state and auto-sync signals only. */
export function deriveHubEnterpriseConnectionStatus(
  provider: IntegrationProviderStatus,
  autoSync?: IntegrationProviderAutoSyncStatus,
): EnterpriseConnectionStatus {
  if (
    provider.capabilityState === 'temporarily_unavailable' ||
    autoSync?.uiState === 'provider_unavailable'
  ) {
    return 'temporarily_unavailable';
  }

  if (provider.capabilityState === 'connected_usable') {
    if (
      autoSync?.uiState === 'permission_incomplete' ||
      (autoSync?.scopeProblems?.length ?? 0) > 0
    ) {
      return 'connected_limited';
    }

    if (
      autoSync?.uiState === 'degraded' ||
      autoSync?.uiState === 'sync_failed' ||
      autoSync?.uiState === 'reconnect_required' ||
      autoSync?.uiState === 'authentication_expired'
    ) {
      return 'attention_required';
    }

    return 'connected';
  }

  if (
    provider.capabilityState === 'failed_degraded' ||
    provider.capabilityState === 'configured_unverified' ||
    provider.connectionStatus === 'pending'
  ) {
    return 'attention_required';
  }

  return 'not_connected';
}

/** Social connection overview cards — derived from foundation and Facebook state. */
export function deriveSocialEnterpriseConnectionStatus(
  card: SocialConnectionProviderCard,
): EnterpriseConnectionStatus {
  if (card.foundationStatus === 'PROVIDER_REVIEW_REQUIRED') {
    return 'temporarily_unavailable';
  }

  if (card.foundationStatus === 'CONNECTED') {
    if (
      card.facebookConnectionState === 'connected_limited' ||
      card.pageSelectionMismatch === true
    ) {
      return 'connected_limited';
    }
    return 'connected';
  }

  if (
    card.foundationStatus === 'ERROR' ||
    card.foundationStatus === 'RECONNECT_REQUIRED' ||
    card.foundationStatus === 'ACCOUNT_SELECTION_REQUIRED' ||
    card.foundationStatus === 'CONNECTING'
  ) {
    return 'attention_required';
  }

  return 'not_connected';
}

export function resolveHubEnterpriseActionHref(
  provider: IntegrationProviderStatus,
  status: EnterpriseConnectionStatus,
): string | null {
  if (!provider.settingsPath) {
    return null;
  }

  if (status === 'not_connected' && !provider.canConnect) {
    return provider.settingsPath;
  }

  return provider.settingsPath;
}

export function resolveSocialEnterpriseActionHref(
  card: SocialConnectionProviderCard,
  status: EnterpriseConnectionStatus,
): string | null {
  if (status === 'attention_required' && card.accountSelectionPath) {
    return card.accountSelectionPath;
  }

  if (card.managementPath) {
    return card.managementPath;
  }

  if (status === 'not_connected') {
    return null;
  }

  return '/integrations';
}

export function hubEnterpriseActionUsesConnectFlow(
  provider: IntegrationProviderStatus,
  status: EnterpriseConnectionStatus,
): boolean {
  return status === 'not_connected' && provider.canConnect && Boolean(provider.settingsPath);
}

export function socialEnterpriseActionUsesConnectFlow(
  card: SocialConnectionProviderCard,
  status: EnterpriseConnectionStatus,
): boolean {
  return status === 'not_connected' && card.canConnect;
}
