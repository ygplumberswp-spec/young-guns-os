import { eq } from 'drizzle-orm';
import type {
  RlmAppStoreReadinessSummary,
  RlmStorePlatform,
  RlmValidationStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmAppStoreReadiness } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const APPLE_CHECKLIST = [
  { key: 'app_metadata', label: 'App metadata (name, subtitle, description)' },
  { key: 'keywords', label: 'Keywords and search optimization' },
  { key: 'categories', label: 'Primary and secondary categories' },
  { key: 'privacy_declarations', label: 'Privacy nutrition labels and data use declarations' },
  { key: 'required_permissions', label: 'Required permissions (camera, location, notifications)' },
  { key: 'screenshots', label: 'Screenshots checklist (6.7", 6.5", iPad if applicable)' },
  { key: 'release_notes', label: 'Release notes for App Store submission' },
  { key: 'app_icon', label: 'App icon (1024×1024)' },
  { key: 'support_url', label: 'Support URL and marketing URL' },
  { key: 'age_rating', label: 'Age rating questionnaire' },
] as const;

const GOOGLE_CHECKLIST = [
  { key: 'store_listing', label: 'Store listing (title, short description, full description)' },
  { key: 'categories', label: 'App category and tags' },
  { key: 'privacy_policy', label: 'Privacy policy URL and data safety form' },
  { key: 'permissions', label: 'Declared permissions (camera, location, storage, notifications)' },
  { key: 'screenshots', label: 'Screenshots checklist (phone, 7-inch tablet, 10-inch tablet)' },
  { key: 'feature_graphic', label: 'Feature graphic (1024×500)' },
  { key: 'release_notes', label: 'Release notes for Play Store submission' },
  { key: 'app_icon', label: 'App icon (512×512)' },
  { key: 'content_rating', label: 'Content rating questionnaire' },
  { key: 'target_audience', label: 'Target audience and ads declaration' },
] as const;

export class EnterpriseReleaseManagementAppStoreReadinessService {
  constructor(private readonly db: DatabaseClient) {}

  async listReadiness(companyId: string): Promise<RlmAppStoreReadinessSummary[]> {
    const rows = await this.db.query.rlmAppStoreReadiness.findMany({
      where: eq(rlmAppStoreReadiness.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
      limit: 10,
    });
    const latestByPlatform = new Map<RlmStorePlatform, RlmAppStoreReadinessSummary>();
    for (const row of rows) {
      if (!latestByPlatform.has(row.storePlatform)) {
        latestByPlatform.set(row.storePlatform, toSummary(row));
      }
    }
    return Array.from(latestByPlatform.values());
  }

  async runAppStoreReadinessReview(
    scope: StaffScope,
    storePlatform: RlmStorePlatform,
  ): Promise<RlmAppStoreReadinessSummary> {
    const reviewKey = `app_store_${storePlatform}_${Date.now()}`;
    const checklist = storePlatform === 'apple_app_store' ? APPLE_CHECKLIST : GOOGLE_CHECKLIST;

    const storeListing = buildStoreListingTemplate(storePlatform, checklist);
    const checklistTotalCount = checklist.length;
    const checklistCompleteCount = 0;
    const status: RlmValidationStatus = 'pending';

    const [created] = await this.db
      .insert(rlmAppStoreReadiness)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        storePlatform,
        status,
        checklistCompleteCount,
        checklistTotalCount,
        storeListing,
      })
      .returning();

    return toSummary(created!);
  }

  async runAllStoreReadinessReviews(scope: StaffScope): Promise<RlmAppStoreReadinessSummary[]> {
    const apple = await this.runAppStoreReadinessReview(scope, 'apple_app_store');
    const google = await this.runAppStoreReadinessReview(scope, 'google_play_store');
    return [apple, google];
  }
}

function buildStoreListingTemplate(
  storePlatform: RlmStorePlatform,
  checklist: ReadonlyArray<{ key: string; label: string }>,
): Record<string, unknown> {
  const baseMetadata = {
    appName: 'TITAN Business OS',
    version: '1.0.0',
    bundleId: storePlatform === 'apple_app_store' ? 'com.titan.businessos' : 'com.titan.businessos',
  };

  if (storePlatform === 'apple_app_store') {
    return {
      ...baseMetadata,
      description:
        'TITAN Business OS is an enterprise business operating system for field service, operations, finance, and customer management.',
      keywords: ['business', 'field service', 'operations', 'enterprise', 'CRM', 'dispatch'],
      primaryCategory: 'Business',
      secondaryCategory: 'Productivity',
      privacyDeclarations: {
        dataCollected: ['contact info', 'location', 'photos', 'usage data'],
        dataLinkedToUser: true,
        tracking: false,
      },
      requiredPermissions: ['camera', 'location', 'notifications', 'background fetch'],
      screenshotsChecklist: [
        '6.7" iPhone (1290×2796)',
        '6.5" iPhone (1284×2778)',
        '12.9" iPad Pro (2048×2732) if tablet supported',
      ],
      releaseNotes: 'Initial release of TITAN Business OS v1.0.0.',
      checklist: checklist.map((item) => ({ ...item, status: 'pending' })),
    };
  }

  return {
    ...baseMetadata,
    shortDescription: 'Enterprise business operating system for field service and operations.',
    fullDescription:
      'TITAN Business OS delivers integrated field service, dispatch, finance, CRM, and operations management for enterprise teams.',
    category: 'Business',
    privacyPolicyUrl: '',
    dataSafety: {
      dataCollected: ['personal info', 'location', 'photos', 'app activity'],
      dataShared: false,
      securityPractices: ['encryption in transit', 'encryption at rest'],
    },
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'INTERNET'],
    screenshotsChecklist: [
      'Phone (1080×1920 minimum)',
      '7-inch tablet (1200×1920)',
      '10-inch tablet (1600×2560)',
    ],
    releaseNotes: 'Initial release of TITAN Business OS v1.0.0.',
    checklist: checklist.map((item) => ({ ...item, status: 'pending' })),
  };
}

function toSummary(row: typeof rlmAppStoreReadiness.$inferSelect): RlmAppStoreReadinessSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    storePlatform: row.storePlatform,
    status: row.status,
    checklistCompleteCount: row.checklistCompleteCount,
    checklistTotalCount: row.checklistTotalCount,
    storeListing: row.storeListing,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
