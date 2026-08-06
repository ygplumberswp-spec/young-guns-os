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

/**
 * How much financial *history* stands behind the open-AR list. This is deliberately
 * separate from the balances themselves: TITAN can hold a complete, correct balance for
 * every invoice it has while the Xero historical import is still filling in the past.
 */
export type OpenArHistoryCoverage = 'complete' | 'partial' | 'syncing' | 'unavailable';

export const OPEN_AR_COVERAGE_LABELS: Record<OpenArHistoryCoverage, string> = {
  complete: 'Complete',
  partial: 'Partial',
  syncing: 'Syncing',
  unavailable: 'Unavailable',
};

/**
 * Caption under the headline open-AR figure. It qualifies that figure in a few words so
 * the Owner never reads a partial import as the full historical receivables position; the
 * fuller explanation still follows in the coverage banner below the summary.
 */
export const OPEN_AR_COVERAGE_CAPTIONS: Record<OpenArHistoryCoverage, string> = {
  complete: 'Complete financial history',
  partial: 'Partial financial history',
  syncing: 'Xero import still running',
  unavailable: 'Financial history unavailable',
};

export function resolveOpenArHistoryCoverage(
  xero: ExecutiveXeroFinance | null | undefined,
  error: string | null = null,
): { coverage: OpenArHistoryCoverage; note: string } {
  if (error) {
    return {
      coverage: 'unavailable',
      note: 'Outstanding invoices could not be read — this is not a zero balance.',
    };
  }
  if (!xero?.connected) {
    return {
      coverage: 'partial',
      note: 'Xero is not connected — these are the open balances TITAN holds, not a complete financial history.',
    };
  }
  if (
    xero.importStatus === 'running' ||
    xero.importStatus === 'queued' ||
    xero.importStatus === 'pending'
  ) {
    return {
      coverage: 'syncing',
      note: 'Partial financial history — Xero import still running. The balances below are complete for the invoices already imported, but earlier history is still arriving.',
    };
  }
  if (xero.lastError) {
    return {
      coverage: 'partial',
      note: `Partial financial history — Xero sync needs attention: ${xero.lastError}`,
    };
  }
  if (!xero.lastSyncAt) {
    return {
      coverage: 'partial',
      note: 'Xero is connected but has never synced — no Xero history has been imported yet.',
    };
  }
  if (xero.failedRecordCount > 0) {
    return {
      coverage: 'partial',
      note: `Partial financial history — ${xero.failedRecordCount} Xero record(s) failed to import.`,
    };
  }
  return {
    coverage: 'complete',
    note: 'Open balances are complete as at the last successful Xero sync.',
  };
}

/**
 * Why the open-AR list is empty. A real zero and "nothing has been imported yet" look
 * identical on screen unless the card says which one it is.
 */
export function buildOpenArEmptyDescription(
  xero: ExecutiveXeroFinance | null | undefined,
): string {
  if (!xero?.connected) {
    return 'Open balances appear from TITAN finance records. Connect Xero and sync, or create invoices in Finance.';
  }
  if (
    xero.importStatus === 'running' ||
    xero.importStatus === 'queued' ||
    xero.importStatus === 'pending'
  ) {
    return (
      xero.importMessage ??
      'Xero import is in progress. Outstanding balances will appear when sync finishes.'
    );
  }
  if (xero.lastError) {
    return `Xero sync needs attention: ${xero.lastError}`;
  }
  if (!xero.lastSyncAt && xero.syncedInvoiceCount === 0) {
    return 'Xero is connected, but no invoices have been imported yet. Run Sync now from Integrations → Xero.';
  }
  return 'Open balances will appear here when invoices are sent and unpaid.';
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
