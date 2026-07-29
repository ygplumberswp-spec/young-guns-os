import { desc, eq } from 'drizzle-orm';
import type { PhInsightSeverity, PhPerformanceInsightSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { phPerformanceInsights } from '@titan/db';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';

export class EnterprisePlatformHealthPerformanceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly productionReadinessService: EnterpriseProductionReadinessService,
    private readonly itOperationsService: EnterpriseItOperationsService,
  ) {}

  async listInsights(companyId: string): Promise<PhPerformanceInsightSummary[]> {
    const rows = await this.db.query.phPerformanceInsights.findMany({
      where: eq(phPerformanceInsights.companyId, companyId),
      orderBy: [desc(phPerformanceInsights.createdAt)],
      limit: 100,
    });
    return rows.map(toInsightSummary);
  }

  async generateInsights(companyId: string): Promise<PhPerformanceInsightSummary[]> {
    const [productionDashboard, monitoring] = await Promise.all([
      this.productionReadinessService.getDashboard(companyId),
      this.itOperationsService.getOperationsMonitoring(companyId),
    ]);

    const insights: PhPerformanceInsightSummary[] = [];
    const performance = productionDashboard.performance;

    if (performance?.apiP95LatencyMs && performance.apiP95LatencyMs > 500) {
      insights.push(
        await this.insertInsight(companyId, {
          insightType: 'slow_api',
          severity: performance.apiP95LatencyMs > 2000 ? 'critical' : 'warning',
          title: 'Elevated API latency detected',
          description: `P95 API latency is ${performance.apiP95LatencyMs}ms`,
          sourceModule: 'api',
          metricValue: performance.apiP95LatencyMs,
          thresholdValue: 500,
          recommendation: 'Review slow endpoints and database query performance',
        }),
      );
    }

    if (performance && performance.queueDepth > 50) {
      insights.push(
        await this.insertInsight(companyId, {
          insightType: 'queue_backlog',
          severity: performance.queueDepth > 200 ? 'critical' : 'warning',
          title: 'Background queue backlog',
          description: `${performance.queueDepth} job(s) in queue`,
          sourceModule: 'background_workers',
          metricValue: performance.queueDepth,
          thresholdValue: 50,
          recommendation: 'Scale background workers or investigate stuck jobs',
        }),
      );
    }

    if (performance && performance.backgroundJobFailureCount > 0) {
      insights.push(
        await this.insertInsight(companyId, {
          insightType: 'failed_automations',
          severity: performance.backgroundJobFailureCount > 10 ? 'critical' : 'warning',
          title: 'Failed background jobs detected',
          description: `${performance.backgroundJobFailureCount} failed job(s)`,
          sourceModule: 'automation',
          metricValue: performance.backgroundJobFailureCount,
          thresholdValue: 0,
          recommendation: 'Review failed automation and workflow runs',
        }),
      );
    }

    for (const provider of productionDashboard.aiProviders) {
      if (provider.averageLatencyMs && provider.averageLatencyMs > 3000) {
        insights.push(
          await this.insertInsight(companyId, {
            insightType: 'ai_latency',
            severity: 'warning',
            title: `Slow AI provider: ${provider.providerKey}`,
            description: `Average latency ${provider.averageLatencyMs}ms`,
            sourceModule: 'ai_provider',
            metricValue: provider.averageLatencyMs,
            thresholdValue: 3000,
            recommendation: 'Consider provider failover or request batching',
          }),
        );
      }
    }

    for (const module of productionDashboard.systemHealth.filter((m) => m.status === 'degraded' || m.status === 'unhealthy')) {
      insights.push(
        await this.insertInsight(companyId, {
          insightType: 'degraded_service',
          severity: module.status === 'unhealthy' ? 'critical' : 'warning',
          title: `Degraded service: ${module.moduleKey}`,
          description: `${module.moduleKey} is ${module.status}`,
          sourceModule: module.moduleKey,
          recommendation: 'Investigate service health and recent deployments',
        }),
      );
    }

    if (monitoring.failedDeploymentCount > 0) {
      insights.push(
        await this.insertInsight(companyId, {
          insightType: 'failed_deployment',
          severity: 'critical',
          title: 'Failed deployments detected',
          description: `${monitoring.failedDeploymentCount} failed deployment(s)`,
          sourceModule: 'backend',
          metricValue: monitoring.failedDeploymentCount,
          recommendation: 'Review deployment logs and rollback if necessary',
        }),
      );
    }

    return insights;
  }

  private async insertInsight(
    companyId: string,
    input: {
      insightType: string;
      severity: PhInsightSeverity;
      title: string;
      description?: string;
      sourceModule?: string;
      metricValue?: number;
      thresholdValue?: number;
      recommendation?: string;
    },
  ): Promise<PhPerformanceInsightSummary> {
    const [created] = await this.db
      .insert(phPerformanceInsights)
      .values({
        companyId,
        insightType: input.insightType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
        sourceModule: input.sourceModule ?? null,
        metricValue: input.metricValue ?? null,
        thresholdValue: input.thresholdValue ?? null,
        recommendation: input.recommendation ?? null,
      })
      .returning();
    return toInsightSummary(created!);
  }
}

function toInsightSummary(row: typeof phPerformanceInsights.$inferSelect): PhPerformanceInsightSummary {
  return {
    id: row.id,
    insightType: row.insightType,
    severity: row.severity,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    metricValue: row.metricValue,
    thresholdValue: row.thresholdValue,
    recommendation: row.recommendation,
    createdAt: row.createdAt.toISOString(),
  };
}
