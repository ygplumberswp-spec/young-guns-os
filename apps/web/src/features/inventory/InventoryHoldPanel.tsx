import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';

type InventoryHoldPanelProps = {
  title: string;
  reason: string;
  alternateHref?: string;
  alternateLabel?: string;
};

/** Honest HOLD surface — no fabricated supplier or bill rows. */
export function InventoryHoldPanel({
  title,
  reason,
  alternateHref,
  alternateLabel,
}: InventoryHoldPanelProps) {
  return (
    <Panel title={title} className="inventory-hold-panel">
      <div className="inventory-hold-panel__badge-row">
        <span className="status-pill status-pill--warning">HOLD</span>
        <span className="page-muted">Real data only — no demo rows</span>
      </div>
      <p className="inventory-hold-panel__reason">{reason}</p>
      {alternateHref && alternateLabel ? (
        <div className="inventory-hold-panel__actions">
          <Link href={alternateHref}>
            <Button variant="secondary">{alternateLabel}</Button>
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
