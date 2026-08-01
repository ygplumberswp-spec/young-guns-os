import { PageHeader } from '../../components/ux';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import {
  fetchMySessions,
  revokeAllOtherMySessions,
  revokeMySession,
} from '../../lib/api-client';
import { useCachedQuery } from '../../lib/use-cached-query';

function formatWhen(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function summarizeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/iPhone|iPad|Android/i.test(userAgent)) return 'Mobile browser';
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows';
  return 'Desktop browser';
}

export function SecuritySettingsPage() {
  const { accessToken, user } = useAuth();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const canViewSecurityCenter = useMemo(
    () =>
      Boolean(
        user &&
          (user.permissions.includes('security:read') ||
            user.permissions.includes('security:write') ||
            user.permissions.includes('settings:manage') ||
            user.permissions.includes('*')),
      ),
    [user],
  );

  const sessionsQuery = useCachedQuery({
    queryKey: 'auth/my-sessions',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMySessions(accessToken!),
  });

  const sessions = sessionsQuery.data ?? [];

  const handleRevoke = useCallback(
    async (sessionId: string) => {
      if (!accessToken || !window.confirm('Sign out this device/session?')) return;
      setError(null);
      setSuccess(null);
      setIsRevoking(true);
      try {
        await revokeMySession(accessToken, sessionId);
        setSuccess('Session revoked.');
        await sessionsQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to revoke session');
      } finally {
        setIsRevoking(false);
      }
    },
    [accessToken, sessionsQuery],
  );

  const handleRevokeOthers = useCallback(async () => {
    if (!accessToken || !window.confirm('Sign out all other devices and sessions?')) return;
    setError(null);
    setSuccess(null);
    setIsRevoking(true);
    try {
      const count = await revokeAllOtherMySessions(accessToken);
      setSuccess(`${count} other session(s) signed out.`);
      await sessionsQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke other sessions');
    } finally {
      setIsRevoking(false);
    }
  }, [accessToken, sessionsQuery]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Security & sessions"
        description="Manage active sign-ins on your account. Tab inactivity alone does not sign you out."
      />

      {success ? (
        <p className="auth-banner auth-banner--success" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <Panel title="This device">
        {sessionsQuery.isLoading ? (
          <LoadingState label="Loading sessions…" />
        ) : sessions.length === 0 ? (
          <EmptyState title="No active sessions" description="Sign in again to start a new session." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Last activity</th>
                  <th>Expires</th>
                  <th>Trusted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td>{summarizeDevice(row.userAgent)}</td>
                    <td>{formatWhen(row.lastActivityAt ?? row.createdAt)}</td>
                    <td>{formatWhen(row.expiresAt)}</td>
                    <td>{row.isTrustedDevice ? 'Yes' : 'No'}</td>
                    <td>{row.isCurrent ? 'Current session' : 'Active'}</td>
                    <td>
                      {!row.isCurrent ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isRevoking}
                          onClick={() => void handleRevoke(row.id)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="panel-actions">
          <Button type="button" variant="secondary" disabled={isRevoking} onClick={() => void handleRevokeOthers()}>
            Sign out all other sessions
          </Button>
        </div>
      </Panel>

      {canViewSecurityCenter ? (
        <Panel title="Company security center">
          <p>
            Owners and security admins can review tenant-wide sessions, MFA, and audit logs in the
            enterprise security workspace.
          </p>
          <Link href="/security">Open security center</Link>
        </Panel>
      ) : null}
    </div>
  );
}
