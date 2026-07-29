import { and, eq } from 'drizzle-orm';
import type {
  RcConfigurationReviewSummary,
  RcReleaseCandidateReportSummary,
  RcReleaseChecklistItemSummary,
  RcReleaseStatus,
  RcSecurityVerificationRunSummary,
  RcValidationStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  rcConfigurationReviews,
  rcReleaseCandidateReports,
  rcReleaseChecklistItems,
  rcSecurityVerificationRuns,
  ucProviderAdapters,
} from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const DEFAULT_CHECKLIST = [
  { itemKey: 'integration_validation', itemName: 'Integration validation complete', category: 'validation', isRequired: true },
  { itemKey: 'workflow_validation', itemName: 'Workflow validation complete', category: 'validation', isRequired: true },
  { itemKey: 'security_verification', itemName: 'Security verification complete', category: 'security', isRequired: true },
  { itemKey: 'configuration_review', itemName: 'Configuration review complete', category: 'configuration', isRequired: true },
  { itemKey: 'performance_review', itemName: 'Performance optimization review', category: 'performance', isRequired: false },
  { itemKey: 'backup_verified', itemName: 'Backup verification', category: 'continuity', isRequired: true },
  { itemKey: 'launch_center_approved', itemName: 'Launch Center go-live approved', category: 'release', isRequired: true },
  { itemKey: 'manual_smoke_test', itemName: 'Manual smoke test in staging', category: 'manual', isRequired: true },
  { itemKey: 'release_notes', itemName: 'Release notes prepared', category: 'documentation', isRequired: false },
  { itemKey: 'owner_sign_off', itemName: 'Owner sign-off for production release', category: 'release', isRequired: true },
];

type ReleaseCandidateDeps = {
  db: DatabaseClient;
  databaseUrl?: string;
  jwtSecret?: string;
  encryptionKey?: string;
  enterpriseSecurityService: import('./enterprise-security.service.js').EnterpriseSecurityService;
  enterpriseLaunchCenterService: import('./enterprise-launch-center.service.js').EnterpriseLaunchCenterService;
  integrationValidationService: import('./enterprise-release-center-integration-validation.service.js').EnterpriseReleaseCenterIntegrationValidationService;
  workflowValidationService: import('./enterprise-release-center-workflow-validation.service.js').EnterpriseReleaseCenterWorkflowValidationService;
  performanceService: import('./enterprise-release-center-performance.service.js').EnterpriseReleaseCenterPerformanceService;
};

export class EnterpriseReleaseCenterReleaseCandidateService {
  constructor(private readonly deps: ReleaseCandidateDeps) {}

  async ensureChecklist(companyId: string): Promise<void> {
    for (const item of DEFAULT_CHECKLIST) {
      const existing = await this.deps.db.query.rcReleaseChecklistItems.findFirst({
        where: and(eq(rcReleaseChecklistItems.companyId, companyId), eq(rcReleaseChecklistItems.itemKey, item.itemKey)),
      });
      if (!existing) {
        await this.deps.db.insert(rcReleaseChecklistItems).values({ companyId, ...item });
      }
    }
  }

  async listChecklist(companyId: string): Promise<RcReleaseChecklistItemSummary[]> {
    await this.ensureChecklist(companyId);
    const rows = await this.deps.db.query.rcReleaseChecklistItems.findMany({
      where: eq(rcReleaseChecklistItems.companyId, companyId),
      orderBy: (i, { asc }) => [asc(i.itemName)],
    });
    return rows.map(toChecklistSummary);
  }

  async runSecurityVerification(scope: StaffScope): Promise<RcSecurityVerificationRunSummary> {
    const runKey = `security_${Date.now()}`;
    const dashboard = await this.deps.enterpriseSecurityService.getExecutiveDashboard(scope.companyId);
    const findings = [
      { key: 'risk_alerts', count: dashboard.riskAlertCount, severity: dashboard.riskAlertCount > 0 ? 'high' : 'info' },
      { key: 'failed_logins_24h', count: dashboard.failedLoginCount24h, severity: dashboard.failedLoginCount24h > 10 ? 'warning' : 'info' },
      { key: 'mfa_adoption', value: dashboard.mfaAdoptionPercent, severity: dashboard.mfaAdoptionPercent != null && dashboard.mfaAdoptionPercent < 50 ? 'warning' : 'info' },
      { key: 'audit_events_24h', count: dashboard.auditEventCount24h, severity: dashboard.auditEventCount24h === 0 ? 'warning' : 'info' },
      { key: 'encryption', status: dashboard.encryption.integrationCredentialsEncrypted ? 'configured' : 'missing', severity: dashboard.encryption.integrationCredentialsEncrypted ? 'info' : 'critical' },
    ];
    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter((f) => f.severity === 'warning' || f.severity === 'high').length;
    const status: RcValidationStatus = criticalCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';

    const [created] = await this.deps.db
      .insert(rcSecurityVerificationRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        runKey,
        status,
        findingCount: findings.length,
        criticalCount,
        warningCount,
        report: { findings, securityScore: dashboard.securityScore, note: 'Findings only — no security changes applied.' },
        completedAt: new Date(),
      })
      .returning();

    return toSecuritySummary(created!);
  }

  async runConfigurationReview(scope: StaffScope): Promise<RcConfigurationReviewSummary> {
    const reviewKey = `config_${Date.now()}`;
    const findings: Array<Record<string, unknown>> = [];

    if (!this.deps.databaseUrl) findings.push({ key: 'DATABASE_URL', severity: 'critical', message: 'DATABASE_URL not configured.' });
    if (!this.deps.jwtSecret) findings.push({ key: 'JWT_SECRET', severity: 'critical', message: 'JWT_SECRET not configured.' });
    if (!this.deps.encryptionKey) findings.push({ key: 'INTEGRATIONS_ENCRYPTION_KEY', severity: 'warning', message: 'Integration encryption key not configured.' });

    const [connections, adapters] = await Promise.all([
      this.deps.db.query.integrationConnections.findMany({ where: eq(integrationConnections.companyId, scope.companyId) }),
      this.deps.db.query.ucProviderAdapters.findMany({ where: eq(ucProviderAdapters.companyId, scope.companyId) }),
    ]);

    if (connections.filter((c) => c.status === 'error').length > 0) {
      findings.push({ key: 'integration_errors', severity: 'high', message: `${connections.filter((c) => c.status === 'error').length} integration(s) in error.` });
    }
    if (adapters.filter((a) => a.status === 'active').length === 0) {
      findings.push({ key: 'provider_adapters', severity: 'warning', message: 'No active UC provider adapters configured.' });
    }

    const missingConfigCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter((f) => f.severity === 'warning' || f.severity === 'high').length;

    const [created] = await this.deps.db
      .insert(rcConfigurationReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        missingConfigCount,
        warningCount,
        findings,
      })
      .returning();

    return toConfigSummary(created!);
  }

  async generateReleaseReport(scope: StaffScope): Promise<RcReleaseCandidateReportSummary> {
    const [integrationRun, workflowRun, securityRun, configReview, performanceSnapshot, launchDashboard, checklist] =
      await Promise.all([
        this.deps.integrationValidationService.runIntegrationValidation(scope),
        this.deps.workflowValidationService.runWorkflowValidation(scope),
        this.runSecurityVerification(scope),
        this.runConfigurationReview(scope),
        this.deps.performanceService.capturePerformanceSnapshot(scope),
        this.deps.enterpriseLaunchCenterService.getDashboard(scope.companyId),
        this.listChecklist(scope.companyId),
      ]);

    const passedValidationCount = integrationRun.passedCount + workflowRun.passedCount;
    const failedValidationCount = integrationRun.failedCount + workflowRun.failedCount;
    const warningCount = integrationRun.warningCount + workflowRun.warningCount + securityRun.warningCount + configReview.warningCount;
    const optimizationCount = performanceSnapshot.optimizationOpportunities.length;
    const manualTaskCount = checklist.filter((i) => i.status === 'pending' && i.isRequired).length;

    const criticalBlockers = integrationRun.failedCount + workflowRun.failedCount + securityRun.criticalCount + configReview.missingConfigCount;
    const overallStatus: RcReleaseStatus =
      criticalBlockers > 0 ? 'blocked' : failedValidationCount > 0 ? 'not_ready' : warningCount > 0 ? 'warning' : 'ready';

    let readinessScore: number | null = null;
    if (criticalBlockers > 0) readinessScore = 0;
    else {
      const total = integrationRun.checkCount + workflowRun.stepCount;
      readinessScore = total > 0 ? Math.round((passedValidationCount / total) * 100) : null;
    }

    const reportKey = `release_${Date.now()}`;
    const report = {
      integrationRun: { id: integrationRun.id, status: integrationRun.status, failedCount: integrationRun.failedCount },
      workflowRun: { id: workflowRun.id, status: workflowRun.status, failedCount: workflowRun.failedCount },
      securityRun: { id: securityRun.id, status: securityRun.status, criticalCount: securityRun.criticalCount },
      configReview: { id: configReview.id, missingConfigCount: configReview.missingConfigCount },
      performanceSnapshot: { id: performanceSnapshot.id, optimizationCount },
      launchReadiness: launchDashboard.launchReadiness,
      remainingManualTasks: checklist.filter((i) => i.status === 'pending').map((i) => i.itemName),
      note: 'Release candidate report — no automatic deployment.',
    };

    const [created] = await this.deps.db
      .insert(rcReleaseCandidateReports)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reportKey,
        readinessScore,
        overallStatus,
        passedValidationCount,
        failedValidationCount,
        warningCount,
        optimizationCount,
        manualTaskCount,
        report,
      })
      .returning();

    await this.updateChecklistFromReport(scope.companyId, integrationRun.status, workflowRun.status, securityRun.status, configReview.missingConfigCount === 0);

    return toReportSummary(created!);
  }

  async getLatestReport(companyId: string): Promise<RcReleaseCandidateReportSummary | null> {
    const row = await this.deps.db.query.rcReleaseCandidateReports.findFirst({
      where: eq(rcReleaseCandidateReports.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.generatedAt)],
    });
    return row ? toReportSummary(row) : null;
  }

  async getLatestSecurityVerification(companyId: string): Promise<RcSecurityVerificationRunSummary | null> {
    const row = await this.deps.db.query.rcSecurityVerificationRuns.findFirst({
      where: eq(rcSecurityVerificationRuns.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return row ? toSecuritySummary(row) : null;
  }

  async getLatestConfigurationReview(companyId: string): Promise<RcConfigurationReviewSummary | null> {
    const row = await this.deps.db.query.rcConfigurationReviews.findFirst({
      where: eq(rcConfigurationReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toConfigSummary(row) : null;
  }

  private async updateChecklistFromReport(
    companyId: string,
    integrationStatus: RcValidationStatus,
    workflowStatus: RcValidationStatus,
    securityStatus: RcValidationStatus,
    configOk: boolean,
  ) {
    const updates: Array<[string, RcValidationStatus | boolean]> = [
      ['integration_validation', integrationStatus],
      ['workflow_validation', workflowStatus],
      ['security_verification', securityStatus],
      ['configuration_review', configOk],
    ];
    for (const [key, ok] of updates) {
      const passed = typeof ok === 'boolean' ? ok : ok === 'passed';
      await this.deps.db
        .update(rcReleaseChecklistItems)
        .set({ status: passed ? 'passed' : 'failed', completedAt: passed ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(rcReleaseChecklistItems.companyId, companyId), eq(rcReleaseChecklistItems.itemKey, key)));
    }
  }
}

function toChecklistSummary(row: typeof rcReleaseChecklistItems.$inferSelect): RcReleaseChecklistItemSummary {
  return {
    id: row.id,
    itemKey: row.itemKey,
    itemName: row.itemName,
    category: row.category,
    status: row.status,
    isRequired: row.isRequired,
    notes: row.notes,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toSecuritySummary(row: typeof rcSecurityVerificationRuns.$inferSelect): RcSecurityVerificationRunSummary {
  return {
    id: row.id,
    runKey: row.runKey,
    status: row.status,
    findingCount: row.findingCount,
    criticalCount: row.criticalCount,
    warningCount: row.warningCount,
    report: (row.report ?? {}) as Record<string, unknown>,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConfigSummary(row: typeof rcConfigurationReviews.$inferSelect): RcConfigurationReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    missingConfigCount: row.missingConfigCount,
    warningCount: row.warningCount,
    findings: (row.findings ?? []) as Array<Record<string, unknown>>,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}

function toReportSummary(row: typeof rcReleaseCandidateReports.$inferSelect): RcReleaseCandidateReportSummary {
  return {
    id: row.id,
    reportKey: row.reportKey,
    readinessScore: row.readinessScore,
    overallStatus: row.overallStatus,
    passedValidationCount: row.passedValidationCount,
    failedValidationCount: row.failedValidationCount,
    warningCount: row.warningCount,
    optimizationCount: row.optimizationCount,
    manualTaskCount: row.manualTaskCount,
    report: (row.report ?? {}) as Record<string, unknown>,
    generatedAt: row.generatedAt.toISOString(),
  };
}
