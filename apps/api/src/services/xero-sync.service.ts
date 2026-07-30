import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  XeroAccountingAuraContext,
  XeroEntitySyncResult,
  XeroSyncLogSummary,
  XeroSyncScope,
  XeroSyncStatusResponse,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  integrationConnections,
  integrationSyncJobs,
  invoices,
  payments,
  quotes,
  xeroCustomerMappings,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroQuoteMappings,
  xeroSyncLogs,
} from '@titan/db';
import { decryptXeroCredentials, isXeroOAuthCredentials } from '../lib/crypto.js';
import {
  amountToCents,
  mapXeroInvoiceStatus,
  XeroClient,
  XeroError,
} from '../lib/xero.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';

export class XeroSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroSyncError';
  }
}

type XeroSyncServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
  xeroOAuthService?: XeroOAuthService;
};

type SyncContext = {
  companyId: string;
  connection: typeof integrationConnections.$inferSelect;
  client: XeroClient;
  syncJobId?: string;
};

export class XeroSyncService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly hubService?: IntegrationHubService,
    private readonly xeroOAuthService?: XeroOAuthService,
  ) {}

  static create(deps: XeroSyncServiceDeps): XeroSyncService {
    return new XeroSyncService(
      deps.db,
      deps.encryptionKey,
      deps.hubService,
      deps.xeroOAuthService,
    );
  }

  async getSyncStatus(companyId: string): Promise<XeroSyncStatusResponse> {
    const connection = await this.getConnectedConnection(companyId);
    const currency = connection?.config.baseCurrency ?? 'USD';

    if (!connection || connection.status !== 'connected') {
      return emptySyncStatus(currency);
    }

    const [customersStats, quotesStats, invoicesStats, paymentsStats, outstanding] =
      await Promise.all([
        this.getEntityStats(companyId, 'customer'),
        this.getEntityStats(companyId, 'quote'),
        this.getEntityStats(companyId, 'invoice'),
        this.getEntityStats(companyId, 'payment'),
        this.getOutstandingSummary(companyId),
      ]);

    return {
      connected: true,
      organisationName: connection.config.organisationName ?? null,
      baseCurrency: connection.config.baseCurrency ?? null,
      customers: customersStats,
      quotes: quotesStats,
      invoices: invoicesStats,
      payments: paymentsStats,
      outstandingAmountCents: outstanding.outstandingAmountCents,
      unpaidInvoiceCount: outstanding.unpaidInvoiceCount,
      customersWithOutstandingCount: outstanding.customersWithOutstandingCount,
      currency,
    };
  }

  async listSyncLogs(companyId: string, limit = 100): Promise<XeroSyncLogSummary[]> {
    const rows = await this.db.query.xeroSyncLogs.findMany({
      where: eq(xeroSyncLogs.companyId, companyId),
      orderBy: [desc(xeroSyncLogs.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      xeroEntityId: row.xeroEntityId,
      action: row.action,
      status: row.status,
      message: row.message,
      syncJobId: row.syncJobId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async retrySyncJob(companyId: string, syncJobId: string): Promise<XeroEntitySyncResult> {
    const job = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.id, syncJobId),
        eq(integrationSyncJobs.companyId, companyId),
        eq(integrationSyncJobs.provider, 'xero'),
      ),
    });

    if (!job) {
      throw new XeroSyncError('NOT_FOUND', 'Sync job not found');
    }

    if (job.status !== 'failed') {
      throw new XeroSyncError('INVALID_STATE', 'Only failed sync jobs can be retried');
    }

    const scope = (job.syncScope ?? 'organisation') as XeroSyncScope;

    switch (scope) {
      case 'customers':
        return this.syncCustomers(companyId);
      case 'quotes':
        return this.syncQuotes(companyId);
      case 'invoices':
        return this.syncInvoices(companyId);
      case 'payments':
        return this.syncPayments(companyId);
      case 'organisation':
      default:
        throw new XeroSyncError(
          'INVALID_SCOPE',
          'Organisation verification sync cannot be retried from this endpoint',
        );
    }
  }

  async syncCustomers(companyId: string): Promise<XeroEntitySyncResult> {
    return this.runScopedSync(companyId, 'customers', async (ctx) => {
      const rows = await this.db.query.customers.findMany({
        where: eq(customers.companyId, companyId),
        orderBy: [desc(customers.updatedAt)],
      });

      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const customer of rows) {
        try {
          const existingMapping = await this.db.query.xeroCustomerMappings.findFirst({
            where: and(
              eq(xeroCustomerMappings.companyId, companyId),
              eq(xeroCustomerMappings.customerId, customer.id),
            ),
          });

          let xeroContactId = existingMapping?.xeroContactId ?? null;

          if (!xeroContactId && customer.email) {
            const existingContact = await ctx.client.findContactByEmail(customer.email);
            xeroContactId = existingContact?.contactId ?? null;

            if (existingContact) {
              await this.writeLog(ctx, {
                entityType: 'customer',
                entityId: customer.id,
                xeroEntityId: existingContact.contactId,
                action: 'link',
                status: 'success',
                message: `Linked existing Xero contact for ${customer.name}`,
              });
            }
          }

          const contactInput = {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          };

          const contact = xeroContactId
            ? await ctx.client.updateContact(xeroContactId, contactInput)
            : await ctx.client.createContact(contactInput);

          if (existingMapping?.xeroContactId) {
            updatedCount += 1;
          } else {
            createdCount += 1;
          }

          await this.upsertCustomerMapping(ctx, customer.id, contact.contactId, 'synced');

          await this.writeLog(ctx, {
            entityType: 'customer',
            entityId: customer.id,
            xeroEntityId: contact.contactId,
            action: existingMapping?.xeroContactId ? 'update' : 'push',
            status: 'success',
            message: `Synced customer ${customer.name}`,
          });
        } catch (error) {
          failedCount += 1;
          const message = mapError(error);

          await this.upsertCustomerMapping(ctx, customer.id, null, 'failed', message);

          await this.writeLog(ctx, {
            entityType: 'customer',
            entityId: customer.id,
            action: 'push',
            status: 'failed',
            message,
          });
        }
      }

      if (rows.length === 0) {
        skippedCount = 1;
      }

      return { createdCount, updatedCount, pulledCount: 0, failedCount, skippedCount };
    });
  }

  async syncQuotes(companyId: string): Promise<XeroEntitySyncResult> {
    return this.runScopedSync(companyId, 'quotes', async (ctx) => {
      const rows = await this.db.query.quotes.findMany({
        where: eq(quotes.companyId, companyId),
        with: { customer: true },
        orderBy: [desc(quotes.updatedAt)],
      });

      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const quote of rows) {
        try {
          const customerMapping = await this.db.query.xeroCustomerMappings.findFirst({
            where: and(
              eq(xeroCustomerMappings.companyId, companyId),
              eq(xeroCustomerMappings.customerId, quote.customerId),
              eq(xeroCustomerMappings.syncStatus, 'synced'),
            ),
          });

          if (!customerMapping?.xeroContactId) {
            skippedCount += 1;
            await this.writeLog(ctx, {
              entityType: 'quote',
              entityId: quote.id,
              action: 'push',
              status: 'failed',
              message: `Skipped quote ${quote.quoteNumber}: customer is not synced to Xero`,
            });
            continue;
          }

          const existingMapping = await this.db.query.xeroQuoteMappings.findFirst({
            where: and(
              eq(xeroQuoteMappings.companyId, companyId),
              eq(xeroQuoteMappings.quoteId, quote.id),
            ),
          });

          if (existingMapping?.xeroQuoteId) {
            updatedCount += 1;
            await this.upsertQuoteMapping(ctx, quote.id, existingMapping.xeroQuoteId, 'synced');
            await this.writeLog(ctx, {
              entityType: 'quote',
              entityId: quote.id,
              xeroEntityId: existingMapping.xeroQuoteId,
              action: 'update',
              status: 'success',
              message: `Quote ${quote.quoteNumber} already linked in Xero`,
            });
            continue;
          }

          const xeroQuote = await ctx.client.createQuote({
            contactId: customerMapping.xeroContactId,
            quoteNumber: quote.quoteNumber,
            title: quote.title,
            amountCents: quote.amountCents,
            currency: quote.currency,
            expiryDate: quote.validUntil?.toISOString().slice(0, 10) ?? null,
          });

          createdCount += 1;
          await this.upsertQuoteMapping(ctx, quote.id, xeroQuote.quoteId, 'synced');

          await this.writeLog(ctx, {
            entityType: 'quote',
            entityId: quote.id,
            xeroEntityId: xeroQuote.quoteId,
            action: 'push',
            status: 'success',
            message: `Pushed quote ${quote.quoteNumber} to Xero`,
          });
        } catch (error) {
          failedCount += 1;
          const message = mapError(error);
          await this.upsertQuoteMapping(ctx, quote.id, null, 'failed', message);
          await this.writeLog(ctx, {
            entityType: 'quote',
            entityId: quote.id,
            action: 'push',
            status: 'failed',
            message,
          });
        }
      }

      return { createdCount, updatedCount, pulledCount: 0, failedCount, skippedCount };
    });
  }

  async syncInvoices(companyId: string): Promise<XeroEntitySyncResult> {
    return this.runScopedSync(companyId, 'invoices', async (ctx) => {
      const rows = await this.db.query.invoices.findMany({
        where: eq(invoices.companyId, companyId),
        with: { customer: true },
        orderBy: [desc(invoices.updatedAt)],
      });

      let createdCount = 0;
      let updatedCount = 0;
      let pulledCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const invoice of rows) {
        try {
          const customerMapping = await this.db.query.xeroCustomerMappings.findFirst({
            where: and(
              eq(xeroCustomerMappings.companyId, companyId),
              eq(xeroCustomerMappings.customerId, invoice.customerId),
              eq(xeroCustomerMappings.syncStatus, 'synced'),
            ),
          });

          if (!customerMapping?.xeroContactId) {
            skippedCount += 1;
            continue;
          }

          const existingMapping = await this.db.query.xeroInvoiceMappings.findFirst({
            where: and(
              eq(xeroInvoiceMappings.companyId, companyId),
              eq(xeroInvoiceMappings.invoiceId, invoice.id),
            ),
          });

          let xeroInvoiceId = existingMapping?.xeroInvoiceId ?? null;

          if (!xeroInvoiceId) {
            const created = await ctx.client.createInvoice({
              contactId: customerMapping.xeroContactId,
              invoiceNumber: invoice.invoiceNumber,
              title: invoice.title,
              amountCents: invoice.amountCents,
              currency: invoice.currency,
              dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
              issueDate: invoice.issuedAt?.toISOString().slice(0, 10) ?? null,
            });
            xeroInvoiceId = created.invoiceId;
            createdCount += 1;
          }

          const remote = await ctx.client.fetchInvoice(xeroInvoiceId);
          pulledCount += 1;

          const nextStatus = mapXeroInvoiceStatus({
            xeroStatus: remote.status,
            amountDue: remote.amountDue,
            amountPaid: remote.amountPaid,
            total: remote.total,
          });

          await this.db
            .update(invoices)
            .set({
              status: nextStatus,
              amountPaidCents: amountToCents(remote.amountPaid),
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoice.id));

          updatedCount += existingMapping?.xeroInvoiceId ? 1 : 0;
          await this.upsertInvoiceMapping(ctx, invoice.id, xeroInvoiceId, 'synced');

          await this.writeLog(ctx, {
            entityType: 'invoice',
            entityId: invoice.id,
            xeroEntityId: xeroInvoiceId,
            action: existingMapping?.xeroInvoiceId ? 'pull' : 'push',
            status: 'success',
            message: `Synced invoice ${invoice.invoiceNumber} (${nextStatus})`,
          });
        } catch (error) {
          failedCount += 1;
          const message = mapError(error);
          await this.upsertInvoiceMapping(ctx, invoice.id, null, 'failed', message);
          await this.writeLog(ctx, {
            entityType: 'invoice',
            entityId: invoice.id,
            action: 'push',
            status: 'failed',
            message,
          });
        }
      }

      return { createdCount, updatedCount, pulledCount, failedCount, skippedCount };
    });
  }

  async syncPayments(companyId: string): Promise<XeroEntitySyncResult> {
    return this.runScopedSync(companyId, 'payments', async (ctx) => {
      const invoiceMappings = await this.db.query.xeroInvoiceMappings.findMany({
        where: and(
          eq(xeroInvoiceMappings.companyId, companyId),
          eq(xeroInvoiceMappings.syncStatus, 'synced'),
        ),
        with: { invoice: { with: { customer: true } } },
      });

      const mappingByXeroInvoiceId = new Map(
        invoiceMappings
          .filter((row) => row.xeroInvoiceId)
          .map((row) => [row.xeroInvoiceId!, row]),
      );

      const remotePayments = await ctx.client.listPayments();

      let createdCount = 0;
      let updatedCount = 0;
      let pulledCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const remotePayment of remotePayments) {
        pulledCount += 1;

        if (!remotePayment.invoiceId) {
          skippedCount += 1;
          continue;
        }

        const invoiceMapping = mappingByXeroInvoiceId.get(remotePayment.invoiceId);

        if (!invoiceMapping?.invoice) {
          skippedCount += 1;
          continue;
        }

        try {
          const existingPaymentMapping = await this.db.query.xeroPaymentMappings.findFirst({
            where: and(
              eq(xeroPaymentMappings.companyId, companyId),
              eq(xeroPaymentMappings.xeroPaymentId, remotePayment.paymentId),
            ),
          });

          if (existingPaymentMapping) {
            updatedCount += 1;
            continue;
          }

          const [createdPayment] = await this.db
            .insert(payments)
            .values({
              companyId,
              invoiceId: invoiceMapping.invoiceId,
              amountCents: amountToCents(remotePayment.amount),
              currency: remotePayment.currencyCode ?? invoiceMapping.invoice.currency,
              method: 'bank_transfer',
              reference: remotePayment.paymentId,
              paidAt: remotePayment.date ? new Date(remotePayment.date) : new Date(),
              notes: 'Imported from Xero',
            })
            .returning();

          if (!createdPayment) {
            throw new XeroSyncError('CREATE_FAILED', 'Unable to create payment from Xero');
          }

          createdCount += 1;

          await this.db.insert(xeroPaymentMappings).values({
            companyId,
            integrationConnectionId: ctx.connection.id,
            paymentId: createdPayment.id,
            xeroPaymentId: remotePayment.paymentId,
            syncStatus: 'synced',
            lastSyncedAt: new Date(),
            lastSuccessfulSyncAt: new Date(),
          });

          const remoteInvoice = await ctx.client.fetchInvoice(remotePayment.invoiceId);

          await this.db
            .update(invoices)
            .set({
              amountPaidCents: amountToCents(remoteInvoice.amountPaid),
              status: mapXeroInvoiceStatus({
                xeroStatus: remoteInvoice.status,
                amountDue: remoteInvoice.amountDue,
                amountPaid: remoteInvoice.amountPaid,
                total: remoteInvoice.total,
              }),
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoiceMapping.invoiceId));

          await this.writeLog(ctx, {
            entityType: 'payment',
            entityId: createdPayment.id,
            xeroEntityId: remotePayment.paymentId,
            action: 'pull',
            status: 'success',
            message: `Linked Xero payment to invoice ${invoiceMapping.invoice.invoiceNumber}`,
          });
        } catch (error) {
          failedCount += 1;
          await this.writeLog(ctx, {
            entityType: 'payment',
            entityId: invoiceMapping.invoiceId,
            xeroEntityId: remotePayment.paymentId,
            action: 'pull',
            status: 'failed',
            message: mapError(error),
          });
        }
      }

      return { createdCount, updatedCount, pulledCount, failedCount, skippedCount };
    });
  }

  async buildAuraContext(companyId: string): Promise<XeroAccountingAuraContext | null> {
    const connection = await this.getConnectedConnection(companyId);

    if (!connection || connection.status !== 'connected') {
      return null;
    }

    const status = await this.getSyncStatus(companyId);
    const unpaidRows = await this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, companyId),
        inArray(invoices.status, ['sent', 'partial', 'overdue']),
      ),
      with: { customer: true },
      orderBy: [desc(invoices.dueDate)],
      limit: 10,
    });

    const customerOutstanding = new Map<string, { customerName: string; amountCents: number; count: number }>();

    for (const invoice of unpaidRows) {
      const dueCents = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
      const existing = customerOutstanding.get(invoice.customerId);

      if (existing) {
        existing.amountCents += dueCents;
        existing.count += 1;
      } else {
        customerOutstanding.set(invoice.customerId, {
          customerName: invoice.customer?.name ?? 'Unknown',
          amountCents: dueCents,
          count: 1,
        });
      }
    }

    return {
      connected: true,
      organisationName: status.organisationName,
      baseCurrency: status.baseCurrency,
      syncedCustomerCount: status.customers.syncedCount,
      syncedInvoiceCount: status.invoices.syncedCount,
      syncedQuoteCount: status.quotes.syncedCount,
      syncedPaymentCount: status.payments.syncedCount,
      outstandingAmountCents: status.outstandingAmountCents,
      unpaidInvoiceCount: status.unpaidInvoiceCount,
      customersWithOutstandingCount: status.customersWithOutstandingCount,
      currency: status.currency,
      unpaidInvoices: unpaidRows.map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? 'Unknown',
        amountCents: invoice.amountCents,
        amountPaidCents: invoice.amountPaidCents,
        amountDueCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
        status: invoice.status,
        dueDate: invoice.dueDate?.toISOString() ?? null,
      })),
      customersOwing: [...customerOutstanding.values()]
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 10)
        .map((entry) => ({
          customerName: entry.customerName,
          outstandingAmountCents: entry.amountCents,
          unpaidInvoiceCount: entry.count,
        })),
    };
  }

  private async runScopedSync(
    companyId: string,
    scope: XeroSyncScope,
    run: (ctx: SyncContext) => Promise<{
      createdCount: number;
      updatedCount: number;
      pulledCount: number;
      failedCount: number;
      skippedCount: number;
    }>,
  ): Promise<XeroEntitySyncResult> {
    const ctx = await this.createSyncContext(companyId);
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'xero',
      integrationConnectionId: ctx.connection.id,
      jobType: 'manual',
      syncScope: scope,
    });

    ctx.syncJobId = syncJobId;

    try {
      const counts = await run(ctx);
      const syncedAt = new Date();

      await this.db
        .update(integrationConnections)
        .set({
          lastSyncAt: syncedAt,
          lastError: counts.failedCount > 0 ? `${scope} sync completed with failures` : null,
          updatedAt: syncedAt,
        })
        .where(eq(integrationConnections.id, ctx.connection.id));

      const result: XeroEntitySyncResult = {
        scope,
        ...counts,
        syncedAt: syncedAt.toISOString(),
        syncJobId,
      };

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: counts.failedCount > 0 ? 'failed' : 'completed',
          errorMessage: counts.failedCount > 0 ? `${counts.failedCount} record(s) failed` : null,
          resultSummary: { ...result },
        });
      }

      return result;
    } catch (error) {
      const message = mapError(error);

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'failed',
          errorMessage: message,
        });
      }

      throw new XeroSyncError('SYNC_FAILED', message);
    }
  }

  private async createSyncContext(companyId: string): Promise<SyncContext> {
    this.ensureEncryptionKey();
    const connection = await this.getConnectedConnection(companyId);

    if (!connection || connection.status !== 'connected' || !connection.credentialsEncrypted) {
      throw new XeroSyncError('NOT_CONNECTED', 'Xero is not connected');
    }

    const tenantId = connection.config.tenantId;

    if (!tenantId) {
      throw new XeroSyncError('CONFIG_ERROR', 'Xero tenant ID is missing');
    }

    if (!this.xeroOAuthService) {
      throw new XeroSyncError(
        'NOT_CONNECTED',
        'Xero OAuth is not configured. Sign in with Xero before syncing.',
      );
    }

    const credentials = decryptXeroCredentials(connection.credentialsEncrypted, this.encryptionKey!);

    if (!isXeroOAuthCredentials(credentials)) {
      throw new XeroSyncError(
        'RECONNECT_REQUIRED',
        'Reconnect Xero using Sign in with Xero before syncing.',
      );
    }

    return {
      companyId,
      connection,
      client: await this.xeroOAuthService.createClient(companyId, connection),
    };
  }

  private async getConnectedConnection(companyId: string) {
    return this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'xero'),
      ),
    });
  }

  private async getEntityStats(
    companyId: string,
    entityType: 'customer' | 'quote' | 'invoice' | 'payment',
  ) {
    const table =
      entityType === 'customer'
        ? xeroCustomerMappings
        : entityType === 'quote'
          ? xeroQuoteMappings
          : entityType === 'invoice'
            ? xeroInvoiceMappings
            : xeroPaymentMappings;

    const rows = await this.db
      .select({
        status: table.syncStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(eq(table.companyId, companyId))
      .groupBy(table.syncStatus);

    const counts = Object.fromEntries(rows.map((row) => [row.status, row.count]));

    const [latest] = await this.db
      .select({
        lastSyncedAt: table.lastSyncedAt,
        lastSuccessfulSyncAt: table.lastSuccessfulSyncAt,
      })
      .from(table)
      .where(eq(table.companyId, companyId))
      .orderBy(desc(table.lastSyncedAt))
      .limit(1);

    const failedRows = await this.db.query.xeroSyncLogs.findMany({
      where: and(
        eq(xeroSyncLogs.companyId, companyId),
        eq(xeroSyncLogs.entityType, entityType),
        eq(xeroSyncLogs.status, 'failed'),
      ),
      orderBy: [desc(xeroSyncLogs.createdAt)],
      limit: 1,
    });

    return {
      syncedCount: counts.synced ?? 0,
      failedCount: counts.failed ?? 0,
      pendingCount: counts.pending ?? 0,
      outOfSyncCount: counts.out_of_sync ?? 0,
      lastSyncAt: latest?.lastSyncedAt?.toISOString() ?? null,
      lastSuccessfulSyncAt: latest?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastError: failedRows[0]?.message ?? null,
    };
  }

  private async getOutstandingSummary(companyId: string) {
    const rows = await this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, companyId),
        inArray(invoices.status, ['sent', 'partial', 'overdue']),
      ),
      columns: {
        customerId: true,
        amountCents: true,
        amountPaidCents: true,
      },
    });

    const customerIds = new Set<string>();
    let outstandingAmountCents = 0;

    for (const row of rows) {
      outstandingAmountCents += Math.max(row.amountCents - row.amountPaidCents, 0);
      customerIds.add(row.customerId);
    }

    return {
      outstandingAmountCents,
      unpaidInvoiceCount: rows.length,
      customersWithOutstandingCount: customerIds.size,
    };
  }

  private async upsertCustomerMapping(
    ctx: SyncContext,
    customerId: string,
    xeroContactId: string | null,
    syncStatus: 'synced' | 'failed' | 'pending' | 'out_of_sync',
    lastError?: string | null,
  ) {
    const now = new Date();
    const existing = await this.db.query.xeroCustomerMappings.findFirst({
      where: and(
        eq(xeroCustomerMappings.companyId, ctx.companyId),
        eq(xeroCustomerMappings.customerId, customerId),
      ),
    });

    if (existing) {
      await this.db
        .update(xeroCustomerMappings)
        .set({
          xeroContactId: xeroContactId ?? existing.xeroContactId,
          syncStatus,
          lastSyncedAt: now,
          lastSuccessfulSyncAt: syncStatus === 'synced' ? now : existing.lastSuccessfulSyncAt,
          lastError: lastError ?? null,
          updatedAt: now,
        })
        .where(eq(xeroCustomerMappings.id, existing.id));
      return;
    }

    await this.db.insert(xeroCustomerMappings).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      customerId,
      xeroContactId,
      syncStatus,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: syncStatus === 'synced' ? now : null,
      lastError: lastError ?? null,
    });
  }

  private async upsertQuoteMapping(
    ctx: SyncContext,
    quoteId: string,
    xeroQuoteId: string | null,
    syncStatus: 'synced' | 'failed' | 'pending' | 'out_of_sync',
    lastError?: string | null,
  ) {
    const now = new Date();
    const existing = await this.db.query.xeroQuoteMappings.findFirst({
      where: and(
        eq(xeroQuoteMappings.companyId, ctx.companyId),
        eq(xeroQuoteMappings.quoteId, quoteId),
      ),
    });

    if (existing) {
      await this.db
        .update(xeroQuoteMappings)
        .set({
          xeroQuoteId: xeroQuoteId ?? existing.xeroQuoteId,
          syncStatus,
          lastSyncedAt: now,
          lastSuccessfulSyncAt: syncStatus === 'synced' ? now : existing.lastSuccessfulSyncAt,
          lastError: lastError ?? null,
          updatedAt: now,
        })
        .where(eq(xeroQuoteMappings.id, existing.id));
      return;
    }

    await this.db.insert(xeroQuoteMappings).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      quoteId,
      xeroQuoteId,
      syncStatus,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: syncStatus === 'synced' ? now : null,
      lastError: lastError ?? null,
    });
  }

  private async upsertInvoiceMapping(
    ctx: SyncContext,
    invoiceId: string,
    xeroInvoiceId: string | null,
    syncStatus: 'synced' | 'failed' | 'pending' | 'out_of_sync',
    lastError?: string | null,
  ) {
    const now = new Date();
    const existing = await this.db.query.xeroInvoiceMappings.findFirst({
      where: and(
        eq(xeroInvoiceMappings.companyId, ctx.companyId),
        eq(xeroInvoiceMappings.invoiceId, invoiceId),
      ),
    });

    if (existing) {
      await this.db
        .update(xeroInvoiceMappings)
        .set({
          xeroInvoiceId: xeroInvoiceId ?? existing.xeroInvoiceId,
          syncStatus,
          lastSyncedAt: now,
          lastSuccessfulSyncAt: syncStatus === 'synced' ? now : existing.lastSuccessfulSyncAt,
          lastError: lastError ?? null,
          updatedAt: now,
        })
        .where(eq(xeroInvoiceMappings.id, existing.id));
      return;
    }

    await this.db.insert(xeroInvoiceMappings).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      invoiceId,
      xeroInvoiceId,
      syncStatus,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: syncStatus === 'synced' ? now : null,
      lastError: lastError ?? null,
    });
  }

  private async writeLog(
    ctx: SyncContext,
    input: {
      entityType: 'customer' | 'quote' | 'invoice' | 'payment';
      entityId?: string;
      xeroEntityId?: string | null;
      action: 'push' | 'pull' | 'update' | 'link';
      status: 'success' | 'failed';
      message?: string;
    },
  ) {
    await this.db.insert(xeroSyncLogs).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      syncJobId: ctx.syncJobId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      xeroEntityId: input.xeroEntityId ?? null,
      action: input.action,
      status: input.status,
      message: input.message ?? null,
    });
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new XeroSyncError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before syncing with Xero',
      );
    }
  }
}

function emptySyncStatus(currency: string): XeroSyncStatusResponse {
  const empty = {
    syncedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    outOfSyncCount: 0,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };

  return {
    connected: false,
    organisationName: null,
    baseCurrency: null,
    customers: empty,
    quotes: empty,
    invoices: empty,
    payments: empty,
    outstandingAmountCents: 0,
    unpaidInvoiceCount: 0,
    customersWithOutstandingCount: 0,
    currency,
  };
}

function mapError(error: unknown): string {
  if (error instanceof XeroError || error instanceof XeroSyncError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Xero sync failed';
}
