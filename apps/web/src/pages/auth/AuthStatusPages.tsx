import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { getStaffHomePath } from '@titan/auth/browser';
import { Button, Input } from '@titan/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { GuestRoute } from '../../components/ProtectedRoute';
import { useAuth } from '../../lib/auth-context';
import { ApiClientError, MFA_CHALLENGE_STORAGE_KEY } from '../../lib/api-client';
import { toStaffIdentity } from '../../lib/role-experience';

/**
 * Branded auth support surfaces. Password recovery remains honest until reset API exists.
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
  const { completeLoginMfa } = useAuth();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem(MFA_CHALLENGE_STORAGE_KEY);
    setChallengeToken(token);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!challengeToken) {
      setError('Your sign-in session expired. Return to sign in and try again.');
      return;
    }

    if (!code.trim()) {
      setError('Enter the authentication code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await completeLoginMfa({
        mfaChallengeToken: challengeToken,
        code: code.trim(),
      });
      sessionStorage.removeItem(MFA_CHALLENGE_STORAGE_KEY);
      setLocation(getStaffHomePath(toStaffIdentity(result.user)));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'MFA_CHALLENGE_EXPIRED') {
        sessionStorage.removeItem(MFA_CHALLENGE_STORAGE_KEY);
        setChallengeToken(null);
      }
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify authentication code');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <GuestRoute>
      <AuthLayout>
        <div className="auth-card">
          <h2 className="auth-card__title">Multi-factor authentication</h2>
          <p className="auth-card__subtitle">
            {required
              ? 'Enter the code from your authenticator app to finish signing in.'
              : 'Complete the additional verification step to access your workspace.'}
          </p>
          {!challengeToken ? (
            <p className="auth-error" role="alert">
              Your verification session expired.{' '}
              <Link href="/auth/login">Return to sign in</Link> and try again.
            </p>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <Input
                label="Authentication code"
                name="mfaCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying…' : 'Verify and continue'}
              </Button>
            </form>
          )}
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
