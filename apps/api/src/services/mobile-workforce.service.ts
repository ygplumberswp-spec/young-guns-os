import { and, desc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  CreateMobileTimeEntryRequest,
  CreateMobileWorkforceRequest,
  FlushOfflineActionsRequest,
  FlushOfflineActionsResponse,
  JobExecutionException,
  JobExecutionPhase,
  JobWorkflowAction,
  MobileCompanyAnnouncementSummary,
  MobileInventoryAlert,
  MobileJobDocumentationSummary,
  MobileJobExecutionWorkspace,
  MobileJobInventoryUsageSummary,
  MobileJobWorkspacePropertyHistoryEntry,
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
  OfflineActionInput,
  RecordJobMaterialLineRequest,
  ReportMobileSyncConflictRequest,
  ResolveMobileSyncConflictRequest,
  SubmitMobileInventoryUsageRequest,
  SubmitMobileJobDocumentationRequest,
  UploadJobEvidenceRequest,
} from '@titan/shared';
import { formatMapsEtaCapabilityLabel } from '@titan/shared';
import { classifyOfflineFlushByExistingLog } from './job-execution-completion-idempotency.js';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  inventoryItems,
  inventoryLocations,
  jobs,
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
import type { TechnicianWorkflowService } from './technician-workflow.service.js';
import { availableActionsForPhase, JobExecutionService, userHasJobAccess } from './job-execution.service.js';
import {
  decodeBase64Payload,
  JobEvidenceStorageError,
  type JobEvidenceKind,
  type JobEvidenceStorageService,
} from './job-evidence-storage.service.js';

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

/** Maps the legacy documentation-type taxonomy onto the narrower binary storage kinds. */
function documentationTypeToEvidenceKind(documentationType: string): JobEvidenceKind {
  if (documentationType === 'photo') return 'photo';
  if (documentationType === 'customer_signature') return 'signature';
  return 'document';
}

export class MobileWorkforceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mobileService: MobileService,
    private readonly mobileSyncService: MobileSyncService,
    private readonly jobsService: JobsService,
    private readonly inventoryService: InventoryService,
    private readonly integrationsService: IntegrationsService,
    private readonly notificationService: NotificationService,
    private readonly jobExecutionService: JobExecutionService,
    private readonly jobEvidenceStorageService: JobEvidenceStorageService,
    private readonly technicianWorkflowService: TechnicianWorkflowService,
  ) {}

  async getWorkforceDashboard(scope: TechnicianScope): Promise<MobileWorkforceDashboard> {
    const [
      baseDashboard,
      route,
      inventoryAlerts,
      announcements,
      pendingRequests,
      pendingActions,
      todaySchedule,
    ] = await Promise.all([
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
    const unreadNotificationCount = baseDashboard.notifications.filter(
      (item) => !item.isRead,
    ).length;

    return {
      greeting: baseDashboard.greeting,
      assignedJobs: baseDashboard.assignedJobs,
      todaysSchedule: todaySchedule.events,
      upcomingSchedule: baseDashboard.upcomingSchedule.items,
      routeSummary: route,
      outstandingTaskCount: pendingActions.length,
      pendingRequestCount: pendingRequests.filter((item) => item.status === 'pending_approval')
        .length,
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

  async getJobWorkspace(
    scope: TechnicianScope,
    jobId: string,
  ): Promise<MobileJobExecutionWorkspace> {
    const job = await this.requireAssignedJob(scope, jobId);
    const [customer, rawJob] = await Promise.all([
      this.db.query.customers.findFirst({
        where: and(eq(customers.id, job.customerId), eq(customers.companyId, scope.companyId)),
      }),
      this.db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)),
        columns: { executionPhase: true },
      }),
    ]);

    if (!customer) {
      throw new MobileWorkforceError('NOT_FOUND', 'Customer not found');
    }
    if (!rawJob) {
      throw new MobileWorkforceError('NOT_FOUND', 'Job not found');
    }

    const executionPhase = rawJob.executionPhase;

    const [
      timeEntries,
      inventoryUsage,
      documentation,
      pendingCompletion,
      crew,
      vehicle,
      pendingVariations,
      materialLines,
      completionGate,
      propertyHistoryRows,
    ] = await Promise.all([
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, scope.companyId), eq(mobileTimeEntries.jobId, jobId)),
        with: { user: true },
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
      this.jobExecutionService.getCrew(scope.companyId, jobId),
      this.jobExecutionService.getActiveVehicle(scope.companyId, jobId),
      this.jobExecutionService.listVariations(scope.companyId, jobId, 'pending'),
      this.jobExecutionService.listMaterialLines(scope.companyId, jobId),
      this.jobExecutionService.getCompletionGate(scope, jobId),
      job.propertyId
        ? this.db.query.jobs.findMany({
            where: and(
              eq(jobs.companyId, scope.companyId),
              eq(jobs.propertyId, job.propertyId),
              ne(jobs.id, jobId),
            ),
            orderBy: [desc(jobs.updatedAt)],
            limit: 5,
            columns: {
              id: true,
              jobNumber: true,
              title: true,
              status: true,
              executionPhase: true,
              executionPhaseUpdatedAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const checklist =
      pendingCompletion?.payload && typeof pendingCompletion.payload.checklist === 'object'
        ? (pendingCompletion.payload.checklist as Record<string, boolean>)
        : {};
    const completionSummary =
      pendingCompletion?.payload && typeof pendingCompletion.payload.summary === 'string'
        ? pendingCompletion.payload.summary
        : null;

    const exceptions = buildExceptionHints({
      executionPhase,
      scheduledAt: job.scheduledAt,
      pendingVariationCount: pendingVariations.length,
      gateMissing: completionGate.missing,
    });

    const propertyHistory: MobileJobWorkspacePropertyHistoryEntry[] = propertyHistoryRows.map((row) => ({
      id: row.id,
      jobNumber: row.jobNumber ?? null,
      title: row.title,
      status: row.status,
      completedAt: row.executionPhase === 'completed' ? row.executionPhaseUpdatedAt?.toISOString() ?? null : null,
    }));

    return {
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobType: job.jobType,
      priority: job.priority,
      title: job.title,
      status: job.status,
      executionPhase,
      scheduledAt: job.scheduledAt,
      scheduledEndAt: job.scheduledEndAt,
      workInstructions: job.description,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      address: job.address,
      accessInstructions: job.accessInstructions,
      siteContact: {
        name: job.siteContact.name,
        mobile: job.siteContact.mobile,
        email: job.siteContact.email,
      },
      internalNotes: job.notes,
      customerVisibleNotes: job.customerVisibleNotes,
      navigationUrl: job.addressDisplay
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.addressDisplay)}`
        : null,
      crew,
      vehicle,
      variations: pendingVariations,
      materialLines,
      exceptions,
      availableActions: availableActionsForPhase(executionPhase),
      completionGate,
      propertyHistory,
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

    // UX-I: never expose coordinates as live tracking unless Cartrack is truly connected.
    const liveTrackingAvailable = Boolean(tracking.cartrackConnected);
    const assignedVehicleId = fleetInfo.assignedVehicle?.id ?? null;
    const latestGps =
      liveTrackingAvailable && assignedVehicleId != null
        ? (tracking.latestPositions.find((pos) => pos.vehicleId === assignedVehicleId) ?? null)
        : liveTrackingAvailable
          ? (tracking.latestPositions[0] ?? null)
          : null;

    const hasSchedule = route.stops.some((stop) => Boolean(stop.scheduledAt));
    const mapsCapabilityState = 'not_implemented' as const;
    const etaSource = hasSchedule ? ('schedule_only' as const) : ('none' as const);

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
      mapsCapabilityState,
      mapsCapabilityLabel: formatMapsEtaCapabilityLabel(mapsCapabilityState),
      etaSource,
      liveTrackingAvailable: liveTrackingAvailable && Boolean(latestGps),
    };
  }

  async getInventoryCentre(scope: TechnicianScope): Promise<MobileWorkforceInventoryCentre> {
    const [alerts, recentUsage, catalogItems, locations] = await Promise.all([
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
      this.db.query.inventoryItems.findMany({
        where: and(eq(inventoryItems.companyId, scope.companyId), eq(inventoryItems.status, 'active')),
        orderBy: [desc(inventoryItems.updatedAt)],
        limit: 200,
      }),
      this.db.query.inventoryLocations.findMany({
        where: eq(inventoryLocations.companyId, scope.companyId),
        orderBy: [desc(inventoryLocations.updatedAt)],
        limit: 100,
      }),
    ]);

    return {
      alerts,
      recentUsage: recentUsage.map(toInventoryUsageSummary),
      pendingUsageCount: recentUsage.filter((item) => item.status === 'pending_approval').length,
      catalogItems: catalogItems.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku ?? null,
      })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        locationType: location.locationType,
        vehicleId: location.vehicleId ?? null,
      })),
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
      with: { job: true, user: true },
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
      with: { job: true, user: true },
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

  /**
   * Legacy metadata-only documentation path. Photo/signature evidence carrying an `evidencePhase`
   * must go through {@link uploadJobEvidence} with the actual binary — a phase without binary
   * would silently satisfy the completion gate with nothing to show for it.
   */
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

    const requiresBinaryEvidence =
      Boolean(input.evidencePhase) &&
      (input.documentationType === 'photo' || input.documentationType === 'customer_signature');
    if (requiresBinaryEvidence) {
      throw new MobileWorkforceError(
        'BINARY_REQUIRED',
        'Phase-gated photo and signature evidence must include the file contents — use the evidence upload endpoint',
      );
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
        evidencePhase: input.evidencePhase ?? null,
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

  /**
   * Binary evidence upload path: decodes and validates the payload, stores it via
   * {@link JobEvidenceStorageService}, and records only the storage key + checksum — never the
   * raw base64 — on the documentation row. Idempotent on `clientActionId`.
   */
  async uploadJobEvidence(
    scope: TechnicianScope,
    jobId: string,
    input: UploadJobEvidenceRequest,
  ): Promise<MobileJobDocumentationSummary> {
    await this.requireAssignedJob(scope, jobId);

    if (input.clientActionId) {
      const existing = await this.db.query.mobileJobDocumentation.findFirst({
        where: and(
          eq(mobileJobDocumentation.companyId, scope.companyId),
          eq(mobileJobDocumentation.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return toDocumentationSummary(existing);
      }
    }

    const title = input.title.trim();
    if (!title) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'Title is required');
    }
    if (!input.dataBase64?.trim()) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'File contents are required');
    }
    if (!input.mimeType?.trim()) {
      throw new MobileWorkforceError('VALIDATION_ERROR', 'A MIME type is required');
    }

    const buffer = decodeBase64Payload(input.dataBase64);
    const kind = documentationTypeToEvidenceKind(input.documentationType);

    let stored: Awaited<ReturnType<JobEvidenceStorageService['store']>>;
    try {
      stored = await this.jobEvidenceStorageService.store({
        companyId: scope.companyId,
        jobId,
        kind,
        mimeType: input.mimeType.trim(),
        buffer,
        originalFileName: input.fileName ?? null,
      });
    } catch (error) {
      if (error instanceof JobEvidenceStorageError) {
        throw new MobileWorkforceError(error.code, error.message);
      }
      throw error;
    }

    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.signerName?.trim()) metadata.signerName = input.signerName.trim();
    if (input.signerRole?.trim()) metadata.signerRole = input.signerRole.trim();
    if (input.acknowledgement !== undefined) metadata.acknowledgement = input.acknowledgement;

    const [created] = await this.db
      .insert(mobileJobDocumentation)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        jobId,
        documentationType: input.documentationType,
        title,
        fileName: input.fileName?.trim() || null,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        // Never store the raw base64 payload — the binary lives at storageKey.
        content: null,
        storageKey: stored.storageKey,
        checksumSha256: stored.checksumSha256,
        clientActionId: input.clientActionId ?? null,
        evidencePhase: input.evidencePhase ?? null,
        metadata,
      })
      .returning();

    if (!created) {
      throw new MobileWorkforceError('CREATE_FAILED', 'Unable to store evidence');
    }

    await this.logAction(scope, 'upload_job_evidence', 'job', jobId, {
      documentationId: created.id,
      documentationType: input.documentationType,
      evidencePhase: input.evidencePhase ?? null,
      sizeBytes: stored.sizeBytes,
    });

    return toDocumentationSummary(created);
  }

  /** Technician-facing binary retrieval: requires assigned-job access. */
  async getJobEvidenceBinary(
    scope: TechnicianScope,
    jobId: string,
    documentationId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string | null }> {
    await this.requireAssignedJob(scope, jobId);
    return this.readEvidenceBinary(scope.companyId, jobId, documentationId);
  }

  /** Office-facing binary retrieval: caller has already been authorized via jobs:read RBAC. */
  async getJobEvidenceBinaryForOffice(
    companyId: string,
    jobId: string,
    documentationId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string | null }> {
    const job = await this.jobsService.getJob(companyId, jobId);
    if (!job) {
      throw new MobileWorkforceError('NOT_FOUND', 'Job not found');
    }
    return this.readEvidenceBinary(companyId, jobId, documentationId);
  }

  private async readEvidenceBinary(
    companyId: string,
    jobId: string,
    documentationId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string | null }> {
    const doc = await this.db.query.mobileJobDocumentation.findFirst({
      where: and(
        eq(mobileJobDocumentation.id, documentationId),
        eq(mobileJobDocumentation.companyId, companyId),
        eq(mobileJobDocumentation.jobId, jobId),
      ),
    });

    if (!doc) {
      throw new MobileWorkforceError('NOT_FOUND', 'Documentation record not found');
    }
    if (!doc.storageKey) {
      throw new MobileWorkforceError('NOT_FOUND', 'No binary evidence is stored for this record');
    }

    try {
      const { buffer } = await this.jobEvidenceStorageService.read({
        companyId,
        jobId,
        storageKey: doc.storageKey,
      });
      return { buffer, mimeType: doc.mimeType ?? 'application/octet-stream', fileName: doc.fileName };
    } catch (error) {
      if (error instanceof JobEvidenceStorageError) {
        throw new MobileWorkforceError(error.code, error.message);
      }
      throw error;
    }
  }

  /**
   * Applies a batch of offline-queued actions with per-action idempotency and error isolation.
   * Each action is deduplicated on `clientActionId` via the mobile action log before being applied.
   */
  async flushOfflineActions(
    scope: TechnicianScope,
    request: FlushOfflineActionsRequest,
  ): Promise<FlushOfflineActionsResponse> {
    const results: FlushOfflineActionsResponse['results'] = [];

    for (const action of request.actions) {
      try {
        const existing = await this.db.query.mobileActionLogs.findFirst({
          where: and(
            eq(mobileActionLogs.companyId, scope.companyId),
            eq(mobileActionLogs.actionType, 'offline_action_flush'),
            sql`${mobileActionLogs.metadata}->>'clientActionId' = ${action.clientActionId}`,
          ),
          columns: { id: true },
        });

        if (classifyOfflineFlushByExistingLog(existing) === 'duplicate') {
          results.push({
            clientActionId: action.clientActionId,
            actionType: action.actionType,
            status: 'duplicate',
          });
          continue;
        }

        const resultId = await this.applyOfflineAction(scope, action);

        await this.logAction(scope, 'offline_action_flush', 'job', action.jobId, {
          clientActionId: action.clientActionId,
          actionType: action.actionType,
          resultId: resultId ?? null,
        });

        results.push({
          clientActionId: action.clientActionId,
          actionType: action.actionType,
          status: 'synced',
          resultId,
        });
      } catch (error) {
        results.push({
          clientActionId: action.clientActionId,
          actionType: action.actionType,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error while applying offline action',
        });
      }
    }

    return { results };
  }

  private async applyOfflineAction(
    scope: TechnicianScope,
    action: OfflineActionInput,
  ): Promise<string | undefined> {
    await this.requireAssignedJob(scope, action.jobId);

    switch (action.actionType) {
      case 'transition': {
        const payload = action.payload as { action?: JobWorkflowAction; reason?: string | null };
        if (!payload?.action) {
          throw new MobileWorkforceError('VALIDATION_ERROR', 'A transition action is required');
        }
        const job = await this.jobExecutionService.transition(scope, action.jobId, {
          action: payload.action,
          reason: payload.reason ?? null,
          clientActionId: action.clientActionId,
        });
        return job.id;
      }
      case 'note': {
        const payload = action.payload as { note?: string };
        if (!payload?.note?.trim()) {
          throw new MobileWorkforceError('VALIDATION_ERROR', 'Note text is required');
        }
        const job = await this.technicianWorkflowService.addJobNote(scope, action.jobId, {
          note: payload.note,
        });
        return job.id;
      }
      case 'time_entry': {
        const payload = action.payload as CreateMobileTimeEntryRequest;
        if (!payload?.entryType) {
          throw new MobileWorkforceError('VALIDATION_ERROR', 'entryType is required');
        }
        const entry = await this.createTimeEntry(scope, { ...payload, jobId: payload.jobId ?? action.jobId });
        return entry.id;
      }
      case 'material_line': {
        const payload = action.payload as RecordJobMaterialLineRequest;
        if (!payload?.description?.trim() || !payload?.materialSource) {
          throw new MobileWorkforceError('VALIDATION_ERROR', 'A material line description and source are required');
        }
        const line = await this.jobExecutionService.recordMaterialLine(scope, action.jobId, {
          ...payload,
          clientActionId: action.clientActionId,
        });
        return line.id;
      }
      case 'checklist_update': {
        const payload = action.payload as { checklist?: Record<string, boolean>; summary?: string | null };
        const pendingAction = await this.mobileSyncService.createPendingAction({
          companyId: scope.companyId,
          userId: scope.userId,
          actionType: 'submit_completion',
          entityType: 'job',
          entityId: action.jobId,
          payload: { checklist: payload?.checklist ?? {}, summary: payload?.summary ?? null },
        });
        return pendingAction.id;
      }
      case 'evidence_upload': {
        const payload = action.payload as UploadJobEvidenceRequest;
        if (!payload?.dataBase64 || !payload?.mimeType || !payload?.title) {
          throw new MobileWorkforceError('VALIDATION_ERROR', 'Evidence upload payload is invalid');
        }
        const documentation = await this.uploadJobEvidence(scope, action.jobId, {
          ...payload,
          clientActionId: action.clientActionId,
        });
        return documentation.id;
      }
      default:
        throw new MobileWorkforceError(
          'VALIDATION_ERROR',
          `Unsupported offline action type: ${String(action.actionType)}`,
        );
    }
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
      address: job.addressDisplay ?? null,
      sequence: index + 1,
    }));

    return {
      stopCount: stops.length,
      nextDestination: stops[0] ?? null,
      // UX-I: no fabricated travel minutes — live routing is not implemented.
      estimatedTravelMinutes: null,
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
        or(
          eq(mobileActionLogs.actionType, 'start_job'),
          eq(mobileActionLogs.actionType, 'complete_job'),
        ),
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

  private async listActiveAnnouncements(
    companyId: string,
  ): Promise<MobileCompanyAnnouncementSummary[]> {
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

    const hasAccess = await userHasJobAccess(this.db, scope.companyId, jobId, scope.userId);
    if (!hasAccess) {
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

function toRequestSummary(
  row: typeof mobileWorkforceRequests.$inferSelect,
): MobileWorkforceRequestSummary {
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
  row: typeof mobileTimeEntries.$inferSelect & {
    job?: { title: string; jobNumber: string | null } | null;
    user?: { firstName: string; lastName: string } | null;
  },
): MobileTimeEntrySummary {
  return {
    id: row.id,
    entryType: row.entryType,
    jobId: row.jobId,
    jobNumber: row.job?.jobNumber ?? null,
    jobTitle: row.job?.title ?? null,
    userId: row.userId,
    userName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : 'Unknown',
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildExceptionHints(input: {
  executionPhase: JobExecutionPhase;
  scheduledAt: string | null;
  pendingVariationCount: number;
  gateMissing: string[];
}): JobExecutionException[] {
  const exceptions: JobExecutionException[] = [];

  if (input.pendingVariationCount > 0) {
    exceptions.push('pending_variation');
  }
  if (input.gateMissing.includes('before_photo') || input.gateMissing.includes('after_photo')) {
    exceptions.push('missing_evidence');
  }
  if (input.executionPhase === 'awaiting_parts') {
    exceptions.push('awaiting_parts');
  }
  if (input.gateMissing.includes('coc_classification')) {
    exceptions.push('incomplete_compliance');
  }
  if (
    input.scheduledAt &&
    new Date(input.scheduledAt).getTime() < Date.now() &&
    (input.executionPhase === 'assigned' || input.executionPhase === 'accepted')
  ) {
    exceptions.push('late_arrival');
  }

  return exceptions;
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
  const hasBinary = Boolean(row.storageKey);
  return {
    id: row.id,
    jobId: row.jobId,
    documentationType: row.documentationType,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    content: row.content,
    storageKey: row.storageKey,
    checksumSha256: row.checksumSha256,
    evidencePhase: (row.evidencePhase as MobileJobDocumentationSummary['evidencePhase']) ?? null,
    hasBinary,
    downloadPath: hasBinary
      ? `/api/v1/mobile/technician/workforce/jobs/${row.jobId}/documentation/${row.id}/content`
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}
