import type { QuoteLineCategory } from './finance.js';

export type FinanceCatalogueSourceType = 'inventory' | 'materials' | 'service' | 'labour';

export type FinanceCatalogueItemSearchResult = {
  /** Stable key for duplicate detection — inventory:{id} or builtin:{code} */
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

/** Read-only labour & service catalogue bundled with TITAN (not persisted as master items). */
export const BUILTIN_FINANCE_CATALOGUE: FinanceCatalogueItemSearchResult[] = [
  {
    sourceKey: 'builtin:LAB-CALLOUT',
    sourceType: 'labour',
    itemCode: 'LAB-CALLOUT',
    name: 'Call-out fee',
    shortDescription: 'Standard site attendance / call-out labour',
    sellPriceCents: 45000,
    unitCostCents: null,
    unit: 'each',
    category: 'travel',
  },
  {
    sourceKey: 'builtin:LAB-HOURLY',
    sourceType: 'labour',
    itemCode: 'LAB-HOURLY',
    name: 'Standard labour — hourly',
    shortDescription: 'Qualified plumber labour per hour',
    sellPriceCents: 65000,
    unitCostCents: null,
    unit: 'hour',
    category: 'labour',
  },
  {
    sourceKey: 'builtin:LAB-AFTERHOURS',
    sourceType: 'labour',
    itemCode: 'LAB-AFTERHOURS',
    name: 'After-hours labour — hourly',
    shortDescription: 'After-hours / emergency labour rate',
    sellPriceCents: 95000,
    unitCostCents: null,
    unit: 'hour',
    category: 'labour',
  },
  {
    sourceKey: 'builtin:SRV-GEYSER-INSTALL',
    sourceType: 'service',
    itemCode: 'SRV-GEYSER-INSTALL',
    name: 'Geyser installation',
    shortDescription: 'Supply and install geyser (labour component)',
    sellPriceCents: 250000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'builtin:SRV-LEAK-REPAIR',
    sourceType: 'service',
    itemCode: 'SRV-LEAK-REPAIR',
    name: 'Leak detection & repair',
    shortDescription: 'Diagnose and repair water leak',
    sellPriceCents: 85000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'builtin:SRV-DRAIN-CLEAR',
    sourceType: 'service',
    itemCode: 'SRV-DRAIN-CLEAR',
    name: 'Drain clearing',
    shortDescription: 'Clear blocked drain line',
    sellPriceCents: 75000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
  {
    sourceKey: 'builtin:SRV-COC',
    sourceType: 'service',
    itemCode: 'SRV-COC',
    name: 'Certificate of Compliance (CoC)',
    shortDescription: 'Plumbing CoC inspection and issue',
    sellPriceCents: 120000,
    unitCostCents: null,
    unit: 'each',
    category: 'scope',
  },
];

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
  options?: { excludeSourceKeys?: string[]; limit?: number },
): FinanceCatalogueItemSearchResult[] {
  const exclude = new Set(options?.excludeSourceKeys ?? []);
  const limit = options?.limit ?? 12;
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  return catalogue
    .filter((item) => !exclude.has(item.sourceKey))
    .map((item) => ({ item, score: scoreCatalogueMatch(trimmed, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((row) => row.item);
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
