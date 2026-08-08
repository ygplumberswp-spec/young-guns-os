/**
 * Row 106 — Estimated vs Actual Gross Profit / Margin
 *
 * Internal GP comparison only (line / quote / invoice / Job).
 * Reuses Row94/96 baselines + JPE actuals + Rows103–105 cost identity.
 * Does NOT build Row107 operating profit / overhead / cashflow.
 * Row118 remains OPEN. Staging Xero writes = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { isAuthoritativeInvoiceForRevenue } from './job-profitability.js';

export const ESTIMATED_ACTUAL_GP_KEY = 'estimated-actual-gp' as const;

export const ESTIMATED_ACTUAL_GP_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type EstimatedActualGpWarning =
  | 'ESTIMATE_INCOMPLETE'
  | 'ACTUAL_REVENUE_INCOMPLETE'
  | 'ACTUAL_COST_INCOMPLETE'
  | 'LINE_MAPPING_MISSING'
  | 'INVOICE_COST_ALLOCATION_UNAVAILABLE'
  | 'JOB_LINK_MISSING'
  | 'MULTIPLE_MAPPING_REVIEW_REQUIRED'
  | 'DUPLICATE_SOURCE_BLOCKED'
  | 'MARGIN_UNAVAILABLE'
  | 'PROVISIONAL'
  | 'FINAL'
  | 'REVIEW_REQUIRED'
  | 'CROSS_TENANT_BLOCKED'
  | 'QUOTE_BASELINE_PRESERVED'
  | 'NO_PROPORTIONAL_COST_SPREAD'
  | 'ROW107_NOT_STARTED';

export type GpCompletenessStatus =
  | 'PROVISIONAL'
  | 'FINAL'
  | 'INCOMPLETE'
  | 'REVIEW_REQUIRED'
  | 'UNAVAILABLE';

export type MoneySide = {
  estimatedRevenueExVatCents: number | null;
  estimatedCostExVatCents: number | null;
  estimatedGpCents: number | null;
  estimatedMarginBps: number | null;
  actualRevenueExVatCents: number | null;
  actualDirectCostExVatCents: number | null;
  actualGpCents: number | null;
  actualMarginBps: number | null;
  gpVarianceCents: number | null;
  marginVarianceBps: number | null;
};

export type EstimatedActualGpResult = MoneySide & {
  level: 'line' | 'quote' | 'invoice' | 'job';
  status: GpCompletenessStatus;
  warnings: EstimatedActualGpWarning[];
  profitableOrLossLabelled: boolean;
  estimateBaselineUnchanged: true;
  provenance: {
    estimateSource: 'row96_quote_cost' | 'row94_plan_estimate' | 'quote_sell_only' | 'none';
    revenueSource: 'authoritative_invoices' | 'none';
    costSource: 'jpe_direct_costs' | 'none';
    lineMapped: boolean;
  };
};

/** Exact-cent GP — never invent zero when inputs missing. */
export function computeGpCents(
  revenueExVatCents: number | null,
  costExVatCents: number | null,
): number | null {
  if (revenueExVatCents == null || costExVatCents == null) return null;
  if (!Number.isInteger(revenueExVatCents) || !Number.isInteger(costExVatCents)) return null;
  return revenueExVatCents - costExVatCents;
}

/** Margin bps = GP / revenue * 10000. Null when incomplete or revenue ≤ 0. */
export function computeMarginBps(
  gpCents: number | null,
  revenueExVatCents: number | null,
): number | null {
  if (gpCents == null || revenueExVatCents == null || revenueExVatCents <= 0) return null;
  return Math.round((gpCents * 10_000) / revenueExVatCents);
}

export function varianceCents(actual: number | null, estimated: number | null): number | null {
  if (actual == null || estimated == null) return null;
  return actual - estimated;
}

export function resolveEstimatedBaseline(input: {
  row96?: {
    sellExVatCents: number | null;
    estimatedDirectCostCents: number | null;
    costEstimateIncomplete: boolean;
  } | null;
  row94?: {
    proposedSellExVatCents: number | null;
    directCostTotalCents: number | null;
    gpIncomplete: boolean;
  } | null;
  quoteSellExVatCents?: number | null;
}): {
  estimatedRevenueExVatCents: number | null;
  estimatedCostExVatCents: number | null;
  estimatedGpCents: number | null;
  estimatedMarginBps: number | null;
  warnings: EstimatedActualGpWarning[];
  estimateSource: EstimatedActualGpResult['provenance']['estimateSource'];
  estimateBaselineUnchanged: true;
} {
  const warnings: EstimatedActualGpWarning[] = ['QUOTE_BASELINE_PRESERVED'];

  if (input.row96 && !input.row96.costEstimateIncomplete) {
    const rev = input.row96.sellExVatCents;
    const cost = input.row96.estimatedDirectCostCents;
    const gp = computeGpCents(rev, cost);
    const margin = computeMarginBps(gp, rev);
    if (gp == null) warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      estimatedRevenueExVatCents: rev,
      estimatedCostExVatCents: cost,
      estimatedGpCents: gp,
      estimatedMarginBps: margin,
      warnings,
      estimateSource: 'row96_quote_cost',
      estimateBaselineUnchanged: true,
    };
  }

  if (input.row94 && !input.row94.gpIncomplete) {
    const rev = input.row94.proposedSellExVatCents;
    const cost = input.row94.directCostTotalCents;
    const gp = computeGpCents(rev, cost);
    const margin = computeMarginBps(gp, rev);
    if (gp == null) warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      estimatedRevenueExVatCents: rev,
      estimatedCostExVatCents: cost,
      estimatedGpCents: gp,
      estimatedMarginBps: margin,
      warnings,
      estimateSource: 'row94_plan_estimate',
      estimateBaselineUnchanged: true,
    };
  }

  if (input.row96?.costEstimateIncomplete || input.row94?.gpIncomplete) {
    warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
  }

  const sellOnly = input.row96?.sellExVatCents ?? input.quoteSellExVatCents ?? null;
  if (sellOnly != null) {
    warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      estimatedRevenueExVatCents: sellOnly,
      estimatedCostExVatCents: null,
      estimatedGpCents: null,
      estimatedMarginBps: null,
      warnings,
      estimateSource: 'quote_sell_only',
      estimateBaselineUnchanged: true,
    };
  }

  warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
  return {
    estimatedRevenueExVatCents: null,
    estimatedCostExVatCents: null,
    estimatedGpCents: null,
    estimatedMarginBps: null,
    warnings,
    estimateSource: 'none',
    estimateBaselineUnchanged: true,
  };
}

export type ActualInvoiceRevenueInput = {
  invoiceId: string;
  jobId: string | null;
  quoteId: string | null;
  status: string;
  subtotalCents: number | null;
  /** Explicit credit/void economic adjustment (negative reduces revenue). */
  creditNoteExVatCents?: number | null;
};

/**
 * Authoritative actual revenue — invoices only (ex-VAT). Never quote/cash/bank.
 */
export function resolveActualRevenue(input: {
  invoices: ActualInvoiceRevenueInput[];
  expectedJobId?: string | null;
  expectedCompanyJobIds?: Set<string> | null;
}): {
  actualRevenueExVatCents: number | null;
  warnings: EstimatedActualGpWarning[];
  invoiceIdsIncluded: string[];
  revenueSource: 'authoritative_invoices' | 'none';
} {
  const warnings: EstimatedActualGpWarning[] = [];
  const authoritative = input.invoices.filter((inv) => isAuthoritativeInvoiceForRevenue(inv.status));

  if (input.expectedJobId) {
    for (const inv of authoritative) {
      if (!inv.jobId) {
        warnings.push('JOB_LINK_MISSING', 'REVIEW_REQUIRED');
      } else if (inv.jobId !== input.expectedJobId) {
        warnings.push('MULTIPLE_MAPPING_REVIEW_REQUIRED', 'REVIEW_REQUIRED');
      }
    }
  }

  const included = authoritative.filter((inv) => {
    if (input.expectedJobId && inv.jobId && inv.jobId !== input.expectedJobId) return false;
    return true;
  });

  if (included.length === 0) {
    warnings.push('ACTUAL_REVENUE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      actualRevenueExVatCents: null,
      warnings,
      invoiceIdsIncluded: [],
      revenueSource: 'none',
    };
  }

  let total = 0;
  const ids: string[] = [];
  for (const inv of included) {
    if (inv.subtotalCents == null || !Number.isInteger(inv.subtotalCents)) {
      warnings.push('ACTUAL_REVENUE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
      return {
        actualRevenueExVatCents: null,
        warnings,
        invoiceIdsIncluded: ids,
        revenueSource: 'none',
      };
    }
    total += inv.subtotalCents;
    if (inv.creditNoteExVatCents != null) {
      total += inv.creditNoteExVatCents; // typically negative
    }
    ids.push(inv.invoiceId);
  }

  return {
    actualRevenueExVatCents: total,
    warnings,
    invoiceIdsIncluded: ids,
    revenueSource: 'authoritative_invoices',
  };
}

export type JpeDirectCostInput = {
  entryId: string;
  jobId: string | null;
  amountCents: number;
  sourceType: string;
  sourceId: string;
  category?: string | null;
};

/**
 * Sum JPE direct costs once per (sourceType, sourceId). Blocks duplicate economic paths.
 */
export function resolveActualDirectCosts(input: {
  entries: JpeDirectCostInput[];
  jobId: string;
  /** Source keys already counted via another path (e.g. full invoice + alloc). */
  blockedPairedKeys?: string[];
}): {
  actualDirectCostExVatCents: number | null;
  warnings: EstimatedActualGpWarning[];
  entryIdsIncluded: string[];
  costSource: 'jpe_direct_costs' | 'none';
} {
  const warnings: EstimatedActualGpWarning[] = [];
  const seen = new Set<string>();
  const blocked = new Set(input.blockedPairedKeys ?? []);
  let total = 0;
  const included: string[] = [];

  const jobEntries = input.entries.filter((e) => e.jobId === input.jobId);
  if (jobEntries.length === 0) {
    warnings.push('ACTUAL_COST_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      actualDirectCostExVatCents: null,
      warnings,
      entryIdsIncluded: [],
      costSource: 'none',
    };
  }

  const hasAllocPosting = jobEntries.some((x) => x.sourceId.startsWith('supplier_invoice_alloc:'));

  for (const e of jobEntries) {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key)) {
      warnings.push('DUPLICATE_SOURCE_BLOCKED');
      continue;
    }
    // Prefer allocation-level Row105 keys over full-invoice Row103 keys.
    if (
      hasAllocPosting &&
      e.sourceId.startsWith('supplier_invoice:') &&
      !e.sourceId.startsWith('supplier_invoice_alloc:')
    ) {
      warnings.push('DUPLICATE_SOURCE_BLOCKED');
      continue;
    }
    if (blocked.has(key)) {
      warnings.push('DUPLICATE_SOURCE_BLOCKED');
      continue;
    }
    seen.add(key);
    total += e.amountCents;
    included.push(e.entryId);
  }

  if (included.length === 0) {
    warnings.push('ACTUAL_COST_INCOMPLETE', 'MARGIN_UNAVAILABLE');
    return {
      actualDirectCostExVatCents: null,
      warnings,
      entryIdsIncluded: [],
      costSource: 'none',
    };
  }

  return {
    actualDirectCostExVatCents: total,
    warnings,
    entryIdsIncluded: included,
    costSource: 'jpe_direct_costs',
  };
}

function assembleMoney(input: {
  estimated: ReturnType<typeof resolveEstimatedBaseline>;
  actualRevenue: number | null;
  actualCost: number | null;
  extraWarnings?: EstimatedActualGpWarning[];
}): MoneySide & { warnings: EstimatedActualGpWarning[] } {
  const actualGp = computeGpCents(input.actualRevenue, input.actualCost);
  const actualMargin = computeMarginBps(actualGp, input.actualRevenue);
  const warnings = [...input.estimated.warnings, ...(input.extraWarnings ?? [])];
  if (actualGp == null) warnings.push('MARGIN_UNAVAILABLE');
  return {
    estimatedRevenueExVatCents: input.estimated.estimatedRevenueExVatCents,
    estimatedCostExVatCents: input.estimated.estimatedCostExVatCents,
    estimatedGpCents: input.estimated.estimatedGpCents,
    estimatedMarginBps: input.estimated.estimatedMarginBps,
    actualRevenueExVatCents: input.actualRevenue,
    actualDirectCostExVatCents: input.actualCost,
    actualGpCents: actualGp,
    actualMarginBps: actualMargin,
    gpVarianceCents: varianceCents(actualGp, input.estimated.estimatedGpCents),
    marginVarianceBps: varianceCents(actualMargin, input.estimated.estimatedMarginBps),
    warnings: [...new Set(warnings)],
  };
}

export function resolveLineGpComparison(input: {
  companyId: string;
  expectedJobCompanyId: string;
  quoteLineId: string | null;
  invoiceLineId: string | null;
  /** Explicit cost evidence tied to this line — never proportional Job spread. */
  lineCostEvidenceCents: number | null;
  lineCostEvidencePresent: boolean;
  estimatedLineRevenueExVatCents: number | null;
  estimatedLineCostExVatCents: number | null;
  actualLineRevenueExVatCents: number | null;
  allowProportionalJobCostSpread?: boolean;
}): EstimatedActualGpResult {
  const warnings: EstimatedActualGpWarning[] = ['QUOTE_BASELINE_PRESERVED', 'NO_PROPORTIONAL_COST_SPREAD'];
  if (input.companyId !== input.expectedJobCompanyId) {
    return {
      level: 'line',
      status: 'UNAVAILABLE',
      warnings: ['CROSS_TENANT_BLOCKED', 'REVIEW_REQUIRED'],
      profitableOrLossLabelled: false,
      estimateBaselineUnchanged: true,
      provenance: {
        estimateSource: 'none',
        revenueSource: 'none',
        costSource: 'none',
        lineMapped: false,
      },
      estimatedRevenueExVatCents: null,
      estimatedCostExVatCents: null,
      estimatedGpCents: null,
      estimatedMarginBps: null,
      actualRevenueExVatCents: null,
      actualDirectCostExVatCents: null,
      actualGpCents: null,
      actualMarginBps: null,
      gpVarianceCents: null,
      marginVarianceBps: null,
    };
  }

  if (input.allowProportionalJobCostSpread) {
    warnings.push('REVIEW_REQUIRED');
  }

  const mapped = Boolean(input.quoteLineId && input.invoiceLineId);
  if (!mapped) {
    warnings.push('LINE_MAPPING_MISSING', 'MARGIN_UNAVAILABLE');
    const estGp = computeGpCents(input.estimatedLineRevenueExVatCents, input.estimatedLineCostExVatCents);
    return {
      level: 'line',
      status: 'UNAVAILABLE',
      warnings,
      profitableOrLossLabelled: false,
      estimateBaselineUnchanged: true,
      provenance: {
        estimateSource: estGp != null ? 'row96_quote_cost' : 'none',
        revenueSource: 'none',
        costSource: 'none',
        lineMapped: false,
      },
      estimatedRevenueExVatCents: input.estimatedLineRevenueExVatCents,
      estimatedCostExVatCents: input.estimatedLineCostExVatCents,
      estimatedGpCents: estGp,
      estimatedMarginBps: computeMarginBps(estGp, input.estimatedLineRevenueExVatCents),
      actualRevenueExVatCents: null,
      actualDirectCostExVatCents: null,
      actualGpCents: null,
      actualMarginBps: null,
      gpVarianceCents: null,
      marginVarianceBps: null,
    };
  }

  if (!input.lineCostEvidencePresent || input.lineCostEvidenceCents == null) {
    warnings.push('ACTUAL_COST_INCOMPLETE', 'MARGIN_UNAVAILABLE', 'NO_PROPORTIONAL_COST_SPREAD');
  }
  if (input.actualLineRevenueExVatCents == null) {
    warnings.push('ACTUAL_REVENUE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
  }
  if (input.estimatedLineCostExVatCents == null || input.estimatedLineRevenueExVatCents == null) {
    warnings.push('ESTIMATE_INCOMPLETE', 'MARGIN_UNAVAILABLE');
  }

  const estGp = computeGpCents(input.estimatedLineRevenueExVatCents, input.estimatedLineCostExVatCents);
  const actCost = input.lineCostEvidencePresent ? input.lineCostEvidenceCents : null;
  const actGp = computeGpCents(input.actualLineRevenueExVatCents, actCost);
  const complete = estGp != null && actGp != null;

  return {
    level: 'line',
    status: complete ? 'PROVISIONAL' : 'UNAVAILABLE',
    warnings,
    profitableOrLossLabelled: complete,
    estimateBaselineUnchanged: true,
    provenance: {
      estimateSource: estGp != null ? 'row96_quote_cost' : 'none',
      revenueSource: input.actualLineRevenueExVatCents != null ? 'authoritative_invoices' : 'none',
      costSource: actCost != null ? 'jpe_direct_costs' : 'none',
      lineMapped: true,
    },
    estimatedRevenueExVatCents: input.estimatedLineRevenueExVatCents,
    estimatedCostExVatCents: input.estimatedLineCostExVatCents,
    estimatedGpCents: estGp,
    estimatedMarginBps: computeMarginBps(estGp, input.estimatedLineRevenueExVatCents),
    actualRevenueExVatCents: input.actualLineRevenueExVatCents,
    actualDirectCostExVatCents: actCost,
    actualGpCents: actGp,
    actualMarginBps: computeMarginBps(actGp, input.actualLineRevenueExVatCents),
    gpVarianceCents: varianceCents(actGp, estGp),
    marginVarianceBps: varianceCents(
      computeMarginBps(actGp, input.actualLineRevenueExVatCents),
      computeMarginBps(estGp, input.estimatedLineRevenueExVatCents),
    ),
  };
}

export function resolveInvoiceGpComparison(input: {
  invoiceId: string;
  jobId: string | null;
  status: string;
  subtotalCents: number | null;
  creditNoteExVatCents?: number | null;
  /** Costs specifically attributable to this invoice (not Job-level pool). */
  invoiceAttributedCostCents: number | null;
  invoiceCostAttributionAvailable: boolean;
  estimated?: ReturnType<typeof resolveEstimatedBaseline> | null;
}): EstimatedActualGpResult {
  const warnings: EstimatedActualGpWarning[] = ['QUOTE_BASELINE_PRESERVED'];
  const estimated =
    input.estimated ??
    resolveEstimatedBaseline({ row96: null, row94: null, quoteSellExVatCents: null });

  if (!input.jobId) warnings.push('JOB_LINK_MISSING');

  const revenue = resolveActualRevenue({
    invoices: [
      {
        invoiceId: input.invoiceId,
        jobId: input.jobId,
        quoteId: null,
        status: input.status,
        subtotalCents: input.subtotalCents,
        creditNoteExVatCents: input.creditNoteExVatCents ?? null,
      },
    ],
    expectedJobId: input.jobId,
  });
  warnings.push(...revenue.warnings);

  let actualCost: number | null = null;
  if (!input.invoiceCostAttributionAvailable || input.invoiceAttributedCostCents == null) {
    warnings.push('INVOICE_COST_ALLOCATION_UNAVAILABLE', 'ACTUAL_COST_INCOMPLETE', 'MARGIN_UNAVAILABLE');
  } else {
    actualCost = input.invoiceAttributedCostCents;
  }

  const money = assembleMoney({
    estimated,
    actualRevenue: revenue.actualRevenueExVatCents,
    actualCost,
    extraWarnings: warnings,
  });
  const complete = money.actualGpCents != null && money.estimatedGpCents != null;
  const { warnings: moneyWarnings, ...moneyFields } = money;

  return {
    level: 'invoice',
    status: complete ? 'PROVISIONAL' : 'INCOMPLETE',
    warnings: moneyWarnings,
    profitableOrLossLabelled: complete,
    estimateBaselineUnchanged: true,
    provenance: {
      estimateSource: estimated.estimateSource,
      revenueSource: revenue.revenueSource,
      costSource: actualCost != null ? 'jpe_direct_costs' : 'none',
      lineMapped: false,
    },
    ...moneyFields,
  };
}

export function resolveQuoteGpComparison(input: {
  quoteId: string;
  jobId: string | null;
  estimated: ReturnType<typeof resolveEstimatedBaseline>;
  invoices: ActualInvoiceRevenueInput[];
  jpeEntries: JpeDirectCostInput[];
}): EstimatedActualGpResult {
  const warnings: EstimatedActualGpWarning[] = [...input.estimated.warnings];
  if (!input.jobId) {
    warnings.push('JOB_LINK_MISSING', 'ACTUAL_REVENUE_INCOMPLETE', 'ACTUAL_COST_INCOMPLETE');
    const money = assembleMoney({
      estimated: input.estimated,
      actualRevenue: null,
      actualCost: null,
      extraWarnings: warnings,
    });
    const { warnings: moneyWarnings, ...moneyFields } = money;
    return {
      level: 'quote',
      status: 'INCOMPLETE',
      warnings: moneyWarnings,
      profitableOrLossLabelled: false,
      estimateBaselineUnchanged: true,
      provenance: {
        estimateSource: input.estimated.estimateSource,
        revenueSource: 'none',
        costSource: 'none',
        lineMapped: false,
      },
      ...moneyFields,
    };
  }

  const revenue = resolveActualRevenue({
    invoices: input.invoices.filter((i) => i.quoteId === input.quoteId || i.jobId === input.jobId),
    expectedJobId: input.jobId,
  });
  const costs = resolveActualDirectCosts({
    entries: input.jpeEntries,
    jobId: input.jobId,
  });
  warnings.push(...revenue.warnings, ...costs.warnings);

  const money = assembleMoney({
    estimated: input.estimated,
    actualRevenue: revenue.actualRevenueExVatCents,
    actualCost: costs.actualDirectCostExVatCents,
    extraWarnings: warnings,
  });
  const complete = money.actualGpCents != null && money.estimatedGpCents != null;
  const { warnings: moneyWarnings, ...moneyFields } = money;

  return {
    level: 'quote',
    status: complete ? 'PROVISIONAL' : 'INCOMPLETE',
    warnings: moneyWarnings,
    profitableOrLossLabelled: complete,
    estimateBaselineUnchanged: true,
    provenance: {
      estimateSource: input.estimated.estimateSource,
      revenueSource: revenue.revenueSource,
      costSource: costs.costSource,
      lineMapped: false,
    },
    ...moneyFields,
  };
}

export function resolveJobGpComparison(input: {
  jobId: string;
  jobLifecycleComplete: boolean;
  companyId: string;
  expectedJobCompanyId: string;
  estimated: ReturnType<typeof resolveEstimatedBaseline>;
  invoices: ActualInvoiceRevenueInput[];
  jpeEntries: JpeDirectCostInput[];
  actualCostComplete?: boolean;
  actualRevenueComplete?: boolean;
}): EstimatedActualGpResult {
  if (input.companyId !== input.expectedJobCompanyId) {
    return {
      level: 'job',
      status: 'UNAVAILABLE',
      warnings: ['CROSS_TENANT_BLOCKED', 'REVIEW_REQUIRED'],
      profitableOrLossLabelled: false,
      estimateBaselineUnchanged: true,
      provenance: {
        estimateSource: input.estimated.estimateSource,
        revenueSource: 'none',
        costSource: 'none',
        lineMapped: false,
      },
      estimatedRevenueExVatCents: null,
      estimatedCostExVatCents: null,
      estimatedGpCents: null,
      estimatedMarginBps: null,
      actualRevenueExVatCents: null,
      actualDirectCostExVatCents: null,
      actualGpCents: null,
      actualMarginBps: null,
      gpVarianceCents: null,
      marginVarianceBps: null,
    };
  }

  const revenue = resolveActualRevenue({
    invoices: input.invoices,
    expectedJobId: input.jobId,
  });
  const costs = resolveActualDirectCosts({
    entries: input.jpeEntries,
    jobId: input.jobId,
  });

  const money = assembleMoney({
    estimated: input.estimated,
    actualRevenue: revenue.actualRevenueExVatCents,
    actualCost: costs.actualDirectCostExVatCents,
    extraWarnings: [...revenue.warnings, ...costs.warnings],
  });

  const revenueComplete =
    input.actualRevenueComplete !== false && revenue.actualRevenueExVatCents != null;
  const costComplete =
    input.actualCostComplete !== false && costs.actualDirectCostExVatCents != null;
  const gpComplete = money.actualGpCents != null && money.estimatedGpCents != null;

  let status: GpCompletenessStatus = 'PROVISIONAL';
  const warnings = [...money.warnings];

  if (!revenueComplete || !costComplete || !gpComplete) {
    status = 'INCOMPLETE';
    warnings.push('PROVISIONAL');
  } else if (input.jobLifecycleComplete && revenueComplete && costComplete) {
    status = 'FINAL';
    warnings.push('FINAL');
  } else {
    status = 'PROVISIONAL';
    warnings.push('PROVISIONAL');
  }

  // Never label profitable/loss when incomplete
  const profitableOrLossLabelled =
    (status === 'FINAL' || status === 'PROVISIONAL') && gpComplete;

  const { warnings: _drop, ...moneyFields } = money;
  return {
    level: 'job',
    status,
    warnings: [...new Set(warnings)],
    profitableOrLossLabelled,
    estimateBaselineUnchanged: true,
    provenance: {
      estimateSource: input.estimated.estimateSource,
      revenueSource: revenue.revenueSource,
      costSource: costs.costSource,
      lineMapped: false,
    },
    ...moneyFields,
  };
}

export function canViewEstimatedActualGp(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (
    perms.includes('*') ||
    perms.includes('finance:read') ||
    perms.includes('finance:write') ||
    perms.includes('jobs:profitability')
  ) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoEstimatedActualGpClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoEstimatedActualGpClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'estimatedActualGpInternal',
    'estimatedGpCents',
    'actualGpCents',
    'estimatedMarginBps',
    'actualMarginBps',
    'gpVarianceCents',
    'marginVarianceBps',
    'actualDirectCostExVatCents',
    'jpeProfitCents',
    'lineCostCents',
    'unitPriceCents',
    'costSummary',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Estimated/actual GP internal field leaked at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoEstimatedActualGpClientLeak(v, `${path}.${k}`);
  }
}

export function assertRow107NotStartedDuringRow106(started: boolean): void {
  if (started) throw new Error('Row 107+ must not start during Row 106');
}

export function assertRow106SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row107Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row107NotStarted: true;
  rows108PlusNotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  rows9496103105Preserved: true;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow107NotStartedDuringRow106(input.row107Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 106 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 106 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 106 requires production writes = 0');
  return {
    row92Off: true,
    row107NotStarted: true,
    rows108PlusNotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    rows9496103105Preserved: true,
  };
}

export function assertRoyalCapeUnchangedForRow106(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== ESTIMATED_ACTUAL_GP_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== ESTIMATED_ACTUAL_GP_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function gpComparisonIdempotencyKey(parts: string[]): string {
  return parts.join(':');
}
