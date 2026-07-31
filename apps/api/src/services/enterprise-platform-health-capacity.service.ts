import { and, count, desc, eq, gte } from 'drizzle-orm';
import type { PhCapacitySnapshotSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiUsageRecords,
  automationQueueJobs,
  integrationRequestLogs,
  phCapacitySnapshots,
  sessions,
  users,
} from '@titan/db';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

export class EnterprisePlatformHealthCapacityService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly productionReadinessService: EnterpriseProductionReadinessService,
    private readonly enterpriseSaasPlatformService: EnterpriseSaasPlatformService,
  ) {}

  async getLatestSnapshot(companyId: string): Promise<PhCapacitySnapshotSummary | null> {
    const row = await this.db.query.phCapacitySnapshots.findFirst({
      where: eq(phCapacitySnapshots.companyId, companyId),
      orderBy: [desc(phCapacitySnapshots.capturedAt)],
    });
    return row ? toCapacitySummary(row) : null;
  }

  async captureCapacitySnapshot(companyId: string): Promise<PhCapacitySnapshotSummary> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      performance,
      aiUsage,
      apiRequests,
      queueJobs,
      activeUsers,
      activeSessions,
      priorSnapshots,
      isPlatformOwner,
    ] = await Promise.all([
      this.productionReadinessService.getDashboard(companyId).then((d) => d.performance),
      this.db
        .select({ count: count() })
        .from(aiUsageRecords)
        .where(
          and(eq(aiUsageRecords.companyId, companyId), gte(aiUsageRecords.recordedAt, since24h)),
        ),
      this.db
        .select({ count: count() })
        .from(integrationRequestLogs)
        .where(
          and(
            eq(integrationRequestLogs.companyId, companyId),
            gte(integrationRequestLogs.createdAt, since24h),
          ),
        ),
      this.db.query.automationQueueJobs.findMany({
        where: eq(automationQueueJobs.companyId, companyId),
        columns: { id: true, status: true },
        limit: 500,
      }),
      this.db.select({ count: count() }).from(users).where(eq(users.companyId, companyId)),
      this.db
        .select({ count: count() })
        .from(sessions)
        .where(and(eq(sessions.companyId, companyId), gte(sessions.createdAt, since24h))),
      this.db.query.phCapacitySnapshots.findMany({
        where: eq(phCapacitySnapshots.companyId, companyId),
        orderBy: [desc(phCapacitySnapshots.capturedAt)],
        limit: 7,
      }),
      this.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId),
    ]);

    const aiUsageCount = aiUsage[0]?.count ?? 0;
    const apiRequestCount = apiRequests[0]?.count ?? 0;
    const backgroundJobLoad = queueJobs.filter(
      (j) => j.status === 'pending' || j.status === 'running',
    ).length;
    const storageUsageMb = performance?.memoryUsageMb ?? null;
    const queueGrowthCount = queueJobs.length;

    const priorAiAvg =
      priorSnapshots.length > 0
        ? priorSnapshots.reduce((sum, s) => sum + s.aiUsageCount, 0) / priorSnapshots.length
        : aiUsageCount;
    const growthRate = priorAiAvg > 0 ? (aiUsageCount - priorAiAvg) / priorAiAvg : 0;

    const forecast = {
      projectedAiUsage24h: Math.round(aiUsageCount * (1 + Math.max(growthRate, 0))),
      projectedApiRequests24h: Math.round(apiRequestCount * 1.1),
      projectedQueueLoad: Math.round(backgroundJobLoad * (1 + Math.max(growthRate, 0))),
      trend: growthRate > 0.2 ? 'growing' : growthRate < -0.2 ? 'declining' : 'stable',
    };

    const [created] = await this.db
      .insert(phCapacitySnapshots)
      .values({
        companyId,
        storageUsageMb,
        databaseGrowthMb: null,
        aiUsageCount,
        apiRequestCount,
        queueGrowthCount,
        activeTenantCount: isPlatformOwner ? 1 : 1,
        activeUserCount: activeUsers[0]?.count ?? 0,
        backgroundJobLoad,
        forecast,
        metrics: {
          activeSessionCount24h: activeSessions[0]?.count ?? 0,
          heapUsageMb: performance?.memoryUsageMb ?? null,
        },
      })
      .returning();

    return toCapacitySummary(created!);
  }
}

function toCapacitySummary(
  row: typeof phCapacitySnapshots.$inferSelect,
): PhCapacitySnapshotSummary {
  return {
    id: row.id,
    storageUsageMb: row.storageUsageMb,
    databaseGrowthMb: row.databaseGrowthMb,
    aiUsageCount: row.aiUsageCount,
    apiRequestCount: row.apiRequestCount,
    queueGrowthCount: row.queueGrowthCount,
    activeTenantCount: row.activeTenantCount,
    activeUserCount: row.activeUserCount,
    backgroundJobLoad: row.backgroundJobLoad,
    forecast: row.forecast ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}
