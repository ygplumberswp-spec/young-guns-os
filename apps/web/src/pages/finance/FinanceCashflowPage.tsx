import { useMemo } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel, StatCard } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { fetchCashFlowIntelligence } from '../../lib/finance-intelligence-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance } from '../../features/finance/utils';
import { PageHeader, SummaryCardGrid } from '../../components/ux';

export function FinanceCashflowPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);

  const { data: cashFlow, error, isLoading } = useStaffCachedQuery({
    queryKey: 'finance/cashflow-workspace',
    enabled: canView,
    fetcher: async () => fetchCashFlowIntelligence(accessToken!),
  });

  if (!canView) {
    return (
      <div className="finance-page owner-page-content">
        <PageHeader title="Cashflow" description="You do not have permission to view cashflow." />
      </div>
    );
  }

  const currency = cashFlow?.currency ?? 'ZAR';
  const fmt = (cents: number) => formatMoney(cents, currency);

  return (
    <div className="finance-page owner-page-content">
      <FinanceNav />
      <PageHeader
        title="Cashflow"
        description="Cash received, money spent, receivables and payables — invoiced revenue is kept separate from cash."
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: 'Cashflow', href: '/finance/cashflow' },
        ]}
      />

      <PageLoadState isLoading={isLoading && !cashFlow} error={error ?? null} loadingLabel="Loading cashflow…">
        {cashFlow ? (
          <>
            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard label="Cash received (MTD)" value={fmt(cashFlow.inflowCents)} hint="Payments recorded this month" />
              <StatCard label="Money spent (commitments)" value={fmt(cashFlow.outflowCents)} hint="Open purchase orders — not Xero ACCPAY bills" />
              <StatCard label="Receivables outstanding" value={fmt(cashFlow.outstandingReceivableCents)} hint="Invoiced but not yet collected" />
              <StatCard label="Payables outstanding" value={fmt(cashFlow.outstandingPayableCents)} hint="Procurement PO commitments" />
            </SummaryCardGrid>

            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard label="7-day forecast" value={fmt(cashFlow.weeklyForecastCents)} hint="Estimated net position" />
              <StatCard label="30-day forecast" value={fmt(cashFlow.monthlyForecastCents)} hint="Estimated net position" />
              <StatCard
                label="Bank balance"
                value="—"
                hint="Bank balance requires authorised Xero bank feed — Phase 3D completion"
              />
              <StatCard
                label="Net cash movement"
                value={fmt(cashFlow.inflowCents - cashFlow.outflowCents)}
                hint="Cash in minus committed outflows"
              />
            </SummaryCardGrid>

            <Panel title="Cashflow summary" className="owner-page-content__section">
              <p className="finance-cashflow-summary">{cashFlow.summary}</p>
              {cashFlow.cashShortageWarning ? (
                <p className="finance-cashflow-warning">Shortage warning — review receivables and payables.</p>
              ) : null}
              <div className="finance-cashflow-links">
                <Link href="/finance/receivables">Receivables</Link>
                <Link href="/finance/payables">Bills &amp; Payables</Link>
                <Link href="/finance/payments">Payments (cash received)</Link>
                <Link href="/finance/invoices">Invoices (invoiced revenue)</Link>
              </div>
            </Panel>

            <Panel title="Phase 3D — remaining items" className="owner-page-content__section">
              <ul className="finance-hold-list">
                <li>Payroll commitments — HR Phase 12</li>
                <li>Supplier bills (Xero ACCPAY) — dedicated import route required</li>
                <li>VAT/tax estimate — requires tax rate parity</li>
                <li>Monthly/overhead targets — Finance Intelligence budgets</li>
              </ul>
            </Panel>

            <p className="finance-source-note">
              Source: TITAN finance intelligence · Invoiced revenue and cash received are reported separately
            </p>
          </>
        ) : null}
      </PageLoadState>
    </div>
  );
}
