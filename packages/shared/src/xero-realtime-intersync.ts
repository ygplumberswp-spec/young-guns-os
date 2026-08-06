export type XeroWebhookEventCategory = 'CONTACT' | 'INVOICE' | 'CREDITNOTE' | 'SUBSCRIPTION';

export type XeroFinanceFreshnessState =
  | 'current'
  | 'refreshing'
  | 'stale'
  | 'delayed'
  | 'never_synced'
  | 'unavailable';

export type XeroFinanceFreshnessSummary = {
  quotes: {
    state: XeroFinanceFreshnessState;
    lastRefreshedAt: string | null;
    label: string;
  };
  invoices: {
    state: XeroFinanceFreshnessState;
    lastRefreshedAt: string | null;
    label: string;
  };
  connectionAttentionRequired: boolean;
};

export type XeroIncrementalQuoteRefreshResult = {
  refreshedAt: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  delayed: boolean;
  label: string;
};

export function formatFinanceFreshnessLabel(input: {
  state: XeroFinanceFreshnessState;
  lastRefreshedAt: string | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  if (input.state === 'refreshing') return 'Refreshing quietly';
  if (input.state === 'delayed') return 'Update delayed';
  if (input.state === 'never_synced') return 'Not synced yet';
  if (input.state === 'unavailable') return 'Xero unavailable';

  if (!input.lastRefreshedAt) {
    return input.state === 'stale' ? 'Update pending' : 'Updated just now';
  }

  const ageMs = now.getTime() - new Date(input.lastRefreshedAt).getTime();
  if (ageMs < 60_000) return 'Updated just now';
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes === 1) return 'Updated 1 minute ago';
  return `Updated ${minutes} minutes ago`;
}
