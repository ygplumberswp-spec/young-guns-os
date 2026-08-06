import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { SocialConnectionProviderCard } from '@titan/shared';
import {
  canManageSocialConnections,
  canViewSocialConnections,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  startFacebookOAuth,
} from '../../lib/facebook-business-api-client';
import {
  fetchSocialConnectionsDashboard,
  startSocialConnectionOAuth,
} from '../../lib/social-connection-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  EnterpriseConnectionStatusLine,
  enterpriseConnectionActionLabel,
} from './EnterpriseConnectionStatusLine';
import {
  deriveSocialEnterpriseConnectionStatus,
  resolveSocialEnterpriseActionHref,
  socialEnterpriseActionUsesConnectFlow,
} from './enterprise-connection-status';

function SocialConnectionCard({
  card,
  canManage,
  accessToken,
}: {
  card: SocialConnectionProviderCard;
  canManage: boolean;
  accessToken: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionStatus = deriveSocialEnterpriseConnectionStatus(card);
  const actionLabel = enterpriseConnectionActionLabel(connectionStatus);
  const actionHref = resolveSocialEnterpriseActionHref(card, connectionStatus);
  const usesConnectFlow = socialEnterpriseActionUsesConnectFlow(card, connectionStatus);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      if (card.delegatedTo === 'facebook_business') {
        const result = await startFacebookOAuth(accessToken, '/facebook-business');
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

  return (
    <article className="social-connection-card integrations-simple-row" data-provider={card.provider}>
      <div className="integrations-simple-row__main">
        <strong>{card.label}</strong>
        <EnterpriseConnectionStatusLine status={connectionStatus} />
      </div>
      <div className="integrations-simple-row__aside">
        {canManage && usesConnectFlow ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void handleConnect()}
          >
            {actionLabel}
          </Button>
        ) : actionHref ? (
          <Link href={actionHref}>
            <Button size="sm" variant="secondary">
              {actionLabel}
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="secondary" disabled>
            {actionLabel}
          </Button>
        )}
      </div>
      {error ? <p className="form-error social-connection-card__error">{error}</p> : null}
    </article>
  );
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
