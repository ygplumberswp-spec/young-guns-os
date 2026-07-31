import { FormEvent, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { GuestRoute } from '../../components/ProtectedRoute';

/**
 * Branded auth support surfaces. Password recovery and MFA challenge UIs are
 * presentation-ready; they do not invent backend flows that do not exist.
 * Session-expired is also shown on /auth/login?reason=session_expired.
 */

export function PasswordRecoveryPage() {
  return (
    <GuestRoute>
      <AuthLayout>
        <div className="auth-card">
          <h2 className="auth-card__title">Password recovery</h2>
          <p className="auth-card__subtitle">
            Self-serve password reset is not enabled in this workspace yet. Ask your Company Owner
            or administrator to issue a new invite, or sign in if you still know your password.
          </p>
          <p className="auth-status-note" role="status">
            No email will be sent from this screen — that keeps recovery honest until the reset API
            is launched.
          </p>
          <div className="auth-card__actions">
            <Link href="/auth/login" className="auth-text-link">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthLayout>
    </GuestRoute>
  );
}

export function MfaChallengePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const required = params.get('required') === '1';
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // No MFA verify endpoint is wired for staff login yet — stay truthful.
    setMessage(
      'MFA verification is not active for this sign-in path. Continue from Sign in, or ask your Owner to confirm security policy.',
    );
  }

  return (
    <GuestRoute>
      <AuthLayout>
        <div className="auth-card">
          <h2 className="auth-card__title">Multi-factor authentication</h2>
          <p className="auth-card__subtitle">
            {required
              ? 'Your company requires an additional verification step.'
              : 'MFA challenges appear here when your company policy requires them after password sign-in.'}
          </p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <Input
              label="Authentication code"
              name="mfaCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {message ? <p className="auth-error" role="alert">{message}</p> : null}
            <Button type="submit" variant="secondary">
              Verify code
            </Button>
          </form>
          <p className="auth-card__footer">
            <Link href="/auth/login">Return to sign in</Link>
          </p>
        </div>
      </AuthLayout>
    </GuestRoute>
  );
}

export function SessionExpiredPage() {
  return (
    <GuestRoute>
      <AuthLayout
        banner={
          <p className="auth-banner auth-banner--warning" role="status">
            Your session expired or is no longer valid. Sign in again to continue.
          </p>
        }
      >
        <div className="auth-card">
          <h2 className="auth-card__title">Session expired</h2>
          <p className="auth-card__subtitle">
            For security, TITAN ended this session. No data was changed. Sign in to resume your
            workspace.
          </p>
          <div className="auth-card__actions">
            <Link href="/auth/login?reason=session_expired">
              <Button type="button">Sign in again</Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    </GuestRoute>
  );
}
