import { FinancePhaseHoldPage } from '../../features/finance/FinancePhaseHoldPage';

export function FinancePayablesPage() {
  return (
    <FinancePhaseHoldPage
      title="Bills & Payables"
      phase="Phase 3"
      description="Supplier bills and payables — sourced from Xero ACCPAY when connected."
      blockedReason="Bills import and payables workspace are not wired to a dedicated route yet."
    />
  );
}
