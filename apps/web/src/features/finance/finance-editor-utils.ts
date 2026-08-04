import type { QuoteLineCategory } from '@titan/shared';
import { buildCatalogueLineAutoFill, calculateLineAmounts, parseMoneyInput } from '@titan/shared';
import type { FinanceCatalogueItemSearchResult } from '@titan/shared';

export type FinanceEditorLine = {
  key: string;
  category: QuoteLineCategory;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
  vatRateBps: string;
  /** Set when line originated from catalogue pick — used for duplicate prevention only. */
  catalogueSourceKey?: string | null;
  isManualLine?: boolean;
};

export type FinanceDocumentVatMode = 'standard' | 'zero';
export type FinanceDocumentPriceMode = 'excluding_vat' | 'including_vat';

export type FinanceDocumentAddresses = {
  billingAddress: string;
  siteAddress: string;
  postalAddress: string;
};

export const FINANCE_EDITOR_MIN_BLANK_ROWS = 5;
export const STANDARD_VAT_BPS = 1500;

let lineCounter = 0;

export function newFinanceEditorLine(category: QuoteLineCategory = 'labour'): FinanceEditorLine {
  lineCounter += 1;
  return {
    key: `line-${Date.now()}-${lineCounter}`,
    category,
    description: '',
    quantity: '1',
    unit: '',
    unitPrice: '',
    unitCost: '',
    vatRateBps: String(STANDARD_VAT_BPS),
    catalogueSourceKey: null,
    isManualLine: false,
  };
}

export function createBlankEditorLines(count = FINANCE_EDITOR_MIN_BLANK_ROWS): FinanceEditorLine[] {
  return Array.from({ length: count }, () => newFinanceEditorLine());
}

export function resolveDocumentVatBps(vatMode: FinanceDocumentVatMode): number {
  return vatMode === 'zero' ? 0 : STANDARD_VAT_BPS;
}

/** Convert entered unit price to ex-VAT cents for API storage. */
export function unitPriceToExVatCents(
  unitPriceInput: string,
  priceMode: FinanceDocumentPriceMode,
  vatRateBps: number,
): number | null {
  const parsed = parseMoneyInput(unitPriceInput);
  if (parsed === null) return null;
  if (priceMode === 'excluding_vat' || vatRateBps === 0) return parsed;
  return Math.round(parsed / (1 + vatRateBps / 10_000));
}

/** Convert stored ex-VAT cents to display value for the editor. */
export function exVatCentsToDisplay(
  unitPriceCents: number,
  priceMode: FinanceDocumentPriceMode,
  vatRateBps: number,
): string {
  if (unitPriceCents <= 0) return '';
  if (priceMode === 'excluding_vat' || vatRateBps === 0) {
    return (unitPriceCents / 100).toFixed(2);
  }
  const incVat = Math.round(unitPriceCents * (1 + vatRateBps / 10_000));
  return (incVat / 100).toFixed(2);
}

export function calculateEditorLineTotals(
  lines: FinanceEditorLine[],
  options?: {
    priceMode?: FinanceDocumentPriceMode;
    vatMode?: FinanceDocumentVatMode;
  },
): {
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
} {
  const priceMode = options?.priceMode ?? 'excluding_vat';
  const vatMode = options?.vatMode ?? 'standard';
  const documentVatBps = resolveDocumentVatBps(vatMode);

  let subtotalCents = 0;
  let vatTotalCents = 0;

  for (const line of lines) {
    const quantity = Number.parseFloat(line.quantity);
    const lineVatBps =
      vatMode === 'zero' ? 0 : Number.parseInt(line.vatRateBps, 10) || documentVatBps;
    const unitPriceCents = unitPriceToExVatCents(line.unitPrice, priceMode, lineVatBps);
    if (!Number.isFinite(quantity) || unitPriceCents === null) continue;
    const amounts = calculateLineAmounts({ quantity, unitPriceCents, vatRateBps: lineVatBps });
    subtotalCents += amounts.lineSubtotalCents;
    vatTotalCents += amounts.lineVatCents;
  }

  return { subtotalCents, vatTotalCents, totalCents: subtotalCents + vatTotalCents };
}

export type ParsedEditorLine = {
  category: QuoteLineCategory;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;
  vatRateBps: number;
};

function mapLineForApi(
  line: FinanceEditorLine,
  priceMode: FinanceDocumentPriceMode,
  vatMode: FinanceDocumentVatMode,
): ParsedEditorLine | null {
  const vatRateBps = resolveDocumentVatBps(vatMode);
  const unitPriceCents = unitPriceToExVatCents(line.unitPrice, priceMode, vatRateBps);
  if (unitPriceCents === null || !line.description.trim()) return null;
  const unitCostCents = line.unitCost.trim() ? parseMoneyInput(line.unitCost) : null;
  return {
    category: line.category,
    description: line.description.trim(),
    quantity: Number.parseFloat(line.quantity) || 1,
    unitPriceCents,
    ...(unitCostCents != null ? { unitCostCents } : {}),
    vatRateBps,
  };
}

/** Strict parse for Approve/Send — requires at least one complete line. */
export function parseEditorLinesForApi(
  lines: FinanceEditorLine[],
  options?: { priceMode?: FinanceDocumentPriceMode; vatMode?: FinanceDocumentVatMode },
): ParsedEditorLine[] | null {
  const priceMode = options?.priceMode ?? 'excluding_vat';
  const vatMode = options?.vatMode ?? 'standard';
  const parsed = lines
    .map((line) => mapLineForApi(line, priceMode, vatMode))
    .filter((line): line is ParsedEditorLine => line !== null);
  return parsed.length > 0 ? parsed : null;
}

/** Draft parse — always returns at least one placeholder line so Save Draft can persist. */
export function parseEditorLinesForDraft(
  lines: FinanceEditorLine[],
  options?: { priceMode?: FinanceDocumentPriceMode; vatMode?: FinanceDocumentVatMode },
): ParsedEditorLine[] {
  const strict = parseEditorLinesForApi(lines, options);
  if (strict?.length) return strict;
  return [
    {
      category: 'other',
      description: 'Draft — line items pending',
      quantity: 1,
      unitPriceCents: 0,
      vatRateBps: resolveDocumentVatBps(options?.vatMode ?? 'standard'),
    },
  ];
}

/** Preview parse — includes every entered line; skips fully blank rows. */
export function parseEditorLinesForPreview(
  lines: FinanceEditorLine[],
  options?: { priceMode?: FinanceDocumentPriceMode; vatMode?: FinanceDocumentVatMode },
): ParsedEditorLine[] {
  return lines
    .map((line) => mapLineForApi(line, options?.priceMode ?? 'excluding_vat', options?.vatMode ?? 'standard'))
    .filter((line): line is ParsedEditorLine => line !== null);
}

export function isEditorLineBlank(line: FinanceEditorLine): boolean {
  return !line.description.trim() && !line.unitPrice.trim();
}

export function ensureTrailingBlankLines(
  lines: FinanceEditorLine[],
  minTrailing = 1,
): FinanceEditorLine[] {
  const next = [...lines];
  let trailing = 0;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (isEditorLineBlank(next[i]!)) trailing += 1;
    else break;
  }
  while (trailing < minTrailing) {
    next.push(newFinanceEditorLine());
    trailing += 1;
  }
  return next;
}

export function applyDocumentVatMode(
  lines: FinanceEditorLine[],
  vatMode: FinanceDocumentVatMode,
): FinanceEditorLine[] {
  const vatRateBps = String(resolveDocumentVatBps(vatMode));
  return lines.map((line) => ({ ...line, vatRateBps }));
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayDateInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

export function addressesToApiPayload(addresses: FinanceDocumentAddresses) {
  return {
    billingAddress: addresses.billingAddress.trim() || null,
    siteAddress: addresses.siteAddress.trim() || null,
    postalAddress: addresses.postalAddress.trim() || null,
  };
}

export function addressesFromSnapshot(snapshot: {
  billingAddress: string | null;
  siteAddress: string | null;
  postalAddress: string | null;
}): FinanceDocumentAddresses {
  return {
    billingAddress: snapshot.billingAddress ?? '',
    siteAddress: snapshot.siteAddress ?? '',
    postalAddress: snapshot.postalAddress ?? '',
  };
}

export function inferVatModeFromLines(
  lineItems: Array<{ vatRateBps: number }>,
): FinanceDocumentVatMode {
  if (lineItems.length === 0) return 'standard';
  return lineItems.every((line) => line.vatRateBps === 0) ? 'zero' : 'standard';
}

export function lineItemsToEditorLines(
  lineItems: Array<{
    id: string;
    category: QuoteLineCategory | string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    unitCostCents?: number | null;
    vatRateBps: number;
  }>,
  priceMode: FinanceDocumentPriceMode = 'excluding_vat',
): FinanceEditorLine[] {
  const mapped = lineItems.map((line) => ({
    key: line.id,
    category: line.category as QuoteLineCategory,
    description: line.description,
    quantity: String(line.quantity),
    unit: '',
    unitPrice: exVatCentsToDisplay(line.unitPriceCents, priceMode, line.vatRateBps),
    unitCost: line.unitCostCents != null ? (line.unitCostCents / 100).toFixed(2) : '',
    vatRateBps: String(line.vatRateBps),
    catalogueSourceKey: null,
    isManualLine: true,
  }));
  return ensureTrailingBlankLines(mapped.length ? mapped : createBlankEditorLines(), 2);
}

export function applyCatalogueItemToEditorLine(
  line: FinanceEditorLine,
  item: FinanceCatalogueItemSearchResult,
  options: { priceMode: FinanceDocumentPriceMode; vatMode: FinanceDocumentVatMode },
): FinanceEditorLine {
  const vatRateBps = resolveDocumentVatBps(options.vatMode);
  const autoFill = buildCatalogueLineAutoFill(item, vatRateBps);
  return {
    ...line,
    catalogueSourceKey: autoFill.catalogueSourceKey,
    isManualLine: false,
    category: autoFill.category,
    description: autoFill.description,
    quantity: autoFill.quantity,
    unit: autoFill.unit,
    unitPrice:
      autoFill.unitPriceCents != null
        ? exVatCentsToDisplay(autoFill.unitPriceCents, options.priceMode, vatRateBps)
        : '',
    unitCost:
      autoFill.unitCostCents != null ? (autoFill.unitCostCents / 100).toFixed(2) : line.unitCost,
    vatRateBps: String(autoFill.vatRateBps),
  };
}

export function applyManualLineDescription(
  line: FinanceEditorLine,
  description: string,
): FinanceEditorLine {
  return {
    ...line,
    description: description.trim(),
    catalogueSourceKey: null,
    isManualLine: true,
  };
}
