import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { SocialConnectionProvider, SocialConnectionProviderCard } from '@titan/shared';
import {
  canManageSocialConnections,
  canViewSocialConnections,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  checkFacebookConnection,
  disconnectFacebook,
  startFacebookOAuth,
} from '../../lib/facebook-business-api-client';
import {
  checkSocialConnectionHealth,
  disconnectSocialConnection,
  fetchSocialConnectionAccounts,
  fetchSocialConnectionSetup,
  fetchSocialConnectionsDashboard,
  reconnectSocialConnection,
  selectSocialConnectionAccount,
  startSocialConnectionOAuth,
} from '../../lib/social-connection-api-client';
import { useAuth } from '../../lib/auth-context';

function statusPillModifier(status: SocialConnectionProviderCard['foundationStatus']): string {
  switch (status) {
    case 'CONNECTED':
      return 'success';
    case 'ERROR':
    case 'RECONNECT_REQUIRED':
      return 'danger';
    case 'ACCOUNT_SELECTION_REQUIRED':
    case 'CONNECTING':
      return 'warning';
    case 'PROVIDER_REVIEW_REQUIRED':
    case 'NOT_CONFIGURED':
      return 'muted';
    default:
      return 'neutral';
  }
}

function SocialConnectionCard({
  card,
  canManage,
  accessToken,
  onRefresh,
}: {
  card: SocialConnectionProviderCard;
  canManage: boolean;
  accessToken: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupText, setSetupText] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      if (card.delegatedTo === 'facebook_business') {
        const result = await startFacebookOAuth(accessToken, '/integrations');
        window.location.assign(result.authorizationUrl);
        return;
      }
      const { authorizationUrl } = await startSocialConnectionOAuth(accessToken, {
        provider: card.provider,
        returnPath: '/integrations',
      });
      window.location.assign(authorizationUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Connect failed.');
      setBusy(false);
    }
  }

  async function handleReconnect() {
    setBusy(true);
    setError(null);
    try {
      if (card.delegatedTo === 'facebook_business') {
        const result = await startFacebookOAuth(accessToken, '/integrations');
        window.location.assign(result.authorizationUrl);
        return;
      }
      const { authorizationUrl } = await reconnectSocialConnection(accessToken, card.provider);
      window.location.assign(authorizationUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reconnect failed.');
      setBusy(false);
    }
  }

  async function handleHealth() {
    setBusy(true);
    setError(null);
    try {
      if (card.delegatedTo === 'facebook_business') {
        await checkFacebookConnection(accessToken);
      } else {
        await checkSocialConnectionHealth(accessToken, card.provider);
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Health check failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      if (card.delegatedTo === 'facebook_business') {
        await disconnectFacebook(accessToken);
      } else {
        await disconnectSocialConnection(accessToken, card.provider);
      }
      setConfirmDisconnect(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Disconnect failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleViewSetup() {
    setBusy(true);
    setError(null);
    try {
      const req = await fetchSocialConnectionSetup(accessToken, card.provider);
      setSetupText(
        [
          `Env: ${req.envVariables.join(', ') || 'See documentation'}`,
          `Callback: ${req.callbackUrlPattern}`,
          ...req.ownerPortalSteps.map((s) => `• ${s}`),
        ].join('\n'),
      );
      setSetupOpen(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load setup requirements.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteSelection() {
    setBusy(true);
    setError(null);
    try {
      const accounts = await fetchSocialConnectionAccounts(accessToken, card.provider);
      const first = accounts[0];
      if (!first) {
        setError('No accounts available from provider discovery.');
        return;
      }
      const selection = buildSelection(card.provider, first.id, accounts);
      await selectSocialConnectionAccount(accessToken, {
        provider: card.provider,
        selection,
      });
      setSelectOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Account selection failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="social-connection-card" data-provider={card.provider}>
      <header className="social-connection-card__header">
        <strong>{card.label}</strong>
        <span className={`status-pill status-pill--${statusPillModifier(card.foundationStatus)}`}>
          {card.statusLabel}
        </span>
      </header>
      {card.delegatedTo === 'facebook_business' && card.managementPath ? (
        <p className="page-muted">
          Canonical connection:{' '}
          <Link href={card.managementPath}>Facebook Business workspace</Link>
        </p>
      ) : null}
      {card.selectedAccountLabel ? (
        <p className="page-muted">Selected: {card.selectedAccountLabel}</p>
      ) : null}
      {card.lastHealthCheckAt ? (
        <p className="social-connection-card__meta">
          Last check: {new Date(card.lastHealthCheckAt).toLocaleString()}
        </p>
      ) : null}
      {card.setupRequirementCategory ? (
        <p className="page-muted">Setup: {card.setupRequirementCategory.replace(/_/g, ' ')}</p>
      ) : null}
      {card.safeErrorMessage ? <p className="form-error">{card.safeErrorMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {setupOpen && setupText ? (
        <pre className="social-connection-card__setup">{setupText}</pre>
      ) : null}
      {canManage ? (
        <div className="social-connection-card__actions">
          {card.canConnect ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void handleConnect()}>
              Connect
            </Button>
          ) : null}
          {card.canCompleteAccountSelection && card.delegatedTo !== 'facebook_business' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSelectOpen(true);
                void handleCompleteSelection();
              }}
            >
              Complete account selection
            </Button>
          ) : null}
          {card.canReconnect ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleReconnect()}>
              Reconnect
            </Button>
          ) : null}
          {card.canDisconnect ? (
            confirmDisconnect ? (
              <>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void handleDisconnect()}>
                  Confirm disconnect
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            )
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleHealth()}>
            Check health
          </Button>
          {card.canViewSetupRequirements ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleViewSetup()}>
              View setup requirements
            </Button>
          ) : null}
        </div>
      ) : null}
      {selectOpen ? <p className="page-muted">Validating account selection…</p> : null}
    </article>
  );
}

function buildSelection(
  provider: SocialConnectionProvider,
  primaryId: string,
  accounts: { id: string; kind: string; parentAccountId?: string | null }[],
) {
  switch (provider) {
    case 'facebook':
      return { facebookPageId: primaryId };
    case 'instagram':
      return { instagramBusinessAccountId: primaryId };
    case 'google_business': {
      const location = accounts.find((a) => a.kind === 'google_business_location') ?? accounts[0];
      const account = accounts.find((a) => a.kind === 'google_business_account');
      return {
        googleBusinessAccountId: account?.id ?? location.parentAccountId ?? primaryId,
        googleBusinessLocationId: location.id,
      };
    }
    case 'whatsapp_business': {
      const phone = accounts.find((a) => a.kind === 'whatsapp_phone_number') ?? accounts[0];
      const waba = accounts.find((a) => a.kind === 'whatsapp_business_account');
      return {
        whatsappBusinessAccountId: waba?.id ?? phone.parentAccountId ?? primaryId,
        whatsappPhoneNumberId: phone.id,
      };
    }
    case 'tiktok':
      return { tiktokAccountId: primaryId };
    default:
      return {};
  }
}

export function SocialConnectionsSection() {
  const { accessToken, user } = useAuth();
  const [dashboard, setDashboard] = useState<Awaited<
    ReturnType<typeof fetchSocialConnectionsDashboard>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canViewSocialConnections({ roleName: user.roleName, permissions: user.permissions }) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canManageSocialConnections({ roleName: user.roleName, permissions: user.permissions }) : false),
    [user],
  );

  async function load() {
    if (!accessToken || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSocialConnectionsDashboard(accessToken);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load social connections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [accessToken, canView]);

  if (!canView) {
    return null;
  }

  if (loading && !dashboard) {
    return <LoadingState label="Loading social connections…" />;
  }

  return (
    <Panel className="social-connections-section" title="Social Connections">
      <p className="page-muted">{dashboard?.summary}</p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="social-connections-grid">
        {(dashboard?.providers ?? []).map((card) => (
          <SocialConnectionCard
            key={card.provider}
            card={card}
            canManage={canManage}
            accessToken={accessToken!}
            onRefresh={() => void load()}
          />
        ))}
      </div>
      <p className="page-muted social-connections-honesty">{dashboard?.runtimeHonesty.note}</p>
    </Panel>
  );
}
