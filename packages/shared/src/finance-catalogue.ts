import type { QuoteLineCategory } from './finance.js';

export type FinanceCatalogueSourceType = 'inventory' | 'materials' | 'service' | 'labour';

export type FinanceCatalogueItemSearchResult = {
  /** Stable key for duplicate detection — inventory:{id} */
  sourceKey: string;
  sourceType: FinanceCatalogueSourceType;
  itemCode: string;
  name: string;
  shortDescription: string | null;
  sellPriceCents: number | null;
  unitCostCents: number | null;
  unit: string;
  category: QuoteLineCategory;
};

/**
 * Finance catalogue search data sources (J-6.2).
 * - inventory_items: tenant-scoped active stock/service rows (FinanceService.searchCatalogueItems)
 * - YGP-001 Young Guns pricebook: planned DB table — not yet implemented; no hardcoded fallback
 */
export const FINANCE_CATALOGUE_DATA_SOURCES = {
  inventoryTable: 'inventory_items',
  inventoryService: 'FinanceService.searchCatalogueItems',
  pricebookTable: null as string | null,
  pricebookStatus: 'YGP-001 queued — labour/service pricebook not yet in database',
} as const;

export function inventoryItemToFinanceCatalogue(input: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unitCostCents: number | null;
  sellPriceCents: number | null;
}): FinanceCatalogueItemSearchResult {
  return {
    sourceKey: `inventory:${input.id}`,
    sourceType: 'inventory',
    itemCode: input.sku,
    name: input.name,
    shortDescription: input.description,
    sellPriceCents: input.sellPriceCents,
    unitCostCents: input.unitCostCents,
    unit: input.unit || 'each',
    category: 'materials',
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
}): FinanceCatalogueItemSearchResult {
  return inventoryItemToFinanceCatalogue({
    id: input.id,
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    unit: input.unit ?? 'each',
    unitCostCents: input.unitCostCents ?? null,
    sellPriceCents: input.sellPriceCents ?? null,
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
  const name = normalizeSearchText(item.name);
  const description = normalizeSearchText(item.shortDescription ?? '');
  if (code === needle || name === needle) return 100;
  if (code.startsWith(needle) || name.startsWith(needle)) return 80;
  if (code.includes(needle) || name.includes(needle)) return 60;
  if (description.includes(needle)) return 40;
  return 0;
}

export function searchFinanceCatalogueItems(
  query: string,
  catalogue: FinanceCatalogueItemSearchResult[],
  options?: { limit?: number },
): FinanceCatalogueItemSearchResult[] {
  const limit = options?.limit ?? 12;
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  return catalogue
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
