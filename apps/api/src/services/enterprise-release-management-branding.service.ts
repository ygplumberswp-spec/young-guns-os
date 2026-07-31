import { eq } from 'drizzle-orm';
import type { RlmBrandingReviewSummary, RlmValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmBrandingReviews, saasBrandingProfiles } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseReleaseManagementBrandingService {
  constructor(private readonly db: DatabaseClient) {}

  async getLatestReview(companyId: string): Promise<RlmBrandingReviewSummary | null> {
    const row = await this.db.query.rlmBrandingReviews.findFirst({
      where: eq(rlmBrandingReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runBrandingReview(scope: StaffScope): Promise<RlmBrandingReviewSummary> {
    const reviewKey = `branding_${Date.now()}`;
    const brandingProfile = await this.db.query.saasBrandingProfiles.findFirst({
      where: eq(saasBrandingProfiles.companyId, scope.companyId),
    });

    const mobileBranding = (brandingProfile?.mobileBranding ?? {}) as Record<string, unknown>;
    const portalBranding = (brandingProfile?.portalBranding ?? {}) as Record<string, unknown>;
    const loginBranding = (brandingProfile?.loginBranding ?? {}) as Record<string, unknown>;

    const findings: Array<Record<string, unknown>> = [
      {
        key: 'logo',
        severity: brandingProfile?.logoUrl ? 'info' : 'warning',
        message: brandingProfile?.logoUrl
          ? 'Logo URL configured in branding profile.'
          : 'Logo not configured — verify logo asset for app stores and web portal.',
      },
      {
        key: 'icons',
        severity: mobileBranding.iconUrl || brandingProfile?.logoUrl ? 'info' : 'warning',
        message: mobileBranding.iconUrl
          ? 'Mobile icon configured in branding profile.'
          : 'Mobile app icon not explicitly configured — verify icon assets for iOS and Android.',
      },
      {
        key: 'splash_screen',
        severity: mobileBranding.splashScreenUrl || mobileBranding.splashColor ? 'info' : 'warning',
        message:
          mobileBranding.splashScreenUrl || mobileBranding.splashColor
            ? 'Splash screen configuration present in mobile branding.'
            : 'Splash screen not configured — verify splash assets for mobile launch.',
      },
      {
        key: 'colors',
        severity: brandingProfile?.primaryColor ? 'info' : 'warning',
        message: brandingProfile?.primaryColor
          ? `Primary color configured: ${brandingProfile.primaryColor}.`
          : 'Primary color not configured — verify brand color consistency.',
      },
      {
        key: 'typography',
        severity: portalBranding.fontFamily || loginBranding.fontFamily ? 'info' : 'warning',
        message:
          portalBranding.fontFamily || loginBranding.fontFamily
            ? 'Custom typography configured in branding profile.'
            : 'Typography using defaults — verify font consistency across platforms.',
      },
      {
        key: 'white_label_branding',
        severity: brandingProfile ? 'info' : 'warning',
        message: brandingProfile
          ? 'White-label branding profile exists for tenant.'
          : 'No branding profile found — create branding profile for white-label release.',
      },
      {
        key: 'dark_mode',
        severity: portalBranding.darkModeEnabled != null ? 'info' : 'warning',
        message: portalBranding.darkModeEnabled
          ? 'Dark mode enabled in portal branding.'
          : 'Dark mode configuration not verified — review dark mode assets and contrast.',
      },
      {
        key: 'light_mode',
        severity: brandingProfile?.primaryColor || portalBranding.lightTheme ? 'info' : 'warning',
        message: 'Light mode branding should be verified against primary color and logo contrast.',
      },
    ];

    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const status: RlmValidationStatus =
      warningCount > 4 ? 'warning' : warningCount > 0 ? 'warning' : 'passed';

    const [created] = await this.db
      .insert(rlmBrandingReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        findingCount: findings.length,
        warningCount,
        findings,
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(row: typeof rlmBrandingReviews.$inferSelect): RlmBrandingReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    findingCount: row.findingCount,
    warningCount: row.warningCount,
    findings: row.findings,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
