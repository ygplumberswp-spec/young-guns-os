import type {
  AutoSyncProviderKey,
  TenantBackgroundWorkStatusResponse,
  TenantDomainEvent,
} from '@titan/shared';
import { mapIntegrationAutoSyncUiStateToBackgroundWork } from '@titan/shared';
import type { BackgroundWorkQueueService } from './background-work-queue.service.js';
import type { IntegrationSyncOrchestratorService } from './integration-sync-orchestrator.service.js';
import type { TenantDomainEventBus } from './tenant-domain-event-bus.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import {
  invalidateBackgroundWorkReadCaches,
  invalidateIntegrationReadCaches,
} from './api-read-cache.js';

export type BackgroundWorkOrchestratorDeps = {
  integrationSyncOrchestrator: IntegrationSyncOrchestratorService;
  backgroundWorkQueue: BackgroundWorkQueueService;
  domainEventBus: TenantDomainEventBus;
  xeroSyncService: XeroSyncService;
};

export class BackgroundWorkOrchestratorService {
  constructor(private readonly deps: BackgroundWorkOrchestratorDeps) {}

  registerDomainEventHandlers(): void {
    const { domainEventBus, backgroundWorkQueue } = this.deps;

    domainEventBus.subscribe('lead.converted', async (event) => {
      await this.handleLeadConverted(event, backgroundWorkQueue);
    });

    domainEventBus.subscribe('job.completed', async (event) => {
      await this.handleJobCompleted(event, backgroundWorkQueue);
    });

    domainEventBus.subscribe('job.scheduled', async (event) => {
      invalidateBackgroundWorkReadCaches(event.companyId);
    });
  }

  async processTick(): Promise<{
    integrationJobsProcessed: number;
    scheduledSyncs: { processed: number; skipped: number; errors: number };
    domainFollowupsPending: number;
  }> {
    const scheduledSyncs = await this.deps.integrationSyncOrchestrator.runScheduledSyncs();
    const domainFollowupsPending =
      await this.deps.backgroundWorkQueue.processPendingDomainFollowups();

    return {
      integrationJobsProcessed: scheduledSyncs.processed,
      scheduledSyncs,
      domainFollowupsPending,
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
