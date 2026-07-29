import { eq } from 'drizzle-orm';
import type { PlCommercialReadinessReviewSummary, PlValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { plCommercialReadinessReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseProductionLaunchCommercialService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly saasManagementService: import('./enterprise-saas-management.service.js').EnterpriseSaasManagementService,
  ) {}

  async getLatestReview(companyId: string): Promise<PlCommercialReadinessReviewSummary | null> {
    const row = await this.db.query.plCommercialReadinessReviews.findFirst({
      where: eq(plCommercialReadinessReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runCommercialReadinessReview(scope: StaffScope): Promise<PlCommercialReadinessReviewSummary> {
    const reviewKey = `commercial_${Date.now()}`;
    const dashboard = await this.saasManagementService.getDashboard(scope.companyId);

    const findings: Array<Record<string, unknown>> = [
      {
        key: 'subscriptions',
        severity: dashboard.activeSubscriptionCount > 0 ? 'info' : 'warning',
        message: `${dashboard.activeSubscriptionCount} active subscription(s).`,
      },
      {
        key: 'billing',
        severity: dashboard.failedPaymentCount > 0 ? 'high' : 'info',
        message: `Billing health: ${dashboard.overallBillingHealthStatus}, ${dashboard.failedPaymentCount} failed payment(s).`,
      },
      {
        key: 'licenses',
        severity: dashboard.licenseCount > 0 ? 'info' : 'warning',
        message: `${dashboard.licenseCount} license(s) configured.`,
      },
      {
        key: 'tenant_provisioning',
        severity: dashboard.tenants.length > 0 ? 'info' : 'warning',
        message: `${dashboard.tenants.length} tenant(s) tracked.`,
      },
      {
        key: 'plans',
        severity: dashboard.plans.length > 0 ? 'info' : 'warning',
        message: `${dashboard.plans.length} subscription plan(s) available.`,
      },
      {
        key: 'onboarding',
        severity: dashboard.usageMonitoring.userCount > 0 ? 'info' : 'warning',
        message: `${dashboard.usageMonitoring.userCount} user(s) — verify onboarding flows.`,
      },
    ];

    const warningCount = findings.filter((f) => f.severity === 'warning' || f.severity === 'high').length;
    const status: PlValidationStatus = findings.some((f) => f.severity === 'high') ? 'warning' : warningCount > 0 ? 'warning' : 'passed';

    const [created] = await this.db
      .insert(plCommercialReadinessReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        findingCount: findings.length,
        warningCount,
        report: {
          findings,
          activeSubscriptionCount: dashboard.activeSubscriptionCount,
          failedPaymentCount: dashboard.failedPaymentCount,
          licenseCount: dashboard.licenseCount,
          overallBillingHealthStatus: dashboard.overallBillingHealthStatus,
        },
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(row: typeof plCommercialReadinessReviews.$inferSelect): PlCommercialReadinessReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    findingCount: row.findingCount,
    warningCount: row.warningCount,
    report: (row.report ?? {}) as Record<string, unknown>,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
