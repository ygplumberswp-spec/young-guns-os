import type { OpsLiveStrip } from '@titan/shared';
import { formatMapsEtaCapabilityLabel } from '@titan/shared';
import { EmptyState } from '@titan/ui';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type OpsIntelligenceLiveStripProps = {
  strip: OpsLiveStrip | null;
  isLoading?: boolean;
  error?: string | null;
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

export function OpsIntelligenceLiveStrip({
  strip,
  isLoading = false,
  error = null,
}: OpsIntelligenceLiveStripProps) {
  if (isLoading && !strip) {
    return <DashboardSectionSkeleton rows={2} />;
  }
  if (error && !strip) {
    return (
      <EmptyState
        title="Ops Intelligence Unavailable"
        description={error}
      />
    );
  }
  if (!strip) return null;

  const { counts } = strip;

  return (
    <div className="ops-intel-strip">
      <div className="ops-intel-strip__meta">
        <span className="status-pill status-pill--info">Ops intelligence</span>
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
      {strip.honestyNotes[0] ? (
        <p className="page-muted ops-intel-strip__note">{strip.honestyNotes[0]}</p>
      ) : null}
    </div>
  );
}
