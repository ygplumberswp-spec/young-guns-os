import type {
  IntegrationProviderAutoSyncStatus,
  IntegrationProviderStatus,
  SocialConnectionProviderCard,
} from '@titan/shared';
import {
  deriveHubEnterpriseConnectionStatus,
  deriveSocialEnterpriseConnectionStatus,
  ENTERPRISE_CONNECTION_ACTION_LABELS,
  ENTERPRISE_CONNECTION_STATUS_LABELS,
  enterpriseStatusDotModifier,
  resolveHubEnterpriseActionHref,
  resolveSocialEnterpriseActionHref,
  type EnterpriseConnectionStatus,
} from '../integrations/enterprise-connection-status';
import { enterpriseConnectionActionLabel } from '../integrations/EnterpriseConnectionStatusLine';

/** Provider order on the Owner Dashboard Connections card (matches audit list). */
export const DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS = [
  'xero',
  'facebook',
  'cartrack',
  'gmail',
  'whatsapp',
  'yoco',
  'google_maps',
  'instagram',
  'tiktok',
] as const;

const SOCIAL_OVERVIEW_PROVIDER_KEYS = new Set(['facebook', 'instagram', 'tiktok']);

export type DashboardConnectionOverviewRow = {
  providerKey: string;
  name: string;
  status: EnterpriseConnectionStatus;
  statusLabel: (typeof ENTERPRISE_CONNECTION_STATUS_LABELS)[EnterpriseConnectionStatus];
  actionLabel: string;
  actionHref: string;
  dotModifier: ReturnType<typeof enterpriseStatusDotModifier>;
};

export function buildHubDashboardConnectionRow(
  provider: IntegrationProviderStatus,
  autoSync?: IntegrationProviderAutoSyncStatus,
): DashboardConnectionOverviewRow {
  const status = deriveHubEnterpriseConnectionStatus(provider, autoSync);
  const actionHref = resolveHubEnterpriseActionHref(provider, status) ?? '/integrations';

  let actionLabel = ENTERPRISE_CONNECTION_ACTION_LABELS[status];
  if (
    (status === 'not_connected' && !provider.canConnect && provider.settingsPath) ||
    provider.capabilityState === 'not_implemented'
  ) {
    actionLabel = 'View status';
  }

  return {
    providerKey: String(provider.provider),
    name: provider.name,
    status,
    statusLabel: ENTERPRISE_CONNECTION_STATUS_LABELS[status],
    actionLabel,
    actionHref,
    dotModifier: enterpriseStatusDotModifier(status),
  };
}

export function buildSocialDashboardConnectionRow(
  card: SocialConnectionProviderCard,
): DashboardConnectionOverviewRow {
  const status = deriveSocialEnterpriseConnectionStatus(card);
  const actionHref =
    resolveSocialEnterpriseActionHref(card, status) ??
    card.managementPath ??
    '/integrations';

  return {
    providerKey: card.provider,
    name: card.label,
    status,
    statusLabel: ENTERPRISE_CONNECTION_STATUS_LABELS[status],
    actionLabel: enterpriseConnectionActionLabel(status),
    actionHref,
    dotModifier: enterpriseStatusDotModifier(status),
  };
}

export function buildDashboardConnectionOverviewRows(input: {
  hubProviders: IntegrationProviderStatus[];
  autoSyncByProvider: Map<string, IntegrationProviderAutoSyncStatus>;
  socialCards: SocialConnectionProviderCard[];
}): DashboardConnectionOverviewRow[] {
  const hubByKey = new Map(
    input.hubProviders.map((provider) => [String(provider.provider), provider]),
  );
  const socialByKey = new Map<string, SocialConnectionProviderCard>(
    input.socialCards.map((card) => [card.provider, card]),
  );

  const rows: DashboardConnectionOverviewRow[] = [];

  for (const key of DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS) {
    if (SOCIAL_OVERVIEW_PROVIDER_KEYS.has(key)) {
      const social = socialByKey.get(key);
      if (social) {
        rows.push(buildSocialDashboardConnectionRow(social));
      }
      continue;
    }

    const hub = hubByKey.get(key);
    if (hub) {
      rows.push(
        buildHubDashboardConnectionRow(
          hub,
          input.autoSyncByProvider.get(key) ?? input.autoSyncByProvider.get(hub.provider),
        ),
      );
    }
  }

  return rows;
}

export function dashboardConnectionsFooterState(
  rows: DashboardConnectionOverviewRow[],
): 'live' | 'needs_setup' | 'unavailable' {
  if (rows.length === 0) {
    return 'unavailable';
  }
  if (rows.some((row) => row.status !== 'connected')) {
    return 'needs_setup';
  }
  return 'live';
}
