import { FinancePhaseHoldPage } from '../../features/finance/FinancePhaseHoldPage';

export function FinanceCashflowPage() {
  return (
    <FinancePhaseHoldPage
      title="Cashflow"
      phase="Phase 3"
      description="Cash position, inflows, and outflows — aggregated from Xero bank transactions."
      blockedReason="Cashflow dashboard requires Receivables/Payables routes and payment ledger parity first."
    />
  );
}
