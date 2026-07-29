import { and, count, eq, gte } from 'drizzle-orm';
import type {
  LncCheckCategory,
  LncCheckStatus,
  LncIssueSeverity,
  LncReadinessCheckResultSummary,
  LncReadinessScanDetailSummary,
  LncReadinessScanSummary,
  LncReadinessStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { checkDbConnection } from '@titan/db';
import {
  automationQueueJobs,
  integrationConnections,
  lncReadinessCheckResults,
  lncReadinessScans,
  roles,
  securityAuditLogs,
  ucProviderAdapters,
  users,
} from '@titan/db';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterprisePlatformHealthService } from './enterprise-platform-health.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { EnterpriseBusinessContinuityService } from './enterprise-business-continuity.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';
import type { EnterpriseNotificationsService } from './enterprise-notifications.service.js';
import type { EnterpriseDocumentAiService } from './enterprise-document-ai.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

type StaffScope = { companyId: string; userId: string };

type ReadinessDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterprisePlatformHealthService: EnterprisePlatformHealthService;
  enterpriseSecurityService: EnterpriseSecurityService;
  enterpriseBusinessContinuityService: EnterpriseBusinessContinuityService;
  integrationPlatformService: IntegrationPlatformService;
  aiProviderResilienceService: AiProviderResilienceService;
  enterpriseNotificationsService: EnterpriseNotificationsService;
  enterpriseDocumentAiService: EnterpriseDocumentAiService;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
};

type ReadinessCheck = {
  checkKey: string;
  checkName: string;
  category: LncCheckCategory;
  run: (companyId: string) => Promise<{
    status: LncCheckStatus;
    severity: LncIssueSeverity;
    message: string;
    recommendation?: string;
    details?: Record<string, unknown>;
  }>;
};

export class EnterpriseLaunchCenterReadinessService {
  constructor(private readonly deps: ReadinessDeps) {}

  async listReadinessScans(companyId: string): Promise<LncReadinessScanSummary[]> {
    const rows = await this.deps.db.query.lncReadinessScans.findMany({
      where: eq(lncReadinessScans.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 50,
    });
    return rows.map(toReadinessScanSummary);
  }

  async getReadinessScanDetail(companyId: string, scanId: string): Promise<LncReadinessScanDetailSummary | null> {
    const scan = await this.deps.db.query.lncReadinessScans.findFirst({
      where: and(eq(lncReadinessScans.companyId, companyId), eq(lncReadinessScans.id, scanId)),
    });
    if (!scan) return null;
    const results = await this.deps.db.query.lncReadinessCheckResults.findMany({
      where: eq(lncReadinessCheckResults.readinessScanId, scanId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return { ...toReadinessScanSummary(scan), results: results.map(toCheckResultSummary) };
  }

  async runReadinessScan(scope: StaffScope): Promise<LncReadinessScanDetailSummary> {
    const scanKey = `scan_${Date.now()}`;
    const [scan] = await this.deps.db
      .insert(lncReadinessScans)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        scanKey,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const checks = await this.buildReadinessChecks(scope);
    const results: LncReadinessCheckResultSummary[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let warningCount = 0;
    let criticalBlockerCount = 0;

    for (const check of checks) {
      const started = Date.now();
      try {
        const outcome = await check.run(scope.companyId);
        if (outcome.status === 'passed') passedCount += 1;
        else if (outcome.status === 'failed') failedCount += 1;
        else if (outcome.status === 'warning') warningCount += 1;
        if (outcome.severity === 'critical' && outcome.status !== 'passed') criticalBlockerCount += 1;

        const [result] = await this.deps.db
          .insert(lncReadinessCheckResults)
          .values({
            companyId: scope.companyId,
            readinessScanId: scan!.id,
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
        if (result) results.push(toCheckResultSummary(result));
      } catch (error) {
        failedCount += 1;
        criticalBlockerCount += 1;
        const [result] = await this.deps.db
          .insert(lncReadinessCheckResults)
          .values({
            companyId: scope.companyId,
            readinessScanId: scan!.id,
            checkKey: check.checkKey,
            checkName: check.checkName,
            category: check.category,
            status: 'failed',
            severity: 'critical',
            message: error instanceof Error ? error.message : 'Readiness check failed',
            durationMs: Date.now() - started,
          })
          .returning();
        if (result) results.push(toCheckResultSummary(result));
      }
    }

    const overallStatus = resolveOverallReadinessStatus(criticalBlockerCount, failedCount, warningCount, passedCount);
    const finalStatus: LncCheckStatus = criticalBlockerCount > 0 ? 'failed' : failedCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';

    const [updated] = await this.deps.db
      .update(lncReadinessScans)
      .set({
        status: finalStatus,
        overallStatus,
        checkCount: checks.length,
        passedCount,
        failedCount,
        warningCount,
        criticalBlockerCount,
        completedAt: new Date(),
      })
      .where(eq(lncReadinessScans.id, scan!.id))
      .returning();

    return { ...toReadinessScanSummary(updated ?? scan!), results };
  }

  private async buildReadinessChecks(scope: StaffScope): Promise<ReadinessCheck[]> {
    const companyId = scope.companyId;
    const opsRun = await this.deps.enterpriseProductionReadinessService.runReadinessChecks(companyId);
    const opsChecks: ReadinessCheck[] = (opsRun.checks ?? []).map((r) => ({
      checkKey: `ops_${r.checkKey}`,
      checkName: r.title,
      category: mapOpsCategory(r.category),
      run: async () => ({
        status: mapOpsStatus(r.status),
        severity: (r.status === 'critical' ? 'critical' : r.status === 'warning' ? 'warning' : 'info') as LncIssueSeverity,
        message: r.description,
        details: {},
      }),
    }));

    const platformChecks: ReadinessCheck[] = [
      {
        checkKey: 'authentication_configured',
        checkName: 'Authentication configuration',
        category: 'authentication',
        run: async () => ({
          status: this.deps.jwtSecret ? 'passed' : 'failed',
          severity: this.deps.jwtSecret ? 'info' : 'critical',
          message: this.deps.jwtSecret ? 'JWT authentication is configured.' : 'JWT secret is not configured.',
          recommendation: this.deps.jwtSecret ? undefined : 'Configure JWT_SECRET before go-live.',
        }),
      },
      {
        checkKey: 'database_connectivity',
        checkName: 'Database connectivity',
        category: 'database',
        run: async () => {
          const ok = this.deps.databaseUrl ? await checkDbConnection(this.deps.databaseUrl) : false;
          return {
            status: ok ? 'passed' : 'failed',
            severity: ok ? 'info' : 'critical',
            message: ok ? 'Database connection verified.' : 'Database connection failed.',
          };
        },
      },
      {
        checkKey: 'rbac_roles',
        checkName: 'RBAC roles configured',
        category: 'rbac',
        run: async () => {
          const [roleCount] = await this.deps.db.select({ value: count() }).from(roles).where(eq(roles.companyId, companyId));
          const countVal = Number(roleCount?.value ?? 0);
          return {
            status: countVal >= 2 ? 'passed' : countVal === 1 ? 'warning' : 'failed',
            severity: countVal >= 2 ? 'info' : countVal === 1 ? 'warning' : 'high',
            message: `${countVal} role(s) configured for tenant.`,
            recommendation: countVal < 2 ? 'Configure Owner, Admin, and Member roles before go-live.' : undefined,
          };
        },
      },
      {
        checkKey: 'tenant_users',
        checkName: 'Tenant user accounts',
        category: 'tenant',
        run: async () => {
          const [userCount] = await this.deps.db.select({ value: count() }).from(users).where(eq(users.companyId, companyId));
          const activeUsers = await this.deps.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
            columns: { id: true },
            limit: 5,
          });
          const countVal = Number(userCount?.value ?? 0);
          return {
            status: countVal > 0 ? 'passed' : 'failed',
            severity: countVal > 0 ? 'info' : 'critical',
            message: `${countVal} user(s), ${activeUsers.length} active.`,
            details: { userCount: countVal },
          };
        },
      },
      {
        checkKey: 'tenant_isolation',
        checkName: 'Tenant isolation',
        category: 'tenant',
        run: async () => {
          const [otherCompanyUsers] = await this.deps.db
            .select({ value: count() })
            .from(users)
            .where(and(eq(users.companyId, companyId), eq(users.isActive, true)));
          return {
            status: Number(otherCompanyUsers?.value ?? 0) > 0 ? 'passed' : 'warning',
            severity: 'info',
            message: 'Tenant-scoped user records verified.',
          };
        },
      },
      {
        checkKey: 'api_health',
        checkName: 'API health',
        category: 'api',
        run: async () => {
          const dashboard = await this.deps.enterpriseProductionReadinessService.getDashboard(companyId);
          const unhealthy = dashboard.systemHealth.filter((m) => m.status === 'unhealthy').length;
          return {
            status: unhealthy === 0 ? 'passed' : 'failed',
            severity: unhealthy === 0 ? 'info' : 'critical',
            message: unhealthy === 0 ? 'All monitored API modules healthy.' : `${unhealthy} unhealthy module(s).`,
          };
        },
      },
      {
        checkKey: 'background_workers',
        checkName: 'Background workers',
        category: 'workers',
        run: async () => {
          const jobs = await this.deps.db.query.automationQueueJobs.findMany({
            where: eq(automationQueueJobs.companyId, companyId),
            columns: { status: true },
            limit: 200,
          });
          const failed = jobs.filter((j) => j.status === 'failed').length;
          return {
            status: failed === 0 ? 'passed' : failed > 5 ? 'failed' : 'warning',
            severity: failed > 5 ? 'high' : failed > 0 ? 'warning' : 'info',
            message: `${jobs.length} queue job(s), ${failed} failed.`,
          };
        },
      },
      {
        checkKey: 'ai_providers',
        checkName: 'AI providers',
        category: 'ai',
        run: async () => {
          const hasProviders = await this.deps.aiProviderResilienceService.hasConfiguredProviders(companyId);
          const status = await this.deps.aiProviderResilienceService.getResilienceStatus(companyId);
          const unhealthy = status.providers.filter((p) => p.healthStatus !== 'healthy').length;
          return {
            status: hasProviders && unhealthy === 0 ? 'passed' : hasProviders ? 'warning' : 'failed',
            severity: !hasProviders ? 'critical' : unhealthy > 0 ? 'warning' : 'info',
            message: hasProviders
              ? `${status.providers.length} provider(s), ${unhealthy} unhealthy.`
              : 'No AI providers configured.',
          };
        },
      },
      {
        checkKey: 'connector_platform',
        checkName: 'Universal Connector Platform',
        category: 'connectors',
        run: async () => {
          const monitoring = await this.deps.integrationPlatformService.getMonitoringSummary(companyId);
          return {
            status: monitoring.errorServiceCount === 0 ? 'passed' : 'failed',
            severity: monitoring.errorServiceCount === 0 ? 'info' : 'high',
            message: `${monitoring.connectedServiceCount} connected, ${monitoring.errorServiceCount} error(s).`,
          };
        },
      },
      {
        checkKey: 'payment_providers',
        checkName: 'Payment providers',
        category: 'payments',
        run: async () => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const payments = connections.filter((c) =>
            ['stripe', 'paypal', 'square', 'payment'].some((p) => c.provider?.toLowerCase().includes(p)),
          );
          const active = payments.filter((c) => c.status === 'connected').length;
          return {
            status: active > 0 ? 'passed' : payments.length > 0 ? 'warning' : 'warning',
            severity: active > 0 ? 'info' : 'warning',
            message: active > 0 ? `${active} active payment integration(s).` : 'No active payment integrations configured.',
            recommendation: active === 0 ? 'Configure payment integration before accepting payments in production.' : undefined,
          };
        },
      },
      {
        checkKey: 'accounting_integrations',
        checkName: 'Accounting integrations',
        category: 'accounting',
        run: async () => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const accounting = connections.filter((c) =>
            ['xero', 'quickbooks', 'sage'].some((p) => c.provider?.toLowerCase().includes(p)),
          );
          const errors = accounting.filter((c) => c.status === 'error').length;
          return {
            status: errors === 0 ? 'passed' : 'failed',
            severity: errors > 0 ? 'high' : 'info',
            message:
              accounting.length === 0
                ? 'No accounting integrations configured.'
                : errors === 0
                  ? `${accounting.length} accounting integration(s) healthy.`
                  : `${errors} accounting integration(s) in error.`,
          };
        },
      },
      {
        checkKey: 'fleet_integrations',
        checkName: 'Fleet integrations',
        category: 'fleet',
        run: async () => {
          const connections = await this.deps.db.query.integrationConnections.findMany({
            where: eq(integrationConnections.companyId, companyId),
          });
          const fleet = connections.filter((c) => c.provider?.toLowerCase().includes('fleet') || c.provider?.toLowerCase().includes('vehicle'));
          return {
            status: fleet.every((c) => c.status !== 'error') ? 'passed' : 'warning',
            severity: fleet.some((c) => c.status === 'error') ? 'warning' : 'info',
            message: fleet.length === 0 ? 'No fleet integrations configured.' : `${fleet.length} fleet integration(s).`,
          };
        },
      },
      {
        checkKey: 'communications',
        checkName: 'Communications providers',
        category: 'communications',
        run: async () => {
          const adapters = await this.deps.db.query.ucProviderAdapters.findMany({
            where: eq(ucProviderAdapters.companyId, companyId),
            columns: { channel: true, status: true },
          });
          const commChannels = adapters.filter((a) => ['email', 'sms', 'whatsapp'].includes(a.channel));
          const active = commChannels.filter((a) => a.status === 'active').length;
          return {
            status: active > 0 ? 'passed' : 'warning',
            severity: active > 0 ? 'info' : 'warning',
            message: `${active} active communication provider(s).`,
          };
        },
      },
      {
        checkKey: 'notifications',
        checkName: 'Notification platform',
        category: 'notifications',
        run: async () => {
          const dashboard = await this.deps.enterpriseNotificationsService.getDashboard(scope);
          const failed = dashboard.notificationHealth.failedDeliveryCount ?? 0;
          return {
            status: failed === 0 ? 'passed' : 'warning',
            severity: failed > 0 ? 'warning' : 'info',
            message: `${dashboard.openAlertCount ?? 0} alert(s), ${failed} failed delivery(s).`,
          };
        },
      },
      {
        checkKey: 'document_ai',
        checkName: 'Document AI',
        category: 'document_ai',
        run: async () => {
          const dashboard = await this.deps.enterpriseDocumentAiService.getDashboard(companyId);
          const failed = dashboard.processingHealth.failedOcrCount ?? 0;
          return {
            status: failed === 0 ? 'passed' : 'warning',
            severity: failed > 0 ? 'warning' : 'info',
            message: `${dashboard.documentsStats.documentCount ?? 0} document(s), ${failed} failed OCR.`,
          };
        },
      },
      {
        checkKey: 'backup_verification',
        checkName: 'Backup verification',
        category: 'backup',
        run: async () => {
          const bc = await this.deps.enterpriseBusinessContinuityService.getDashboard(companyId);
          const enabled = bc.backupPolicies.filter((p) => p.isEnabled).length;
          const recentSuccess = bc.backupJobs.some((j) => j.status === 'completed' || j.status === 'verified');
          return {
            status: enabled > 0 && recentSuccess ? 'passed' : enabled > 0 ? 'warning' : 'failed',
            severity: enabled === 0 ? 'critical' : !recentSuccess ? 'high' : 'info',
            message: `${enabled} enabled backup policy/policies, recent success: ${recentSuccess ? 'yes' : 'no'}.`,
          };
        },
      },
      {
        checkKey: 'disaster_recovery',
        checkName: 'Disaster recovery readiness',
        category: 'disaster_recovery',
        run: async () => {
          const bc = await this.deps.enterpriseBusinessContinuityService.getDashboard(companyId);
          const plans = bc.recoveryPlans.length;
          const tests = bc.recoveryTests.filter((t) => t.status === 'passed').length;
          return {
            status: plans > 0 && tests > 0 ? 'passed' : plans > 0 ? 'warning' : 'failed',
            severity: plans === 0 ? 'critical' : tests === 0 ? 'high' : 'info',
            message: `${plans} recovery plan(s), ${tests} passed test(s).`,
          };
        },
      },
      {
        checkKey: 'monitoring',
        checkName: 'Monitoring coverage',
        category: 'monitoring',
        run: async () => {
          const dashboard = await this.deps.enterprisePlatformHealthService.getDashboard(companyId);
          return {
            status: dashboard.overallPlatformHealthStatus === 'critical' ? 'failed' : dashboard.overallPlatformHealthStatus === 'degraded' ? 'warning' : 'passed',
            severity: dashboard.overallPlatformHealthStatus === 'critical' ? 'critical' : dashboard.overallPlatformHealthStatus === 'degraded' ? 'warning' : 'info',
            message: `Platform health: ${dashboard.overallPlatformHealthStatus}.`,
          };
        },
      },
      {
        checkKey: 'audit_logging',
        checkName: 'Audit logging',
        category: 'audit',
        run: async () => {
          const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const [auditCount] = await this.deps.db
            .select({ value: count() })
            .from(securityAuditLogs)
            .where(and(eq(securityAuditLogs.companyId, companyId), gte(securityAuditLogs.occurredAt, since30d)));
          const countVal = Number(auditCount?.value ?? 0);
          return {
            status: countVal > 0 ? 'passed' : 'warning',
            severity: countVal > 0 ? 'info' : 'warning',
            message: `${countVal} security audit log(s) in last 30 days.`,
          };
        },
      },
      {
        checkKey: 'security_readiness',
        checkName: 'Security readiness',
        category: 'security',
        run: async () => {
          const security = await this.deps.enterpriseSecurityService.getExecutiveDashboard(companyId);
          return {
            status: security.riskAlertCount === 0 ? 'passed' : 'warning',
            severity: security.riskAlertCount > 0 ? 'high' : 'info',
            message: `${security.riskAlertCount} risk alert(s), score ${security.securityScore ?? '—'}.`,
          };
        },
      },
      {
        checkKey: 'mobile_readiness',
        checkName: 'Mobile readiness',
        category: 'mobile',
        run: async () => {
          const saas = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
          const mobileFlag = saas.featureFlags.some((f) => f.flagKey.toLowerCase().includes('mobile') && (f.tenantEnabled ?? f.defaultEnabled));
          return {
            status: mobileFlag || saas.tenantProfile?.lifecycleStatus === 'active' ? 'passed' : 'warning',
            severity: mobileFlag ? 'info' : 'warning',
            message: mobileFlag ? 'Mobile feature flag enabled.' : 'Mobile readiness not fully configured.',
          };
        },
      },
      {
        checkKey: 'saas_readiness',
        checkName: 'SaaS readiness',
        category: 'saas',
        run: async () => {
          const saas = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
          const subscription = saas.subscription;
          return {
            status: subscription?.status === 'active' ? 'passed' : subscription ? 'warning' : 'warning',
            severity: subscription?.status === 'active' ? 'info' : 'warning',
            message: subscription ? `Subscription: ${subscription.status}.` : 'No subscription configured.',
          };
        },
      },
    ];

    return [...opsChecks, ...platformChecks];
  }
}

function mapOpsCategory(category: string): LncCheckCategory {
  const map: Record<string, LncCheckCategory> = {
    infrastructure: 'infrastructure',
    security: 'security',
    integrations: 'integration',
    ai: 'ai',
    disaster_recovery: 'disaster_recovery',
  };
  return map[category] ?? 'platform';
}

function mapOpsStatus(status: string): LncCheckStatus {
  if (status === 'ready') return 'passed';
  if (status === 'critical') return 'failed';
  if (status === 'warning') return 'warning';
  if (status === 'unknown') return 'skipped';
  return 'pending';
}

function resolveOverallReadinessStatus(
  criticalBlockerCount: number,
  failedCount: number,
  warningCount: number,
  passedCount: number,
): LncReadinessStatus {
  if (criticalBlockerCount > 0) return 'blocked';
  if (failedCount > 0) return 'not_ready';
  if (warningCount > 0) return 'warning';
  if (passedCount > 0) return 'ready';
  return 'unknown';
}

function toReadinessScanSummary(row: typeof lncReadinessScans.$inferSelect): LncReadinessScanSummary {
  return {
    id: row.id,
    scanKey: row.scanKey,
    status: row.status,
    overallStatus: row.overallStatus,
    checkCount: row.checkCount,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    warningCount: row.warningCount,
    criticalBlockerCount: row.criticalBlockerCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCheckResultSummary(row: typeof lncReadinessCheckResults.$inferSelect): LncReadinessCheckResultSummary {
  return {
    id: row.id,
    readinessScanId: row.readinessScanId,
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
