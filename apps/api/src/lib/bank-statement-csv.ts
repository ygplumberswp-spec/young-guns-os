export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

/** Minimal RFC4180-ish CSV parser — tested for bank statement imports. */
export function parseCsvContent(content: string): ParsedCsv {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0] ?? '');
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    while (cells.length < headers.length) cells.push('');
    return cells.slice(0, headers.length);
  });

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  out.push(current.trim());
  return out;
}

export function detectColumnMapping(headers: string[]): {
  date: string;
  amount: string;
  description?: string;
  reference?: string;
} | null {
  const normalized = headers.map((header) => ({
    original: header,
    key: header.trim().toLowerCase(),
  }));

  const find = (...candidates: string[]) =>
    normalized.find((header) => candidates.some((candidate) => header.key.includes(candidate)))
      ?.original;

  const date = find('date', 'transaction date', 'posted');
  const amount = find('amount', 'value', 'debit', 'credit');
  if (!date || !amount) return null;

  return {
    date,
    amount,
    description: find('description', 'narrative', 'details', 'memo'),
    reference: find('reference', 'ref', 'cheque'),
  };
}

export function parseStatementDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const [, a, b, c] = slash;
    const year = c!.length === 2 ? `20${c}` : c!;
    return `${year}-${a!.padStart(2, '0')}-${b!.padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function parseStatementAmountCents(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  let value = raw.trim().replace(/[R$€£\s,]/g, '');
  let negative = false;

  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1);
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(Math.abs(parsed) * 100);
  return negative ? -cents : cents;
}

export function buildStatementRowFingerprint(input: {
  bankAccountCode: string;
  transactionDate: string | null;
  amountCents: number | null;
  reference: string | null;
  description: string | null;
}): string {
  const parts = [
    input.bankAccountCode,
    input.transactionDate ?? '',
    input.amountCents?.toString() ?? '',
    (input.reference ?? '').trim().toLowerCase(),
    (input.description ?? '').trim().toLowerCase(),
  ];
  return parts.join('|');
}
