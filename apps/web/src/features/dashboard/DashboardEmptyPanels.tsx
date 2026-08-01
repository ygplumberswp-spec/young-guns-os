import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { fetchTodaysJobs } from '../../lib/jobs-api';
import { fetchFinanceStats } from '../../lib/finance-api';
import { fetchInventoryStats } from '../../lib/inventory-api';
import { fetchLeadStats } from '../../lib/leads-api';
import { useAuth } from '../../lib/auth-context';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardPanelEmptyIcon } from './DashboardPanelEmptyIcon';

type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

/** UX-012 — Upcoming Work lists today's scheduled jobs from live TITAN data. */
export function DashboardEmptyPanels() {
  const { accessToken, user } = useAuth();
  const { formatMoney, currency: companyCurrency } = useCompanyLocale();
  const canViewJobs = Boolean(
    user && hasAnyPermission(user.permissions, ['jobs:read', 'jobs:write']),
  );
  const canViewFinance = Boolean(
    user && hasAnyPermission(user.permissions, ['finance:read', 'finance:write']),
  );
  const canViewInventory = Boolean(
    user && hasAnyPermission(user.permissions, ['inventory:read', 'inventory:write']),
  );
  const canViewLeads = Boolean(
    user && hasAnyPermission(user.permissions, ['leads:read', 'leads:write']),
  );

  const todayJobs = useStaffCachedQuery({
    queryKey: 'jobs/today',
    enabled: Boolean(accessToken && canViewJobs),
    fetcher: async () => fetchTodaysJobs(accessToken!),
  });
  const financeStats = useStaffCachedQuery({
    queryKey: 'finance/stats',
    enabled: Boolean(accessToken && canViewFinance),
    fetcher: async () => fetchFinanceStats(accessToken!),
  });
  const inventoryStats = useStaffCachedQuery({
    queryKey: 'inventory/stats',
    enabled: Boolean(accessToken && canViewInventory),
    fetcher: async () => fetchInventoryStats(accessToken!),
  });
  const leadStats = useStaffCachedQuery({
    queryKey: 'leads/stats',
    enabled: Boolean(accessToken && canViewLeads),
    fetcher: async () => fetchLeadStats(accessToken!),
  });

  const jobs = todayJobs.data ?? [];
  const attentionItems: AttentionItem[] = [];

  if (canViewFinance && financeStats.data) {
    if (financeStats.data.overdueInvoiceCount > 0) {
      attentionItems.push({
        id: 'overdue-invoices',
        label: `${financeStats.data.overdueInvoiceCount} overdue invoice(s)`,
        detail: 'Review past-due balances and follow up with customers.',
        href: '/finance/invoices?overdueOnly=1',
      });
    }
    if (financeStats.data.outstandingCents > 0) {
      attentionItems.push({
        id: 'outstanding-ar',
        label: `${formatMoney(financeStats.data.outstandingCents, financeStats.data.currency ?? companyCurrency)} outstanding`,
        detail: 'Open invoice balances still awaiting payment.',
        href: '/finance/invoices',
      });
    }
  }

  if (canViewInventory && inventoryStats.data && inventoryStats.data.lowStockCount > 0) {
    attentionItems.push({
      id: 'stock-alerts',
      label: `${inventoryStats.data.lowStockCount} stock alert(s)`,
      detail: 'Items at or below reorder level need replenishment.',
      href: '/inventory/products',
    });
  }

  if (canViewLeads && leadStats.data && leadStats.data.activeLeadCount > 0) {
    attentionItems.push({
      id: 'active-leads',
      label: `${leadStats.data.activeLeadCount} active lead(s)`,
      detail: 'Open leads still in the pipeline.',
      href: '/leads',
    });
  }

  const attentionLoading =
    (canViewFinance && financeStats.isLoading && !financeStats.data) ||
    (canViewInventory && inventoryStats.isLoading && !inventoryStats.data) ||
    (canViewLeads && leadStats.isLoading && !leadStats.data);

  return (
    <section className="dashboard-panels">
      <Panel
        title="Upcoming Work"
        description="Scheduled and in-progress jobs for today"
      >
        {!canViewJobs ? (
          <EmptyState
            title="Jobs not available"
            description="You do not have permission to view today's schedule."
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
          />
        ) : todayJobs.isLoading && !todayJobs.data ? (
          <LoadingState label="Loading today's jobs…" />
        ) : todayJobs.error ? (
          <EmptyState
            title="Unable to load today's jobs"
            description={todayJobs.error}
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              <Button size="sm" variant="secondary" onClick={() => void todayJobs.refetch()}>
                Retry
              </Button>
            }
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Nothing scheduled today"
            description="Scheduled jobs for today will appear here once assigned."
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              <Link href="/jobs/new">
                <Button size="sm" variant="secondary">
                  Schedule job
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="portal-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`}>
                  <strong>
                    {job.jobNumber ? `${job.jobNumber} · ` : ''}
                    {job.title}
                  </strong>
                </Link>
                <span>
                  {job.customerName}
                  {job.addressDisplay ? ` · ${job.addressDisplay}` : ''}
                  {job.scheduledAt
                    ? ` · ${new Date(job.scheduledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                  {` · ${job.status.replace(/_/g, ' ')}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Attention" description="Operational signals that need a look">
        {!canViewFinance && !canViewInventory && !canViewLeads ? (
          <EmptyState
            title="No attention signals available"
            description="You do not have permission to view finance, inventory, or lead signals."
            icon={<DashboardPanelEmptyIcon panelId="recent-activity" />}
            className="dashboard-panel-empty titan-empty-state--compact"
          />
        ) : attentionLoading ? (
          <LoadingState label="Loading attention signals…" />
        ) : attentionItems.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            description="Overdue invoices, stock alerts, and active leads will appear here when they need action."
            icon={<DashboardPanelEmptyIcon panelId="recent-activity" />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              <Link href="/global-search">
                <Button size="sm" variant="secondary">
                  Search workspace
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="portal-list">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <Link href={item.href}>
                  <strong>{item.label}</strong>
                </Link>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
