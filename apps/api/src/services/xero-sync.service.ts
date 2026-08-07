import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type {
  XeroAccountingAuraContext,
  XeroEntityCoverageRow,
  XeroEntitySyncResult,
  XeroEnqueueImportResult,
  XeroEvidenceCoverage,
  XeroFinancePipelineSummary,
  XeroHistoryCoverage,
  XeroImportEntityCounts,
  XeroImportJobProgress,
  XeroImportStage,
  XeroImportSyncResult,
  XeroSyncEntityType,
  XeroSyncLogSummary,
  XeroSyncScope,
  XeroSyncStatusResponse,
  IntegrationSyncTrigger,
} from '@titan/shared';
import {
  buildAuraEvidenceGuidance,
  extractXeroLineItemsFromRaw,
  mapXeroLineItemsToTitan,
  mapXeroQuoteStatus,
  normalizeContactEmail,
  normalizeContactPhone,
  pickCustomerMatchCandidate,
  resolveOfficialXeroInvoiceNumber,
  resolveStageCoverageState,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  integrationConnections,
  integrationSyncJobs,
  invoiceLineItems,
  invoices,
  jobs,
  payments,
  quoteLineItems,
  quotes,
  securityAuditLogs,
  xeroAccounts,
  xeroAttachments,
  xeroBankTransactions,
  xeroBillLineItems,
  xeroBills,
  xeroCreditNoteAllocations,
  xeroCreditNotes,
  xeroCustomerMappings,
  xeroEntityCoverage,
  xeroFinanceSyncRuns,
  xeroInvoiceMappings,
  xeroPaymentAllocations,
  xeroPaymentMappings,
  xeroQuoteMappings,
  xeroSyncLogs,
  xeroTrackingCategories,
  xeroTrackingOptions,
} from '@titan/db';
import { decryptXeroCredentials, isXeroOAuthCredentials } from '../lib/crypto.js';
import { amountToCents, mapXeroInvoiceStatus, XeroClient, XeroError, XERO_PAGE_SIZE, XERO_RATE_LIMIT_BASE_DELAY_MS } from '../lib/xero.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';
import type {
  XeroRateBudgetService,
  XeroRequestPriority,
} from './xero-rate-budget.service.js';
import {
  invalidateDashboardFinanceCaches,
  invalidateIntegrationReadCaches,
} from './api-read-cache.js';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  advanceToNextStage,
  XERO_IMPORT_STAGES,
  buildFullHistoryReportFromImportState,
  buildImportJobProgress,
  buildImportSyncResult,
  clearStaleStageFailuresOnResume,
  createInitialImportJobState,
  getStageCounts,
  importJobStateToSummary,
  isStageComplete,
  observeImportStageRecordDates,
  parseImportJobState,
  sumImportFailureCounts,
  XERO_IMPORT_BATCH_BUDGET_MS,
  XERO_IMPORT_MAX_PAGES_PER_BATCH,
  XERO_IMPORT_STALE_JOB_MS,
  XERO_IMPORT_STALL_THRESHOLD_MS,
  XERO_IMPORT_PENDING_STALE_MS,
  XERO_IMPORT_LEASE_MS,
} from './xero-import-job.processor.js';
import {
  buildXeroImportSyncMessage,
  requiresOwnerActionToRetry,
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

/** Parent records whose attachments are fetched per attachment batch tick. */
const XERO_ATTACHMENT_PARENT_BATCH = 25;

/** History older than this is reported as stale rather than presented as current. */
const XERO_HISTORY_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const processingImportJobs = new Set<string>();

function readRawString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRawNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * A stored `full_history_synced_at` is only believed when the row's own counts agree with it.
 * Rows written before stage completion was checked can carry the timestamp alongside failed
 * records; those are recomputed from the evidence rather than trusted.
 */
export function hasTrustworthyFullHistory(row: {
  fullHistorySyncedAt: Date | null;
  failedCount: number;
}): boolean {
  return row.fullHistorySyncedAt !== null && row.failedCount === 0;
}

export type XeroEntityCoverageWrite = {
  lastSyncedAt: Date;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  fullHistorySyncedAt?: Date | null;
  modifiedSinceWatermark?: Date | null;
  lastError: string | null;
};

/**
 * What a finished stage is allowed to claim about its own history.
 *
 * The stage must have finished with nothing failed before a complete-history timestamp is written,
 * so a stage that imported nothing while records failed can never be recorded as complete. A claim
 * left behind by an earlier run is cleared once the evidence contradicts it, and what it claimed is
 * carried into `lastError` so the correction is visible rather than silent. An incremental run
 * reports only its own delta, so it adds to the recorded holding rather than replacing it.
 */
export function resolveEntityCoverageWrite(input: {
  stage: XeroImportStage;
  counts: XeroImportEntityCounts;
  failedStage: XeroImportStage | null;
  stageError: string | null;
  /** True when this run applied no date floor, so it could see the whole history. */
  isFullHistoryRun: boolean;
  existing: { fullHistorySyncedAt: Date | null; importedCount: number; failedCount: number } | null;
  now: Date;
}): XeroEntityCoverageWrite {
  const { counts, existing, now, stage } = input;
  const runImportedCount =
    counts.createdCount + counts.updatedCount + (counts.unchangedCount ?? 0);
  // An incremental run only sees what changed since its floor, so its tally is not a measure of
  // what this entity holds. Letting it overwrite the count makes an entity Xero did not touch read
  // as holding nothing — "Xero returned no records, so there is nothing to answer from" over a
  // ledger that is sitting right there. An incremental can add to the holding through records it
  // created; it can never reduce it.
  const importedCount = input.isFullHistoryRun
    ? runImportedCount
    : (existing?.importedCount ?? 0) + counts.createdCount;
  const stageFinishedCleanly = counts.failedCount === 0 && input.failedStage !== stage;
  const canClaimFullHistory = input.isFullHistoryRun && stageFinishedCleanly;
  const staleFullHistoryClaim = Boolean(existing?.fullHistorySyncedAt) && !stageFinishedCleanly;
  const staleClaimNote =
    existing && staleFullHistoryClaim
      ? `Cleared a stale complete-history claim from ${existing.fullHistorySyncedAt?.toISOString()} (${existing.importedCount} imported / ${existing.failedCount} failed): this run finished ${stage} with ${runImportedCount} imported and ${counts.failedCount} failed.`
      : null;

  return {
    lastSyncedAt: now,
    importedCount,
    failedCount: counts.failedCount,
    skippedCount: counts.skippedCount,
    ...(canClaimFullHistory
      ? { fullHistorySyncedAt: now, modifiedSinceWatermark: now }
      : staleFullHistoryClaim
        ? { fullHistorySyncedAt: null, modifiedSinceWatermark: null }
        : {}),
    lastError: [staleClaimNote, input.stageError].filter(Boolean).join(' ') || null,
  };
}

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
  /**
   * Force a complete re-pull with no date floor, ignoring the incremental watermark.
   * Young Guns initial migration must use full history (no arbitrary recent-date cutoff).
   * When omitted, the run still pulls full history until every stage has a trustworthy
   * full-history claim, then switches to incremental watermarks.
   */
  fullHistory?: boolean;
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
  private rateBudget: XeroRateBudgetService | null = null;

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

  setRateBudget(rateBudget: XeroRateBudgetService | null): void {
    this.rateBudget = rateBudget;
  }

  async getSyncStatus(companyId: string): Promise<XeroSyncStatusResponse> {
    const connection = await this.getConnectedConnection(companyId);
    const currency = connection?.config.baseCurrency ?? 'USD';

    if (!connection || connection.status !== 'connected') {
      return emptySyncStatus(currency);
    }

    const [customersStats, quotesStats, invoicesStats, paymentsStats, bankStats, outstanding, financePipeline] =
      await Promise.all([
        this.getEntityStats(companyId, 'customer'),
        this.getEntityStats(companyId, 'quote'),
        this.getEntityStats(companyId, 'invoice'),
        this.getEntityStats(companyId, 'payment'),
        this.getBankTransactionStats(companyId),
        this.getOutstandingSummary(companyId),
        this.getFinancePipelineSummary(companyId, connection.id),
      ]);

    const importJob = await this.getImportJobProgress(companyId);

    return {
      connected: true,
      organisationName: connection.config.organisationName ?? null,
      baseCurrency: connection.config.baseCurrency ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError ?? null,
      customers: customersStats,
      quotes: quotesStats,
      invoices: invoicesStats,
      payments: paymentsStats,
      bankTransactions: bankStats,
      outstandingAmountCents: outstanding.outstandingAmountCents,
      unpaidInvoiceCount: outstanding.unpaidInvoiceCount,
      customersWithOutstandingCount: outstanding.customersWithOutstandingCount,
      currency,
      importJob,
      financePipeline,
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
      modifiedSince: await this.resolveModifiedSinceForRun(companyId, options),
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

    await this.db.insert(xeroFinanceSyncRuns).values({
      companyId,
      integrationConnectionId: ctx.connection.id,
      syncJobId,
      trigger: options?.trigger ?? 'manual',
      status: 'queued',
      details: { scheduledJobsReady: true },
    });

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

  /**
   * The date floor for a run, or null for a complete historical pull.
   *
   * Young Guns full-history policy: a modified-since floor is only ever applied once every
   * entity has already completed a trustworthy full historical import. If any entity is still
   * incomplete, the next run pulls everything again with no date floor so the gap is closed
   * rather than skipped — an incremental run must never be the reason history is missing.
   * There is no arbitrary recent-date cutoff on the initial migration.
   */
  private async resolveModifiedSinceForRun(
    companyId: string,
    options?: SyncFromXeroOptions,
  ): Promise<string | null> {
    if (options?.fullHistory) {
      return null;
    }

    const coverage = await this.db.query.xeroEntityCoverage.findMany({
      where: eq(xeroEntityCoverage.companyId, companyId),
    });

    const covered = new Map(coverage.map((row) => [row.entity, row]));
    const everyStageComplete = XERO_IMPORT_STAGES.every((stage) => {
      const row = covered.get(stage);
      return row ? hasTrustworthyFullHistory(row) : false;
    });

    if (!everyStageComplete) {
      return null;
    }

    // Take the oldest watermark across entities so a stage that fell behind still catches up.
    const watermarks = XERO_IMPORT_STAGES.map(
      (stage) => covered.get(stage)?.modifiedSinceWatermark,
    ).filter((value): value is Date => value instanceof Date);

    if (watermarks.length !== XERO_IMPORT_STAGES.length) {
      return null;
    }

    const oldest = watermarks.reduce((min, value) => (value < min ? value : min));
    return oldest.toISOString();
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

      if (this.rateBudget) {
        if (await this.rateBudget.isSyncPaused(job.companyId)) {
          continue;
        }
        if (!(await this.rateBudget.canStartWork(job.companyId, 'historical_import'))) {
          continue;
        }
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
      let continueDelayMs: number | null = null;

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
          const retryAt = state.nextRetryAt ? new Date(state.nextRetryAt).getTime() : Date.now();
          continueDelayMs = Math.max(0, Math.min(retryAt - Date.now(), 60_000));
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
          continueDelayMs = 0;
          break;
        }
      }

      if (state.failedStage || !allStagesComplete) {
        if (!state.failedStage) {
          // Continue multi-batch / rate-limited imports without relying solely on SCHEDULERS_ENABLED.
          const delayMs = continueDelayMs ?? 0;
          setTimeout(() => {
            void this.processImportJobBatch(syncJobId).catch((error: unknown) => {
              console.error('[xero-sync] Follow-up import batch failed', {
                companyId: job.companyId,
                syncJobId,
                error,
              });
            });
          }, delayMs);
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
      const state: XeroImportJobState = progress
        ? {
            ...createInitialImportJobState(options),
            checkpoint: progress.checkpoint,
            completedStages: progress.completedStages,
            accounts: progress.accounts,
            trackingCategories: progress.trackingCategories,
            contacts: progress.contacts,
            quotes: progress.quotes,
            invoices: progress.invoices,
            bills: progress.bills,
            creditNotes: progress.creditNotes,
            payments: progress.payments,
            bankTransactions: progress.bankTransactions,
            attachments: progress.attachments,
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
    resumeState.stageErrorCode = null;
    resumeState.nextRetryAt = null;
    resumeState.resumedFromAbandoned = true;
    resumeState.trigger = 'resume';
    clearStaleStageFailuresOnResume(resumeState);

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
    const totalFailed = sumImportFailureCounts(state);
    const success = markComplete && state.failedStage == null && totalFailed === 0;
    // lastSyncAt is the Owner-facing "this organisation is synced" claim. A run that resumed past
    // failed records did not cover them, so it must not refresh it.
    const coveredEverything = success && (state.carriedFailureCount ?? 0) === 0;
    const now = new Date();
    // Persist the Owner full-history migration report on the job summary before settle.
    state.fullHistoryReport = buildFullHistoryReportFromImportState(state);
    const result = buildImportSyncResult(
      state,
      syncJobId,
      coveredEverything ? now.toISOString() : null,
    );

    await this.db
      .update(integrationConnections)
      .set({
        ...(coveredEverything
          ? { lastSyncAt: now, lastError: null }
          : { lastError: result.message }),
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connectionId));

    await this.hubService?.completeSyncJob(syncJobId, {
      status: success ? 'completed' : 'failed',
      errorMessage: success ? null : result.message,
      resultSummary: importJobStateToSummary(state),
    });

    await this.recordFinanceSyncRun(companyId, connectionId, syncJobId, state, success, result.message);

    await this.importJobSettledHandler?.({
      companyId,
      syncJobId,
      trigger: state.trigger,
      result,
    });

    invalidateIntegrationReadCaches(companyId);
    invalidateDashboardFinanceCaches(companyId);
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

    // Null modifiedSince means a complete historical pull — no date floor is ever applied
    // implicitly. It is only set for an explicit incremental run after full history is clean.
    const listOptions = { modifiedSince: state.checkpoint.modifiedSince };

    try {
      while (pagesProcessed < XERO_IMPORT_MAX_PAGES_PER_BATCH && Date.now() < deadlineAt) {
        if (stage === 'accounts') {
          const batch = await ctx.client.listAccounts();
          lastBatchSize = batch.length;
          await this.importAccountBatch(ctx, batch, state.accounts);
        } else if (stage === 'tracking_categories') {
          const batch = await ctx.client.listTrackingCategories();
          lastBatchSize = batch.length;
          await this.importTrackingCategoryBatch(ctx, batch, state.trackingCategories);
        } else if (stage === 'contacts') {
          const batch = await ctx.client.listContactsPage(
            state.checkpoint.contactsPage,
            listOptions,
          );
          lastBatchSize = batch.length;
          await this.importContactBatch(ctx, batch, state.contacts);
          state.checkpoint.contactsPage += 1;
        } else if (stage === 'quotes') {
          const batch = await ctx.client.listQuotesPage(state.checkpoint.quotesPage, listOptions);
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'quotes',
            batch.map((row) => row.issueDate),
          );
          await this.importQuoteBatch(ctx, batch, state.quotes);
          state.checkpoint.quotesPage += 1;
        } else if (stage === 'invoices') {
          const batch = await ctx.client.listInvoicesPage(
            state.checkpoint.invoicesPage,
            listOptions,
          );
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'invoices',
            batch.map((row) => row.issueDate),
          );
          await this.importInvoiceBatch(ctx, batch, state.invoices);
          state.checkpoint.invoicesPage += 1;
        } else if (stage === 'bills') {
          const batch = await ctx.client.listBillsPage(state.checkpoint.billsPage, listOptions);
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'bills',
            batch.map((row) => row.issueDate),
          );
          await this.importBillBatch(ctx, batch, state.bills);
          state.checkpoint.billsPage += 1;
        } else if (stage === 'credit_notes') {
          const batch = await ctx.client.listCreditNotesPage(
            state.checkpoint.creditNotesPage,
            listOptions,
          );
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'credit_notes',
            batch.map((row) => row.date),
          );
          await this.importCreditNoteBatch(ctx, batch, state.creditNotes);
          state.checkpoint.creditNotesPage += 1;
        } else if (stage === 'payments') {
          const batch = await ctx.client.listPaymentsPage(
            state.checkpoint.paymentsPage,
            listOptions,
          );
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'payments',
            batch.map((row) => row.date),
          );
          await this.importPaymentBatch(ctx, batch, state.payments);
          state.checkpoint.paymentsPage += 1;
        } else if (stage === 'bank_transactions') {
          const batch = await ctx.client.listBankTransactionsPage(
            state.checkpoint.bankTransactionsPage,
            listOptions,
          );
          lastBatchSize = batch.length;
          observeImportStageRecordDates(
            state,
            'bank_transactions',
            batch.map((row) => row.date),
          );
          await this.importBankTransactionBatch(ctx, batch, state.bankTransactions);
          state.checkpoint.bankTransactionsPage += 1;
        } else {
          const progressed = await this.importAttachmentBatch(ctx, state);
          lastBatchSize = progressed.processed;

          if (progressed.done) {
            await this.recordEntityCoverage(ctx, state, stage);
            return { stageComplete: true, budgetExhausted: false };
          }
        }

        pagesProcessed += 1;

        if (isStageComplete(stage, state.checkpoint, lastBatchSize)) {
          await this.recordEntityCoverage(ctx, state, stage);
          return { stageComplete: true, budgetExhausted: false };
        }

        if (Date.now() >= deadlineAt) {
          budgetExhausted = true;
          break;
        }
      }

      // The batch budget can run out before this stage fetches a single page. `lastBatchSize` of 0
      // then means "nothing was fetched", not "the last page was short", so the stage stays open
      // for the next batch instead of being recorded as finished history.
      if (pagesProcessed === 0) {
        return { stageComplete: false, budgetExhausted: true };
      }

      if (pagesProcessed >= XERO_IMPORT_MAX_PAGES_PER_BATCH && !isStageComplete(stage, state.checkpoint, lastBatchSize)) {
        budgetExhausted = true;
      }

      const stageComplete = isStageComplete(stage, state.checkpoint, lastBatchSize);

      if (stageComplete) {
        await this.recordEntityCoverage(ctx, state, stage);
      }

      return { stageComplete, budgetExhausted };
    } catch (error) {
      if (error instanceof XeroError && error.code === 'RATE_LIMIT') {
        // Honour the delay Xero asked for. Throttling slows a run; it must never truncate one.
        state.nextRetryAt = new Date(
          Date.now() + (error.retryAfterMs ?? XERO_RATE_LIMIT_BASE_DELAY_MS * 2),
        ).toISOString();
        state.activity = 'rate_limited';
        state.stageError = error.message;
        return { stageComplete: false, budgetExhausted: true, rateLimited: true };
      }

      state.failedStage = stage;
      state.stageError =
        error instanceof XeroError && error.code === 'TIMEOUT'
          ? `Xero API timed out during ${stage}: ${error.message}`
          : mapError(error);
      state.stageErrorCode = error instanceof XeroError ? error.code : null;
      return { stageComplete: false, budgetExhausted: false };
    }
  }

  /**
   * Honest, evidence-backed coverage of the imported Xero history. Every "complete / partial /
   * unavailable" claim shown on Finance, Customer 360 or in an AURA answer resolves from here —
   * a rendered page is never treated as proof that a sync worked.
   */
  async getHistoryCoverage(companyId: string): Promise<XeroHistoryCoverage> {
    const connection = await this.getConnectedConnection(companyId);

    if (!connection || connection.status !== 'connected') {
      return {
        connected: false,
        fullHistorySyncedAt: null,
        noDateFloorApplied: false,
        lastIncrementalSyncAt: null,
        stale: true,
        staleRationale: 'Xero is not connected, so no financial history has been imported.',
        entities: [],
        overallCoverage: 'unavailable',
        overallRationale:
          'Xero is not connected. Connect Xero and run a full historical import before relying on financial answers.',
      };
    }

    const rows = await this.db.query.xeroEntityCoverage.findMany({
      where: eq(xeroEntityCoverage.companyId, companyId),
    });
    const byEntity = new Map(rows.map((row) => [row.entity, row]));

    const entities: XeroEntityCoverageRow[] = XERO_IMPORT_STAGES.map((stage) => {
      const row = byEntity.get(stage);

      if (!row) {
        return {
          entity: stage,
          importedCount: 0,
          lastSyncedAt: null,
          failedCount: 0,
          skippedCount: 0,
          coverageState: 'not_started' as const,
          coverage: 'unavailable' as const,
          coverageRationale: `No import has ever run for ${stage}.`,
        };
      }

      const { state: coverageState, coverage, rationale } = resolveStageCoverageState({
        importedCount: row.importedCount,
        failedCount: row.failedCount,
        skippedCount: row.skippedCount,
        fullHistorySynced: hasTrustworthyFullHistory(row),
        everSynced:
          row.lastSyncedAt !== null ||
          row.importedCount > 0 ||
          row.failedCount > 0 ||
          row.skippedCount > 0,
        // A stage that recorded evidence, left an error behind and never proved a clean full pull
        // stopped part way through — it is not merely "partial by policy".
        interrupted: row.fullHistorySyncedAt === null && Boolean(row.lastError),
      });

      return {
        entity: stage,
        importedCount: row.importedCount,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        failedCount: row.failedCount,
        skippedCount: row.skippedCount,
        coverageState,
        coverage,
        coverageRationale: rationale,
      };
    });

    const fullHistoryDates = XERO_IMPORT_STAGES.map((stage) => {
      const row = byEntity.get(stage);
      return row && hasTrustworthyFullHistory(row) ? row.fullHistorySyncedAt : null;
    });
    const everyStageFullySynced = fullHistoryDates.every((value) => value instanceof Date);
    const fullHistorySyncedAt = everyStageFullySynced
      ? (fullHistoryDates as Date[]).reduce((min, value) => (value < min ? value : min)).toISOString()
      : null;

    const lastSyncedAt = rows
      .map((row) => row.lastSyncedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const staleAfterMs = XERO_HISTORY_STALE_AFTER_MS;
    const stale = !lastSyncedAt || Date.now() - lastSyncedAt.getTime() > staleAfterMs;

    const incomplete = entities.filter((entity) => entity.coverage !== 'complete');
    const overallCoverage: XeroEvidenceCoverage =
      incomplete.length === 0
        ? 'complete'
        : incomplete.length === entities.length
          ? 'unavailable'
          : 'partial';

    return {
      connected: true,
      fullHistorySyncedAt,
      noDateFloorApplied: everyStageFullySynced,
      lastIncrementalSyncAt: lastSyncedAt?.toISOString() ?? null,
      stale,
      staleRationale: stale
        ? lastSyncedAt
          ? `Last Xero sync was ${lastSyncedAt.toISOString()}, older than the ${Math.round(staleAfterMs / 3_600_000)}h freshness window.`
          : 'No Xero sync has completed yet.'
        : null,
      entities,
      overallCoverage,
      overallRationale:
        incomplete.length === 0
          ? 'Full Xero history imported for every entity with no failed or skipped records.'
          : `Incomplete for: ${incomplete.map((entity) => entity.entity).join(', ')}. Answers must be scoped to what is actually covered.`,
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

      // Xero rejecting the grant is not something another tick can fix. Auto-resuming it just
      // reruns the same rejection every tick, which both hides the real cause behind a job that
      // looks busy and never lets the tenant reach a quiet state. The job stays failed with its
      // reason until the Owner reconnects Xero and retries.
      if (requiresOwnerActionToRetry(state.stageErrorCode)) {
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
      state.stageErrorCode = null;
      state.nextRetryAt = null;
      state.abandoned = false;
      state.resumedFromAbandoned = true;
      state.trigger = 'resume';
      clearStaleStageFailuresOnResume(state);

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
    const [customerRows, quoteRows, invoiceRows, paymentRows, bankRows] = await Promise.all([
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
        .from(xeroQuoteMappings)
        .where(
          and(
            eq(xeroQuoteMappings.companyId, companyId),
            eq(xeroQuoteMappings.syncStatus, 'synced'),
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
        .from(xeroBankTransactions)
        .where(eq(xeroBankTransactions.companyId, companyId)),
    ]);

    const customerCount = customerRows[0]?.count ?? 0;
    const quoteCount = quoteRows[0]?.count ?? 0;
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
      quotes: {
        ...partialState.quotes,
        pulledCount: Math.max(partialState.quotes.pulledCount, quoteCount),
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
      if (
        quoteCount > 0 ||
        invoiceCount > 0 ||
        paymentCount > 0 ||
        bankCount > 0 ||
        customerCount >= XERO_PAGE_SIZE
      ) {
        completed.add('contacts');
      }
    }

    if (quoteCount > 0) {
      state.checkpoint.quotesPage = Math.max(1, Math.ceil(quoteCount / XERO_PAGE_SIZE));
      if (invoiceCount > 0 || paymentCount > 0 || bankCount > 0) {
        completed.add('quotes');
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
    } else if (!completed.has('quotes')) {
      state.checkpoint.stage = 'quotes';
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
          const approval = await this.assertEntityWriteApproved({
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
            let jobNumber: string | null = null;
            if (invoice.jobId) {
              const job = await this.db.query.jobs.findFirst({
                where: and(eq(jobs.companyId, companyId), eq(jobs.id, invoice.jobId)),
              });
              jobNumber = job?.jobNumber ?? null;
            }
            remote = await ctx.client.createInvoice({
              contactId: customerMapping.xeroContactId,
              title: invoice.title,
              amountCents: invoice.amountCents,
              currency: invoice.currency,
              dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
              issueDate: invoice.issuedAt?.toISOString().slice(0, 10) ?? null,
              reference: jobNumber,
              status: 'DRAFT',
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

          const officialNumber = resolveOfficialXeroInvoiceNumber({
            xeroAssignedNumber: remote.invoiceNumber,
            xeroInvoiceId,
          });

          await this.db
            .update(invoices)
            .set({
              status: nextStatus,
              amountPaidCents: amountToCents(remote.amountPaid),
              ...(officialNumber
                ? { xeroInvoiceNumber: officialNumber, numberAuthority: 'xero' }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoice.id));

          updatedCount += existingMapping?.xeroInvoiceId ? 1 : 0;
          await this.upsertInvoiceMapping(ctx, invoice.id, xeroInvoiceId, 'synced', null, {
            xeroInvoiceNumber: officialNumber,
          });

          if (approval.approvalId !== 'mock-approval' && this.writeApprovalGate) {
            await this.writeApprovalGate.markExecuted(companyId, approval.approvalId);
          }

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

          // Recompute the paid total from the imported Xero payments for this invoice rather
          // than adding to whatever is stored. Adding would double-count against the AmountPaid
          // the invoice import already took from Xero, and drift from the ledger.
          const paymentCents = amountToCents(remotePayment.amount);
          const [paidRow] = await this.db
            .select({ paidCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
            .from(payments)
            .where(
              and(eq(payments.companyId, companyId), eq(payments.invoiceId, invoiceMapping.invoiceId)),
            );
          const nextPaidCents = Math.max(paidRow?.paidCents ?? paymentCents, 0);
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

    const historyCoverage = await this.getHistoryCoverage(companyId);

    return {
      connected: true,
      organisationName: status.organisationName,
      baseCurrency: status.baseCurrency,
      lastSyncAt: status.lastSyncAt,
      lastError: status.lastError,
      importStatus: status.importJob?.status ?? null,
      // Coverage travels with the context so AURA can scope an answer to what is actually
      // imported, and refuse where it is not, instead of answering confidently over a partial
      // history.
      historyCoverage,
      evidenceGuidance: buildAuraEvidenceGuidance(historyCoverage),
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

  private async upsertPaymentMapping(
    ctx: SyncContext,
    paymentId: string,
    xeroPaymentId: string | null,
    syncStatus: 'synced' | 'failed' | 'pending' | 'out_of_sync',
    lastError?: string | null,
  ) {
    const now = new Date();
    const existing = await this.db.query.xeroPaymentMappings.findFirst({
      where: and(
        eq(xeroPaymentMappings.companyId, ctx.companyId),
        eq(xeroPaymentMappings.paymentId, paymentId),
      ),
    });

    if (existing) {
      await this.db
        .update(xeroPaymentMappings)
        .set({
          xeroPaymentId: xeroPaymentId ?? existing.xeroPaymentId,
          syncStatus,
          lastSyncedAt: now,
          lastSuccessfulSyncAt: syncStatus === 'synced' ? now : existing.lastSuccessfulSyncAt,
          lastError: lastError ?? null,
          updatedAt: now,
        })
        .where(eq(xeroPaymentMappings.id, existing.id));
      return;
    }

    await this.db.insert(xeroPaymentMappings).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      paymentId,
      xeroPaymentId,
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
              phone: contact.phone ?? undefined,
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
            phone: contact.phone,
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

  private async importQuoteBatch(
    ctx: SyncContext,
    remoteQuotes: Awaited<ReturnType<XeroClient['listQuotesPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    const syncedAt = new Date();

    for (const remote of remoteQuotes) {
      try {
        if (!remote.contactId) {
          counts.skippedCount += 1;
          await this.writeLog(ctx, {
            entityType: 'quote',
            xeroEntityId: remote.quoteId,
            action: 'pull',
            status: 'failed',
            message: 'Skipped: Xero quote has no contact, so it cannot be linked to a customer',
          });
          continue;
        }

        const customerId = await this.resolveCustomerForXeroContact(ctx, {
          xeroContactId: remote.contactId,
          name: remote.contactName ?? 'Xero contact',
        });

        const existingMapping = await this.db.query.xeroQuoteMappings.findFirst({
          where: and(
            eq(xeroQuoteMappings.companyId, ctx.companyId),
            eq(xeroQuoteMappings.xeroQuoteId, remote.quoteId),
          ),
        });

        const quoteNumber =
          remote.quoteNumber?.trim() || `XERO-Q-${remote.quoteId.slice(0, 8).toUpperCase()}`;
        const status = mapXeroQuoteStatus(remote.status);
        const totalCents = amountToCents(remote.total);
        const subtotalCents = amountToCents(remote.subtotal);
        const vatCents = amountToCents(remote.totalTax);
        const resolvedTotal =
          totalCents > 0 ? totalCents : subtotalCents + vatCents > 0 ? subtotalCents + vatCents : 0;
        const currency = remote.currencyCode ?? ctx.connection.config.baseCurrency ?? 'USD';
        const title = remote.title?.trim() || quoteNumber;
        const provenance = {
          sourceProvider: 'xero' as const,
          sourceExternalId: remote.quoteId,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
          xeroQuoteId: remote.quoteId,
          xeroQuoteNumber: quoteNumber,
        };
        const financials = {
          status,
          amountCents: resolvedTotal,
          subtotalCents: resolveImportedSubtotalCents({
            subtotalCents,
            vatCents,
            resolvedTotalCents: resolvedTotal,
          }),
          vatCents,
          totalCents: resolvedTotal,
          currency,
          title,
          validUntil: remote.expiryDate ? new Date(remote.expiryDate) : null,
          issuedAt: remote.issueDate ? new Date(remote.issueDate) : undefined,
          acceptedAt: status === 'accepted' ? syncedAt : null,
          declinedAt: status === 'declined' ? syncedAt : null,
          notes: 'Imported from Xero',
          ...provenance,
        };

        let quoteId: string;
        if (existingMapping) {
          await this.db
            .update(quotes)
            .set({
              ...financials,
              updatedAt: syncedAt,
            })
            .where(and(eq(quotes.id, existingMapping.quoteId), eq(quotes.companyId, ctx.companyId)));
          quoteId = existingMapping.quoteId;
          counts.updatedCount += 1;
        } else {
          const [created] = await this.db
            .insert(quotes)
            .values({
              companyId: ctx.companyId,
              customerId,
              quoteNumber,
              ...financials,
            })
            .returning();
          if (!created) {
            throw new XeroSyncError('CREATE_FAILED', 'Unable to create quote from Xero');
          }
          quoteId = created.id;
          counts.createdCount += 1;
        }

        await this.upsertQuoteMapping(ctx, quoteId, remote.quoteId, 'synced');
        await this.replaceQuoteLineItems(ctx, quoteId, remote.raw);
        counts.pulledCount += 1;

        await this.writeLog(ctx, {
          entityType: 'quote',
          entityId: quoteId,
          xeroEntityId: remote.quoteId,
          action: 'pull',
          status: 'success',
          message: `Imported quote ${quoteNumber} from Xero`,
        });
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'quote',
          xeroEntityId: remote.quoteId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }

    if (remoteQuotes.length === 0 && counts.pulledCount === 0 && counts.skippedCount === 0) {
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
          await this.writeLog(ctx, {
            entityType: 'invoice',
            xeroEntityId: remote.invoiceId,
            action: 'pull',
            status: 'failed',
            message: 'Skipped: Xero invoice has no contact, so it cannot be linked to a customer',
          });
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

        // A run whose mapping write did not land leaves the invoice row behind carrying this same
        // Xero id. Without looking for it the next run reads "not imported yet", tries to insert a
        // second row under the same invoice number and fails on it — every run, forever. Adopt the
        // row that is already there instead, and rebuild the mapping it is missing.
        const orphanedInvoice = existingMapping
          ? null
          : await this.db.query.invoices.findFirst({
              where: and(
                eq(invoices.companyId, ctx.companyId),
                eq(invoices.sourceProvider, 'xero'),
                eq(invoices.sourceExternalId, remote.invoiceId),
              ),
            });
        const existingInvoiceId = existingMapping?.invoiceId ?? orphanedInvoice?.id ?? null;
        const knownInvoiceNumber =
          existingMapping?.xeroInvoiceNumber ?? orphanedInvoice?.xeroInvoiceNumber ?? null;

        const nextStatus = mapXeroInvoiceStatus({
          xeroStatus: remote.status,
          amountDue: remote.amountDue,
          amountPaid: remote.amountPaid,
          total: remote.total,
        });
        const financials = buildImportedInvoiceFinancialFields(remote);
        const invoiceNumber = resolveImportedInvoiceNumber(remote.invoiceNumber, remote.invoiceId);
        const currency = remote.currencyCode ?? ctx.connection.config.baseCurrency ?? 'USD';
        const syncedAt = new Date();
        const importedIdentity = {
          xeroInvoiceNumber: invoiceNumber,
          xeroReference: remote.reference,
          numberAuthority: 'xero' as const,
          sourceProvider: 'xero' as const,
          sourceExternalId: remote.invoiceId,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
        };

        if (existingInvoiceId) {
          const conflict = this.mappingConflictService?.detectInvoiceConflict(
            { invoiceNumber: knownInvoiceNumber, amountCents: financials.amountCents },
            { invoiceNumber: remote.invoiceNumber, amountCents: financials.amountCents },
          );

          if (conflict) {
            await this.mappingConflictService?.recordConflict({
              companyId: ctx.companyId,
              entityType: 'invoice',
              entityId: existingInvoiceId,
              conflict,
            });
            await this.upsertInvoiceMapping(
              ctx,
              existingInvoiceId,
              remote.invoiceId,
              'out_of_sync',
              conflict.message,
              {
                xeroInvoiceNumber: invoiceNumber,
                xeroReference: remote.reference,
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
              ...financials,
              currency,
              ...importedIdentity,
              dueDate: remote.dueDate ? new Date(remote.dueDate) : null,
              issuedAt: remote.issueDate ? new Date(remote.issueDate) : undefined,
              updatedAt: syncedAt,
            })
            .where(and(eq(invoices.id, existingInvoiceId), eq(invoices.companyId, ctx.companyId)));

          await this.replaceInvoiceLineItems(ctx, existingInvoiceId, remote.raw);
          await this.upsertInvoiceMapping(ctx, existingInvoiceId, remote.invoiceId, 'synced', null, {
            xeroInvoiceNumber: invoiceNumber,
            xeroReference: remote.reference,
          });
          counts.updatedCount += 1;
          counts.pulledCount += 1;

          await this.writeLog(ctx, {
            entityType: 'invoice',
            entityId: existingInvoiceId,
            xeroEntityId: remote.invoiceId,
            action: 'pull',
            status: 'success',
            message: orphanedInvoice
              ? `Updated invoice ${invoiceNumber} from Xero and restored its missing Xero mapping`
              : `Updated invoice ${invoiceNumber} from Xero`,
          });
          continue;
        }

        const [createdInvoice] = await this.db
          .insert(invoices)
          .values({
            companyId: ctx.companyId,
            customerId,
            invoiceNumber,
            ...importedIdentity,
            title: remote.invoiceNumber ?? `Invoice ${invoiceNumber}`,
            status: nextStatus,
            ...financials,
            currency,
            dueDate: remote.dueDate ? new Date(remote.dueDate) : null,
            issuedAt: remote.issueDate ? new Date(remote.issueDate) : syncedAt,
            notes: 'Imported from Xero',
          })
          .returning();

        if (!createdInvoice) {
          throw new XeroSyncError('CREATE_FAILED', 'Unable to create invoice from Xero');
        }

        await this.replaceInvoiceLineItems(ctx, createdInvoice.id, remote.raw);
        await this.upsertInvoiceMapping(ctx, createdInvoice.id, remote.invoiceId, 'synced', null, {
          xeroInvoiceNumber: invoiceNumber,
          xeroReference: remote.reference,
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
      // Every payment is recorded as an allocation row first, so a payment that cannot be tied to
      // an imported parent is still visible history rather than a silent disappearance.
      const invoiceMapping = remotePayment.invoiceId
        ? mappingByXeroInvoiceId.get(remotePayment.invoiceId)
        : undefined;

      const unresolvedReason = !remotePayment.invoiceId
        ? 'Xero payment has no invoice allocation (overpayment, prepayment or unallocated)'
        : !invoiceMapping?.invoice
          ? `Xero payment allocates to invoice ${remotePayment.invoiceId}, which is not present in TITAN (it may be a bill or a record outside the imported scope)`
          : null;

      await this.recordPaymentAllocation(ctx, remotePayment, unresolvedReason);

      if (unresolvedReason) {
        counts.skippedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'payment',
          xeroEntityId: remotePayment.paymentId,
          action: 'pull',
          status: 'failed',
          message: `Skipped: ${unresolvedReason}. Allocation retained in xero_payment_allocations.`,
        });
        continue;
      }

      if (!invoiceMapping?.invoice) {
        continue;
      }

      try {
        const existingPaymentMapping = await this.db.query.xeroPaymentMappings.findFirst({
          where: and(
            eq(xeroPaymentMappings.companyId, ctx.companyId),
            eq(xeroPaymentMappings.xeroPaymentId, remotePayment.paymentId),
          ),
        });

        const syncedAt = new Date();
        const paymentReference = remotePayment.reference?.trim() || remotePayment.paymentId;
        const paymentProvenance = {
          xeroPaymentId: remotePayment.paymentId,
          xeroPaymentStatus: remotePayment.status,
          sourceProvider: 'xero' as const,
          sourceExternalId: remotePayment.paymentId,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
        };

        if (existingPaymentMapping) {
          await this.db
            .update(payments)
            .set({
              reference: paymentReference,
              ...paymentProvenance,
            })
            .where(
              and(
                eq(payments.id, existingPaymentMapping.paymentId),
                eq(payments.companyId, ctx.companyId),
              ),
            );
          await this.db
            .update(xeroPaymentMappings)
            .set({
              syncStatus: 'synced',
              lastSyncedAt: syncedAt,
              lastSuccessfulSyncAt: syncedAt,
              lastError: null,
              updatedAt: syncedAt,
            })
            .where(eq(xeroPaymentMappings.id, existingPaymentMapping.id));
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
            reference: paymentReference,
            paidAt: remotePayment.date ? new Date(remotePayment.date) : syncedAt,
            notes: 'Imported from Xero',
            ...paymentProvenance,
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
          lastSyncedAt: syncedAt,
          lastSuccessfulSyncAt: syncedAt,
        });

        // The invoice stage already wrote Xero's own AmountPaid, which includes this payment.
        // Adding it again here would inflate the paid amount and drift from the Xero ledger, so
        // the paid total is left as Xero reported it.
        void paymentCents;

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

  /** Xero's payment→invoice allocation, stored verbatim including unresolved allocations. */
  private async recordPaymentAllocation(
    ctx: SyncContext,
    remotePayment: Awaited<ReturnType<XeroClient['listPaymentsPage']>>[number],
    unresolvedReason: string | null,
  ): Promise<void> {
    const syncedAt = new Date();
    const values = {
      xeroInvoiceId: remotePayment.invoiceId,
      targetType: remotePayment.invoiceId ? 'invoice' : 'unallocated',
      amountCents: amountToCents(remotePayment.amount),
      currency: remotePayment.currencyCode,
      paidOn: remotePayment.date ? remotePayment.date.slice(0, 10) : null,
      reference: remotePayment.reference,
      status: remotePayment.status,
      unresolved: unresolvedReason !== null,
      unresolvedReason,
      sourceSyncedAt: syncedAt,
      sourceImportJobId: ctx.syncJobId ?? null,
      updatedAt: syncedAt,
    };

    const existing = await this.db.query.xeroPaymentAllocations.findFirst({
      where: and(
        eq(xeroPaymentAllocations.companyId, ctx.companyId),
        eq(xeroPaymentAllocations.xeroPaymentId, remotePayment.paymentId),
      ),
    });

    if (existing) {
      await this.db
        .update(xeroPaymentAllocations)
        .set(values)
        .where(eq(xeroPaymentAllocations.id, existing.id));
      return;
    }

    await this.db.insert(xeroPaymentAllocations).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      xeroPaymentId: remotePayment.paymentId,
      ...values,
    });
  }

  private async importBankTransactionBatch(
    ctx: SyncContext,
    remoteRows: Awaited<ReturnType<XeroClient['listBankTransactionsPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteRows) {
      try {
        const syncedAt = new Date();
        const amountCents = amountToCents(remote.amount);
        const currency = remote.currencyCode ?? ctx.connection.config.baseCurrency ?? 'USD';
        const category =
          remote.type && remote.status ? `${remote.type}/${remote.status}` : remote.type;
        const existing = await this.db.query.xeroBankTransactions.findFirst({
          where: and(
            eq(xeroBankTransactions.companyId, ctx.companyId),
            eq(xeroBankTransactions.xeroBankTransactionId, remote.bankTransactionId),
          ),
        });

        const row = {
          transactionDate: remote.date ? remote.date.slice(0, 10) : null,
          amountCents,
          currency,
          reference: remote.reference,
          description: remote.description,
          category,
          bankAccountCode: remote.bankAccountCode,
          contactName: remote.contactName,
          xeroContactId: remote.contactId,
          status: remote.status,
          type: remote.type,
          isReconciled: remote.isReconciled,
          sourceProvider: 'xero' as const,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
          rawSummary: {
            reference: remote.reference,
            description: remote.description,
            type: remote.type,
            status: remote.status,
          },
          updatedAt: syncedAt,
        };

        if (existing) {
          await this.db
            .update(xeroBankTransactions)
            .set(row)
            .where(eq(xeroBankTransactions.id, existing.id));
          counts.updatedCount += 1;
        } else {
          await this.db.insert(xeroBankTransactions).values({
            companyId: ctx.companyId,
            integrationConnectionId: ctx.connection.id,
            xeroBankTransactionId: remote.bankTransactionId,
            ...row,
          });
          counts.createdCount += 1;
        }

        counts.pulledCount += 1;
        await this.writeLog(ctx, {
          entityType: 'bank_transaction',
          xeroEntityId: remote.bankTransactionId,
          action: 'pull',
          status: 'success',
          message: remote.description ?? remote.reference ?? 'Imported bank transaction from Xero',
        });
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

  /** Chart of accounts — imported so line items resolve to real account meaning. */
  private async importAccountBatch(
    ctx: SyncContext,
    remoteAccounts: Awaited<ReturnType<XeroClient['listAccounts']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteAccounts) {
      try {
        const syncedAt = new Date();
        const row = {
          code: remote.code,
          name: remote.name,
          type: remote.type,
          taxType: remote.taxType,
          accountClass: remote.accountClass,
          status: remote.status,
          description: remote.description,
          reportingCode: remote.reportingCode,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
          updatedAt: syncedAt,
        };

        const existing = await this.db.query.xeroAccounts.findFirst({
          where: and(
            eq(xeroAccounts.companyId, ctx.companyId),
            eq(xeroAccounts.xeroAccountId, remote.accountId),
          ),
        });

        if (existing) {
          await this.db.update(xeroAccounts).set(row).where(eq(xeroAccounts.id, existing.id));
          counts.updatedCount += 1;
        } else {
          await this.db.insert(xeroAccounts).values({
            companyId: ctx.companyId,
            integrationConnectionId: ctx.connection.id,
            xeroAccountId: remote.accountId,
            ...row,
          });
          counts.createdCount += 1;
        }

        counts.pulledCount += 1;
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'account',
          xeroEntityId: remote.accountId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }
  }

  private async importTrackingCategoryBatch(
    ctx: SyncContext,
    remoteCategories: Awaited<ReturnType<XeroClient['listTrackingCategories']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteCategories) {
      try {
        const syncedAt = new Date();
        const existing = await this.db.query.xeroTrackingCategories.findFirst({
          where: and(
            eq(xeroTrackingCategories.companyId, ctx.companyId),
            eq(xeroTrackingCategories.xeroTrackingCategoryId, remote.trackingCategoryId),
          ),
        });

        let categoryId: string;

        if (existing) {
          await this.db
            .update(xeroTrackingCategories)
            .set({ name: remote.name, status: remote.status, sourceSyncedAt: syncedAt, updatedAt: syncedAt })
            .where(eq(xeroTrackingCategories.id, existing.id));
          categoryId = existing.id;
          counts.updatedCount += 1;
        } else {
          const [created] = await this.db
            .insert(xeroTrackingCategories)
            .values({
              companyId: ctx.companyId,
              integrationConnectionId: ctx.connection.id,
              xeroTrackingCategoryId: remote.trackingCategoryId,
              name: remote.name,
              status: remote.status,
              sourceSyncedAt: syncedAt,
              sourceImportJobId: ctx.syncJobId ?? null,
            })
            .returning();

          if (!created) {
            throw new XeroSyncError('CREATE_FAILED', 'Unable to store Xero tracking category');
          }

          categoryId = created.id;
          counts.createdCount += 1;
        }

        for (const option of remote.options) {
          const existingOption = await this.db.query.xeroTrackingOptions.findFirst({
            where: and(
              eq(xeroTrackingOptions.companyId, ctx.companyId),
              eq(xeroTrackingOptions.xeroTrackingOptionId, option.trackingOptionId),
            ),
          });

          if (existingOption) {
            await this.db
              .update(xeroTrackingOptions)
              .set({ name: option.name, status: option.status, sourceSyncedAt: syncedAt, updatedAt: syncedAt })
              .where(eq(xeroTrackingOptions.id, existingOption.id));
            continue;
          }

          await this.db.insert(xeroTrackingOptions).values({
            companyId: ctx.companyId,
            trackingCategoryId: categoryId,
            xeroTrackingOptionId: option.trackingOptionId,
            name: option.name,
            status: option.status,
            sourceSyncedAt: syncedAt,
          });
        }

        counts.pulledCount += 1;
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'tracking_category',
          xeroEntityId: remote.trackingCategoryId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }
  }

  /**
   * Supplier bills (ACCPAY) with line items and account codes — the expense side that makes real
   * expense intelligence possible. Xero's list pages omit line items, so each bill is fetched.
   */
  private async importBillBatch(
    ctx: SyncContext,
    remoteBills: Awaited<ReturnType<XeroClient['listBillsPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteBills) {
      try {
        const syncedAt = new Date();
        const detail = (await ctx.client.fetchInvoiceDetail(remote.invoiceId)) ?? remote;
        const row = {
          xeroContactId: remote.contactId,
          supplierName: remote.contactName,
          billNumber: remote.invoiceNumber,
          reference: remote.reference,
          // Xero status verbatim: VOIDED and DELETED are recorded, not dropped.
          status: remote.status,
          subtotalCents: amountToCents(remote.subtotal),
          taxCents: amountToCents(remote.totalTax),
          totalCents: amountToCents(remote.total),
          amountDueCents: amountToCents(remote.amountDue),
          amountPaidCents: amountToCents(remote.amountPaid),
          currency: remote.currencyCode ?? ctx.connection.config.baseCurrency ?? null,
          issueDate: remote.issueDate ? remote.issueDate.slice(0, 10) : null,
          dueDate: remote.dueDate ? remote.dueDate.slice(0, 10) : null,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
          updatedAt: syncedAt,
        };

        const existing = await this.db.query.xeroBills.findFirst({
          where: and(
            eq(xeroBills.companyId, ctx.companyId),
            eq(xeroBills.xeroInvoiceId, remote.invoiceId),
          ),
        });

        let billId: string;

        if (existing) {
          await this.db.update(xeroBills).set(row).where(eq(xeroBills.id, existing.id));
          billId = existing.id;
          counts.updatedCount += 1;
        } else {
          const [created] = await this.db
            .insert(xeroBills)
            .values({
              companyId: ctx.companyId,
              integrationConnectionId: ctx.connection.id,
              xeroInvoiceId: remote.invoiceId,
              ...row,
            })
            .returning();

          if (!created) {
            throw new XeroSyncError('CREATE_FAILED', 'Unable to store Xero bill');
          }

          billId = created.id;
          counts.createdCount += 1;
        }

        await this.replaceBillLineItems(ctx, billId, detail.raw);
        counts.pulledCount += 1;

        await this.writeLog(ctx, {
          entityType: 'bill',
          entityId: billId,
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'success',
          message: `Imported supplier bill ${remote.invoiceNumber ?? remote.invoiceId} from Xero`,
        });
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'bill',
          xeroEntityId: remote.invoiceId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }
  }

  private async replaceBillLineItems(
    ctx: SyncContext,
    billId: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    // Read Xero's raw LineItems rather than the normalised sales-invoice shape: bills need the
    // account code, tax type and tracking exactly as Xero holds them for expense intelligence.
    const rawLines = Array.isArray(raw.LineItems)
      ? (raw.LineItems.filter(
          (line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object',
        ) as Array<Record<string, unknown>>)
      : [];

    await this.db
      .delete(xeroBillLineItems)
      .where(
        and(eq(xeroBillLineItems.companyId, ctx.companyId), eq(xeroBillLineItems.billId, billId)),
      );

    if (rawLines.length === 0) {
      return;
    }

    await this.db.insert(xeroBillLineItems).values(
      rawLines.map((line, index) => ({
        companyId: ctx.companyId,
        billId,
        xeroLineItemId: readRawString(line, 'LineItemID'),
        position: index,
        description: readRawString(line, 'Description'),
        quantity: Math.round(readRawNumber(line, 'Quantity') ?? 1),
        unitAmountCents: amountToCents(readRawNumber(line, 'UnitAmount') ?? 0),
        lineAmountCents: amountToCents(readRawNumber(line, 'LineAmount') ?? 0),
        taxAmountCents: amountToCents(readRawNumber(line, 'TaxAmount') ?? 0),
        accountCode: readRawString(line, 'AccountCode'),
        taxType: readRawString(line, 'TaxType'),
        tracking: Array.isArray(line.Tracking)
          ? (line.Tracking as Array<Record<string, unknown>>)
          : [],
      })),
    );
  }

  private async importCreditNoteBatch(
    ctx: SyncContext,
    remoteNotes: Awaited<ReturnType<XeroClient['listCreditNotesPage']>>,
    counts: XeroImportEntityCounts,
  ): Promise<void> {
    for (const remote of remoteNotes) {
      try {
        const syncedAt = new Date();
        const row = {
          creditNoteNumber: remote.creditNoteNumber,
          xeroContactId: remote.contactId,
          contactName: remote.contactName,
          type: remote.type,
          status: remote.status,
          subtotalCents: amountToCents(remote.subtotal),
          taxCents: amountToCents(remote.totalTax),
          totalCents: amountToCents(remote.total),
          remainingCreditCents: amountToCents(remote.remainingCredit),
          currency: remote.currencyCode ?? ctx.connection.config.baseCurrency ?? null,
          issueDate: remote.date ? remote.date.slice(0, 10) : null,
          reference: remote.reference,
          sourceSyncedAt: syncedAt,
          sourceImportJobId: ctx.syncJobId ?? null,
          updatedAt: syncedAt,
        };

        const existing = await this.db.query.xeroCreditNotes.findFirst({
          where: and(
            eq(xeroCreditNotes.companyId, ctx.companyId),
            eq(xeroCreditNotes.xeroCreditNoteId, remote.creditNoteId),
          ),
        });

        let creditNoteId: string;

        if (existing) {
          await this.db.update(xeroCreditNotes).set(row).where(eq(xeroCreditNotes.id, existing.id));
          creditNoteId = existing.id;
          counts.updatedCount += 1;
        } else {
          const [created] = await this.db
            .insert(xeroCreditNotes)
            .values({
              companyId: ctx.companyId,
              integrationConnectionId: ctx.connection.id,
              xeroCreditNoteId: remote.creditNoteId,
              ...row,
            })
            .returning();

          if (!created) {
            throw new XeroSyncError('CREATE_FAILED', 'Unable to store Xero credit note');
          }

          creditNoteId = created.id;
          counts.createdCount += 1;
        }

        await this.db
          .delete(xeroCreditNoteAllocations)
          .where(
            and(
              eq(xeroCreditNoteAllocations.companyId, ctx.companyId),
              eq(xeroCreditNoteAllocations.creditNoteId, creditNoteId),
            ),
          );

        if (remote.allocations.length > 0) {
          await this.db.insert(xeroCreditNoteAllocations).values(
            remote.allocations.map((allocation) => ({
              companyId: ctx.companyId,
              creditNoteId,
              xeroInvoiceId: allocation.invoiceId,
              amountCents: amountToCents(allocation.amount),
              allocatedOn: allocation.date ? allocation.date.slice(0, 10) : null,
            })),
          );
        }

        counts.pulledCount += 1;

        await this.writeLog(ctx, {
          entityType: 'credit_note',
          entityId: creditNoteId,
          xeroEntityId: remote.creditNoteId,
          action: 'pull',
          status: 'success',
          message: `Imported credit note ${remote.creditNoteNumber ?? remote.creditNoteId} from Xero`,
        });
      } catch (error) {
        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'credit_note',
          xeroEntityId: remote.creditNoteId,
          action: 'pull',
          status: 'failed',
          message: mapError(error),
        });
      }
    }
  }

  /**
   * Attachment metadata for imported invoices, bills and credit notes. Walks parents in
   * checkpointed slices so a long tenant resumes rather than restarting.
   */
  private async importAttachmentBatch(
    ctx: SyncContext,
    state: XeroImportJobState,
  ): Promise<{ processed: number; done: boolean }> {
    const counts = state.attachments;
    const parents = await this.loadAttachmentParents(
      ctx.companyId,
      state.checkpoint.attachmentsOffset,
      XERO_ATTACHMENT_PARENT_BATCH,
    );

    if (parents.length === 0) {
      return { processed: 0, done: true };
    }

    for (const parent of parents) {
      try {
        const remoteAttachments = await ctx.client.listAttachments(parent.endpoint, parent.xeroId);

        for (const remote of remoteAttachments) {
          const syncedAt = new Date();
          const row = {
            parentType: parent.parentType,
            parentXeroId: parent.xeroId,
            fileName: remote.fileName,
            mimeType: remote.mimeType,
            contentLength: remote.contentLength,
            xeroUrl: remote.url,
            includeOnline: remote.includeOnline,
            sourceSyncedAt: syncedAt,
            sourceImportJobId: ctx.syncJobId ?? null,
            updatedAt: syncedAt,
          };

          const existing = await this.db.query.xeroAttachments.findFirst({
            where: and(
              eq(xeroAttachments.companyId, ctx.companyId),
              eq(xeroAttachments.xeroAttachmentId, remote.attachmentId),
            ),
          });

          if (existing) {
            await this.db
              .update(xeroAttachments)
              .set(row)
              .where(eq(xeroAttachments.id, existing.id));
            counts.updatedCount += 1;
          } else {
            await this.db.insert(xeroAttachments).values({
              companyId: ctx.companyId,
              integrationConnectionId: ctx.connection.id,
              xeroAttachmentId: remote.attachmentId,
              ...row,
            });
            counts.createdCount += 1;
          }

          counts.pulledCount += 1;
        }
      } catch (error) {
        // A rejected grant is not a per-record problem: every remaining parent would be rejected
        // the same way. Fail the stage once with the real reason instead of recording one
        // fabricated record failure per parent and reporting a scope gap as bad data.
        if (error instanceof XeroError && requiresOwnerActionToRetry(error.code)) {
          await this.writeLog(ctx, {
            entityType: 'attachment',
            xeroEntityId: parent.xeroId,
            action: 'pull',
            status: 'failed',
            message: `Xero rejected attachment access while reading ${parent.parentType} ${parent.xeroId}: ${mapError(error)} Attachment metadata needs the accounting.attachments.read scope — reconnect Xero to grant it.`,
          });
          throw error;
        }

        counts.failedCount += 1;
        await this.writeLog(ctx, {
          entityType: 'attachment',
          xeroEntityId: parent.xeroId,
          action: 'pull',
          status: 'failed',
          message: `Attachment fetch failed for ${parent.parentType} ${parent.xeroId}: ${mapError(error)}`,
        });
      }
    }

    state.checkpoint.attachmentsOffset += parents.length;
    return { processed: parents.length, done: parents.length < XERO_ATTACHMENT_PARENT_BATCH };
  }

  /** Parents whose attachments should be fetched, in a stable order so the offset cursor is safe. */
  private async loadAttachmentParents(
    companyId: string,
    offset: number,
    limit: number,
  ): Promise<
    Array<{
      xeroId: string;
      parentType: string;
      endpoint: 'Invoices' | 'BankTransactions' | 'CreditNotes' | 'Contacts';
    }>
  > {
    const invoiceRows = await this.db
      .select({ xeroId: xeroInvoiceMappings.xeroInvoiceId })
      .from(xeroInvoiceMappings)
      .where(eq(xeroInvoiceMappings.companyId, companyId))
      .orderBy(xeroInvoiceMappings.xeroInvoiceId);
    const billRows = await this.db
      .select({ xeroId: xeroBills.xeroInvoiceId })
      .from(xeroBills)
      .where(eq(xeroBills.companyId, companyId))
      .orderBy(xeroBills.xeroInvoiceId);
    const creditNoteRows = await this.db
      .select({ xeroId: xeroCreditNotes.xeroCreditNoteId })
      .from(xeroCreditNotes)
      .where(eq(xeroCreditNotes.companyId, companyId))
      .orderBy(xeroCreditNotes.xeroCreditNoteId);

    const parents = [
      ...invoiceRows
        .filter((row): row is { xeroId: string } => Boolean(row.xeroId))
        .map((row) => ({
          xeroId: row.xeroId,
          parentType: 'invoice',
          endpoint: 'Invoices' as const,
        })),
      ...billRows.map((row) => ({
        xeroId: row.xeroId,
        parentType: 'bill',
        endpoint: 'Invoices' as const,
      })),
      ...creditNoteRows.map((row) => ({
        xeroId: row.xeroId,
        parentType: 'credit_note',
        endpoint: 'CreditNotes' as const,
      })),
    ];

    return parents.slice(offset, offset + limit);
  }

  /**
   * Persist what this run actually covered for one entity. Only called once the stage itself has
   * finished — coverage claims elsewhere read from here, and are never inferred from a page
   * rendering successfully.
   */
  private async recordEntityCoverage(
    ctx: SyncContext,
    state: XeroImportJobState,
    stage: XeroImportStage,
  ): Promise<void> {
    const now = new Date();

    const existing = await this.db.query.xeroEntityCoverage.findFirst({
      where: and(
        eq(xeroEntityCoverage.companyId, ctx.companyId),
        eq(xeroEntityCoverage.entity, stage),
      ),
    });

    const values = {
      ...resolveEntityCoverageWrite({
        stage,
        counts: getStageCounts(state, stage),
        failedStage: state.failedStage,
        stageError: state.stageError,
        isFullHistoryRun: state.checkpoint.modifiedSince === null,
        existing: existing ?? null,
        now,
      }),
      lastSyncJobId: ctx.syncJobId ?? null,
      updatedAt: now,
    };

    if (existing) {
      await this.db
        .update(xeroEntityCoverage)
        .set(values)
        .where(eq(xeroEntityCoverage.id, existing.id));
      return;
    }

    await this.db.insert(xeroEntityCoverage).values({
      companyId: ctx.companyId,
      integrationConnectionId: ctx.connection.id,
      entity: stage,
      ...values,
    });
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

    const email = normalizeContactEmail(input.email);
    const phoneDigits = normalizeContactPhone(input.phone);

    let emailMatchCustomerId: string | null = null;
    let phoneMatchCustomerId: string | null = null;

    if (!existingMapping && email) {
      const byEmail = await this.db.query.customers.findFirst({
        where: and(eq(customers.companyId, ctx.companyId), eq(customers.email, email)),
        columns: { id: true },
      });
      emailMatchCustomerId = byEmail?.id ?? null;
    }

    if (!existingMapping && !emailMatchCustomerId && phoneDigits) {
      const companyCustomers = await this.db.query.customers.findMany({
        where: eq(customers.companyId, ctx.companyId),
        columns: { id: true, phone: true },
        limit: 5000,
      });
      const byPhone = companyCustomers.find(
        (row) => normalizeContactPhone(row.phone) === phoneDigits,
      );
      phoneMatchCustomerId = byPhone?.id ?? null;
    }

    const match = pickCustomerMatchCandidate({
      mappedCustomerId: existingMapping?.customerId ?? null,
      emailMatchCustomerId,
      phoneMatchCustomerId,
    });

    if (match) {
      await this.db
        .update(customers)
        .set({
          name: input.name,
          email: input.email ?? undefined,
          phone: input.phone ?? undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, match.customerId), eq(customers.companyId, ctx.companyId)));
      return match.customerId;
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

  private async replaceInvoiceLineItems(
    ctx: SyncContext,
    invoiceId: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    const mapped = mapXeroLineItemsToTitan(extractXeroLineItemsFromRaw(raw));
    await this.db
      .delete(invoiceLineItems)
      .where(
        and(eq(invoiceLineItems.companyId, ctx.companyId), eq(invoiceLineItems.invoiceId, invoiceId)),
      );
    if (mapped.length === 0) return;
    await this.db.insert(invoiceLineItems).values(
      mapped.map((line) => ({
        companyId: ctx.companyId,
        invoiceId,
        position: line.position,
        category: line.category,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatRateBps: line.vatRateBps,
        lineSubtotalCents: line.lineSubtotalCents,
        lineVatCents: line.lineVatCents,
        lineTotalCents: line.lineTotalCents,
        accountCode: line.accountCode,
        sourceExternalId: line.sourceExternalId,
      })),
    );
  }

  private async replaceQuoteLineItems(
    ctx: SyncContext,
    quoteId: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    const mapped = mapXeroLineItemsToTitan(extractXeroLineItemsFromRaw(raw));
    await this.db
      .delete(quoteLineItems)
      .where(and(eq(quoteLineItems.companyId, ctx.companyId), eq(quoteLineItems.quoteId, quoteId)));
    if (mapped.length === 0) return;
    await this.db.insert(quoteLineItems).values(
      mapped.map((line) => ({
        companyId: ctx.companyId,
        quoteId,
        position: line.position,
        category: 'other' as const,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatRateBps: line.vatRateBps,
        lineSubtotalCents: line.lineSubtotalCents,
        lineVatCents: line.lineVatCents,
        lineTotalCents: line.lineTotalCents,
        accountCode: line.accountCode,
        sourceExternalId: line.sourceExternalId,
      })),
    );
  }

  private async getBankTransactionStats(companyId: string) {
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(xeroBankTransactions)
      .where(eq(xeroBankTransactions.companyId, companyId));
    const [latest] = await this.db
      .select({ lastSyncedAt: xeroBankTransactions.sourceSyncedAt })
      .from(xeroBankTransactions)
      .where(eq(xeroBankTransactions.companyId, companyId))
      .orderBy(desc(xeroBankTransactions.sourceSyncedAt))
      .limit(1);
    const failedRows = await this.db.query.xeroSyncLogs.findMany({
      where: and(
        eq(xeroSyncLogs.companyId, companyId),
        eq(xeroSyncLogs.entityType, 'bank_transaction'),
        eq(xeroSyncLogs.status, 'failed'),
      ),
      orderBy: [desc(xeroSyncLogs.createdAt)],
      limit: 1,
    });
    const syncedCount = countRow?.count ?? 0;
    return {
      syncedCount,
      failedCount: failedRows.length > 0 ? 1 : 0,
      pendingCount: 0,
      outOfSyncCount: 0,
      lastSyncAt: latest?.lastSyncedAt?.toISOString() ?? null,
      lastSuccessfulSyncAt: latest?.lastSyncedAt?.toISOString() ?? null,
      lastError: failedRows[0]?.message ?? null,
    };
  }

  private async getFinancePipelineSummary(
    companyId: string,
    connectionId: string,
  ): Promise<XeroFinancePipelineSummary> {
    const latest = await this.db.query.xeroFinanceSyncRuns.findFirst({
      where: and(
        eq(xeroFinanceSyncRuns.companyId, companyId),
        eq(xeroFinanceSyncRuns.integrationConnectionId, connectionId),
      ),
      orderBy: [desc(xeroFinanceSyncRuns.startedAt)],
    });

    if (!latest) {
      return {
        lastSyncAt: null,
        lastError: null,
        status: null,
        contactsImported: 0,
        quotesImported: 0,
        invoicesImported: 0,
        paymentsImported: 0,
        bankTransactionsImported: 0,
        failedCount: 0,
        scheduledJobsReady: true,
      };
    }

    return {
      lastSyncAt: latest.lastSyncAt?.toISOString() ?? latest.finishedAt?.toISOString() ?? null,
      lastError: latest.errorSummary,
      status: latest.status,
      contactsImported: latest.contactsImported,
      quotesImported: latest.quotesImported,
      invoicesImported: latest.invoicesImported,
      paymentsImported: latest.paymentsImported,
      bankTransactionsImported: latest.bankTransactionsImported,
      failedCount: latest.failedCount,
      scheduledJobsReady: true,
    };
  }

  private async recordFinanceSyncRun(
    companyId: string,
    connectionId: string,
    syncJobId: string,
    state: XeroImportJobState,
    success: boolean,
    message: string,
  ): Promise<void> {
    const now = new Date();
    const failedCount = sumImportFailureCounts(state);
    const existing = await this.db.query.xeroFinanceSyncRuns.findFirst({
      where: and(
        eq(xeroFinanceSyncRuns.companyId, companyId),
        eq(xeroFinanceSyncRuns.syncJobId, syncJobId),
      ),
    });

    const values = {
      status: success ? 'completed' : 'failed',
      finishedAt: now,
      lastSyncAt: success ? now : null,
      contactsImported: state.contacts.createdCount + state.contacts.updatedCount,
      quotesImported: state.quotes.createdCount + state.quotes.updatedCount,
      invoicesImported: state.invoices.createdCount + state.invoices.updatedCount,
      paymentsImported: state.payments.createdCount + state.payments.updatedCount,
      bankTransactionsImported:
        state.bankTransactions.createdCount + state.bankTransactions.updatedCount,
      failedCount,
      errorSummary: success ? null : message,
      details: {
        completedStages: state.completedStages,
        failedStage: state.failedStage,
        scheduledJobsReady: true,
      },
      updatedAt: now,
    };

    if (existing) {
      await this.db
        .update(xeroFinanceSyncRuns)
        .set(values)
        .where(eq(xeroFinanceSyncRuns.id, existing.id));
      return;
    }

    await this.db.insert(xeroFinanceSyncRuns).values({
      companyId,
      integrationConnectionId: connectionId,
      syncJobId,
      trigger: state.trigger ?? 'manual',
      startedAt: now,
      ...values,
    });
  }

  private async writeLog(
    ctx: SyncContext,
    input: {
      entityType: XeroSyncEntityType;
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

  /**
   * @deprecated Credit notes now import as a real stage in the historical import pipeline.
   * Retained so existing callers keep compiling; it reports the live stage rather than a stub.
   */
  async importCreditNotesStub(_companyId: string): Promise<{ status: 'active'; message: string }> {
    return {
      status: 'active',
      message: 'Credit notes import via the credit_notes stage of the Xero historical import.',
    };
  }

  /** @deprecated Supplier bills now import as the `bills` stage. */
  async importSupplierBillsStub(_companyId: string): Promise<{ status: 'active'; message: string }> {
    return {
      status: 'active',
      message: 'Supplier bills (ACCPAY) import via the bills stage of the Xero historical import.',
    };
  }

  private async assertEntityWriteApproved(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    operation: import('@titan/shared').XeroWriteOperation;
    payloadVersion?: string;
  }): Promise<{ approvalId: string; idempotencyKey: string }> {
    if (!this.writeApprovalGate) {
      throw new XeroSyncError(
        'WRITE_NOT_APPROVED',
        'Xero write approval gate is required for TITAN → Xero sync',
      );
    }

    return this.writeApprovalGate.assertWriteApproved({
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      payloadVersion: input.payloadVersion,
    });
  }

  /**
   * Owner-approved single invoice push. Idempotent when mapping already has xeroInvoiceId.
   * Does not invent TITAN invoice numbers; stores Xero-assigned official number.
   */
  async executeApprovedInvoicePush(input: {
    companyId: string;
    invoiceId: string;
    approvalId: string;
    actorUserId: string;
  }): Promise<Record<string, unknown>> {
    const ctx = await this.createSyncContext(input.companyId);
    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.companyId, input.companyId), eq(invoices.id, input.invoiceId)),
    });
    if (!invoice) {
      throw new XeroSyncError('NOT_FOUND', 'Invoice not found');
    }

    const existingMapping = await this.db.query.xeroInvoiceMappings.findFirst({
      where: and(
        eq(xeroInvoiceMappings.companyId, input.companyId),
        eq(xeroInvoiceMappings.invoiceId, input.invoiceId),
      ),
    });

    if (existingMapping?.xeroInvoiceId) {
      const remote = await ctx.client.fetchInvoice(existingMapping.xeroInvoiceId);
      const officialNumber = resolveOfficialXeroInvoiceNumber({
        xeroAssignedNumber: remote.invoiceNumber,
        xeroInvoiceId: existingMapping.xeroInvoiceId,
      });
      await this.upsertInvoiceMapping(
        ctx,
        invoice.id,
        existingMapping.xeroInvoiceId,
        'synced',
        null,
        { xeroInvoiceNumber: officialNumber },
      );
      if (officialNumber) {
        await this.db
          .update(invoices)
          .set({
            xeroInvoiceNumber: officialNumber,
            numberAuthority: 'xero',
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));
      }
      await this.writeLog(ctx, {
        entityType: 'invoice',
        entityId: invoice.id,
        xeroEntityId: existingMapping.xeroInvoiceId,
        action: 'push',
        status: 'success',
        message: 'Idempotent invoice push — existing Xero mapping reused',
      });
      return {
        idempotent: true,
        xeroInvoiceId: existingMapping.xeroInvoiceId,
        xeroInvoiceNumber: officialNumber,
      };
    }

    if (existingMapping?.conflictMetadata) {
      throw new XeroSyncError(
        'CONFLICT',
        'Invoice has unresolved conflict_metadata — Owner must resolve before push',
      );
    }

    const customerMapping = await this.db.query.xeroCustomerMappings.findFirst({
      where: and(
        eq(xeroCustomerMappings.companyId, input.companyId),
        eq(xeroCustomerMappings.customerId, invoice.customerId),
        eq(xeroCustomerMappings.syncStatus, 'synced'),
      ),
    });
    if (!customerMapping?.xeroContactId) {
      throw new XeroSyncError(
        'VALIDATION',
        'Customer must be mapped to a Xero contact before invoice push',
      );
    }

    let jobNumber: string | null = null;
    if (invoice.jobId) {
      const job = await this.db.query.jobs.findFirst({
        where: and(eq(jobs.companyId, input.companyId), eq(jobs.id, invoice.jobId)),
      });
      jobNumber = job?.jobNumber ?? null;
    }

    const remote = await ctx.client.createInvoice({
      contactId: customerMapping.xeroContactId,
      title: invoice.title,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      issueDate: invoice.issuedAt?.toISOString().slice(0, 10) ?? null,
      reference: jobNumber,
      status: 'DRAFT',
    });

    const officialNumber = resolveOfficialXeroInvoiceNumber({
      xeroAssignedNumber: remote.invoiceNumber,
      xeroInvoiceId: remote.invoiceId,
    });

    await this.db
      .update(invoices)
      .set({
        ...(officialNumber
          ? { xeroInvoiceNumber: officialNumber, numberAuthority: 'xero' }
          : {}),
        xeroReference: jobNumber,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await this.upsertInvoiceMapping(ctx, invoice.id, remote.invoiceId, 'synced', null, {
      xeroInvoiceNumber: officialNumber,
      xeroReference: jobNumber,
    });

    await this.writeLog(ctx, {
      entityType: 'invoice',
      entityId: invoice.id,
      xeroEntityId: remote.invoiceId,
      action: 'push',
      status: 'success',
      message: `Pushed invoice draft to Xero (approval ${input.approvalId})`,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      userId: input.actorUserId,
      category: 'integrations',
      action: 'xero_invoice_push_executed',
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: {
        approvalId: input.approvalId,
        xeroInvoiceId: remote.invoiceId,
        xeroInvoiceNumber: officialNumber,
      },
    });

    invalidateIntegrationReadCaches(input.companyId);
    return {
      idempotent: false,
      xeroInvoiceId: remote.invoiceId,
      xeroInvoiceNumber: officialNumber,
      status: remote.status,
    };
  }

  /**
   * Owner-approved single quote push. Idempotent when mapping already has xeroQuoteId.
   * Creates DRAFT quote in Xero only — never sends/issues.
   */
  async executeApprovedQuotePush(input: {
    companyId: string;
    quoteId: string;
    approvalId: string;
    actorUserId: string;
  }): Promise<Record<string, unknown>> {
    const ctx = await this.createSyncContext(input.companyId);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.companyId, input.companyId), eq(quotes.id, input.quoteId)),
    });
    if (!quote) {
      throw new XeroSyncError('NOT_FOUND', 'Quote not found');
    }

    const existingMapping = await this.db.query.xeroQuoteMappings.findFirst({
      where: and(
        eq(xeroQuoteMappings.companyId, input.companyId),
        eq(xeroQuoteMappings.quoteId, input.quoteId),
      ),
    });

    if (existingMapping?.xeroQuoteId) {
      const remote = await ctx.client.fetchQuote(existingMapping.xeroQuoteId);
      await this.upsertQuoteMapping(ctx, quote.id, existingMapping.xeroQuoteId, 'synced');
      await this.writeLog(ctx, {
        entityType: 'quote',
        entityId: quote.id,
        xeroEntityId: existingMapping.xeroQuoteId,
        action: 'push',
        status: 'success',
        message: 'Idempotent quote push — existing Xero mapping reused',
      });
      return {
        idempotent: true,
        xeroQuoteId: existingMapping.xeroQuoteId,
        xeroQuoteNumber: remote.quoteNumber,
        status: remote.status,
      };
    }

    const customerMapping = await this.db.query.xeroCustomerMappings.findFirst({
      where: and(
        eq(xeroCustomerMappings.companyId, input.companyId),
        eq(xeroCustomerMappings.customerId, quote.customerId),
        eq(xeroCustomerMappings.syncStatus, 'synced'),
      ),
    });
    if (!customerMapping?.xeroContactId) {
      throw new XeroSyncError(
        'VALIDATION',
        'Customer must be mapped to a Xero contact before quote push',
      );
    }

    const remote = await ctx.client.createQuote({
      contactId: customerMapping.xeroContactId,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      amountCents: quote.amountCents,
      currency: quote.currency,
      expiryDate: quote.validUntil?.toISOString().slice(0, 10) ?? null,
    });

    await this.upsertQuoteMapping(ctx, quote.id, remote.quoteId, 'synced');

    await this.writeLog(ctx, {
      entityType: 'quote',
      entityId: quote.id,
      xeroEntityId: remote.quoteId,
      action: 'push',
      status: 'success',
      message: `Pushed quote draft to Xero (approval ${input.approvalId})`,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      userId: input.actorUserId,
      category: 'integrations',
      action: 'xero_quote_push_executed',
      entityType: 'quote',
      entityId: quote.id,
      metadata: {
        approvalId: input.approvalId,
        xeroQuoteId: remote.quoteId,
        xeroQuoteNumber: remote.quoteNumber,
      },
    });

    invalidateIntegrationReadCaches(input.companyId);
    return {
      idempotent: false,
      xeroQuoteId: remote.quoteId,
      xeroQuoteNumber: remote.quoteNumber,
      status: remote.status,
    };
  }

  async executeApprovedPaymentPush(input: {
    companyId: string;
    paymentId: string;
    approvalId: string;
    actorUserId: string;
  }): Promise<Record<string, unknown>> {
    const ctx = await this.createSyncContext(input.companyId);
    const payment = await this.db.query.payments.findFirst({
      where: and(eq(payments.companyId, input.companyId), eq(payments.id, input.paymentId)),
    });
    if (!payment) {
      throw new XeroSyncError('NOT_FOUND', 'Payment not found');
    }
    if (payment.amountCents <= 0) {
      throw new XeroSyncError('VALIDATION', 'Payment amount must be positive');
    }

    const existingMapping = await this.db.query.xeroPaymentMappings.findFirst({
      where: and(
        eq(xeroPaymentMappings.companyId, input.companyId),
        eq(xeroPaymentMappings.paymentId, input.paymentId),
      ),
    });
    if (existingMapping?.xeroPaymentId || payment.xeroPaymentId) {
      const xeroPaymentId = existingMapping?.xeroPaymentId ?? payment.xeroPaymentId!;
      return { idempotent: true, xeroPaymentId };
    }

    const invoiceMapping = await this.db.query.xeroInvoiceMappings.findFirst({
      where: and(
        eq(xeroInvoiceMappings.companyId, input.companyId),
        eq(xeroInvoiceMappings.invoiceId, payment.invoiceId),
        eq(xeroInvoiceMappings.syncStatus, 'synced'),
      ),
    });
    if (!invoiceMapping?.xeroInvoiceId) {
      throw new XeroSyncError(
        'VALIDATION',
        'Linked invoice must be pushed/mapped to Xero before payment push',
      );
    }

    const remote = await ctx.client.createPayment({
      invoiceId: invoiceMapping.xeroInvoiceId,
      amountCents: payment.amountCents,
      date: payment.paidAt?.toISOString().slice(0, 10) ?? null,
      reference: payment.reference,
    });

    await this.db
      .update(payments)
      .set({ xeroPaymentId: remote.paymentId })
      .where(eq(payments.id, payment.id));

    await this.upsertPaymentMapping(ctx, payment.id, remote.paymentId, 'synced');

    await this.writeLog(ctx, {
      entityType: 'payment',
      entityId: payment.id,
      xeroEntityId: remote.paymentId,
      action: 'push',
      status: 'success',
      message: `Pushed payment to Xero (approval ${input.approvalId})`,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      userId: input.actorUserId,
      category: 'integrations',
      action: 'xero_payment_push_executed',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        approvalId: input.approvalId,
        xeroPaymentId: remote.paymentId,
        xeroInvoiceId: invoiceMapping.xeroInvoiceId,
        amountCents: payment.amountCents,
      },
    });

    invalidateIntegrationReadCaches(input.companyId);
    return {
      idempotent: false,
      xeroPaymentId: remote.paymentId,
      xeroInvoiceId: invoiceMapping.xeroInvoiceId,
      amountCents: payment.amountCents,
    };
  }

  async executeApprovedContactPush(input: {
    companyId: string;
    customerId: string;
    approvalId: string;
    actorUserId: string;
  }): Promise<Record<string, unknown>> {
    const ctx = await this.createSyncContext(input.companyId);
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.companyId, input.companyId), eq(customers.id, input.customerId)),
    });
    if (!customer) {
      throw new XeroSyncError('NOT_FOUND', 'Customer not found');
    }

    const existingMapping = await this.db.query.xeroCustomerMappings.findFirst({
      where: and(
        eq(xeroCustomerMappings.companyId, input.companyId),
        eq(xeroCustomerMappings.customerId, input.customerId),
      ),
    });

    if (existingMapping?.conflictMetadata) {
      throw new XeroSyncError(
        'CONFLICT',
        'Contact has unresolved conflict_metadata — Owner must resolve before push',
      );
    }

    let xeroContactId = existingMapping?.xeroContactId ?? null;
    let linkedExisting = false;

    if (!xeroContactId && customer.email) {
      const existingContact = await ctx.client.findContactByEmail(customer.email);
      if (existingContact) {
        xeroContactId = existingContact.contactId;
        linkedExisting = true;
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

    await this.upsertCustomerMapping(ctx, customer.id, contact.contactId, 'synced');

    await this.writeLog(ctx, {
      entityType: 'customer',
      entityId: customer.id,
      xeroEntityId: contact.contactId,
      action: existingMapping?.xeroContactId ? 'update' : linkedExisting ? 'link' : 'push',
      status: 'success',
      message: `Synced contact ${customer.name} (approval ${input.approvalId})`,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      userId: input.actorUserId,
      category: 'integrations',
      action: 'xero_contact_push_executed',
      entityType: 'customer',
      entityId: customer.id,
      metadata: {
        approvalId: input.approvalId,
        xeroContactId: contact.contactId,
        linkedExisting,
      },
    });

    invalidateIntegrationReadCaches(input.companyId);
    return {
      idempotent: Boolean(existingMapping?.xeroContactId),
      xeroContactId: contact.contactId,
      linkedExisting,
    };
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

  /** Owner-visible preview before recovering a stale Xero import job (XERO-002 X-P0-4). */
  async previewImportRecovery(companyId: string): Promise<{
    staleJobsAbandoned: number;
    recoverableJobId: string | null;
    recoverableJobStatus: string | null;
    failedStage: string | null;
    stageErrorCode: string | null;
    actionDescription: string;
    ownerActionRequired: boolean;
    ownerActionReason: string | null;
  }> {
    const staleJobsAbandoned = await this.failStaleImportJobs(companyId);
    const failedJob = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        eq(integrationSyncJobs.provider, 'xero'),
        eq(integrationSyncJobs.syncScope, 'import'),
        eq(integrationSyncJobs.status, 'failed'),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
    });

    if (!failedJob) {
      return {
        staleJobsAbandoned,
        recoverableJobId: null,
        recoverableJobStatus: null,
        failedStage: null,
        stageErrorCode: null,
        actionDescription:
          staleJobsAbandoned > 0
            ? 'Stale jobs were marked failed. No recoverable checkpoint found — start a new sync.'
            : 'No stale import job detected.',
        ownerActionRequired: false,
        ownerActionReason: null,
      };
    }

    const state = parseImportJobState(failedJob.resultSummary as Record<string, unknown> | null);
    const ownerActionRequired = requiresOwnerActionToRetry(state.stageErrorCode);

    return {
      staleJobsAbandoned,
      recoverableJobId: failedJob.id,
      recoverableJobStatus: failedJob.status,
      failedStage: state.failedStage,
      stageErrorCode: state.stageErrorCode ?? null,
      actionDescription: ownerActionRequired
        ? 'Recover will preserve the checkpoint but the attachments/accounts stage requires Owner reconnect before retry can succeed.'
        : 'Recover will re-queue this import job from the last checkpoint without deleting history.',
      ownerActionRequired,
      ownerActionReason: ownerActionRequired ? state.stageError : null,
    };
  }

  /** Recover stale/failed import job — idempotent, preserves checkpoint (XERO-002 X-P0-4). */
  async recoverStaleImportJob(companyId: string, userId: string) {
    const preview = await this.previewImportRecovery(companyId);
    if (!preview.recoverableJobId) {
      throw new XeroSyncError('NOT_FOUND', preview.actionDescription);
    }
    if (preview.ownerActionRequired) {
      throw new XeroSyncError(
        'OWNER_ACTION_REQUIRED',
        preview.ownerActionReason ??
          'Owner must reconnect Xero or resolve provider scope before recovery can proceed.',
      );
    }

    const result = await this.retrySyncJob(companyId, preview.recoverableJobId);

    await this.db.insert(securityAuditLogs).values({
      companyId,
      userId,
      category: 'integrations',
      action: 'xero_import_recovered',
      entityType: 'integration_sync_job',
      entityId: preview.recoverableJobId,
      metadata: {
        staleJobsAbandoned: preview.staleJobsAbandoned,
        failedStage: preview.failedStage,
      },
    });

    return { preview, result };
  }

  /** Safely clear a failed import job without deleting mapping history (XERO-002 X-P0-4). */
  async clearFailedImportJobSafely(companyId: string, userId: string, syncJobId: string) {
    const job = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.id, syncJobId),
        eq(integrationSyncJobs.companyId, companyId),
        eq(integrationSyncJobs.provider, 'xero'),
        eq(integrationSyncJobs.syncScope, 'import'),
      ),
    });

    if (!job) {
      throw new XeroSyncError('NOT_FOUND', 'Import job not found');
    }

    if (job.status === 'running' || job.status === 'pending') {
      throw new XeroSyncError(
        'INVALID_STATE',
        'Cannot clear an active import job. Recover stale sync first or wait for completion.',
      );
    }

    if (job.status !== 'failed') {
      throw new XeroSyncError('INVALID_STATE', 'Only failed import jobs can be cleared safely');
    }

    const state = parseImportJobState(job.resultSummary as Record<string, unknown> | null);
    const summary = {
      ...importJobStateToSummary(state),
      clearedSafely: true,
      clearedAt: new Date().toISOString(),
      clearedByUserId: userId,
    };

    await this.db
      .update(integrationSyncJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: 'Owner cleared failed sync safely — checkpoint retained in summary.',
        resultSummary: summary,
      })
      .where(eq(integrationSyncJobs.id, syncJobId));

    await this.db.insert(securityAuditLogs).values({
      companyId,
      userId,
      category: 'integrations',
      action: 'xero_import_cleared_safely',
      entityType: 'integration_sync_job',
      entityId: syncJobId,
    });

    return { syncJobId, status: 'cancelled' as const };
  }

  /**
   * XERO-003 — targeted invoice refresh from a webhook or write confirmation.
   * Does not start a full import job; fetches only the affected invoice.
   */
  async refreshTargetedInvoiceFromXero(
    companyId: string,
    xeroInvoiceId: string,
    options?: { priority?: XeroRequestPriority },
  ): Promise<{ invoiceId: string | null; updated: boolean; failed: boolean }> {
    const priority = options?.priority ?? 'webhook_targeted_refresh';
    const execute = () => this.refreshTargetedInvoiceFromXeroOnce(companyId, xeroInvoiceId);
    if (this.rateBudget) {
      return this.rateBudget.executeWithBudget(companyId, priority, execute);
    }
    return execute();
  }

  private async refreshTargetedInvoiceFromXeroOnce(
    companyId: string,
    xeroInvoiceId: string,
  ): Promise<{ invoiceId: string | null; updated: boolean; failed: boolean }> {
    const ctx = await this.createSyncContext(companyId);
    const counts: XeroImportEntityCounts = {
      createdCount: 0,
      updatedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };

    try {
      const remote = await ctx.client.fetchInvoice(xeroInvoiceId);
      await this.importInvoiceBatch(ctx, [remote], counts);

      const mapping = await this.db.query.xeroInvoiceMappings.findFirst({
        where: and(
          eq(xeroInvoiceMappings.companyId, companyId),
          eq(xeroInvoiceMappings.xeroInvoiceId, xeroInvoiceId),
        ),
      });

      const syncedAt = new Date();
      await this.touchEntityCoverage(ctx, 'invoices', counts, syncedAt);

      invalidateDashboardFinanceCaches(companyId);
      invalidateIntegrationReadCaches(companyId);

      if (mapping?.invoiceId) {
        emitBusinessEvent({
          companyId,
          eventType: 'webhook.received',
          entityType: 'invoice',
          entityId: mapping.invoiceId,
          payload: {
            source: 'xero_targeted_refresh',
            xeroInvoiceId,
            refreshedAt: syncedAt.toISOString(),
          },
        });
      }

      return {
        invoiceId: mapping?.invoiceId ?? null,
        updated: counts.createdCount + counts.updatedCount > 0,
        failed: counts.failedCount > 0,
      };
    } catch (error) {
      await this.writeLog(ctx, {
        entityType: 'invoice',
        xeroEntityId: xeroInvoiceId,
        action: 'pull',
        status: 'failed',
        message: mapError(error),
      });
      return { invoiceId: null, updated: false, failed: true };
    }
  }

  /**
   * XERO-003 — incremental quote refresh for active finance screens only.
   * Uses If-Modified-Since when a watermark exists; capped page budget.
   *
   * NOT a Young Guns historical migration path. Full-history quote import must use the
   * resumable import pipeline (complete pagination, no date floor) via enqueueImportSync /
   * syncFromXero. This refresh must never be treated as covering historical quote history.
   */
  async refreshQuotesIncrementalFromXero(
    companyId: string,
    options?: { modifiedSince?: string | null; maxPages?: number },
  ): Promise<XeroEntitySyncResult & { delayed: boolean }> {
    const ctx = await this.createSyncContext(companyId);
    const coverage = await this.db.query.xeroEntityCoverage.findFirst({
      where: and(eq(xeroEntityCoverage.companyId, companyId), eq(xeroEntityCoverage.entity, 'quotes')),
    });

    const modifiedSince =
      options?.modifiedSince ?? coverage?.modifiedSinceWatermark?.toISOString() ?? null;
    const maxPages = options?.maxPages ?? 2;
    const counts: XeroImportEntityCounts = {
      createdCount: 0,
      updatedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };

    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await ctx.client.listQuotesPage(page, { modifiedSince });
      if (batch.length === 0) break;
      await this.importQuoteBatch(ctx, batch, counts);
      if (batch.length < XERO_PAGE_SIZE) break;
    }

    const syncedAt = new Date();
    await this.touchEntityCoverage(ctx, 'quotes', counts, syncedAt);
    invalidateDashboardFinanceCaches(companyId);
    invalidateIntegrationReadCaches(companyId);

    emitBusinessEvent({
      companyId,
      eventType: 'webhook.received',
      entityType: 'quote',
      entityId: companyId,
      payload: {
        source: 'xero_incremental_quotes',
        refreshedAt: syncedAt.toISOString(),
        createdCount: counts.createdCount,
        updatedCount: counts.updatedCount,
      },
    });

    return {
      scope: 'quotes',
      ...counts,
      syncedAt: syncedAt.toISOString(),
      delayed: false,
    };
  }

  private async touchEntityCoverage(
    ctx: SyncContext,
    entity: XeroImportStage,
    counts: XeroImportEntityCounts,
    syncedAt: Date,
  ): Promise<void> {
    const existing = await this.db.query.xeroEntityCoverage.findFirst({
      where: and(eq(xeroEntityCoverage.companyId, ctx.companyId), eq(xeroEntityCoverage.entity, entity)),
    });

    const payload = {
      integrationConnectionId: ctx.connection.id,
      entity,
      modifiedSinceWatermark: syncedAt,
      lastSyncedAt: syncedAt,
      importedCount: (existing?.importedCount ?? 0) + counts.createdCount,
      failedCount: (existing?.failedCount ?? 0) + counts.failedCount,
      skippedCount: (existing?.skippedCount ?? 0) + counts.skippedCount,
      lastError: counts.failedCount > 0 ? `${counts.failedCount} targeted refresh failure(s)` : null,
      updatedAt: syncedAt,
    };

    if (existing) {
      await this.db
        .update(xeroEntityCoverage)
        .set(payload)
        .where(eq(xeroEntityCoverage.id, existing.id));
      return;
    }

    await this.db.insert(xeroEntityCoverage).values({
      companyId: ctx.companyId,
      ...payload,
    });
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
    lastSyncAt: null,
    lastError: null,
    customers: empty,
    quotes: empty,
    invoices: empty,
    payments: empty,
    bankTransactions: empty,
    outstandingAmountCents: 0,
    unpaidInvoiceCount: 0,
    customersWithOutstandingCount: 0,
    currency,
    financePipeline: {
      lastSyncAt: null,
      lastError: null,
      status: null,
      contactsImported: 0,
      quotesImported: 0,
      invoicesImported: 0,
      paymentsImported: 0,
      bankTransactionsImported: 0,
      failedCount: 0,
      scheduledJobsReady: true,
    },
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

export function buildImportedInvoiceFinancialFields(remote: {
  total: number;
  subtotal: number;
  totalTax: number;
  amountPaid: number;
}) {
  const totalCents = amountToCents(remote.total);
  const subtotalCents = amountToCents(remote.subtotal);
  const vatCents = amountToCents(remote.totalTax);
  const amountPaidCents = amountToCents(remote.amountPaid);
  const resolvedTotalCents =
    totalCents > 0 ? totalCents : subtotalCents + vatCents > 0 ? subtotalCents + vatCents : 0;

  return {
    amountCents: resolvedTotalCents,
    subtotalCents: resolveImportedSubtotalCents({ subtotalCents, vatCents, resolvedTotalCents }),
    vatCents,
    totalCents: resolvedTotalCents,
    amountPaidCents,
  };
}

/**
 * Xero reports a negative SubTotal on documents whose deposit or credit lines outweigh their work,
 * and that figure is the truth about the document. Substituting the total for it breaks
 * subtotal + VAT = total on exactly those documents, so the value is only derived when Xero
 * reports no subtotal at all — and then from the total less tax, which is what a subtotal is.
 */
export function resolveImportedSubtotalCents(input: {
  subtotalCents: number;
  vatCents: number;
  resolvedTotalCents: number;
}): number {
  if (input.subtotalCents !== 0) {
    return input.subtotalCents;
  }

  return input.resolvedTotalCents - input.vatCents;
}
