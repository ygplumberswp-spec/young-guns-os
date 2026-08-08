/**
 * Row 119 — Finance page truth (Receivables / Bills & Payables / Cashflow)
 *
 * No false R0. Absent/unsupported sources surface UNKNOWN / NOT AVAILABLE /
 * NOT CONNECTED / INCOMPLETE. Totals must reconcile to canonical source rows.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const FINANCE_PAGE_TRUTH_KEY = 'finance-page-truth' as const;

export type FinanceTruthAvailability =
  | 'AVAILABLE'
  | 'EMPTY'
  | 'INCOMPLETE'
  | 'NOT_CONNECTED'
  | 'NOT_AVAILABLE'
  | 'UNKNOWN';

export type FinanceMoneyTruth = {
  availability: FinanceTruthAvailability;
  amountCents: number | null;
  /** True only when amountCents is a reconciled sum of known source rows. */
  reconciledToSources: boolean;
  sourceCount: number;
  label: string;
  reason: string | null;
};

export type ReceivablesTruthInput = {
  invoices: Array<{
    id: string;
    status: string;
    balanceDueCents: number | null;
    isOverdue?: boolean;
    sourceProvider?: string | null;
  }>;
  xeroConnected: boolean | null;
};

export type PayablesTruthInput = {
  /** Canonical Xero ACCPAY / bill rows when imported. */
  bills: Array<{
    id: string;
    amountDueCents: number | null;
    status: string;
  }>;
  xeroBillsImportSupported: boolean;
  xeroConnected: boolean | null;
};

export type CashflowTruthInput = {
  bankTransactionCount: number | null;
  bankFeedMode?: string | null;
  cashControlCompleteness?: 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE' | null;
  knownMoneyInCents: number | null;
  knownMoneyOutCents: number | null;
  bankConnectedOrImportReady: boolean;
};

function sumKnown(values: Array<number | null | undefined>): {
  sum: number;
  knownCount: number;
  missing: number;
} {
  let sum = 0;
  let knownCount = 0;
  let missing = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) missing += 1;
    else {
      sum += v;
      knownCount += 1;
    }
  }
  return { sum, knownCount, missing };
}

/** No false R0: empty set with connected source → EMPTY (amount 0, labelled empty). */
export function projectReceivablesTruth(input: ReceivablesTruthInput): {
  totalOutstanding: FinanceMoneyTruth;
  overdue: FinanceMoneyTruth;
  availability: FinanceTruthAvailability;
} {
  if (input.xeroConnected === false && input.invoices.length === 0) {
    const unavailable: FinanceMoneyTruth = {
      availability: 'NOT_CONNECTED',
      amountCents: null,
      reconciledToSources: false,
      sourceCount: 0,
      label: 'Receivables',
      reason: 'Finance source not connected; outstanding is not R0 by assumption',
    };
    return { totalOutstanding: unavailable, overdue: unavailable, availability: 'NOT_CONNECTED' };
  }

  const open = input.invoices.filter(
    (i) => !['cancelled', 'voided', 'paid', 'draft'].includes(i.status),
  );
  const balances = sumKnown(open.map((i) => i.balanceDueCents));
  const overdueRows = open.filter((i) => i.isOverdue === true);
  const overdueSum = sumKnown(overdueRows.map((i) => i.balanceDueCents));

  if (input.invoices.length === 0) {
    const empty: FinanceMoneyTruth = {
      availability: 'EMPTY',
      amountCents: 0,
      reconciledToSources: true,
      sourceCount: 0,
      label: 'Receivables',
      reason: 'No invoice source rows; empty set totals 0 (not assumed unknown)',
    };
    return { totalOutstanding: empty, overdue: empty, availability: 'EMPTY' };
  }

  const incomplete = balances.missing > 0;
  const totalOutstanding: FinanceMoneyTruth = {
    availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
    amountCents: incomplete ? null : balances.sum,
    reconciledToSources: !incomplete,
    sourceCount: open.length,
    label: 'Receivables outstanding',
    reason: incomplete ? 'Some invoice balances unknown' : null,
  };
  const overdue: FinanceMoneyTruth = {
    availability: overdueSum.missing > 0 ? 'INCOMPLETE' : 'AVAILABLE',
    amountCents: overdueSum.missing > 0 ? null : overdueSum.sum,
    reconciledToSources: overdueSum.missing === 0,
    sourceCount: overdueRows.length,
    label: 'Overdue receivables',
    reason: overdueSum.missing > 0 ? 'Some overdue balances unknown' : null,
  };
  return {
    totalOutstanding,
    overdue,
    availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
  };
}

export function projectPayablesTruth(input: PayablesTruthInput): {
  totalDue: FinanceMoneyTruth;
  availability: FinanceTruthAvailability;
} {
  if (!input.xeroBillsImportSupported) {
    return {
      totalDue: {
        availability: 'NOT_AVAILABLE',
        amountCents: null,
        reconciledToSources: false,
        sourceCount: 0,
        label: 'Bills & Payables',
        reason: 'Supplier bills import not supported in this workspace path',
      },
      availability: 'NOT_AVAILABLE',
    };
  }
  if (input.xeroConnected === false && input.bills.length === 0) {
    return {
      totalDue: {
        availability: 'NOT_CONNECTED',
        amountCents: null,
        reconciledToSources: false,
        sourceCount: 0,
        label: 'Bills & Payables',
        reason: 'Xero not connected; payables are not R0 by assumption',
      },
      availability: 'NOT_CONNECTED',
    };
  }
  if (input.bills.length === 0) {
    return {
      totalDue: {
        availability: 'EMPTY',
        amountCents: 0,
        reconciledToSources: true,
        sourceCount: 0,
        label: 'Bills & Payables',
        reason: 'No bill source rows',
      },
      availability: 'EMPTY',
    };
  }
  const due = sumKnown(input.bills.map((b) => b.amountDueCents));
  return {
    totalDue: {
      availability: due.missing > 0 ? 'INCOMPLETE' : 'AVAILABLE',
      amountCents: due.missing > 0 ? null : due.sum,
      reconciledToSources: due.missing === 0,
      sourceCount: input.bills.length,
      label: 'Bills & Payables due',
      reason: due.missing > 0 ? 'Some bill amounts unknown' : null,
    },
    availability: due.missing > 0 ? 'INCOMPLETE' : 'AVAILABLE',
  };
}

export function projectCashflowTruth(input: CashflowTruthInput): {
  moneyIn: FinanceMoneyTruth;
  moneyOut: FinanceMoneyTruth;
  availability: FinanceTruthAvailability;
} {
  if (!input.bankConnectedOrImportReady && (input.bankTransactionCount ?? 0) === 0) {
    const na: FinanceMoneyTruth = {
      availability: 'NOT_CONNECTED',
      amountCents: null,
      reconciledToSources: false,
      sourceCount: 0,
      label: 'Cashflow',
      reason: 'Bank feed/import not connected; cashflow is not R0 by assumption',
    };
    return { moneyIn: na, moneyOut: na, availability: 'NOT_CONNECTED' };
  }
  if (input.bankTransactionCount === null) {
    const unk: FinanceMoneyTruth = {
      availability: 'UNKNOWN',
      amountCents: null,
      reconciledToSources: false,
      sourceCount: 0,
      label: 'Cashflow',
      reason: 'Bank transaction count unknown',
    };
    return { moneyIn: unk, moneyOut: unk, availability: 'UNKNOWN' };
  }
  if (input.bankTransactionCount === 0) {
    const empty: FinanceMoneyTruth = {
      availability: 'EMPTY',
      amountCents: 0,
      reconciledToSources: true,
      sourceCount: 0,
      label: 'Cashflow',
      reason: 'No bank transactions in period',
    };
    return { moneyIn: empty, moneyOut: empty, availability: 'EMPTY' };
  }
  const incomplete =
    input.cashControlCompleteness === 'INCOMPLETE' ||
    input.knownMoneyInCents == null ||
    input.knownMoneyOutCents == null;
  return {
    moneyIn: {
      availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
      amountCents: input.knownMoneyInCents,
      reconciledToSources: input.knownMoneyInCents != null,
      sourceCount: input.bankTransactionCount,
      label: 'Money in',
      reason: incomplete ? 'Cash control incomplete' : null,
    },
    moneyOut: {
      availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
      amountCents: input.knownMoneyOutCents,
      reconciledToSources: input.knownMoneyOutCents != null,
      sourceCount: input.bankTransactionCount,
      label: 'Money out',
      reason: incomplete ? 'Cash control incomplete' : null,
    },
    availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
  };
}

export function formatFinanceTruthDisplay(truth: FinanceMoneyTruth): string {
  if (truth.availability === 'NOT_CONNECTED') return 'NOT CONNECTED';
  if (truth.availability === 'NOT_AVAILABLE') return 'NOT AVAILABLE';
  if (truth.availability === 'UNKNOWN') return 'UNKNOWN';
  if (truth.availability === 'INCOMPLETE') return 'INCOMPLETE';
  if (truth.amountCents == null) return 'UNKNOWN';
  return String(truth.amountCents);
}

export function canViewFinancePageTruth(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role.includes('tech') || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertRow119SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
}): { row92Off: true; xeroWrites: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 119 requires Xero writes = 0');
  return { row92Off: true, xeroWrites: 0 };
}
