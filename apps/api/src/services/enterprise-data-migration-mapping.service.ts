import type { DmEntityType, DmSourceFormat } from '@titan/shared';
import { DM_ENTITY_FIELD_TARGETS } from '@titan/shared';

export type ParsedRow = Record<string, string>;

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'customer name', 'customer_name', 'full name', 'fullname', 'company', 'company name'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  phone: ['phone', 'mobile', 'cell', 'cell number', 'telephone', 'contact number', 'phone number'],
  mobile: ['mobile', 'cell', 'cell number', 'phone mobile'],
  title: ['title', 'job title', 'subject', 'name'],
  contactName: ['contact name', 'contact', 'contact_name', 'person'],
  contactEmail: ['contact email', 'contact_email'],
  contactPhone: ['contact phone', 'contact_phone', 'contact mobile'],
  status: ['status', 'state'],
  notes: ['notes', 'note', 'comments', 'description'],
  sku: ['sku', 'product code', 'item code', 'code'],
  amountCents: ['amount', 'total', 'invoice total', 'price', 'amount cents'],
  quoteNumber: ['quote number', 'quote_number', 'quote no', 'quote #'],
  invoiceNumber: ['invoice number', 'invoice_number', 'invoice no', 'invoice #'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
}

export function parseFileContent(sourceFormat: DmSourceFormat, fileContent: string): ParsedRow[] {
  if (!fileContent.trim()) return [];

  if (sourceFormat === 'json') {
    const parsed = JSON.parse(fileContent) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((row) => normalizeRow(row as Record<string, unknown>));
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { records?: unknown }).records)) {
      return ((parsed as { records: Record<string, unknown>[] }).records ?? []).map(normalizeRow);
    }
    return [];
  }

  if (sourceFormat === 'csv' || sourceFormat === 'excel') {
    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = splitCsvLine(lines[0]!);
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      return row;
    });
  }

  if (sourceFormat === 'xml') {
    const rows: ParsedRow[] = [];
    const recordMatches = fileContent.matchAll(/<record[^>]*>([\s\S]*?)<\/record>/gi);
    for (const match of recordMatches) {
      const row: ParsedRow = {};
      const fieldMatches = match[1]!.matchAll(/<([a-zA-Z0-9_-]+)[^>]*>([^<]*)<\/\1>/g);
      for (const field of fieldMatches) {
        row[field[1]!] = field[2]!.trim();
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
    return rows;
  }

  return [];
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function normalizeRow(row: Record<string, unknown>): ParsedRow {
  const normalized: ParsedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value == null ? '' : String(value);
  }
  return normalized;
}

export function detectStructure(rows: ParsedRow[]): Record<string, unknown> {
  if (rows.length === 0) return { columns: [], rowCount: 0 };
  const columns = Object.keys(rows[0] ?? {});
  return {
    columns,
    rowCount: rows.length,
    sampleRow: rows[0] ?? {},
  };
}

export function suggestFieldMappings(
  entityType: DmEntityType,
  columns: string[],
): Record<string, { targetField: string; confidence: number }> {
  const targets = DM_ENTITY_FIELD_TARGETS[entityType] ?? [];
  const suggestions: Record<string, { targetField: string; confidence: number }> = {};

  for (const column of columns) {
    const normalizedColumn = normalizeHeader(column);
    let bestTarget = '';
    let bestScore = 0;

    for (const target of targets) {
      const aliases = FIELD_ALIASES[target] ?? [target];
      for (const alias of aliases) {
        if (normalizedColumn === alias) {
          bestTarget = target;
          bestScore = 1;
          break;
        }
        if (normalizedColumn.includes(alias) || alias.includes(normalizedColumn)) {
          if (0.85 > bestScore) {
            bestTarget = target;
            bestScore = 0.85;
          }
        }
      }
      if (bestScore === 1) break;
    }

    if (bestTarget) {
      suggestions[column] = { targetField: bestTarget, confidence: bestScore };
    }
  }

  return suggestions;
}

export function applyMappings(rows: ParsedRow[], mappings: Record<string, string>): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [sourceField, targetField] of Object.entries(mappings)) {
      if (row[sourceField] != null && row[sourceField] !== '') {
        mapped[targetField] = row[sourceField]!;
      }
    }
    return mapped;
  });
}

export class EnterpriseDataMigrationMappingService {
  parseFileContent = parseFileContent;
  detectStructure = detectStructure;
  suggestFieldMappings = suggestFieldMappings;
  applyMappings = applyMappings;
}
