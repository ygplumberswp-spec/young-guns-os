import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Input } from '@titan/ui';
import type { InvitePreview } from '@titan/shared';
import { validatePasswordStrength, getStaffHomePath } from '@titan/auth/browser';
import { ApiClientError } from '../../lib/api-client';
import { fetchInvitePreview } from '../../lib/team-api';
import { useAuth } from '../../lib/auth-context';
import { GuestRoute } from '../../components/ProtectedRoute';

export function AcceptInvitePage() {
  return (
    <GuestRoute>
      <AcceptInviteForm />
    </GuestRoute>
  );
}

function AcceptInviteForm() {
  const { acceptInvite } = useAuth();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
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
        const data = await fetchInvitePreview(inviteToken);

        if (!cancelled) {
          setPreview(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Invite is invalid or expired');
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
      const payload = await acceptInvite({ token, firstName, lastName, password });
      const home = getStaffHomePath({
        roleName: payload.user.roleName,
        permissions: payload.user.permissions,
      });
      setLocation(home);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to accept invite');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h2 className="auth-card__title">Join your team</h2>
        {isLoading ? (
          <p className="auth-card__subtitle">Validating invite...</p>
        ) : preview ? (
          <p className="auth-card__subtitle">
            You&apos;re joining {preview.companyName} as {preview.roleName}. Email: {preview.email}
          </p>
        ) : null}

        {!isLoading && preview ? (
          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="auth-form__row">
              <Input
                label="First Name"
                name="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
              <Input
                label="Last Name"
                name="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </div>
            <Input
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error ? <p className="auth-error">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Accept invite'}
            </Button>
          </form>
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : null}
      </div>
    </AuthLayout>
  );
}
