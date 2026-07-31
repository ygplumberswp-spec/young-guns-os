import { eq } from 'drizzle-orm';
import type { RlmMobilePackagingReviewSummary, RlmValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmMobilePackagingReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseReleaseManagementMobilePackagingService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mobilePlatformService: import('./enterprise-mobile-platform.service.js').EnterpriseMobilePlatformService,
  ) {}

  async getLatestReview(companyId: string): Promise<RlmMobilePackagingReviewSummary | null> {
    const row = await this.db.query.rlmMobilePackagingReviews.findFirst({
      where: eq(rlmMobilePackagingReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runMobilePackagingReview(scope: StaffScope): Promise<RlmMobilePackagingReviewSummary> {
    const reviewKey = `mobile_packaging_${Date.now()}`;
    const dashboard = await this.mobilePlatformService.getDashboard(scope.companyId);
    const mobilePolicies = dashboard.platformConfig.mobilePolicies ?? {};

    const iosDevices = dashboard.devices.filter((d) => d.platform === 'ios');
    const androidDevices = dashboard.devices.filter((d) => d.platform === 'android');
    const hasMediaUploads = dashboard.recentMediaAssets.length > 0;
    const hasGpsCaptures = dashboard.recentMediaAssets.some(
      (a) => a.latitude != null && a.longitude != null,
    );

    const findings: Array<Record<string, unknown>> = [
      {
        key: 'ios_production_build',
        severity: iosDevices.length > 0 ? 'info' : 'warning',
        message: `${iosDevices.length} iOS device(s) registered — verify production iOS build and App Store Connect configuration.`,
      },
      {
        key: 'android_production_build',
        severity: androidDevices.length > 0 ? 'info' : 'warning',
        message: `${androidDevices.length} Android device(s) registered — verify production Android build and Play Console configuration.`,
      },
      {
        key: 'authentication',
        severity: dashboard.activeDeviceCount > 0 ? 'info' : 'warning',
        message: `${dashboard.activeDeviceCount} active device(s) — verify mobile authentication and session handling.`,
      },
      {
        key: 'offline_synchronization',
        severity: dashboard.platformConfig.backgroundSyncEnabled ? 'info' : 'warning',
        message: `${dashboard.pendingSyncQueueCount} pending sync item(s), background sync ${dashboard.platformConfig.backgroundSyncEnabled ? 'enabled' : 'disabled'}.`,
      },
      {
        key: 'push_notifications',
        severity: dashboard.platformConfig.pushNotificationsEnabled ? 'info' : 'warning',
        message: dashboard.platformConfig.pushNotificationsEnabled
          ? 'Push notifications enabled in platform config.'
          : 'Push notifications not enabled — verify production push configuration.',
      },
      {
        key: 'camera',
        severity: hasMediaUploads || mobilePolicies.cameraEnabled !== false ? 'info' : 'warning',
        message: hasMediaUploads
          ? `${dashboard.recentMediaAssets.length} recent media asset(s) — camera capture verified.`
          : 'No recent media assets — verify camera permissions and capture flows.',
      },
      {
        key: 'file_uploads',
        severity: hasMediaUploads ? 'info' : 'warning',
        message: hasMediaUploads
          ? 'File upload pipeline active with recent media assets.'
          : 'No recent file uploads — verify upload pipeline and storage connectivity.',
      },
      {
        key: 'gps_permissions',
        severity: hasGpsCaptures || mobilePolicies.gpsEnabled !== false ? 'info' : 'warning',
        message: hasGpsCaptures
          ? 'GPS metadata captured on recent media assets.'
          : 'No GPS metadata on recent assets — verify location permissions and capture.',
      },
      {
        key: 'background_synchronization',
        severity: dashboard.platformConfig.backgroundSyncEnabled ? 'info' : 'warning',
        message: dashboard.platformConfig.backgroundSyncEnabled
          ? `Background sync enabled, sync frequency ${dashboard.platformConfig.syncFrequencyMinutes} min.`
          : 'Background sync disabled — enable for production offline resilience.',
      },
      {
        key: 'sync_conflicts',
        severity: dashboard.pendingConflictCount === 0 ? 'info' : 'warning',
        message: `${dashboard.pendingConflictCount} sync conflict(s), ${dashboard.pendingSyncQueueCount} queued item(s).`,
      },
    ];

    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const status: RlmValidationStatus =
      warningCount > 3 ? 'warning' : warningCount > 0 ? 'warning' : 'passed';
    const iosReady = iosDevices.length > 0 && dashboard.platformConfig.pushNotificationsEnabled;
    const androidReady =
      androidDevices.length > 0 && dashboard.platformConfig.pushNotificationsEnabled;

    const [created] = await this.db
      .insert(rlmMobilePackagingReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        iosReady,
        androidReady,
        findingCount: findings.length,
        warningCount,
        findings,
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(
  row: typeof rlmMobilePackagingReviews.$inferSelect,
): RlmMobilePackagingReviewSummary {
  return {
    id: row.id,
    reviewKey: row.reviewKey,
    status: row.status,
    iosReady: row.iosReady,
    androidReady: row.androidReady,
    findingCount: row.findingCount,
    warningCount: row.warningCount,
    findings: row.findings,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}
