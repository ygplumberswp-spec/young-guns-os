import { and, desc, eq } from 'drizzle-orm';
import type {
  MobilePendingActionSummary,
  MobileSyncProcessResult,
  MobileSyncQueueSummary,
  MobileSyncScope,
  MobileSyncStateSummary,
  QueueMobileSyncRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { mobilePendingActions, mobileSyncQueue, mobileSyncState } from '@titan/db';

export class MobileSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MobileSyncError';
  }
}

type StaffSyncScope = {
  companyId: string;
  userId: string;
  scope: MobileSyncScope;
};

type PortalSyncScope = {
  companyId: string;
  portalUserId: string;
  scope: MobileSyncScope;
};

const MAX_SYNC_RETRIES = 3;

export class MobileSyncService {
  constructor(private readonly db: DatabaseClient) {}

  async getStaffSyncState(input: StaffSyncScope, deviceId?: string): Promise<MobileSyncStateSummary> {
    const row = await this.findOrCreateStaffState(input, deviceId);
    return toSyncStateSummary(row);
  }

  async getPortalSyncState(input: PortalSyncScope, deviceId?: string): Promise<MobileSyncStateSummary> {
    const row = await this.findOrCreatePortalState(input, deviceId);
    return toSyncStateSummary(row);
  }

  async touchStaffSync(input: StaffSyncScope, deviceId?: string): Promise<MobileSyncStateSummary> {
    const existing = await this.findOrCreateStaffState(input, deviceId);
    const [updated] = await this.db
      .update(mobileSyncState)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date(), deviceId: deviceId ?? existing.deviceId })
      .where(eq(mobileSyncState.id, existing.id))
      .returning();

    return toSyncStateSummary(updated!);
  }

  async touchPortalSync(input: PortalSyncScope, deviceId?: string): Promise<MobileSyncStateSummary> {
    const existing = await this.findOrCreatePortalState(input, deviceId);
    const [updated] = await this.db
      .update(mobileSyncState)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date(), deviceId: deviceId ?? existing.deviceId })
      .where(eq(mobileSyncState.id, existing.id))
      .returning();

    return toSyncStateSummary(updated!);
  }

  async queueStaffSyncItem(
    input: StaffSyncScope,
    request: QueueMobileSyncRequest,
  ): Promise<MobileSyncQueueSummary> {
    const [created] = await this.db
      .insert(mobileSyncQueue)
      .values({
        companyId: input.companyId,
        userId: input.userId,
        scope: request.scope,
        resourceType: request.resourceType,
        resourceId: request.resourceId ?? null,
        payload: request.payload ?? {},
        status: 'pending',
      })
      .returning();

    return toQueueSummary(created!);
  }

  async queuePortalSyncItem(
    input: PortalSyncScope,
    request: QueueMobileSyncRequest,
  ): Promise<MobileSyncQueueSummary> {
    const [created] = await this.db
      .insert(mobileSyncQueue)
      .values({
        companyId: input.companyId,
        portalUserId: input.portalUserId,
        scope: request.scope,
        resourceType: request.resourceType,
        resourceId: request.resourceId ?? null,
        payload: request.payload ?? {},
        status: 'pending',
      })
      .returning();

    return toQueueSummary(created!);
  }

  async listStaffPendingActions(companyId: string, userId: string): Promise<MobilePendingActionSummary[]> {
    const rows = await this.db.query.mobilePendingActions.findMany({
      where: and(
        eq(mobilePendingActions.companyId, companyId),
        eq(mobilePendingActions.userId, userId),
        eq(mobilePendingActions.status, 'pending'),
      ),
      orderBy: [desc(mobilePendingActions.createdAt)],
      limit: 50,
    });

    return rows.map(toPendingActionSummary);
  }

  async listStaffSyncQueue(companyId: string, userId: string): Promise<MobileSyncQueueSummary[]> {
    const rows = await this.db.query.mobileSyncQueue.findMany({
      where: and(
        eq(mobileSyncQueue.companyId, companyId),
        eq(mobileSyncQueue.userId, userId),
        eq(mobileSyncQueue.status, 'pending'),
      ),
      orderBy: [desc(mobileSyncQueue.queuedAt)],
      limit: 50,
    });

    return rows.map(toQueueSummary);
  }

  async createPendingAction(input: {
    companyId: string;
    userId: string;
    actionType: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }): Promise<MobilePendingActionSummary> {
    const [created] = await this.db
      .insert(mobilePendingActions)
      .values({
        companyId: input.companyId,
        userId: input.userId,
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload ?? {},
        status: 'pending',
      })
      .returning();

    return toPendingActionSummary(created!);
  }

  async markPendingAction(
    actionId: string,
    status: 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    await this.db
      .update(mobilePendingActions)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        processedAt: new Date(),
      })
      .where(eq(mobilePendingActions.id, actionId));
  }

  async processStaffSyncQueue(companyId: string, userId: string): Promise<MobileSyncProcessResult> {
    const rows = await this.db.query.mobileSyncQueue.findMany({
      where: and(
        eq(mobileSyncQueue.companyId, companyId),
        eq(mobileSyncQueue.userId, userId),
        eq(mobileSyncQueue.status, 'pending'),
      ),
      orderBy: [desc(mobileSyncQueue.queuedAt)],
      limit: 25,
    });

    let processed = 0;
    let failed = 0;
    let retried = 0;
    let conflicts = 0;

    for (const row of rows) {
      await this.db
        .update(mobileSyncQueue)
        .set({ status: 'processing' })
        .where(eq(mobileSyncQueue.id, row.id));

      try {
        if (row.clientVersion && row.resourceId) {
          const serverVersion = row.processedAt?.toISOString() ?? row.queuedAt.toISOString();
          if (row.clientVersion !== serverVersion) {
            conflicts += 1;
            await this.db
              .update(mobileSyncQueue)
              .set({
                status: 'failed',
                errorMessage: 'Version conflict — requires manual resolution',
              })
              .where(eq(mobileSyncQueue.id, row.id));
            continue;
          }
        }

        await this.db
          .update(mobileSyncQueue)
          .set({
            status: 'completed',
            processedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(mobileSyncQueue.id, row.id));
        processed += 1;
      } catch (error) {
        const nextRetry = (row.retryCount ?? 0) + 1;
        if (nextRetry < MAX_SYNC_RETRIES) {
          await this.db
            .update(mobileSyncQueue)
            .set({
              status: 'pending',
              retryCount: nextRetry,
              errorMessage: error instanceof Error ? error.message : 'Sync failed',
            })
            .where(eq(mobileSyncQueue.id, row.id));
          retried += 1;
        } else {
          await this.db
            .update(mobileSyncQueue)
            .set({
              status: 'failed',
              retryCount: nextRetry,
              errorMessage: error instanceof Error ? error.message : 'Sync failed after retries',
              processedAt: new Date(),
            })
            .where(eq(mobileSyncQueue.id, row.id));
          failed += 1;
        }
      }
    }

    return { processed, failed, conflicts, retried };
  }

  private async findOrCreateStaffState(input: StaffSyncScope, deviceId?: string) {
    const existing = await this.db.query.mobileSyncState.findFirst({
      where: and(
        eq(mobileSyncState.companyId, input.companyId),
        eq(mobileSyncState.userId, input.userId),
        eq(mobileSyncState.scope, input.scope),
      ),
    });

    if (existing) return existing;

    const [created] = await this.db
      .insert(mobileSyncState)
      .values({
        companyId: input.companyId,
        userId: input.userId,
        scope: input.scope,
        deviceId: deviceId ?? null,
      })
      .returning();

    return created!;
  }

  private async findOrCreatePortalState(input: PortalSyncScope, deviceId?: string) {
    const existing = await this.db.query.mobileSyncState.findFirst({
      where: and(
        eq(mobileSyncState.companyId, input.companyId),
        eq(mobileSyncState.portalUserId, input.portalUserId),
        eq(mobileSyncState.scope, input.scope),
      ),
    });

    if (existing) return existing;

    const [created] = await this.db
      .insert(mobileSyncState)
      .values({
        companyId: input.companyId,
        portalUserId: input.portalUserId,
        scope: input.scope,
        deviceId: deviceId ?? null,
      })
      .returning();

    return created!;
  }
}

function toSyncStateSummary(row: typeof mobileSyncState.$inferSelect): MobileSyncStateSummary {
  return {
    scope: row.scope,
    deviceId: row.deviceId,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQueueSummary(row: typeof mobileSyncQueue.$inferSelect): MobileSyncQueueSummary {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    status: row.status,
    queuedAt: row.queuedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    retryCount: row.retryCount ?? 0,
    errorMessage: row.errorMessage ?? null,
  };
}

function toPendingActionSummary(row: typeof mobilePendingActions.$inferSelect): MobilePendingActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    status: row.status,
    payload: row.payload ?? {},
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}
