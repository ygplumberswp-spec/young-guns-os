import { eq } from 'drizzle-orm';
import type { PlMobileProductionReviewSummary, PlValidationStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { plMobileProductionReviews } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseProductionLaunchMobileService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mobilePlatformService: import('./enterprise-mobile-platform.service.js').EnterpriseMobilePlatformService,
  ) {}

  async getLatestReview(companyId: string): Promise<PlMobileProductionReviewSummary | null> {
    const row = await this.db.query.plMobileProductionReviews.findFirst({
      where: eq(plMobileProductionReviews.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.reviewedAt)],
    });
    return row ? toSummary(row) : null;
  }

  async runMobileProductionReview(scope: StaffScope): Promise<PlMobileProductionReviewSummary> {
    const reviewKey = `mobile_${Date.now()}`;
    const dashboard = await this.mobilePlatformService.getDashboard(scope.companyId);

    const iosDevices = dashboard.devices.filter((d) => d.platform === 'ios');
    const androidDevices = dashboard.devices.filter((d) => d.platform === 'android');

    const findings: Array<Record<string, unknown>> = [
      {
        key: 'ios_devices',
        severity: 'info',
        message: `${iosDevices.length} iOS device(s) registered.`,
      },
      {
        key: 'android_devices',
        severity: 'info',
        message: `${androidDevices.length} Android device(s) registered.`,
      },
      {
        key: 'push_notifications',
        severity: dashboard.platformConfig.pushNotificationsEnabled ? 'info' : 'warning',
        message: dashboard.platformConfig.pushNotificationsEnabled
          ? 'Push notifications enabled in platform config.'
          : 'Push notifications not enabled — verify production push configuration.',
      },
      {
        key: 'offline_sync',
        severity: dashboard.platformConfig.backgroundSyncEnabled ? 'info' : 'warning',
        message: `${dashboard.pendingSyncQueueCount} pending sync item(s), background sync ${dashboard.platformConfig.backgroundSyncEnabled ? 'enabled' : 'disabled'}.`,
      },
      {
        key: 'authentication',
        severity: dashboard.activeDeviceCount > 0 ? 'info' : 'warning',
        message: `${dashboard.activeDeviceCount} active device(s) — verify mobile auth flows.`,
      },
      {
        key: 'api_connectivity',
        severity: dashboard.pendingConflictCount === 0 ? 'info' : 'warning',
        message: `${dashboard.pendingConflictCount} sync conflict(s), ${dashboard.pendingSyncQueueCount} queued sync item(s).`,
      },
      {
        key: 'cartrack',
        severity: dashboard.cartrackConnected ? 'info' : 'info',
        message: dashboard.cartrackConnected ? 'Cartrack fleet integration connected.' : 'Cartrack not connected — optional for mobile fleet tracking.',
      },
    ];

    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const status: PlValidationStatus = warningCount > 2 ? 'warning' : 'passed';

    const [created] = await this.db
      .insert(plMobileProductionReviews)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        reviewKey,
        status,
        findingCount: findings.length,
        warningCount,
        report: {
          findings,
          activeDeviceCount: dashboard.activeDeviceCount,
          iosCount: iosDevices.length,
          androidCount: androidDevices.length,
          pushEnabled: dashboard.platformConfig.pushNotificationsEnabled,
        },
      })
      .returning();

    return toSummary(created!);
  }
}

function toSummary(row: typeof plMobileProductionReviews.$inferSelect): PlMobileProductionReviewSummary {
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
