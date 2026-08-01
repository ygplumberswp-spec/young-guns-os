import { type ReactNode } from 'react';
import { PrimaryAction } from './PrimaryAction';
import { StatusBadge } from './StatusBadge';

type ApprovalActionCardProps = {
  title: string;
  description: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'executed' | 'rejected';
  onApprove?: () => void;
  onExecute?: () => void;
  disabled?: boolean;
  children?: ReactNode;
};

const STATUS_LABELS: Record<ApprovalActionCardProps['status'], string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  executed: 'Executed',
  rejected: 'Rejected',
};

const STATUS_TONES: Record<
  ApprovalActionCardProps['status'],
  'neutral' | 'warning' | 'success' | 'info' | 'danger'
> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'info',
  executed: 'success',
  rejected: 'danger',
};

export function ApprovalActionCard({
  title,
  description,
  status,
  onApprove,
  onExecute,
  disabled,
  children,
}: ApprovalActionCardProps) {
  return (
    <article className="ux-approval-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h3 className="ux-approval-card__title">{title}</h3>
        <StatusBadge label={STATUS_LABELS[status]} tone={STATUS_TONES[status]} />
      </div>
      <p className="ux-approval-card__meta">{description}</p>
      {children}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        {status === 'pending_approval' && onApprove ? (
          <PrimaryAction size="sm" onClick={onApprove} disabled={disabled}>
            Approve
          </PrimaryAction>
        ) : null}
        {status === 'approved' && onExecute ? (
          <PrimaryAction size="sm" onClick={onExecute} disabled={disabled}>
            Execute
          </PrimaryAction>
        ) : null}
      </div>
    </article>
  );
}
