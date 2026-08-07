import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  BackgroundWorkCheckpoint,
  BackgroundWorkItemSummary,
  BackgroundWorkKind,
  BackgroundWorkUiState,
} from '@titan/shared';
import {
  BACKGROUND_WORK_UI_STATE_LABELS,
  deriveBackgroundWorkUiState,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { integrationSyncJobs } from '@titan/db';

const ACTIVE_STATUSES = ['pending', 'running'] as const;

export type EnqueueBackgroundWorkInput = {
  companyId: string;
  workType: string;
  kind?: BackgroundWorkKind;
  label: string;
  checkpoint?: BackgroundWorkCheckpoint;
  trigger?: string;
  idempotencyKey?: string;
};

export class BackgroundWorkQueueService {
  constructor(private readonly db: DatabaseClient) {}

  async listActiveWork(companyId: string): Promise<BackgroundWorkItemSummary[]> {
    const rows = await this.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        inArray(integrationSyncJobs.status, [...ACTIVE_STATUSES]),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit: 20,
    });

    return rows.map((row) => this.mapSyncJob(row));
  }

  async listRecentWork(companyId: string, limit = 10): Promise<BackgroundWorkItemSummary[]> {
    const rows = await this.db.query.integrationSyncJobs.findMany({
      where: eq(integrationSyncJobs.companyId, companyId),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit,
    });

    return rows.map((row) => this.mapSyncJob(row));
  }

  async getWorkItem(companyId: string, workId: string): Promise<BackgroundWorkItemSummary | null> {
    const row = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.id, workId),
        eq(integrationSyncJobs.companyId, companyId),
      ),
    });

    return row ? this.mapSyncJob(row) : null;
  }

  async enqueueDomainFollowup(input: EnqueueBackgroundWorkInput): Promise<string | null> {
    if (input.idempotencyKey) {
      const duplicate = await this.findDuplicate(input.companyId, input.idempotencyKey);
      if (duplicate) {
        return duplicate.id;
      }
    }

    const [row] = await this.db
      .insert(integrationSyncJobs)
      .values({
        companyId: input.companyId,
        provider: 'custom',
        jobType: 'scheduled',
        status: 'pending',
        syncScope: `domain:${input.workType}`,
        resultSummary: {
          kind: input.kind ?? 'domain_followup',
          workType: input.workType,
          label: input.label,
          checkpoint: input.checkpoint ?? { stage: 'queued' },
          trigger: input.trigger ?? 'domain_event',
          idempotencyKey: input.idempotencyKey,
        },
      })
      .returning({ id: integrationSyncJobs.id });

    return row?.id ?? null;
  }

  async markWorkRunning(workId: string): Promise<void> {
    await this.db
      .update(integrationSyncJobs)
      .set({ status: 'running' })
      .where(eq(integrationSyncJobs.id, workId));
  }

  async markWorkCompleted(
    workId: string,
    summary: Record<string, unknown>,
    recordsProcessed = 0,
  ): Promise<void> {
    const row = await this.db.query.integrationSyncJobs.findFirst({
      where: eq(integrationSyncJobs.id, workId),
    });
    if (!row) {
      return;
    }

    await this.db
      .update(integrationSyncJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        resultSummary: {
          ...(row.resultSummary ?? {}),
          ...summary,
          recordsProcessed,
        },
      })
      .where(eq(integrationSyncJobs.id, workId));
  }

  async markWorkFailed(workId: string, message: string): Promise<void> {
    await this.db
      .update(integrationSyncJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message,
      })
      .where(eq(integrationSyncJobs.id, workId));
  }

  async processPendingDomainFollowups(limit = 10): Promise<number> {
    const rows = await this.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.provider, 'custom'),
        eq(integrationSyncJobs.status, 'pending'),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit,
    });

    return rows.length;
  }

  private async findDuplicate(companyId: string, idempotencyKey: string) {
    const rows = await this.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        inArray(integrationSyncJobs.status, ['pending', 'running', 'completed']),
      ),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit: 5,
    });

    return (
      rows.find((row) => {
        const summary = row.resultSummary as Record<string, unknown> | null;
        return summary?.idempotencyKey === idempotencyKey;
      }) ?? null
    );
  }

  private mapSyncJob(row: typeof integrationSyncJobs.$inferSelect): BackgroundWorkItemSummary {
    const summary = (row.resultSummary ?? {}) as Record<string, unknown>;
    const checkpoint = (summary.checkpoint as BackgroundWorkCheckpoint | undefined) ?? null;
    const completedStages = Array.isArray(summary.completedStages)
      ? (summary.completedStages as string[])
      : checkpoint?.completedStages;
    const hasPartialProgress = Boolean(
      completedStages?.length ||
        (typeof summary.contacts === 'object' && summary.contacts !== null) ||
        checkpoint?.pagesProcessed,
    );

    const uiState = this.deriveUiState(row, hasPartialProgress);
    const kind = (summary.kind as BackgroundWorkKind | undefined) ?? this.inferKind(row);
    const workType =
      (summary.workType as string | undefined) ??
      row.syncScope ??
      `${row.provider}:${row.jobType}`;

    return {
      id: row.id,
      kind,
      workType,
      uiState,
      uiStateLabel: BACKGROUND_WORK_UI_STATE_LABELS[uiState],
      label:
        (summary.label as string | undefined) ??
        `${row.provider} ${row.syncScope ?? row.jobType}`,
      message: row.errorMessage ?? (summary.stageError as string | undefined) ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      updatedAt: row.createdAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      retryAt: (summary.nextRetryAt as string | undefined) ?? null,
      checkpoint: checkpoint
        ? {
            ...checkpoint,
            completedStages,
          }
        : null,
      recordsProcessed:
        typeof summary.recordsProcessed === 'number'
          ? summary.recordsProcessed
          : null,
      lastError: row.errorMessage ?? null,
    };
  }

  private inferKind(row: typeof integrationSyncJobs.$inferSelect): BackgroundWorkKind {
    if (row.provider === 'custom') {
      return row.syncScope?.startsWith('domain:') ? 'domain_followup' : 'internal_workflow';
    }
    return 'integration_sync';
  }

  private deriveUiState(
    row: typeof integrationSyncJobs.$inferSelect,
    hasPartialProgress: boolean,
  ): BackgroundWorkUiState {
    const summary = (row.resultSummary ?? {}) as Record<string, unknown>;
    const status =
      row.status === 'pending' ? 'queued' : (row.status as 'running' | 'completed' | 'failed' | 'cancelled');

    return deriveBackgroundWorkUiState({
      status,
      hasPartialProgress,
      consecutiveFailures:
        typeof summary.consecutiveFailures === 'number' ? summary.consecutiveFailures : undefined,
      retryAt: typeof summary.nextRetryAt === 'string' ? summary.nextRetryAt : null,
      reconnectRequired: Boolean(summary.reconnectRequired),
      providerUnavailable: Boolean(summary.providerUnavailable),
      lastSuccessAt: row.completedAt?.toISOString() ?? null,
    });
  }
}
