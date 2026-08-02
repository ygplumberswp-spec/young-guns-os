import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { XeroWriteApprovalQueueItem } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveXeroWriteApproval,
  cancelXeroWriteApproval,
  executeXeroWriteApproval,
  fetchXeroWriteApprovals,
  rejectXeroWriteApproval,
} from '../../lib/integrations-api';

type Props = {
  accessToken: string;
  /** Owner-only approve/reject/execute. Non-owners may view + cancel own requests. */
  isOwner: boolean;
  canRequest: boolean;
};

function formatMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return '—';
  return `${currency ?? ''} ${(cents / 100).toFixed(2)}`.trim();
}

export function XeroWriteApprovalQueuePanel({ accessToken, isOwner, canRequest }: Props) {
  const [items, setItems] = useState<XeroWriteApprovalQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  const load = useCallback(async () => {
    const status = filter === 'all' ? undefined : filter;
    const next = await fetchXeroWriteApprovals(accessToken, status);
    setItems(next);
  }, [accessToken, filter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load write queue');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function runAction(
    approvalId: string,
    action: 'approve' | 'reject' | 'cancel' | 'execute',
  ) {
    setBusyId(approvalId);
    setError(null);
    try {
      if (action === 'approve') await approveXeroWriteApproval(accessToken, approvalId);
      if (action === 'reject') await rejectXeroWriteApproval(accessToken, approvalId);
      if (action === 'cancel') await cancelXeroWriteApproval(accessToken, approvalId);
      if (action === 'execute') await executeXeroWriteApproval(accessToken, approvalId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      className="xero-write-approval-queue"
      title="Xero write approvals"
      description={`Draft → Owner approve → Owner execute. No silent invoice, payment, or contact writes.${
        canRequest ? '' : ' Request permission required to enqueue writes.'
      }`}
    >
      <header className="xero-write-approval-queue__header">
        <div />
        <div className="xero-write-approval-queue__filters">
          {(['pending', 'approved', 'all'] as const).map((value) => (
            <Button
              key={value}
              variant={filter === value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </header>

      {error ? <p role="alert">{error}</p> : null}

      {items.length === 0 ? (
        <p>No Xero write requests in this filter.</p>
      ) : (
        <ul className="xero-write-approval-queue__list">
          {items.map((item) => (
            <li key={item.id} className="xero-write-approval-queue__item">
              <div>
                <strong>{item.actionType}</strong> · {item.targetLabel}
                <div>
                  {formatMoney(item.amountCents, item.currency)} · {item.status} ·{' '}
                  {new Date(item.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="xero-write-approval-queue__actions">
                {isOwner && item.status === 'pending' ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void runAction(item.id, 'approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === item.id}
                      onClick={() => void runAction(item.id, 'reject')}
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {isOwner && item.status === 'approved' ? (
                  <Button
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => void runAction(item.id, 'execute')}
                  >
                    Execute to Xero
                  </Button>
                ) : null}
                {(item.status === 'pending' || item.status === 'approved') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void runAction(item.id, 'cancel')}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
