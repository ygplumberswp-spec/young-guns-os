import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Input } from '@titan/ui';
import type { PortalInvitePreview } from '@titan/shared';
import { validatePasswordStrength } from '@titan/auth/browser';
import { PortalApiClientError } from '../../lib/portal-api-client';
import {
  acceptPortalInvite,
  fetchPortalInvitePreview,
  restorePortalSession,
} from '../../lib/portal-api-client';
import { toAppAbsoluteHref } from '../../lib/nested-routing';

export function PortalAcceptInvitePage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<PortalInvitePreview | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('token') ?? '';
    setToken(inviteToken);

    if (!inviteToken) {
      setError('Invite token is missing.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      try {
        const data = await fetchPortalInvitePreview(inviteToken);
        if (!cancelled) {
          setPreview(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof PortalApiClientError ? err.message : 'Invite is invalid or expired',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await acceptPortalInvite({ token, firstName, lastName, password });
      await restorePortalSession();
      setLocation(toAppAbsoluteHref('/portal'));
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to accept invite');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h2 className="auth-card__title">Customer portal access</h2>
        {isLoading ? <p>Checking invitation…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {preview ? (
          <>
            <p>
              You are joining <strong>{preview.companyName}</strong> as{' '}
              <strong>{preview.customerName}</strong>.
            </p>
            <p className="text-muted">Email: {preview.email}</p>
            <form className="stack-form" onSubmit={handleSubmit}>
              <Input
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account…' : 'Activate portal access'}
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
