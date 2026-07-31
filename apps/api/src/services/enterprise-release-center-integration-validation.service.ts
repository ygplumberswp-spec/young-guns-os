import { and, count, eq } from 'drizzle-orm';
import type {
  RcInsightSeverity,
  RcIntegrationCategory,
  RcIntegrationValidationResultSummary,
  RcIntegrationValidationRunDetailSummary,
  RcIntegrationValidationRunSummary,
  RcValidationStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { checkDbConnection } from '@titan/db';
import {
  companies,
  customers,
  integrationConnections,
  jobs,
  leads,
  rcIntegrationValidationResults,
  rcIntegrationValidationRuns,
  roles,
  ucProviderAdapters,
  users,
} from '@titan/db';

type StaffScope = { companyId: string; userId: string };

type IntegrationCheck = {
  checkKey: string;
  checkName: string;
  category: RcIntegrationCategory;
  run: (companyId: string) => Promise<{
    status: RcValidationStatus;
    severity: RcInsightSeverity;
    message: string;
    recommendation?: string;
    details?: Record<string, unknown>;
  }>;
};

type IntegrationDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  encryptionKey?: string;
  enterpriseLaunchCenterService: import('./enterprise-launch-center.service.js').EnterpriseLaunchCenterService;
  enterprisePlatformHealthService: import('./enterprise-platform-health.service.js').EnterprisePlatformHealthService;
  enterpriseSecurityService: import('./enterprise-security.service.js').EnterpriseSecurityService;
  enterpriseMissionControlService: import('./enterprise-mission-control.service.js').EnterpriseMissionControlService;
  integrationPlatformService: import('./integration-platform.service.js').IntegrationPlatformService;
  aiProviderResilienceService: import('./ai-provider-resilience.service.js').AiProviderResilienceService;
  enterpriseDocumentAiService: import('./enterprise-document-ai.service.js').EnterpriseDocumentAiService;
  enterpriseKnowledgeGraphService: import('./enterprise-knowledge-graph.service.js').EnterpriseKnowledgeGraphService;
  enterpriseSaasPlatformService: import('./enterprise-saas-platform.service.js').EnterpriseSaasPlatformService;
  enterpriseIndustryPackService: import('./enterprise-industry-packs.service.js').EnterpriseIndustryPackService;
  enterpriseBusinessContinuityService: import('./enterprise-business-continuity.service.js').EnterpriseBusinessContinuityService;
  enterpriseVoiceReceptionService: import('./enterprise-voice-reception.service.js').EnterpriseVoiceReceptionService;
};

export class EnterpriseReleaseCenterIntegrationValidationService {
  constructor(private readonly deps: IntegrationDeps) {}

  async listRuns(companyId: string): Promise<RcIntegrationValidationRunSummary[]> {
    const rows = await this.deps.db.query.rcIntegrationValidationRuns.findMany({
      where: eq(rcIntegrationValidationRuns.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 50,
    });
    return rows.map(toRunSummary);
  }

  async getRunDetail(
    companyId: string,
    runId: string,
  ): Promise<RcIntegrationValidationRunDetailSummary | null> {
    const run = await this.deps.db.query.rcIntegrationValidationRuns.findFirst({
      where: and(
        eq(rcIntegrationValidationRuns.companyId, companyId),
        eq(rcIntegrationValidationRuns.id, runId),
      ),
    });
    if (!run) return null;
    const results = await this.deps.db.query.rcIntegrationValidationResults.findMany({
      where: eq(rcIntegrationValidationResults.validationRunId, runId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return { ...toRunSummary(run), results: results.map(toResultSummary) };
  }

  async runIntegrationValidation(
    scope: StaffScope,
  ): Promise<RcIntegrationValidationRunDetailSummary> {
    const runKey = `integration_${Date.now()}`;
    const [run] = await this.deps.db
      .insert(rcIntegrationValidationRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        runKey,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const checks = this.buildChecks();
    const results: RcIntegrationValidationResultSummary[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let warningCount = 0;

    for (const check of checks) {
      const started = Date.now();
      try {
        const outcome = await check.run(scope.companyId);
        if (outcome.status === 'passed') passedCount += 1;
        else if (outcome.status === 'warning') warningCount += 1;
        else failedCount += 1;
        const [result] = await this.deps.db
          .insert(rcIntegrationValidationResults)
          .values({
            companyId: scope.companyId,
            validationRunId: run!.id,
            checkKey: check.checkKey,
            checkName: check.checkName,
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
          .insert(rcIntegrationValidationResults)
          .values({
            companyId: scope.companyId,
            validationRunId: run!.id,
            checkKey: check.checkKey,
            checkName: check.checkName,
            category: check.category,
            status: 'failed',
            severity: 'critical',
            message: error instanceof Error ? error.message : 'Integration check failed',
            durationMs: Date.now() - started,
          })
          .returning();
        if (result) results.push(toResultSummary(result));
      }
    }

    const finalStatus: RcValidationStatus =
      failedCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';
    const [updated] = await this.deps.db
      .update(rcIntegrationValidationRuns)
      .set({
        status: finalStatus,
        checkCount: checks.length,
        passedCount,
        failedCount,
        warningCount,
        completedAt: new Date(),
      })
      .where(eq(rcIntegrationValidationRuns.id, run!.id))
      .returning();

    return { ...toRunSummary(updated ?? run!), results };
  }

  private buildChecks(): IntegrationCheck[] {
    return [
      {
        checkKey: 'authentication',
        checkName: 'Authentication',
        category: 'authentication',
        run: async () => ({
          status: this.deps.jwtSecret ? 'passed' : 'failed',
          severity: this.deps.jwtSecret ? 'info' : 'critical',
          message: this.deps.jwtSecret ? 'JWT authentication configured.' : 'JWT_SECRET missing.',
        }),
      },
      {
        checkKey: 'rbac',
        checkName: 'RBAC',
        category: 'rbac',
        run: async (companyId) => {
          const [row] = await this.deps.db
            .select({ value: count() })
            .from(roles)
            .where(eq(roles.companyId, companyId));
          const val = Number(row?.value ?? 0);
          return {
            status: val >= 2 ? 'passed' : 'warning',
            severity: val >= 2 ? 'info' : 'warning',
            message: `${val} role(s) configured.`,
          };
        },
      },
      {
        checkKey: 'multi_tenancy',
        checkName: 'Multi-tenancy isolation',
        category: 'multi_tenancy',
        run: async (companyId) => {
          const company = await this.deps.db.query.companies.findFirst({
            where: eq(companies.id, companyId),
          });
          const [userCount] = await this.deps.db
            .select({ value: count() })
            .from(users)
            .where(eq(users.companyId, companyId));
          return {
            status: company ? 'passed' : 'failed',
            severity: company ? 'info' : 'critical',
            message: company
              ? `Tenant ${company.name} with ${userCount?.value ?? 0} user(s).`
              : 'Tenant not found.',
          };
        },
      },
      {
        checkKey: 'crm',
        checkName: 'CRM module',
        category: 'crm',
        run: async (companyId) => {
          const [row] = await this.deps.db
            .select({ value: count() })
            .from(customers)
            .where(eq(customers.companyId, companyId));
          return {
            status: 'passed',
            severity: 'info',
            message: `${row?.value ?? 0} customer record(s) — CRM module accessible.`,
          };
        },
      },
      {
        checkKey: 'leads',
        checkName: 'Leads module',
        category: 'leads',
        run: async (companyId) => {
          const [row] = await this.deps.db
            .select({ value: count() })
            .from(leads)
            .where(eq(leads.companyId, companyId));
          return {
            status: 'passed',
            severity: 'info',
            message: `${row?.value ?? 0} lead record(s).`,
          };
        },
      },
      {
        checkKey: 'customers',
        checkName: 'Customers module',
        category: 'customers',
        run: async (companyId) => {
          const [row] = await this.deps.db
            .select({ value: count() })
            .from(customers)
            .where(eq(customers.companyId, companyId));
          return { status: 'passed', severity: 'info', message: `${row?.value ?? 0} customer(s).` };
        },
      },
      {
        checkKey: 'jobs',
        checkName: 'Jobs module',
        category: 'jobs',
        run: async (companyId) => {
          const [row] = await this.deps.db
            .select({ value: count() })
            .from(jobs)
            .where(eq(jobs.companyId, companyId));
          return { status: 'passed', severity: 'info', message: `${row?.value ?? 0} job(s).` };
        },
      },
      {
        checkKey: 'connectors',
        checkName: 'Universal Connector Platform',
        category: 'connectors',
        run: async (companyId) => {
          const monitoring =
            await this.deps.integrationPlatformService.getMonitoringSummary(companyId);
          return {
            status: monitoring.errorServiceCount === 0 ? 'passed' : 'failed',
            severity: monitoring.errorServiceCount === 0 ? 'info' : 'high',
            message: `${monitoring.connectedServiceCount} connected, ${monitoring.errorServiceCount} error(s).`,
          };
        },
      },
      {
        checkKey: 'xero',
        checkName: 'Xero integration',
        category: 'xero',
        run: async (companyId) => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const xero = connections.filter((c) => c.provider?.toLowerCase().includes('xero'));
          return {
            status:
              xero.length === 0
                ? 'warning'
                : xero.every((c) => c.status !== 'error')
                  ? 'passed'
                  : 'failed',
            severity: xero.some((c) => c.status === 'error') ? 'high' : 'info',
            message:
              xero.length === 0
                ? 'No Xero integration configured.'
                : `${xero.length} Xero connection(s).`,
          };
        },
      },
      {
        checkKey: 'whatsapp',
        checkName: 'WhatsApp providers',
        category: 'whatsapp',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const whatsapp = adapters.filter((a) => a.channel === 'whatsapp');
          return {
            status: whatsapp.some((a) => a.status === 'active') ? 'passed' : 'warning',
            severity: 'info',
            message: `${whatsapp.length} WhatsApp adapter(s).`,
          };
        },
      },
      {
        checkKey: 'email',
        checkName: 'Email providers',
        category: 'email',
        run: async (companyId) => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
          });
          const email = adapters.filter((a) => a.channel === 'email');
          return {
            status: email.some((a) => a.status === 'active') ? 'passed' : 'warning',
            severity: 'info',
            message: `${email.length} email adapter(s).`,
          };
        },
      },
      {
        checkKey: 'document_ai',
        checkName: 'Document AI',
        category: 'document_ai',
        run: async (companyId) => {
          const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(companyId);
          return {
            status: 'passed',
            severity: 'info',
            message: `${dashboard.documentsStats.documentCount} document(s), ${dashboard.activeOcrProviderCount} OCR provider(s).`,
          };
        },
      },
      {
        checkKey: 'knowledge_graph',
        checkName: 'Knowledge Graph',
        category: 'knowledge_graph',
        run: async (companyId) => {
          const ctx =
            await this.deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(
              companyId,
            );
          return { status: 'passed', severity: 'info', message: ctx.summary };
        },
      },
      {
        checkKey: 'mission_control',
        checkName: 'Mission Control',
        category: 'mission_control',
        run: async (companyId) => {
          const dashboard =
            await this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'security',
        checkName: 'Security Platform',
        category: 'security',
        run: async (companyId) => {
          const dashboard =
            await this.deps.enterpriseSecurityService.getExecutiveDashboard(companyId);
          return {
            status: dashboard.riskAlertCount === 0 ? 'passed' : 'warning',
            severity: dashboard.riskAlertCount > 0 ? 'high' : 'info',
            message: `Security score ${dashboard.securityScore ?? '—'}, ${dashboard.riskAlertCount} risk alert(s).`,
          };
        },
      },
      {
        checkKey: 'saas',
        checkName: 'SaaS Platform',
        category: 'saas',
        run: async (companyId) => {
          const dashboard =
            await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'industry_packs',
        checkName: 'Industry Packs',
        category: 'industry_packs',
        run: async (companyId) => {
          const dashboard = await this.deps.enterpriseIndustryPackService.getDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'business_continuity',
        checkName: 'Business Continuity',
        category: 'business_continuity',
        run: async (companyId) => {
          const dashboard =
            await this.deps.enterpriseBusinessContinuityService.getDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'launch_center',
        checkName: 'Launch Center',
        category: 'launch_center',
        run: async (companyId) => {
          const dashboard = await this.deps.enterpriseLaunchCenterService.getDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'voice_reception',
        checkName: 'Voice Reception',
        category: 'voice_reception',
        run: async (companyId) => {
          const dashboard = await this.deps.enterpriseVoiceReceptionService.getDashboard(companyId);
          return { status: 'passed', severity: 'info', message: dashboard.summary };
        },
      },
      {
        checkKey: 'ai_orchestration',
        checkName: 'AI providers',
        category: 'ai_orchestration',
        run: async (companyId) => {
          const hasProviders =
            await this.deps.aiProviderResilienceService.hasConfiguredProviders(companyId);
          const status = await this.deps.aiProviderResilienceService.getResilienceStatus(companyId);
          return {
            status: hasProviders ? 'passed' : 'warning',
            severity: hasProviders ? 'info' : 'warning',
            message: `${status.providers.length} AI provider(s) configured.`,
          };
        },
      },
      {
        checkKey: 'platform_health',
        checkName: 'Platform Health integration',
        category: 'mission_control',
        run: async (companyId) => {
          const dashboard = await this.deps.enterprisePlatformHealthService.getDashboard(companyId);
          return {
            status: dashboard.overallPlatformHealthStatus === 'critical' ? 'failed' : 'passed',
            severity: dashboard.overallPlatformHealthStatus === 'critical' ? 'critical' : 'info',
            message: `Platform health: ${dashboard.overallPlatformHealthStatus}.`,
          };
        },
      },
      {
        checkKey: 'database_connectivity',
        checkName: 'Database connectivity',
        category: 'authentication',
        run: async () => {
          const ok = this.deps.databaseUrl ? await checkDbConnection(this.deps.databaseUrl) : false;
          return {
            status: ok ? 'passed' : 'failed',
            severity: ok ? 'info' : 'critical',
            message: ok ? 'Database reachable.' : 'Database connection failed.',
          };
        },
      },
    ];
  }
}

function toRunSummary(
  row: typeof rcIntegrationValidationRuns.$inferSelect,
): RcIntegrationValidationRunSummary {
  return {
    id: row.id,
    runKey: row.runKey,
    status: row.status,
    checkCount: row.checkCount,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    warningCount: row.warningCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toResultSummary(
  row: typeof rcIntegrationValidationResults.$inferSelect,
): RcIntegrationValidationResultSummary {
  return {
    id: row.id,
    validationRunId: row.validationRunId,
    checkKey: row.checkKey,
    checkName: row.checkName,
    category: row.category,
    status: row.status,
    severity: row.severity,
    message: row.message,
    recommendation: row.recommendation,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}
