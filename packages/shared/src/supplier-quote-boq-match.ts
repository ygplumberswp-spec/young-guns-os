/**
 * Row 100 — Supplier PDF / Quote → BOQ Matching
 *
 * Multi-signal evidence matching over Row 99 canonical BOQ import rows.
 * Never matches by sequence/order alone. Never mutates BOQ source truth,
 * catalogue, quote sell, Row 92, or Xero. Row 101 comparison not started.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { normalizeSupplierPriceDescription } from './supplier-price-intelligence.js';

export const SUPPLIER_QUOTE_BOQ_MATCH_KEY = 'supplier-quote-boq-matching' as const;

export const SUPPLIER_QUOTE_BOQ_MATCH_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type SupplierBoqMatchState =
  | 'EXACT'
  | 'HIGH_CONFIDENCE'
  | 'POSSIBLE'
  | 'AMBIGUOUS'
  | 'UNMATCHED'
  | 'REVIEW_REQUIRED'
  | 'REJECTED'
  | 'CONFIRMED';

export type SupplierBoqMatchSignal =
  | 'EXACT_SUPPLIER_SKU'
  | 'EXACT_MANUFACTURER_CODE'
  | 'NORMALIZED_DESCRIPTION'
  | 'COMPATIBLE_UNIT'
  | 'COMPATIBLE_QUANTITY'
  | 'COMPATIBLE_PACK_SIZE'
  | 'SUPPLIER_IDENTITY'
  | 'PRICE_PRESENT'
  | 'VAT_BASIS_PRESENT'
  | 'SEQUENCE_ONLY_REJECTED'
  | 'UNIT_CONFLICT'
  | 'QUANTITY_CONFLICT'
  | 'PACK_SIZE_CONFLICT'
  | 'MATCH_CONFLICT'
  | 'DESCRIPTION_ONLY_WEAK';

export type SupplierVatBasis = 'INCLUSIVE' | 'EXCLUSIVE' | 'UNKNOWN';

export type SupplierQuoteLineInput = {
  clientKey: string;
  /** Original order in supplier document (evidence only — never sole match key). */
  sourceLineOrder: number;
  pageNumber?: number | null;
  supplierSku?: string | null;
  manufacturerCode?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  packSize?: number | null;
  unitPriceCents?: number | null;
  vatBasis?: SupplierVatBasis | null;
  currency?: string | null;
  priceValidTo?: string | null;
  sourceReference?: string | null;
};

export type BoqMatchTargetRow = {
  boqImportRowId: string;
  boqImportId: string;
  sheetName: string;
  sheetOrder: number;
  originalRowNumber: number;
  originalRowOrder: number;
  itemCode?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  rowKind?: string | null;
};

export type SupplierQuoteDocumentProvenance = {
  supplierDocumentId: string | null;
  fileHashSha256: string;
  revisionLabel: string | null;
  supplierId: string | null;
  supplierName: string | null;
  originalFilename: string;
};

export type SupplierBoqMatchProposal = {
  proposalKey: string;
  boqImportId: string;
  boqImportRowId: string | null;
  supplierLineClientKey: string;
  supplierSourceLineOrder: number;
  matchState: SupplierBoqMatchState;
  signalsUsed: SupplierBoqMatchSignal[];
  confidenceScore: number;
  warnings: string[];
  supplierSku: string | null;
  manufacturerCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  packSize: number | null;
  unitPriceCents: number | null;
  vatBasis: SupplierVatBasis;
  currency: string | null;
  priceValidTo: string | null;
  /** True only after explicit human confirm — never from matcher alone for ambiguous. */
  humanConfirmed: boolean;
  mutatesBoqSource: false;
  mutatesCatalogueOrQuotePrice: false;
};

export type ResolveSupplierBoqMatchesInput = {
  provenance: SupplierQuoteDocumentProvenance;
  boqImportId: string;
  boqRows: BoqMatchTargetRow[];
  supplierLines: SupplierQuoteLineInput[];
  /** If true, attempt sequence-only pairing (must be rejected). */
  allowSequenceOnlyAttempt?: boolean;
};

export type ResolveSupplierBoqMatchesResult = {
  proposals: SupplierBoqMatchProposal[];
  unmatchedBoqRowIds: string[];
  unmatchedSupplierLineKeys: string[];
  warnings: string[];
  automaticPricing: false;
  catalogueMutation: false;
  quotePriceMutation: false;
  row92Touched: false;
  row101NotStarted: true;
  provenance: SupplierQuoteDocumentProvenance;
  auraNarrativeFacts: string[];
};

function normCode(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length ? t : null;
}

function normUnit(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim().toLowerCase();
  if (!t) return null;
  if (['ea', 'each', 'nr', 'no', 'unit'].includes(t)) return 'each';
  if (['m', 'metre', 'meter', 'meters', 'metres'].includes(t)) return 'm';
  if (['mm'].includes(t)) return 'mm';
  return t;
}

function unitsCompatible(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  return a === b;
}

function qtyCompatible(a: number | null | undefined, b: number | null | undefined): boolean | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) < 1e-9;
}

function packCompatible(
  supplierPack: number | null | undefined,
  boqQty: number | null | undefined,
): boolean | null {
  if (supplierPack == null || !Number.isFinite(supplierPack) || supplierPack <= 0) return null;
  if (boqQty == null || !Number.isFinite(boqQty)) return null;
  // Pack must divide quantity when both explicit — otherwise conflict if pack > qty with leftover intent
  if (boqQty % supplierPack === 0) return true;
  return false;
}

function descriptionSupport(supplierDesc: string | null | undefined, boqDesc: string | null | undefined): boolean {
  if (!supplierDesc?.trim() || !boqDesc?.trim()) return false;
  const a = normalizeSupplierPriceDescription(supplierDesc);
  const b = normalizeSupplierPriceDescription(boqDesc);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

type Scored = {
  boq: BoqMatchTargetRow;
  line: SupplierQuoteLineInput;
  signals: SupplierBoqMatchSignal[];
  score: number;
  warnings: string[];
  state: SupplierBoqMatchState;
};

function scorePair(line: SupplierQuoteLineInput, boq: BoqMatchTargetRow): Scored | null {
  if (boq.rowKind && boq.rowKind !== 'ITEM') return null;

  const signals: SupplierBoqMatchSignal[] = [];
  const warnings: string[] = [];
  let score = 0;

  const sku = normCode(line.supplierSku);
  const mfr = normCode(line.manufacturerCode);
  const boqCode = normCode(boq.itemCode);

  const exactSku = Boolean(sku && boqCode && sku === boqCode);
  const exactMfr = Boolean(mfr && boqCode && mfr === boqCode);
  if (exactSku) {
    signals.push('EXACT_SUPPLIER_SKU');
    score += 50;
  }
  if (exactMfr) {
    signals.push('EXACT_MANUFACTURER_CODE');
    score += 45;
  }

  const unitA = normUnit(line.unit);
  const unitB = normUnit(boq.unit);
  const unitOk = unitsCompatible(unitA, unitB);
  if (unitOk === true) {
    signals.push('COMPATIBLE_UNIT');
    score += 15;
  } else if (unitOk === false) {
    signals.push('UNIT_CONFLICT');
    warnings.push('UNIT_CONFLICT');
    score -= 40;
  }

  const qtyOk = qtyCompatible(line.quantity ?? null, boq.quantity ?? null);
  if (qtyOk === true) {
    signals.push('COMPATIBLE_QUANTITY');
    score += 10;
  } else if (qtyOk === false) {
    signals.push('QUANTITY_CONFLICT');
    warnings.push('QUANTITY_CONFLICT');
    score -= 25;
  }

  const packOk = packCompatible(line.packSize ?? null, boq.quantity ?? null);
  if (packOk === true) {
    signals.push('COMPATIBLE_PACK_SIZE');
    score += 8;
  } else if (packOk === false) {
    signals.push('PACK_SIZE_CONFLICT');
    warnings.push('PACK_SIZE_CONFLICT');
    score -= 30;
  }

  const descOk = descriptionSupport(line.description, boq.description);
  if (descOk) {
    signals.push('NORMALIZED_DESCRIPTION');
    score += 12;
  }

  if (line.unitPriceCents != null && Number.isInteger(line.unitPriceCents)) {
    signals.push('PRICE_PRESENT');
  }
  if (line.vatBasis && line.vatBasis !== 'UNKNOWN') {
    signals.push('VAT_BASIS_PRESENT');
  }

  // Description-only is weak — cannot become EXACT/HIGH alone
  const strongCode = exactSku || exactMfr;
  if (!strongCode && descOk && signals.filter((s) => s !== 'NORMALIZED_DESCRIPTION' && s !== 'PRICE_PRESENT' && s !== 'VAT_BASIS_PRESENT').length === 0) {
    signals.push('DESCRIPTION_ONLY_WEAK');
    warnings.push('DESCRIPTION_ONLY_AMBIGUOUS');
  }

  if (warnings.includes('UNIT_CONFLICT') || warnings.includes('QUANTITY_CONFLICT') || warnings.includes('PACK_SIZE_CONFLICT')) {
    signals.push('MATCH_CONFLICT');
  }

  // Must have at least one non-sequence commercial signal
  const commercialSignals = signals.filter(
    (s) =>
      s === 'EXACT_SUPPLIER_SKU' ||
      s === 'EXACT_MANUFACTURER_CODE' ||
      s === 'NORMALIZED_DESCRIPTION' ||
      s === 'COMPATIBLE_UNIT' ||
      s === 'COMPATIBLE_QUANTITY' ||
      s === 'COMPATIBLE_PACK_SIZE',
  );
  if (commercialSignals.length === 0) return null;

  let state: SupplierBoqMatchState = 'POSSIBLE';
  if (signals.includes('MATCH_CONFLICT') || signals.includes('DESCRIPTION_ONLY_WEAK')) {
    state = 'REVIEW_REQUIRED';
    if (signals.includes('DESCRIPTION_ONLY_WEAK') && !strongCode) state = 'AMBIGUOUS';
  } else if (strongCode && unitOk !== false && packOk !== false) {
    state = unitOk === true || qtyOk === true ? 'EXACT' : 'HIGH_CONFIDENCE';
    if (strongCode && (unitOk === true || unitOk === null) && !signals.includes('MATCH_CONFLICT')) {
      state = descOk || qtyOk === true || unitOk === true ? 'EXACT' : 'HIGH_CONFIDENCE';
    }
  } else if (strongCode) {
    state = 'HIGH_CONFIDENCE';
  } else if (descOk && (unitOk === true || qtyOk === true)) {
    state = 'POSSIBLE';
  } else if (descOk) {
    state = 'AMBIGUOUS';
  }

  if (state === 'EXACT' && signals.includes('MATCH_CONFLICT')) {
    state = 'REVIEW_REQUIRED';
  }

  return { boq, line, signals, score, warnings, state };
}

/**
 * Deterministic multi-signal matcher.
 * Sequence/order is never a sufficient match signal.
 */
export function resolveSupplierBoqMatches(
  input: ResolveSupplierBoqMatchesInput,
): ResolveSupplierBoqMatchesResult {
  const warnings: string[] = [];
  const proposals: SupplierBoqMatchProposal[] = [];
  const itemRows = input.boqRows.filter((r) => !r.rowKind || r.rowKind === 'ITEM');

  if (input.allowSequenceOnlyAttempt) {
    warnings.push('SEQUENCE_ONLY_ATTEMPT_REJECTED');
  }

  const scored: Scored[] = [];
  for (const line of input.supplierLines) {
    for (const boq of itemRows) {
      const s = scorePair(line, boq);
      if (s) scored.push(s);
    }
  }

  // Sequence-only pairing must never produce a proposal
  if (input.allowSequenceOnlyAttempt) {
    for (let i = 0; i < Math.min(input.supplierLines.length, itemRows.length); i += 1) {
      const line = input.supplierLines[i]!;
      const boq = itemRows[i]!;
      const hasCode =
        (normCode(line.supplierSku) && normCode(boq.itemCode) === normCode(line.supplierSku)) ||
        (normCode(line.manufacturerCode) &&
          normCode(boq.itemCode) === normCode(line.manufacturerCode));
      const hasDesc = descriptionSupport(line.description, boq.description);
      if (!hasCode && !hasDesc) {
        proposals.push({
          proposalKey: `seq-reject:${line.clientKey}:${boq.boqImportRowId}`,
          boqImportId: input.boqImportId,
          boqImportRowId: boq.boqImportRowId,
          supplierLineClientKey: line.clientKey,
          supplierSourceLineOrder: line.sourceLineOrder,
          matchState: 'REVIEW_REQUIRED',
          signalsUsed: ['SEQUENCE_ONLY_REJECTED'],
          confidenceScore: 0,
          warnings: ['SEQUENCE_ONLY_MATCH_REJECTED'],
          supplierSku: line.supplierSku ?? null,
          manufacturerCode: line.manufacturerCode ?? null,
          description: line.description ?? null,
          unit: line.unit ?? null,
          quantity: line.quantity ?? null,
          packSize: line.packSize ?? null,
          unitPriceCents: line.unitPriceCents ?? null,
          vatBasis: line.vatBasis ?? 'UNKNOWN',
          currency: line.currency ?? null,
          priceValidTo: line.priceValidTo ?? null,
          humanConfirmed: false,
          mutatesBoqSource: false,
          mutatesCatalogueOrQuotePrice: false,
        });
      }
    }
  }

  // Group by BOQ row and by supplier line to detect duplicates/ambiguity
  const byBoq = new Map<string, Scored[]>();
  const byLine = new Map<string, Scored[]>();
  for (const s of scored) {
    const bList = byBoq.get(s.boq.boqImportRowId) ?? [];
    bList.push(s);
    byBoq.set(s.boq.boqImportRowId, bList);
    const lList = byLine.get(s.line.clientKey) ?? [];
    lList.push(s);
    byLine.set(s.line.clientKey, lList);
  }

  const emitted = new Set<string>();

  for (const [boqId, list] of byBoq) {
    const ranked = [...list].sort((a, b) => b.score - a.score);
    const top = ranked[0]!;
    const contenders = ranked.filter((s) => s.score >= top.score - 5 && s.score > 0);

    if (contenders.length > 1) {
      for (const c of contenders) {
        const key = `${c.line.clientKey}:${boqId}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        proposals.push(toProposal(input, c, 'AMBIGUOUS', [
          ...c.warnings,
          'MULTIPLE_SUPPLIER_CANDIDATES',
        ]));
      }
      continue;
    }

    // One supplier line → multiple BOQ rows of similar score
    const lineContenders = (byLine.get(top.line.clientKey) ?? [])
      .filter((s) => s.score >= top.score - 5)
      .sort((a, b) => b.score - a.score);
    if (lineContenders.length > 1 && lineContenders[0]!.score === lineContenders[1]!.score) {
      for (const c of lineContenders) {
        const key = `${c.line.clientKey}:${c.boq.boqImportRowId}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        proposals.push(toProposal(input, c, 'AMBIGUOUS', [
          ...c.warnings,
          'ONE_SUPPLIER_LINE_MULTIPLE_BOQ_ROWS',
        ]));
      }
      continue;
    }

    const key = `${top.line.clientKey}:${boqId}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    let state = top.state;
    // Do not weaken conflict / description-only review states via score bands.
    if (
      state !== 'AMBIGUOUS' &&
      state !== 'REVIEW_REQUIRED' &&
      state !== 'EXACT' &&
      state !== 'HIGH_CONFIDENCE'
    ) {
      if (top.score < 20) state = 'POSSIBLE';
      if (top.score < 10) state = 'AMBIGUOUS';
    }
    proposals.push(toProposal(input, top, state, top.warnings));
  }

  const matchedBoq = new Set(
    proposals
      .filter((p) => p.matchState !== 'UNMATCHED' && p.signalsUsed[0] !== 'SEQUENCE_ONLY_REJECTED')
      .map((p) => p.boqImportRowId)
      .filter(Boolean),
  );
  const matchedLines = new Set(
    proposals
      .filter((p) => !p.signalsUsed.includes('SEQUENCE_ONLY_REJECTED'))
      .map((p) => p.supplierLineClientKey),
  );

  const unmatchedBoqRowIds = itemRows
    .map((r) => r.boqImportRowId)
    .filter((id) => !matchedBoq.has(id));
  const unmatchedSupplierLineKeys = input.supplierLines
    .map((l) => l.clientKey)
    .filter((k) => !matchedLines.has(k));

  for (const id of unmatchedBoqRowIds) {
    proposals.push({
      proposalKey: `unmatched-boq:${id}`,
      boqImportId: input.boqImportId,
      boqImportRowId: id,
      supplierLineClientKey: '',
      supplierSourceLineOrder: -1,
      matchState: 'UNMATCHED',
      signalsUsed: [],
      confidenceScore: 0,
      warnings: ['UNMATCHED'],
      supplierSku: null,
      manufacturerCode: null,
      description: null,
      unit: null,
      quantity: null,
      packSize: null,
      unitPriceCents: null,
      vatBasis: 'UNKNOWN',
      currency: null,
      priceValidTo: null,
      humanConfirmed: false,
      mutatesBoqSource: false,
      mutatesCatalogueOrQuotePrice: false,
    });
  }

  if (input.provenance.supplierId || input.provenance.supplierName) {
    for (const p of proposals) {
      if (p.matchState !== 'UNMATCHED' && !p.signalsUsed.includes('SEQUENCE_ONLY_REJECTED')) {
        if (!p.signalsUsed.includes('SUPPLIER_IDENTITY')) {
          p.signalsUsed = [...p.signalsUsed, 'SUPPLIER_IDENTITY'];
        }
      }
    }
  }

  return {
    proposals,
    unmatchedBoqRowIds,
    unmatchedSupplierLineKeys,
    warnings,
    automaticPricing: false,
    catalogueMutation: false,
    quotePriceMutation: false,
    row92Touched: false,
    row101NotStarted: true,
    provenance: input.provenance,
    auraNarrativeFacts: [
      `Supplier document hash ${input.provenance.fileHashSha256.slice(0, 12)}… rev ${input.provenance.revisionLabel ?? '—'}.`,
      `Supplier: ${input.provenance.supplierName ?? input.provenance.supplierId ?? 'UNKNOWN'}.`,
      `BOQ import ${input.boqImportId}: ${itemRows.length} item rows; ${input.supplierLines.length} supplier lines.`,
      `Proposals: ${proposals.length}. Multi-signal only — sequence alone rejected.`,
      'Supplier prices are evidence only — not pushed to catalogue, quote sell, Row 92, or Xero.',
      'Human confirmation required for ambiguous / conflicting / substitute cases.',
    ],
  };
}

function toProposal(
  input: ResolveSupplierBoqMatchesInput,
  scored: Scored,
  state: SupplierBoqMatchState,
  warnings: string[],
): SupplierBoqMatchProposal {
  return {
    proposalKey: `${scored.line.clientKey}:${scored.boq.boqImportRowId}`,
    boqImportId: input.boqImportId,
    boqImportRowId: scored.boq.boqImportRowId,
    supplierLineClientKey: scored.line.clientKey,
    supplierSourceLineOrder: scored.line.sourceLineOrder,
    matchState: state,
    signalsUsed: scored.signals,
    confidenceScore: Math.max(0, scored.score),
    warnings,
    supplierSku: scored.line.supplierSku ?? null,
    manufacturerCode: scored.line.manufacturerCode ?? null,
    description: scored.line.description ?? null,
    unit: scored.line.unit ?? null,
    quantity: scored.line.quantity ?? null,
    packSize: scored.line.packSize ?? null,
    unitPriceCents: scored.line.unitPriceCents ?? null,
    vatBasis: scored.line.vatBasis ?? 'UNKNOWN',
    currency: scored.line.currency ?? null,
    priceValidTo: scored.line.priceValidTo ?? null,
    humanConfirmed: false,
    mutatesBoqSource: false,
    mutatesCatalogueOrQuotePrice: false,
  };
}

export function confirmSupplierBoqMatch(input: {
  proposal: SupplierBoqMatchProposal;
  actorRole?: string | null;
  actorPermissions?: string[] | null;
}):
  | { ok: true; proposal: SupplierBoqMatchProposal }
  | { ok: false; code: string } {
  const role = (input.actorRole ?? '').toLowerCase();
  if (role === 'client' || role === 'technician' || role.includes('tech')) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (input.proposal.matchState === 'REJECTED') {
    return { ok: false, code: 'ALREADY_REJECTED' };
  }
  if (input.proposal.matchState === 'UNMATCHED') {
    return { ok: false, code: 'NOTHING_TO_CONFIRM' };
  }
  if (
    input.proposal.signalsUsed.includes('SEQUENCE_ONLY_REJECTED') ||
    input.proposal.warnings.includes('SEQUENCE_ONLY_MATCH_REJECTED')
  ) {
    return { ok: false, code: 'SEQUENCE_ONLY_CANNOT_CONFIRM' };
  }
  return {
    ok: true,
    proposal: {
      ...input.proposal,
      matchState: 'CONFIRMED',
      humanConfirmed: true,
      mutatesBoqSource: false,
      mutatesCatalogueOrQuotePrice: false,
    },
  };
}

export function rejectSupplierBoqMatch(
  proposal: SupplierBoqMatchProposal,
): SupplierBoqMatchProposal {
  return {
    ...proposal,
    matchState: 'REJECTED',
    humanConfirmed: false,
    mutatesBoqSource: false,
    mutatesCatalogueOrQuotePrice: false,
  };
}

export function canManageSupplierBoqMatching(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoSupplierBoqMatchClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoSupplierBoqMatchClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'supplierQuoteImport',
    'supplierQuoteMatch',
    'matchProposal',
    'unitPriceCents',
    'supplierSku',
    'matchSignals',
    'fileChecksumSha256',
    'supplierBoqMatchInternal',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Supplier BOQ match internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoSupplierBoqMatchClientLeak(value, `${path}.${key}`);
    }
  }
}

export function assertRow101NotStarted(started: boolean): void {
  if (started) throw new Error('Row 101+ must not start during Row 100');
}

export function assertRow100SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row101Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row101NotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow101NotStarted(input.row101Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 100 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 100 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 100 requires production writes = 0');
  return {
    row92Off: true,
    row101NotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow100(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== SUPPLIER_QUOTE_BOQ_MATCH_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== SUPPLIER_QUOTE_BOQ_MATCH_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function supplierMatchIdempotencyKey(input: {
  boqImportId: string;
  fileHashSha256: string;
  supplierLineKeys: string[];
}): string {
  const keys = [...input.supplierLineKeys].sort().join('|');
  return `${input.boqImportId}:${input.fileHashSha256}:${keys}`;
}
