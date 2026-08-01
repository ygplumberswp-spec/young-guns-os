import { useMemo } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageLoadState, Panel, StatCard } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { fetchCashFlowIntelligence } from '../../lib/finance-intelligence-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance } from '../../features/finance/utils';
import { PageHeader, SummaryCardGrid } from '../../components/ux';

export function FinancePayablesPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);

  const { data: cashFlow, error, isLoading } = useStaffCachedQuery({
    queryKey: 'finance/payables-workspace',
    enabled: canView,
    fetcher: async () => fetchCashFlowIntelligence(accessToken!),
  });

  if (!canView) {
    return (
      <div className="finance-page owner-page-content">
        <PageHeader title="Bills & Payables" description="You do not have permission to view payables." />
      </div>
    );
  }

  const currency = cashFlow?.currency ?? 'ZAR';
  const fmt = (cents: number) => formatMoney(cents, currency);
  const hasPoCommitments = (cashFlow?.outstandingPayableCents ?? 0) > 0;

  return (
    <div className="finance-page owner-page-content">
      <FinanceNav />
      <PageHeader
        title="Bills & Payables"
        description="Supplier bills and payables — Xero ACCPAY import is not yet wired; procurement commitments shown where available."
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: 'Bills & Payables', href: '/finance/payables' },
        ]}
      />

      <PageLoadState isLoading={isLoading && !cashFlow} error={error ?? null} loadingLabel="Loading payables…">
        {cashFlow ? (
          <>
            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="Supplier bills outstanding"
                value="—"
                hint="Xero ACCPAY bills — import route not yet live"
              />
              <StatCard label="Overdue bills" value="—" hint="Requires ACCPAY parity" />
              <StatCard label="Due in 7 days" value="—" hint="Requires ACCPAY parity" />
              <StatCard label="Due in 30 days" value="—" hint="Requires ACCPAY parity" />
            </SummaryCardGrid>

            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="PO cash requirement"
                value={hasPoCommitments ? fmt(cashFlow.outstandingPayableCents) : '—'}
                hint="Approved/ordered purchase orders only"
              />
              <StatCard label="Unapproved purchases" value="—" hint="Procurement Phase 9" />
              <StatCard label="Unmatched bank transactions" value="—" hint="Xero bank tx reconciliation — read-only" />
              <StatCard label="Cash requirement (partial)" value={hasPoCommitments ? fmt(cashFlow.outstandingPayableCents) : '—'} hint="Not full payables picture" />
            </SummaryCardGrid>

            <Panel title="Bills workspace" className="owner-page-content__section">
              <EmptyState
                title="Xero ACCPAY bills — Phase 3C completion"
                description="Supplier bills from Xero are not imported into a dedicated payables table yet. Procurement purchase-order commitments are the only payables signal available today."
              />
              <div className="finance-cashflow-links">
                <Link href="/procurement/purchase-orders">Purchase orders</Link>
                <Link href="/finance/cashflow">Cashflow</Link>
                <Link href="/integrations">Integrations (Xero sync status)</Link>
              </div>
            </Panel>

            <p className="finance-source-note">
              Source: partial — procurement POs only · Full ACCPAY parity tracked in XERO_TITAN_FULL_PARITY_MATRIX.md
            </p>
          </>
        ) : null}
      </PageLoadState>
    </div>
  );
}
