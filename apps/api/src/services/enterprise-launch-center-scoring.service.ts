import { eq } from 'drizzle-orm';
import type {
  LncReadinessCheckResultSummary,
  LncReadinessScoreSummary,
  LncReadinessStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { lncPlatformConfig, lncReadinessScores } from '@titan/db';

const DEFAULT_WEIGHTS: Record<string, number> = {
  critical: 0,
  high: 0.25,
  warning: 0.5,
  info: 1,
};

type ScoringInput = {
  companyId: string;
  readinessScanId: string;
  results: LncReadinessCheckResultSummary[];
};

export class EnterpriseLaunchCenterScoringService {
  constructor(private readonly db: DatabaseClient) {}

  async computeReadinessScore(input: ScoringInput): Promise<LncReadinessScoreSummary> {
    const config = await this.db.query.lncPlatformConfig.findFirst({
      where: eq(lncPlatformConfig.companyId, input.companyId),
    });
    const weights = {
      ...DEFAULT_WEIGHTS,
      ...((config?.scoringWeights as Record<string, number> | undefined) ?? {}),
    };

    const criticalBlockers = input.results.filter((r) => r.severity === 'critical' && r.status !== 'passed');
    const highPriority = input.results.filter((r) => r.severity === 'high' && r.status !== 'passed');
    const warnings = input.results.filter((r) => r.status === 'warning' || r.severity === 'warning');
    const passed = input.results.filter((r) => r.status === 'passed');

    const overallStatus = resolveScoreStatus(criticalBlockers.length, highPriority.length, warnings.length, passed.length);

    let overallScore: number | null = null;
    if (criticalBlockers.length > 0) {
      overallScore = 0;
    } else if (input.results.length > 0) {
      const totalWeight = input.results.reduce((sum, r) => {
        const weightKey = r.severity === 'critical' ? 'critical' : r.severity === 'high' ? 'high' : r.status === 'warning' ? 'warning' : 'info';
        const weight = weights[weightKey] ?? 1;
        return sum + (r.status === 'passed' ? weight : 0);
      }, 0);
      const maxWeight = input.results.reduce((sum, r) => {
        const weightKey = r.severity === 'critical' ? 'critical' : r.severity === 'high' ? 'high' : r.status === 'warning' ? 'warning' : 'info';
        return sum + (weights[weightKey] ?? 1);
      }, 0);
      overallScore = maxWeight > 0 ? Math.round((totalWeight / maxWeight) * 100) : null;
    }

    const recommendations = input.results
      .filter((r) => r.recommendation && r.status !== 'passed')
      .map((r) => ({
        checkKey: r.checkKey,
        checkName: r.checkName,
        severity: r.severity,
        recommendation: r.recommendation,
      }));

    const [created] = await this.db
      .insert(lncReadinessScores)
      .values({
        companyId: input.companyId,
        readinessScanId: input.readinessScanId,
        overallScore,
        overallStatus,
        criticalBlockerCount: criticalBlockers.length,
        highPriorityCount: highPriority.length,
        warningCount: warnings.length,
        passedCount: passed.length,
        recommendations,
        scoreBreakdown: {
          weights,
          categoryBreakdown: groupByCategory(input.results),
        },
      })
      .returning();

    return toScoreSummary(created!);
  }

  async getLatestScore(companyId: string): Promise<LncReadinessScoreSummary | null> {
    const row = await this.db.query.lncReadinessScores.findFirst({
      where: eq(lncReadinessScores.companyId, companyId),
      orderBy: (s, { desc }) => [desc(s.capturedAt)],
    });
    return row ? toScoreSummary(row) : null;
  }
}

function resolveScoreStatus(
  criticalBlockerCount: number,
  highPriorityCount: number,
  warningCount: number,
  passedCount: number,
): LncReadinessStatus {
  if (criticalBlockerCount > 0) return 'blocked';
  if (highPriorityCount > 0) return 'not_ready';
  if (warningCount > 0) return 'warning';
  if (passedCount > 0) return 'ready';
  return 'unknown';
}

function groupByCategory(results: LncReadinessCheckResultSummary[]) {
  return results.reduce<Record<string, { passed: number; failed: number; warning: number }>>((acc, r) => {
    const key = r.category ?? 'platform';
    acc[key] ??= { passed: 0, failed: 0, warning: 0 };
    if (r.status === 'passed') acc[key].passed += 1;
    else if (r.status === 'warning') acc[key].warning += 1;
    else acc[key].failed += 1;
    return acc;
  }, {});
}

function toScoreSummary(row: typeof lncReadinessScores.$inferSelect): LncReadinessScoreSummary {
  return {
    id: row.id,
    readinessScanId: row.readinessScanId,
    overallScore: row.overallScore,
    overallStatus: row.overallStatus,
    criticalBlockerCount: row.criticalBlockerCount,
    highPriorityCount: row.highPriorityCount,
    warningCount: row.warningCount,
    passedCount: row.passedCount,
    recommendations: (row.recommendations ?? []) as Array<Record<string, unknown>>,
    scoreBreakdown: (row.scoreBreakdown ?? {}) as Record<string, unknown>,
    capturedAt: row.capturedAt.toISOString(),
  };
}
