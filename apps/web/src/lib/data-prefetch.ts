import { buildQueryKey, fetchQueryCache } from './query-cache';
import { staleTimeForQueryKey } from './cache-policies';
import { scheduleBackgroundTask } from './background-scheduler';
import { fetchCustomers, fetchCrmStats } from './crm-api';
import { fetchFinanceStats, fetchInvoices, fetchPayments, fetchQuotes } from './finance-api';
import { fetchJobs, fetchJobsStats } from './jobs-api';
import { fetchTeamMembers, fetchTeamRoles } from './team-api';
import { fetchIntegrationHubDashboard } from './integration-hub-api';
import { fetchMissionControlDashboard } from './mission-control-api-client';
import { fetchAgentsStats } from './agents-api';
import { request } from './api-client';
import {
  fetchPortalDashboard,
  fetchPortalJobs,
  fetchPortalQuotes,
  fetchPortalFinance,
  fetchPortalAppointments,
  fetchPortalCommunications,
} from './portal-api-client';
import { fetchMobileWorkforceDashboard } from './mobile-api-client';
import type { PreloadContext } from './route-prefetch-registry';

const prefetchedQueries = new Set<string>();

type DataFetcher = (context: PreloadContext, signal: AbortSignal) => Promise<unknown>;

const DATA_FETCHERS: Record<string, DataFetcher> = {
  'crm/customers': (ctx, _signal) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchCustomers(ctx.accessToken);
  },
  'crm/stats': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchCrmStats(ctx.accessToken);
  },
  'jobs/list': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchJobs(ctx.accessToken);
  },
  'jobs/stats': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchJobsStats(ctx.accessToken);
  },
  'finance/quotes': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchQuotes(ctx.accessToken);
  },
  'finance/invoices': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchInvoices(ctx.accessToken);
  },
  'finance/payments': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchPayments(ctx.accessToken);
  },
  'finance/stats': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchFinanceStats(ctx.accessToken);
  },
  'team/members': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchTeamMembers(ctx.accessToken);
  },
  'team/roles': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return fetchTeamRoles(ctx.accessToken);
  },
  'integrations/hub-dashboard': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchIntegrationHubDashboard(ctx.accessToken);
  },
  'mission-control/dashboard': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchMissionControlDashboard(ctx.accessToken);
  },
  'agents/stats': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchAgentsStats(ctx.accessToken);
  },
  'tenant-capabilities/list': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return request<{ capabilities: unknown[] }>('/tenant-capabilities', {
      accessToken: ctx.accessToken,
    }).then((data) => data.capabilities);
  },
  'mobile/workforce-dashboard': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve(null);
    return fetchMobileWorkforceDashboard(ctx.accessToken);
  },
  'mobile/jobs': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return request<{ jobs: unknown[] }>('/mobile/workforce/jobs', {
      accessToken: ctx.accessToken,
    }).then((data) => data.jobs);
  },
  'mobile/notifications': (ctx) => {
    if (ctx.kind !== 'staff') return Promise.resolve([]);
    return request<{ notifications: unknown[] }>('/mobile/notifications', {
      accessToken: ctx.accessToken,
    }).then((data) => data.notifications);
  },
  'portal/dashboard': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve(null);
    return fetchPortalDashboard(ctx.accessToken);
  },
  'portal/jobs': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve([]);
    return fetchPortalJobs(ctx.accessToken).then((data) => data.jobs);
  },
  'portal/quotes': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve([]);
    return fetchPortalQuotes(ctx.accessToken);
  },
  'portal/finance': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve(null);
    return fetchPortalFinance(ctx.accessToken);
  },
  'portal/appointments': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve([]);
    return fetchPortalAppointments(ctx.accessToken);
  },
  'portal/communications': (ctx) => {
    if (ctx.kind !== 'portal') return Promise.resolve(null);
    return fetchPortalCommunications(ctx.accessToken);
  },
};

export function prefetchDataQueries(
  queryKeys: string[],
  context: PreloadContext,
  signal?: AbortSignal,
): void {
  for (const queryKey of queryKeys) {
    if (signal?.aborted) return;
    prefetchDataQuery(queryKey, context);
  }
}

export function prefetchDataQuery(queryKey: string, context: PreloadContext): void {
  const fetcher = DATA_FETCHERS[queryKey];
  if (!fetcher) {
    return;
  }

  const fullKey = buildQueryKey(context.accessToken, queryKey, context.scope);
  const dedupeKey = `data:${fullKey}`;

  if (prefetchedQueries.has(dedupeKey)) {
    return;
  }

  prefetchedQueries.add(dedupeKey);

  scheduleBackgroundTask(dedupeKey, 'background', async (taskSignal) => {
    if (taskSignal.aborted) return;

    await fetchQueryCache(fullKey, (abortSignal) => fetcher(context, abortSignal), {
      staleTimeMs: staleTimeForQueryKey(queryKey),
      background: true,
    });
  });
}

export function resetDataPrefetchState(): void {
  prefetchedQueries.clear();
}

export function refreshListCaches(context: PreloadContext, prefixes: string[]): void {
  for (const prefix of prefixes) {
    const fullKey = buildQueryKey(context.accessToken, prefix, context.scope);
    prefetchedQueries.delete(`data:${fullKey}`);
    prefetchDataQuery(prefix, context);
  }
}
