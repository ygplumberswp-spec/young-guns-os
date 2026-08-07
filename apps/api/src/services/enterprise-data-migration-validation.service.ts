import type { DmEntityType, DmValidationSeverity } from '@titan/shared';
import {
  DM_ENTITY_FIELD_TARGETS,
  isPhysicalStockImportCandidate,
  normalizeHistoricalDocumentNumber,
  normalizeSupplierNameForMatch,
  previewInventoryStockImpact,
} from '@titan/shared';

export type ValidationIssue = {
  rowNumber: number;
  fieldName: string | null;
  severity: DmValidationSeverity;
  errorCode: string;
  message: string;
};

const REQUIRED_FIELDS: Partial<Record<DmEntityType, string[]>> = {
  customer: ['name'],
  lead: ['title', 'contactName'],
  supplier: ['name'],
  contact: ['name'],
  property: ['propertyName'],
  asset: ['name'],
  job: ['title', 'customerName'],
  quote: ['quoteNumber', 'customerName', 'amountCents'],
  invoice: ['invoiceNumber', 'customerName', 'amountCents'],
  payment: ['invoiceNumber', 'amountCents'],
  inventory: ['sku', 'name'],
  price_book: ['code', 'name', 'sellPriceCents'],
  document: ['fileName'],
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isValidCurrency(value: string): boolean {
  return /^-?\d+(\.\d{1,2})?$/.test(value.replace(/[,$\sR]/gi, ''));
}

export class EnterpriseDataMigrationValidationService {
  validateRows(
    entityType: DmEntityType,
    rows: Record<string, string>[],
    existingKeys: Set<string>,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const required = REQUIRED_FIELDS[entityType] ?? ['name'];
    const validTargets = new Set(DM_ENTITY_FIELD_TARGETS[entityType] ?? []);

    // property accepts either propertyName or name
    const requiredForRow = (row: Record<string, string>) => {
      if (entityType === 'property') {
        const missing: string[] = [];
        if (!(row.propertyName?.trim() || row.name?.trim())) missing.push('propertyName');
        if (!(row.customerName?.trim() || row.customerEmail?.trim() || row.customerId?.trim())) {
          missing.push('customerName');
        }
        return missing;
      }
      if (entityType === 'price_book') {
        const missing: string[] = [];
        if (!(row.code?.trim() || row.sku?.trim())) missing.push('code');
        if (!row.name?.trim()) missing.push('name');
        if (!(row.sellPriceCents?.trim() || row.amountCents?.trim())) missing.push('sellPriceCents');
        return missing;
      }
      return required.filter((field) => !row[field]?.trim());
    };

    rows.forEach((row, index) => {
      const rowNumber = index + 1;

      for (const field of requiredForRow(row)) {
        issues.push({
          rowNumber,
          fieldName: field,
          severity: 'error',
          errorCode: 'required_field_missing',
          message: `Required field "${field}" is missing.`,
        });
      }

      if (row.email && validTargets.has('email') && !isValidEmail(row.email)) {
        issues.push({
          rowNumber,
          fieldName: 'email',
          severity: 'error',
          errorCode: 'invalid_email_format',
          message: 'Invalid email format.',
        });
      }

      if (row.contactEmail && !isValidEmail(row.contactEmail)) {
        issues.push({
          rowNumber,
          fieldName: 'contactEmail',
          severity: 'error',
          errorCode: 'invalid_email_format',
          message: 'Invalid contact email format.',
        });
      }

      if (row.scheduledAt && !isValidDate(row.scheduledAt)) {
        issues.push({
          rowNumber,
          fieldName: 'scheduledAt',
          severity: 'error',
          errorCode: 'invalid_date_format',
          message: 'Invalid date format.',
        });
      }

      if (row.issuedAt && !isValidDate(row.issuedAt)) {
        issues.push({
          rowNumber,
          fieldName: 'issuedAt',
          severity: 'error',
          errorCode: 'invalid_date_format',
          message: 'Invalid issued date format.',
        });
      }

      if (row.amountCents && !isValidCurrency(row.amountCents)) {
        issues.push({
          rowNumber,
          fieldName: 'amountCents',
          severity: 'error',
          errorCode: 'invalid_currency_format',
          message: 'Invalid currency/amount format.',
        });
      }

      if (row.sellPriceCents && !isValidCurrency(row.sellPriceCents)) {
        issues.push({
          rowNumber,
          fieldName: 'sellPriceCents',
          severity: 'error',
          errorCode: 'invalid_currency_format',
          message: 'Invalid sell price format.',
        });
      }

      if (entityType === 'payment') {
        const kind = (row.kind ?? 'PAYMENT_RECORD').toUpperCase();
        if (kind.includes('PROOF') || kind === 'POP') {
          issues.push({
            rowNumber,
            fieldName: 'kind',
            severity: 'info',
            errorCode: 'payment_proof_not_ledger',
            message:
              'Proof-of-payment documents will be linked as attachments and will not automatically mark the invoice paid.',
          });
        }
      }

      if (entityType === 'inventory') {
        const physical = isPhysicalStockImportCandidate({
          name: row.name,
          description: row.description,
          category: row.category,
          itemType: row.itemType,
        });
        if (!physical.accepted) {
          issues.push({
            rowNumber,
            fieldName: 'name',
            severity: 'error',
            errorCode: 'not_physical_stock',
            message: physical.reason ?? 'Labour/service items cannot become physical stock.',
          });
        }
        const qty = row.quantity?.trim();
        if (qty) {
          const parsed = Number(qty.replace(/,/g, ''));
          const impact = previewInventoryStockImpact({
            sku: row.sku ?? '',
            itemExists: existingKeys.has(buildDuplicateKey('inventory', row)),
            proposedQuantity: Number.isFinite(parsed) ? Math.trunc(parsed) : null,
            locationName: row.location?.trim() || null,
          });
          issues.push({
            rowNumber,
            fieldName: 'quantity',
            severity: impact.warning?.includes('Negative') ? 'error' : 'info',
            errorCode: 'inventory_stock_preview',
            message: [
              `Stock preview: action=${impact.action}`,
              impact.proposedQuantityOnHand != null
                ? `proposedQty=${impact.proposedQuantityOnHand}`
                : null,
              impact.existingQuantityOnHand != null
                ? `existingQty=${impact.existingQuantityOnHand}`
                : null,
              impact.willWriteStock ? 'willWriteStock=yes' : 'willWriteStock=no',
              impact.warning,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
      }

      const duplicateKey = buildDuplicateKey(entityType, row);
      if (duplicateKey && !duplicateKey.endsWith(':') && existingKeys.has(duplicateKey)) {
        issues.push({
          rowNumber,
          fieldName: null,
          severity: 'warning',
          errorCode: 'duplicate_detected',
          message: `Potential duplicate detected for key "${duplicateKey}". Human review required before commit.`,
        });
      }
    });

    return issues;
  }

  hasBlockingErrors(issues: ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === 'error');
  }

  summarize(issues: ValidationIssue[]): Record<string, unknown> {
    return {
      totalIssues: issues.length,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      infoCount: issues.filter((i) => i.severity === 'info').length,
    };
  }
}

export function buildDuplicateKey(entityType: DmEntityType, row: Record<string, string>): string {
  switch (entityType) {
    case 'customer':
      return `${entityType}:${(row.email ?? row.name ?? '').toLowerCase().trim()}`;
    case 'supplier': {
      if (row.sourceExternalId?.trim()) {
        return `supplier:ext:${row.sourceExternalId.trim().toLowerCase()}`;
      }
      if (row.supplierCode?.trim()) {
        return `supplier:code:${row.supplierCode.trim().toLowerCase()}`;
      }
      if (row.email?.trim()) {
        return `supplier:${row.email.trim().toLowerCase()}`;
      }
      return `supplier:${normalizeSupplierNameForMatch(row.name)}`;
    }
    case 'lead':
      return `lead:${(row.contactEmail ?? row.contactName ?? row.title ?? '').toLowerCase().trim()}`;
    case 'contact':
      return `contact:${(row.email ?? row.name ?? '').toLowerCase().trim()}`;
    case 'property':
      return `property:${(row.customerName ?? row.customerEmail ?? '').toLowerCase().trim()}|${(
        row.propertyName ??
        row.name ??
        row.address ??
        ''
      )
        .toLowerCase()
        .trim()}`;
    case 'asset':
      return `asset:${(row.serialNumber ?? row.sourceExternalId ?? row.name ?? '').toLowerCase().trim()}`;
    case 'job':
      return `job:${normalizeHistoricalDocumentNumber(row.jobNumber) || (row.title ?? '').toLowerCase().trim()}|${(
        row.customerName ??
        row.customerEmail ??
        ''
      )
        .toLowerCase()
        .trim()}`;
    case 'quote':
      return `quote:${normalizeHistoricalDocumentNumber(row.quoteNumber)}`;
    case 'invoice':
      return `invoice:${normalizeHistoricalDocumentNumber(row.invoiceNumber)}`;
    case 'payment':
      return `payment:${normalizeHistoricalDocumentNumber(row.invoiceNumber)}|${(row.reference ?? row.amountCents ?? '').toLowerCase().trim()}`;
    case 'inventory':
      return `inventory:${(row.sku ?? '').toLowerCase().trim()}`;
    case 'price_book':
      return `price_book:${(row.code ?? row.sku ?? '').toLowerCase().trim()}`;
    case 'document':
      return `document:${(row.fileName ?? row.title ?? '').toLowerCase().trim()}|${normalizeHistoricalDocumentNumber(row.jobNumber ?? row.quoteNumber ?? row.invoiceNumber)}`;
    default:
      return `${entityType}:${(row.name ?? row.title ?? row.email ?? '').toLowerCase().trim()}`;
  }
}

export function findDuplicates(
  entityType: DmEntityType,
  rows: Record<string, string>[],
  existingKeys: Set<string>,
  existingKeyToEntityId: Map<string, string> = new Map(),
): Array<{ rowNumber: number; duplicateKey: string; existingEntityId: string | null }> {
  const duplicates: Array<{
    rowNumber: number;
    duplicateKey: string;
    existingEntityId: string | null;
  }> = [];
  rows.forEach((row, index) => {
    const duplicateKey = buildDuplicateKey(entityType, row);
    if (duplicateKey.endsWith(':') || duplicateKey.endsWith('|')) return;
    if (existingKeys.has(duplicateKey)) {
      duplicates.push({
        rowNumber: index + 1,
        duplicateKey,
        existingEntityId: existingKeyToEntityId.get(duplicateKey) ?? null,
      });
    }
  });
  return duplicates;
}
