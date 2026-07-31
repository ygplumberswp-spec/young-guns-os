import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader, Panel } from '@titan/ui';
import { LEAD_STATUS_OPTIONS } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchLeads, fetchLeadStats } from '../../lib/leads-api';
import { canAccessLeads, canManageLeads } from '../../features/leads/utils';

export function LeadListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const canView = useMemo(() => (user ? canAccessLeads(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageLeads(user.permissions) : false), [user]);

  const {
    data: leads,
    error,
    isLoading,
  } = useCachedQuery({
    queryKey: `leads/list:${q}:${status}:${overdueOnly ? 1 : 0}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () =>
      fetchLeads(accessToken!, {
        q: q.trim() || undefined,
        status: (status || undefined) as never,
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

      <Panel title="Lead registry">
        <div className="leads-toolbar">
          <input
            className="input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, mobile, email, suburb…"
            aria-label="Search leads"
          />
          <select
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {LEAD_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="leads-toolbar__check">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            Overdue only
          </label>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {isLoading ? <LoadingState label="Loading leads…" /> : null}

        {!isLoading && (leads?.length ?? 0) === 0 ? (
          <EmptyState
            title={q || status || overdueOnly ? 'No matching leads' : 'No leads yet'}
            description={
              canWrite
                ? 'Add a lead to capture an enquiry without retyping later at conversion.'
                : 'No leads are available for your role.'
            }
          />
        ) : null}

        {(leads?.length ?? 0) > 0 ? (
          <div className="table-scroll">
            <table className="data-table leads-table">
              <thead>
                <tr>
                  <th>Contact / company</th>
                  <th>Mobile</th>
                  <th>Suburb / address</th>
                  <th>Service</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Next action</th>
                  <th>Age</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {leads!.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads/${lead.id}`} className="table-link">
                        {lead.companyName || lead.contactName}
                      </Link>
                      {lead.companyName ? (
                        <div className="muted-text">{lead.contactName}</div>
                      ) : null}
                    </td>
                    <td>{lead.contactPhoneE164 || lead.contactPhone || '—'}</td>
                    <td>{lead.suburb || lead.addressDisplay || '—'}</td>
                    <td>{lead.serviceType || '—'}</td>
                    <td>{lead.sourceName || '—'}</td>
                    <td>
                      {LEAD_STATUS_OPTIONS.find((option) => option.value === lead.status)?.label ??
                        lead.status}
                      {lead.isOverdue ? <span className="badge-warn"> Overdue</span> : null}
                    </td>
                    <td>{lead.urgency}</td>
                    <td>{lead.assignedUserName || '—'}</td>
                    <td>
                      {lead.nextAction || '—'}
                      {lead.nextActionDueAt
                        ? ` · ${new Date(lead.nextActionDueAt).toLocaleDateString()}`
                        : ''}
                    </td>
                    <td>{lead.ageDays}d</td>
                    <td>
                      {lead.jobId ? (
                        <Link href={`/jobs/${lead.jobId}`} className="table-link">
                          {lead.jobNumber || 'Job'}
                        </Link>
                      ) : lead.customerId ? (
                        <Link href={`/crm/${lead.customerId}`} className="table-link">
                          Customer
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
