import { FinancePhaseHoldPage } from '../../features/finance/FinancePhaseHoldPage';

export function FinanceReceivablesPage() {
  return (
    <FinancePhaseHoldPage
      title="Receivables"
      phase="Phase 3"
      description="Outstanding invoices, aging, and who owes us — sourced from Xero when connected."
      blockedReason="Receivables aggregation and Xero payment_mappings parity are not complete yet."
    />
  );
}
