import { and, desc, eq, gte, isNull, or } from 'drizzle-orm';
import type {
  CreateMobileTimeEntryRequest,
  CreateMobileWorkforceRequest,
  MobileCompanyAnnouncementSummary,
  MobileInventoryAlert,
  MobileJobDocumentationSummary,
  MobileJobExecutionWorkspace,
  MobileJobInventoryUsageSummary,
  MobileOfflineBundle,
  MobileRouteIntelligence,
  MobileRouteStop,
  MobileRouteSummary,
  MobileTimeEntrySummary,
  MobileTravelHistoryEntry,
  MobileWorkforceAuraContext,
  MobileWorkforceDashboard,
  MobileWorkforceInventoryCentre,
  MobileWorkforceJobList,
  MobileWorkforceNotificationCentre,
  MobileWorkforceRequestSummary,
  ReportMobileSyncConflictRequest,
  ResolveMobileSyncConflictRequest,
  SubmitMobileInventoryUsageRequest,
  SubmitMobileJobDocumentationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  inventoryItems,
  mobileActionLogs,
  mobileCompanyAnnouncements,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobilePendingActions,
  mobileSyncConflicts,
  mobileSyncQueue,
  mobileTimeEntries,
  mobileWorkforceRequests,
} from '@titan/db';
import type { IntegrationsService } from './integrations.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { MobileService } from './mobile.service.js';
import type { MobileSyncService } from './mobile-sync.service.js';
import type { NotificationService } from './notification.service.js';

export class MobileWorkforceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MobileWorkforceError';
  }
}

type TechnicianScope = {
  companyId: string;
  userId: string;
};

export class MobileWorkforceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mobileService: MobileService,
    private readonly mobileSyncService: MobileSyncService,
    private readonly jobsService: JobsService,
    private readonly inventoryService: InventoryService,
    private readonly integrationsService: IntegrationsService,
    private readonly notificationService: NotificationService,
  ) {}

  async getWorkforceDashboard(scope: TechnicianScope): Promise<MobileWorkforceDashboard> {
    const [baseDashboard, route, inventoryAlerts, announcements, pendingRequests, pendingActions, todaySchedule] =
      await Promise.all([
        this.mobileService.getTechnicianDashboard(scope),
        this.getRouteSummary(scope),
        this.getInventoryAlerts(scope.companyId),
        this.listActiveAnnouncements(scope.companyId),
        this.listRequests(scope),
        this.db.query.mobilePendingActions.findMany({
          where: and(
            eq(mobilePendingActions.companyId, scope.companyId),
            eq(mobilePendingActions.userId, scope.userId),
            eq(mobilePendingActions.status, 'pending'),
          ),
        }),
        this.mobileService.getTechnicianSchedule(scope),
      ]);

    const safetyNotices = announcements.filter((item) => item.announcementType === 'safety');
    const companyAnnouncements = announcements.filter((item) => item.announcementType !== 'safety');
    const unreadNotificationCount = baseDashboard.notifications.filter((item) => !item.isRead).length;

    return {
      greeting: baseDashboard.greeting,
      assignedJobs: baseDashboard.assignedJobs,
      todaysSchedule: todaySchedule.events,
      upcomingSchedule: baseDashboard.upcomingSchedule.items,
      routeSummary: route,
      outstandingTaskCount: pendingActions.length,
      pendingRequestCount: pendingRequests.filter((item) => item.status === 'pending_approval').length,
      inventoryAlerts,
      safetyNotices,
      companyAnnouncements,
      recommendations: baseDashboard.recommendations,
      notifications: baseDashboard.notifications,
      unreadNotificationCount,
    };
  }

  async listWorkforceJobs(scope: TechnicianScope): Promise<MobileWorkforceJobList> {
    const jobsList = await this.mobileService.listAssignedJobs(scope);
    const activeCount = jobsList.filter(
      (job) => !['completed', 'cancelled'].includes(job.status),
    ).length;
    const completedCount = jobsList.filter((job) => job.status === 'completed').length;

    return { jobs: jobsList, activeCount, completedCount };
  }

  async getJobWorkspace(scope: TechnicianScope, jobId: string): Promise<MobileJobExecutionWorkspace> {
    const job = await this.requireAssignedJob(scope, jobId);
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, job.customerId), eq(customers.companyId, scope.companyId)),
    });

    if (!customer) {
      throw new MobileWorkforceError('NOT_FOUND', 'Customer not found');
    }

    const [timeEntries, inventoryUsage, documentation, pendingCompletion] = await Promise.all([
      this.db.query.mobileTimeEntries.findMany({
        where: and(
          eq(mobileTimeEntries.companyId, scope.companyId),
          eq(mobileTimeEntries.userId, scope.userId),
          eq(mobileTimeEntries.jobId, jobId),
        ),
        orderBy: [desc(mobileTimeEntries.startedAt)],
      }),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(
          eq(mobileJobInventoryUsage.companyId, scope.companyId),
          eq(mobileJobInventoryUsage.jobId, jobId),
        ),
        with: { inventoryItem: true },
        orderBy: [desc(mobileJobInventoryUsage.createdAt)],
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, scope.companyId),
          eq(mobileJobDocumentation.jobId, jobId),
        ),
        orderBy: [desc(mobileJobDocumentation.createdAt)],
      }),
      this.db.query.mobilePendingActions.findFirst({
        where: and(
          eq(mobilePendingActions.companyId, scope.companyId),
          eq(mobilePendingActions.userId, scope.userId),
          eq(mobilePendingActions.entityType, 'job'),
          eq(mobilePendingActions.entityId, jobId),
          eq(mobilePendingActions.actionType, 'submit_completion'),
        ),
        orderBy: [desc(mobilePendingActions.createdAt)],
      }),
    ]);

    const checklist =
      pendingCompletion?.payload && typeof pendingCompletion.payload.checklist === 'object'
        ? (pendingCompletion.payload.checklist as Record<string, boolean>)
        : {};
    const completionSummary =
      pendingCompletion?.payload && typeof pendingCompletion.payload.summary === 'string'
        ? pendingCompletion.payload.summary
        : null;

    return {
      jobId: job.id,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt,
      scheduledEndAt: job.scheduledEndAt,
      workInstructions: job.description,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      checklist,
      laborTimeEntries: timeEntries.map(toTimeEntrySummary),
      materialsUsed: inventoryUsage.map(toInventoryUsageSummary),
      documentation: documentation.map(toDocumentationSummary),
      completionSummary,
    };
  }

  async getRouteIntelligence(scope: TechnicianScope): Promise<MobileRouteIntelligence> {
    const [route, travelHistory, tracking, fleetInfo] = await Promise.all([
      this.getRouteSummary(scope),
      this.getTravelHistory(scope),
      this.integrationsService.buildFleetTrackingContext(scope.companyId),
      this.mobileService.getTechnicianFleetInfo(scope),
    ]);

    const assignedVehicleId = fleetInfo.assignedVehicle?.id ?? null;
    const latestGps =
      assignedVehicleId != null
        ? (tracking.latestPositions.find((pos) => pos.vehicleId === assignedVehicleId) ?? null)
        : (tracking.latestPositions[0] ?? null);

    return {
      route,
      travelHistory,
      latestGps: latestGps
        ? {
            latitude: latestGps.latitude,
            longitude: latestGps.longitude,
            recordedAt: latestGps.recordedAt,
            speedKmh: latestGps.speedKmh,
          }
        : null,
      cartrackConnected: tracking.cartrackConnected,
    };
  }

  async getInventoryCentre(scope: TechnicianScope): Promise<MobileWorkforceInventoryCentre> {
    const [alerts, recentUsage] = await Promise.all([
      this.getInventoryAlerts(scope.companyId),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(
          eq(mobileJobInventoryUsage.companyId, scope.companyId),
          eq(mobileJobInventoryUsage.userId, scope.userId),
        ),
        with: { inventoryItem: true, job: true },
        orderBy: [desc(mobileJobInventoryUsage.createdAt)],
        limit: 25,
      }),
    ]);

    return {
      alerts,
      recentUsage: recentUsage.map(toInventoryUsageSummary),
      pendingUsageCount: recentUsage.filter((item) => item.status === 'pending_approval').length,
    };
  }

  async getNotificationCentre(scope: TechnicianScope): Promise<MobileWorkforceNotificationCentre> {
    const notifications = await this.notificationService.listForStaff(scope);
    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
    };
  }

  async listTimeEntries(scope: TechnicianScope): Promise<MobileTimeEntrySummary[]> {
    const rows = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, scope.companyId),
        eq(mobileTimeEntries.userId, scope.userId),
      ),
      with: { job: true },
      orderBy: [desc(mobileTimeEntries.startedAt)],
      limit: 100,
    });

    return rows.map(toTimeEntrySummary);
  }

  async createTimeEntry(
    scope: TechnicianScope,
    input: CreateMobileTimeEntryRequest,
  ): Promise<MobileTimeEntrySummary> {
    if (input.jobId) {
      await this.requireAssignedJob(scope, input.jobId);
    }

    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
    const endedAt = input.endedAt ? new Date(input.endedAt) : null;
    const durationMinutes =
      input.durationMinutes ??
      (endedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null);

    const [created] = await this.db
      .insert(mobileTimeEntries)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        entryType: input.entryType,
        jobId: input.jobId ?? null,
        startedAt,
        endedAt,
        durationMinutes,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await this.logAction(scope, 'create_time_entry', 'time_entry', created!.id, {
      entryType: input.entryType,
      jobId: input.jobId ?? null,
    });

    const row = await this.db.query.mobileTimeEntries.findFirst({
      where: eq(mobileTimeEntries.id, created!.id),
      with: { job: true },
    });

    return toTimeEntrySummary(row!);
  }

  async submitInventoryUsage(
    scope: TechnicianScope,
    jobId: string,
    input: SubmitMobileInventoryUsageRequest,
  ): Promise<MobileJobInventoryUsageSummary> {
    await this.requireAssignedJob(scope, jobId);

    if (input.quantity <= 0) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'Quantity must be greater than zero');
    }

    const item = await this.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.id, input.inventoryItemId),
        eq(inventoryItems.companyId, scope.companyId),
      ),
    });

    if (!item) {
      throw new MobileWorkforceError('NOT_FOUND', 'Inventory item not found');
    }

    const [created] = await this.db
      .insert(mobileJobInventoryUsage)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        jobId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        status: 'pending_approval',
        scanCode: input.scanCode?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await this.mobileSyncService.createPendingAction({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType: 'inventory_usage',
      entityType: 'job',
      entityId: jobId,
      payload: {
        usageId: created!.id,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        pendingApproval: true,
      },
    });

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'inventory_request',
      title: 'Inventory usage submitted',
      body: `${input.quantity} × ${item.name} submitted for approval on job.`,
      entityType: 'job',
      entityId: jobId,
    });

    const row = await this.db.query.mobileJobInventoryUsage.findFirst({
      where: eq(mobileJobInventoryUsage.id, created!.id),
      with: { inventoryItem: true },
    });

    return toInventoryUsageSummary(row!);
  }

  async submitJobDocumentation(
    scope: TechnicianScope,
    jobId: string,
    input: SubmitMobileJobDocumentationRequest,
  ): Promise<MobileJobDocumentationSummary> {
    await this.requireAssignedJob(scope, jobId);

    const title = input.title.trim();
    if (!title) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'Title is required');
    }

    const [created] = await this.db
      .insert(mobileJobDocumentation)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        jobId,
        documentationType: input.documentationType,
        title,
        fileName: input.fileName?.trim() || null,
        mimeType: input.mimeType?.trim() || null,
        sizeBytes: input.sizeBytes ?? null,
        content: input.content?.trim() || null,
        metadata: input.metadata ?? {},
      })
      .returning();

    if (input.fileName) {
      await this.mobileSyncService.queueStaffSyncItem(
        { ...scope, scope: 'technician' },
        {
          scope: 'technician',
          resourceType: 'job_documentation_media',
          resourceId: created!.id,
          payload: {
            jobId,
            documentationId: created!.id,
            fileName: input.fileName,
            mimeType: input.mimeType ?? null,
            sizeBytes: input.sizeBytes ?? null,
          },
        },
      );
    }

    await this.logAction(scope, 'submit_job_documentation', 'job', jobId, {
      documentationId: created!.id,
      documentationType: input.documentationType,
    });

    return toDocumentationSummary(created!);
  }

  async listRequests(scope: TechnicianScope): Promise<MobileWorkforceRequestSummary[]> {
    const rows = await this.db.query.mobileWorkforceRequests.findMany({
      where: and(
        eq(mobileWorkforceRequests.companyId, scope.companyId),
        eq(mobileWorkforceRequests.userId, scope.userId),
      ),
      orderBy: [desc(mobileWorkforceRequests.createdAt)],
      limit: 50,
    });

    return rows.map(toRequestSummary);
  }

  async createRequest(
    scope: TechnicianScope,
    input: CreateMobileWorkforceRequest,
  ): Promise<MobileWorkforceRequestSummary> {
    const subject = input.subject.trim();
    const message = input.message.trim();

    if (!subject || !message) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'Subject and message are required');
    }

    if (input.entityId && input.entityType === 'job') {
      await this.requireAssignedJob(scope, input.entityId);
    }

    const [created] = await this.db
      .insert(mobileWorkforceRequests)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        requestType: input.requestType,
        status: 'pending_approval',
        subject,
        message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload ?? {},
      })
      .returning();

    await this.mobileSyncService.createPendingAction({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType: 'workforce_request',
      entityType: input.entityType ?? 'workforce_request',
      entityId: created!.id,
      payload: {
        requestType: input.requestType,
        pendingApproval: true,
      },
    });

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'approval_request',
      title: 'Workforce request submitted',
      body: subject,
      entityType: 'mobile_workforce_request',
      entityId: created!.id,
    });

    return toRequestSummary(created!);
  }

  async getOfflineBundle(scope: TechnicianScope, deviceId?: string): Promise<MobileOfflineBundle> {
    const [jobsList, syncState, pendingActions, queue, conflicts] = await Promise.all([
      this.mobileService.listAssignedJobs(scope),
      this.mobileSyncService.getStaffSyncState({ ...scope, scope: 'technician' }, deviceId),
      this.mobileSyncService.listStaffPendingActions(scope.companyId, scope.userId),
      this.mobileSyncService.listStaffSyncQueue(scope.companyId, scope.userId),
      this.db.query.mobileSyncConflicts.findMany({
        where: and(
          eq(mobileSyncConflicts.companyId, scope.companyId),
          eq(mobileSyncConflicts.userId, scope.userId),
          eq(mobileSyncConflicts.status, 'pending'),
        ),
        orderBy: [desc(mobileSyncConflicts.createdAt)],
        limit: 25,
      }),
    ]);

    return {
      jobs: jobsList.filter((job) => !['completed', 'cancelled'].includes(job.status)),
      pendingActions: pendingActions.map((item) => ({
        id: item.id,
        actionType: item.actionType,
        entityId: item.entityId,
        status: item.status,
      })),
      queue,
      conflicts: conflicts.map((item) => ({
        id: item.id,
        resourceType: item.resourceType,
        status: item.status,
      })),
      syncState: { lastSyncedAt: syncState.lastSyncedAt },
    };
  }

  async reportSyncConflict(
    scope: TechnicianScope,
    input: ReportMobileSyncConflictRequest,
  ): Promise<{ id: string; status: string }> {
    const [created] = await this.db
      .insert(mobileSyncConflicts)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        queueItemId: input.queueItemId ?? null,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        clientVersion: input.clientVersion ?? null,
        serverVersion: input.serverVersion ?? null,
        clientPayload: input.clientPayload ?? {},
        serverPayload: input.serverPayload ?? {},
        status: 'pending',
      })
      .returning();

    if (input.queueItemId) {
      await this.db
        .update(mobileSyncQueue)
        .set({ status: 'failed', errorMessage: 'Sync conflict detected' })
        .where(eq(mobileSyncQueue.id, input.queueItemId));
    }

    return { id: created!.id, status: created!.status };
  }

  async resolveSyncConflict(
    scope: TechnicianScope,
    conflictId: string,
    input: ResolveMobileSyncConflictRequest,
  ): Promise<{ id: string; status: string }> {
    const conflict = await this.db.query.mobileSyncConflicts.findFirst({
      where: and(
        eq(mobileSyncConflicts.id, conflictId),
        eq(mobileSyncConflicts.companyId, scope.companyId),
        eq(mobileSyncConflicts.userId, scope.userId),
      ),
    });

    if (!conflict) {
      throw new MobileWorkforceError('NOT_FOUND', 'Sync conflict not found');
    }

    const [updated] = await this.db
      .update(mobileSyncConflicts)
      .set({
        status: 'resolved',
        resolution: `${input.resolution}${input.notes ? `: ${input.notes}` : ''}`,
        resolvedAt: new Date(),
      })
      .where(eq(mobileSyncConflicts.id, conflictId))
      .returning();

    return { id: updated!.id, status: updated!.status };
  }

  async buildWorkforceAuraContext(scope: TechnicianScope): Promise<MobileWorkforceAuraContext> {
    const dashboard = await this.getWorkforceDashboard(scope);
    const nextJob = dashboard.routeSummary.nextDestination;

    return {
      summary: `${dashboard.assignedJobs.length} assigned job(s), ${dashboard.routeSummary.stopCount} route stop(s), ${dashboard.pendingRequestCount} pending request(s).`,
      assignedJobCount: dashboard.assignedJobs.length,
      nextJobTitle: nextJob?.title ?? null,
      routeStopCount: dashboard.routeSummary.stopCount,
      pendingRequestCount: dashboard.pendingRequestCount,
      inventoryAlertCount: dashboard.inventoryAlerts.length,
      unreadNotificationCount: dashboard.unreadNotificationCount,
      cartrackConnected: (await this.integrationsService.buildFleetTrackingContext(scope.companyId))
        .cartrackConnected,
    };
  }

  private async getRouteSummary(scope: TechnicianScope): Promise<MobileRouteSummary> {
    const [assignedJobs, fleetInfo] = await Promise.all([
      this.mobileService.listAssignedJobs(scope),
      this.mobileService.getTechnicianFleetInfo(scope),
    ]);

    const activeJobs = assignedJobs
      .filter((job) => !['completed', 'cancelled'].includes(job.status))
      .sort((a, b) => {
        const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

    const stops: MobileRouteStop[] = activeJobs.map((job, index) => ({
      jobId: job.id,
      title: job.title,
      customerName: job.customerName,
      status: job.status,
      scheduledAt: job.scheduledAt,
      address: null,
      sequence: index + 1,
    }));

    return {
      stopCount: stops.length,
      nextDestination: stops[0] ?? null,
      estimatedTravelMinutes: stops.length > 1 ? (stops.length - 1) * 20 : null,
      assignedVehicleName: fleetInfo.assignedVehicle?.name ?? null,
      assignedVehiclePlate: fleetInfo.assignedVehicle?.licensePlate ?? null,
      stops,
    };
  }

  private async getTravelHistory(scope: TechnicianScope): Promise<MobileTravelHistoryEntry[]> {
    const rows = await this.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, scope.companyId),
        eq(mobileTimeEntries.userId, scope.userId),
        or(eq(mobileTimeEntries.entryType, 'travel'), eq(mobileTimeEntries.entryType, 'job_time')),
      ),
      with: { job: true },
      orderBy: [desc(mobileTimeEntries.startedAt)],
      limit: 30,
    });

    const actionRows = await this.db.query.mobileActionLogs.findMany({
      where: and(
        eq(mobileActionLogs.companyId, scope.companyId),
        eq(mobileActionLogs.userId, scope.userId),
        or(eq(mobileActionLogs.actionType, 'start_job'), eq(mobileActionLogs.actionType, 'complete_job')),
      ),
      orderBy: [desc(mobileActionLogs.createdAt)],
      limit: 20,
    });

    const history: MobileTravelHistoryEntry[] = rows.map((row) => ({
      jobId: row.jobId,
      jobTitle: row.job?.title ?? null,
      entryType: row.entryType,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
    }));

    for (const log of actionRows) {
      history.push({
        jobId: log.entityId,
        jobTitle: null,
        entryType: log.actionType === 'start_job' ? 'job_time' : 'job_time',
        startedAt: log.createdAt.toISOString(),
        endedAt: null,
        durationMinutes: null,
      });
    }

    return history
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 30);
  }

  private async getInventoryAlerts(companyId: string): Promise<MobileInventoryAlert[]> {
    const context = await this.inventoryService.buildAuraContext(companyId);
    return context.items
      .filter((item) => item.isLowStock)
      .slice(0, 10)
      .map((item) => ({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        totalQuantityOnHand: item.totalQuantityOnHand,
        reorderLevel: item.reorderLevel,
      }));
  }

  private async listActiveAnnouncements(companyId: string): Promise<MobileCompanyAnnouncementSummary[]> {
    const now = new Date();
    const rows = await this.db.query.mobileCompanyAnnouncements.findMany({
      where: and(
        eq(mobileCompanyAnnouncements.companyId, companyId),
        eq(mobileCompanyAnnouncements.isActive, true),
        or(
          isNull(mobileCompanyAnnouncements.expiresAt),
          gte(mobileCompanyAnnouncements.expiresAt, now),
        ),
      ),
      orderBy: [desc(mobileCompanyAnnouncements.publishedAt)],
      limit: 10,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
       announcementType: row.announcementType,
      publishedAt: row.publishedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    }));
  }

  private async requireAssignedJob(scope: TechnicianScope, jobId: string) {
    const job = await this.jobsService.getJob(scope.companyId, jobId);

    if (!job) {
      throw new MobileWorkforceError('NOT_FOUND', 'Job not found');
    }

    if (job.assignedUserId !== scope.userId) {
      throw new MobileWorkforceError('FORBIDDEN', 'Job is not assigned to you');
    }

    return job;
  }

  private async logAction(
    scope: TechnicianScope,
    actionType: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(mobileActionLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      metadata,
    });
  }
}

function toRequestSummary(row: typeof mobileWorkforceRequests.$inferSelect): MobileWorkforceRequestSummary {
  return {
    id: row.id,
    requestType: row.requestType,
    status: row.status,
    subject: row.subject,
    message: row.message,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTimeEntrySummary(
  row: typeof mobileTimeEntries.$inferSelect & { job?: { title: string } | null },
): MobileTimeEntrySummary {
  return {
    id: row.id,
    entryType: row.entryType,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toInventoryUsageSummary(
  row: typeof mobileJobInventoryUsage.$inferSelect & {
    inventoryItem?: { sku: string; name: string } | null;
  },
): MobileJobInventoryUsageSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    inventoryItemId: row.inventoryItemId,
    itemSku: row.inventoryItem?.sku ?? 'Unknown',
    itemName: row.inventoryItem?.name ?? 'Unknown',
    quantity: row.quantity,
    status: row.status,
    scanCode: row.scanCode,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDocumentationSummary(
  row: typeof mobileJobDocumentation.$inferSelect,
): MobileJobDocumentationSummary {
  return {
    id: row.id,
    jobId: row.jobId,
    documentationType: row.documentationType,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}
