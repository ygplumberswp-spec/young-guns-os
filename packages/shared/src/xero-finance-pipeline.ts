/**
 * Pure helpers for Xero → TITAN finance data pipeline.
 * No invented financial values — empty/zero when inputs are empty.
 */

export type XeroFinanceLineItemInput = {
  lineItemId?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitAmount?: number | null;
  lineAmount?: number | null;
  taxAmount?: number | null;
  accountCode?: string | null;
};

export type XeroFinanceMappedLineItem = {
  position: number;
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
  vatRateBps: number;
  accountCode: string | null;
  sourceExternalId: string | null;
  category: 'other';
};

export type XeroFinanceMonthlyPoint = {
  month: string;
  amountCents: number;
};

export type XeroFinanceDashboardSnapshot = {
  revenueCents: number;
  outstandingCents: number;
  paidCents: number;
  overdueCents: number;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  overdueInvoiceCount: number;
  quotePipelineCents: number;
  quotePipelineCount: number;
  monthlyTurnover: XeroFinanceMonthlyPoint[];
  paymentTrends: XeroFinanceMonthlyPoint[];
};

export function normalizeContactEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function normalizeContactPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Prefer Xero contact ID mapping; then email; then phone — never invent a match. */
export function pickCustomerMatchCandidate(input: {
  mappedCustomerId?: string | null;
  emailMatchCustomerId?: string | null;
  phoneMatchCustomerId?: string | null;
}): { customerId: string; matchType: 'xero_id' | 'email' | 'phone' } | null {
  if (input.mappedCustomerId) {
    return { customerId: input.mappedCustomerId, matchType: 'xero_id' };
  }
  if (input.emailMatchCustomerId) {
    return { customerId: input.emailMatchCustomerId, matchType: 'email' };
  }
  if (input.phoneMatchCustomerId) {
    return { customerId: input.phoneMatchCustomerId, matchType: 'phone' };
  }
  return null;
}

export function mapXeroQuoteStatus(
  xeroStatus: string | null | undefined,
): 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'cancelled' {
  const status = (xeroStatus ?? '').toUpperCase();
  if (status === 'ACCEPTED') return 'accepted';
  if (status === 'DECLINED') return 'declined';
  if (status === 'DELETED' || status === 'VOIDED') return 'cancelled';
  if (status === 'EXPIRED') return 'expired';
  if (status === 'SENT' || status === 'INVOICED') return 'sent';
  if (status === 'DRAFT') return 'draft';
  return 'draft';
}

export function amountToCentsSafe(amount: number | null | undefined): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function mapXeroLineItemsToTitan(
  lines: XeroFinanceLineItemInput[] | null | undefined,
): XeroFinanceMappedLineItem[] {
  if (!lines || lines.length === 0) return [];

  return lines.map((line, index) => {
    const quantity =
      typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? line.quantity : 1;
    const unitPriceCents = amountToCentsSafe(line.unitAmount);
    const lineVatCents = amountToCentsSafe(line.taxAmount);
    const lineTotalCents =
      amountToCentsSafe(line.lineAmount) || unitPriceCents * Math.round(quantity * 100) / 100;
    const lineSubtotalCents = Math.max(lineTotalCents - lineVatCents, 0);
    const vatRateBps =
      lineSubtotalCents > 0 ? Math.round((lineVatCents / lineSubtotalCents) * 10_000) : 0;

    return {
      position: index,
      description: (line.description ?? '').trim() || `Line ${index + 1}`,
      quantity: String(quantity),
      unitPriceCents,
      lineSubtotalCents,
      lineVatCents,
      lineTotalCents,
      vatRateBps: Number.isFinite(vatRateBps) ? vatRateBps : 0,
      accountCode: line.accountCode?.trim() || null,
      sourceExternalId: line.lineItemId?.trim() || null,
      category: 'other' as const,
    };
  });
}

export function buildFinanceDashboardSnapshot(input: {
  invoices: Array<{
    status: string;
    totalCents: number;
    amountCents: number;
    amountPaidCents: number;
    dueDate?: string | Date | null;
    issuedAt?: string | Date | null;
  }>;
  payments: Array<{
    amountCents: number;
    paidAt: string | Date;
  }>;
  quotes: Array<{
    status: string;
    totalCents: number;
    amountCents: number;
  }>;
  now?: Date;
}): XeroFinanceDashboardSnapshot {
  const now = input.now ?? new Date();
  let revenueCents = 0;
  let outstandingCents = 0;
  let paidCents = 0;
  let overdueCents = 0;
  let unpaidInvoiceCount = 0;
  let paidInvoiceCount = 0;
  let overdueInvoiceCount = 0;

  const turnoverByMonth = new Map<string, number>();

  for (const invoice of input.invoices) {
    const total = invoice.totalCents > 0 ? invoice.totalCents : invoice.amountCents;
    const paid = Math.max(invoice.amountPaidCents, 0);
    const due = Math.max(total - paid, 0);
    const status = invoice.status;

    if (status === 'paid') {
      paidInvoiceCount += 1;
      paidCents += total;
      revenueCents += total;
    } else if (status === 'cancelled') {
      // excluded from AR
    } else {
      if (due > 0) {
        unpaidInvoiceCount += 1;
        outstandingCents += due;
      }
      if (status === 'overdue' || (due > 0 && invoice.dueDate && new Date(invoice.dueDate) < now)) {
        overdueInvoiceCount += 1;
        overdueCents += due;
      }
      if (paid > 0) {
        paidCents += paid;
        revenueCents += paid;
      }
    }

    const issued = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
    if (issued && !Number.isNaN(issued.getTime()) && (status === 'paid' || paid > 0)) {
      const key = `${issued.getUTCFullYear()}-${String(issued.getUTCMonth() + 1).padStart(2, '0')}`;
      const contribution = status === 'paid' ? total : paid;
      turnoverByMonth.set(key, (turnoverByMonth.get(key) ?? 0) + contribution);
    }
  }

  const openQuoteStatuses = new Set(['draft', 'sent', 'viewed', 'approved_for_sending', 'internal_review']);
  let quotePipelineCents = 0;
  let quotePipelineCount = 0;
  for (const quote of input.quotes) {
    if (!openQuoteStatuses.has(quote.status)) continue;
    quotePipelineCount += 1;
    quotePipelineCents += quote.totalCents > 0 ? quote.totalCents : quote.amountCents;
  }

  const paymentByMonth = new Map<string, number>();
  for (const payment of input.payments) {
    const paidAt = new Date(payment.paidAt);
    if (Number.isNaN(paidAt.getTime())) continue;
    const key = `${paidAt.getUTCFullYear()}-${String(paidAt.getUTCMonth() + 1).padStart(2, '0')}`;
    paymentByMonth.set(key, (paymentByMonth.get(key) ?? 0) + Math.max(payment.amountCents, 0));
  }

  const monthlyTurnover = [...turnoverByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amountCents]) => ({ month, amountCents }));

  const paymentTrends = [...paymentByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amountCents]) => ({ month, amountCents }));

  return {
    revenueCents,
    outstandingCents,
    paidCents,
    overdueCents,
    unpaidInvoiceCount,
    paidInvoiceCount,
    overdueInvoiceCount,
    quotePipelineCents,
    quotePipelineCount,
    monthlyTurnover,
    paymentTrends,
  };
}

export function extractXeroLineItemsFromRaw(raw: Record<string, unknown> | null | undefined): XeroFinanceLineItemInput[] {
  if (!raw) return [];
  const rows = Array.isArray(raw.LineItems) ? raw.LineItems : [];
  const out: XeroFinanceLineItemInput[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const line = row as Record<string, unknown>;
    out.push({
      lineItemId: typeof line.LineItemID === 'string' ? line.LineItemID : null,
      description: typeof line.Description === 'string' ? line.Description : null,
      quantity: typeof line.Quantity === 'number' ? line.Quantity : Number(line.Quantity ?? 1),
      unitAmount: typeof line.UnitAmount === 'number' ? line.UnitAmount : Number(line.UnitAmount ?? 0),
      lineAmount: typeof line.LineAmount === 'number' ? line.LineAmount : Number(line.LineAmount ?? 0),
      taxAmount: typeof line.TaxAmount === 'number' ? line.TaxAmount : Number(line.TaxAmount ?? 0),
      accountCode: typeof line.AccountCode === 'string' ? line.AccountCode : null,
    });
  }
  return out;
}
