/**
 * Row 113 — Finance / JPE exactly-once from bank reconciliation
 *
 * Only REVIEWED/RECONCILED legitimate classifications may feed JPE/finance.
 * Prevent FNB import + Xero bank/payment mirror double-counting the same economic event.
 * Never fabricate Job allocation. Never change Xero.
 */

import { allocationAffectsJobProfitability, type BankTransactionAllocationType } from './bank-transaction-control.js';
import type { BankReconciliationState } from './bank-reconciliation-states.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_FINANCE_EXACTLY_ONCE_KEY = 'bank-finance-exactly-once' as const;

export type EconomicEventIdentity = {
  companyId: string;
  /** Prefer shared external/provider identity when both sides present. */
  economicKey: string;
  sources: Array<'fnb_import' | 'xero_bank' | 'xero_payment' | 'manual'>;
};

export function buildEconomicEventKey(input: {
  companyId: string;
  amountCents: number;
  transactionDate: string;
  direction: 'debit' | 'credit';
  externalTransactionId?: string | null;
  xeroBankTransactionId?: string | null;
  reference?: string | null;
  description?: string | null;
}): string {
  if (input.externalTransactionId?.trim() && input.xeroBankTransactionId?.trim()) {
    // Prefer linking both known ids into one economic key
    return [
      input.companyId,
      'linked',
      input.externalTransactionId.trim(),
      input.xeroBankTransactionId.trim(),
    ].join('|');
  }
  if (input.xeroBankTransactionId?.trim()) {
    return [input.companyId, 'xero', input.xeroBankTransactionId.trim()].join('|');
  }
  if (input.externalTransactionId?.trim()) {
    return [input.companyId, 'ext', input.externalTransactionId.trim()].join('|');
  }
  return [
    input.companyId,
    input.transactionDate.slice(0, 10),
    input.direction,
    String(Math.abs(input.amountCents)),
    (input.reference ?? '').trim().toLowerCase(),
    (input.description ?? '').trim().toLowerCase().slice(0, 80),
  ].join('|');
}

/** FNB + Xero duplicate representations → one economic event. */
export function resolveDuplicateEconomicEvents(input: {
  companyId: string;
  events: Array<{
    id: string;
    source: 'fnb_import' | 'xero_bank' | 'xero_payment' | 'manual';
    amountCents: number;
    transactionDate: string;
    direction: 'debit' | 'credit';
    externalTransactionId?: string | null;
    xeroBankTransactionId?: string | null;
    reference?: string | null;
    description?: string | null;
  }>;
}): {
  uniqueEconomicEventCount: number;
  groups: Array<{ economicKey: string; eventIds: string[]; sources: string[] }>;
} {
  const map = new Map<string, { eventIds: string[]; sources: Set<string> }>();

  for (const ev of input.events) {
    // Cross-link: if FNB has same amount/date/ref as a Xero row, coalesce via shared soft key
    // First pass: hard keys
    let key = buildEconomicEventKey({
      companyId: input.companyId,
      amountCents: ev.amountCents,
      transactionDate: ev.transactionDate,
      direction: ev.direction,
      externalTransactionId: ev.externalTransactionId,
      xeroBankTransactionId: ev.xeroBankTransactionId,
      reference: ev.reference,
      description: ev.description,
    });

    // Soft coalesce FNB↔Xero when one side has xero id missing but amount/date/ref match
    if (!ev.xeroBankTransactionId && !ev.externalTransactionId) {
      key = buildEconomicEventKey({
        companyId: input.companyId,
        amountCents: ev.amountCents,
        transactionDate: ev.transactionDate,
        direction: ev.direction,
        reference: ev.reference,
        description: ev.description,
      });
    }

    // Explicit FNB+Xero pair: same amount/date/direction/reference → same soft key
    const soft = [
      input.companyId,
      'soft',
      ev.transactionDate.slice(0, 10),
      ev.direction,
      String(Math.abs(ev.amountCents)),
      (ev.reference ?? '').trim().toLowerCase(),
    ].join('|');

    const useKey =
      ev.source === 'fnb_import' || ev.source === 'xero_bank' || ev.source === 'xero_payment'
        ? soft
        : key;

    const bucket = map.get(useKey) ?? { eventIds: [], sources: new Set<string>() };
    bucket.eventIds.push(ev.id);
    bucket.sources.add(ev.source);
    map.set(useKey, bucket);
  }

  const groups = [...map.entries()].map(([economicKey, v]) => ({
    economicKey,
    eventIds: v.eventIds,
    sources: [...v.sources],
  }));

  return { uniqueEconomicEventCount: groups.length, groups };
}

export function mayFeedFinanceOrJpe(input: {
  reconState: BankReconciliationState | null | undefined;
  allocationType: BankTransactionAllocationType;
  jobId?: string | null;
  fabricateJobAllocation?: boolean;
}): {
  mayFeedFinance: boolean;
  mayFeedJpe: boolean;
  reason: string;
} {
  if (input.fabricateJobAllocation === true) {
    throw new Error('Never fabricate Job allocation');
  }

  const eligible =
    input.reconState === 'REVIEWED' || input.reconState === 'RECONCILED';
  if (!eligible) {
    return {
      mayFeedFinance: false,
      mayFeedJpe: false,
      reason: 'Only REVIEWED/RECONCILED may feed finance/JPE',
    };
  }

  if (input.allocationType === 'customer_payment') {
    return {
      mayFeedFinance: true,
      mayFeedJpe: false,
      reason: 'Customer payment feeds finance/payment truth once — not Job JPE',
    };
  }

  if (input.allocationType === 'overhead' || input.allocationType === 'tax' || input.allocationType === 'transfer') {
    return {
      mayFeedFinance: true,
      mayFeedJpe: false,
      reason: 'General business expense must not become Job cost unless Job-linked',
    };
  }

  if (allocationAffectsJobProfitability(input.allocationType)) {
    if (!input.jobId) {
      return {
        mayFeedFinance: true,
        mayFeedJpe: false,
        reason: 'direct_job_cost requires legitimate Job link',
      };
    }
    return {
      mayFeedFinance: true,
      mayFeedJpe: true,
      reason: 'Job-linked supplier/expense feeds JPE once',
    };
  }

  return {
    mayFeedFinance: true,
    mayFeedJpe: false,
    reason: 'Finance-only classification',
  };
}

/**
 * Given multiple source representations of one economic event, allow at most one JPE post.
 */
export function selectExactlyOnceJpeFeed(input: {
  reconState: BankReconciliationState;
  allocationType: BankTransactionAllocationType;
  jobId: string | null;
  sourceRepresentations: Array<{
    id: string;
    source: 'fnb_import' | 'xero_bank' | 'xero_payment' | 'manual';
    alreadyPostedToJpe: boolean;
  }>;
}): {
  feedFromId: string | null;
  skippedDuplicateIds: string[];
  jpePostCount: 0 | 1;
  xeroWrites: 0;
} {
  const gate = mayFeedFinanceOrJpe({
    reconState: input.reconState,
    allocationType: input.allocationType,
    jobId: input.jobId,
  });
  if (!gate.mayFeedJpe) {
    return {
      feedFromId: null,
      skippedDuplicateIds: input.sourceRepresentations.map((s) => s.id),
      jpePostCount: 0,
      xeroWrites: 0,
    };
  }

  const already = input.sourceRepresentations.find((s) => s.alreadyPostedToJpe);
  if (already) {
    return {
      feedFromId: null,
      skippedDuplicateIds: input.sourceRepresentations
        .filter((s) => s.id !== already.id)
        .map((s) => s.id),
      jpePostCount: 0,
      xeroWrites: 0,
    };
  }

  // Prefer FNB canonical import over Xero mirror when both present
  const preferred =
    input.sourceRepresentations.find((s) => s.source === 'fnb_import') ??
    input.sourceRepresentations[0] ??
    null;

  return {
    feedFromId: preferred?.id ?? null,
    skippedDuplicateIds: input.sourceRepresentations
      .filter((s) => s.id !== preferred?.id)
      .map((s) => s.id),
    jpePostCount: preferred ? 1 : 0,
    xeroWrites: 0,
  };
}

export function assertRow113SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row114PlusStarted?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
  automaticProviderAccountingWrite?: boolean;
}): { row92Off: true; xeroWrites: 0; moneyMovement: 0; automaticProviderAccountingWrite: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row114PlusStarted === true) throw new Error('Rows 114+ must not start during Row 113');
  if (input.automaticProviderAccountingWrite === true) {
    throw new Error('No automatic accounting write to provider');
  }
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 113 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 113 requires money movement = 0');
  return {
    row92Off: true,
    xeroWrites: 0,
    moneyMovement: 0,
    automaticProviderAccountingWrite: false,
  };
}

export function canViewBankFinanceExactlyOnce(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}
