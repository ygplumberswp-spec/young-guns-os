/** Default stale windows by data class (milliseconds). */
export const CACHE_POLICY = {
  fast: 15_000,
  list: 60_000,
  summary: 90_000,
  config: 300_000,
  sensitive: 0,
} as const;

export type CachePolicyName = keyof typeof CACHE_POLICY;

export function resolveStaleTimeMs(policy: CachePolicyName | number): number {
  return typeof policy === 'number' ? policy : CACHE_POLICY[policy];
}

export const QUERY_CACHE_POLICIES: Record<string, CachePolicyName> = {
  'crm/customers': 'list',
  'jobs/list': 'list',
  'finance/quotes': 'list',
  'finance/invoices': 'list',
  'finance/payments': 'list',
  'crm/stats': 'summary',
  'jobs/stats': 'summary',
  'finance/stats': 'summary',
  'scheduling/calendar': 'fast',
  'integrations/hub-dashboard': 'config',
  'integrations/hub-dashboard:simple': 'config',
  'integrations/social-connections-dashboard': 'config',
  'integrations/auto-sync-statuses': 'fast',
  'dashboard/executive-summary': 'summary',
  'ops-intelligence/snapshot': 'fast',
  'integrations/platform-dashboard': 'config',
  'team/members': 'config',
  'team/roles': 'config',
  'mission-control/dashboard': 'summary',
  'agents/stats': 'summary',
  'background-work/status': 'fast',
  'aura/conversations': 'list',
  'tenant-capabilities/list': 'config',
  'mobile/workforce-dashboard': 'fast',
  'portal/dashboard': 'summary',
};

export function staleTimeForQueryKey(queryKey: string): number {
  const base = queryKey.includes(':') ? (queryKey.split(':')[0] ?? queryKey) : queryKey;
  const policy = QUERY_CACHE_POLICIES[base] ?? QUERY_CACHE_POLICIES[queryKey] ?? 'list';
  return resolveStaleTimeMs(policy);
}
