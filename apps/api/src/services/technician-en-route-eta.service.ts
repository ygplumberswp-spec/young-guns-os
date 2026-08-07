import type {
  JobDetail,
  TechnicianEnRouteEtaTruth,
} from '@titan/shared';
import {
  isValidLatLng,
  renderEnRouteCustomerMessage,
  resolveTechnicianEnRouteEtaTruth,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  customers,
  mobileActionLogs,
  securityAuditLogs,
  ucDispatchNotifications,
} from '@titan/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  DispatchCommunicationError,
  type DispatchCommunicationService,
} from './dispatch-communication.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { JobsService } from './jobs.service.js';
import { JobExecutionError, JobExecutionService, userHasJobAccess } from './job-execution.service.js';
import type { TravelTimeService } from './travel-time.service.js';
import type { MobileService } from './mobile.service.js';

export class TechnicianEnRouteEtaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TechnicianEnRouteEtaError';
  }
}

export type TechnicianEnRouteScope = {
  companyId: string;
  userId: string;
};

export type TechnicianEnRouteConfirmResult = {
  job: JobDetail;
  eta: TechnicianEnRouteEtaTruth;
  customerNotification: {
    status: 'queued' | 'already_queued' | 'skipped_opt_out' | 'skipped_no_channel' | 'skipped_no_recipient';
    notificationId: string | null;
    messageBody: string;
  };
  vehicle: {
    id: string | null;
    name: string | null;
    licensePlate: string | null;
    positionUsed: boolean;
  };
  alreadyEnRoute: boolean;
};

/**
 * ON MY WAY / EN ROUTE — Cartrack origin + Google Maps route ETA + customer notify.
 * Does not invent arrival times. Does not expose live GPS to the customer.
 */
export class TechnicianEnRouteEtaService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jobsService: JobsService,
    private readonly jobExecutionService: JobExecutionService,
    private readonly travelTimeService: TravelTimeService,
    private readonly integrationsService: IntegrationsService,
    private readonly mobileService: MobileService,
    private readonly dispatchCommunicationService: DispatchCommunicationService,
  ) {}

  async confirmEnRoute(
    scope: TechnicianEnRouteScope,
    jobId: string,
    input?: { clientActionId?: string | null; messageTemplate?: string | null },
  ): Promise<TechnicianEnRouteConfirmResult> {
    const job = await this.requireAssignedJob(scope, jobId);

    if (!job.assignedUserId) {
      throw new TechnicianEnRouteEtaError('INVALID_STATE', 'Job must have an assigned technician');
    }

    const alreadyEnRoute = job.executionPhase === 'en_route';
    const prior = alreadyEnRoute ? await this.findPriorEnRouteLog(scope.companyId, jobId) : null;

    const etaContext = await this.computeEta(scope, job);
    const companyName = await this.resolveCompanyName(scope.companyId);
    const jobNumber = job.jobNumber?.trim() || job.id.slice(0, 8);
    const messageBody = renderEnRouteCustomerMessage({
      template: input?.messageTemplate,
      companyName,
      jobNumber,
      arrivalWindowLabel: etaContext.arrivalWindowLabel,
    });

    if (!alreadyEnRoute) {
      try {
        await this.jobExecutionService.transition(scope, jobId, {
          action: 'en_route',
          clientActionId: input?.clientActionId?.trim() || null,
        });
      } catch (error) {
        if (error instanceof JobExecutionError) {
          throw new TechnicianEnRouteEtaError(error.code, error.message);
        }
        throw error;
      }
    }

    const fleetInfo = await this.mobileService.getTechnicianFleetInfo(scope);
    const vehicleMeta = {
      id: fleetInfo.assignedVehicle?.id ?? null,
      name: fleetInfo.assignedVehicle?.name ?? null,
      licensePlate: fleetInfo.assignedVehicle?.licensePlate ?? null,
      positionUsed: etaContext.vehicleOriginUsed,
    };

    if (!alreadyEnRoute || !prior) {
      await this.db.insert(mobileActionLogs).values({
        companyId: scope.companyId,
        userId: scope.userId,
        actionType: 'mark_en_route',
        entityType: 'job',
        entityId: jobId,
        metadata: {
          previousStatus: job.status,
          trackingEnabled: true,
          vehicleId: vehicleMeta.id,
          vehicleName: vehicleMeta.name,
          licensePlate: vehicleMeta.licensePlate,
          vehiclePositionUsed: vehicleMeta.positionUsed,
          etaAvailable: etaContext.etaAvailable,
          travelMinutes: etaContext.travelMinutes,
          travelSource: etaContext.travelSource,
          arrivalWindowStartAt: etaContext.arrivalWindowStartAt,
          arrivalWindowEndAt: etaContext.arrivalWindowEndAt,
          arrivalWindowLabel: etaContext.arrivalWindowLabel,
          warning: etaContext.warning,
          clientActionId: input?.clientActionId ?? null,
          // Privacy: never store continuous GPS feed for customer exposure.
          customerVisibleGps: false,
        },
      });
    }

    const customerRow = await this.db.query.customers.findFirst({
      where: and(eq(customers.companyId, scope.companyId), eq(customers.id, job.customerId)),
      columns: { id: true, doNotContact: true },
    });

    const notification = await this.queueCustomerNotification(scope, {
      jobId,
      customerId: job.customerId,
      doNotContact: Boolean(customerRow?.doNotContact),
      messageBody,
      etaMinutes: etaContext.travelMinutes,
    });

    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'dispatch',
      action: 'technician_en_route_confirmed',
      entityType: 'job',
      entityId: jobId,
      userId: scope.userId,
      metadata: {
        jobNumber,
        vehicleId: vehicleMeta.id,
        vehiclePositionUsed: vehicleMeta.positionUsed,
        arrivalWindowLabel: etaContext.arrivalWindowLabel,
        etaAvailable: etaContext.etaAvailable,
        travelMinutes: etaContext.travelMinutes,
        notificationStatus: notification.status,
        notificationId: notification.notificationId,
        alreadyEnRoute,
        clientActionId: input?.clientActionId ?? null,
        customerVisibleGps: false,
      },
    });

    const updated = (await this.jobsService.getJob(scope.companyId, jobId)) ?? job;

    return {
      job: updated,
      eta: etaContext,
      customerNotification: notification,
      vehicle: vehicleMeta,
      alreadyEnRoute,
    };
  }

  private async computeEta(
    scope: TechnicianEnRouteScope,
    job: JobDetail,
  ): Promise<TechnicianEnRouteEtaTruth> {
    const jobLat = job.address.latitude;
    const jobLng = job.address.longitude;
    const jobHasVerifiedCoordinates = isValidLatLng(jobLat, jobLng);

    const [tracking, fleetInfo] = await Promise.all([
      this.integrationsService.buildFleetTrackingContext(scope.companyId),
      this.mobileService.getTechnicianFleetInfo(scope),
    ]);

    const assignedVehicleId = fleetInfo.assignedVehicle?.id ?? null;
    const latestGps =
      tracking.cartrackConnected && assignedVehicleId
        ? (tracking.latestPositions.find((pos) => pos.vehicleId === assignedVehicleId) ?? null)
        : null;

    const vehicleOrigin =
      latestGps && isValidLatLng(latestGps.latitude, latestGps.longitude)
        ? { latitude: latestGps.latitude, longitude: latestGps.longitude }
        : null;

    const travel = await this.travelTimeService.estimateTravelMinutes({
      companyId: scope.companyId,
      vehicleOrigin,
      destination: jobHasVerifiedCoordinates
        ? { latitude: jobLat!, longitude: jobLng! }
        : null,
      defaultMinutes: 0,
      knownCartrackConnected: tracking.cartrackConnected,
    });

    return resolveTechnicianEnRouteEtaTruth({
      travelMinutes: travel.source === 'google_maps' ? travel.minutes : null,
      travelSource: travel.source,
      vehicleOriginUsed: travel.vehicleOriginUsed,
      cartrackConnected: travel.cartrackConnected,
      googleMapsConnected: travel.googleMapsConnected,
      jobHasVerifiedCoordinates,
      travelWarning: travel.warning,
    });
  }

  private async queueCustomerNotification(
    scope: TechnicianEnRouteScope,
    input: {
      jobId: string;
      customerId: string;
      doNotContact: boolean;
      messageBody: string;
      etaMinutes: number | null;
    },
  ): Promise<TechnicianEnRouteConfirmResult['customerNotification']> {
    if (input.doNotContact) {
      return {
        status: 'skipped_opt_out',
        notificationId: null,
        messageBody: input.messageBody,
      };
    }

    const existing = await this.db.query.ucDispatchNotifications.findFirst({
      where: and(
        eq(ucDispatchNotifications.companyId, scope.companyId),
        eq(ucDispatchNotifications.jobId, input.jobId),
        eq(ucDispatchNotifications.notificationType, 'technician_en_route'),
        inArray(ucDispatchNotifications.status, ['pending', 'sent']),
      ),
      orderBy: [desc(ucDispatchNotifications.createdAt)],
      columns: { id: true, messageBody: true, status: true },
    });

    if (existing) {
      return {
        status: 'already_queued',
        notificationId: existing.id,
        messageBody: existing.messageBody ?? input.messageBody,
      };
    }

    try {
      const queued = await this.dispatchCommunicationService.queueApprovedDraft(scope, {
        jobId: input.jobId,
        hookType: 'technician_en_route',
        messageBody: input.messageBody,
        etaMinutes: input.etaMinutes ?? undefined,
      });

      if (queued.status === 'skipped') {
        return {
          status: 'skipped_no_channel',
          notificationId: queued.id,
          messageBody: input.messageBody,
        };
      }

      return {
        status: 'queued',
        notificationId: queued.id,
        messageBody: input.messageBody,
      };
    } catch (error) {
      if (error instanceof DispatchCommunicationError && error.code === 'ALREADY_QUEUED') {
        return {
          status: 'already_queued',
          notificationId: null,
          messageBody: input.messageBody,
        };
      }
      if (error instanceof DispatchCommunicationError && error.code === 'NOT_APPLICABLE') {
        return {
          status: 'skipped_no_recipient',
          notificationId: null,
          messageBody: input.messageBody,
        };
      }
      throw error;
    }
  }

  private async findPriorEnRouteLog(companyId: string, jobId: string) {
    return this.db.query.mobileActionLogs.findFirst({
      where: and(
        eq(mobileActionLogs.companyId, companyId),
        eq(mobileActionLogs.entityType, 'job'),
        eq(mobileActionLogs.entityId, jobId),
        eq(mobileActionLogs.actionType, 'mark_en_route'),
      ),
      orderBy: [desc(mobileActionLogs.createdAt)],
    });
  }

  private async resolveCompanyName(companyId: string): Promise<string> {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { name: true },
    });
    return company?.name?.trim() || 'Young Guns Plumbing';
  }

  private async requireAssignedJob(scope: TechnicianEnRouteScope, jobId: string) {
    const job = await this.jobsService.getJob(scope.companyId, jobId);
    if (!job) {
      throw new TechnicianEnRouteEtaError('NOT_FOUND', 'Job not found');
    }
    const hasAccess = await userHasJobAccess(this.db, scope.companyId, jobId, scope.userId);
    if (!hasAccess) {
      throw new TechnicianEnRouteEtaError('FORBIDDEN', 'Job is not assigned to you');
    }
    return job;
  }
}
