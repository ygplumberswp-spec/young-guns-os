import type { ExecutiveSectionStatus, ExecutiveXeroFinance } from '@titan/shared';

/**
 * Honesty vocabulary for Owner dashboard cards. Every card resolves to exactly one of
 * these so a value is never presented as live when its source is missing or incomplete.
 */
export type DashboardDataState =
  | 'live'
  | 'partial'
  | 'unavailable'
  | 'disconnected'
  | 'needs_setup';

export const DASHBOARD_STATE_LABELS: Record<DashboardDataState, string> = {
  live: 'Live',
  partial: 'Partial',
  unavailable: 'Unavailable',
  disconnected: 'Disconnected',
  needs_setup: 'Needs setup',
};

/**
 * Colour is reserved for states the Owner must act on. `live` stays quiet so a healthy
 * dashboard reads as calm and a coloured footer always means "this one needs attention".
 */
export const DASHBOARD_STATE_TONES: Record<DashboardDataState, string> = {
  live: 'is-quiet',
  partial: 'is-warn',
  unavailable: 'is-error',
  disconnected: 'is-muted',
  needs_setup: 'is-warn',
};

export function formatUpdatedLabel(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(deltaMs)) return 'Unknown';
  if (deltaMs < 45_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export type DashboardCardHonesty = {
  state: DashboardDataState;
  note: string | null;
};

/**
 * Card honesty for a section of the executive summary. The API reports each section's
 * availability independently, so a card degrades only when its own source failed —
 * and an unavailable section must never be read as a real zero.
 */
export function resolveSectionHonesty(
  section: ExecutiveSectionStatus | null | undefined,
  requestError: string | null = null,
): DashboardCardHonesty {
  if (requestError) {
    return { state: 'unavailable', note: requestError };
  }
  if (!section) {
    return { state: 'unavailable', note: 'This section did not report a status.' };
  }
  if (section.state === 'unavailable') {
    return {
      state: 'unavailable',
      note: section.reason
        ? `Source unavailable — the figures below are not a real zero. ${section.reason}`
        : 'Source unavailable — the figures below are not a real zero.',
    };
  }
  if (section.state === 'partial') {
    const detail = section.coverage ?? section.reason;
    return {
      state: 'partial',
      note: detail ? `Incomplete coverage — ${detail}` : 'Incomplete coverage.',
    };
  }
  return { state: 'live', note: section.coverage };
}

/** True when a count may be shown as a real figure rather than a dash. */
export function isSectionCountable(section: ExecutiveSectionStatus | null | undefined): boolean {
  return section?.state === 'live' || section?.state === 'partial';
}

/**
 * Open AR always comes from TITAN invoices. Until Xero has finished importing we cannot
 * claim the figure is the company's complete financial position, so the card says so.
 */
export function resolveFinanceCardHonesty(
  xero: ExecutiveXeroFinance | null | undefined,
  error: string | null = null,
): DashboardCardHonesty {
  if (error) {
    return { state: 'unavailable', note: 'Open balances could not be loaded.' };
  }
  if (!xero?.connected) {
    return {
      state: 'disconnected',
      note: 'Xero is not connected — this is TITAN invoice data only, not a complete financial position.',
    };
  }
  if (xero.lastError) {
    return {
      state: 'partial',
      note: `Xero sync needs attention — figures may be incomplete: ${xero.lastError}`,
    };
  }
  if (
    xero.importStatus === 'running' ||
    xero.importStatus === 'queued' ||
    xero.importStatus === 'pending'
  ) {
    return {
      state: 'partial',
      note: 'Xero import still running — figures are incomplete until it finishes.',
    };
  }
  if (!xero.lastSyncAt) {
    return {
      state: 'needs_setup',
      note: 'Xero is connected but has never synced — run Sync now from Integrations → Xero.',
    };
  }
  if (xero.failedRecordCount > 0) {
    return {
      state: 'partial',
      note: `${xero.failedRecordCount} Xero record(s) failed to import — figures are incomplete.`,
    };
  }
  return { state: 'live', note: 'Covers TITAN invoices reconciled against the last Xero sync.' };
}

/** Fleet card honesty derived from the live Cartrack tracking payload. */
export function resolveFleetCardHonesty(input: {
  hasTracking: boolean;
  cartrackConnected: boolean;
  connectionDisplayState: string | null;
  hasStoredPositions: boolean;
  error: string | null;
}): DashboardCardHonesty {
  if (!input.hasTracking) {
    return {
      state: 'unavailable',
      note: input.error ?? 'Cartrack connection state is still loading.',
    };
  }
  if (!input.cartrackConnected) {
    return {
      state: 'disconnected',
      note: 'Cartrack is not connected — TITAN will not invent vehicle positions.',
    };
  }
  if (
    input.connectionDisplayState === 'stale' ||
    input.connectionDisplayState === 'degraded'
  ) {
    return {
      state: 'partial',
      note: 'Cartrack feed is stale — positions shown are the last stored fix.',
    };
  }
  if (!input.hasStoredPositions) {
    return { state: 'needs_setup', note: 'No GPS positions stored yet — run a Cartrack sync.' };
  }
  return { state: 'live', note: null };
}
