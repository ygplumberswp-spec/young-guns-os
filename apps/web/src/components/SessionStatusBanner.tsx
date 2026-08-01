import type { StaffSessionUxState } from '@titan/shared';

const LABELS: Record<StaffSessionUxState, string> = {
  restoring: 'Restoring your session…',
  restored: 'Session restored',
  connection_lost: 'Connection temporarily lost',
  reconnecting: 'Reconnecting…',
  expiring_soon: 'Session refresh failed — sign in again if work is interrupted',
  sign_in_again: 'Sign in again to continue',
  account_locked: 'Account locked or revoked',
};

type SessionStatusBannerProps = {
  state: StaffSessionUxState | null;
  onDismiss?: () => void;
};

export function SessionStatusBanner({ state, onDismiss }: SessionStatusBannerProps) {
  if (!state || state === 'restored') {
    return null;
  }

  const tone =
    state === 'connection_lost' || state === 'expiring_soon'
      ? 'warning'
      : state === 'sign_in_again' || state === 'account_locked'
        ? 'error'
        : 'info';

  return (
    <div className={`session-status-banner session-status-banner--${tone}`} role="status">
      <span>{LABELS[state]}</span>
      {onDismiss && state !== 'restoring' && state !== 'reconnecting' ? (
        <button type="button" className="session-status-banner__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
