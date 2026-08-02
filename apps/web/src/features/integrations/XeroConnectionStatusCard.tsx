import { Button } from '@titan/ui';

export type XeroEntityCountSummary = {
  contacts: number;
  invoices: number;
  payments: number;
  bankTransactions: number;
};

type XeroConnectionStatusCardProps = {
  organisationName: string | null;
  lastSyncAt: string | null;
  statusMessage: string;
  counts: XeroEntityCountSummary;
  nextSyncAt: string | null;
  canManage: boolean;
  isBusy?: boolean;
  syncBusy?: boolean;
  testBusy?: boolean;
  syncDisabled?: boolean;
  confirmDisconnect?: boolean;
  onTestConnection?: () => void;
  onSyncNow?: () => void;
  onDisconnect?: () => void;
  onCancelDisconnect?: () => void;
};

function formatRelativeSyncTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(deltaMs)) return 'Unknown';
  if (deltaMs < 45_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function formatNextSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function XeroConnectionStatusCard({
  organisationName,
  lastSyncAt,
  statusMessage,
  counts,
  nextSyncAt,
  canManage,
  isBusy = false,
  syncBusy = false,
  testBusy = false,
  syncDisabled = false,
  confirmDisconnect = false,
  onTestConnection,
  onSyncNow,
  onDisconnect,
  onCancelDisconnect,
}: XeroConnectionStatusCardProps) {
  return (
    <section className="xero-status-card" aria-label="Xero Connection Status">
      <div className="xero-status-card__header">
        <span className="xero-status-card__indicator" aria-hidden="true" />
        <h2 className="xero-status-card__title">Xero connected</h2>
      </div>

      <dl className="xero-status-card__meta">
        <div>
          <dt>Organization</dt>
          <dd>{organisationName ?? 'Unknown organisation'}</dd>
        </div>
        <div>
          <dt>Last Sync</dt>
          <dd>{lastSyncAt ? formatRelativeSyncTime(lastSyncAt) : 'No sync run yet'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusMessage}</dd>
        </div>
      </dl>

      <p className="xero-status-card__counts">
        Contacts: {counts.contacts.toLocaleString()}
        <span aria-hidden="true"> | </span>
        Invoices: {counts.invoices.toLocaleString()}
        <span aria-hidden="true"> | </span>
        Payments: {counts.payments.toLocaleString()}
        <span aria-hidden="true"> | </span>
        Bank Transactions: {counts.bankTransactions.toLocaleString()}
      </p>

      <p className="xero-status-card__next">
        Next Sync:{' '}
        {nextSyncAt ? formatNextSyncTime(nextSyncAt) : 'Not scheduled'}
      </p>

      {canManage ? (
        <div className="xero-status-card__actions">
          {onTestConnection ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={onTestConnection}
            >
              {testBusy ? 'Testing…' : 'Test Connection'}
            </Button>
          ) : null}
          {onSyncNow ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy || syncDisabled}
              aria-busy={syncBusy}
              onClick={onSyncNow}
            >
              {syncBusy ? 'Syncing…' : 'Sync Now'}
            </Button>
          ) : null}
          {onDisconnect ? (
            <>
              <Button type="button" variant="ghost" disabled={isBusy} onClick={onDisconnect}>
                {confirmDisconnect ? 'Confirm disconnect' : 'Disconnect'}
              </Button>
              {confirmDisconnect && onCancelDisconnect ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={onCancelDisconnect}
                >
                  Cancel
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
