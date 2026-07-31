import { eq } from 'drizzle-orm';
import type { PlEnvironmentReviewSummary, PlValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { checkDbConnection } from '@titan/db';
import { plEnvironmentReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

type EnvironmentDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  encryptionKey?: string;
  appUrl?: string;
  apiPublicUrl?: string;
  redisUrl?: string;
  nodeEnv?: string;
};

export class EnterpriseProductionLaunchEnvironmentService {
  constructor(private readonly deps: EnvironmentDeps) {}

  async getLatestReview(companyId: string): Promise<PlEnvironmentReviewSummary | null> {
    const row = await this.deps.db.query.plEnvironmentReviews.findFirst({
      where: eq(plEnvironmentReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runEnvironmentReview(scope: StaffScope): Promise<PlEnvironmentReviewSummary> {
    const reviewKey = `env_${Date.now()}`;
    const findings: Array<Record<string, unknown>> = [];

    const checks: Array<{ key: string; configured: boolean; required: boolean; message: string }> =
      [
        {
          key: 'DATABASE_URL',
          configured: !!this.deps.databaseUrl,
          required: true,
          message: 'Production database connection string.',
        },
        {
          key: 'JWT_SECRET',
          configured: !!this.deps.jwtSecret,
          required: true,
          message: 'Authentication JWT secret.',
        },
        {
          key: 'JWT_REFRESH_SECRET',
          configured: !!this.deps.jwtRefreshSecret,
          required: true,
          message: 'Refresh token secret.',
        },
        {
          key: 'INTEGRATIONS_ENCRYPTION_KEY',
          configured: !!this.deps.encryptionKey,
          required: false,
          message: 'Integration credentials encryption key.',
        },
        {
          key: 'APP_URL',
          configured: !!this.deps.appUrl,
          required: true,
          message: 'Frontend application URL.',
        },
        {
          key: 'API_PUBLIC_URL',
          configured: !!this.deps.apiPublicUrl,
          required: false,
          message: 'Public API URL for webhooks and connectors.',
        },
        {
          key: 'REDIS_URL',
          configured: !!this.deps.redisUrl,
          required: false,
          message: 'Redis for background jobs and caching.',
        },
        {
          key: 'NODE_ENV',
          configured: this.deps.nodeEnv === 'production',
          required: false,
          message: 'NODE_ENV should be production for live deployment.',
        },
      ];

    for (const check of checks) {
      const severity =
        !check.configured && check.required ? 'critical' : !check.configured ? 'warning' : 'info';
      findings.push({
        key: check.key,
        configured: check.configured,
        required: check.required,
        severity,
        message: check.configured
          ? `${check.key} configured.`
          : `${check.key} not configured — ${check.message}`,
      });
    }

    const dbOk = await checkDbConnection(this.deps.databaseUrl ?? '');
    findings.push({
      key: 'database_connectivity',
      configured: dbOk,
      severity: dbOk ? 'info' : 'critical',
      message: dbOk ? 'Database connectivity verified.' : 'Database connectivity check failed.',
    });

    const isSupabase = (this.deps.databaseUrl ?? '').includes('supabase');
    findings.push({
      key: 'supabase',
      configured: isSupabase || !!this.deps.databaseUrl,
      severity: 'info',
      message: isSupabase
        ? 'Supabase/Postgres database detected.'
        : 'Database URL configured (verify Supabase settings if applicable).',
    });

    const missingConfigCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const passedCount = findings.filter((f) => f.configured === true).length;
    const status: PlValidationStatus =
      missingConfigCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';

    const [created] = await this.deps.db
      .insert(plEnvironmentReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        missingConfigCount,
        warningCount,
        passedCount,
        findings,
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(row: typeof plEnvironmentReviews.$inferSelect): PlEnvironmentReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    missingConfigCount: row.missingConfigCount,
    warningCount: row.warningCount,
    passedCount: row.passedCount,
    findings: (row.findings ?? []) as Array<Record<string, unknown>>,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
