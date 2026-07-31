import type { DmEntityType, DmValidationSeverity } from '@titan/shared';
import { DM_ENTITY_FIELD_TARGETS } from '@titan/shared';

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
  job: ['title', 'customerName'],
  quote: ['title', 'customerName'],
  invoice: ['title', 'customerName'],
  inventory: ['sku', 'name'],
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isValidCurrency(value: string): boolean {
  return /^-?\d+(\.\d{1,2})?$/.test(value.replace(/[,$\s]/g, ''));
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

    rows.forEach((row, index) => {
      const rowNumber = index + 1;

      for (const field of required) {
        if (!row[field]?.trim()) {
          issues.push({
            rowNumber,
            fieldName: field,
            severity: 'error',
            errorCode: 'required_field_missing',
            message: `Required field "${field}" is missing.`,
          });
        }
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

      if (row.amountCents && !isValidCurrency(row.amountCents)) {
        issues.push({
          rowNumber,
          fieldName: 'amountCents',
          severity: 'error',
          errorCode: 'invalid_currency_format',
          message: 'Invalid currency/amount format.',
        });
      }

      const duplicateKey = buildDuplicateKey(entityType, row);
      if (duplicateKey && existingKeys.has(duplicateKey)) {
        issues.push({
          rowNumber,
          fieldName: null,
          severity: 'warning',
          errorCode: 'duplicate_detected',
          message: `Potential duplicate detected for key "${duplicateKey}".`,
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
    case 'supplier':
      return `${entityType}:${(row.email ?? row.name ?? '').toLowerCase().trim()}`;
    case 'lead':
      return `lead:${(row.contactEmail ?? row.contactName ?? row.title ?? '').toLowerCase().trim()}`;
    case 'inventory':
      return `inventory:${(row.sku ?? '').toLowerCase().trim()}`;
    default:
      return `${entityType}:${(row.name ?? row.title ?? row.email ?? '').toLowerCase().trim()}`;
  }
}

export function findDuplicates(
  entityType: DmEntityType,
  rows: Record<string, string>[],
  existingKeys: Set<string>,
): Array<{ rowNumber: number; duplicateKey: string; existingEntityId: string | null }> {
  const duplicates: Array<{
    rowNumber: number;
    duplicateKey: string;
    existingEntityId: string | null;
  }> = [];
  rows.forEach((row, index) => {
    const duplicateKey = buildDuplicateKey(entityType, row);
    if (duplicateKey.endsWith(':')) return;
    if (existingKeys.has(duplicateKey)) {
      duplicates.push({ rowNumber: index + 1, duplicateKey, existingEntityId: null });
    }
  });
  return duplicates;
}
