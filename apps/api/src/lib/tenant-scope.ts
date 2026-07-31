import { canAccessTenant, type StaffIdentity } from '@titan/auth';

export class TenantScopeError extends Error {
  constructor(
    public readonly code: 'TENANT_MISMATCH' | 'CROSS_TENANT_DENIED',
    message: string,
  ) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

/**
 * Enforce companyId tenant isolation on every protected query/mutation.
 * Platform Owner may access other tenants; all other roles must match exactly.
 */
export function assertTenantScope(
  identity: StaffIdentity & { companyId: string },
  resourceCompanyId: string,
): void {
  if (canAccessTenant(identity, resourceCompanyId)) {
    return;
  }
  throw new TenantScopeError(
    'CROSS_TENANT_DENIED',
    'You cannot access resources for another company',
  );
}

/** Prefer auth.companyId — never trust a client-supplied companyId for non-platform roles. */
export function resolveScopedCompanyId(
  identity: StaffIdentity & { companyId: string },
  requestedCompanyId?: string | null,
): string {
  if (!requestedCompanyId || requestedCompanyId === identity.companyId) {
    return identity.companyId;
  }
  if (canAccessTenant(identity, requestedCompanyId)) {
    return requestedCompanyId;
  }
  throw new TenantScopeError(
    'CROSS_TENANT_DENIED',
    'You cannot select another company without Platform Owner access',
  );
}
