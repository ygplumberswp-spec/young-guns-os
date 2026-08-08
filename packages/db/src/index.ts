import dns from 'node:dns';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';
import {
  buildPostgresClientOptions,
  resolveDbPoolMax,
  sanitizeDbError,
  summarizeDatabaseUrl,
} from './connection-options.js';

export {
  buildPostgresClientOptions,
  resolveDbPoolMax,
  sanitizeDbError,
  summarizeDatabaseUrl,
  type DbEndpointSummary,
} from './connection-options.js';

/** Prefer IPv4 for hosted platforms (e.g. Railway) that cannot reach Supabase IPv6. */
export function preferIpv4DnsOrder(): void {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // Older Node runtimes may not support this API.
  }
}

let sharedClient: postgres.Sql | null = null;
let sharedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sharedConnectionString: string | null = null;

export type DbQueryLogEvent = {
  query: string;
  paramCount: number;
};

let queryLogHandler: ((event: DbQueryLogEvent) => void) | null = null;

/** Development-only query observer; never log parameter values. */
export function setDbQueryLogHandler(handler: ((event: DbQueryLogEvent) => void) | null) {
  queryLogHandler = handler;
}

function createDbLogger() {
  return {
    logQuery(query: string, params: unknown[]) {
      queryLogHandler?.({ query, paramCount: params.length });
    },
  };
}

export type DatabaseClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  if (sharedDb && sharedClient && sharedConnectionString === connectionString) {
    return sharedDb;
  }

  if (sharedClient) {
    void closeDb();
  }

  preferIpv4DnsOrder();

  const options = buildPostgresClientOptions(connectionString);
  options.max = resolveDbPoolMax(connectionString);

  sharedConnectionString = connectionString;
  sharedClient = postgres(connectionString, options);
  sharedDb = drizzle(sharedClient, {
    schema,
    logger: queryLogHandler ? createDbLogger() : undefined,
  });
  return sharedDb;
}

export async function pingDb(): Promise<boolean> {
  const result = await probeDbConnection();
  return result.ok;
}

export type DbProbeResult =
  | { ok: true; endpoint: ReturnType<typeof summarizeDatabaseUrl> }
  | {
      ok: false;
      endpoint: ReturnType<typeof summarizeDatabaseUrl>;
      code: string;
      message: string;
    };

/** Probe the shared pool (creating it if needed). Never returns secrets. */
export async function probeDbConnection(connectionString?: string): Promise<DbProbeResult> {
  const url = connectionString ?? sharedConnectionString ?? '';
  const endpoint = summarizeDatabaseUrl(url || 'postgres://invalid');

  if (!url) {
    return {
      ok: false,
      endpoint,
      code: 'NOT_CONFIGURED',
      message: 'DATABASE_URL is not configured',
    };
  }

  try {
    createDb(url);
    if (!sharedClient) {
      return {
        ok: false,
        endpoint,
        code: 'CLIENT_MISSING',
        message: 'Database client was not initialized',
      };
    }
    await sharedClient`SELECT 1`;
    return { ok: true, endpoint };
  } catch (error) {
    const sanitized = sanitizeDbError(error);
    return {
      ok: false,
      endpoint,
      code: sanitized.code,
      message: sanitized.message,
    };
  }
}

/** Reuses the shared application pool — does not open a separate client. */
export async function checkDbConnection(connectionString: string): Promise<boolean> {
  const result = await probeDbConnection(connectionString);
  return result.ok;
}

export async function closeDb(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.end({ timeout: 5 });
    } catch {
      // Ignore shutdown errors during hot reload.
    }
    sharedClient = null;
    sharedDb = null;
    sharedConnectionString = null;
  }
}

export * from './schema/index.js';

/** Explicit re-export — ensures Row 85 table is visible even when schema barrel depth is stressed. */
export {
  customerDuplicateReconciliations,
  customerDuplicateConfidenceLabelEnum,
  customerDuplicateResolutionTypeEnum,
  customerDuplicateReconciliationStatusEnum,
} from './schema/customer-duplicate-reconciliation.js';

/** Explicit re-export — Row 86 equipment import review/audit. */
export {
  equipmentImportReviews,
  equipmentImportAuditLogs,
  equipmentImportActionEnum,
  equipmentImportReviewStatusEnum,
  equipmentImportAuditActionEnum,
} from './schema/equipment-assets-import.js';

/** Explicit re-export — Row 92 pricebook tier formula rule sets. */
export {
  companyPricebookRuleSets,
} from './schema/pricebook-tier-formula.js';
export type {
  CompanyPricebookRuleSet,
  NewCompanyPricebookRuleSet,
} from './schema/pricebook-tier-formula.js';

/** Explicit re-export — Row 93 quote one-off price overrides. */
export {
  quoteLinePriceOverrides,
} from './schema/quote-price-override.js';
export type {
  QuoteLinePriceOverride,
  NewQuoteLinePriceOverride,
} from './schema/quote-price-override.js';

/** Explicit re-export — Row 94 plan / floor-plan estimates. */
export {
  planEstimates,
  planEstimateItems,
  planEstimateCostComponents,
} from './schema/plan-estimates.js';
export type {
  PlanEstimate,
  PlanEstimateItem,
  PlanEstimateCostComponent,
} from './schema/plan-estimates.js';

/** Explicit re-export — Row 98 AI plan take-off drafts. */
export {
  planEstimateAiTakeoffs,
  planEstimateAiTakeoffItems,
} from './schema/plan-ai-takeoff.js';
export type {
  PlanEstimateAiTakeoff,
  PlanEstimateAiTakeoffItem,
} from './schema/plan-ai-takeoff.js';

/** Explicit re-export — Row 99 BOQ workbook import. */
export {
  boqImports,
  boqImportSheets,
  boqImportRows,
} from './schema/boq-workbook-import.js';
export type {
  BoqImport,
  BoqImportSheet,
  BoqImportRow,
} from './schema/boq-workbook-import.js';

/** Explicit re-export — Row 100 supplier quote → BOQ matching. */
export {
  supplierQuoteImports,
  supplierQuoteImportLines,
  supplierQuoteBoqMatchProposals,
} from './schema/supplier-quote-boq-match.js';
export type {
  SupplierQuoteImport,
  SupplierQuoteImportLine,
  SupplierQuoteBoqMatchProposal,
} from './schema/supplier-quote-boq-match.js';

/** Explicit re-export — Row 101 split-purchase draft proposals. */
export {
  boqSplitPurchaseProposals,
  boqSplitPurchaseProposalLines,
} from './schema/boq-supplier-comparison.js';
export type {
  BoqSplitPurchaseProposal,
  BoqSplitPurchaseProposalLine,
} from './schema/boq-supplier-comparison.js';

/** Explicit re-export — Row 102 reviewed BOQ export. */
export {
  boqImportRowReviewedEdits,
  boqReviewedExports,
} from './schema/boq-reviewed-export.js';
export type {
  BoqImportRowReviewedEdit,
  BoqReviewedExport,
} from './schema/boq-reviewed-export.js';

/** Explicit re-export — Row 103 job-linked procurement chain. */
export {
  jobProcurementChains,
  jobProcurementChainLinks,
  jobProcurementDeliveryEvidence,
  jobProcurementSupplierInvoiceEvidence,
} from './schema/job-procurement-chain.js';
export type {
  JobProcurementChain,
  JobProcurementChainLink,
  JobProcurementDeliveryEvidence,
  JobProcurementSupplierInvoiceEvidence,
} from './schema/job-procurement-chain.js';

/** Explicit re-export — Row 104 material quantity reconciliation. */
export {
  materialQuantityReconciliations,
  materialSupplierReturnEvents,
  materialSupplierCreditEvents,
  materialWasteEvents,
  materialReturnToStockEvents,
} from './schema/material-quantity-reconciliation.js';
export type {
  MaterialQuantityReconciliation,
  MaterialSupplierReturnEvent,
  MaterialSupplierCreditEvent,
  MaterialWasteEvent,
  MaterialReturnToStockEvent,
} from './schema/material-quantity-reconciliation.js';

/** Explicit re-export — Row 105 multi-job supplier invoice allocation. */
export {
  multiJobSupplierInvoices,
  multiJobSupplierInvoiceLines,
  multiJobSupplierInvoiceAllocations,
  multiJobSupplierInvoiceAllocationCorrections,
} from './schema/multi-job-supplier-invoice-allocation.js';
export type {
  MultiJobSupplierInvoice,
  MultiJobSupplierInvoiceLine,
  MultiJobSupplierInvoiceAllocation,
  MultiJobSupplierInvoiceAllocationCorrection,
} from './schema/multi-job-supplier-invoice-allocation.js';

/** Explicit re-export — Row 106 estimated vs actual GP. */
export { estimatedActualGpComparisons } from './schema/estimated-actual-gp.js';
export type {
  EstimatedActualGpComparison,
  NewEstimatedActualGpComparison,
} from './schema/estimated-actual-gp.js';

export { drizzle } from 'drizzle-orm/postgres-js';
