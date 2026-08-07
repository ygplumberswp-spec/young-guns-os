/**
 * JPE-002A — Deterministic financial-source fingerprint for review staleness.
 *
 * Replaces max-timestamp fingerprinting with a stable SHA-256 hash of
 * profitability-driving source state (add/update/delete/allocation safe).
 */

import { createHash } from 'node:crypto';
import { JPE_CALCULATION_VERSION } from './job-profitability.js';

/** Bump when canonical fingerprint input shape or hashing rules change. */
export const JPE_FINANCIAL_FINGERPRINT_VERSION = 1;

export type JobFinancialFingerprintInvoice = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  vatCents: number;
  amountPaidCents: number;
};

export type JobFinancialFingerprintQuoteLine = {
  id: string;
  category: string;
  lineCostCents: number | null;
  lineSubtotalCents: number;
  isOptional: boolean;
};

export type JobFinancialFingerprintQuote = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  lineItems: JobFinancialFingerprintQuoteLine[];
};

export type JobFinancialFingerprintAdjustment = {
  id: string;
  kind: string;
  amountCents: number;
};

export type JobFinancialFingerprintMaterial = {
  id: string;
  status: string;
  quantity: string;
  fulfilledQuantity: string | null;
  unitCostCents: number;
  materialSource: string;
};

export type JobFinancialFingerprintPoItem = {
  id: string;
  lineTotalCents: number;
};

export type JobFinancialFingerprintPurchaseOrder = {
  id: string;
  status: string;
  totalCostCents: number;
  items: JobFinancialFingerprintPoItem[];
};

export type JobFinancialFingerprintLabour = {
  id: string;
  entryType: string;
  durationMinutes: number;
  hourlyCostCents: number;
  overtimeMultiplier: number;
  hourlyCostLockedAt: string | null;
};

export type JobFinancialFingerprintDirectCost = {
  id: string;
  category: string;
  amountCents: number;
  sourceType: string;
  sourceId: string;
  isPaid: boolean;
  receiptDocumentId: string | null;
};

export type JobFinancialFingerprintPayment = {
  id: string;
  amountCents: number;
  xeroPaymentStatus: string | null;
};

export type JobFinancialFingerprintInput = {
  jobId: string;
  calculationVersion: number;
  fingerprintVersion: number;
  invoices: JobFinancialFingerprintInvoice[];
  quotes: JobFinancialFingerprintQuote[];
  adjustments: JobFinancialFingerprintAdjustment[];
  materialLines: JobFinancialFingerprintMaterial[];
  purchaseOrders: JobFinancialFingerprintPurchaseOrder[];
  labourEntries: JobFinancialFingerprintLabour[];
  directCosts: JobFinancialFingerprintDirectCost[];
  payments: JobFinancialFingerprintPayment[];
};

function sortById<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

/** Stable JSON for fingerprint — explicit ordering, no freeform text. */
export function buildJobFinancialFingerprintCanonical(input: JobFinancialFingerprintInput): string {
  const payload = {
    fingerprintVersion: input.fingerprintVersion,
    calculationVersion: input.calculationVersion,
    jobId: input.jobId,
    revenue: {
      invoices: sortById(input.invoices).map((row) => ({
        id: row.id,
        status: row.status,
        totalCents: row.totalCents,
        subtotalCents: row.subtotalCents,
        vatCents: row.vatCents,
        amountPaidCents: row.amountPaidCents,
      })),
      quotes: sortById(input.quotes).map((row) => ({
        id: row.id,
        status: row.status,
        totalCents: row.totalCents,
        subtotalCents: row.subtotalCents,
        lineItems: [...row.lineItems]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((line) => ({
            id: line.id,
            category: line.category,
            lineCostCents: line.lineCostCents,
            lineSubtotalCents: line.lineSubtotalCents,
            isOptional: line.isOptional,
          })),
      })),
      adjustments: sortById(input.adjustments).map((row) => ({
        id: row.id,
        kind: row.kind,
        amountCents: row.amountCents,
      })),
    },
    materials: sortById(input.materialLines).map((row) => ({
      id: row.id,
      status: row.status,
      quantity: row.quantity,
      fulfilledQuantity: row.fulfilledQuantity,
      unitCostCents: row.unitCostCents,
      materialSource: row.materialSource,
    })),
    purchaseOrders: sortById(input.purchaseOrders).map((row) => ({
      id: row.id,
      status: row.status,
      totalCostCents: row.totalCostCents,
      items: [...row.items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => ({ id: item.id, lineTotalCents: item.lineTotalCents })),
    })),
    labour: sortById(input.labourEntries).map((row) => ({
      id: row.id,
      entryType: row.entryType,
      durationMinutes: row.durationMinutes,
      hourlyCostCents: row.hourlyCostCents,
      overtimeMultiplier: row.overtimeMultiplier,
      hourlyCostLockedAt: row.hourlyCostLockedAt,
    })),
    directCosts: sortById(input.directCosts).map((row) => ({
      id: row.id,
      category: row.category,
      amountCents: row.amountCents,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      isPaid: row.isPaid,
      receiptDocumentId: row.receiptDocumentId,
    })),
    payments: sortById(input.payments).map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      xeroPaymentStatus: row.xeroPaymentStatus,
    })),
  };

  return JSON.stringify(payload);
}

export function sha256HexCanonical(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function computeJobFinancialSourceFingerprint(input: JobFinancialFingerprintInput): string {
  return sha256HexCanonical(buildJobFinancialFingerprintCanonical(input));
}

export type BuildFingerprintFromProfitabilitySourcesInput = {
  jobId: string;
  invoices: JobFinancialFingerprintInvoice[];
  quotes: Array<{
    id: string;
    status: string;
    totalCents: number;
    subtotalCents: number;
    lineItems: Array<{
      id?: string;
      category: string;
      lineCostCents: number | null;
      lineSubtotalCents: number;
      isOptional: boolean;
    }>;
  }>;
  adjustments: JobFinancialFingerprintAdjustment[];
  materialLines: JobFinancialFingerprintMaterial[];
  purchaseOrders: JobFinancialFingerprintPurchaseOrder[];
  labourEntries: Array<{
    id: string;
    entryType?: string;
    durationMinutes: number;
    hourlyCostCents: number;
    overtimeMultiplier: number;
    metadata?: Record<string, unknown> | null;
  }>;
  directCosts: JobFinancialFingerprintDirectCost[];
  payments: JobFinancialFingerprintPayment[];
  calculationVersion?: number;
};

/** Build fingerprint input from the same mapped sources used by JPE compute. */
export function buildJobFinancialFingerprintFromSources(
  input: BuildFingerprintFromProfitabilitySourcesInput,
): JobFinancialFingerprintInput {
  return {
    jobId: input.jobId,
    calculationVersion: input.calculationVersion ?? JPE_CALCULATION_VERSION,
    fingerprintVersion: JPE_FINANCIAL_FINGERPRINT_VERSION,
    invoices: input.invoices,
    quotes: input.quotes.map((quote) => ({
      id: quote.id,
      status: quote.status,
      totalCents: quote.totalCents,
      subtotalCents: quote.subtotalCents,
      lineItems: quote.lineItems.map((line, index) => ({
        id: line.id ?? `${quote.id}:line:${index}`,
        category: line.category,
        lineCostCents: line.lineCostCents,
        lineSubtotalCents: line.lineSubtotalCents,
        isOptional: line.isOptional,
      })),
    })),
    adjustments: input.adjustments,
    materialLines: input.materialLines,
    purchaseOrders: input.purchaseOrders,
    labourEntries: input.labourEntries.map((row) => {
      const meta = row.metadata ?? {};
      const lockedAt =
        typeof meta.hourlyCostLockedAt === 'string' && meta.hourlyCostLockedAt.length > 0
          ? meta.hourlyCostLockedAt
          : null;
      return {
        id: row.id,
        entryType: row.entryType ?? 'job_time',
        durationMinutes: row.durationMinutes,
        hourlyCostCents: row.hourlyCostCents,
        overtimeMultiplier: row.overtimeMultiplier,
        hourlyCostLockedAt: lockedAt,
      };
    }),
    directCosts: input.directCosts,
    payments: input.payments,
  };
}

export function computeJobFinancialSourceFingerprintFromSources(
  input: BuildFingerprintFromProfitabilitySourcesInput,
): string {
  return computeJobFinancialSourceFingerprint(buildJobFinancialFingerprintFromSources(input));
}

/**
 * Legacy max-timestamp fingerprint (JPE-002) — documented for audit only.
 * Included source families: job.updatedAt, quotes, materials, POs, invoices,
 * payments.createdAt, labour.createdAt, direct costs, adjustments.
 * Failure modes: source deleted, amount/qty changed on non-max row, reallocation,
 * payment status change, older-source add, identical timestamps.
 */
export const LEGACY_MAX_TIMESTAMP_FINGERPRINT_LIMITATIONS = [
  'Deleting a source row whose timestamp is not the current max leaves fingerprint unchanged',
  'Changing amount/quantity on a non-max row leaves fingerprint unchanged',
  'Reallocating a cost away from a job may not change max if remaining sources are newer',
  'Payment authority status changes without timestamp change are invisible',
  'Adding a source with an older external timestamp may not change max',
  'Two mutations in the same millisecond can collide',
] as const;
