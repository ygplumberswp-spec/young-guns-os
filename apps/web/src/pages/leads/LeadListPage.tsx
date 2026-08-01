import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchLeads, fetchLeadStats } from '../../lib/leads-api';
import { canAccessLeads, canConvertLeads, canManageLeads } from '../../features/leads/utils';
import { LeadListTable } from '../../features/leads/LeadListTable';

export function LeadListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const canView = useMemo(() => (user ? canAccessLeads(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageLeads(user.permissions) : false), [user]);
  const canConvert = useMemo(() => (user ? canConvertLeads(user.permissions) : false), [user]);

  const {
    data: leads,
    error,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: `leads/list:${q}:${overdueOnly ? 1 : 0}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () =>
      fetchLeads(accessToken!, {
        q: q.trim() || undefined,
        overdueOnly,
      }),
  });

  const { data: stats } = useCachedQuery({
    queryKey: 'leads/stats',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchLeadStats(accessToken!),
  });

  if (!canView) {
    return (
      <div className="page-shell">
        <PageHeader title="Leads" description="You do not have permission to view leads." />
      </div>
    );
  }

  return (
    <div className="page-shell leads-page">
      <PageHeader
        title="Leads"
        description="Intake, qualify and convert enquiries into customers, properties and jobs."
        actions={
          canWrite ? (
            <Link href="/leads/new">
              <Button variant="primary" size="sm">
                Add lead
              </Button>
            </Link>
          ) : null
        }
      />

      {stats ? (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card__label">Active</span>
            <strong className="stat-card__value">{stats.activeLeadCount}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Overdue follow-ups</span>
            <strong className="stat-card__value">{stats.overdueFollowUpCount}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Converted</span>
            <strong className="stat-card__value">{stats.convertedLeadCount}</strong>
          </div>
        </div>
      ) : null}

      <LeadListTable
        leads={leads ?? []}
        isLoading={isLoading}
        error={error}
        canWrite={canWrite}
        canConvert={canConvert}
        accessToken={accessToken}
        search={q}
        onSearchChange={setQ}
        overdueOnly={overdueOnly}
        onOverdueOnlyChange={setOverdueOnly}
        onRefresh={async () => {
          await refetch();
        }}
      />
    </div>
  );
}
