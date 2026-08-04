import type { QuoteLineCategory } from '@titan/shared';
import { calculateLineAmounts, parseMoneyInput } from '@titan/shared';

export type FinanceEditorLine = {
  key: string;
  category: QuoteLineCategory;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  vatRateBps: string;
};

export function newFinanceEditorLine(category: QuoteLineCategory = 'labour'): FinanceEditorLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    description: '',
    quantity: '1',
    unitPrice: '',
    unitCost: '',
    vatRateBps: '1500',
  };
}

export function calculateEditorLineTotals(lines: FinanceEditorLine[]): {
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
} {
  let subtotalCents = 0;
  let vatTotalCents = 0;

  for (const line of lines) {
    const quantity = Number.parseFloat(line.quantity);
    const unitPriceCents = parseMoneyInput(line.unitPrice);
    const vatRateBps = Number.parseInt(line.vatRateBps, 10) || 1500;
    if (!Number.isFinite(quantity) || unitPriceCents === null) continue;
    const amounts = calculateLineAmounts({ quantity, unitPriceCents, vatRateBps });
    subtotalCents += amounts.lineSubtotalCents;
    vatTotalCents += amounts.lineVatCents;
  }

  return { subtotalCents, vatTotalCents, totalCents: subtotalCents + vatTotalCents };
}

export function parseEditorLinesForApi(lines: FinanceEditorLine[]): Array<{
  category: QuoteLineCategory;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;
  vatRateBps: number;
}> | null {
  const validLines = lines.filter((line) => line.description.trim() && line.unitPrice.trim());
  if (validLines.length === 0) return null;

  const parsed = validLines.map((line) => {
    const unitPriceCents = parseMoneyInput(line.unitPrice);
    if (unitPriceCents === null) return null;
    const unitCostCents = line.unitCost.trim() ? parseMoneyInput(line.unitCost) : null;
    return {
      category: line.category,
      description: line.description.trim(),
      quantity: Number.parseFloat(line.quantity) || 1,
      unitPriceCents,
      ...(unitCostCents != null ? { unitCostCents } : {}),
      vatRateBps: Number.parseInt(line.vatRateBps, 10) || 1500,
    };
  });

  if (parsed.some((line) => line === null)) return null;
  return parsed as Array<{
    category: QuoteLineCategory;
    description: string;
    quantity: number;
    unitPriceCents: number;
    unitCostCents?: number;
    vatRateBps: number;
  }>;
}
