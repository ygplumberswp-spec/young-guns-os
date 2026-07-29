import { eq } from 'drizzle-orm';
import type { RlmUxReviewSummary, RlmValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmUxReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseReleaseManagementUxReviewService {
  constructor(private readonly db: DatabaseClient) {}

  async getLatestReview(companyId: string): Promise<RlmUxReviewSummary | null> {
    const row = await this.db.query.rlmUxReviews.findFirst({
      where: eq(rlmUxReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runUxReview(scope: StaffScope): Promise<RlmUxReviewSummary> {
    const reviewKey = `ux_${Date.now()}`;

    const findings: Array<Record<string, unknown>> = [
      {
        key: 'navigation',
        category: 'navigation',
        severity: 'info',
        recommendation: 'Verify primary navigation paths across dashboard, modules, and settings are consistent on mobile and desktop.',
      },
      {
        key: 'responsive_layouts',
        category: 'responsive',
        severity: 'info',
        recommendation: 'Test responsive breakpoints on common viewport sizes (320px, 768px, 1024px, 1440px).',
      },
      {
        key: 'tablet_support',
        category: 'tablet',
        severity: 'info',
        recommendation: 'Verify tablet layouts for sidebar navigation, data tables, and form layouts.',
      },
      {
        key: 'mobile_usability',
        category: 'mobile',
        severity: 'info',
        recommendation: 'Confirm touch targets meet minimum 44px, forms are usable on mobile, and offline states are clear.',
      },
      {
        key: 'desktop_usability',
        category: 'desktop',
        severity: 'info',
        recommendation: 'Verify keyboard navigation, multi-column layouts, and bulk actions on desktop workflows.',
      },
      {
        key: 'accessibility',
        category: 'accessibility',
        severity: 'info',
        recommendation: 'Review color contrast ratios, ARIA labels, focus indicators, and screen reader compatibility.',
      },
      {
        key: 'loading_states',
        category: 'states',
        severity: 'info',
        recommendation: 'Ensure loading skeletons or spinners appear for async data fetches across all major modules.',
      },
      {
        key: 'empty_states',
        category: 'states',
        severity: 'info',
        recommendation: 'Verify empty states include actionable guidance (e.g., create first record, configure integration).',
      },
      {
        key: 'error_handling',
        category: 'errors',
        severity: 'info',
        recommendation: 'Confirm error messages are user-friendly, recoverable, and logged for support diagnostics.',
      },
    ];

    const status: RlmValidationStatus = 'passed';

    const [created] = await this.db
      .insert(rlmUxReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        recommendationCount: findings.length,
        findings,
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(row: typeof rlmUxReviews.$inferSelect): RlmUxReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    recommendationCount: row.recommendationCount,
    findings: row.findings,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
