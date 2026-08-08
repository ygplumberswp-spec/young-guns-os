/**
 * Row 132 — Cashflow truth
 *
 * Separates invoiced revenue vs cash received vs spend vs bank balance vs forecast.
 * Never substitutes invoice revenue = cash received.
 * Never treats Xero imported bank data as live authorised bank balance.
 * Unavailable bank balance → unavailable, not R0.
 */

import type { FinanceTruthAvailability, FinanceMoneyTruth } from './finance-page-truth.js';
import { formatFinanceTruthDisplay } from './finance-page-truth.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const CASHFLOW_TRUTH_ROW132_KEY = 'cashflow-truth-row132' as const;

export type CashflowTruthField =
  | 'invoiced_revenue'
  | 'cash_received'
  | 'spend'
  | 'receivables'
  | 'payables'
  | 'authorised_bank_balance'
  | 'net_cash_movement'
  | 'forecast_7_day'
  | 'forecast_30_day'
  | 'payroll_commitments'
  | 'supplier_commitments'
  | 'vat_estimate'
  | 'monthly_target'
  | 'overhead_target';

function money(
  availability: FinanceTruthAvailability,
  amountCents: number | null,
  label: string,
  reason: string | null,
  sourceCount = 0,
): FinanceMoneyTruth {
  return {
    availability,
    amountCents,
    reconciledToSources: availability === 'AVAILABLE' || availability === 'EMPTY',
    sourceCount,
    label,
    reason,
  };
}

export type CashflowTruthProjection = {
  invoicedRevenue: FinanceMoneyTruth;
  cashReceived: FinanceMoneyTruth;
  spend: FinanceMoneyTruth;
  receivables: FinanceMoneyTruth;
  payables: FinanceMoneyTruth;
  authorisedBankBalance: FinanceMoneyTruth;
  netCashMovement: FinanceMoneyTruth;
  forecast7Day: FinanceMoneyTruth;
  forecast30Day: FinanceMoneyTruth;
  payrollCommitments: FinanceMoneyTruth;
  supplierCommitments: FinanceMoneyTruth;
  vatEstimate: FinanceMoneyTruth;
  monthlyTarget: FinanceMoneyTruth;
  overheadTarget: FinanceMoneyTruth;
  /** True when invoiced and cash are distinct fields (never collapsed). */
  invoicedNotSubstitutedForCash: true;
  /** True when Xero bank import is not treated as live balance. */
  xeroBankImportNotLiveBalance: true;
};

export function projectCashflowTruthRow132(input: {
  invoicedRevenueCents?: number | null;
  cashReceivedCents?: number | null;
  spendCents?: number | null;
  receivablesCents?: number | null;
  payablesCents?: number | null;
  /** Authorised/live bank balance from connected feed — not Xero import alone. */
  authorisedBankBalanceCents?: number | null;
  bankBalanceSource?: 'live_feed' | 'manual_authorised' | 'xero_import_only' | 'none';
  netCashMovementCents?: number | null;
  forecast7DayCents?: number | null;
  forecast30DayCents?: number | null;
  payrollCommitmentsCents?: number | null;
  supplierCommitmentsCents?: number | null;
  vatEstimateCents?: number | null;
  monthlyTargetCents?: number | null;
  overheadTargetCents?: number | null;
  xeroImportedBankTransactionCount?: number | null;
}): CashflowTruthProjection {
  const bankSource = input.bankBalanceSource ?? 'none';
  let authorisedBankBalance: FinanceMoneyTruth;
  if (bankSource === 'xero_import_only') {
    authorisedBankBalance = money(
      'NOT_AVAILABLE',
      null,
      'Authorised bank balance',
      `Xero imported bank rows (${input.xeroImportedBankTransactionCount ?? 0}) are not live authorised balance`,
      input.xeroImportedBankTransactionCount ?? 0,
    );
  } else if (bankSource === 'none' || input.authorisedBankBalanceCents == null) {
    authorisedBankBalance = money(
      'NOT_AVAILABLE',
      null,
      'Authorised bank balance',
      'Authorised bank balance unavailable — not R0',
    );
  } else {
    authorisedBankBalance = money(
      'AVAILABLE',
      input.authorisedBankBalanceCents,
      'Authorised bank balance',
      null,
      1,
    );
  }

  const knownOr = (
    cents: number | null | undefined,
    label: string,
    whenMissing: FinanceTruthAvailability = 'INCOMPLETE',
  ): FinanceMoneyTruth => {
    if (cents == null) return money(whenMissing, null, label, `${label} unavailable`);
    return money('AVAILABLE', cents, label, null);
  };

  return {
    invoicedRevenue: knownOr(input.invoicedRevenueCents, 'Invoiced revenue'),
    cashReceived: knownOr(input.cashReceivedCents, 'Cash received'),
    spend: knownOr(input.spendCents, 'Spend'),
    receivables: knownOr(input.receivablesCents, 'Receivables'),
    payables: knownOr(input.payablesCents, 'Payables'),
    authorisedBankBalance,
    netCashMovement: knownOr(input.netCashMovementCents, 'Net cash movement'),
    forecast7Day: knownOr(input.forecast7DayCents, '7-day forecast', 'NOT_AVAILABLE'),
    forecast30Day: knownOr(input.forecast30DayCents, '30-day forecast', 'NOT_AVAILABLE'),
    payrollCommitments: knownOr(input.payrollCommitmentsCents, 'Payroll commitments', 'NOT_AVAILABLE'),
    supplierCommitments: knownOr(
      input.supplierCommitmentsCents,
      'Supplier commitments',
      'NOT_AVAILABLE',
    ),
    vatEstimate: knownOr(input.vatEstimateCents, 'VAT estimate', 'NOT_AVAILABLE'),
    monthlyTarget: knownOr(input.monthlyTargetCents, 'Monthly target', 'NOT_AVAILABLE'),
    overheadTarget: knownOr(input.overheadTargetCents, 'Overhead target', 'NOT_AVAILABLE'),
    invoicedNotSubstitutedForCash: true,
    xeroBankImportNotLiveBalance: true,
  };
}

export function assertCashflowLayersNotCollapsed(truth: CashflowTruthProjection): void {
  if (!truth.invoicedNotSubstitutedForCash) {
    throw new Error('Invoiced revenue must not substitute for cash received');
  }
  if (!truth.xeroBankImportNotLiveBalance) {
    throw new Error('Xero bank import must not be treated as live bank balance');
  }
  // Distinct field objects — values may coincidentally match but fields stay separate.
  if (truth.invoicedRevenue.label === truth.cashReceived.label) {
    throw new Error('Invoiced and cash labels must remain distinct');
  }
}

export function displayCashflowField(truth: FinanceMoneyTruth): string {
  return formatFinanceTruthDisplay(truth);
}

export function assertRow132SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  treatedXeroImportAsLiveBalance?: boolean;
  substitutedInvoiceForCash?: boolean;
}): { row92Off: true; xeroWrites: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 132 Xero writes must be 0');
  if (input.treatedXeroImportAsLiveBalance) {
    throw new Error('Xero imported bank data must not equal live bank balance');
  }
  if (input.substitutedInvoiceForCash) {
    throw new Error('Invoice revenue must not equal cash received by substitution');
  }
  return { row92Off: true, xeroWrites: 0 };
}
