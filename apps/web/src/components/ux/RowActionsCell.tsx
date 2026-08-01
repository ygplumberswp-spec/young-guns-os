import { Link } from 'wouter';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';

type RowActionsCellProps = {
  editHref?: string;
  editLabel?: string;
  onEdit?: () => void;
  moreItems: MoreMenuItem[];
  canWrite?: boolean;
};

/** Always-visible row actions: Edit (pencil) + More (⋮) — not hover-only. */
export function RowActionsCell({
  editHref,
  editLabel = 'Edit',
  onEdit,
  moreItems,
  canWrite = true,
}: RowActionsCellProps) {
  if (!canWrite) {
    return (
      <div className="ux-row-actions">
        <Link href={editHref ?? '#'} className="ux-row-actions__edit" aria-label="View">
          View
        </Link>
      </div>
    );
  }

  return (
    <div className="ux-row-actions">
      {editHref ? (
        <Link
          href={editHref}
          className="ux-row-actions__edit"
          aria-label={editLabel}
          title={editLabel}
        >
          <span className="ux-row-actions__edit-icon" aria-hidden>
            ✎
          </span>
        </Link>
      ) : onEdit ? (
        <button
          type="button"
          className="ux-row-actions__edit"
          aria-label={editLabel}
          title={editLabel}
          onClick={onEdit}
        >
          <span className="ux-row-actions__edit-icon" aria-hidden>
            ✎
          </span>
        </button>
      ) : null}
      <MoreMenu label="⋮" items={moreItems} align="end" />
    </div>
  );
}
