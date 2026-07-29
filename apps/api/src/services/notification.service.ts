import { and, desc, eq } from 'drizzle-orm';
import type {
  NotificationPreferenceSummary,
  NotificationSummary,
  NotificationType,
  UpdateNotificationPreferencesRequest,
} from '@titan/shared';
import { NOTIFICATION_TYPE_OPTIONS } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { notificationPreferences, notifications } from '@titan/db';

export class NotificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

type StaffRecipient = {
  companyId: string;
  userId: string;
};

type PortalRecipient = {
  companyId: string;
  portalUserId: string;
};

type CreateNotificationInput = {
  companyId: string;
  recipientType: 'staff' | 'portal';
  recipientUserId?: string;
  recipientPortalUserId?: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

export class NotificationService {
  constructor(private readonly db: DatabaseClient) {}

  async listForStaff(scope: StaffRecipient): Promise<NotificationSummary[]> {
    const rows = await this.db.query.notifications.findMany({
      where: and(
        eq(notifications.companyId, scope.companyId),
        eq(notifications.recipientType, 'staff'),
        eq(notifications.recipientUserId, scope.userId),
      ),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });

    return rows.map(toNotificationSummary);
  }

  async listForPortal(scope: PortalRecipient): Promise<NotificationSummary[]> {
    const rows = await this.db.query.notifications.findMany({
      where: and(
        eq(notifications.companyId, scope.companyId),
        eq(notifications.recipientType, 'portal'),
        eq(notifications.recipientPortalUserId, scope.portalUserId),
      ),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });

    return rows.map(toNotificationSummary);
  }

  async markReadStaff(scope: StaffRecipient, notificationId: string): Promise<boolean> {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.companyId, scope.companyId),
          eq(notifications.recipientUserId, scope.userId),
        ),
      )
      .returning();

    return Boolean(updated);
  }

  async markReadPortal(scope: PortalRecipient, notificationId: string): Promise<boolean> {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.companyId, scope.companyId),
          eq(notifications.recipientPortalUserId, scope.portalUserId),
        ),
      )
      .returning();

    return Boolean(updated);
  }

  async getStaffPreferences(scope: StaffRecipient): Promise<NotificationPreferenceSummary[]> {
    const rows = await this.db.query.notificationPreferences.findMany({
      where: and(
        eq(notificationPreferences.companyId, scope.companyId),
        eq(notificationPreferences.userId, scope.userId),
      ),
    });

    return buildPreferenceSummary(rows);
  }

  async getPortalPreferences(scope: PortalRecipient): Promise<NotificationPreferenceSummary[]> {
    const rows = await this.db.query.notificationPreferences.findMany({
      where: and(
        eq(notificationPreferences.companyId, scope.companyId),
        eq(notificationPreferences.portalUserId, scope.portalUserId),
      ),
    });

    return buildPreferenceSummary(rows);
  }

  async updatePortalPreferences(
    scope: PortalRecipient,
    input: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferenceSummary[]> {
    for (const preference of input.preferences) {
      const existing = await this.db.query.notificationPreferences.findFirst({
        where: and(
          eq(notificationPreferences.companyId, scope.companyId),
          eq(notificationPreferences.portalUserId, scope.portalUserId),
          eq(notificationPreferences.notificationType, preference.notificationType),
        ),
      });

      if (existing) {
        await this.db
          .update(notificationPreferences)
          .set({ enabled: preference.enabled, updatedAt: new Date() })
          .where(eq(notificationPreferences.id, existing.id));
      } else {
        await this.db.insert(notificationPreferences).values({
          companyId: scope.companyId,
          portalUserId: scope.portalUserId,
          notificationType: preference.notificationType,
          enabled: preference.enabled,
        });
      }
    }

    return this.getPortalPreferences(scope);
  }

  async updateStaffPreferences(
    scope: StaffRecipient,
    input: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferenceSummary[]> {
    for (const preference of input.preferences) {
      const existing = await this.db.query.notificationPreferences.findFirst({
        where: and(
          eq(notificationPreferences.companyId, scope.companyId),
          eq(notificationPreferences.userId, scope.userId),
          eq(notificationPreferences.notificationType, preference.notificationType),
        ),
      });

      if (existing) {
        await this.db
          .update(notificationPreferences)
          .set({ enabled: preference.enabled, updatedAt: new Date() })
          .where(eq(notificationPreferences.id, existing.id));
      } else {
        await this.db.insert(notificationPreferences).values({
          companyId: scope.companyId,
          userId: scope.userId,
          notificationType: preference.notificationType,
          enabled: preference.enabled,
        });
      }
    }

    return this.getStaffPreferences(scope);
  }

  async createNotification(input: CreateNotificationInput): Promise<NotificationSummary | null> {
    const enabled = await this.isNotificationEnabled(input);
    if (!enabled) return null;

    const [created] = await this.db
      .insert(notifications)
      .values({
        companyId: input.companyId,
        recipientType: input.recipientType,
        recipientUserId: input.recipientUserId ?? null,
        recipientPortalUserId: input.recipientPortalUserId ?? null,
        notificationType: input.notificationType,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })
      .returning();

    return created ? toNotificationSummary(created) : null;
  }

  private async isNotificationEnabled(input: CreateNotificationInput): Promise<boolean> {
    if (input.recipientType === 'staff' && input.recipientUserId) {
      const preference = await this.db.query.notificationPreferences.findFirst({
        where: and(
          eq(notificationPreferences.companyId, input.companyId),
          eq(notificationPreferences.userId, input.recipientUserId),
          eq(notificationPreferences.notificationType, input.notificationType),
        ),
      });
      return preference?.enabled ?? true;
    }

    if (input.recipientPortalUserId) {
      const preference = await this.db.query.notificationPreferences.findFirst({
        where: and(
          eq(notificationPreferences.companyId, input.companyId),
          eq(notificationPreferences.portalUserId, input.recipientPortalUserId),
          eq(notificationPreferences.notificationType, input.notificationType),
        ),
      });
      return preference?.enabled ?? true;
    }

    return true;
  }
}

function toNotificationSummary(row: typeof notifications.$inferSelect): NotificationSummary {
  return {
    id: row.id,
    notificationType: row.notificationType,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildPreferenceSummary(
  rows: Array<{ notificationType: NotificationType; enabled: boolean }>,
): NotificationPreferenceSummary[] {
  const byType = new Map(rows.map((row) => [row.notificationType, row.enabled]));

  return NOTIFICATION_TYPE_OPTIONS.map((option) => ({
    notificationType: option.value,
    enabled: byType.get(option.value) ?? true,
  }));
}
