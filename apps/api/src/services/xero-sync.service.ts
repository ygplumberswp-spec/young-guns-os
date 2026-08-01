import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type {
  XeroAccountingAuraContext,
  XeroEntitySyncResult,
  XeroEnqueueImportResult,
  XeroImportEntityCounts,
  XeroImportJobProgress,
  XeroImportSyncResult,
  XeroSyncLogSummary,
  XeroSyncScope,
  XeroSyncStatusResponse,
  IntegrationSyncTrigger,
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
import { amountToCents, mapXeroInvoiceStatus, XeroClient, XeroError, XERO_PAGE_SIZE, XERO_RATE_LIMIT_BASE_DELAY_MS } from '../lib/xero.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';
import { invalidateIntegrationReadCaches } from './api-read-cache.js';
import {
  advanceToNextStage,
  buildImportJobProgress,
  buildImportSyncResult,
  createInitialImportJobState,
  importJobStateToSummary,
  isStageComplete,
  parseImportJobState,
  XERO_IMPORT_BATCH_BUDGET_MS,
  XERO_IMPORT_MAX_PAGES_PER_BATCH,
  XERO_IMPORT_STALE_JOB_MS,
  XERO_IMPORT_STALL_THRESHOLD_MS,
  XERO_IMPORT_PENDING_STALE_MS,
  XERO_IMPORT_LEASE_MS,
} from './xero-import-job.processor.js';
import {
  buildXeroImportSyncMessage,
  summarizeCounts,
  type XeroImportJobState,
} from './xero-import-job.shared.js';

export class XeroSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroSyncError';
  }
}

/** @deprecated Use XERO_IMPORT_BATCH_BUDGET_MS — kept for legacy test assertions. */
export const XERO_IMPORT_OVERALL_TIMEOUT_MS = XERO_IMPORT_BATCH_BUDGET_MS;
export { XERO_IMPORT_STALE_JOB_MS, XERO_IMPORT_BATCH_BUDGET_MS, XERO_IMPORT_MAX_PAGES_PER_BATCH, XERO_IMPORT_STALL_THRESHOLD_MS };
export { buildXeroImportSyncMessage, summarizeCounts };

const XERO_IMPORT_WORKER_ID = `${process.env.HOSTNAME ?? 'worker'}-${process.pid}`;

const processingImportJobs = new Set<string>();

type XeroSyncServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
  xeroOAuthService?: XeroOAuthService;
  writeApprovalGate?: import('./xero-write-approval-gate.service.js').XeroWriteApprovalGate;
  mappingConflictService?: import('./xero-mapping-conflict.service.js').XeroMappingConflictService;
};

type SyncFromXeroOptions = {
  jobType?: 'manual' | 'scheduled';
  trigger?: IntegrationSyncTrigger;
  idempotencyKey?: string;
  /** When true, blocks until the queued background job finishes (tests/internal only). */
  waitForCompletion?: boolean;
};

export type XeroImportJobSettledInput = {
  companyId: string;
  syncJobId: string;
  trigger?: IntegrationSyncTrigger;
  result: XeroImportSyncResult;
};

type XeroImportJobSettledHandler = (input: XeroImportJobSettledInput) => Promise<void>;

type SyncContext = {
  companyId: string;
  connection: typeof integrationConnections.$inferSelect;
  client: XeroClient;
  syncJobId?: string;
};

export class XeroSyncService {
  private importJobSettledHandler?: XeroImportJobSettledHandler;
  private readonly writeApprovalGate?: import('./xero-write-approval-gate.service.js').XeroWriteApprovalGate;
  private readonly mappingConflictService?: import('./xero-mapping-conflict.service.js').XeroMappingConflictService;

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly hubService?: IntegrationHubService,
    private readonly xeroOAuthService?: XeroOAuthService,
    deps?: Pick<XeroSyncServiceDeps, 'writeApprovalGate' | 'mappingConflictService'>,
  ) {
    this.writeApprovalGate = deps?.writeApprovalGate;
    this.mappingConflictService = deps?.mappingConflictService;
  }

  static create(deps: XeroSyncServiceDeps): XeroSyncService {
    return new XeroSyncService(
      deps.db,
      deps.encryptionKey,
      deps.hubService,
      deps.xeroOAuthService,
      deps,
    );
  }

  setImportJobSettledHandler(handler: XeroImportJobSettledHandler): void {
    this.importJobSettledHandler = handler;
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

    const importJob = await this.getImportJobProgress(companyId);

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
      importJob,
    };
  }

  async getImportJobProgress(companyId: string, jobId?: string): Promise<XeroImportJobProgress | null> {
    const job = jobId
      ? await this.db.query.integrationSyncJobs.findFirst({
          where: and(
            eq(integrationSyncJobs.id, jobId),
            eq(integrationSyncJobs.companyId, companyId),
            eq(integrationSyncJobs.provider, 'xero'),
            eq(integrationSyncJobs.syncScope, 'import'),
          ),
        })
      : await this.db.query.integrationSyncJobs.findFirst({
          where: and(
            eq(integrationSyncJobs.companyId, companyId),
            eq(integrationSyncJobs.provider, 'xero'),
            eq(integrationSyncJobs.syncScope, 'import'),
          ),
          orderBy: [desc(integrationSyncJobs.startedAt)],
        });

    if (!job) {
      return null;
    }

    const state = parseImportJobState(job.resultSummary as Record<string, unknown> | null);
    const status =
      job.status === 'pending'
        ? 'queued'
        : (job.status as XeroImportJobProgress['status']);

    return buildImportJobProgress(
      job.id,
      status,
      state,
      job.status === 'completed' ? job.completedAt?.toISOString() ?? null : null,
      job.errorMessage ?? state.stageError,
      job.status,
    );
  }

  async enqueueImportSync(
    companyId: string,
    userId?: string,
    options?: SyncFromXeroOptions,
  ): Promise<XeroEnqueueImportResult> {
    await this.failStaleImportJobs(companyId);

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
      return {
        jobId: activeJob.id,
        status: activeJob.status === 'pending' ? 'queued' : 'running',
        message:
          activeJob.status === 'pending'
            ? 'Xero import is already queued.'
            : 'Xero import is already running.',
      };
    }

    const ctx = await this.createSyncContext(companyId);
    const initialState = createInitialImportJobState({
      idempotencyKey: options?.idempotencyKey,
      trigger: options?.trigger,
    });

    if (!this.hubService) {
      throw new XeroSyncError('NOT_CONFIGURED', 'Integration hub is required for Xero import jobs');
    }

    const syncJobId = await this.hubService.enqueueSyncJob({
      companyId,
      provider: 'xero',
      integrationConnectionId: ctx.connection.id,
      jobType: options?.jobType ?? 'manual',
      syncScope: 'import',
      resultSummary: importJobStateToSummary(initialState),
    });

    if (userId) {
      await this.db.insert(securityAuditLogs).values({
        companyId,
        userId,
        category: 'integrations',
        action: 'xero_import_sync_queued',
        entityType: 'integration_connection',
        entityId: ctx.connection.id,
        metadata: {
          syncJobId,
          trigger: options?.trigger ?? 'manual',
        },
      });
    }

    void this.processImportJobBatch(syncJobId).catch((error: unknown) => {
      console.error('[xero-sync] Background import batch failed after enqueue', {
        companyId,
        syncJobId,
        error,
      });
    });

    return {
      jobId: syncJobId,
      status: 'queued',
      message: 'Xero import queued for background processing.',
    };
  }

  async processPendingImportJobs(limit = 10): Promise<number> {
    await this.failStaleImportJobs();
    await this.resumeAbandonedImportJobs(limit);

    const jobs = await this.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.provider, 'xero'),
        eq(integrationSyncJobs.syncScope, 'import'),
        inArray(integrationSyncJobs.status, ['pending', 'running']),
      ),
      orderBy: [integrationSyncJobs.startedAt],
      limit,
    });

    let processed = 0;

    for (const job of jobs) {
      const state = parseImportJobState(job.resultSummary as Record<string, unknown> | null);
      if (state.nextRetryAt && new Date(state.nextRetryAt) > new Date()) {
        continue;
      }

      await this.processImportJobBatch(job.id);
      processed += 1;
    }

    return processed;
  }

  async processImportJobBatch(syncJobId: string): Promise<XeroImportSyncResult | null> {
    if (processingImportJobs.has(syncJobId)) {
      return null;
    }

    processingImportJobs.add(syncJobId);

    try {
      const job = await this.db.query.integrationSyncJobs.findFirst({
        where: eq(integrationSyncJobs.id, syncJobId),
      });

      if (!job || job.syncScope !== 'import' || job.provider !== 'xero') {
        return null;
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return buildImportSyncResult(
          parseImportJobState(job.resultSummary as Record<string, unknown> | null),
          job.id,
          job.completedAt?.toISOString() ?? null,
        );
      }

      const state = parseImportJobState(job.resultSummary as Record<string, unknown> | null);

      if (state.nextRetryAt && new Date(state.nextRetryAt) > new Date()) {
        return null;
      }

      if (job.status === 'running' && !this.canAcquireImportJobLease(state)) {
        return null;
      }

      if (job.status === 'pending') {
        await this.db
          .update(integrationSyncJobs)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(integrationSyncJobs.id, syncJobId));
      }

      this.renewImportJobLease(state);
      await this.persistImportJobState(syncJobId, state, 'processing');

      const ctx = await this.createSyncContext(job.companyId);
      ctx.syncJobId = syncJobId;

      const deadlineAt = Date.now() + XERO_IMPORT_BATCH_BUDGET_MS;
      let allStagesComplete = false;
      let waitingForRetry = false;

      while (Date.now() < deadlineAt && !state.failedStage && !waitingForRetry) {
        const batchResult = await this.processCurrentImportStageBatch(ctx, state, deadlineAt);

        await this.persistImportJobState(
          syncJobId,
          state,
          batchResult.rateLimited ? 'rate_limited' : 'processing',
        );

        if (state.failedStage) {
          break;
        }

        if (batchResult.rateLimited) {
          waitingForRetry = true;
          break;
        }

        if (batchResult.stageComplete) {
          await this.persistImportJobState(syncJobId, state, 'processing');
          if (!advanceToNextStage(state)) {
            allStagesComplete = true;
            break;
          }
          await this.persistImportJobState(syncJobId, state, 'processing');
        } else if (batchResult.budgetExhausted) {
          await this.persistImportJobState(syncJobId, state, 'waiting_next_batch');
          break;
        }
      }

      if (state.failedStage || !allStagesComplete) {
        if (!state.failedStage) {
          return null;
        }

        return this.finalizeImportJob(job.companyId, syncJobId, ctx.connection.id, state);
      }

      return this.finalizeImportJob(job.companyId, syncJobId, ctx.connection.id, state, true);
    } catch (error) {
      const message = mapError(error);
      await this.hubService?.completeSyncJob(syncJobId, {
        status: 'failed',
        errorMessage: message,
        resultSummary: {
          unexpectedError: true,
          failedStage: null,
        },
      });
      throw error;
    } finally {
      processingImportJobs.delete(syncJobId);
    }
  }

  async syncFromXero(
    companyId: string,
    userId?: string,
    options?: SyncFromXeroOptions,
  ): Promise<XeroImportSyncResult> {
    const queued = await this.enqueueImportSync(companyId, userId, options);

    if (!options?.waitForCompletion) {
      const progress = await this.getImportJobProgress(companyId, queued.jobId);
      const state = progress
        ? {
            checkpoint: {
              stage: progress.currentStage ?? 'contacts',
              contactsPage: 1,
              invoicesPage: 1,
              paymentsPage: 1,
              bankTransactionsPage: 1,
            },
            completedStages: progress.completedStages,
            contacts: progress.contacts,
            invoices: progress.invoices,
            payments: progress.payments,
            bankTransactions: progress.bankTransactions,
            failedStage: progress.failedStage,
            stageError: progress.message,
          }
        : createInitialImportJobState(options);

      return {
        ...buildImportSyncResult(state, queued.jobId, null),
        success: false,
        message: queued.message,
        syncedAt: null,
      };
    }

    const deadline = Date.now() + XERO_IMPORT_STALL_THRESHOLD_MS * 4;

    while (Date.now() < deadline) {
      const result = await this.processImportJobBatch(queued.jobId);
      const progress = await this.getImportJobProgress(companyId, queued.jobId);

      if (
        progress &&
        (progress.status === 'completed' || progress.status === 'failed') &&
        result
      ) {
        return result;
      }

      if (!progress || progress.status === 'completed' || progress.status === 'failed') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new XeroSyncError(
      'SYNC_TIMEOUT',
      'Xero background import did not finish within the expected window.',
    );
  }

  private async retryImportSyncJob(
    companyId: string,
    syncJobId: string,
  ): Promise<XeroEntitySyncResult> {
    const failedJob = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.id, syncJobId),
        eq(integrationSyncJobs.companyId, companyId),
      ),
    });

    if (!failedJob) {
      throw new XeroSyncError('NOT_FOUND', 'Sync job not found');
    }

    let resumeState = parseImportJobState(
      failedJob.resultSummary as Record<string, unknown> | null,
    );

    if (!resumeState.checkpoint?.stage || resumeState.abandoned) {
      resumeState = await this.reconstructImportCheckpointFromMappings(companyId, resumeState);
    }

    resumeState.failedStage = null;
    resumeState.stageError = null;
    resumeState.nextRetryAt = null;
    resumeState.resumedFromAbandoned = true;
    resumeState.trigger = 'resume';

    await this.db
      .update(integrationSyncJobs)
      .set({
        status: 'pending',
        errorMessage: null,
        completedAt: null,
        resultSummary: importJobStateToSummary(resumeState),
      })
      .where(eq(integrationSyncJobs.id, syncJobId));

    const deadline = Date.now() + XERO_IMPORT_STALL_THRESHOLD_MS * 4;

    while (Date.now() < deadline) {
      const result = await this.processImportJobBatch(syncJobId);
      const progress = await this.getImportJobProgress(companyId, syncJobId);

      if (progress && (progress.status === 'completed' || progress.status === 'failed') && result) {
        return {
          scope: 'import',
          createdCount:
            result.contacts.createdCount +
            result.invoices.createdCount +
            result.payments.createdCount +
            result.bankTransactions.createdCount,
          updatedCount:
            result.contacts.updatedCount +
            result.invoices.updatedCount +
            result.payments.updatedCount +
            result.bankTransactions.updatedCount,
          pulledCount:
            result.contacts.pulledCount +
            result.invoices.pulledCount +
            result.payments.pulledCount +
            result.bankTransactions.pulledCount,
          failedCount:
            result.contacts.failedCount +
            result.invoices.failedCount +
            result.payments.failedCount +
            result.bankTransactions.failedCount,
          skippedCount:
            result.contacts.skippedCount +
            result.invoices.skippedCount +
            result.payments.skippedCount +
            result.bankTransactions.skippedCount,
          syncedAt: result.syncedAt ?? new Date().toISOString(),
          syncJobId,
        };
      }

      if (!progress || progress.status === 'completed' || progress.status === 'failed') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new XeroSyncError(
      'SYNC_TIMEOUT',
      'Xero background import did not finish within the expected window.',
    );
  }

  private async persistImportJobState(
    syncJobId: string,
    state: XeroImportJobState,
    activity: import('@titan/shared').XeroImportActivity = 'processing',
  ): Promise<void> {
    const now = new Date();
    state.heartbeatAt = now.toISOString();
    state.activity = activity;
    this.renewImportJobLease(state);

    await this.db
      .update(integrationSyncJobs)
      .set({
        resultSummary: importJobStateToSummary(state),
      })
      .where(eq(integrationSyncJobs.id, syncJobId));
  }

  private canAcquireImportJobLease(state: XeroImportJobState): boolean {
    if (!state.processingLeaseExpiresAt || !state.processingLeaseOwner) {
      return true;
    }

    const leaseExpires = new Date(state.processingLeaseExpiresAt).getTime();
    if (leaseExpires <= Date.now()) {
      return true;
    }

    return state.processingLeaseOwner === XERO_IMPORT_WORKER_ID;
  }

  private renewImportJobLease(state: XeroImportJobState): void {
    state.processingLeaseOwner = XERO_IMPORT_WORKER_ID;
    state.processingLeaseExpiresAt = new Date(Date.now() + XERO_IMPORT_LEASE_MS).toISOString();
  }

  private async finalizeImportJob(
    companyId: string,
    syncJobId: string,
    connectionId: string,
    state: XeroImportJobState,
    markComplete = false,
  ): Promise<XeroImportSyncResult> {
    const totalFailed =
      state.contacts.failedCount +
      state.invoices.failedCount +
      state.payments.failedCount +
      state.bankTransactions.failedCount;
    const success = markComplete && state.failedStage == null && totalFailed === 0;
    const now = new Date();
    const result = buildImportSyncResult(
      state,
      syncJobId,
      success ? now.toISOString() : null,
    );

    await this.db
      .update(integrationConnections)
      .set({
        ...(success ? { lastSyncAt: now, lastError: null } : { lastError: result.message }),
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connectionId));

    await this.hubService?.completeSyncJob(syncJobId, {
      status: success ? 'completed' : 'failed',
      errorMessage: success ? null : result.message,
      resultSummary: importJobStateToSummary(state),
    });

    await this.importJobSettledHandler?.({
      companyId,
      syncJobId,
      trigger: state.trigger,
      result,
    });

    invalidateIntegrationReadCaches(companyId);
    return result;
  }

  private async processCurrentImportStageBatch(
    ctx: SyncContext,
    state: XeroImportJobState,
    deadlineAt: number,
  ): Promise<{ stageComplete: boolean; budgetExhausted: boolean; rateLimited?: boolean }> {
    const stage = state.checkpoint.stage;
    let pagesProcessed = 0;
    let lastBatchSize = 0;
    let budgetExhausted = false;

    try {
      while (pagesProcessed < XERO_IMPORT_MAX_PAGES_PER_BATCH && Date.now() < deadlineAt) {
        if (stage === 'contacts') {
          const batch = await ctx.client.listContactsPage(state.checkpoint.contactsPage);
          lastBatchSize = batch.length;
          await this.importContactBatch(ctx, batch, state.contacts);
          state.checkpoint.contactsPage += 1;
        } else if (stage === 'invoices') {
          const batch = await ctx.client.listInvoicesPage(state.checkpoint.invoicesPage);
          lastBatchSize = batch.length;
          await this.importInvoiceBatch(ctx, batch, state.invoices);
          state.checkpoint.invoicesPage += 1;
        } else if (stage === 'payments') {
          const batch = await ctx.client.listPaymentsPage(state.checkpoint.paymentsPage);
          lastBatchSize = batch.length;
          await this.importPaymentBatch(ctx, batch, state.payments);
          state.checkpoint.paymentsPage += 1;
        } else {
          const batch = await ctx.client.listBankTransactionsPage(
            state.checkpoint.bankTransactionsPage,
          );
          lastBatchSize = batch.length;
          await this.importBankTransactionBatch(ctx, batch, state.bankTransactions);
          state.checkpoint.bankTransactionsPage += 1;
        }

        pagesProcessed += 1;

        if (isStageComplete(stage, state.checkpoint, lastBatchSize)) {
          return { stageComplete: true, budgetExhausted: false };
        }

        if (Date.now() >= deadlineAt) {
          budgetExhausted = true;
          break;
        }
      }

      if (pagesProcessed >= XERO_IMPORT_MAX_PAGES_PER_BATCH && !isStageComplete(stage, state.checkpoint, lastBatchSize)) {
        budgetExhausted = true;
      }

      return {
        stageComplete: isStageComplete(stage, state.checkpoint, lastBatchSize),
        budgetExhausted,
      };
    } catch (error) {
      if (error instanceof XeroError && error.code === 'RATE_LIMIT') {
        state.nextRetryAt = new Date(Date.now() + XERO_RATE_LIMIT_BASE_DELAY_MS * 2).toISOString();
        state.activity = 'rate_limited';
        state.stageError = error.message;
        return { stageComplete: false, budgetExhausted: true, rateLimited: true };
      }

      state.failedStage = stage;
      state.stageError =
        error instanceof XeroError && error.code === 'TIMEOUT'
          ? `Xero API timed out during ${stage}: ${error.message}`
          : mapError(error);
      return { stageComplete: false, budgetExhausted: false };
    }
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

  /**
   * Marks stalled Xero import jobs as failed while preserving checkpoint metadata.
   * Uses per-batch heartbeat — not total import duration from startedAt.
   */
  async failStaleImportJobs(
    companyId?: string,
    _olderThanMs?: number,
  ): Promise<number> {
    const conditions = [
      eq(integrationSyncJobs.provider, 'xero'),
      eq(integrationSyncJobs.syncScope, 'import'),
      inArray(integrationSyncJobs.status, ['pending', 'running']),
    ];

    if (companyId) {
      conditions.push(eq(integrationSyncJobs.companyId, companyId));
    }

    const jobs = await this.db.query.integrationSyncJobs.findMany({
      where: and(...conditions),
    });

    const now = Date.now();
    let abandoned = 0;

    for (const job of jobs) {
      const state = parseImportJobState(job.resultSummary as Record<string, unknown> | null);
      const heartbeatMs = state.heartbeatAt
        ? new Date(state.heartbeatAt).getTime()
        : job.startedAt.getTime();
      const thresholdMs =
        job.status === 'pending' ? XERO_IMPORT_PENDING_STALE_MS : XERO_IMPORT_STALL_THRESHOLD_MS;

      if (now - heartbeatMs < thresholdMs) {
        continue;
      }

      const summary = {
        ...importJobStateToSummary(state),
        abandoned: true,
        abandonReason: job.status === 'pending' ? 'stale_pending_job' : 'stale_running_job',
        abandonedAt: new Date().toISOString(),
        activity: 'stalled' as const,
      };

      await this.db
        .update(integrationSyncJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage:
            'Abandoned: Xero import worker stalled (no heartbeat while running). Checkpoint preserved for auto-resume.',
          resultSummary: summary,
        })
        .where(eq(integrationSyncJobs.id, job.id));

      abandoned += 1;
    }

    return abandoned;
  }

  /**
   * Re-enqueues failed/abandoned import jobs from checkpoint without creating a new job.
   */
  async resumeAbandonedImportJobs(limit = 10): Promise<number> {
    const failedJobs = await this.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.provider, 'xero'),
        eq(integrationSyncJobs.syncScope, 'import'),
        eq(integrationSyncJobs.status, 'failed'),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit: 50,
    });

    let resumed = 0;

    for (const job of failedJobs) {
      if (resumed >= limit) {
        break;
      }

      const summary = job.resultSummary as Record<string, unknown> | null;
      let state = parseImportJobState(summary);
      const legacyAbandon =
        typeof job.errorMessage === 'string' &&
        /abandoned|time limit|interrupted/i.test(job.errorMessage);
      const recoverable =
        state.abandoned === true ||
        legacyAbandon ||
        summary?.checkpoint != null ||
        state.contacts.pulledCount > 0 ||
        state.completedStages.length > 0;

      // Stage failures (failedStage) with a preserved checkpoint auto-resume on scheduler
      // tick — same outcome as manual retryImportSyncJob, which clears failedStage.
      if (!recoverable) {
        continue;
      }

      const activeJob = await this.db.query.integrationSyncJobs.findFirst({
        where: and(
          eq(integrationSyncJobs.companyId, job.companyId),
          eq(integrationSyncJobs.provider, 'xero'),
          eq(integrationSyncJobs.syncScope, 'import'),
          inArray(integrationSyncJobs.status, ['pending', 'running']),
          ne(integrationSyncJobs.id, job.id),
        ),
      });

      if (activeJob) {
        continue;
      }

      if (!summary?.checkpoint || state.abandoned || legacyAbandon) {
        state = await this.reconstructImportCheckpointFromMappings(job.companyId, state);
      }

      state.failedStage = null;
      state.stageError = null;
      state.nextRetryAt = null;
      state.abandoned = false;
      state.resumedFromAbandoned = true;
      state.trigger = 'resume';

      await this.db
        .update(integrationSyncJobs)
        .set({
          status: 'pending',
          errorMessage: null,
          completedAt: null,
          resultSummary: importJobStateToSummary(state),
        })
        .where(eq(integrationSyncJobs.id, job.id));

      void this.processImportJobBatch(job.id).catch((error: unknown) => {
        console.error('[xero-sync] Auto-resume import batch failed', {
          companyId: job.companyId,
          syncJobId: job.id,
          error,
        });
      });

      resumed += 1;
    }

    return resumed;
  }

  private async reconstructImportCheckpointFromMappings(
    companyId: string,
    partialState: XeroImportJobState,
  ): Promise<XeroImportJobState> {
    const [customerRows, invoiceRows, paymentRows, bankRows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(xeroCustomerMappings)
        .where(
          and(
            eq(xeroCustomerMappings.companyId, companyId),
            eq(xeroCustomerMappings.syncStatus, 'synced'),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(xeroInvoiceMappings)
        .where(
          and(
            eq(xeroInvoiceMappings.companyId, companyId),
            eq(xeroInvoiceMappings.syncStatus, 'synced'),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(xeroPaymentMappings)
        .where(
          and(
            eq(xeroPaymentMappings.companyId, companyId),
            eq(xeroPaymentMappings.syncStatus, 'synced'),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(xeroSyncLogs)
        .where(
          and(
            eq(xeroSyncLogs.companyId, companyId),
            eq(xeroSyncLogs.entityType, 'bank_transaction'),
            eq(xeroSyncLogs.status, 'success'),
          ),
        ),
    ]);

    const customerCount = customerRows[0]?.count ?? 0;
    const invoiceCount = invoiceRows[0]?.count ?? 0;
    const paymentCount = paymentRows[0]?.count ?? 0;
    const bankCount = bankRows[0]?.count ?? 0;

    const state: XeroImportJobState = {
      ...partialState,
      completedStages: [...partialState.completedStages],
      contacts: {
        ...partialState.contacts,
        pulledCount: Math.max(partialState.contacts.pulledCount, customerCount),
      },
      invoices: {
        ...partialState.invoices,
        pulledCount: Math.max(partialState.invoices.pulledCount, invoiceCount),
      },
      payments: {
        ...partialState.payments,
        pulledCount: Math.max(partialState.payments.pulledCount, paymentCount),
      },
      bankTransactions: {
        ...partialState.bankTransactions,
        pulledCount: Math.max(partialState.bankTransactions.pulledCount, bankCount),
      },
    };

    const completed = new Set(state.completedStages);

    if (customerCount > 0) {
      state.checkpoint.contactsPage = Math.max(1, Math.ceil(customerCount / XERO_PAGE_SIZE));
      if (invoiceCount > 0 || paymentCount > 0 || bankCount > 0 || customerCount >= XERO_PAGE_SIZE) {
        completed.add('contacts');
      }
    }

    if (invoiceCount > 0) {
      state.checkpoint.invoicesPage = Math.max(1, Math.ceil(invoiceCount / XERO_PAGE_SIZE));
      if (paymentCount > 0 || bankCount > 0) {
        completed.add('invoices');
      }
    }

    if (paymentCount > 0) {
      state.checkpoint.paymentsPage = Math.max(1, Math.ceil(paymentCount / XERO_PAGE_SIZE));
      if (bankCount > 0) {
        completed.add('payments');
      }
    }

    if (bankCount > 0) {
      state.checkpoint.bankTransactionsPage = Math.max(1, Math.ceil(bankCount / XERO_PAGE_SIZE));
    }

    state.completedStages = [...completed];

    if (!completed.has('contacts')) {
      state.checkpoint.stage = 'contacts';
    } else if (!completed.has('invoices')) {
      state.checkpoint.stage = 'invoices';
    } else if (!completed.has('payments')) {
      state.checkpoint.stage = 'payments';
    } else if (!completed.has('bank_transactions')) {
      state.checkpoint.stage = 'bank_transactions';
    }

    return state;
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
          await this.assertEntityWriteApproved({
            companyId,
            entityType: 'contact',
            entityId: customer.id,
            operation: 'contact_update',
          });

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
          await this.assertEntityWriteApproved({
            companyId,
            entityType: 'quote',
            entityId: quote.id,
            operation: 'quote_create',
          });

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
          await this.assertEntityWriteApproved({
            companyId,
            entityType: 'invoice',
            entityId: invoice.id,
            operation: 'invoice_create',
          });

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
          const officialNumber = resolveImportedInvoiceNumber(
            remote.invoiceNumber,
            xeroInvoiceId,
          );
          await this.upsertInvoiceMapping(ctx, invoice.id, xeroInvoiceId, 'synced', null, {
            xeroInvoiceNumber: officialNumber,
          });

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
      const invoiceMappings = await this.loadSyncedInvoiceMappingsForPayments(companyId);
      const mappingByXeroInvoiceId = buildSyncedInvoiceMappingLookup(invoiceMappings);

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
    extras?: {
      xeroInvoiceNumber?: string | null;
      xeroReference?: string | null;
      conflictMetadata?: Record<string, unknown> | null;
    },
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
          xeroInvoiceNumber: extras?.xeroInvoiceNumber ?? existing.xeroInvoiceNumber,
          xeroReference: extras?.xeroReference ?? existing.xeroReference,
          conflictMetadata: extras?.conflictMetadata ?? existing.conflictMetadata,
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
      xeroInvoiceNumber: extras?.xeroInvoiceNumber ?? null,
      xeroReference: extras?.xeroReference ?? null,
      conflictMetadata: extras?.conflictMetadata ?? null,
      syncStatus,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: syncStatus === 'synced' ? now : null,
      lastError: lastError ?? null,
    });
  }

  private async importContactBatch(
    ctx: SyncContext,
    remoteContacts: Awaited<ReturnType<XeroClient['listContactsPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const contact of remoteContacts) {
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
          counts.updatedCount += 1;
        } else {
          const customerId = await this.resolveCustomerForXeroContact(ctx, {
            xeroContactId: contact.contactId,
            name: contact.name,
            email: contact.email,
          });
          await this.upsertCustomerMapping(ctx, customerId, contact.contactId, 'synced');
          counts.createdCount += 1;
        }

        counts.pulledCount += 1;

        await this.writeLog(ctx, {
          entityType: 'customer',
          xeroEntityId: contact.contactId,
          action: 'pull',
          status: 'success',
          message: `Imported Xero contact ${contact.name}`,
        });
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'customer',
          xeroEntityId: contact.contactId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    if (remoteContacts.length === 0 && counts.pulledCount === 0 && counts.skippedCount === 0) {
      counts.skippedCount = 1;
    }
  }

  private async importInvoiceBatch(
    ctx: SyncContext,
    remoteInvoices: Awaited<ReturnType<XeroClient['listInvoicesPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteInvoices) {
      try {
        if (!remote.contactId) {
          counts.skippedCount += 1;
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
          const conflict = this.mappingConflictService?.detectInvoiceConflict(
            { invoiceNumber: existingMapping.xeroInvoiceNumber, amountCents },
            { invoiceNumber: remote.invoiceNumber, amountCents },
          );

          if (conflict) {
            await this.mappingConflictService?.recordConflict({
              companyId: ctx.companyId,
              entityType: 'invoice',
              entityId: existingMapping.invoiceId,
              conflict,
            });
            await this.upsertInvoiceMapping(
              ctx,
              existingMapping.invoiceId,
              remote.invoiceId,
              'out_of_sync',
              conflict.message,
              {
                xeroInvoiceNumber: invoiceNumber,
                conflictMetadata: conflict as unknown as Record<string, unknown>,
              },
            );
            counts.updatedCount += 1;
            counts.pulledCount += 1;
            continue;
          }

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
            null,
            { xeroInvoiceNumber: invoiceNumber },
          );
          counts.updatedCount += 1;
          counts.pulledCount += 1;

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

        await this.upsertInvoiceMapping(ctx, createdInvoice.id, remote.invoiceId, 'synced', null, {
          xeroInvoiceNumber: invoiceNumber,
        });
        counts.createdCount += 1;
        counts.pulledCount += 1;

        await this.writeLog(ctx, {
          entityType: 'invoice',
          entityId: createdInvoice.id,
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'success',
          message: `Imported invoice ${invoiceNumber} from Xero`,
        });
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'invoice',
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }
  }

  private async importPaymentBatch(
    ctx: SyncContext,
    remotePayments: Awaited<ReturnType<XeroClient['listPaymentsPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    const invoiceMappings = await this.loadSyncedInvoiceMappingsForPayments(ctx.companyId);
    const mappingByXeroInvoiceId = buildSyncedInvoiceMappingLookup(invoiceMappings);

    for (const remotePayment of remotePayments) {
      if (!remotePayment.invoiceId) {
        counts.skippedCount += 1;
        continue;
      }

      const invoiceMapping = mappingByXeroInvoiceId.get(remotePayment.invoiceId);

      if (!invoiceMapping?.invoice) {
        counts.skippedCount += 1;
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
          counts.updatedCount += 1;
          counts.pulledCount += 1;
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

        counts.createdCount += 1;
        counts.pulledCount += 1;

        await this.db.insert(xeroPaymentMappings).values({
          companyId: ctx.companyId,
          integrationConnectionId: ctx.connection.id,
          paymentId: createdPayment.id,
          xeroPaymentId: remotePayment.paymentId,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          lastSuccessfulSyncAt: new Date(),
        });

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
        counts.failedCount += 1;
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
  }

  private async importBankTransactionBatch(
    ctx: SyncContext,
    remoteRows: Awaited<ReturnType<XeroClient['listBankTransactionsPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteRows) {
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
          counts.updatedCount += 1;
          counts.pulledCount += 1;
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
        counts.createdCount += 1;
        counts.pulledCount += 1;
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'bank_transaction',
          xeroEntityId: remote.bankTransactionId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    if (remoteRows.length === 0 && counts.pulledCount === 0 && counts.skippedCount === 0) {
      counts.skippedCount = 1;
    }
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

  /** Stub import stages — activated after migration 0109 + post-import verify GO. */
  async importCreditNotesStub(_companyId: string): Promise<{ status: 'stub'; message: string }> {
    return {
      status: 'stub',
      message: 'Credit note import stage not active — see TITAN_XERO_TWO_WAY_SYNC.md',
    };
  }

  async importSupplierBillsStub(_companyId: string): Promise<{ status: 'stub'; message: string }> {
    return {
      status: 'stub',
      message: 'Supplier bill import stage not active — see TITAN_XERO_TWO_WAY_SYNC.md',
    };
  }

  private async assertEntityWriteApproved(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    operation: import('@titan/shared').XeroWriteOperation;
  }): Promise<void> {
    if (!this.writeApprovalGate) {
      throw new XeroSyncError(
        'WRITE_NOT_APPROVED',
        'Xero write approval gate is required for TITAN → Xero sync',
      );
    }

    await this.writeApprovalGate.assertWriteApproved({
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
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

  /** Explicit join + narrow select avoids lateral joins and staging schema drift. */
  private async loadSyncedInvoiceMappingsForPayments(
    companyId: string,
  ): Promise<SyncedInvoiceMappingForPayment[]> {
    const rows = await this.db
      .select({
        invoiceId: xeroInvoiceMappings.invoiceId,
        xeroInvoiceId: xeroInvoiceMappings.xeroInvoiceId,
        invoice: {
          id: invoices.id,
          currency: invoices.currency,
          amountPaidCents: invoices.amountPaidCents,
          amountCents: invoices.amountCents,
          status: invoices.status,
          invoiceNumber: invoices.invoiceNumber,
        },
      })
      .from(xeroInvoiceMappings)
      .innerJoin(invoices, eq(xeroInvoiceMappings.invoiceId, invoices.id))
      .where(
        and(
          eq(xeroInvoiceMappings.companyId, companyId),
          eq(xeroInvoiceMappings.syncStatus, 'synced'),
        ),
      );

    return rows;
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

export type SyncedInvoiceMappingForPayment = {
  invoiceId: string;
  xeroInvoiceId: string | null;
  invoice: {
    id: string;
    currency: string;
    amountPaidCents: number | null;
    amountCents: number | null;
    status: (typeof invoices.$inferSelect)['status'];
    invoiceNumber: string;
  };
};

export function buildSyncedInvoiceMappingLookup(
  rows: SyncedInvoiceMappingForPayment[],
): Map<string, SyncedInvoiceMappingForPayment> {
  return new Map(
    rows.filter((row) => row.xeroInvoiceId).map((row) => [row.xeroInvoiceId!, row]),
  );
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
