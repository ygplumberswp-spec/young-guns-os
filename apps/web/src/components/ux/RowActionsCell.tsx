import { Link } from 'wouter';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';

type RowActionsCellProps = {
  editHref?: string;
  editLabel?: string;
  onEdit?: () => void;
  whatsappHref?: string | null;
  emailHref?: string | null;
  whatsappLabel?: string;
  emailLabel?: string;
  moreItems: MoreMenuItem[];
  canWrite?: boolean;
};

function buildCombinedMenuItems(
  props: RowActionsCellProps,
  includeEdit: boolean,
): MoreMenuItem[] {
  const items: MoreMenuItem[] = [];

  if (props.whatsappHref) {
    items.push({
      id: 'whatsapp',
      label: props.whatsappLabel ?? 'WhatsApp',
      href: props.whatsappHref,
    });
  }

  if (props.emailHref) {
    items.push({
      id: 'email',
      label: props.emailLabel ?? 'Email',
      href: props.emailHref,
    });
  }

  if (includeEdit) {
    if (props.editHref) {
      items.push({
        id: 'edit',
        label: props.editLabel ?? 'Edit',
        href: props.editHref,
      });
    } else if (props.onEdit) {
      items.push({
        id: 'edit',
        label: props.editLabel ?? 'Edit',
        onSelect: props.onEdit,
      });
    }
  }

  return [...items, ...props.moreItems];
}

/** Dedicated row actions: WhatsApp, Email, Edit, More — mobile collapses to one Actions menu. */
export function RowActionsCell({
  editHref,
  editLabel = 'Edit',
  onEdit,
  whatsappHref,
  emailHref,
  whatsappLabel = 'WhatsApp',
  emailLabel = 'Email',
  moreItems,
  canWrite = true,
}: RowActionsCellProps) {
  const combined = buildCombinedMenuItems(
    { editHref, editLabel, onEdit, whatsappHref, emailHref, whatsappLabel, emailLabel, moreItems, canWrite },
    canWrite,
  );

  if (!canWrite) {
    return (
      <div className="ux-row-actions">
        <Link href={editHref ?? '#'} className="ux-row-actions__btn" aria-label="View">
          View
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="ux-row-actions ux-row-actions--desktop">
        {whatsappHref ? (
          <a
            href={whatsappHref}
            className="ux-row-actions__btn ux-row-actions__btn--whatsapp"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={whatsappLabel}
            title={whatsappLabel}
          >
            WA
          </a>
        ) : (
          <span className="ux-row-actions__btn ux-row-actions__btn--disabled" aria-hidden>
            WA
          </span>
        )}
        {emailHref ? (
          <a
            href={emailHref}
            className="ux-row-actions__btn ux-row-actions__btn--email"
            aria-label={emailLabel}
            title={emailLabel}
          >
            ✉
          </a>
        ) : (
          <span className="ux-row-actions__btn ux-row-actions__btn--disabled" aria-hidden>
            ✉
          </span>
        )}
        {editHref ? (
          <Link href={editHref} className="ux-row-actions__btn" aria-label={editLabel} title={editLabel}>
            Edit
          </Link>
        ) : onEdit ? (
          <button
            type="button"
            className="ux-row-actions__btn"
            aria-label={editLabel}
            title={editLabel}
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
        <MoreMenu label="More" items={moreItems} align="end" />
      </div>
      <div className="ux-row-actions ux-row-actions--mobile">
        <MoreMenu label="Actions" items={combined} align="end" />
      </div>
    </>
  );
}
