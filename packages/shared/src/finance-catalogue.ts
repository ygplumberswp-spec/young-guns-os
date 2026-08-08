import type { QuoteLineCategory } from './finance.js';
import {
  mapItemTypeToQuoteLineCategory,
  resolveCatalogueItemType,
  type CatalogueItemType,
} from './ygp-catalogue-classification.js';

export type FinanceCatalogueSourceType = 'inventory' | 'materials' | 'service' | 'labour';

export type FinanceCatalogueItemSearchResult = {
  /** Stable key for duplicate detection — inventory:{id} */
  sourceKey: string;
  sourceType: FinanceCatalogueSourceType;
  itemCode: string;
  /** Row 91 — stable YGP internal code when assigned (may equal itemCode). */
  ygpCode?: string | null;
  name: string;
  shortDescription: string | null;
  sellPriceCents: number | null;
  unitCostCents: number | null;
  unit: string;
  /** Quote line commercial category (scope/labour/materials/travel/…). */
  category: QuoteLineCategory;
  /** Row 91 — catalogue product taxonomy (Geysers/Pipes/…). */
  catalogueCategory?: string | null;
  /** Row 91 — PHYSICAL_ITEM | SERVICE | LABOUR | CALL_OUT | OTHER */
  itemType?: CatalogueItemType | string | null;
  classificationStatus?: string | null;
  isStockable?: boolean | null;
  catalogueItemId?: string | null;
};

/**
 * Finance catalogue search data sources (J-6.2 / J-6.3 / Row 91).
 * ONE canonical sell catalogue identity table: inventory_items
 * (price-book import path + active rows). Not a parallel service catalogue.
 * Temporary YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK constants still merge for verified YG tenant.
 */
export const FINANCE_CATALOGUE_DATA_SOURCES = {
  inventoryTable: 'inventory_items',
  inventoryService: 'FinanceService.searchCatalogueItems',
  pricebookTable: 'inventory_items' as string | null,
  pricebookStatus:
    'Row 91 — inventory_items is canonical sell-catalogue identity; additive ygp_code/catalogue_category/item_type; temp YG constants still merge for verified tenant; Row 92 not activated',
} as const;

export function inventoryItemToFinanceCatalogue(input: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unitCostCents: number | null;
  sellPriceCents: number | null;
  ygpCode?: string | null;
  catalogueCategory?: string | null;
  itemType?: string | null;
  classificationStatus?: string | null;
  isStockable?: boolean | null;
}): FinanceCatalogueItemSearchResult {
  // Inventory rows default to stockable physical items unless classified otherwise.
  const defaultStockable = input.isStockable ?? true;
  const typeResolved = resolveCatalogueItemType({
    sku: input.sku,
    itemType: input.itemType,
    isStockable: defaultStockable,
    description: input.description,
  });
  const itemType = typeResolved.itemType;
  const quoteCategory = mapItemTypeToQuoteLineCategory(itemType);
  const sourceType: FinanceCatalogueSourceType =
    itemType === 'LABOUR'
      ? 'labour'
      : itemType === 'SERVICE' || itemType === 'CALL_OUT'
        ? 'service'
        : 'inventory';
  return {
    sourceKey: `inventory:${input.id}`,
    sourceType,
    itemCode: input.ygpCode?.trim() || input.sku,
    ygpCode: input.ygpCode?.trim() || null,
    name: input.name,
    shortDescription: input.description,
    sellPriceCents: input.sellPriceCents,
    unitCostCents: input.unitCostCents,
    unit: input.unit || 'each',
    category: quoteCategory,
    catalogueCategory: input.catalogueCategory ?? null,
    itemType,
    classificationStatus: input.classificationStatus ?? null,
    isStockable: input.isStockable ?? itemType === 'PHYSICAL_ITEM',
    catalogueItemId: input.id,
  };
}

/** Test fixture — maps a tenant inventory row shape to a catalogue search result. */
export function financeCatalogueItemFromInventory(input: {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  unitCostCents?: number | null;
  sellPriceCents?: number | null;
  ygpCode?: string | null;
  catalogueCategory?: string | null;
  itemType?: string | null;
  classificationStatus?: string | null;
  isStockable?: boolean | null;
}): FinanceCatalogueItemSearchResult {
  return inventoryItemToFinanceCatalogue({
    id: input.id,
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    unit: input.unit ?? 'each',
    unitCostCents: input.unitCostCents ?? null,
    sellPriceCents: input.sellPriceCents ?? null,
    ygpCode: input.ygpCode,
    catalogueCategory: input.catalogueCategory,
    itemType: input.itemType,
    classificationStatus: input.classificationStatus,
    isStockable: input.isStockable,
  });
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function scoreCatalogueMatch(
  query: string,
  item: FinanceCatalogueItemSearchResult,
): number {
  const needle = normalizeSearchText(query);
  if (!needle) return 0;
  const code = normalizeSearchText(item.itemCode);
  const ygp = normalizeSearchText(item.ygpCode ?? '');
  const name = normalizeSearchText(item.name);
  const description = normalizeSearchText(item.shortDescription ?? '');
  const catalogueCategory = normalizeSearchText(item.catalogueCategory ?? '');
  if (code === needle || ygp === needle || name === needle) return 100;
  if (code.startsWith(needle) || ygp.startsWith(needle) || name.startsWith(needle)) return 80;
  if (code.includes(needle) || ygp.includes(needle) || name.includes(needle)) return 60;
  if (catalogueCategory.includes(needle)) return 50;
  if (description.includes(needle)) return 40;
  return 0;
}

export function searchFinanceCatalogueItems(
  query: string,
  catalogue: FinanceCatalogueItemSearchResult[],
  options?: {
    limit?: number;
    category?: string | null;
    itemType?: string | null;
  },
): FinanceCatalogueItemSearchResult[] {
  const limit = options?.limit ?? 12;
  const trimmed = query.trim();
  const categoryFilter = options?.category?.trim().toLowerCase() || null;
  const typeFilter = options?.itemType?.trim().toUpperCase() || null;

  let pool = catalogue;
  if (categoryFilter) {
    pool = pool.filter(
      (item) =>
        (item.catalogueCategory ?? 'UNCATEGORISED').trim().toLowerCase() === categoryFilter,
    );
  }
  if (typeFilter) {
    pool = pool.filter((item) => (item.itemType ?? 'OTHER').toString().toUpperCase() === typeFilter);
  }

  // Empty query with filters: return filtered catalogue slice for category browse.
  if (trimmed.length < 1) {
    if (!categoryFilter && !typeFilter) return [];
    return pool
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  return pool
    .map((item) => ({ item, score: scoreCatalogueMatch(trimmed, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((row) => row.item);
}

export function formatFinanceCatalogueSourceLabel(sourceType: FinanceCatalogueSourceType): string {
  switch (sourceType) {
    case 'inventory':
      return 'Inventory';
    case 'materials':
      return 'Materials';
    case 'labour':
      return 'Young Guns labour';
    case 'service':
      return 'Young Guns service';
    default:
      return sourceType;
  }
}

/** Optional warning when re-using a catalogue item — never blocks selection or save. */
export function duplicateCatalogueSelectionWarning(
  sourceKey: string,
  usedSourceKeys: string[],
  itemName?: string,
): string | null {
  if (!isCatalogueSourceKeyUsed(sourceKey, usedSourceKeys)) return null;
  const label = itemName?.trim() ? `"${itemName.trim()}"` : 'This item';
  return `${label} is already on the document — added again for a separate work section.`;
}

export function isCatalogueSourceKeyUsed(
  sourceKey: string,
  usedSourceKeys: string[],
): boolean {
  return usedSourceKeys.includes(sourceKey);
}

export function collectUsedCatalogueSourceKeys(
  lines: Array<{ catalogueSourceKey?: string | null }>,
): string[] {
  return lines
    .map((line) => line.catalogueSourceKey?.trim())
    .filter((key): key is string => Boolean(key));
}

export function formatCatalogueSellPrice(cents: number | null, currency = 'ZAR'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(cents / 100);
}

/** Auto-fill patch for a finance editor line — document-only; never mutates master catalogue. */
export function buildCatalogueLineAutoFill(item: FinanceCatalogueItemSearchResult, vatRateBps: number) {
  return {
    catalogueSourceKey: item.sourceKey,
    catalogueItemId: item.catalogueItemId ?? null,
    ygpCode: item.ygpCode ?? item.itemCode,
    catalogueCategory: item.catalogueCategory ?? null,
    isManualLine: false as const,
    category: item.category,
    description: item.name,
    quantity: '1',
    unit: item.unit,
    unitPriceCents: item.sellPriceCents,
    unitCostCents: item.unitCostCents,
    vatRateBps,
  };
}

export type FinanceCatalogueSearchResponse = {
  items: FinanceCatalogueItemSearchResult[];
};
