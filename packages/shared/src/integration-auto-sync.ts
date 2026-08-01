import type { IntegrationProvider } from './integrations.js';

/** Providers participating in the tenant-safe auto-sync orchestrator. */
export type AutoSyncProviderKey =
  | 'xero'
  | 'cartrack'
  | 'google_maps'
  | 'whatsapp'
  | 'email'
  | 'google_calendar'
  | 'yoco'
  | 'stripe'
  | 'meta'
  | 'n8n'
  | 'openai'
  | 'gemini';

export type IntegrationSyncTrigger = 'initial' | 'incremental' | 'manual' | 'retry';

export type IntegrationAutoSyncUiState =
  | 'not_configured'
  | 'connecting'
  | 'connected'
  | 'initial_sync_running'
  | 'synced'
  | 'degraded'
  | 'authentication_expired'
  | 'permission_incomplete'
  | 'provider_unavailable'
  | 'sync_failed'
  | 'reconnect_required';

export type IntegrationAutoSyncImplementation = 'full' | 'partial' | 'stub';

export type IntegrationProviderAutoSyncStatus = {
  provider: AutoSyncProviderKey;
  integrationProvider: IntegrationProvider | null;
  displayName: string;
  implementation: IntegrationAutoSyncImplementation;
  uiState: IntegrationAutoSyncUiState;
  uiStateLabel: string;
  connectionStatus: 'disconnected' | 'pending' | 'connected' | 'error';
  autoSyncEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  recordsProcessed: number | null;
  failureCount: number;
  consecutiveFailures: number;
  retryStatus: 'idle' | 'scheduled' | 'in_progress' | 'exhausted';
  retryAt: string | null;
  scopeProblems: string[];
  lastError: string | null;
  correctiveAction: string | null;
  syncInProgress: boolean;
  connectorId: string | null;
};

export type IntegrationAutoSyncRunResult = {
  provider: AutoSyncProviderKey;
  trigger: IntegrationSyncTrigger;
  success: boolean;
  syncJobId: string | null;
  recordsProcessed: number;
  message: string;
  errorCode: string | null;
  /** True when work was queued for background processing (outcome pending). */
  queued?: boolean;
  /** Provider-specific payload (e.g. full Xero import counts). */
  details?: Record<string, unknown> | null;
};

export const AUTO_SYNC_UI_STATE_LABELS: Record<IntegrationAutoSyncUiState, string> = {
  not_configured: 'Not configured',
  connecting: 'Connecting',
  connected: 'Connected',
  initial_sync_running: 'Initial sync running',
  synced: 'Synced',
  degraded: 'Degraded',
  authentication_expired: 'Authentication expired',
  permission_incomplete: 'Permission incomplete',
  provider_unavailable: 'Provider unavailable',
  sync_failed: 'Sync failed',
  reconnect_required: 'Reconnect required',
};

/** Default incremental polling intervals (minutes) per provider. */
export const AUTO_SYNC_DEFAULT_INTERVAL_MINUTES: Record<AutoSyncProviderKey, number | null> = {
  xero: 20,
  cartrack: 15,
  google_maps: null,
  whatsapp: null,
  email: 60,
  google_calendar: null,
  yoco: 60,
  stripe: null,
  meta: null,
  n8n: 30,
  openai: 60,
  gemini: 60,
};

export const AUTO_SYNC_PROVIDER_CATALOG: Array<{
  key: AutoSyncProviderKey;
  displayName: string;
  integrationProvider: IntegrationProvider | null;
  implementation: IntegrationAutoSyncImplementation;
}> = [
  { key: 'xero', displayName: 'Xero', integrationProvider: 'xero', implementation: 'full' },
  { key: 'cartrack', displayName: 'Cartrack', integrationProvider: 'cartrack', implementation: 'full' },
  {
    key: 'google_maps',
    displayName: 'Google Maps',
    integrationProvider: 'google_maps',
    implementation: 'stub',
  },
  {
    key: 'whatsapp',
    displayName: 'WhatsApp Business',
    integrationProvider: 'whatsapp',
    implementation: 'partial',
  },
  { key: 'email', displayName: 'Email (SMTP)', integrationProvider: 'email', implementation: 'partial' },
  {
    key: 'google_calendar',
    displayName: 'Google Calendar',
    integrationProvider: 'google_calendar',
    implementation: 'stub',
  },
  { key: 'yoco', displayName: 'Yoco', integrationProvider: 'yoco', implementation: 'partial' },
  { key: 'stripe', displayName: 'Stripe', integrationProvider: null, implementation: 'stub' },
  { key: 'meta', displayName: 'Meta / advertising', integrationProvider: null, implementation: 'stub' },
  { key: 'n8n', displayName: 'n8n', integrationProvider: null, implementation: 'partial' },
  { key: 'openai', displayName: 'OpenAI (AURA)', integrationProvider: 'custom', implementation: 'partial' },
  { key: 'gemini', displayName: 'Google Gemini', integrationProvider: 'custom', implementation: 'partial' },
];

export type DeriveAutoSyncUiStateInput = {
  implementation: IntegrationAutoSyncImplementation;
  connectionStatus: 'disconnected' | 'pending' | 'connected' | 'error';
  syncInProgress: boolean;
  hasSuccessfulSync: boolean;
  consecutiveFailures: number;
  lastError: string | null;
  reconnectRequired?: boolean;
  authExpired?: boolean;
  permissionIncomplete?: boolean;
  providerUnavailable?: boolean;
  autoSyncEnabled?: boolean;
};

export function deriveIntegrationAutoSyncUiState(
  input: DeriveAutoSyncUiStateInput,
): IntegrationAutoSyncUiState {
  if (input.implementation === 'stub') {
    return 'not_configured';
  }

  if (input.providerUnavailable) {
    return 'provider_unavailable';
  }

  if (input.authExpired) {
    return 'authentication_expired';
  }

  if (input.reconnectRequired) {
    return 'reconnect_required';
  }

  if (input.connectionStatus === 'pending') {
    return 'connecting';
  }

  if (input.connectionStatus === 'disconnected') {
    return input.implementation === 'partial' ? 'not_configured' : 'not_configured';
  }

  if (input.connectionStatus === 'error') {
    if (input.permissionIncomplete) {
      return 'permission_incomplete';
    }
    return input.consecutiveFailures > 0 ? 'sync_failed' : 'reconnect_required';
  }

  if (input.syncInProgress) {
    return input.hasSuccessfulSync ? 'connected' : 'initial_sync_running';
  }

  if (input.connectionStatus === 'connected') {
    if (input.consecutiveFailures >= 3) {
      return 'degraded';
    }
    if (input.lastError && input.consecutiveFailures > 0) {
      return 'sync_failed';
    }
    if (input.hasSuccessfulSync) {
      return 'synced';
    }
    return 'connected';
  }

  return 'not_configured';
}

export function formatAutoSyncCorrectiveAction(
  uiState: IntegrationAutoSyncUiState,
  providerName: string,
): string | null {
  switch (uiState) {
    case 'not_configured':
      return `Connect ${providerName} in Integrations settings.`;
    case 'connecting':
      return 'Wait for the connection to finish, then verify status.';
    case 'connected':
      return 'Initial sync will run automatically; no action required.';
    case 'initial_sync_running':
      return 'Wait for the initial import to finish.';
    case 'synced':
      return null;
    case 'degraded':
      return 'Review sync history and use Retry failed sync if errors persist.';
    case 'authentication_expired':
      return 'Reconnect to refresh OAuth credentials.';
    case 'permission_incomplete':
      return 'Review granted OAuth scopes and reconnect with required permissions.';
    case 'provider_unavailable':
      return 'Provider is temporarily unavailable; auto-sync will retry with backoff.';
    case 'sync_failed':
      return 'Use Retry failed sync or Sync now (recovery) after reviewing the error.';
    case 'reconnect_required':
      return `Reconnect ${providerName} to restore auto-sync.`;
    default:
      return null;
  }
}
