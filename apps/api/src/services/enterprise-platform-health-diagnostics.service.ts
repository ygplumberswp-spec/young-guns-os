import { and, eq } from 'drizzle-orm';
import type {
  PhDiagnosticResultSummary,
  PhDiagnosticRunDetailSummary,
  PhDiagnosticRunSummary,
  PhDiagnosticStatus,
  PhServiceCategory,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { checkDbConnection } from '@titan/db';
import {
  phDiagnosticResults,
  phDiagnosticRuns,
  ucProviderAdapters,
  integrationConnections,
  companies,
  automationQueueJobs,
} from '@titan/db';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';

type StaffScope = { companyId: string; userId: string };

type DiagnosticDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  aiProviderResilienceService: AiProviderResilienceService;
  integrationPlatformService: IntegrationPlatformService;
};

type DiagnosticTest = {
  testKey: string;
  testName: string;
  serviceCategory: PhServiceCategory;
  run: (
    companyId: string,
  ) => Promise<{ passed: boolean; message: string; details?: Record<string, unknown> }>;
};

export class EnterprisePlatformHealthDiagnosticsService {
  constructor(private readonly deps: DiagnosticDeps) {}

  async listDiagnosticRuns(companyId: string): Promise<PhDiagnosticRunSummary[]> {
    const rows = await this.deps.db.query.phDiagnosticRuns.findMany({
      where: eq(phDiagnosticRuns.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 50,
    });
    return rows.map(toDiagnosticRunSummary);
  }

  async getDiagnosticRunDetail(
    companyId: string,
    runId: string,
  ): Promise<PhDiagnosticRunDetailSummary | null> {
    const run = await this.deps.db.query.phDiagnosticRuns.findFirst({
      where: and(eq(phDiagnosticRuns.companyId, companyId), eq(phDiagnosticRuns.id, runId)),
    });
    if (!run) return null;
    const results = await this.deps.db.query.phDiagnosticResults.findMany({
      where: eq(phDiagnosticResults.diagnosticRunId, runId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return { ...toDiagnosticRunSummary(run), results: results.map(toDiagnosticResultSummary) };
  }

  async runDiagnostics(scope: StaffScope): Promise<PhDiagnosticRunDetailSummary> {
    const runKey = `diag_${Date.now()}`;
    const [run] = await this.deps.db
      .insert(phDiagnosticRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        runKey,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const tests = this.buildTests();
    const results: PhDiagnosticResultSummary[] = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const test of tests) {
      const started = Date.now();
      try {
        const outcome = await test.run(scope.companyId);
        const status: PhDiagnosticStatus = outcome.passed ? 'passed' : 'failed';
        if (outcome.passed) passedCount += 1;
        else failedCount += 1;

        const [result] = await this.deps.db
          .insert(phDiagnosticResults)
          .values({
            companyId: scope.companyId,
            diagnosticRunId: run!.id,
            testKey: test.testKey,
            testName: test.testName,
            serviceCategory: test.serviceCategory,
            status,
            message: outcome.message,
            durationMs: Date.now() - started,
            details: outcome.details ?? {},
          })
          .returning();
        if (result) results.push(toDiagnosticResultSummary(result));
      } catch (error) {
        failedCount += 1;
        const [result] = await this.deps.db
          .insert(phDiagnosticResults)
          .values({
            companyId: scope.companyId,
            diagnosticRunId: run!.id,
            testKey: test.testKey,
            testName: test.testName,
            serviceCategory: test.serviceCategory,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Diagnostic test failed',
            durationMs: Date.now() - started,
          })
          .returning();
        if (result) results.push(toDiagnosticResultSummary(result));
      }
    }

    const finalStatus: PhDiagnosticStatus =
      failedCount === 0 ? 'passed' : failedCount === tests.length ? 'failed' : 'failed';
    const [updated] = await this.deps.db
      .update(phDiagnosticRuns)
      .set({
        status: finalStatus,
        testCount: tests.length,
        passedCount,
        failedCount,
        completedAt: new Date(),
      })
      .where(eq(phDiagnosticRuns.id, run!.id))
      .returning();

    return { ...toDiagnosticRunSummary(updated ?? run!), results };
  }

  private buildTests(): DiagnosticTest[] {
    return [
      {
        testKey: 'database_connectivity',
        testName: 'Database connectivity',
        serviceCategory: 'database',
        run: async () => {
          if (!this.deps.databaseUrl) {
            return { passed: false, message: 'Database URL not configured' };
          }
          const ok = await checkDbConnection(this.deps.databaseUrl);
          return {
            passed: ok,
            message: ok ? 'Database connection successful' : 'Database connection failed',
          };
        },
      },
      {
        testKey: 'api_connectivity',
        testName: 'API connectivity',
        serviceCategory: 'api',
        run: async (companyId) => {
          const row = await this.deps.db.query.companies.findFirst({
            where: eq(companies.id, companyId),
          });
          return {
            passed: Boolean(row),
            message: row ? 'API database layer reachable' : 'Company record not found',
          };
        },
      },
      {
        testKey: 'authentication',
        testName: 'Authentication configuration',
        serviceCategory: 'authentication',
        run: async () => ({
          passed: Boolean(this.deps.jwtSecret && this.deps.jwtSecret.length >= 16),
          message: this.deps.jwtSecret ? 'JWT secret configured' : 'JWT secret not configured',
        }),
      },
      {
        testKey: 'ai_providers',
        testName: 'AI provider health',
        serviceCategory: 'ai_provider',
        run: async (companyId) => {
          const resilience =
            await this.deps.aiProviderResilienceService.getResilienceStatus(companyId);
          const unhealthy = resilience.providers.filter(
            (p) => p.healthStatus === 'unhealthy',
          ).length;
          return {
            passed: unhealthy === 0,
            message:
              unhealthy === 0
                ? `${resilience.providers.length} AI provider(s) monitored, all healthy`
                : `${unhealthy} unhealthy AI provider(s) detected`,
            details: { providerCount: resilience.providers.length, unhealthyCount: unhealthy },
          };
        },
      },
      {
        testKey: 'communication_providers',
        testName: 'Communication providers',
        serviceCategory: 'communication_provider',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: and(
              eq(ucProviderAdapters.companyId, companyId),
              eq(ucProviderAdapters.status, 'active'),
            ),
          });
          const channels = ['email', 'sms', 'whatsapp'];
          const configured = channels.filter((c) => adapters.some((a) => a.channel === c));
          return {
            passed: configured.length > 0 || adapters.length === 0,
            message:
              adapters.length === 0
                ? 'No communication adapters configured'
                : `${configured.length}/${channels.length} core channel(s) have active adapters`,
            details: { adapterCount: adapters.length, configuredChannels: configured },
          };
        },
      },
      {
        testKey: 'accounting_integrations',
        testName: 'Accounting integrations',
        serviceCategory: 'accounting_provider',
        run: async (companyId) => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const accounting = connections.filter((c) =>
            ['xero', 'quickbooks', 'sage'].some((p) => c.provider?.toLowerCase().includes(p)),
          );
          const errors = accounting.filter((c) => c.status === 'error').length;
          return {
            passed: errors === 0,
            message:
              accounting.length === 0
                ? 'No accounting integrations configured'
                : errors === 0
                  ? `${accounting.length} accounting integration(s) healthy`
                  : `${errors} accounting integration(s) in error state`,
            details: { connectionCount: accounting.length, errorCount: errors },
          };
        },
      },
      {
        testKey: 'connector_platform',
        testName: 'Universal Connector Platform',
        serviceCategory: 'connector_platform',
        run: async (companyId) => {
          const dashboard =
            await this.deps.integrationPlatformService.getExecutiveDashboard(companyId);
          const errorCount = dashboard.connectors.filter((c) => c.status === 'error').length;
          return {
            passed: errorCount === 0,
            message:
              errorCount === 0
                ? `${dashboard.connectors.length} connector(s) monitored, no errors`
                : `${errorCount} connector(s) in error state`,
            details: { connectorCount: dashboard.connectors.length, errorCount },
          };
        },
      },
      {
        testKey: 'scheduler_health',
        testName: 'Scheduler and background jobs',
        serviceCategory: 'scheduler',
        run: async (companyId) => {
          const failed = await this.deps.db.query.automationQueueJobs.findMany({
            where: and(
              eq(automationQueueJobs.companyId, companyId),
              eq(automationQueueJobs.status, 'failed'),
            ),
            limit: 100,
          });
          return {
            passed: failed.length < 10,
            message:
              failed.length === 0
                ? 'No failed background jobs detected'
                : `${failed.length} failed background job(s) detected`,
            details: { failedJobCount: failed.length },
          };
        },
      },
    ];
  }
}

function toDiagnosticRunSummary(row: typeof phDiagnosticRuns.$inferSelect): PhDiagnosticRunSummary {
  return {
    id: row.id,
    runKey: row.runKey,
    status: row.status,
    testCount: row.testCount,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDiagnosticResultSummary(
  row: typeof phDiagnosticResults.$inferSelect,
): PhDiagnosticResultSummary {
  return {
    id: row.id,
    diagnosticRunId: row.diagnosticRunId,
    testKey: row.testKey,
    testName: row.testName,
    serviceCategory: row.serviceCategory,
    status: row.status,
    message: row.message,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}
