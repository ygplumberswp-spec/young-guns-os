import type {
  AutoSyncProviderKey,
  TenantBackgroundWorkStatusResponse,
  TenantDomainEvent,
} from '@titan/shared';
import { mapIntegrationAutoSyncUiStateToBackgroundWork } from '@titan/shared';
import type { BackgroundWorkQueueService } from './background-work-queue.service.js';
import type { CustomerValueClassificationService } from './customer-value-classification.service.js';
import type { IntegrationSyncOrchestratorService } from './integration-sync-orchestrator.service.js';
import type { TenantDomainEventBus } from './tenant-domain-event-bus.service.js';
import type { XeroSyncService, XeroImportJobSettledInput } from './xero-sync.service.js';
import type { XeroTwoWayVerifyService } from './xero-two-way-verify.service.js';
import {
  invalidateBackgroundWorkReadCaches,
  invalidateCustomerValueReadCaches,
  invalidateDashboardFinanceCaches,
  invalidateIntegrationReadCaches,
} from './api-read-cache.js';

export type BackgroundWorkOrchestratorDeps = {
  integrationSyncOrchestrator: IntegrationSyncOrchestratorService;
  backgroundWorkQueue: BackgroundWorkQueueService;
  domainEventBus: TenantDomainEventBus;
  xeroSyncService: XeroSyncService;
  customerValueClassificationService: CustomerValueClassificationService;
  xeroTwoWayVerifyService?: XeroTwoWayVerifyService;
  jobProfitabilityService?: import('./job-profitability.service.js').JobProfitabilityService;
};

export class BackgroundWorkOrchestratorService {
  constructor(private readonly deps: BackgroundWorkOrchestratorDeps) {}

  attachJobProfitabilityService(
    jobProfitabilityService: NonNullable<BackgroundWorkOrchestratorDeps['jobProfitabilityService']>,
  ): void {
    this.deps.jobProfitabilityService = jobProfitabilityService;
  }

  registerDomainEventHandlers(): void {
    const { domainEventBus, backgroundWorkQueue } = this.deps;

    domainEventBus.subscribe('lead.converted', async (event) => {
      await this.handleLeadConverted(event, backgroundWorkQueue);
    });

    domainEventBus.subscribe('job.completed', async (event) => {
      await this.handleJobCompleted(event, backgroundWorkQueue);
    });

    domainEventBus.subscribe('xero.import.completed', async (event) => {
      await this.handleXeroImportCompleted(event);
    });
  }

  async processTick(): Promise<{
    integrationJobsProcessed: number;
    scheduledSyncs: { processed: number; skipped: number; errors: number };
    domainFollowupsPending: number;
    customerValueMetricsRefreshed: number;
  }> {
    const scheduledSyncs = await this.deps.integrationSyncOrchestrator.runScheduledSyncs();
    const domainFollowupsPending =
      await this.deps.backgroundWorkQueue.processPendingDomainFollowups();
    const customerValueMetricsRefreshed =
      await this.deps.integrationSyncOrchestrator.refreshPendingCustomerValueMetrics(
        this.deps.customerValueClassificationService,
      );

    return {
      integrationJobsProcessed: scheduledSyncs.processed,
      scheduledSyncs,
      domainFollowupsPending,
      customerValueMetricsRefreshed,
    };
  }

  async getTenantBackgroundWorkStatus(
    companyId: string,
  ): Promise<TenantBackgroundWorkStatusResponse> {
    const [activeItems, recentItems, autoSyncStatuses] = await Promise.all([
      this.deps.backgroundWorkQueue.listActiveWork(companyId),
      this.deps.backgroundWorkQueue.listRecentWork(companyId, 5),
      this.deps.integrationSyncOrchestrator.getAllProviderSyncStatuses(companyId),
    ]);

    const itemsById = new Map<string, (typeof activeItems)[number]>();
    for (const item of [...recentItems, ...activeItems]) {
      itemsById.set(item.id, item);
    }

    const xeroAutoSync = autoSyncStatuses.find((entry) => entry.provider === 'xero');
    const integrationAutoSync = xeroAutoSync
      ? mapIntegrationAutoSyncUiStateToBackgroundWork(xeroAutoSync.uiState)
      : null;

    return {
      items: [...itemsById.values()],
      integrationAutoSync,
      generatedAt: new Date().toISOString(),
    };
  }

  async runIntegrationSync(input: {
    companyId: string;
    provider: AutoSyncProviderKey;
    trigger: 'initial' | 'incremental' | 'manual' | 'retry';
    userId?: string;
  }) {
    return this.deps.integrationSyncOrchestrator.runProviderSync(input);
  }

  publishDomainEvent(event: TenantDomainEvent): void {
    this.deps.domainEventBus.publish(event);
  }

  /**
   * Post-import hooks — CV-001 metrics refresh + two-way read verify queue.
   * Each hook is idempotent per syncJobId; they do not block one another.
   */
  async handleXeroImportJobSettled(input: XeroImportJobSettledInput): Promise<void> {
    await this.deps.integrationSyncOrchestrator.handleXeroImportJobSettled(input);

    if (!input.result.success) {
      return;
    }

    const recordsProcessed =
      input.result.contacts.pulledCount +
      input.result.invoices.pulledCount +
      input.result.payments.pulledCount +
      input.result.bankTransactions.pulledCount;

    const alreadyRefreshed =
      await this.deps.integrationSyncOrchestrator.hasCustomerValueMetricsRefreshedForJob(
        input.companyId,
        input.syncJobId,
      );

    if (!alreadyRefreshed) {
      await this.refreshCustomerValueMetricsAfterXeroImport({
        companyId: input.companyId,
        syncJobId: input.syncJobId,
        recordsProcessed,
      });
    }

    const verifyAlreadyQueued =
      await this.deps.integrationSyncOrchestrator.hasTwoWayReadVerifyQueuedForJob(
        input.companyId,
        input.syncJobId,
      );

    if (!verifyAlreadyQueued && this.deps.xeroTwoWayVerifyService) {
      await this.deps.xeroTwoWayVerifyService.queuePostImportVerification({
        companyId: input.companyId,
        syncJobId: input.syncJobId,
      });
      await this.deps.integrationSyncOrchestrator.markTwoWayReadVerifyQueued(
        input.companyId,
        input.syncJobId,
      );
    }
  }

  private async refreshCustomerValueMetricsAfterXeroImport(input: {
    companyId: string;
    syncJobId: string;
    recordsProcessed: number;
  }): Promise<void> {
    invalidateCustomerValueReadCaches(input.companyId);
    invalidateIntegrationReadCaches(input.companyId);
    invalidateDashboardFinanceCaches(input.companyId);
    invalidateBackgroundWorkReadCaches(input.companyId);

    const metrics = await this.deps.customerValueClassificationService.refreshValueMetrics(
      input.companyId,
    );

    await this.deps.integrationSyncOrchestrator.markCustomerValueMetricsRefreshed(
      input.companyId,
      input.syncJobId,
    );

    this.deps.domainEventBus.publish({
      companyId: input.companyId,
      eventType: 'xero.import.completed',
      entityType: 'integration_sync_job',
      entityId: input.syncJobId,
      idempotencyKey: `xero.import.completed:${input.syncJobId}`,
      payload: {
        syncJobId: input.syncJobId,
        recordsProcessed: input.recordsProcessed,
        dataCompleteness: metrics.dataCompleteness,
        customerRecords: metrics.totals.customerRecords,
        qualifyingCustomers: metrics.totals.qualifyingCustomers,
        payingCustomers:
          metrics.buckets.find(
            (bucket: { classification: string; count: number }) =>
              bucket.classification === 'paying_customer',
          )?.count ?? 0,
      },
    });
  }

  private async handleXeroImportCompleted(event: TenantDomainEvent): Promise<void> {
    invalidateCustomerValueReadCaches(event.companyId);
    invalidateIntegrationReadCaches(event.companyId);
    invalidateDashboardFinanceCaches(event.companyId);
    invalidateBackgroundWorkReadCaches(event.companyId);
  }

  private async handleLeadConverted(
    event: TenantDomainEvent,
    queue: BackgroundWorkQueueService,
  ): Promise<void> {
    invalidateBackgroundWorkReadCaches(event.companyId);
    invalidateIntegrationReadCaches(event.companyId);

    const jobId = event.payload.jobId as string | undefined;
    if (!jobId) {
      return;
    }

    await queue.enqueueDomainFollowup({
      companyId: event.companyId,
      workType: 'lead_conversion_dispatch',
      label: 'Lead conversion dispatch refresh',
      trigger: 'lead.converted',
      idempotencyKey: `lead.converted:${event.entityId}:${jobId}`,
      checkpoint: {
        stage: 'dispatch_refresh',
        metadata: {
          leadId: event.entityId,
          jobId,
          customerId: event.payload.customerId ?? null,
        },
      },
    });
  }

  private async handleJobCompleted(
    event: TenantDomainEvent,
    queue: BackgroundWorkQueueService,
  ): Promise<void> {
    invalidateBackgroundWorkReadCaches(event.companyId);

    if (this.deps.jobProfitabilityService) {
      try {
        await this.deps.jobProfitabilityService.recalculateJobProfitability(
          event.companyId,
          event.entityId,
          { includeSensitiveCosts: true },
        );
      } catch {
        // Profitability must not block completion follow-up when financial data is incomplete.
      }
    }

    await queue.enqueueDomainFollowup({
      companyId: event.companyId,
      workType: 'job_completion_followup',
      label: 'Job completion follow-up (snapshot, invoicing queue, job pack)',
      trigger: 'job.completed',
      idempotencyKey: `job.completed:${event.entityId}`,
      checkpoint: {
        stage: 'queued',
        metadata: {
          jobId: event.entityId,
          customerId: event.payload.customerId ?? null,
          stubbedStages: ['completion_snapshot', 'invoicing_queue', 'job_pack'],
        },
      },
    });
  }
}
