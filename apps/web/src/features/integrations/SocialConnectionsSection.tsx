import { useEffect, useMemo, useState } from 'react';
import type { SocialConnectionProviderCard } from '@titan/shared';
import {
  canManageSocialConnections,
  canViewSocialConnections,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { startFacebookOAuth } from '../../lib/facebook-business-api-client';
import {
  fetchSocialConnectionsDashboard,
  startSocialConnectionOAuth,
} from '../../lib/social-connection-api-client';
import { useAuth } from '../../lib/auth-context';
import { IntegrationOverviewSection } from './IntegrationOverviewSection';
import { SocialProviderOverviewCard } from './SocialProviderOverviewCard';

const SOCIAL_LOADING_SKELETON_COUNT = 3;

function SocialConnectionCardContainer({
  card,
  canManage,
  accessToken,
}: {
  card: SocialConnectionProviderCard;
  canManage: boolean;
  accessToken: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
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
    } catch {
      setBusy(false);
    }
  }

  return (
    <SocialProviderOverviewCard
      card={card}
      canManage={canManage}
      onConnect={() => void handleConnect()}
      connectBusy={busy}
    />
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

  return (
    <IntegrationOverviewSection
      title="Social connections"
      loading={loading && !dashboard}
      skeletonCount={SOCIAL_LOADING_SKELETON_COUNT}
      error={error}
      emptyTitle={!loading && dashboard?.providers.length === 0 ? 'No social providers available' : undefined}
    >
      {(dashboard?.providers ?? []).map((card) => (
        <SocialConnectionCardContainer
          key={card.provider}
          card={card}
          canManage={canManage}
          accessToken={accessToken!}
        />
      ))}
    </IntegrationOverviewSection>
  );
}
