import type { IntegrationCapabilityState, IntegrationProviderStatus } from '@titan/shared';

/** Owner-facing honesty buckets for the dashboard connection strip. */
export type OwnerIntegrationHonesty = 'connected' | 'attention' | 'not_connected';

export type OwnerIntegrationHonestyLabel = 'Connected' | 'Attention' | 'Not connected';

/** Core providers shown on the Owner Dashboard (real hub status only). */
export const OWNER_DASHBOARD_CORE_PROVIDERS = [
  'gmail',
  'xero',
  'cartrack',
  'google_maps',
  'whatsapp',
  'yoco',
] as const;

export type OwnerDashboardCoreProvider = (typeof OWNER_DASHBOARD_CORE_PROVIDERS)[number];

export function toOwnerIntegrationHonesty(
  state: IntegrationCapabilityState,
): OwnerIntegrationHonesty {
  switch (state) {
    case 'connected_usable':
      return 'connected';
    case 'failed_degraded':
    case 'temporarily_unavailable':
    case 'configured_unverified':
      return 'attention';
    default:
      return 'not_connected';
  }
}

export function formatOwnerIntegrationHonesty(
  honesty: OwnerIntegrationHonesty,
): OwnerIntegrationHonestyLabel {
  switch (honesty) {
    case 'connected':
      return 'Connected';
    case 'attention':
      return 'Attention';
    case 'not_connected':
      return 'Not connected';
  }
}

export function ownerHonestyCtaLabel(honesty: OwnerIntegrationHonesty, canConnect: boolean): string {
  if (honesty === 'connected') {
    return 'Manage';
  }
  if (honesty === 'attention') {
    return 'Review';
  }
  return canConnect ? 'Connect' : 'Open';
}

export function pickOwnerDashboardProviders(
  providers: IntegrationProviderStatus[],
): IntegrationProviderStatus[] {
  const byProvider = new Map(providers.map((provider) => [String(provider.provider), provider]));
  return OWNER_DASHBOARD_CORE_PROVIDERS.map((key) => byProvider.get(key)).filter(
    (provider): provider is IntegrationProviderStatus => Boolean(provider),
  );
}
