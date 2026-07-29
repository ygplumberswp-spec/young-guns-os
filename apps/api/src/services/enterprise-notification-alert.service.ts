import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateNcAlertRequest,
  NcAlertSummary,
  NcModuleSource,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { ncAlerts } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseNotificationAlertService {
  constructor(private readonly db: DatabaseClient) {}

  async listAlerts(companyId: string, options?: { status?: string }): Promise<NcAlertSummary[]> {
    const rows = await this.db.query.ncAlerts.findMany({
      where: options?.status
        ? and(eq(ncAlerts.companyId, companyId), eq(ncAlerts.status, options.status as typeof ncAlerts.status.enumValues[number]))
        : eq(ncAlerts.companyId, companyId),
      orderBy: [desc(ncAlerts.createdAt)],
      limit: 200,
    });
    return rows.map(toAlertSummary);
  }

  async createAlert(scope: StaffScope, input: CreateNcAlertRequest): Promise<NcAlertSummary> {
    const [created] = await this.db
      .insert(ncAlerts)
      .values({
        companyId: scope.companyId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        alertLevel: input.alertLevel ?? 'info',
        moduleSource: input.moduleSource ?? null,
        eventType: input.eventType?.trim() ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning();
    if (!created) throw new Error('Unable to create alert');
    return toAlertSummary(created);
  }

  async acknowledgeAlert(scope: StaffScope, alertId: string): Promise<NcAlertSummary> {
    const [updated] = await this.db
      .update(ncAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedByUserId: scope.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ncAlerts.id, alertId), eq(ncAlerts.companyId, scope.companyId)))
      .returning();
    if (!updated) throw new Error('Alert not found');
    return toAlertSummary(updated);
  }

  async resolveAlert(scope: StaffScope, alertId: string): Promise<NcAlertSummary> {
    const [updated] = await this.db
      .update(ncAlerts)
      .set({
        status: 'resolved',
        resolvedByUserId: scope.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ncAlerts.id, alertId), eq(ncAlerts.companyId, scope.companyId)))
      .returning();
    if (!updated) throw new Error('Alert not found');
    return toAlertSummary(updated);
  }

  async expireStaleAlerts(companyId: string): Promise<number> {
    const rows = await this.db.query.ncAlerts.findMany({
      where: and(eq(ncAlerts.companyId, companyId), eq(ncAlerts.status, 'open')),
    });
    const now = new Date();
    let expired = 0;
    for (const row of rows) {
      if (row.expiresAt && row.expiresAt <= now) {
        await this.db
          .update(ncAlerts)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(ncAlerts.id, row.id));
        expired += 1;
      }
    }
    return expired;
  }
}

function toAlertSummary(row: typeof ncAlerts.$inferSelect): NcAlertSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    alertLevel: row.alertLevel,
    status: row.status,
    moduleSource: row.moduleSource as NcModuleSource | null,
    eventType: row.eventType,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    assignedUserId: row.assignedUserId,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
