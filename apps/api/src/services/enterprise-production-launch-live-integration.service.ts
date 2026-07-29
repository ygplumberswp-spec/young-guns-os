import { and, eq } from 'drizzle-orm';
import type {
  PlInsightSeverity,
  PlLiveIntegrationVerificationResultSummary,
  PlLiveIntegrationVerificationRunDetailSummary,
  PlLiveIntegrationVerificationRunSummary,
  PlProviderCategory,
  PlValidationStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  plLiveIntegrationVerificationResults,
  plLiveIntegrationVerificationRuns,
  ucProviderAdapters,
} from '@titan/db';

type StaffScope = { companyId: string; userId: string };

type ProviderCheck = {
  providerKey: string;
  providerName: string;
  category: PlProviderCategory;
  run: (companyId: string) => Promise<{
    status: PlValidationStatus;
    severity: PlInsightSeverity;
    message: string;
    recommendation?: string;
    details?: Record<string, unknown>;
  }>;
};

type LiveIntegrationDeps = {
  db: DatabaseClient;
  integrationPlatformService: import('./integration-platform.service.js').IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
};

export class EnterpriseProductionLaunchLiveIntegrationService {
  constructor(private readonly deps: LiveIntegrationDeps) {}

  async listRuns(companyId: string): Promise<PlLiveIntegrationVerificationRunSummary[]> {
    const rows = await this.deps.db.query.plLiveIntegrationVerificationRuns.findMany({
      where: eq(plLiveIntegrationVerificationRuns.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 50,
    });
    return rows.map(toRunSummary);
  }

  async getRunDetail(companyId: string, runId: string): Promise<PlLiveIntegrationVerificationRunDetailSummary | null> {
    const run = await this.deps.db.query.plLiveIntegrationVerificationRuns.findFirst({
      where: and(eq(plLiveIntegrationVerificationRuns.companyId, companyId), eq(plLiveIntegrationVerificationRuns.id, runId)),
    });
    if (!run) return null;
    const results = await this.deps.db.query.plLiveIntegrationVerificationResults.findMany({
      where: eq(plLiveIntegrationVerificationResults.verificationRunId, runId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return { ...toRunSummary(run), results: results.map(toResultSummary) };
  }

  async runLiveIntegrationVerification(scope: StaffScope): Promise<PlLiveIntegrationVerificationRunDetailSummary> {
    const runKey = `live_${Date.now()}`;
    const [run] = await this.deps.db
      .insert(plLiveIntegrationVerificationRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        runKey,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const checks = this.buildChecks();
    const results: PlLiveIntegrationVerificationResultSummary[] = [];
    let connectedCount = 0;
    let failedCount = 0;
    let warningCount = 0;

    for (const check of checks) {
      const started = Date.now();
      try {
        const outcome = await check.run(scope.companyId);
        if (outcome.status === 'passed') connectedCount += 1;
        else if (outcome.status === 'warning') warningCount += 1;
        else failedCount += 1;
        const [result] = await this.deps.db
          .insert(plLiveIntegrationVerificationResults)
          .values({
            companyId: scope.companyId,
            verificationRunId: run!.id,
            providerKey: check.providerKey,
            providerName: check.providerName,
            category: check.category,
            status: outcome.status,
            severity: outcome.severity,
            message: outcome.message,
            recommendation: outcome.recommendation ?? null,
            durationMs: Date.now() - started,
            details: outcome.details ?? {},
          })
          .returning();
        if (result) results.push(toResultSummary(result));
      } catch (error) {
        failedCount += 1;
        const [result] = await this.deps.db
          .insert(plLiveIntegrationVerificationResults)
          .values({
            companyId: scope.companyId,
            verificationRunId: run!.id,
            providerKey: check.providerKey,
            providerName: check.providerName,
            category: check.category,
            status: 'failed',
            severity: 'critical',
            message: error instanceof Error ? error.message : 'Verification failed',
            durationMs: Date.now() - started,
          })
          .returning();
        if (result) results.push(toResultSummary(result));
      }
    }

    const status: PlValidationStatus = failedCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';
    const [updated] = await this.deps.db
      .update(plLiveIntegrationVerificationRuns)
      .set({
        status,
        providerCount: checks.length,
        connectedCount,
        failedCount,
        warningCount,
        completedAt: new Date(),
      })
      .where(eq(plLiveIntegrationVerificationRuns.id, run!.id))
      .returning();

    return { ...toRunSummary(updated!), results };
  }

  private buildChecks(): ProviderCheck[] {
    return [
      {
        providerKey: 'xero',
        providerName: 'Xero Accounting',
        category: 'xero',
        run: async (companyId) => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const xero = connections.filter((c) => c.provider?.toLowerCase().includes('xero'));
          if (xero.length === 0) {
            return { status: 'warning', severity: 'warning', message: 'No Xero connection configured.', recommendation: 'Configure Xero via Universal Connector Platform.' };
          }
          const errors = xero.filter((c) => c.status === 'error');
          return {
            status: errors.length === 0 ? 'passed' : 'failed',
            severity: errors.length === 0 ? 'info' : 'high',
            message: `${xero.length} Xero connection(s), ${errors.length} error(s).`,
            details: { connectionCount: xero.length, errorCount: errors.length },
          };
        },
      },
      {
        providerKey: 'email',
        providerName: 'Email (Gmail / Microsoft 365)',
        category: 'email',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const email = adapters.filter((a) => a.channel === 'email');
          const active = email.filter((a) => a.status === 'active');
          return {
            status: active.length > 0 ? 'passed' : email.length > 0 ? 'warning' : 'warning',
            severity: active.length > 0 ? 'info' : 'warning',
            message: `${active.length}/${email.length} active email adapter(s).`,
          };
        },
      },
      {
        providerKey: 'whatsapp',
        providerName: 'WhatsApp Business',
        category: 'whatsapp',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const whatsapp = adapters.filter((a) => a.channel === 'whatsapp');
          const active = whatsapp.filter((a) => a.status === 'active');
          return {
            status: active.length > 0 ? 'passed' : 'warning',
            severity: active.length > 0 ? 'info' : 'warning',
            message: `${active.length}/${whatsapp.length} active WhatsApp adapter(s).`,
          };
        },
      },
      {
        providerKey: 'sms',
        providerName: 'SMS Providers',
        category: 'sms',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const sms = adapters.filter((a) => a.channel === 'sms');
          const active = sms.filter((a) => a.status === 'active');
          return {
            status: active.length > 0 ? 'passed' : 'warning',
            severity: 'info',
            message: `${active.length}/${sms.length} active SMS adapter(s).`,
          };
        },
      },
      {
        providerKey: 'payments',
        providerName: 'Payment Providers',
        category: 'payments',
        run: async (companyId) => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const payments = connections.filter((c) =>
            ['stripe', 'payfast', 'paypal', 'payment'].some((p) => c.provider?.toLowerCase().includes(p)),
          );
          return {
            status: payments.some((c) => c.status === 'connected') ? 'passed' : payments.length > 0 ? 'warning' : 'warning',
            severity: 'info',
            message: `${payments.length} payment integration(s) configured.`,
          };
        },
      },
      {
        providerKey: 'cartrack',
        providerName: 'Cartrack Fleet',
        category: 'cartrack',
        run: async (companyId) => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const cartrack = connections.filter((c) => c.provider?.toLowerCase().includes('cartrack'));
          return {
            status: cartrack.some((c) => c.status === 'connected') ? 'passed' : 'warning',
            severity: 'info',
            message: cartrack.length === 0 ? 'No Cartrack integration configured.' : `${cartrack.length} Cartrack connection(s).`,
          };
        },
      },
      {
        providerKey: 'ai',
        providerName: 'AI Providers',
        category: 'ai',
        run: async (companyId) => {
          const hasProviders = await this.deps.aiProviderResilienceService.hasConfiguredProviders(companyId);
          return {
            status: hasProviders ? 'passed' : 'failed',
            severity: hasProviders ? 'info' : 'high',
            message: hasProviders ? 'AI provider(s) configured.' : 'No AI providers configured.',
          };
        },
      },
      {
        providerKey: 'connectors',
        providerName: 'Universal Connector Platform',
        category: 'connectors',
        run: async (companyId) => {
          const monitoring = await this.deps.integrationPlatformService.getMonitoringSummary(companyId);
          return {
            status: monitoring.errorServiceCount === 0 ? 'passed' : 'failed',
            severity: monitoring.errorServiceCount === 0 ? 'info' : 'high',
            message: `${monitoring.connectedServiceCount} connected, ${monitoring.errorServiceCount} error(s).`,
            details: monitoring as unknown as Record<string, unknown>,
          };
        },
      },
      {
        providerKey: 'storage',
        providerName: 'Object Storage',
        category: 'storage',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const storage = adapters.filter((a) => a.providerKey.includes('storage') || a.providerKey.includes('s3'));
          return {
            status: storage.length > 0 ? 'passed' : 'warning',
            severity: 'info',
            message: storage.length > 0 ? `${storage.length} storage adapter(s).` : 'Verify object storage configuration for documents and media.',
          };
        },
      },
    ];
  }
}

function toRunSummary(row: typeof plLiveIntegrationVerificationRuns.$inferSelect): PlLiveIntegrationVerificationRunSummary {
  return {
    id: row.id,
    runKey: row.runKey,
    status: row.status,
    providerCount: row.providerCount,
    connectedCount: row.connectedCount,
    failedCount: row.failedCount,
    warningCount: row.warningCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toResultSummary(row: typeof plLiveIntegrationVerificationResults.$inferSelect): PlLiveIntegrationVerificationResultSummary {
  return {
    id: row.id,
    verificationRunId: row.verificationRunId,
    providerKey: row.providerKey,
    providerName: row.providerName,
    category: row.category,
    status: row.status,
    severity: row.severity,
    message: row.message,
    recommendation: row.recommendation,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}
