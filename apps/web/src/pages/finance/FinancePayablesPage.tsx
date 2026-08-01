import { useMemo } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageLoadState, Panel, StatCard } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { fetchPayablesIntelligence } from '../../lib/finance-intelligence-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance } from '../../features/finance/utils';
import { PageHeader, SummaryCardGrid } from '../../components/ux';

export function FinancePayablesPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);

  const { data: payables, error, isLoading } = useStaffCachedQuery({
    queryKey: 'finance/payables-workspace',
    enabled: canView,
    fetcher: async () => fetchPayablesIntelligence(accessToken!),
  });

  if (!canView) {
    return (
      <div className="finance-page owner-page-content">
        <PageHeader title="Bills & Payables" description="You do not have permission to view payables." />
      </div>
    );
  }

  const currency = payables?.currency ?? 'ZAR';
  const fmt = (cents: number) => formatMoney(cents, currency);
  const hasPoCommitments = (payables?.poCashRequirementCents ?? 0) > 0;
  const holdValue = '—';

  return (
    <div className="finance-page owner-page-content">
      <FinanceNav />
      <PageHeader
        title="Bills & Payables"
        description="Supplier bills and payables — Xero ACCPAY import requires Owner approval; procurement commitments shown where available."
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: 'Bills & Payables', href: '/finance/payables' },
        ]}
      />

      <PageLoadState isLoading={isLoading && !payables} error={error ?? null} loadingLabel="Loading payables…">
        {payables ? (
          <>
            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="Supplier bills outstanding"
                value={payables.accpayAvailable ? fmt(payables.supplierBillsOutstandingCents ?? 0) : holdValue}
                hint="Xero ACCPAY bills — import route not yet live"
              />
              <StatCard
                label="Overdue bills"
                value={payables.accpayAvailable ? fmt(payables.overdueBillsCents ?? 0) : holdValue}
                hint="Requires ACCPAY parity"
              />
              <StatCard
                label="Due in 7 days"
                value={payables.accpayAvailable ? fmt(payables.dueIn7DaysCents ?? 0) : holdValue}
                hint="Requires ACCPAY parity"
              />
              <StatCard
                label="Due in 30 days"
                value={payables.accpayAvailable ? fmt(payables.dueIn30DaysCents ?? 0) : holdValue}
                hint="Requires ACCPAY parity"
              />
            </SummaryCardGrid>

            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="PO cash requirement"
                value={hasPoCommitments ? fmt(payables.poCashRequirementCents) : holdValue}
                hint="Approved/ordered purchase orders only"
              />
              <StatCard
                label="Unapproved purchases"
                value={payables.unapprovedPurchaseCount > 0 ? String(payables.unapprovedPurchaseCount) : holdValue}
                hint="Draft purchase orders awaiting approval"
              />
              <StatCard
                label="Unmatched bank transactions"
                value={payables.unmatchedBankTransactionCount > 0 ? String(payables.unmatchedBankTransactionCount) : holdValue}
                hint="Xero bank tx in sync logs — not reconciled to bills"
              />
              <StatCard
                label="Cash requirement (partial)"
                value={hasPoCommitments ? fmt(payables.poCashRequirementCents) : holdValue}
                hint="Not full payables picture without ACCPAY"
              />
            </SummaryCardGrid>

            <Panel title="Bills workspace" className="owner-page-content__section">
              {payables.accpayAvailable ? (
                <EmptyState
                  title="No supplier bills"
                  description="When Xero ACCPAY bills are imported, supplier payables appear here."
                />
              ) : (
                <EmptyState
                  title="Xero ACCPAY bills — Owner approval required"
                  description="Supplier bills from Xero are not imported into a dedicated payables table yet. Procurement purchase-order commitments and bank transaction sync logs are the only payables signals available today."
                />
              )}
              <p className="finance-cashflow-summary">{payables.summary}</p>
              <div className="finance-cashflow-links">
                <Link href="/procurement/purchase-orders">Purchase orders</Link>
                <Link href="/finance/cashflow">Cashflow</Link>
                <Link href="/integrations">Integrations (Xero sync status)</Link>
              </div>
            </Panel>

            <p className="finance-source-note">
              Source: partial — procurement POs + {payables.unmatchedBankTransactionCount} bank tx sync log(s) · Full ACCPAY parity tracked in XERO_TITAN_FULL_PARITY_MATRIX.md
            </p>
          </>
        ) : null}
      </PageLoadState>
    </div>
  );
}
