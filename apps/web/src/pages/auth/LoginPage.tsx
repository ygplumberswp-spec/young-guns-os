import { FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { getStaffHomePath } from '@titan/auth/browser';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Input } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { toStaffIdentity } from '../../lib/role-experience';
import { ApiClientError } from '../../lib/api-client';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      const homePath = session?.user ? getStaffHomePath(toStaffIdentity(session.user)) : '/';
      setLocation(homePath);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
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
          />
          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <p className="auth-error">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-card__footer">
          New company? <Link href="/auth/signup">Create your workspace</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
