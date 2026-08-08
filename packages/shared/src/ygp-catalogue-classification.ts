/**
 * Row 91 — YGP Service / Item Codes + Categories
 *
 * Canonical classification contract for the sell catalogue (inventory_items
 * as current price-book identity table — NOT a second catalogue engine).
 *
 * INVENTORY = physical stock truth.
 * PRICE BOOK / CATALOGUE = items/services available for quoting.
 *
 * - Do not invent Row 92 markup formulas
 * - Do not mass-guess categories from free text
 * - Do not overwrite supplier SKU / Xero / sourceExternalId into one field
 * - Do not mutate historical issued quote commercial truth
 * - Xero writes = 0 · customer sends = 0 · production = 0
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import type { QuoteLineCategory } from './finance.js';

export const YGP_CATALOGUE_CLASSIFICATION_KEY = 'ygp-catalogue-classification' as const;

export const YGP_CATALOGUE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

/** Catalogue item/service type — NOT the same as QuoteLineCategory. */
export type CatalogueItemType =
  | 'PHYSICAL_ITEM'
  | 'SERVICE'
  | 'LABOUR'
  | 'CALL_OUT'
  | 'OTHER';

export type CatalogueClassificationStatus =
  | 'CLASSIFIED'
  | 'UNCATEGORISED'
  | 'REVIEW_REQUIRED';

/**
 * Product/service taxonomy (catalogue category).
 * Distinct from quote_line_category (scope/labour/materials/travel/…).
 */
export type CatalogueProductCategory =
  | 'Geysers'
  | 'Pipes'
  | 'Taps'
  | 'Toilets'
  | 'Add-ons'
  | 'Maintenance'
  | 'Labour'
  | 'Call-out'
  | 'Services'
  | 'Materials'
  | 'Equipment'
  | 'Other'
  | 'UNCATEGORISED';

export const APPROVED_CATALOGUE_PRODUCT_CATEGORIES: readonly CatalogueProductCategory[] = [
  'Geysers',
  'Pipes',
  'Taps',
  'Toilets',
  'Add-ons',
  'Maintenance',
  'Labour',
  'Call-out',
  'Services',
  'Materials',
  'Equipment',
  'Other',
  'UNCATEGORISED',
] as const;

export type CatalogueIdentityFields = {
  /** TITAN database id */
  titanId: string;
  /** YGP / internal business code (stable; company-scoped unique when set) */
  ygpCode: string | null;
  /** Operational sku field (may equal ygpCode when that is the authorised code) */
  sku: string;
  /** Supplier SKU — never overwritten by YGP code */
  supplierSku: string | null;
  /** Xero Item ID (GUID) */
  xeroItemId: string | null;
  /** Xero Item Code */
  xeroItemCode: string | null;
  /** Import / provider external id */
  sourceExternalId: string | null;
};

export type CatalogueClassification = {
  itemType: CatalogueItemType;
  catalogueCategory: CatalogueProductCategory | string | null;
  classificationStatus: CatalogueClassificationStatus;
  isStockable: boolean;
};

export type CatalogueDuplicateMatchKind =
  | 'CANONICAL_ID'
  | 'SOURCE_EXTERNAL_ID'
  | 'EXACT_YGP_CODE'
  | 'XERO_ITEM_ID'
  | 'XERO_ITEM_CODE'
  | 'SUPPLIER_SKU'
  | 'EXACT_SKU'
  | 'NONE';

export type CatalogueDuplicateCheckResult =
  | { kind: 'MATCH'; matchKind: Exclude<CatalogueDuplicateMatchKind, 'NONE'>; existingId: string }
  | { kind: 'AMBIGUOUS'; code: 'CATALOGUE_REVIEW_REQUIRED'; reason: string }
  | { kind: 'NONE' };

export type CatalogueAuditEventType =
  | 'catalogue_code_assigned'
  | 'catalogue_code_changed'
  | 'catalogue_category_changed'
  | 'catalogue_type_changed'
  | 'catalogue_classification_reviewed';

/** Root cause: quote_line_category vs catalogue product category are different fields. */
export const QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE = {
  summary:
    'PR #75 staging “category=other” referred to quote_line_items.category (QuoteLineCategory commercial bucket), not catalogue product taxonomy.',
  causes: [
    'A. quote_line_items.category defaults to other',
    'B. Xero quote/invoice line sync hardcodes category: other',
    'C. Legacy amount-only quotes use legacyQuoteLines → other',
    'D. Draft placeholder lines use category other',
    'E. inventory_items historically had no catalogue_category column — import stuffed Category: into description',
    'F. inventoryItemToFinanceCatalogue previously forced quote-line category materials for all inventory rows',
  ],
  notCause:
    'Not primarily that every catalogue product lacked a Geysers/Pipes taxonomy — quote lines and catalogue taxonomy were conflated in the audit metric.',
} as const;

const YGP_CODE_RE = /^(YGP|YG|LAB|SRV)[-_/A-Z0-9]+$/i;
const IMPORT_CATEGORY_RE = /(?:^|\|\s*)Category:\s*([^|]+)/i;
const PRICE_BOOK_MARKER_RE = /HISTORICAL_PRICE_BOOK/i;
const EXTERNAL_ID_RE = /externalId=([^\s|]+)/i;
const LABOUR_SKU_RE = /^LAB[-_]/i;
const CALLOUT_SKU_RE = /CALLOUT|CALL-OUT|CALL_OUT/i;
const SERVICE_SKU_RE = /^SRV[-_]/i;

export function isValidYgpCodeFormat(code: string | null | undefined): boolean {
  if (!code?.trim()) return false;
  return YGP_CODE_RE.test(code.trim());
}

export function normalizeCatalogueProductCategory(
  value: string | null | undefined,
): CatalogueProductCategory | string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const exact = APPROVED_CATALOGUE_PRODUCT_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;
  // Preserve authorised import categories that are not in the approved shortlist.
  return trimmed;
}

/**
 * Extract Category: from historical import description embedding.
 * Deterministic — not fuzzy free-text classification.
 */
export function extractImportedCatalogueCategoryFromDescription(
  description: string | null | undefined,
): string | null {
  if (!description?.trim()) return null;
  const match = description.match(IMPORT_CATEGORY_RE);
  return match?.[1]?.trim() || null;
}

export function extractSourceExternalIdFromDescription(
  description: string | null | undefined,
): string | null {
  if (!description?.trim()) return null;
  const match = description.match(EXTERNAL_ID_RE);
  return match?.[1]?.trim() || null;
}

export function isPriceBookOnlyDescription(description: string | null | undefined): boolean {
  return Boolean(description && PRICE_BOOK_MARKER_RE.test(description));
}

/**
 * Infer item type ONLY from deterministic signals (sku prefix / explicit type / markers).
 * Never from free-text description keywords alone.
 */
export function resolveCatalogueItemType(input: {
  sku?: string | null;
  itemType?: string | null;
  explicitType?: CatalogueItemType | null;
  isStockable?: boolean | null;
  description?: string | null;
}): { status: 'FOUND'; itemType: CatalogueItemType } | { status: 'UNCERTAIN'; itemType: 'OTHER' } {
  if (input.explicitType) return { status: 'FOUND', itemType: input.explicitType };
  const existing = (input.itemType ?? '').toUpperCase();
  if (
    existing === 'PHYSICAL_ITEM' ||
    existing === 'SERVICE' ||
    existing === 'LABOUR' ||
    existing === 'CALL_OUT' ||
    existing === 'OTHER'
  ) {
    return { status: 'FOUND', itemType: existing as CatalogueItemType };
  }
  const sku = input.sku ?? '';
  if (CALLOUT_SKU_RE.test(sku) || /call-?out/i.test(sku)) {
    return { status: 'FOUND', itemType: 'CALL_OUT' };
  }
  if (LABOUR_SKU_RE.test(sku)) return { status: 'FOUND', itemType: 'LABOUR' };
  if (SERVICE_SKU_RE.test(sku)) return { status: 'FOUND', itemType: 'SERVICE' };
  if (input.isStockable === false || isPriceBookOnlyDescription(input.description)) {
    // Price-book-only without LAB/SRV prefix — service-like but uncertain
    return { status: 'UNCERTAIN', itemType: 'OTHER' };
  }
  if (input.isStockable === true) return { status: 'FOUND', itemType: 'PHYSICAL_ITEM' };
  return { status: 'UNCERTAIN', itemType: 'OTHER' };
}

export function isStockableForItemType(itemType: CatalogueItemType): boolean {
  return itemType === 'PHYSICAL_ITEM';
}

export function mapItemTypeToQuoteLineCategory(itemType: CatalogueItemType): QuoteLineCategory {
  switch (itemType) {
    case 'LABOUR':
      return 'labour';
    case 'CALL_OUT':
      return 'travel';
    case 'SERVICE':
      return 'scope';
    case 'PHYSICAL_ITEM':
      return 'materials';
    default:
      return 'other';
  }
}

export function resolveClassificationStatus(input: {
  catalogueCategory: string | null | undefined;
  itemType: CatalogueItemType;
  reviewRequired?: boolean;
}): CatalogueClassificationStatus {
  if (input.reviewRequired) return 'REVIEW_REQUIRED';
  const cat = input.catalogueCategory?.trim();
  if (!cat || cat.toUpperCase() === 'UNCATEGORISED') return 'UNCATEGORISED';
  if (input.itemType === 'OTHER' && cat.toUpperCase() === 'OTHER') return 'UNCATEGORISED';
  return 'CLASSIFIED';
}

/**
 * Fuzzy description-only classification is FORBIDDEN for silent apply.
 * Returns REVIEW suggestion only.
 */
export function suggestCategoryFromDescriptionOnly(
  description: string | null | undefined,
): { status: 'REVIEW_REQUIRED'; suggestion: null; reason: string } {
  void description;
  return {
    status: 'REVIEW_REQUIRED',
    suggestion: null,
    reason:
      'Description-only / keyword classification is not authorised for silent apply (CODE_REVIEW_REQUIRED / CATALOGUE_REVIEW_REQUIRED)',
  };
}

export function detectCatalogueDuplicate(input: {
  candidates: Array<{
    id: string;
    sku: string;
    ygpCode?: string | null;
    sourceExternalId?: string | null;
    xeroItemId?: string | null;
    xeroItemCode?: string | null;
    supplierSku?: string | null;
  }>;
  titanId?: string | null;
  ygpCode?: string | null;
  sku?: string | null;
  sourceExternalId?: string | null;
  xeroItemId?: string | null;
  xeroItemCode?: string | null;
  supplierSku?: string | null;
}): CatalogueDuplicateCheckResult {
  const { candidates } = input;
  if (input.titanId) {
    const hit = candidates.find((c) => c.id === input.titanId);
    if (hit) return { kind: 'MATCH', matchKind: 'CANONICAL_ID', existingId: hit.id };
  }
  if (input.sourceExternalId?.trim()) {
    const hits = candidates.filter(
      (c) => (c.sourceExternalId ?? '').trim() === input.sourceExternalId!.trim(),
    );
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'SOURCE_EXTERNAL_ID', existingId: hits[0]!.id };
    }
    if (hits.length > 1) {
      return {
        kind: 'AMBIGUOUS',
        code: 'CATALOGUE_REVIEW_REQUIRED',
        reason: 'Multiple catalogue rows share the same sourceExternalId',
      };
    }
  }
  if (input.ygpCode?.trim()) {
    const hits = candidates.filter(
      (c) => (c.ygpCode ?? '').trim().toLowerCase() === input.ygpCode!.trim().toLowerCase(),
    );
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'EXACT_YGP_CODE', existingId: hits[0]!.id };
    }
    if (hits.length > 1) {
      return {
        kind: 'AMBIGUOUS',
        code: 'CATALOGUE_REVIEW_REQUIRED',
        reason: 'Duplicate YGP code within tenant',
      };
    }
  }
  if (input.xeroItemId?.trim()) {
    const hits = candidates.filter((c) => (c.xeroItemId ?? '').trim() === input.xeroItemId!.trim());
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'XERO_ITEM_ID', existingId: hits[0]!.id };
    }
    if (hits.length > 1) {
      return {
        kind: 'AMBIGUOUS',
        code: 'CATALOGUE_REVIEW_REQUIRED',
        reason: 'Multiple rows share Xero Item ID',
      };
    }
  }
  if (input.xeroItemCode?.trim()) {
    const hits = candidates.filter(
      (c) =>
        (c.xeroItemCode ?? '').trim().toLowerCase() === input.xeroItemCode!.trim().toLowerCase(),
    );
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'XERO_ITEM_CODE', existingId: hits[0]!.id };
    }
  }
  if (input.supplierSku?.trim()) {
    const hits = candidates.filter(
      (c) =>
        (c.supplierSku ?? '').trim().toLowerCase() === input.supplierSku!.trim().toLowerCase(),
    );
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'SUPPLIER_SKU', existingId: hits[0]!.id };
    }
    if (hits.length > 1) {
      return {
        kind: 'AMBIGUOUS',
        code: 'CATALOGUE_REVIEW_REQUIRED',
        reason: 'Multiple rows share supplier SKU',
      };
    }
  }
  if (input.sku?.trim()) {
    const hits = candidates.filter(
      (c) => c.sku.trim().toLowerCase() === input.sku!.trim().toLowerCase(),
    );
    if (hits.length === 1) {
      return { kind: 'MATCH', matchKind: 'EXACT_SKU', existingId: hits[0]!.id };
    }
    if (hits.length > 1) {
      return {
        kind: 'AMBIGUOUS',
        code: 'CATALOGUE_REVIEW_REQUIRED',
        reason: 'Multiple rows share SKU',
      };
    }
  }
  return { kind: 'NONE' };
}

/**
 * Deterministic YGP code assignment from an existing authorised sku when it already
 * matches YGP/YG/LAB/SRV conventions. Never invents random codes for ambiguous items.
 */
export function resolveYgpCodeAssignment(input: {
  existingYgpCode?: string | null;
  sku?: string | null;
  forceGenerate?: boolean;
  companyPrefix?: string;
  sequence?: number;
}):
  | { status: 'FOUND'; ygpCode: string; source: 'existing' | 'sku' | 'generated' }
  | { status: 'CODE_REVIEW_REQUIRED'; reason: string } {
  if (input.existingYgpCode?.trim()) {
    return { status: 'FOUND', ygpCode: input.existingYgpCode.trim(), source: 'existing' };
  }
  const sku = input.sku?.trim() ?? '';
  if (sku && isValidYgpCodeFormat(sku)) {
    return { status: 'FOUND', ygpCode: sku.toUpperCase(), source: 'sku' };
  }
  if (input.forceGenerate && typeof input.sequence === 'number' && input.sequence > 0) {
    const prefix = (input.companyPrefix ?? 'YGP').toUpperCase();
    const ygpCode = `${prefix}-GEN-${String(input.sequence).padStart(6, '0')}`;
    return { status: 'FOUND', ygpCode, source: 'generated' };
  }
  return {
    status: 'CODE_REVIEW_REQUIRED',
    reason:
      'No authorised YGP/YG/LAB/SRV code present on sku; refusing to invent a code without explicit generation scope',
  };
}

export function assertYgpCodeNotRecycled(input: {
  code: string;
  previouslyUsedOnDifferentItem: boolean;
}): void {
  if (input.previouslyUsedOnDifferentItem) {
    throw new Error(`YGP code ${input.code} must not be recycled onto a different catalogue item`);
  }
}

export function assertCataloguePriceUnchanged(input: {
  beforeSellPriceCents: number;
  afterSellPriceCents: number;
}): void {
  if (input.beforeSellPriceCents !== input.afterSellPriceCents) {
    throw new Error('Row 91 must not change selling prices when assigning codes/categories');
  }
}

export function buildCatalogueAuditEvent(input: {
  eventType: CatalogueAuditEventType;
  companyId: string;
  catalogueItemId: string;
  actorId?: string | null;
  before: unknown;
  after: unknown;
  reason?: string | null;
}): {
  companyId: string;
  action: CatalogueAuditEventType;
  entityType: 'catalogue_item';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: 'catalogue_item',
    entityId: input.catalogueItemId,
    metadata: {
      eventType: input.eventType,
      catalogueItemId: input.catalogueItemId,
      actorId: input.actorId ?? null,
      before: input.before,
      after: input.after,
      reason: input.reason ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

export function canAdministerCatalogue(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('inventory:write') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'admin', 'manager', 'office'].includes(role);
}

export function canSearchCatalogue(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'client') return false;
  const perms = input.permissions ?? [];
  if (
    perms.includes('*') ||
    perms.includes('finance:read') ||
    perms.includes('finance:write') ||
    perms.includes('inventory:read')
  ) {
    return true;
  }
  return ['owner', 'admin', 'manager', 'office', 'dispatcher', 'accountant'].includes(role);
}

export function projectCustomerSafeCatalogueFields(input: {
  description: string;
  ygpCode?: string | null;
  showCodeOnDocument?: boolean;
}): { description: string; itemCode: string | null } {
  return {
    description: input.description,
    itemCode: input.showCodeOnDocument ? input.ygpCode?.trim() || null : null,
  };
}

export function assertNoInternalCatalogueLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoInternalCatalogueLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'unitCostCents',
    'sourceExternalId',
    'xeroItemId',
    'supplierSku',
    'classificationStatus',
    'marginBps',
    'grossProfitCents',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null && obj[key] !== '') {
      // Allow null/empty; non-empty internal fields are leaks on customer payloads.
      if (
        key === 'classificationStatus' ||
        key === 'sourceExternalId' ||
        key === 'xeroItemId' ||
        key === 'supplierSku' ||
        key === 'unitCostCents' ||
        key === 'marginBps' ||
        key === 'grossProfitCents'
      ) {
        throw new Error(`Internal catalogue field leaked at ${path}.${key}`);
      }
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoInternalCatalogueLeak(value, `${path}.${key}`);
    }
  }
}

/** Safe apply plan from deterministic import signals only — never fuzzy. */
export function planDeterministicClassificationApply(input: {
  id: string;
  sku: string;
  description: string | null;
  sellPriceCents: number;
  ygpCode?: string | null;
  catalogueCategory?: string | null;
  itemType?: string | null;
  classificationStatus?: string | null;
  sourceExternalId?: string | null;
  isStockable?: boolean | null;
}): {
  action: 'update' | 'unchanged' | 'review' | 'skip';
  patch: Partial<{
    ygpCode: string;
    catalogueCategory: string;
    itemType: CatalogueItemType;
    classificationStatus: CatalogueClassificationStatus;
    isStockable: boolean;
    sourceExternalId: string;
  }>;
  sellPriceCents: number;
  reason: string;
} {
  const patch: {
    ygpCode?: string;
    catalogueCategory?: string;
    itemType?: CatalogueItemType;
    classificationStatus?: CatalogueClassificationStatus;
    isStockable?: boolean;
    sourceExternalId?: string;
  } = {};

  const importedCategory = extractImportedCatalogueCategoryFromDescription(input.description);
  if (!input.catalogueCategory?.trim() && importedCategory) {
    patch.catalogueCategory = normalizeCatalogueProductCategory(importedCategory) ?? importedCategory;
  }

  const code = resolveYgpCodeAssignment({
    existingYgpCode: input.ygpCode,
    sku: input.sku,
  });
  if (code.status === 'FOUND' && !input.ygpCode?.trim()) {
    patch.ygpCode = code.ygpCode;
  }

  const typeResult = resolveCatalogueItemType({
    sku: input.sku,
    itemType: input.itemType,
    description: input.description,
    isStockable: input.isStockable ?? !isPriceBookOnlyDescription(input.description),
  });
  if (
    typeResult.status === 'FOUND' &&
    (!input.itemType || input.itemType === 'OTHER')
  ) {
    patch.itemType = typeResult.itemType;
    patch.isStockable = isStockableForItemType(typeResult.itemType);
  } else if (isPriceBookOnlyDescription(input.description) && input.isStockable !== false) {
    patch.isStockable = false;
  }

  const external = extractSourceExternalIdFromDescription(input.description);
  if (!input.sourceExternalId?.trim() && external) {
    patch.sourceExternalId = external;
  }

  const nextCategory = patch.catalogueCategory ?? input.catalogueCategory ?? null;
  const nextType = (patch.itemType ?? (input.itemType as CatalogueItemType) ?? 'OTHER') as CatalogueItemType;
  const status = resolveClassificationStatus({
    catalogueCategory: nextCategory,
    itemType: nextType,
    reviewRequired: typeResult.status === 'UNCERTAIN' && !nextCategory,
  });
  if (
    (input.classificationStatus ?? 'UNCATEGORISED').toUpperCase() !== status &&
    (Object.keys(patch).length > 0 || status === 'CLASSIFIED' || status === 'REVIEW_REQUIRED')
  ) {
    // Only write status when it actually changes.
    if ((input.classificationStatus ?? '').toUpperCase() !== status) {
      patch.classificationStatus = status;
    }
  }

  if (Object.keys(patch).length === 0) {
    if (status === 'REVIEW_REQUIRED') {
      return {
        action: 'review',
        patch: {},
        sellPriceCents: input.sellPriceCents,
        reason: 'Ambiguous classification',
      };
    }
    return {
      action: 'unchanged',
      patch: {},
      sellPriceCents: input.sellPriceCents,
      reason: status === 'CLASSIFIED' ? 'Already classified' : 'Nothing deterministic to apply',
    };
  }

  return {
    action: 'update',
    patch,
    sellPriceCents: input.sellPriceCents,
    reason: 'Deterministic import/sku signals',
  };
}

export function assertRow90PricingPreserved(input: {
  before: {
    pricingPresentationMode?: string | null;
    labourIncluded?: boolean | null;
    calloutIncluded?: boolean | null;
    calloutAllocation?: string | null;
  };
  after: {
    pricingPresentationMode?: string | null;
    labourIncluded?: boolean | null;
    calloutIncluded?: boolean | null;
    calloutAllocation?: string | null;
  };
}): void {
  if (input.before.pricingPresentationMode !== input.after.pricingPresentationMode) {
    throw new Error('Row 91 must not alter pricingPresentationMode');
  }
  if (Boolean(input.before.labourIncluded) !== Boolean(input.after.labourIncluded)) {
    throw new Error('Row 91 must not alter labourIncluded');
  }
  if (Boolean(input.before.calloutIncluded) !== Boolean(input.after.calloutIncluded)) {
    throw new Error('Row 91 must not alter calloutIncluded');
  }
  if ((input.before.calloutAllocation ?? 'PER_JOB') !== (input.after.calloutAllocation ?? 'PER_JOB')) {
    throw new Error('Row 91 must not alter calloutAllocation');
  }
}

export function assertRoyalCapeCatalogueUnchanged(input: {
  quoteId: string;
  xeroQuoteId: string | null | undefined;
  xeroQuoteNumber: string | null | undefined;
  totalCents: number;
  customerId: string;
  jobId: string | null | undefined;
  pricingPresentationMode?: string | null;
}): void {
  const rc = YGP_CATALOGUE_ROYAL_CAPE;
  if (input.quoteId !== rc.royalCapeQuoteId) throw new Error('Royal Cape quote id mismatch');
  if ((input.xeroQuoteId ?? null) !== rc.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id changed');
  }
  if ((input.xeroQuoteNumber ?? '').trim() !== rc.royalCapeQuoteNumber) {
    throw new Error('Royal Cape official quote number changed');
  }
  if (input.customerId !== rc.canonicalCustomerId) throw new Error('Royal Cape customer changed');
  if ((input.jobId ?? null) !== rc.jobId) throw new Error('Royal Cape job changed');
  if (input.totalCents !== rc.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== rc.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function assertRow91NoXeroWrites(n: number): void {
  if (n !== 0) throw new Error('Row 91 requires Xero writes = 0');
}
export function assertRow91NoCustomerSends(n: number): void {
  if (n !== 0) throw new Error('Row 91 requires customer sends = 0');
}
export function assertRow91NoProductionWrites(n: number): void {
  if (n !== 0) throw new Error('Row 91 requires production writes = 0');
}
/** Filter helpers for catalogue search (server-side). */
export function catalogueMatchesFilters(
  item: {
    ygpCode?: string | null;
    sku: string;
    name: string;
    description?: string | null;
    catalogueCategory?: string | null;
    itemType?: string | null;
  },
  filters: {
    query?: string | null;
    category?: string | null;
    itemType?: string | null;
  },
): boolean {
  if (filters.category?.trim()) {
    const want = filters.category.trim().toLowerCase();
    const have = (item.catalogueCategory ?? 'UNCATEGORISED').trim().toLowerCase();
    if (have !== want) return false;
  }
  if (filters.itemType?.trim()) {
    if ((item.itemType ?? 'OTHER').toUpperCase() !== filters.itemType.trim().toUpperCase()) {
      return false;
    }
  }
  const q = filters.query?.trim().toLowerCase();
  if (!q) return true;
  const hay = [item.ygpCode, item.sku, item.name, item.description, item.catalogueCategory]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}
