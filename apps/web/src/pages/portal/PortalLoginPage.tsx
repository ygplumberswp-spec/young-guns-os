import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input } from '@titan/ui';
import { PortalApiClientError } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { AuthLayout } from '../../layouts/AuthLayout';

export function PortalLoginPage() {
  const { login } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to sign in');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AuthLayout attribution="created">
      <div className="auth-card">
        <h2 className="auth-card__title">Customer Portal</h2>
        <p className="auth-card__subtitle">Sign in to view your account information.</p>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isSaving || !email || !password}>
            {isSaving ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-card__footer">
          Staff member? <Link href="/auth/login">Sign in to TITAN</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
