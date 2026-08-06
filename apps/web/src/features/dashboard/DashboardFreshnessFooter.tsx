import { formatUpdatedLabel, OPEN_AR_IMPORT_PENDING_NOTE, type DashboardDataState } from './dashboard-honesty';

type DashboardFreshnessFooterProps = {
  updatedAt?: string | null;
  state?: DashboardDataState;
  /** Calm import wording for financial cards still receiving Xero history. */
  financialImportPending?: boolean;
  /** Override the default visible label (e.g. panel-specific freshness from the API). */
  label?: string | null;
};

/**
 * Owner-facing freshness line — Live / Updated … / import-in-progress only.
 * Technical source strings and PARTIAL status labels stay in DashboardDetailsDisclosure.
 */
export function DashboardFreshnessFooter({
  updatedAt = null,
  state = 'live',
  financialImportPending = false,
  label = null,
}: DashboardFreshnessFooterProps) {
  if (label) {
    return <p className="exec-freshness-footer">{label}</p>;
  }

  if (financialImportPending) {
    return <p className="exec-freshness-footer">{OPEN_AR_IMPORT_PENDING_NOTE}</p>;
  }

  if (state === 'live') {
    return (
      <p className="exec-freshness-footer">
        {updatedAt ? `Updated ${formatUpdatedLabel(updatedAt)}` : 'Live'}
      </p>
    );
  }

  return (
    <p className="exec-freshness-footer">
      {updatedAt ? `Updated ${formatUpdatedLabel(updatedAt)}` : 'Updated recently'}
    </p>
  );
}
