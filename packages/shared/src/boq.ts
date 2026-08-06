export type BoqStatus = 'draft' | 'in_review' | 'approved' | 'converted' | 'cancelled';

export const BOQ_STATUS_OPTIONS: Array<{ value: BoqStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'converted', label: 'Converted To Quote' },
  { value: 'cancelled', label: 'Cancelled' },
];

export type BoqLineInput = {
  section?: string | null;
  itemNumber?: string | null;
  description: string;
  unit?: string | null;
  quantity: number;
  unitCostCents?: number | null;
  notes?: string | null;
};

export type BoqDocumentSummary = {
  id: string;
  boqNumber: string;
  title: string;
  status: BoqStatus;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  quoteId: string | null;
  sourceFilename: string | null;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoqLineItemDetail = {
  id: string;
  position: number;
  section: string | null;
  itemNumber: string | null;
  description: string;
  unit: string | null;
  quantity: string;
  unitCostCents: number | null;
  notes: string | null;
};

export type BoqDocumentDetail = BoqDocumentSummary & {
  notes: string | null;
  lineItems: BoqLineItemDetail[];
};

export type CreateBoqDocumentRequest = {
  title: string;
  customerId?: string | null;
  jobId?: string | null;
  sourceFilename?: string | null;
  notes?: string | null;
  lineItems: BoqLineInput[];
  clientActionId?: string | null;
};

export type UpdateBoqDocumentRequest = {
  title?: string;
  status?: BoqStatus;
  customerId?: string | null;
  jobId?: string | null;
  notes?: string | null;
  lineItems?: BoqLineInput[];
};

export type ConvertBoqToQuoteRequest = {
  clientActionId: string;
  customerId: string;
  jobId?: string | null;
  title?: string | null;
  markupBps?: number;
};

/** Parse CSV/TSV BOQ rows preserving section, item number, unit and quantity. */
export function parseBoqImportText(raw: string): BoqLineInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const delimiter = lines[0]!.includes('\t') ? '\t' : ',';
  const headerCells = lines[0]!.split(delimiter).map((cell) => cell.trim().toLowerCase());
  const hasHeader = headerCells.some((cell) =>
    ['description', 'item', 'qty', 'quantity', 'unit'].includes(cell),
  );

  const startIndex = hasHeader ? 1 : 0;
  const col = (names: string[]): number =>
    headerCells.findIndex((cell) => names.includes(cell));

  const sectionIdx = hasHeader ? col(['section', 'sheet']) : -1;
  const itemIdx = hasHeader ? col(['item', 'item_number', 'item number', 'no', '#']) : -1;
  const descIdx = hasHeader ? col(['description', 'desc', 'item description']) : 0;
  const unitIdx = hasHeader ? col(['unit', 'uom']) : 2;
  const qtyIdx = hasHeader ? col(['qty', 'quantity']) : 3;
  const costIdx = hasHeader ? col(['cost', 'unit_cost', 'unit cost', 'rate']) : -1;

  const parsed: BoqLineInput[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const description = hasHeader
      ? pickCell(cells, descIdx >= 0 ? descIdx : 0)
      : pickCell(cells, 0) || cells.join(delimiter).trim();
    if (!description) continue;

    const quantityRaw = pickCell(cells, qtyIdx);
    const quantity = quantityRaw ? Number.parseFloat(quantityRaw.replace(/,/g, '')) : 1;
    const costRaw = costIdx >= 0 ? pickCell(cells, costIdx) : null;
    const unitCostCents = costRaw ? parseMoneyToCents(costRaw) : null;

    parsed.push({
      section: sectionIdx >= 0 ? pickCell(cells, sectionIdx) || null : null,
      itemNumber: itemIdx >= 0 ? pickCell(cells, itemIdx) || null : null,
      description,
      unit: unitIdx >= 0 ? pickCell(cells, unitIdx) || null : null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitCostCents,
    });
  }

  return parsed;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function pickCell(cells: string[], index: number): string {
  if (index < 0 || index >= cells.length) return '';
  return cells[index]!.replace(/^"|"$/g, '').trim();
}

function parseMoneyToCents(value: string): number | null {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function boqMarkupPriceCents(unitCostCents: number, markupBps: number): number {
  return Math.round(unitCostCents * (1 + markupBps / 10000));
}
