import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobFinanceSummary } from '@titan/shared';
import { buildJobFinanceActionHref } from './build-job-finance-action-href';

type JobFinanceStripProps = {
  jobId: string;
  customerId: string;
  financeSummary: JobFinanceSummary | null;
  canManageFinance: boolean;
};

export function JobFinanceStrip({
  jobId,
  customerId,
  financeSummary,
  canManageFinance,
}: JobFinanceStripProps) {
  const prefill = { jobId, customerId, from: 'job-detail' };
  const chips = financeSummary?.chips ?? [];

  return (
    <Panel title="Finance">
      {chips.length > 0 ? (
        <div className="finance-chip-row">
          {chips.map((chip, index) =>
            chip.href ? (
              <Link key={`${chip.kind}-${index}`} href={chip.href} className="finance-chip">
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </Link>
            ) : (
              <span key={`${chip.kind}-${index}`} className="finance-chip">
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="page-muted">No quotes, invoices, or payments linked to this job yet.</p>
      )}

      {canManageFinance ? (
        <div className="finance-panel-actions">
          <Link href={buildJobFinanceActionHref('quote', prefill)}>
            <Button variant="secondary" size="sm">
              Create quote
            </Button>
          </Link>
          <Link href={buildJobFinanceActionHref('invoice', prefill)}>
            <Button variant="secondary" size="sm">
              Create invoice
            </Button>
          </Link>
          <Link href={buildJobFinanceActionHref('payment', prefill)}>
            <Button variant="ghost" size="sm">
              Record payment
            </Button>
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
