import { and, desc, eq } from 'drizzle-orm';
import type { NcEscalationSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { ncEscalations } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseNotificationEscalationService {
  constructor(private readonly db: DatabaseClient) {}

  async listEscalations(
    companyId: string,
    options?: { status?: string },
  ): Promise<NcEscalationSummary[]> {
    const rows = await this.db.query.ncEscalations.findMany({
      where: options?.status
        ? and(
            eq(ncEscalations.companyId, companyId),
            eq(
              ncEscalations.status,
              options.status as (typeof ncEscalations.status.enumValues)[number],
            ),
          )
        : eq(ncEscalations.companyId, companyId),
      orderBy: [desc(ncEscalations.createdAt)],
      limit: 200,
    });
    return rows.map(toEscalationSummary);
  }

  async createEscalation(
    companyId: string,
    input: {
      alertId: string;
      escalationStep?: number;
      escalateToType?: string;
      escalateToRef?: string;
      escalateAfterMinutes?: number;
    },
  ): Promise<NcEscalationSummary> {
    const [created] = await this.db
      .insert(ncEscalations)
      .values({
        companyId,
        alertId: input.alertId,
        escalationStep: input.escalationStep ?? 1,
        escalateToType: input.escalateToType ?? 'role',
        escalateToRef: input.escalateToRef ?? null,
        escalateAfterMinutes: input.escalateAfterMinutes ?? 30,
      })
      .returning();
    if (!created) throw new Error('Unable to create escalation');
    return toEscalationSummary(created);
  }

  async acknowledgeEscalation(
    scope: StaffScope,
    escalationId: string,
  ): Promise<NcEscalationSummary> {
    const [updated] = await this.db
      .update(ncEscalations)
      .set({
        status: 'acknowledged',
        acknowledgedByUserId: scope.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ncEscalations.id, escalationId), eq(ncEscalations.companyId, scope.companyId)))
      .returning();
    if (!updated) throw new Error('Escalation not found');
    return toEscalationSummary(updated);
  }

  async resolveEscalation(scope: StaffScope, escalationId: string): Promise<NcEscalationSummary> {
    const [updated] = await this.db
      .update(ncEscalations)
      .set({
        status: 'resolved',
        resolvedByUserId: scope.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ncEscalations.id, escalationId), eq(ncEscalations.companyId, scope.companyId)))
      .returning();
    if (!updated) throw new Error('Escalation not found');
    return toEscalationSummary(updated);
  }

  async processPendingEscalations(companyId: string): Promise<NcEscalationSummary[]> {
    const pending = await this.db.query.ncEscalations.findMany({
      where: and(eq(ncEscalations.companyId, companyId), eq(ncEscalations.status, 'pending')),
    });
    const now = new Date();
    const escalated: NcEscalationSummary[] = [];
    for (const row of pending) {
      const dueAt = new Date(row.createdAt.getTime() + row.escalateAfterMinutes * 60_000);
      if (dueAt <= now) {
        const [updated] = await this.db
          .update(ncEscalations)
          .set({ status: 'escalated', escalatedAt: now, updatedAt: now })
          .where(eq(ncEscalations.id, row.id))
          .returning();
        if (updated) escalated.push(toEscalationSummary(updated));
      }
    }
    return escalated;
  }
}

function toEscalationSummary(row: typeof ncEscalations.$inferSelect): NcEscalationSummary {
  return {
    id: row.id,
    alertId: row.alertId,
    escalationStep: row.escalationStep,
    status: row.status,
    escalateToType: row.escalateToType,
    escalateToRef: row.escalateToRef,
    escalateAfterMinutes: row.escalateAfterMinutes,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
