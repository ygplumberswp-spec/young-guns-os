import type { ReactNode } from 'react';
import { Button } from '@titan/ui';

type ApprovalActionCardProps = {
  title: string;
  description: string;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove?: () => void;
  onReject?: () => void;
  pending?: boolean;
  meta?: ReactNode;
};

export function ApprovalActionCard({
  title,
  description,
  approveLabel = 'Approve',
  rejectLabel = 'Decline',
  onApprove,
  onReject,
  pending = false,
  meta,
}: ApprovalActionCardProps) {
  return (
    <article className="ux-approval-card">
      <div className="ux-approval-card__body">
        <h3 className="ux-approval-card__title">{title}</h3>
        <p className="ux-approval-card__description">{description}</p>
        {meta ? <div className="ux-approval-card__meta">{meta}</div> : null}
      </div>
      <div className="ux-approval-card__actions">
        {onReject ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={onReject}>
            {rejectLabel}
          </Button>
        ) : null}
        {onApprove ? (
          <Button variant="primary" size="sm" disabled={pending} onClick={onApprove}>
            {approveLabel}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
