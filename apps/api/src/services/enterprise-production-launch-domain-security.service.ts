import { eq } from 'drizzle-orm';
import type { PlDomainSecurityReviewSummary, PlValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { plDomainSecurityReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

type DomainSecurityDeps = {
  db: DatabaseClient;
  appUrl?: string;
  apiPublicUrl?: string;
  nodeEnv?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  encryptionKey?: string;
  enterpriseSecurityService: import('./enterprise-security.service.js').EnterpriseSecurityService;
};

export class EnterpriseProductionLaunchDomainSecurityService {
  constructor(private readonly deps: DomainSecurityDeps) {}

  async getLatestReview(companyId: string): Promise<PlDomainSecurityReviewSummary | null> {
    const row = await this.deps.db.query.plDomainSecurityReviews.findFirst({
      where: eq(plDomainSecurityReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runDomainSecurityReview(scope: StaffScope): Promise<PlDomainSecurityReviewSummary> {
    const reviewKey = `domain_${Date.now()}`;
    const findings: Array<Record<string, unknown>> = [];
    const isProduction = this.deps.nodeEnv === 'production';

    if (this.deps.appUrl) {
      const usesHttps = this.deps.appUrl.startsWith('https://');
      findings.push({
        key: 'production_domain_https',
        severity: isProduction && !usesHttps ? 'critical' : usesHttps ? 'info' : 'warning',
        message: usesHttps ? 'APP_URL uses HTTPS.' : 'APP_URL should use HTTPS in production.',
      });
    } else {
      findings.push({
        key: 'production_domain',
        severity: 'critical',
        message: 'APP_URL not configured.',
      });
    }

    if (this.deps.apiPublicUrl) {
      findings.push({
        key: 'api_public_url',
        severity: this.deps.apiPublicUrl.startsWith('https://') ? 'info' : 'warning',
        message: `API public URL: ${this.deps.apiPublicUrl}`,
      });
    }

    findings.push({
      key: 'cors',
      severity: this.deps.appUrl ? 'info' : 'warning',
      message: this.deps.appUrl
        ? `CORS restricted to APP_URL (${this.deps.appUrl}).`
        : 'CORS origin depends on APP_URL configuration.',
    });

    findings.push({
      key: 'session_security',
      severity: isProduction ? 'info' : 'warning',
      message: isProduction
        ? 'Production cookie security enabled via auth middleware.'
        : 'Run with NODE_ENV=production for secure cookies.',
    });

    findings.push({
      key: 'jwt_secrets',
      severity: this.deps.jwtSecret && this.deps.jwtRefreshSecret ? 'info' : 'critical',
      message:
        this.deps.jwtSecret && this.deps.jwtRefreshSecret
          ? 'JWT secrets configured.'
          : 'JWT secrets missing.',
    });

    findings.push({
      key: 'secret_management',
      severity: this.deps.encryptionKey ? 'info' : 'warning',
      message: this.deps.encryptionKey
        ? 'Integration encryption key configured.'
        : 'Integration encryption key not set — credentials may use fallback.',
    });

    const securityDashboard = await this.deps.enterpriseSecurityService.getExecutiveDashboard(
      scope.companyId,
    );
    findings.push({
      key: 'security_platform',
      severity: securityDashboard.riskAlertCount > 0 ? 'high' : 'info',
      message: `Security score ${securityDashboard.securityScore ?? '—'}, ${securityDashboard.riskAlertCount} risk alert(s).`,
    });

    findings.push({
      key: 'note',
      severity: 'info',
      message: 'Domain and security review — findings only, no configuration changes applied.',
    });

    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter(
      (f) => f.severity === 'warning' || f.severity === 'high',
    ).length;
    const status: PlValidationStatus =
      criticalCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed';

    const [created] = await this.deps.db
      .insert(plDomainSecurityReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        findingCount: findings.length,
        criticalCount,
        warningCount,
        findings,
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(
  row: typeof plDomainSecurityReviews.$inferSelect,
): PlDomainSecurityReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    findingCount: row.findingCount,
    criticalCount: row.criticalCount,
    warningCount: row.warningCount,
    findings: (row.findings ?? []) as Array<Record<string, unknown>>,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
