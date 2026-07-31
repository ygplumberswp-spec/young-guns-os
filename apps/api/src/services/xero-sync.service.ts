import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type {
  XeroAccountingAuraContext,
  XeroEntitySyncResult,
  XeroImportEntityCounts,
  XeroImportStage,
  XeroImportSyncResult,
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
  securityAuditLogs,
  xeroCustomerMappings,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroQuoteMappings,
  xeroSyncLogs,
} from '@titan/db';
import { decryptXeroCredentials, isXeroOAuthCredentials } from '../lib/crypto.js';
import { amountToCents, mapXeroInvoiceStatus, XeroClient, XeroError } from '../lib/xero.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';
import { invalidateIntegrationReadCaches } from './api-read-cache.js';

export class XeroSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroSyncError';
  }
}

/** Overall wall-clock budget for a full read-only Xero import. */
export const XERO_IMPORT_OVERALL_TIMEOUT_MS = 90_000;
/** Running import jobs older than this are marked failed as abandoned. */
export const XERO_IMPORT_STALE_JOB_MS = 90_000;

const activeImportCompanies = new Set<string>();

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
  isTimedOut?: () => boolean;
};

function emptyImportCounts(): XeroImportEntityCounts {
  return {
    createdCount: 0,
    updatedCount: 0,
    pulledCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };
}

export class XeroSyncService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly hubService?: IntegrationHubService,
    private readonly xeroOAuthService?: XeroOAuthService,
  ) {}

  static create(deps: XeroSyncServiceDeps): XeroSyncService {
    return new XeroSyncService(deps.db, deps.encryptionKey, deps.hubService, deps.xeroOAuthService);
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
      case 'import':
        return this.retryImportSyncJob(companyId, syncJobId);
      case 'organisation':
        throw new XeroSyncError(
          'INVALID_SCOPE',
          'Organisation verification sync cannot be retried from this endpoint',
        );
      default:
        throw new XeroSyncError('INVALID_SCOPE', `Unsupported sync scope: ${scope}`);
    }
  }

  private async retryImportSyncJob(
    companyId: string,
    syncJobId: string,
  ): Promise<XeroEntitySyncResult> {
    const importResult = await this.syncFromXero(companyId);
    return {
      scope: 'import',
      createdCount:
        importResult.contacts.createdCount +
        importResult.invoices.createdCount +
        importResult.payments.createdCount +
        importResult.bankTransactions.createdCount,
      updatedCount:
        importResult.contacts.updatedCount +
        importResult.invoices.updatedCount +
        importResult.payments.updatedCount +
        importResult.bankTransactions.updatedCount,
      pulledCount:
        importResult.contacts.pulledCount +
        importResult.invoices.pulledCount +
        importResult.payments.pulledCount +
        importResult.bankTransactions.pulledCount,
      failedCount:
        importResult.contacts.failedCount +
        importResult.invoices.failedCount +
        importResult.payments.failedCount +
        importResult.bankTransactions.failedCount,
      skippedCount:
        importResult.contacts.skippedCount +
        importResult.invoices.skippedCount +
        importResult.payments.skippedCount +
        importResult.bankTransactions.skippedCount,
      syncedAt: importResult.syncedAt ?? new Date().toISOString(),
      syncJobId,
    };
  }

  /**
   * Marks abandoned/stale Xero import jobs as failed.
   * Does not delete imported business data or mappings.
   */
  async failStaleImportJobs(
    companyId?: string,
    olderThanMs: number = XERO_IMPORT_STALE_JOB_MS,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const conditions = [
      eq(integrationSyncJobs.provider, 'xero'),
      eq(integrationSyncJobs.syncScope, 'import'),
      inArray(integrationSyncJobs.status, ['pending', 'running']),
      lt(integrationSyncJobs.startedAt, cutoff),
    ];

    if (companyId) {
      conditions.push(eq(integrationSyncJobs.companyId, companyId));
    }

    const updated = await this.db
      .update(integrationSyncJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Abandoned: Xero import exceeded the time limit or was interrupted.',
        resultSummary: {
          abandoned: true,
          failedStage: null,
          reason: 'stale_running_job',
        },
      })
      .where(and(...conditions))
      .returning({ id: integrationSyncJobs.id });

    return updated.length;
  }

  async syncFromXero(companyId: string, userId?: string): Promise<XeroImportSyncResult> {
    await this.failStaleImportJobs(companyId);

    if (activeImportCompanies.has(companyId)) {
      throw new XeroSyncError(
        'SYNC_IN_PROGRESS',
        'A Xero sync is already running for this company. Wait for it to finish, then retry.',
      );
    }

    const activeJob = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        eq(integrationSyncJobs.provider, 'xero'),
        eq(integrationSyncJobs.syncScope, 'import'),
        inArray(integrationSyncJobs.status, ['pending', 'running']),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
    });

    if (activeJob) {
      throw new XeroSyncError(
        'SYNC_IN_PROGRESS',
        'A Xero sync is already running for this company. Wait for it to finish, then retry.',
      );
    }

    activeImportCompanies.add(companyId);
    const deadlineAt = Date.now() + XERO_IMPORT_OVERALL_TIMEOUT_MS;
    const isTimedOut = () => Date.now() >= deadlineAt;

    try {
      return await this.runXeroImport(companyId, userId, isTimedOut);
    } catch (error) {
      // Ensure abandoned DB jobs cannot block the next Sync now after unexpected failures.
      await this.failStaleImportJobs(companyId, 0);
      throw error;
    } finally {
      activeImportCompanies.delete(companyId);
    }
  }

  private async runXeroImport(
    companyId: string,
    userId: string | undefined,
    isTimedOut: () => boolean,
  ): Promise<XeroImportSyncResult> {
    let syncJobId: string | undefined;

    try {
      return await this.executeXeroImportStages(companyId, userId, isTimedOut, (id) => {
        syncJobId = id;
      });
    } catch (error) {
      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'failed',
          errorMessage: mapError(error),
          resultSummary: {
            unexpectedError: true,
            failedStage: null,
          },
        });
      }
      throw error;
    }
  }

  private async executeXeroImportStages(
    companyId: string,
    userId: string | undefined,
    isTimedOut: () => boolean,
    onJobStarted: (syncJobId: string | undefined) => void,
  ): Promise<XeroImportSyncResult> {
    const ctx = await this.createSyncContext(companyId);
    ctx.isTimedOut = isTimedOut;
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'xero',
      integrationConnectionId: ctx.connection.id,
      jobType: 'manual',
      syncScope: 'import',
    });

    ctx.syncJobId = syncJobId;
    onJobStarted(syncJobId);

    let contacts = emptyImportCounts();
    let invoices = emptyImportCounts();
    let payments = emptyImportCounts();
    let bankTransactions = emptyImportCounts();
    const completedStages: XeroImportStage[] = [];
    let failedStage: XeroImportStage | null = null;
    let stageError: string | null = null;

    const stages: Array<{
      stage: XeroImportStage;
      run: () => Promise<XeroImportEntityCounts>;
      assign: (counts: XeroImportEntityCounts) => void;
    }> = [
      {
        stage: 'contacts',
        run: () => this.importContactsFromXero(ctx),
        assign: (counts) => {
          contacts = counts;
        },
      },
      {
        stage: 'invoices',
        run: () => this.importInvoicesFromXero(ctx),
        assign: (counts) => {
          invoices = counts;
        },
      },
      {
        stage: 'payments',
        run: () => this.importPaymentsFromXero(ctx),
        assign: (counts) => {
          payments = counts;
        },
      },
      {
        stage: 'bank_transactions',
        run: () => this.importBankTransactionsFromXero(ctx),
        assign: (counts) => {
          bankTransactions = counts;
        },
      },
    ];

    for (const step of stages) {
      if (isTimedOut()) {
        failedStage = step.stage;
        stageError = `Xero sync timed out after ${XERO_IMPORT_OVERALL_TIMEOUT_MS / 1000}s during ${step.stage}. Partial imports were kept; Last sync was not updated.`;
        break;
      }

      await this.updateImportJobProgress(syncJobId, {
        stage: step.stage,
        completedStages,
        contacts,
        invoices,
        payments,
        bankTransactions,
      });

      try {
        const counts = await step.run();
        if (isTimedOut()) {
          failedStage = step.stage;
          stageError = `Xero sync timed out after ${XERO_IMPORT_OVERALL_TIMEOUT_MS / 1000}s during ${step.stage}. Partial imports were kept; Last sync was not updated.`;
          step.assign(counts);
          break;
        }
        step.assign(counts);
        completedStages.push(step.stage);
      } catch (error) {
        failedStage = step.stage;
        stageError =
          error instanceof XeroError && error.code === 'TIMEOUT'
            ? `Xero API timed out during ${step.stage}: ${error.message}`
            : mapError(error);
        break;
      }
    }

    const totalFailed =
      contacts.failedCount +
      invoices.failedCount +
      payments.failedCount +
      bankTransactions.failedCount;

    const success = failedStage == null && totalFailed === 0;
    const message = buildXeroImportSyncMessage({
      success,
      contacts,
      invoices,
      payments,
      bankTransactions,
      failedStage,
      stageError,
    });
    const now = new Date();

    const result: XeroImportSyncResult = {
      success,
      message,
      syncedAt: success ? now.toISOString() : null,
      contacts,
      invoices,
      payments,
      bankTransactions,
      failedStage,
      completedStages,
      syncJobId,
    };

    await this.db
      .update(integrationConnections)
      .set({
        ...(success ? { lastSyncAt: now, lastError: null } : { lastError: message }),
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, ctx.connection.id));

    if (syncJobId) {
      await this.hubService?.completeSyncJob(syncJobId, {
        status: success ? 'completed' : 'failed',
        errorMessage: success ? null : message,
        resultSummary: {
          success,
          failedStage,
          completedStages,
          contacts: summarizeCounts(contacts),
          invoices: summarizeCounts(invoices),
          payments: summarizeCounts(payments),
          bankTransactions: summarizeCounts(bankTransactions),
        },
      });
    }

    if (userId) {
      await this.db.insert(securityAuditLogs).values({
        companyId,
        userId,
        category: 'integrations',
        action: success ? 'xero_import_sync_completed' : 'xero_import_sync_failed',
        entityType: 'integration_connection',
        entityId: ctx.connection.id,
        metadata: {
          failedStage,
          completedStages,
          contactsCreated: contacts.createdCount,
          contactsUpdated: contacts.updatedCount,
          invoicesCreated: invoices.createdCount,
          invoicesUpdated: invoices.updatedCount,
          paymentsCreated: payments.createdCount,
          paymentsUpdated: payments.updatedCount,
          bankTransactionsCreated: bankTransactions.createdCount,
          bankTransactionsUpdated: bankTransactions.updatedCount,
          failedCount: totalFailed,
        },
      });
    }

    invalidateIntegrationReadCaches(companyId);
    return result;
  }

  private async updateImportJobProgress(
    syncJobId: string | undefined,
    progress: {
      stage: XeroImportStage;
      completedStages: XeroImportStage[];
      contacts: XeroImportEntityCounts;
      invoices: XeroImportEntityCounts;
      payments: XeroImportEntityCounts;
      bankTransactions: XeroImportEntityCounts;
    },
  ): Promise<void> {
    if (!syncJobId) {
      return;
    }

    await this.db
      .update(integrationSyncJobs)
      .set({
        resultSummary: {
          currentStage: progress.stage,
          completedStages: progress.completedStages,
          contacts: summarizeCounts(progress.contacts),
          invoices: summarizeCounts(progress.invoices),
          payments: summarizeCounts(progress.payments),
          bankTransactions: summarizeCounts(progress.bankTransactions),
        },
      })
      .where(eq(integrationSyncJobs.id, syncJobId));
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

          let remote;
          if (!xeroInvoiceId) {
            remote = await ctx.client.createInvoice({
              contactId: customerMapping.xeroContactId,
              invoiceNumber: invoice.invoiceNumber,
              title: invoice.title,
              amountCents: invoice.amountCents,
              currency: invoice.currency,
              dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
              issueDate: invoice.issuedAt?.toISOString().slice(0, 10) ?? null,
            });
            xeroInvoiceId = remote.invoiceId;
            createdCount += 1;
          } else {
            remote = await ctx.client.fetchInvoice(xeroInvoiceId);
          }
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
        invoiceMappings.filter((row) => row.xeroInvoiceId).map((row) => [row.xeroInvoiceId!, row]),
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

          // Avoid N+1 Xero invoice fetches during payment sync.
          const paymentCents = amountToCents(remotePayment.amount);
          const nextPaidCents = (invoiceMapping.invoice.amountPaidCents ?? 0) + paymentCents;
          const invoiceTotalCents = invoiceMapping.invoice.amountCents ?? 0;
          const amountDue = Math.max(invoiceTotalCents - nextPaidCents, 0) / 100;
          const amountPaid = nextPaidCents / 100;
          const total = invoiceTotalCents / 100;

          await this.db
            .update(invoices)
            .set({
              amountPaidCents: nextPaidCents,
              status: mapXeroInvoiceStatus({
                xeroStatus: amountDue <= 0 ? 'PAID' : invoiceMapping.invoice.status,
                amountDue,
                amountPaid,
                total,
              }),
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoiceMapping.invoiceId));

          invoiceMapping.invoice.amountPaidCents = nextPaidCents;

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

    const customerOutstanding = new Map<
      string,
      { customerName: string; amountCents: number; count: number }
    >();

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

    const credentials = decryptXeroCredentials(
      connection.credentialsEncrypted,
      this.encryptionKey!,
    );

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

  private assertImportNotTimedOut(ctx: SyncContext, stage: XeroImportStage): void {
    if (ctx.isTimedOut?.()) {
      throw new XeroSyncError(
        'TIMEOUT',
        `Xero sync timed out after ${XERO_IMPORT_OVERALL_TIMEOUT_MS / 1000}s during ${stage}. Partial imports were kept; Last sync was not updated.`,
      );
    }
  }

  private async importContactsFromXero(ctx: SyncContext): Promise<XeroImportEntityCounts> {
    this.assertImportNotTimedOut(ctx, 'contacts');
    const remoteContacts = await ctx.client.listContacts();
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const contact of remoteContacts) {
      this.assertImportNotTimedOut(ctx, 'contacts');
      try {
        const existingMapping = await this.db.query.xeroCustomerMappings.findFirst({
          where: and(
            eq(xeroCustomerMappings.companyId, ctx.companyId),
            eq(xeroCustomerMappings.xeroContactId, contact.contactId),
          ),
        });

        if (existingMapping) {
          await this.db
            .update(customers)
            .set({
              name: contact.name,
              email: contact.email,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(customers.id, existingMapping.customerId),
                eq(customers.companyId, ctx.companyId),
              ),
            );

          await this.upsertCustomerMapping(
            ctx,
            existingMapping.customerId,
            contact.contactId,
            'synced',
          );
          updatedCount += 1;
        } else {
          const customerId = await this.resolveCustomerForXeroContact(ctx, {
            xeroContactId: contact.contactId,
            name: contact.name,
            email: contact.email,
          });
          await this.upsertCustomerMapping(ctx, customerId, contact.contactId, 'synced');
          createdCount += 1;
        }

        await this.writeLog(ctx, {
          entityType: 'customer',
          xeroEntityId: contact.contactId,
          action: 'pull',
          status: 'success',
          message: `Imported Xero contact ${contact.name}`,
        });
      } catch (error) {
        failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'customer',
          xeroEntityId: contact.contactId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    if (remoteContacts.length === 0) {
      skippedCount = 1;
    }

    return {
      createdCount,
      updatedCount,
      pulledCount: remoteContacts.length,
      failedCount,
      skippedCount,
    };
  }

  private async importInvoicesFromXero(ctx: SyncContext): Promise<XeroImportEntityCounts> {
    this.assertImportNotTimedOut(ctx, 'invoices');
    const remoteInvoices = await ctx.client.listInvoices();
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const remote of remoteInvoices) {
      this.assertImportNotTimedOut(ctx, 'invoices');
      try {
        if (!remote.contactId) {
          skippedCount += 1;
          continue;
        }

        const customerId = await this.resolveCustomerForXeroContact(ctx, {
          xeroContactId: remote.contactId,
          name: remote.contactName ?? 'Xero contact',
        });

        const existingMapping = await this.db.query.xeroInvoiceMappings.findFirst({
          where: and(
            eq(xeroInvoiceMappings.companyId, ctx.companyId),
            eq(xeroInvoiceMappings.xeroInvoiceId, remote.invoiceId),
          ),
        });

        const nextStatus = mapXeroInvoiceStatus({
          xeroStatus: remote.status,
          amountDue: remote.amountDue,
          amountPaid: remote.amountPaid,
          total: remote.total,
        });
        const amountCents = amountToCents(remote.total);
        const amountPaidCents = amountToCents(remote.amountPaid);
        const invoiceNumber = resolveImportedInvoiceNumber(remote.invoiceNumber, remote.invoiceId);
        const currency = remote.currencyCode ?? ctx.connection.config.baseCurrency ?? 'USD';

        if (existingMapping) {
          await this.db
            .update(invoices)
            .set({
              status: nextStatus,
              amountCents,
              amountPaidCents,
              currency,
              dueDate: remote.dueDate ? new Date(remote.dueDate) : undefined,
              issuedAt: remote.issueDate ? new Date(remote.issueDate) : undefined,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(invoices.id, existingMapping.invoiceId),
                eq(invoices.companyId, ctx.companyId),
              ),
            );

          await this.upsertInvoiceMapping(
            ctx,
            existingMapping.invoiceId,
            remote.invoiceId,
            'synced',
          );
          updatedCount += 1;

          await this.writeLog(ctx, {
            entityType: 'invoice',
            entityId: existingMapping.invoiceId,
            xeroEntityId: remote.invoiceId,
            action: 'pull',
            status: 'success',
            message: `Updated invoice ${invoiceNumber} from Xero`,
          });
          continue;
        }

        const [createdInvoice] = await this.db
          .insert(invoices)
          .values({
            companyId: ctx.companyId,
            customerId,
            invoiceNumber,
            title: remote.invoiceNumber ?? `Invoice ${invoiceNumber}`,
            status: nextStatus,
            amountCents,
            amountPaidCents,
            currency,
            dueDate: remote.dueDate ? new Date(remote.dueDate) : null,
            issuedAt: remote.issueDate ? new Date(remote.issueDate) : new Date(),
            notes: 'Imported from Xero',
          })
          .returning();

        if (!createdInvoice) {
          throw new XeroSyncError('CREATE_FAILED', 'Unable to create invoice from Xero');
        }

        await this.upsertInvoiceMapping(ctx, createdInvoice.id, remote.invoiceId, 'synced');
        createdCount += 1;

        await this.writeLog(ctx, {
          entityType: 'invoice',
          entityId: createdInvoice.id,
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'success',
          message: `Imported invoice ${invoiceNumber} from Xero`,
        });
      } catch (error) {
        failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'invoice',
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    return {
      createdCount,
      updatedCount,
      pulledCount: remoteInvoices.length,
      failedCount,
      skippedCount,
    };
  }

  private async importPaymentsFromXero(ctx: SyncContext): Promise<XeroImportEntityCounts> {
    this.assertImportNotTimedOut(ctx, 'payments');
    const invoiceMappings = await this.db.query.xeroInvoiceMappings.findMany({
      where: and(
        eq(xeroInvoiceMappings.companyId, ctx.companyId),
        eq(xeroInvoiceMappings.syncStatus, 'synced'),
      ),
      with: { invoice: true },
    });

    const mappingByXeroInvoiceId = new Map(
      invoiceMappings.filter((row) => row.xeroInvoiceId).map((row) => [row.xeroInvoiceId!, row]),
    );

    const remotePayments = await ctx.client.listPayments();

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const remotePayment of remotePayments) {
      this.assertImportNotTimedOut(ctx, 'payments');
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
            eq(xeroPaymentMappings.companyId, ctx.companyId),
            eq(xeroPaymentMappings.xeroPaymentId, remotePayment.paymentId),
          ),
        });

        if (existingPaymentMapping) {
          updatedCount += 1;
          continue;
        }

        const paymentCents = amountToCents(remotePayment.amount);
        const [createdPayment] = await this.db
          .insert(payments)
          .values({
            companyId: ctx.companyId,
            invoiceId: invoiceMapping.invoiceId,
            amountCents: paymentCents,
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
          companyId: ctx.companyId,
          integrationConnectionId: ctx.connection.id,
          paymentId: createdPayment.id,
          xeroPaymentId: remotePayment.paymentId,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          lastSuccessfulSyncAt: new Date(),
        });

        // Avoid N+1 Xero invoice fetches (was hanging large payment imports).
        const nextPaidCents = (invoiceMapping.invoice.amountPaidCents ?? 0) + paymentCents;
        const invoiceTotalCents = invoiceMapping.invoice.amountCents ?? 0;
        const amountDue = Math.max(invoiceTotalCents - nextPaidCents, 0) / 100;
        const amountPaid = nextPaidCents / 100;
        const total = invoiceTotalCents / 100;

        await this.db
          .update(invoices)
          .set({
            amountPaidCents: nextPaidCents,
            status: mapXeroInvoiceStatus({
              xeroStatus: amountDue <= 0 ? 'PAID' : invoiceMapping.invoice.status,
              amountDue,
              amountPaid,
              total,
            }),
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoiceMapping.invoiceId));

        invoiceMapping.invoice.amountPaidCents = nextPaidCents;

        await this.writeLog(ctx, {
          entityType: 'payment',
          entityId: createdPayment.id,
          xeroEntityId: remotePayment.paymentId,
          action: 'pull',
          status: 'success',
          message: `Imported payment for invoice ${invoiceMapping.invoice.invoiceNumber}`,
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

    return {
      createdCount,
      updatedCount,
      pulledCount: remotePayments.length,
      failedCount,
      skippedCount,
    };
  }

  private async importBankTransactionsFromXero(ctx: SyncContext): Promise<XeroImportEntityCounts> {
    this.assertImportNotTimedOut(ctx, 'bank_transactions');
    const remoteRows = await ctx.client.listBankTransactions();
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const remote of remoteRows) {
      this.assertImportNotTimedOut(ctx, 'bank_transactions');
      try {
        const existing = await this.db.query.xeroSyncLogs.findFirst({
          where: and(
            eq(xeroSyncLogs.companyId, ctx.companyId),
            eq(xeroSyncLogs.entityType, 'bank_transaction'),
            eq(xeroSyncLogs.xeroEntityId, remote.bankTransactionId),
          ),
        });

        const details = {
          amount: remote.amount,
          currencyCode: remote.currencyCode,
          date: remote.date,
          reference: remote.reference,
          description: remote.description,
        };

        if (existing) {
          await this.db
            .update(xeroSyncLogs)
            .set({
              message:
                remote.description ?? remote.reference ?? 'Updated bank transaction from Xero',
              details,
              syncJobId: ctx.syncJobId ?? null,
            })
            .where(eq(xeroSyncLogs.id, existing.id));
          updatedCount += 1;
          continue;
        }

        await this.db.insert(xeroSyncLogs).values({
          companyId: ctx.companyId,
          integrationConnectionId: ctx.connection.id,
          syncJobId: ctx.syncJobId ?? null,
          entityType: 'bank_transaction',
          xeroEntityId: remote.bankTransactionId,
          action: 'pull',
          status: 'success',
          message: remote.description ?? remote.reference ?? 'Imported bank transaction from Xero',
          details,
        });
        createdCount += 1;
      } catch (error) {
        failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'bank_transaction',
          xeroEntityId: remote.bankTransactionId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    if (remoteRows.length === 0) {
      skippedCount = 1;
    }

    return {
      createdCount,
      updatedCount,
      pulledCount: remoteRows.length,
      failedCount,
      skippedCount,
    };
  }

  private async resolveCustomerForXeroContact(
    ctx: SyncContext,
    input: { xeroContactId: string; name: string; email?: string | null; phone?: string | null },
  ): Promise<string> {
    const existingMapping = await this.db.query.xeroCustomerMappings.findFirst({
      where: and(
        eq(xeroCustomerMappings.companyId, ctx.companyId),
        eq(xeroCustomerMappings.xeroContactId, input.xeroContactId),
      ),
    });

    if (existingMapping) {
      return existingMapping.customerId;
    }

    const [created] = await this.db
      .insert(customers)
      .values({
        companyId: ctx.companyId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        status: 'active',
      })
      .returning();

    if (!created) {
      throw new XeroSyncError('CREATE_FAILED', 'Unable to create customer from Xero contact');
    }

    return created.id;
  }

  private async writeLog(
    ctx: SyncContext,
    input: {
      entityType: 'customer' | 'quote' | 'invoice' | 'payment' | 'bank_transaction';
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

export function resolveImportedInvoiceNumber(
  invoiceNumber: string | null,
  xeroInvoiceId: string,
): string {
  const trimmed = invoiceNumber?.trim();
  if (trimmed) {
    return trimmed;
  }

  return `XERO-${xeroInvoiceId.slice(0, 8).toUpperCase()}`;
}

export function summarizeCounts(counts: XeroImportEntityCounts): Record<string, number> {
  return {
    createdCount: counts.createdCount,
    updatedCount: counts.updatedCount,
    pulledCount: counts.pulledCount,
    failedCount: counts.failedCount,
    skippedCount: counts.skippedCount,
  };
}

export function buildXeroImportSyncMessage(input: {
  success: boolean;
  contacts: XeroImportEntityCounts;
  invoices: XeroImportEntityCounts;
  payments: XeroImportEntityCounts;
  bankTransactions: XeroImportEntityCounts;
  failedStage?: XeroImportStage | null;
  stageError?: string | null;
}): string {
  const createdTotal =
    input.contacts.createdCount +
    input.invoices.createdCount +
    input.payments.createdCount +
    input.bankTransactions.createdCount;
  const updatedTotal =
    input.contacts.updatedCount +
    input.invoices.updatedCount +
    input.payments.updatedCount +
    input.bankTransactions.updatedCount;
  const failedTotal =
    input.contacts.failedCount +
    input.invoices.failedCount +
    input.payments.failedCount +
    input.bankTransactions.failedCount;

  const summary = `Contacts ${input.contacts.createdCount} new / ${input.contacts.updatedCount} updated, invoices ${input.invoices.createdCount} new / ${input.invoices.updatedCount} updated, payments ${input.payments.createdCount} new / ${input.payments.updatedCount} updated, bank transactions ${input.bankTransactions.createdCount} new / ${input.bankTransactions.updatedCount} updated`;

  if (input.success) {
    return `Xero sync complete. ${summary}.`;
  }

  if (input.failedStage) {
    const detail = input.stageError ? ` ${input.stageError}` : '';
    return `Xero sync failed during ${input.failedStage}.${detail} ${summary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records. Last sync was not updated.`;
  }

  return `Xero sync finished with ${failedTotal} failed record(s). ${summary}. Imported ${createdTotal} new and updated ${updatedTotal} existing records.`;
}
