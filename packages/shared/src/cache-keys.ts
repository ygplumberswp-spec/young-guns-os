export type QueryCacheScope = {
  tenantId: string;
  actorId: string;
  actorKind: 'staff' | 'portal';
  roleName?: string;
  customerId?: string;
};

/** Tenant-safe query cache key — never use bare resource names alone. */
export function buildScopedCacheKey(
  scope: QueryCacheScope | null | undefined,
  queryKey: string,
  accessToken?: string | null,
): string {
  if (scope?.tenantId && scope.actorId) {
    const customerPart = scope.customerId ? `:cust:${scope.customerId}` : '';
    const rolePart = scope.roleName ? `:r:${scope.roleName}` : '';
    return `${scope.actorKind}:t:${scope.tenantId}:a:${scope.actorId}${rolePart}${customerPart}:q:${queryKey}`;
  }

  return `legacy:${accessToken ?? 'anon'}:${queryKey}`;
}

export function cacheKeyMatchesScope(fullKey: string, scope: QueryCacheScope): boolean {
  const prefix = `${scope.actorKind}:t:${scope.tenantId}:a:${scope.actorId}`;
  return fullKey.startsWith(prefix);
}
