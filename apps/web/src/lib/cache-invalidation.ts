import { useCallback } from 'react';
import type { QueryCacheScope } from '@titan/shared';
import { buildQueryKey, invalidateQueryCachePrefix } from './query-cache';
import { useAuth } from './auth-context';
import { useStaffCacheScope } from './use-scoped-cached-query';

export function invalidateStaffQueryKeys(
  scope: QueryCacheScope,
  accessToken: string | null,
  queryKeys: string[],
): void {
  for (const queryKey of queryKeys) {
    invalidateQueryCachePrefix(buildQueryKey(accessToken, queryKey, scope));
  }
}

export function invalidateStaffQueryPrefixes(
  scope: QueryCacheScope,
  accessToken: string | null,
  prefixes: string[],
): void {
  for (const prefix of prefixes) {
    const scopedPrefix = buildQueryKey(accessToken, prefix, scope);
    invalidateQueryCachePrefix(scopedPrefix);
  }
}

export function invalidatePortalQueryPrefixes(
  scope: QueryCacheScope,
  accessToken: string | null,
  prefixes: string[],
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, prefixes);
}

const CUSTOMER_MUTATION_PREFIXES = ['crm/customers', 'crm/stats'] as const;
const JOB_MUTATION_PREFIXES = [
  'jobs/list',
  'jobs/stats',
  'mobile/jobs',
  'mobile/workforce-dashboard',
] as const;
const SCHEDULING_MUTATION_PREFIXES = [
  'scheduling/calendar',
  'scheduling/assignees',
  'mobile/scheduling',
  'jobs/list',
  'jobs/stats',
  'mobile/jobs',
  'mobile/workforce-dashboard',
] as const;
const QUOTE_MUTATION_PREFIXES = [
  'finance/quotes',
  'finance/stats',
  'finance/jobs',
  'finance/invoices',
] as const;
const INVOICE_MUTATION_PREFIXES = [
  'finance/invoices',
  'finance/stats',
  'finance/jobs',
  'finance/payments',
] as const;
const PAYMENT_MUTATION_PREFIXES = [
  'finance/payments',
  'finance/stats',
  'finance/jobs',
  'finance/invoices',
] as const;
const INTEGRATION_MUTATION_PREFIXES = [
  'integrations/xero',
  'integration-platform',
  'background-work',
] as const;
const TEAM_MUTATION_PREFIXES = ['team/members', 'team/invites', 'team/roles'] as const;

export function invalidateAfterCustomerMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...CUSTOMER_MUTATION_PREFIXES]);
}

export function invalidateAfterJobMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...JOB_MUTATION_PREFIXES]);
}

export function invalidateAfterScheduleMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...SCHEDULING_MUTATION_PREFIXES]);
}

export function invalidateAfterQuoteMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...QUOTE_MUTATION_PREFIXES]);
}

export function invalidateAfterInvoiceMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...INVOICE_MUTATION_PREFIXES]);
}

export function invalidateAfterPaymentMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...PAYMENT_MUTATION_PREFIXES]);
}

export function invalidateAfterIntegrationMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...INTEGRATION_MUTATION_PREFIXES]);
}

export function invalidateAfterTeamMutation(
  scope: QueryCacheScope,
  accessToken: string | null,
): void {
  invalidateStaffQueryPrefixes(scope, accessToken, [...TEAM_MUTATION_PREFIXES]);
}

export function useStaffMutationInvalidation() {
  const { accessToken } = useAuth();
  const scope = useStaffCacheScope();

  const invalidateCustomers = useCallback(() => {
    if (!scope) return;
    invalidateAfterCustomerMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidateJobs = useCallback(() => {
    if (!scope) return;
    invalidateAfterJobMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidateScheduling = useCallback(() => {
    if (!scope) return;
    invalidateAfterScheduleMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidateQuotes = useCallback(() => {
    if (!scope) return;
    invalidateAfterQuoteMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidateInvoices = useCallback(() => {
    if (!scope) return;
    invalidateAfterInvoiceMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidatePayments = useCallback(() => {
    if (!scope) return;
    invalidateAfterPaymentMutation(scope, accessToken);
  }, [accessToken, scope]);

  const invalidateTeam = useCallback(() => {
    if (!scope) return;
    invalidateAfterTeamMutation(scope, accessToken);
  }, [accessToken, scope]);

  return {
    invalidateCustomers,
    invalidateJobs,
    invalidateScheduling,
    invalidateQuotes,
    invalidateInvoices,
    invalidatePayments,
    invalidateTeam,
  };
}
