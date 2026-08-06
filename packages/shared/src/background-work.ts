import type { BusinessEventType } from './automation.js';
import type { IntegrationAutoSyncUiState } from './integration-auto-sync.js';

/** App-wide live UI states for background work (integrations + internal workflows). */
export type BackgroundWorkUiState =
  | 'up_to_date'
  | 'updating'
  | 'waiting'
  | 'partially_completed'
  | 'retry_scheduled'
  | 'failed'
  | 'reconnect_required'
  | 'provider_unavailable';

export const BACKGROUND_WORK_UI_STATE_LABELS: Record<BackgroundWorkUiState, string> = {
  up_to_date: 'Up to date',
  updating: 'Updating',
  waiting: 'Waiting',
  partially_completed: 'Partially completed',
  retry_scheduled: 'Retry scheduled',
  failed: 'Failed',
  reconnect_required: 'Reconnect required',
  provider_unavailable: 'Provider unavailable',
};

export type BackgroundWorkKind =
  | 'integration_sync'
  | 'domain_followup'
  | 'internal_workflow';

export type BackgroundWorkCheckpoint = {
  stage: string;
  progressPercent?: number | null;
  pagesProcessed?: number | null;
  completedStages?: string[];
  metadata?: Record<string, unknown>;
};

export type BackgroundWorkItemSummary = {
  id: string;
  kind: BackgroundWorkKind;
  workType: string;
  uiState: BackgroundWorkUiState;
  uiStateLabel: string;
  label: string;
  message: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  retryAt: string | null;
  checkpoint: BackgroundWorkCheckpoint | null;
  recordsProcessed: number | null;
  lastError: string | null;
};

export type TenantBackgroundWorkStatusResponse = {
  items: BackgroundWorkItemSummary[];
  integrationAutoSync: BackgroundWorkUiState | null;
  generatedAt: string;
};

/** Domain events wired into the global auto-sync bus (incremental rollout). */
export type TenantDomainEventType =
  | BusinessEventType
  | 'document.uploaded'
  | 'invoice.updated'
  | 'payment.recorded'
  | 'xero.import.completed';

export type TenantDomainEvent = {
  companyId: string;
  eventType: TenantDomainEventType;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actorUserId?: string;
  idempotencyKey?: string;
};

export type DeriveBackgroundWorkUiStateInput = {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'queued';
  hasPartialProgress: boolean;
  consecutiveFailures?: number;
  retryAt?: string | null;
  reconnectRequired?: boolean;
  providerUnavailable?: boolean;
  lastSuccessAt?: string | null;
};

export function deriveBackgroundWorkUiState(
  input: DeriveBackgroundWorkUiStateInput,
): BackgroundWorkUiState {
  if (input.providerUnavailable) {
    return 'provider_unavailable';
  }
  if (input.reconnectRequired) {
    return 'reconnect_required';
  }
  if (input.status === 'pending' || input.status === 'queued') {
    return 'waiting';
  }
  if (input.status === 'running') {
    return 'updating';
  }
  if (input.status === 'failed') {
    if ((input.consecutiveFailures ?? 0) > 0 && input.retryAt) {
      return 'retry_scheduled';
    }
    return input.hasPartialProgress ? 'partially_completed' : 'failed';
  }
  if (input.status === 'completed') {
    return 'up_to_date';
  }
  if (input.status === 'cancelled') {
    return input.hasPartialProgress ? 'partially_completed' : 'failed';
  }
  return input.lastSuccessAt ? 'up_to_date' : 'waiting';
}

export function mapIntegrationAutoSyncUiStateToBackgroundWork(
  uiState: IntegrationAutoSyncUiState,
): BackgroundWorkUiState {
  switch (uiState) {
    case 'synced':
      return 'up_to_date';
    case 'initial_sync_running':
    case 'connecting':
    case 'connected':
      return 'updating';
    case 'degraded':
      return 'partially_completed';
    case 'sync_failed':
      return 'failed';
    case 'authentication_expired':
    case 'reconnect_required':
    case 'permission_incomplete':
      return 'reconnect_required';
    case 'provider_unavailable':
      return 'provider_unavailable';
    default:
      return 'waiting';
  }
}
