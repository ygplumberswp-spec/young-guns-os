import type { OpsSnapshotFreshness, OpsLiveStrip, OpsSourceState } from '@titan/shared';
import {
  OPS_INSIGHTS_DEGRADED_MESSAGE,
  formatMapsEtaCapabilityLabel,
  formatOpsSnapshotFreshnessLabel,
} from '@titan/shared';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type OpsIntelligenceLiveStripProps = {
  strip: OpsLiveStrip | null;
  isLoading?: boolean;
  error?: string | null;
  freshness?: OpsSnapshotFreshness | null;
  ageSeconds?: number;
  refreshing?: boolean;
  /** False while TITAN has no evaluation yet — show the state, never placeholder counts. */
  dataAvailable?: boolean;
  sources?: OpsSourceState[];
};

function StripCell({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="ops-intel-strip__cell">
      <span className="ops-intel-strip__label">{label}</span>
      <strong className="ops-intel-strip__value">{value}</strong>
      {hint ? <span className="page-muted ops-intel-strip__hint">{hint}</span> : null}
    </div>
  );
}

function freshnessTone(freshness: OpsSnapshotFreshness): string {
  if (freshness === 'live') return 'status-pill--info';
  if (freshness === 'partial' || freshness === 'stale') return 'status-pill--warning';
  return 'status-pill--muted';
}

/**
 * Cartrack positions and Ops Intelligence are independent. When the insight numbers
 * are not ready this reports that in one line and steps aside, so the Live Fleet Map
 * keeps its vehicles instead of the whole card failing with them.
 */
function DegradedNote({ detail }: { detail?: string | null }) {
  return (
    <p className="page-muted ops-intel-strip__note">
      {OPS_INSIGHTS_DEGRADED_MESSAGE}
      {detail ? ` ${detail}` : ''}
    </p>
  );
}

export function OpsIntelligenceLiveStrip({
  strip,
  isLoading = false,
  error = null,
  freshness = null,
  ageSeconds = 0,
  refreshing = false,
  dataAvailable = true,
  sources = [],
}: OpsIntelligenceLiveStripProps) {
  if (isLoading && !strip) {
    return <DashboardSectionSkeleton rows={2} />;
  }
  if (error && !strip) {
    return <DegradedNote detail="TITAN will show them as soon as the refresh completes." />;
  }
  if (!strip) return null;
  if (!dataAvailable) {
    return <DegradedNote detail="No figures are shown until the evaluation completes." />;
  }

  const { counts } = strip;
  const degradedSources = sources.filter(
    (source) => source.status === 'unavailable' || source.status === 'timed_out',
  );

  return (
    <div className="ops-intel-strip">
      <div className="ops-intel-strip__meta">
        <span className="status-pill status-pill--info">Ops intelligence</span>
        {freshness ? (
          <span className={`status-pill ${freshnessTone(freshness)}`}>
            {formatOpsSnapshotFreshnessLabel(freshness, ageSeconds)}
          </span>
        ) : null}
        {refreshing && freshness !== 'stale' ? (
          <span className="page-muted">Refreshing</span>
        ) : null}
        <span className="page-muted">{formatMapsEtaCapabilityLabel(strip.mapsCapability)}</span>
        <span className="page-muted">
          {strip.cartrackConnected ? 'Cartrack connected' : 'Cartrack not connected'}
        </span>
      </div>
      <div className="ops-intel-strip__grid">
        <StripCell label="Driving" value={String(counts.techniciansDriving)} />
        <StripCell label="Late Arrivals" value={String(counts.lateArrivals)} />
        <StripCell label="Upcoming Departures" value={String(counts.upcomingDepartures)} />
        <StripCell
          label="Longest Travel"
          value={
            counts.longestTravelMinutes != null ? `${counts.longestTravelMinutes} min` : '—'
          }
          hint={counts.longestTravelLabel}
        />
        <StripCell label="Jobs Waiting" value={String(counts.jobsWaiting)} />
        <StripCell label="Completed" value={String(counts.completedJobs)} />
        <StripCell label="Emergency Queue" value={String(counts.emergencyQueue)} />
      </div>
      {degradedSources.length > 0 ? (
        <p className="page-muted ops-intel-strip__note">
          {degradedSources.map((source) => `${source.label}: ${source.detail ?? source.status}`).join(' · ')}
        </p>
      ) : null}
      {strip.honestyNotes[0] ? (
        <p className="page-muted ops-intel-strip__note">{strip.honestyNotes[0]}</p>
      ) : null}
    </div>
  );
}
