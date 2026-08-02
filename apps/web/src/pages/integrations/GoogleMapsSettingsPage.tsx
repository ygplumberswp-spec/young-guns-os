import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import {
  DEFAULT_GOOGLE_MAPS_SERVICES,
  type GoogleMapsConnectionSummary,
  type GoogleMapsServiceFlag,
  type GoogleMapsServicesConfig,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectGoogleMaps,
  fetchGoogleMapsConnection,
  saveGoogleMapsConnection,
  testGoogleMapsConnection,
  validateGoogleMapsCredentials,
} from '../../lib/google-maps-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';

const SERVICE_LABELS: Record<GoogleMapsServiceFlag, string> = {
  places: 'Places API (Autocomplete)',
  geocoding: 'Geocoding API',
  directions: 'Directions API',
  distanceMatrix: 'Distance Matrix API',
  mapsJavascript: 'Maps JavaScript API',
};

export function GoogleMapsSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<GoogleMapsConnectionSummary | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [browserApiKey, setBrowserApiKey] = useState('');
  const [services, setServices] = useState<GoogleMapsServicesConfig>(DEFAULT_GOOGLE_MAPS_SERVICES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadConnection() {
    if (!accessToken || !canView) return;
    const data = await fetchGoogleMapsConnection(accessToken);
    setConnection(data);
    setServices(data.services);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadConnection();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load Google Maps settings',
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
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const replacingKey = Boolean(apiKey.trim());
      if (!replacingKey && !connection?.hasApiKey) {
        setError('Google Maps API key is required.');
        return;
      }
      if (replacingKey) {
        const validation = await validateGoogleMapsCredentials(accessToken, {
          apiKey,
          browserApiKey: browserApiKey || null,
          services,
        });
        if (!validation.ok) {
          setError(validation.message);
          return;
        }
      }
      const updated = await saveGoogleMapsConnection(accessToken, {
        apiKey: replacingKey ? apiKey : null,
        // Only send browser key when the user typed a replacement — omit keeps stored key.
        ...(browserApiKey.trim() ? { browserApiKey: browserApiKey.trim() } : {}),
        services,
      });
      setConnection(updated);
      setApiKey('');
      setBrowserApiKey('');
      setSuccess(
        replacingKey
          ? 'Google Maps connected. Server key is stored encrypted and never returned.'
          : 'Google Maps settings updated. Existing encrypted keys were kept.',
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Google Maps');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest() {
    if (!accessToken || !canManage) return;
    setIsTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await testGoogleMapsConnection(accessToken);
      if (result.ok) setSuccess(result.message);
      else setError(result.message);
      await loadConnection();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const updated = await disconnectGoogleMaps(accessToken);
      setConnection(updated);
      setSuccess('Google Maps disconnected. Stored keys removed.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Google Maps');
    }
  }

  if (!canView) {
    return (
      <div className="page-shell">
        <PageHeader title="Google Maps" description="Integration access required." />
      </div>
    );
  }

  return (
    <div className="page-shell integrations-page">
      <IntegrationsNav />
      <PageHeader
        title="Google Maps"
        description="Enterprise location platform — Places, Geocoding, Directions, Distance Matrix, Maps JS."
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Connection health" description="Tenant-isolated Google Maps Platform status">
        {isLoading ? (
          <p className="page-muted">Loading…</p>
        ) : (
          <dl className="jobs-detail-list">
            <div>
              <dt>Status</dt>
              <dd>{connection?.connected ? 'Connected' : connection?.status ?? 'Disconnected'}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{connection?.healthLabel ?? '—'}</dd>
            </div>
            <div>
              <dt>Server API key</dt>
              <dd>{connection?.hasApiKey ? 'Stored (encrypted)' : 'Not stored'}</dd>
            </div>
            <div>
              <dt>Browser Maps JS key</dt>
              <dd>
                {connection?.hasBrowserApiKey
                  ? 'Stored (encrypted, referrer-restricted recommended)'
                  : 'Not stored — map tiles disabled until provided'}
              </dd>
            </div>
            <div>
              <dt>Last validated</dt>
              <dd>
                {connection?.lastValidatedAt
                  ? new Date(connection.lastValidatedAt).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
        {canManage && connection?.hasApiKey ? (
          <div className="ux-page-header__actions" style={{ marginTop: '0.75rem' }}>
            <Button type="button" variant="secondary" disabled={isTesting} onClick={() => void handleTest()}>
              {isTesting ? 'Testing…' : 'Run connection test'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void handleDisconnect()}>
              Disconnect
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="Enabled services" description="Control which Google Maps Platform APIs TITAN may call">
        <ul className="exec-utility-status">
          {(Object.keys(SERVICE_LABELS) as GoogleMapsServiceFlag[]).map((flag) => (
            <li key={flag}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                <input
                  type="checkbox"
                  checked={services[flag]}
                  disabled={!canManage}
                  onChange={(event) =>
                    setServices((prev) => ({ ...prev, [flag]: event.target.checked }))
                  }
                />
                <span>{SERVICE_LABELS[flag]}</span>
              </label>
            </li>
          ))}
        </ul>
      </Panel>

      {canManage ? (
        <Panel title="API keys" description="Keys are encrypted at rest with INTEGRATIONS_ENCRYPTION_KEY">
          <form className="inventory-form" onSubmit={(event) => void handleConnect(event)}>
            <label>
              Server API key (Places / Geocoding / Directions / Distance Matrix)
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={connection?.hasApiKey ? '•••••••• (enter to replace)' : 'AIza…'}
                autoComplete="off"
                required={!connection?.hasApiKey}
              />
            </label>
            <label>
              Browser Maps JS key (HTTP referrer restricted — optional but required for interactive maps)
              <Input
                type="password"
                value={browserApiKey}
                onChange={(event) => setBrowserApiKey(event.target.value)}
                placeholder={connection?.hasBrowserApiKey ? '•••••••• (enter to replace)' : 'AIza…'}
                autoComplete="off"
              />
            </label>
            <p className="page-muted">
              Create keys in Google Cloud Console. Restrict the browser key by HTTP referrer to your
              TITAN web origin. Never use an unrestricted key in the browser.
            </p>
            <Button type="submit" disabled={isSaving || (!apiKey && !connection?.hasApiKey)}>
              {isSaving ? 'Saving…' : connection?.connected ? 'Update connection' : 'Connect Google Maps'}
            </Button>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
