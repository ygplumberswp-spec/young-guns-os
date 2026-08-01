import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type {
  CustomerSummary,
  CustomerValueClassificationSummary,
  CustomerValueMetrics,
} from '@titan/shared';
import {
  aggregateCustomerValueMetrics,
  classifyCustomerValueFromEvidence,
  customerMatchesValueFilter,
  CUSTOMER_VALUE_XERO_IMPORT_PARTIAL_MESSAGE,
  isCustomerValueClassificationFilterKey,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  customers,
  integrationConnections,
  integrationSyncJobs,
  invoices,
  xeroCustomerMappings,
} from '@titan/db';
import {
  buildTenantCacheKey,
  cachedTenantRead,
  CACHE_TTLS,
  invalidateCustomerValueReadCaches,
} from './api-read-cache.js';

export class CustomerValueClassificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerValueClassificationError';
  }
}

type InvoiceRow = typeof invoices.$inferSelect;

export class CustomerValueClassificationService {
  constructor(private readonly db: DatabaseClient) {}

  async getValueMetrics(companyId: string): Promise<CustomerValueMetrics> {
    const cacheKey = buildTenantCacheKey(companyId, 'customers/value-metrics');
    return cachedTenantRead(
      cacheKey,
      async () => {
        const summaries = await this.loadClassificationSummaries(companyId);
        const xeroState = await this.resolveXeroImportState(companyId);
        const notes: string[] = [];
        const partial =
          xeroState.importInProgress || (xeroState.xeroConnected && !xeroState.lastSyncAt);
        if (partial) {
          notes.push(CUSTOMER_VALUE_XERO_IMPORT_PARTIAL_MESSAGE);
        }
        return aggregateCustomerValueMetrics(summaries, {
          xeroImportInProgress: partial,
          notes,
        });
      },
      CACHE_TTLS.stats,
    );
  }

  /** Invalidates cached metrics and recomputes fresh classification summaries. */
  async refreshValueMetrics(companyId: string): Promise<CustomerValueMetrics> {
    invalidateCustomerValueReadCaches(companyId);
    return this.getValueMetrics(companyId);
  }

  async listCustomersWithClassification(
    companyId: string,
    opts: { classification?: string | null; search?: string | null } = {},
  ): Promise<Array<CustomerSummary & { valueClassification: CustomerValueClassificationSummary }>> {
    const filterKey =
      opts.classification && isCustomerValueClassificationFilterKey(opts.classification)
        ? opts.classification
        : null;

    if (opts.classification && !filterKey) {
      throw new CustomerValueClassificationError(
        'VALIDATION_ERROR',
        `Invalid classification filter: ${opts.classification}`,
      );
    }

    const summaries = await this.loadClassificationSummaries(companyId);
    const filtered = filterKey
      ? summaries.filter((summary) => customerMatchesValueFilter(summary, filterKey))
      : summaries;

    if (filtered.length === 0) return [];

    const customerRows = await this.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          inArray(
            customers.id,
            filtered.map((row) => row.customerId),
          ),
        ),
      );

    const summaryByCustomerId = new Map(filtered.map((row) => [row.customerId, row]));
    const search = opts.search?.trim().toLowerCase() ?? '';

    const results: Array<
      CustomerSummary & { valueClassification: CustomerValueClassificationSummary }
    > = [];

    for (const row of customerRows) {
      const classification = summaryByCustomerId.get(row.id);
      if (!classification) continue;

      if (search) {
        const haystack = [row.name, row.email, row.phone, row.contactPerson]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      results.push({
        id: row.id,
        name: row.name,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        primaryAddressDisplay: null,
        status: row.status,
        isSupplierOnly: row.isSupplierOnly,
        doNotContact: row.doNotContact,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        valueClassification: classification,
      });
    }

    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return results;
  }

  async getCustomerClassification(
    companyId: string,
    customerId: string,
  ): Promise<CustomerValueClassificationSummary | null> {
    const summaries = await this.loadClassificationSummaries(companyId, [customerId]);
    return summaries[0] ?? null;
  }

  private async loadClassificationSummaries(
    companyId: string,
    customerIds?: string[],
  ): Promise<CustomerValueClassificationSummary[]> {
    const customerConditions = [eq(customers.companyId, companyId)];
    if (customerIds?.length) {
      customerConditions.push(inArray(customers.id, customerIds));
    }

    const customerRows = await this.db
      .select()
      .from(customers)
      .where(and(...customerConditions));

    if (customerRows.length === 0) return [];

    const ids = customerRows.map((row) => row.id);

    const invoiceRows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), inArray(invoices.customerId, ids)));

    const mappingRows = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, companyId),
          inArray(xeroCustomerMappings.customerId, ids),
        ),
      );

    const invoicesByCustomer = groupBy(invoiceRows, (row) => row.customerId);
    const xeroContactByCustomer = new Map<string, string>();
    for (const mapping of mappingRows) {
      if (mapping.xeroContactId) {
        xeroContactByCustomer.set(mapping.customerId, mapping.xeroContactId);
      }
    }

    const computedAt = new Date().toISOString();

    return customerRows.map((customer) => {
      const customerInvoices = invoicesByCustomer.get(customer.id) ?? [];
      const classified = classifyCustomerValueFromEvidence({
        customerId: customer.id,
        customerName: customer.name,
        customerStatus: customer.status,
        isSupplierOnly: customer.isSupplierOnly,
        xeroContactId: xeroContactByCustomer.get(customer.id) ?? null,
        invoices: customerInvoices.map(toInvoiceClassificationInput),
      });

      return { ...classified, computedAt };
    });
  }

  private async resolveXeroImportState(companyId: string): Promise<{
    importInProgress: boolean;
    xeroConnected: boolean;
    lastSyncAt: string | null;
    hasInvoiceEvidence: boolean;
  }> {
    try {
      const [importJobs, connection, invoiceEvidence] = await Promise.all([
        this.db
          .select({ status: integrationSyncJobs.status })
          .from(integrationSyncJobs)
          .where(
            and(
              eq(integrationSyncJobs.companyId, companyId),
              eq(integrationSyncJobs.provider, 'xero'),
              eq(integrationSyncJobs.syncScope, 'import'),
              or(
                eq(integrationSyncJobs.status, 'pending'),
                eq(integrationSyncJobs.status, 'running'),
              ),
            ),
          )
          .limit(1),
        this.db
          .select({ lastSyncAt: integrationConnections.lastSyncAt })
          .from(integrationConnections)
          .where(
            and(
              eq(integrationConnections.companyId, companyId),
              eq(integrationConnections.provider, 'xero'),
            ),
          )
          .limit(1),
        this.db
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.companyId, companyId))
          .limit(1),
      ]);

      return {
        importInProgress: importJobs.length > 0,
        xeroConnected: connection.length > 0,
        lastSyncAt: connection[0]?.lastSyncAt?.toISOString() ?? null,
        hasInvoiceEvidence: invoiceEvidence.length > 0,
      };
    } catch {
      return {
        importInProgress: false,
        xeroConnected: false,
        lastSyncAt: null,
        hasInvoiceEvidence: false,
      };
    }
  }
}

function toInvoiceClassificationInput(invoice: InvoiceRow) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    amountCents: invoice.amountCents,
    amountPaidCents: invoice.amountPaidCents,
    totalCents: invoice.totalCents,
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export async function findYoungGunsCompanyId(db: DatabaseClient): Promise<string | null> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ilike(companies.name, '%Young Guns Plumbing%'))
    .limit(1);
  return rows[0]?.id ?? null;
}
