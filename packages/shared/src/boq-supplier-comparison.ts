/**
 * Row 101 — BOQ Supplier Comparison + Split Purchasing Review
 *
 * Review-first comparison over Row 99 BOQ rows + Row 100 match evidence.
 * DRAFT split-purchase proposals only — no PO / bill / payment / stock / quote sell / Row 92.
 * Row 102+ not started.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import type { SupplierBoqMatchState, SupplierVatBasis } from './supplier-quote-boq-match.js';

export const BOQ_SUPPLIER_COMPARISON_KEY = 'boq-supplier-comparison' as const;

export const BOQ_SUPPLIER_COMPARISON_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type BoqComparisonMismatchFlag =
  | 'MISSING'
  | 'DUPLICATE'
  | 'SUBSTITUTE'
  | 'EXPIRED'
  | 'VAT_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'QUANTITY_MISMATCH'
  | 'PACK_MISMATCH'
  | 'DELIVERY_MISMATCH'
  | 'EXCLUSION_PRESENT'
  | 'MULTIPLE_CANDIDATES'
  | 'MATCH_REVIEW_REQUIRED';

export type SplitPurchaseProposalStatus =
  | 'DRAFT'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'APPROVED_DRAFT'
  | 'SUPERSEDED';

export type BoqComparisonBoqRow = {
  boqImportRowId: string;
  boqImportId: string;
  sheetName: string;
  originalRowNumber: number;
  itemCode?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  rowKind?: string | null;
  /** Expected VAT basis for the BOQ commercial view, if configured. */
  expectedVatBasis?: SupplierVatBasis | null;
};

export type BoqSupplierOfferInput = {
  offerKey: string;
  supplierId: string | null;
  supplierName: string;
  supplierDocumentId: string | null;
  supplierDocumentRef: string | null;
  fileHashSha256: string | null;
  sourceLineOrder: number;
  supplierSku: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  packSize: number | null;
  unitPriceCents: number | null;
  vatBasis: SupplierVatBasis;
  currency: string | null;
  deliveryCents: number | null;
  deliveryKnown: boolean;
  validTo: string | null;
  exclusions: string | null;
  isSubstitute: boolean;
  matchState: SupplierBoqMatchState;
  matchConfidenceScore: number;
  row100ProposalKey: string | null;
};

export type BoqRowSupplierOfferView = BoqSupplierOfferInput & {
  boqImportRowId: string;
  mismatchFlags: BoqComparisonMismatchFlag[];
  commercialCostCents: number | null;
  eligibleForAutoRank: boolean;
  warnings: string[];
};

export type BoqRowComparison = {
  boqImportRowId: string;
  boqImportId: string;
  sheetName: string;
  originalRowNumber: number;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  offers: BoqRowSupplierOfferView[];
  missingSupplierOffer: boolean;
  mismatchFlags: BoqComparisonMismatchFlag[];
  /** Lowest eligible commercial cost among non-disqualified offers — informational only. */
  cheapestEligibleOfferKey: string | null;
  cheapestEligibleCostCents: number | null;
  humanReviewRequired: boolean;
};

export type SplitPurchaseSelectionInput = {
  boqImportRowId: string;
  offerKey: string;
  quantityProposed: number | null;
};

export type SplitPurchaseLine = {
  boqImportRowId: string;
  offerKey: string;
  supplierId: string | null;
  supplierName: string;
  supplierDocumentRef: string | null;
  row100ProposalKey: string | null;
  quantityProposed: number | null;
  unitPriceCents: number | null;
  vatBasis: SupplierVatBasis;
  lineSubtotalCents: number | null;
  lineVatCents: number | null;
  deliveryCents: number | null;
  expectedSupplierCostCents: number | null;
  mismatchFlags: BoqComparisonMismatchFlag[];
  warnings: string[];
  isSubstitute: boolean;
  sourceEvidence: {
    supplierSku: string | null;
    description: string | null;
    unit: string | null;
    matchState: SupplierBoqMatchState;
  };
};

export type SplitPurchaseTotals = {
  supplierSubtotalCents: number | null;
  vatCents: number | null;
  deliveryCents: number | null;
  totalProposedPurchasingCostCents: number | null;
  incomplete: boolean;
  missingFields: string[];
};

export type SplitPurchaseProposal = {
  status: SplitPurchaseProposalStatus;
  boqImportId: string;
  lines: SplitPurchaseLine[];
  totals: SplitPurchaseTotals;
  createsPurchaseOrder: false;
  createsSupplierInvoice: false;
  createsXeroBill: false;
  mutatesBoqSource: false;
  mutatesCatalogueOrQuotePrice: false;
  row92Touched: false;
  row102NotStarted: true;
  warnings: string[];
  auraNarrativeFacts: string[];
};

function normUnit(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim().toLowerCase();
  if (!t) return null;
  if (['ea', 'each', 'nr', 'no', 'unit'].includes(t)) return 'each';
  if (['m', 'metre', 'meter', 'meters', 'metres'].includes(t)) return 'm';
  return t;
}

function isExpired(validTo: string | null, asOfIso: string): boolean {
  if (!validTo) return false;
  const end = Date.parse(validTo);
  const asOf = Date.parse(asOfIso);
  if (!Number.isFinite(end) || !Number.isFinite(asOf)) return false;
  return end < asOf;
}

function lineCommercialCost(
  quantity: number | null,
  unitPriceCents: number | null,
): number | null {
  if (quantity == null || unitPriceCents == null) return null;
  if (!Number.isFinite(quantity) || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    return null;
  }
  return Math.round(quantity * unitPriceCents);
}

function vatOnSubtotal(subtotal: number | null, vatBasis: SupplierVatBasis): number | null {
  if (subtotal == null) return null;
  if (vatBasis === 'UNKNOWN') return null;
  if (vatBasis === 'INCLUSIVE') {
    // Extract 15% VAT portion from inclusive amount using exact integer path:
    // vat = round(inclusive * 15 / 115)
    return Math.round((subtotal * 15) / 115);
  }
  // EXCLUSIVE: add 15%
  return Math.round((subtotal * 15) / 100);
}

function exclusiveSubtotal(subtotal: number | null, vatBasis: SupplierVatBasis): number | null {
  if (subtotal == null) return null;
  if (vatBasis === 'INCLUSIVE') {
    const vat = vatOnSubtotal(subtotal, 'INCLUSIVE');
    return vat == null ? null : subtotal - vat;
  }
  if (vatBasis === 'EXCLUSIVE') return subtotal;
  return null;
}

export function evaluateOfferMismatches(input: {
  boq: BoqComparisonBoqRow;
  offer: BoqSupplierOfferInput;
  asOfIso: string;
  siblingOfferCount: number;
}): { flags: BoqComparisonMismatchFlag[]; warnings: string[]; eligibleForAutoRank: boolean } {
  const flags: BoqComparisonMismatchFlag[] = [];
  const warnings: string[] = [];

  if (input.offer.isSubstitute) {
    flags.push('SUBSTITUTE');
    warnings.push('SUBSTITUTE_REQUIRES_HUMAN_REVIEW');
  }
  if (isExpired(input.offer.validTo, input.asOfIso)) {
    flags.push('EXPIRED');
    warnings.push('SUPPLIER_QUOTE_EXPIRED');
  }
  if (input.offer.exclusions && input.offer.exclusions.trim()) {
    flags.push('EXCLUSION_PRESENT');
    warnings.push('EXCLUSION_PRESENT');
  }

  const bu = normUnit(input.boq.unit);
  const ou = normUnit(input.offer.unit);
  if (bu && ou && bu !== ou) {
    flags.push('UNIT_MISMATCH');
    warnings.push('UNIT_MISMATCH');
  }

  if (
    input.boq.quantity != null &&
    input.offer.quantity != null &&
    Number.isFinite(input.boq.quantity) &&
    Number.isFinite(input.offer.quantity) &&
    Math.abs(input.boq.quantity - input.offer.quantity) > 1e-9
  ) {
    flags.push('QUANTITY_MISMATCH');
    warnings.push('QUANTITY_MISMATCH');
  }

  if (
    input.offer.packSize != null &&
    input.boq.quantity != null &&
    input.offer.packSize > 0 &&
    input.boq.quantity % input.offer.packSize !== 0
  ) {
    flags.push('PACK_MISMATCH');
    warnings.push('PACK_MISMATCH');
  }

  if (
    input.boq.expectedVatBasis &&
    input.boq.expectedVatBasis !== 'UNKNOWN' &&
    input.offer.vatBasis !== 'UNKNOWN' &&
    input.boq.expectedVatBasis !== input.offer.vatBasis
  ) {
    flags.push('VAT_MISMATCH');
    warnings.push('VAT_MISMATCH');
  }

  if (input.offer.deliveryKnown === false && input.offer.deliveryCents == null) {
    // not a hard mismatch — delivery unknown stays unknown
  } else if (input.offer.deliveryCents != null && input.offer.deliveryCents < 0) {
    flags.push('DELIVERY_MISMATCH');
  }

  if (
    input.offer.matchState === 'AMBIGUOUS' ||
    input.offer.matchState === 'REVIEW_REQUIRED' ||
    input.offer.matchState === 'POSSIBLE'
  ) {
    flags.push('MATCH_REVIEW_REQUIRED');
  }

  if (input.siblingOfferCount > 1) {
    flags.push('MULTIPLE_CANDIDATES');
  }

  const disqualifying = flags.some((f) =>
    ['SUBSTITUTE', 'EXPIRED', 'UNIT_MISMATCH', 'PACK_MISMATCH', 'MATCH_REVIEW_REQUIRED'].includes(f),
  );
  const eligibleForAutoRank =
    !disqualifying &&
    input.offer.unitPriceCents != null &&
    !input.offer.isSubstitute &&
    (input.offer.matchState === 'EXACT' ||
      input.offer.matchState === 'HIGH_CONFIDENCE' ||
      input.offer.matchState === 'CONFIRMED');

  return { flags, warnings, eligibleForAutoRank };
}

/**
 * Build per-BOQ-row comparison views from Row 100 offer evidence.
 * Never invents missing supplier terms. Never silently picks substitutes.
 */
export function resolveBoqSupplierComparison(input: {
  boqImportId: string;
  boqRows: BoqComparisonBoqRow[];
  /** Offers keyed by BOQ row id — may be empty (MISSING). */
  offersByBoqRowId: Record<string, BoqSupplierOfferInput[]>;
  asOfIso?: string;
}): {
  rows: BoqRowComparison[];
  automaticPurchaseExecution: false;
  row99Immutable: true;
  row100EvidencePreserved: true;
  auraNarrativeFacts: string[];
} {
  const asOf = input.asOfIso ?? new Date().toISOString();
  const rows: BoqRowComparison[] = [];

  for (const boq of input.boqRows) {
    if (boq.rowKind && boq.rowKind !== 'ITEM') continue;
    const rawOffers = input.offersByBoqRowId[boq.boqImportRowId] ?? [];
    const views: BoqRowSupplierOfferView[] = rawOffers.map((offer) => {
      const evald = evaluateOfferMismatches({
        boq,
        offer,
        asOfIso: asOf,
        siblingOfferCount: rawOffers.length,
      });
      const qty = offer.quantity ?? boq.quantity ?? null;
      return {
        ...offer,
        boqImportRowId: boq.boqImportRowId,
        mismatchFlags: evald.flags,
        commercialCostCents: lineCommercialCost(qty, offer.unitPriceCents),
        eligibleForAutoRank: evald.eligibleForAutoRank,
        warnings: evald.warnings,
      };
    });

    // Duplicate detection: same supplier+sku appearing twice
    const seen = new Map<string, number>();
    for (const v of views) {
      const k = `${v.supplierId ?? v.supplierName}|${v.supplierSku ?? ''}|${v.sourceLineOrder}`;
      seen.set(`${v.supplierId ?? v.supplierName}|${v.supplierSku ?? ''}`, (seen.get(`${v.supplierId ?? v.supplierName}|${v.supplierSku ?? ''}`) ?? 0) + 1);
      void k;
    }
    for (const v of views) {
      const key = `${v.supplierId ?? v.supplierName}|${v.supplierSku ?? ''}`;
      if ((seen.get(key) ?? 0) > 1 && !v.mismatchFlags.includes('DUPLICATE')) {
        v.mismatchFlags = [...v.mismatchFlags, 'DUPLICATE'];
        v.warnings = [...v.warnings, 'DUPLICATE_CANDIDATE'];
        v.eligibleForAutoRank = false;
      }
    }

    const rowFlags = new Set<BoqComparisonMismatchFlag>();
    if (views.length === 0) rowFlags.add('MISSING');
    if (views.length > 1) rowFlags.add('MULTIPLE_CANDIDATES');
    for (const v of views) for (const f of v.mismatchFlags) rowFlags.add(f);

    const eligible = views
      .filter((v) => v.eligibleForAutoRank && v.commercialCostCents != null)
      .sort((a, b) => (a.commercialCostCents! - b.commercialCostCents!));

    rows.push({
      boqImportRowId: boq.boqImportRowId,
      boqImportId: boq.boqImportId,
      sheetName: boq.sheetName,
      originalRowNumber: boq.originalRowNumber,
      itemCode: boq.itemCode ?? null,
      description: boq.description ?? null,
      unit: boq.unit ?? null,
      quantity: boq.quantity ?? null,
      offers: views,
      missingSupplierOffer: views.length === 0,
      mismatchFlags: [...rowFlags],
      cheapestEligibleOfferKey: eligible[0]?.offerKey ?? null,
      cheapestEligibleCostCents: eligible[0]?.commercialCostCents ?? null,
      humanReviewRequired:
        views.length === 0 ||
        views.some((v) => !v.eligibleForAutoRank) ||
        views.some((v) => v.isSubstitute) ||
        views.length > 1,
    });
  }

  return {
    rows,
    automaticPurchaseExecution: false,
    row99Immutable: true,
    row100EvidencePreserved: true,
    auraNarrativeFacts: [
      `Comparison for BOQ import ${input.boqImportId}: ${rows.length} item rows.`,
      'Cheapest ranking applies only to eligible exact/high-confidence non-substitute offers.',
      'Substitutes, expiry, unit/pack conflicts, and weak matches require human review.',
      'Split purchasing proposals are DRAFT only — no PO, bill, Xero, stock, or quote mutation.',
    ],
  };
}

/**
 * Build a DRAFT split-purchase proposal from human selections.
 * Does not create POs or mutate BOQ/catalogue/quote.
 */
export function buildSplitPurchaseProposal(input: {
  boqImportId: string;
  comparison: ReturnType<typeof resolveBoqSupplierComparison>;
  selections: SplitPurchaseSelectionInput[];
  status?: SplitPurchaseProposalStatus;
}): SplitPurchaseProposal {
  const offerIndex = new Map<string, BoqRowSupplierOfferView>();
  for (const row of input.comparison.rows) {
    for (const offer of row.offers) {
      offerIndex.set(`${row.boqImportRowId}:${offer.offerKey}`, offer);
    }
  }
  const rowIndex = new Map(input.comparison.rows.map((r) => [r.boqImportRowId, r]));

  const lines: SplitPurchaseLine[] = [];
  const warnings: string[] = [];

  for (const sel of input.selections) {
    const row = rowIndex.get(sel.boqImportRowId);
    const offer = offerIndex.get(`${sel.boqImportRowId}:${sel.offerKey}`);
    if (!row || !offer) {
      warnings.push(`SELECTION_MISSING_OFFER:${sel.boqImportRowId}:${sel.offerKey}`);
      continue;
    }

    const qty =
      sel.quantityProposed != null && Number.isFinite(sel.quantityProposed)
        ? sel.quantityProposed
        : row.quantity;
    const lineSubtotal = lineCommercialCost(qty, offer.unitPriceCents);
    const exclusive = exclusiveSubtotal(lineSubtotal, offer.vatBasis);
    const vat =
      offer.vatBasis === 'UNKNOWN'
        ? null
        : offer.vatBasis === 'INCLUSIVE'
          ? vatOnSubtotal(lineSubtotal, 'INCLUSIVE')
          : vatOnSubtotal(exclusive, 'EXCLUSIVE');

    if (offer.isSubstitute) warnings.push(`SUBSTITUTE_SELECTED:${sel.boqImportRowId}`);
    if (offer.mismatchFlags.includes('EXPIRED')) warnings.push(`EXPIRED_SELECTED:${sel.boqImportRowId}`);

    const delivery = offer.deliveryKnown ? offer.deliveryCents : null;

    // Prefer explicit expected: exclusive + vat + delivery when exclusive known
    let expectedSupplierCostCents: number | null = null;
    if (exclusive != null) {
      expectedSupplierCostCents = exclusive + (vat ?? 0) + (delivery ?? 0);
      if (vat == null && offer.vatBasis === 'UNKNOWN') {
        expectedSupplierCostCents = null;
        warnings.push(`VAT_UNKNOWN:${sel.boqImportRowId}`);
      }
    } else if (lineSubtotal != null && offer.vatBasis === 'UNKNOWN') {
      warnings.push(`VAT_UNKNOWN:${sel.boqImportRowId}`);
      expectedSupplierCostCents = null;
    }

    if (!offer.deliveryKnown) warnings.push(`DELIVERY_UNKNOWN:${sel.boqImportRowId}`);

    lines.push({
      boqImportRowId: sel.boqImportRowId,
      offerKey: sel.offerKey,
      supplierId: offer.supplierId,
      supplierName: offer.supplierName,
      supplierDocumentRef: offer.supplierDocumentRef,
      row100ProposalKey: offer.row100ProposalKey,
      quantityProposed: qty,
      unitPriceCents: offer.unitPriceCents,
      vatBasis: offer.vatBasis,
      lineSubtotalCents: exclusive ?? lineSubtotal,
      lineVatCents: vat,
      deliveryCents: delivery,
      expectedSupplierCostCents,
      mismatchFlags: offer.mismatchFlags,
      warnings: offer.warnings,
      isSubstitute: offer.isSubstitute,
      sourceEvidence: {
        supplierSku: offer.supplierSku,
        description: offer.description,
        unit: offer.unit,
        matchState: offer.matchState,
      },
    });
  }

  const totals = summarizeSplitPurchaseTotals(lines);
  const needsReview =
    lines.some((l) => l.isSubstitute) ||
    lines.some((l) => l.mismatchFlags.length > 0) ||
    totals.incomplete;

  return {
    status: input.status ?? (needsReview ? 'REVIEW_REQUIRED' : 'DRAFT'),
    boqImportId: input.boqImportId,
    lines,
    totals,
    createsPurchaseOrder: false,
    createsSupplierInvoice: false,
    createsXeroBill: false,
    mutatesBoqSource: false,
    mutatesCatalogueOrQuotePrice: false,
    row92Touched: false,
    row102NotStarted: true,
    warnings,
    auraNarrativeFacts: [
      `Draft split-purchase proposal for BOQ ${input.boqImportId}: ${lines.length} lines.`,
      `Totals incomplete: ${totals.incomplete}. Missing: ${totals.missingFields.join(', ') || 'none'}.`,
      'No PO / supplier invoice / Xero bill / stock / quote sell / Row 92 mutation.',
      'Human review remains authoritative over cheapest ranking.',
    ],
  };
}

export function summarizeSplitPurchaseTotals(lines: SplitPurchaseLine[]): SplitPurchaseTotals {
  const missingFields: string[] = [];
  let subtotal = 0;
  let vat = 0;
  let delivery = 0;
  let subOk = true;
  let vatOk = true;
  let delOk = true;

  for (const line of lines) {
    if (line.lineSubtotalCents == null) {
      subOk = false;
      missingFields.push(`subtotal:${line.boqImportRowId}`);
    } else {
      subtotal += line.lineSubtotalCents;
    }
    if (line.vatBasis === 'UNKNOWN' || line.lineVatCents == null) {
      vatOk = false;
      missingFields.push(`vat:${line.boqImportRowId}`);
    } else {
      vat += line.lineVatCents;
    }
    if (line.deliveryCents == null) {
      // delivery unknown — do not invent; mark incomplete only if we need a grand total
      delOk = false;
      missingFields.push(`delivery:${line.boqImportRowId}`);
    } else {
      delivery += line.deliveryCents;
    }
  }

  const incomplete = !subOk || !vatOk || !delOk || lines.length === 0;
  const total =
    !incomplete && subOk && vatOk
      ? subtotal + vat + (delOk ? delivery : 0)
      : null;

  // If delivery unknown but sub+vat known, still leave total missing
  return {
    supplierSubtotalCents: subOk ? subtotal : null,
    vatCents: vatOk ? vat : null,
    deliveryCents: delOk ? delivery : null,
    totalProposedPurchasingCostCents: total,
    incomplete,
    missingFields: [...new Set(missingFields)],
  };
}

/** Prefer eligible cheapest — never silently prefer substitute/cheaper disqualified. */
export function suggestEligibleCheapestSelection(
  row: BoqRowComparison,
): SplitPurchaseSelectionInput | null {
  if (!row.cheapestEligibleOfferKey) return null;
  const offer = row.offers.find((o) => o.offerKey === row.cheapestEligibleOfferKey);
  if (!offer || !offer.eligibleForAutoRank || offer.isSubstitute) return null;
  return {
    boqImportRowId: row.boqImportRowId,
    offerKey: offer.offerKey,
    quantityProposed: row.quantity,
  };
}

export function canManageBoqSupplierComparison(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoBoqSupplierComparisonClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBoqSupplierComparisonClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'boqSupplierComparison',
    'splitPurchaseProposal',
    'unitPriceCents',
    'supplierSubtotalCents',
    'cheapestEligibleCostCents',
    'expectedSupplierCostCents',
    'boqComparisonInternal',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`BOQ supplier comparison internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoBoqSupplierComparisonClientLeak(value, `${path}.${key}`);
    }
  }
}

export function assertRow102NotStarted(started: boolean): void {
  if (started) throw new Error('Row 102+ must not start during Row 101');
}

export function assertRow101SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row102Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
  purchaseOrdersCreated?: number;
}): {
  row92Off: true;
  row102NotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  purchaseOrdersCreated: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow102NotStarted(input.row102Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 101 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 101 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 101 requires production writes = 0');
  if ((input.purchaseOrdersCreated ?? 0) !== 0) {
    throw new Error('Row 101 must not create purchase orders');
  }
  return {
    row92Off: true,
    row102NotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    purchaseOrdersCreated: 0,
  };
}

export function assertRoyalCapeUnchangedForRow101(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== BOQ_SUPPLIER_COMPARISON_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== BOQ_SUPPLIER_COMPARISON_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function splitPurchaseIdempotencyKey(input: {
  boqImportId: string;
  selectionKeys: string[];
}): string {
  return `${input.boqImportId}:${[...input.selectionKeys].sort().join('|')}`;
}
