import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';

type FleetHoldPanelProps = {
  title: string;
  reason: string;
  cartrackSource?: boolean;
  alternateHref?: string;
  alternateLabel?: string;
};

/** Honest HOLD surface — no fabricated Cartrack rows. */
export function FleetHoldPanel({
  title,
  reason,
  cartrackSource = true,
  alternateHref,
  alternateLabel,
}: FleetHoldPanelProps) {
  return (
    <Panel title={title} className="fleet-hold-panel">
      <div className="fleet-hold-panel__badge-row">
        <span className="status-pill status-pill--warning">HOLD</span>
        {cartrackSource ? (
          <span className="page-muted">Cartrack is source of truth — no demo data shown</span>
        ) : null}
      </div>
      <p className="fleet-hold-panel__reason">{reason}</p>
      {alternateHref && alternateLabel ? (
        <div className="fleet-hold-panel__actions">
          <Link href={alternateHref}>
            <Button variant="secondary">{alternateLabel}</Button>
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
