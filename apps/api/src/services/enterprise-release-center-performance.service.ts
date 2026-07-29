import { eq } from 'drizzle-orm';
import type { RcPerformanceSnapshotSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rcPerformanceSnapshots } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseReleaseCenterPerformanceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly productionReadinessService: import('./enterprise-production-readiness.service.js').EnterpriseProductionReadinessService,
    private readonly platformHealthService: import('./enterprise-platform-health.service.js').EnterprisePlatformHealthService,
    private readonly globalSearchService: import('./enterprise-global-search.service.js').EnterpriseGlobalSearchService,
  ) {}

  async getLatestSnapshot(companyId: string): Promise<RcPerformanceSnapshotSummary | null> {
    const row = await this.db.query.rcPerformanceSnapshots.findFirst({
      where: eq(rcPerformanceSnapshots.companyId, companyId),
      orderBy: (s, { desc }) => [desc(s.capturedAt)],
    });
    return row ? toSnapshotSummary(row) : null;
  }

  async capturePerformanceSnapshot(scope: StaffScope): Promise<RcPerformanceSnapshotSummary> {
    const [productionDashboard, healthDashboard, searchDashboard] = await Promise.all([
      this.productionReadinessService.getDashboard(scope.companyId),
      this.platformHealthService.getDashboard(scope.companyId),
      this.globalSearchService.getDashboard(scope.companyId).catch(() => null),
    ]);

    const performance = productionDashboard.performance;
    const opportunities: Array<Record<string, unknown>> = [];

    if ((performance?.slowEndpointCount ?? 0) > 0) {
      opportunities.push({
        type: 'slow_api_endpoints',
        severity: 'warning',
        count: performance?.slowEndpointCount ?? 0,
        recommendation: 'Review slow API endpoints identified in production readiness monitoring.',
      });
    }
    if ((performance?.queueDepth ?? 0) > 10) {
      opportunities.push({
        type: 'queue_processing',
        severity: 'warning',
        count: performance?.queueDepth ?? 0,
        recommendation: 'Investigate background job queue depth and worker capacity.',
      });
    }
    if ((performance?.backgroundJobFailureCount ?? 0) > 0) {
      opportunities.push({
        type: 'background_jobs',
        severity: 'high',
        count: performance?.backgroundJobFailureCount ?? 0,
        recommendation: 'Review failed background jobs in automation queue.',
      });
    }
    if ((healthDashboard.performanceInsights?.length ?? 0) > 0) {
      opportunities.push({
        type: 'platform_health_insights',
        severity: 'info',
        count: healthDashboard.performanceInsights.length,
        recommendation: 'Review platform health performance insights for optimization targets.',
      });
    }
    if ((searchDashboard?.searchHealth.indexedCount ?? 0) === 0 && searchDashboard) {
      opportunities.push({
        type: 'search_performance',
        severity: 'warning',
        recommendation: 'Global search index is empty — verify search indexing pipeline.',
      });
    }
    opportunities.push({
      type: 'frontend_bundle',
      severity: 'info',
      recommendation: 'Review web bundle size via production build output; consider code-splitting for large dashboards.',
    });

    const snapshotKey = `perf_${Date.now()}`;
    const [created] = await this.db
      .insert(rcPerformanceSnapshots)
      .values({
        companyId: scope.companyId,
        snapshotKey,
        slowEndpointCount: performance?.slowEndpointCount ?? 0,
        slowQueryCount: 0,
        queueDepth: performance?.queueDepth ?? 0,
        aiLatencyMs: performance?.aiProviderLatencyMs ?? null,
        searchIndexCount: searchDashboard?.searchHealth.indexedCount ?? 0,
        optimizationOpportunities: opportunities,
        metrics: {
          apiP95LatencyMs: performance?.apiP95LatencyMs ?? null,
          backgroundJobFailureCount: performance?.backgroundJobFailureCount ?? 0,
          note: 'Read-only performance analysis — no destructive optimization applied.',
        },
      })
      .returning();

    return toSnapshotSummary(created!);
  }
}

function toSnapshotSummary(row: typeof rcPerformanceSnapshots.$inferSelect): RcPerformanceSnapshotSummary {
  return {
    id: row.id,
    snapshotKey: row.snapshotKey,
    slowEndpointCount: row.slowEndpointCount,
    slowQueryCount: row.slowQueryCount,
    queueDepth: row.queueDepth,
    aiLatencyMs: row.aiLatencyMs,
    searchIndexCount: row.searchIndexCount,
    dashboardLoadMs: row.dashboardLoadMs,
    optimizationOpportunities: (row.optimizationOpportunities ?? []) as Array<Record<string, unknown>>,
    capturedAt: row.capturedAt.toISOString(),
  };
}
