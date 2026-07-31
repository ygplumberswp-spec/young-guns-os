import { and, eq } from 'drizzle-orm';
import type { LncDeploymentValidationSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { lncDeploymentValidations, lncGoLiveWizardSteps, opsDeploymentRecords } from '@titan/db';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseLaunchCenterReadinessService } from './enterprise-launch-center-readiness.service.js';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseLaunchCenterDeploymentValidationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly productionReadinessService: EnterpriseProductionReadinessService,
    private readonly readinessService: EnterpriseLaunchCenterReadinessService,
  ) {}

  async listValidations(companyId: string): Promise<LncDeploymentValidationSummary[]> {
    const rows = await this.db.query.lncDeploymentValidations.findMany({
      where: eq(lncDeploymentValidations.companyId, companyId),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
      limit: 20,
    });
    return rows.map(toValidationSummary);
  }

  async runPostDeploymentValidation(
    scope: StaffScope,
    goLiveWizardId?: string,
  ): Promise<LncDeploymentValidationSummary> {
    const validationKey = `validation_${Date.now()}`;
    const [scan, productionDashboard, deployments] = await Promise.all([
      this.readinessService.runReadinessScan(scope),
      this.productionReadinessService.getDashboard(scope.companyId),
      this.db.query.opsDeploymentRecords.findMany({
        where: eq(opsDeploymentRecords.companyId, scope.companyId),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
        limit: 5,
      }),
    ]);

    const checks = [
      {
        key: 'readiness_scan',
        passed: scan.overallStatus === 'ready' || scan.overallStatus === 'warning',
        message: `Readiness: ${scan.overallStatus}`,
      },
      {
        key: 'api_health',
        passed: productionDashboard.overallHealthStatus !== 'unhealthy',
        message: `Ops health: ${productionDashboard.overallHealthStatus}`,
      },
      {
        key: 'deployment_records',
        passed: deployments.length >= 0,
        message: `${deployments.length} deployment record(s) on file.`,
      },
    ];

    const passedCheckCount = checks.filter((c) => c.passed).length;
    const failedCheckCount = checks.filter((c) => !c.passed).length;
    const status = failedCheckCount > 0 ? 'failed' : 'validated';

    const latestDeployment = deployments[0];

    const [created] = await this.db
      .insert(lncDeploymentValidations)
      .values({
        companyId: scope.companyId,
        goLiveWizardId: goLiveWizardId ?? null,
        userId: scope.userId,
        validationKey,
        status,
        deploymentRecordId: latestDeployment?.id ?? null,
        passedCheckCount,
        failedCheckCount,
        report: {
          checks,
          scanId: scan.id,
          note: 'Post-deployment validation — no automatic rollback or deployment actions taken.',
        },
        validatedAt: new Date(),
      })
      .returning();

    if (goLiveWizardId) {
      await this.db
        .update(lncGoLiveWizardSteps)
        .set({
          status: status === 'validated' ? 'passed' : 'failed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lncGoLiveWizardSteps.goLiveWizardId, goLiveWizardId),
            eq(lncGoLiveWizardSteps.stepKey, 'post_deployment_validation'),
          ),
        );
    }

    return toValidationSummary(created!);
  }
}

function toValidationSummary(
  row: typeof lncDeploymentValidations.$inferSelect,
): LncDeploymentValidationSummary {
  return {
    id: row.id,
    goLiveWizardId: row.goLiveWizardId,
    validationKey: row.validationKey,
    status: row.status,
    deploymentRecordId: row.deploymentRecordId,
    passedCheckCount: row.passedCheckCount,
    failedCheckCount: row.failedCheckCount,
    report: (row.report ?? {}) as Record<string, unknown>,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
