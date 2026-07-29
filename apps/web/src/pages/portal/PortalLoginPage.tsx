import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import { PortalApiClientError } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

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
    <div className="portal-auth-page">
      <PageHeader
        title="Customer Portal"
        description="Sign in to view your account information."
      />
      {error ? <p className="form-error">{error}</p> : null}
      <form className="portal-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={isSaving || !email || !password}>
          {isSaving ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="page-muted">
        Staff member? <Link href="/auth/login" className="portal-link">Sign in to TITAN</Link>
      </p>
    </div>
  );
}
