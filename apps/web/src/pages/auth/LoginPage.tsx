import { FormEvent, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { getStaffHomePath } from '@titan/auth/browser';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Input } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { toStaffIdentity } from '../../lib/role-experience';
import { ApiClientError, isLoginMfaChallenge, MFA_CHALLENGE_STORAGE_KEY, MFA_LOGIN_REDIRECT_PATH } from '../../lib/api-client';
import { isSessionExpiredLoginReason } from '../../lib/session-expiry-routing';
import { GuestRoute } from '../../components/ProtectedRoute';

export function LoginPage() {
  return (
    <GuestRoute>
      <LoginForm />
    </GuestRoute>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const reason = new URLSearchParams(search).get('reason');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      if (isLoginMfaChallenge(result)) {
        sessionStorage.setItem(MFA_CHALLENGE_STORAGE_KEY, result.mfaChallengeToken);
        setLocation(MFA_LOGIN_REDIRECT_PATH);
        return;
      }
      const homePath = result.user ? getStaffHomePath(toStaffIdentity(result.user)) : '/';
      setLocation(homePath);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      banner={
        isSessionExpiredLoginReason(reason) ? (
          <p className="auth-banner auth-banner--warning" role="status">
            Your session expired. Sign in again to continue.
          </p>
        ) : null
      }
    >
      <div className="auth-card">
        <h2 className="auth-card__title">Sign in</h2>
        <p className="auth-card__subtitle">Access your TITAN workspace</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-card__footer">
          New company? <Link href="/auth/signup">Create your workspace</Link>
        </p>
        <p className="auth-card__footer">
          <Link href="/auth/recovery">Password recovery</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
