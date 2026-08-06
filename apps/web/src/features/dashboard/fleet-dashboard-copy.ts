import type { FleetTrackingContext, OpsSnapshotFreshness, OpsSourceState } from '@titan/shared';
import { formatFleetConnectionDisplayLabel } from '@titan/shared';
import { mapFleetConnectionDisplayToEnterpriseLabel } from '../integrations/enterprise-overview-status';

export const FLEET_LIVE_UNAVAILABLE_NOTE =
  'Some live vehicle information is temporarily unavailable.';

export const FLEET_SHOWING_STORED_POSITIONS_NOTE =
  'Showing the latest available vehicle positions.';

export const FLEET_UPDATED_RECENTLY_LABEL = 'Updated recently';

const TECHNICAL_FLEET_PATTERNS = [
  /\/[\w/-]+/,
  /\d+ms\b/i,
  /timed out/i,
  /failed endpoint/i,
  /partial\s*—/i,
  /\bPARTIAL\b/,
  /stack trace/i,
  /credentials?/i,
  /payload/i,
];

/** True when text looks like a raw provider/internal diagnostic string. */
export function isTechnicalFleetDiagnostic(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return TECHNICAL_FLEET_PATTERNS.some((pattern) => pattern.test(text));
}

/** Owner-facing ops freshness — never Partial/timeout/endpoint wording on default surfaces. */
export function formatOwnerFleetOpsFreshnessLabel(
  freshness: OpsSnapshotFreshness | null | undefined,
): string | null {
  if (!freshness || freshness === 'live') return 'Live';
  return FLEET_UPDATED_RECENTLY_LABEL;
}

/** Sanitised ops source line for disclosure — label + coarse status only. */
export function formatSanitisedOpsSourceLine(source: OpsSourceState): string {
  switch (source.status) {
    case 'live':
      return `${source.label} — live`;
    case 'stale':
      return `${source.label} — stale`;
    case 'not_configured':
      return `${source.label} — not configured`;
    case 'timed_out':
      return `${source.label} — temporarily unavailable`;
    case 'unavailable':
    default:
      return `${source.label} — unavailable`;
  }
}

/** Sanitised Cartrack status for disclosure. */
export function formatSanitisedCartrackDisclosureLine(
  tracking: FleetTrackingContext | null | undefined,
): string {
  if (!tracking) return 'Cartrack — status loading';
  if (!tracking.cartrackConnected) return 'Cartrack — not connected';
  if (tracking.providerRefresh.showingCachedSnapshot) {
    return 'Cartrack — refresh delayed, showing stored positions';
  }
  if (
    tracking.connectionDisplayState === 'stale' ||
    tracking.connectionDisplayState === 'degraded'
  ) {
    return 'Cartrack — last update older than expected';
  }
  const connection = mapFleetConnectionDisplayToEnterpriseLabel(
    formatFleetConnectionDisplayLabel(tracking.connectionDisplayState),
  );
  return `Cartrack — ${connection.toLowerCase()}`;
}

export function buildFleetMapDisclosureLines(input: {
  tracking: FleetTrackingContext | null;
  opsSources?: OpsSourceState[];
  opsFreshness?: OpsSnapshotFreshness | null;
  hasStoredPositions: boolean;
}): string[] {
  const lines: string[] = [formatSanitisedCartrackDisclosureLine(input.tracking)];

  if (input.tracking && !input.tracking.livePollingAllowed) {
    lines.push('Cartrack — live polling disabled, stored positions used');
  }

  if (input.hasStoredPositions && input.tracking?.providerRefresh.showingCachedSnapshot) {
    lines.push('Cartrack — last successful snapshot retained');
  }

  const degradedOps = (input.opsSources ?? []).filter((source) => source.status !== 'live');
  if (input.opsFreshness && input.opsFreshness !== 'live') {
    lines.push('Ops intelligence — some inputs temporarily unavailable');
  }
  for (const source of degradedOps) {
    lines.push(formatSanitisedOpsSourceLine(source));
  }

  return lines;
}

export function fleetMapShowsStoredPositions(tracking: FleetTrackingContext | null): boolean {
  return (tracking?.latestPositions.length ?? 0) > 0;
}

export function fleetMapHasLiveDegradation(input: {
  tracking: FleetTrackingContext | null;
  fleetError?: string | null;
  opsFreshness?: OpsSnapshotFreshness | null;
}): boolean {
  const { tracking, fleetError, opsFreshness } = input;
  if (fleetError && isTechnicalFleetDiagnostic(fleetError)) return true;
  if (tracking?.lastError && isTechnicalFleetDiagnostic(tracking.lastError)) return true;
  if (tracking?.providerRefresh.showingCachedSnapshot) return true;
  if (
    tracking?.connectionDisplayState === 'stale' ||
    tracking?.connectionDisplayState === 'degraded'
  ) {
    return true;
  }
  if (opsFreshness && opsFreshness !== 'live') return true;
  return false;
}
