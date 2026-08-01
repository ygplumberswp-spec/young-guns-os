import { Link } from 'wouter';
import type { ExecutiveOwnerActionItem } from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type OwnerActionCentrePanelProps = {
  items: ExecutiveOwnerActionItem[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const PRIORITY_ORDER: Record<ExecutiveOwnerActionItem['priority'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

export function OwnerActionCentrePanel({
  items,
  isLoading = false,
  error = null,
  onRetry,
}: OwnerActionCentrePanelProps) {
  const sorted = [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.count - a.count,
  );

  return (
    <Panel
      title="Owner action centre"
      description="One prioritised queue — every item links to real records"
    >
      {isLoading ? (
        <DashboardSectionSkeleton rows={4} />
      ) : error ? (
        <div className="exec-dashboard-section__error">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : sorted.length === 0 ? (
        <p className="page-muted">No owner actions waiting — operations are current.</p>
      ) : (
        <ol className="exec-owner-action-queue">
          {sorted.map((item) => (
            <li
              key={item.id}
              className={`exec-owner-action-queue__item exec-owner-action-queue__item--${item.priority}`}
            >
              <div className="exec-owner-action-queue__head">
                <span className="exec-owner-action-queue__category">{item.category}</span>
                {item.count > 1 ? (
                  <span className="exec-owner-action-queue__count">{item.count}</span>
                ) : null}
              </div>
              <Link href={item.href} className="exec-owner-action-queue__title">
                {item.title}
              </Link>
              <p className="exec-owner-action-queue__desc">{item.description}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="exec-owner-action-queue__footer">
        <Link href="/aura/todays-plan">
          <Button size="sm" variant="secondary">
            Open Today&apos;s Plan
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
