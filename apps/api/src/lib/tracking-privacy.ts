import type { DatabaseClient } from '@titan/db';
import { mobileActionLogs } from '@titan/db';
import { and, desc, eq } from 'drizzle-orm';

const TRACKING_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export async function getActiveEnRouteTracking(
  db: DatabaseClient,
  companyId: string,
  jobId: string,
): Promise<{ startedAt: Date; technicianUserId: string } | null> {
  const enRoute = await db.query.mobileActionLogs.findFirst({
    where: and(
      eq(mobileActionLogs.companyId, companyId),
      eq(mobileActionLogs.entityType, 'job'),
      eq(mobileActionLogs.entityId, jobId),
      eq(mobileActionLogs.actionType, 'mark_en_route'),
    ),
    orderBy: [desc(mobileActionLogs.createdAt)],
  });

  if (!enRoute?.userId) return null;

  const arrived = await db.query.mobileActionLogs.findFirst({
    where: and(
      eq(mobileActionLogs.companyId, companyId),
      eq(mobileActionLogs.entityType, 'job'),
      eq(mobileActionLogs.entityId, jobId),
      eq(mobileActionLogs.actionType, 'mark_arrived'),
    ),
    orderBy: [desc(mobileActionLogs.createdAt)],
  });

  if (arrived && arrived.createdAt >= enRoute.createdAt) {
    return null;
  }

  if (Date.now() - enRoute.createdAt.getTime() > TRACKING_TIMEOUT_MS) {
    return null;
  }

  return { startedAt: enRoute.createdAt, technicianUserId: enRoute.userId };
}

export function buildCustomerTrackingProgress(
  startedAt: Date,
  etaAt: string | null,
): number | null {
  if (!etaAt) return null;
  const etaMs = new Date(etaAt).getTime();
  const startMs = startedAt.getTime();
  const now = Date.now();
  if (etaMs <= startMs) return 100;
  const progress = ((now - startMs) / (etaMs - startMs)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}
