import { Link } from 'wouter';
import { draftContinueHref, type DraftWorkspaceSummary } from '@titan/shared';
import { StatusBadge } from '../../components/ux';

type FinanceWorkspaceDraftRowProps = {
  draft: DraftWorkspaceSummary;
  colSpan: number;
  entityLabel: string;
};

export function FinanceWorkspaceDraftRow({
  draft,
  colSpan,
  entityLabel,
}: FinanceWorkspaceDraftRowProps) {
  return (
    <tr className="finance-table__row--draft">
      <td colSpan={colSpan}>
        <Link href={draftContinueHref(draft)} className="finance-link finance-draft-row">
          <span className="finance-draft-row__title">
            {draft.customerLabel ?? `Draft ${entityLabel.toLowerCase()}`}
          </span>
          <span className="finance-draft-row__meta">
            {' '}
            · Edited {new Date(draft.lastEditedAt).toLocaleDateString()}
          </span>
          <StatusBadge label="Draft" tone="info" className="finance-draft-badge" />
        </Link>
      </td>
    </tr>
  );
}
