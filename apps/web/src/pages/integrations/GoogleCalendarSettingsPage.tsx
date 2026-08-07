import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import type {
  GoogleCalendarCalendarSummary,
  GoogleCalendarConflictSummary,
  GoogleCalendarPrivacyMode,
  GoogleCalendarSettingsResponse,
  GoogleCalendarSyncDirection,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarConflicts,
  fetchGoogleCalendarSettings,
  refreshGoogleCalendarList,
  startGoogleCalendarOAuth,
  syncGoogleCalendarNow,
  updateGoogleCalendarCalendar,
  updateGoogleCalendarSettings,
} from '../../lib/google-calendar-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';

const SETTINGS_PATH = '/integrations/google-calendar';

const SYNC_DIRECTION_LABELS: Record<GoogleCalendarSyncDirection, string> = {
  disabled: 'Not syncing',
  push_only: 'TITAN jobs → Google',
  import_only: 'Google events → TITAN',
  two_way: 'Two-way',
};

const PRIVACY_LABELS: Record<GoogleCalendarPrivacyMode, string> = {
  busy_only: 'Busy only (no details leave TITAN)',
  limited_details: 'Limited (job number, title, technician)',
  approved_details: 'Approved (adds customer name and address)',
};

const STATE_LABELS: Record<string, string> = {
  not_configured: 'Awaiting configuration',
  disconnected: 'Not connected',
  pending: 'Awaiting Google consent',
  connected: 'Connected',
  reauth_required: 'Reconnect required',
  error: 'Error',
};

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

/** Reads the outcome Google's callback appended to the URL, then clears it. */
function useOAuthCallbackNotice(): { outcome: string | null; message: string | null } {
  const [notice, setNotice] = useState<{ outcome: string | null; message: string | null }>({
    outcome: null,
    message: null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('googleCalendar');
    if (!outcome) return;

    setNotice({ outcome, message: params.get('message') });
    params.delete('googleCalendar');
    params.delete('message');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, []);

  return notice;
}

export function GoogleCalendarSettingsPage() {
  const { accessToken, user } = useAuth();
  const callbackNotice = useOAuthCallbackNotice();

  const [settings, setSettings] = useState<GoogleCalendarSettingsResponse | null>(null);
  const [conflicts, setConflicts] = useState<GoogleCalendarConflictSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  const load = useCallback(async () => {
    if (!accessToken || !canView) return;
    const [nextSettings, nextConflicts] = await Promise.all([
      fetchGoogleCalendarSettings(accessToken),
      fetchGoogleCalendarConflicts(accessToken).catch(() => []),
    ]);
    setSettings(nextSettings);
    setConflicts(nextConflicts);
  }, [accessToken, canView]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load Google Calendar settings',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, load]);

  async function runAction(name: string, action: () => Promise<string | null>) {
    if (!accessToken) return;
    setBusyAction(name);
    setError(null);
    setSuccess(null);
    try {
      const message = await action();
      if (message) setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Unable to ${name}`);
    } finally {
      setBusyAction(null);
    }
  }

  function handleConnect() {
    void runAction('connect Google Calendar', async () => {
      const { authorizationUrl } = await startGoogleCalendarOAuth(accessToken!, SETTINGS_PATH);
      window.location.assign(authorizationUrl);
      return null;
    });
  }

  const connection = settings?.connection;

  if (!canView) {
    return (
      <div className="page-shell integrations-page">
        <PageHeader
          title="Google Calendar"
          description="Live scheduling and job sync with Google Calendar."
        />
        <Panel title="Access">
          <p className="page-muted">
            You do not have permission to view integration settings.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-shell integrations-page">
      <IntegrationsNav />
      <PageHeader
        title="Google Calendar"
        description="Extends TITAN Scheduling — mirrors TITAN jobs into Google, imports Google events as external entries, and flags clashes for review. TITAN stays the scheduling authority."
      />

      {callbackNotice.outcome === 'error' && callbackNotice.message ? (
        <p className="form-error">{callbackNotice.message}</p>
      ) : null}
      {callbackNotice.outcome === 'connected' && callbackNotice.message ? (
        <p className="form-success">{callbackNotice.message}</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Connection" description="Honest status — never a claimed connection">
        {isLoading ? (
          <p className="page-muted">Loading…</p>
        ) : (
          <>
            <p className="page-muted" style={{ marginBottom: '0.75rem' }}>
              {connection?.statusMessage}
            </p>
            <dl className="jobs-detail-list">
              <div>
                <dt>Status</dt>
                <dd>{STATE_LABELS[connection?.state ?? 'disconnected'] ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Connected account</dt>
                <dd>{connection?.googleAccountEmail ?? '—'}</dd>
              </div>
              <div>
                <dt>Connected at</dt>
                <dd>{formatTimestamp(connection?.connectedAt ?? null)}</dd>
              </div>
              <div>
                <dt>Last sync attempt</dt>
                <dd>{formatTimestamp(connection?.lastSyncAt ?? null)}</dd>
              </div>
              <div>
                <dt>Last successful sync</dt>
                <dd>{formatTimestamp(connection?.lastSuccessfulSyncAt ?? null)}</dd>
              </div>
              <div>
                <dt>Calendars selected</dt>
                <dd>{connection?.selectedCalendarCount ?? 0}</dd>
              </div>
              <div>
                <dt>Open conflicts</dt>
                <dd>{connection?.openConflictCount ?? 0}</dd>
              </div>
              <div>
                <dt>Permissions granted</dt>
                <dd>
                  {connection?.grantedScopes.length
                    ? connection.grantedScopes
                        .map((scope) => scope.replace('https://www.googleapis.com/auth/', ''))
                        .join(', ')
                    : '—'}
                </dd>
              </div>
              {connection?.missingScopes.length ? (
                <div>
                  <dt>Permissions missing</dt>
                  <dd>
                    {connection.missingScopes
                      .map((scope) => scope.replace('https://www.googleapis.com/auth/', ''))
                      .join(', ')}
                  </dd>
                </div>
              ) : null}
              {connection?.lastError ? (
                <div>
                  <dt>Last error</dt>
                  <dd>{connection.lastError}</dd>
                </div>
              ) : null}
            </dl>

            {!connection?.oauthConfigured ? (
              <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> on the API
                host, and register{' '}
                <code>{connection?.redirectUri ?? '/api/v1/google-calendar/oauth/callback'}</code> as
                an authorised redirect URI in Google Cloud Console. Connect becomes available once
                that is done.
              </p>
            ) : null}

            {canManage ? (
              <div className="ux-page-header__actions" style={{ marginTop: '0.75rem' }}>
                <Button
                  type="button"
                  disabled={!connection?.oauthConfigured || busyAction !== null}
                  onClick={handleConnect}
                >
                  {connection?.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyAction !== null || !connection?.connected}
                  onClick={() =>
                    void runAction('sync now', async () => {
                      const outcome = await syncGoogleCalendarNow(accessToken!);
                      return `Sync ${outcome.status}: ${outcome.message}`;
                    })
                  }
                >
                  {busyAction === 'sync now' ? 'Syncing…' : 'Sync Now'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyAction !== null || !connection?.connected}
                  onClick={() =>
                    void runAction('refresh calendars', async () => {
                      const calendars = await refreshGoogleCalendarList(accessToken!);
                      return `Found ${calendars.length} calendar(s) on the connected account.`;
                    })
                  }
                >
                  Refresh calendar list
                </Button>
                {connection?.connected || connection?.state === 'reauth_required' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runAction('disconnect', async () => {
                        await disconnectGoogleCalendar(accessToken!);
                        return 'Google Calendar disconnected and tokens revoked.';
                      })
                    }
                  >
                    Disconnect
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                Only Owners and Admins with integration management rights can change this
                connection.
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="Sync behaviour"
        description="Nothing syncs until you enable it and select a calendar"
      >
        {connection ? (
          <div className="jobs-detail-list">
            <ToggleRow
              label="Mirror TITAN jobs into Google"
              description="Creates and updates Google events for scheduled TITAN jobs on calendars set to push."
              checked={connection.pushJobsEnabled}
              disabled={!canManage || !connection.connected || busyAction !== null}
              onChange={(value) =>
                void runAction('update settings', async () => {
                  await updateGoogleCalendarSettings(accessToken!, { pushJobsEnabled: value });
                  return value ? 'TITAN jobs will be mirrored into Google.' : 'Job mirroring off.';
                })
              }
            />
            <ToggleRow
              label="Import Google events"
              description="Brings Google events in as external entries. They never become jobs without an explicit conversion."
              checked={connection.importEventsEnabled}
              disabled={!canManage || !connection.connected || busyAction !== null}
              onChange={(value) =>
                void runAction('update settings', async () => {
                  await updateGoogleCalendarSettings(accessToken!, { importEventsEnabled: value });
                  return value ? 'Google events will be imported.' : 'Event import off.';
                })
              }
            />
            <ToggleRow
              label="Automatic background sync"
              description="When off, syncing only happens when someone presses Sync Now."
              checked={connection.autoSyncEnabled}
              disabled={!canManage || !connection.connected || busyAction !== null}
              onChange={(value) =>
                void runAction('update settings', async () => {
                  await updateGoogleCalendarSettings(accessToken!, { autoSyncEnabled: value });
                  return value ? 'Auto sync enabled.' : 'Auto sync disabled.';
                })
              }
            />
          </div>
        ) : (
          <p className="page-muted">Connect Google Calendar to configure sync behaviour.</p>
        )}
      </Panel>

      <Panel
        title="Calendars"
        description="Select which calendars participate, in which direction, and how much detail may leave TITAN"
      >
        {isLoading ? (
          <p className="page-muted">Loading…</p>
        ) : !settings?.calendars.length ? (
          <p className="page-muted">
            {connection?.connected
              ? 'No calendars discovered yet. Use “Refresh calendar list”.'
              : 'Connect Google Calendar to list the calendars on that account.'}
          </p>
        ) : (
          <ul className="exec-utility-status">
            {settings.calendars.map((calendar) => (
              <CalendarRow
                key={calendar.id}
                calendar={calendar}
                canManage={canManage}
                busy={busyAction !== null}
                onUpdate={(body, label) =>
                  void runAction('update calendar', async () => {
                    await updateGoogleCalendarCalendar(accessToken!, calendar.id, body);
                    return label;
                  })
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Conflicts needing review"
        description="TITAN records clashes and never moves a job on its own"
      >
        {conflicts.length === 0 ? (
          <p className="page-muted">No open conflicts.</p>
        ) : (
          <ul className="exec-utility-status">
            {conflicts.map((conflict) => (
              <li key={conflict.id}>
                <strong>{conflict.jobNumber ?? conflict.jobTitle ?? 'Conflict'}</strong>
                <span> · {conflict.message}</span>
                {conflict.windowStart ? (
                  <span> · {formatTimestamp(conflict.windowStart)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sync history" description="Real runs only — no invented activity">
        {!settings?.recentSyncRuns.length ? (
          <p className="page-muted">No sync has run yet.</p>
        ) : (
          <ul className="exec-utility-status">
            {settings.recentSyncRuns.map((run) => (
              <li key={run.id}>
                <strong>{run.status}</strong>
                <span>
                  {' '}
                  · {run.trigger} · {formatTimestamp(run.startedAt)} · {run.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{checked ? 'On' : 'Off'}</span>
        </label>
        <span className="page-muted">{description}</span>
      </dd>
    </div>
  );
}

function CalendarRow({
  calendar,
  canManage,
  busy,
  onUpdate,
}: {
  calendar: GoogleCalendarCalendarSummary;
  canManage: boolean;
  busy: boolean;
  onUpdate: (
    body: { selected?: boolean; syncDirection?: GoogleCalendarSyncDirection; privacyMode?: GoogleCalendarPrivacyMode },
    label: string,
  ) => void;
}) {
  const directions: GoogleCalendarSyncDirection[] = calendar.canPush
    ? ['disabled', 'import_only', 'push_only', 'two_way']
    : ['disabled', 'import_only'];

  return (
    <li>
      <strong>
        {calendar.summary}
        {calendar.isPrimary ? ' (primary)' : ''}
      </strong>
      <span>
        {' '}
        · {calendar.selected ? SYNC_DIRECTION_LABELS[calendar.syncDirection] : 'Not selected'}
        {calendar.canPush ? '' : ' · Google granted read-only access'}
        {calendar.lastError ? ` · ${calendar.lastError}` : ''}
      </span>
      {canManage ? (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="checkbox"
              checked={calendar.selected}
              disabled={busy}
              onChange={(event) =>
                onUpdate(
                  { selected: event.target.checked },
                  event.target.checked
                    ? `"${calendar.summary}" will be included in sync.`
                    : `"${calendar.summary}" removed from sync.`,
                )
              }
            />
            <span>Include in sync</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Direction</span>
            <select
              value={calendar.syncDirection}
              disabled={busy || !calendar.selected}
              onChange={(event) =>
                onUpdate(
                  { syncDirection: event.target.value as GoogleCalendarSyncDirection },
                  `"${calendar.summary}" direction updated.`,
                )
              }
            >
              {directions.map((direction) => (
                <option key={direction} value={direction}>
                  {SYNC_DIRECTION_LABELS[direction]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Detail shared</span>
            <select
              value={calendar.privacyMode}
              disabled={busy || !calendar.selected}
              onChange={(event) =>
                onUpdate(
                  { privacyMode: event.target.value as GoogleCalendarPrivacyMode },
                  `"${calendar.summary}" privacy updated.`,
                )
              }
            >
              {(Object.keys(PRIVACY_LABELS) as GoogleCalendarPrivacyMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {PRIVACY_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </li>
  );
}
