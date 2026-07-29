import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type {
  CreateCxAppointmentBookingRequest,
  CreateCxCustomerPropertyRequest,
  CreateCxLoyaltyProgramRequest,
  CreateCxLoyaltyReferralRequest,
  CreateCxReviewFeedbackRequest,
  CxAnalyticsSummary,
  CxAppointmentBookingSummary,
  CxCommunicationCentre,
  CxCustomerDashboard,
  CxCustomerDocumentSummary,
  CxCustomerPropertySummary,
  CxDocumentCentre,
  CxEngagementPreferencesSummary,
  CxFinanceCentre,
  CxLoyaltyProgramSummary,
  CxLoyaltyReferralSummary,
  CxPlatformConfigSummary,
  CxReviewFeedbackSummary,
  CxTechnicianTrackingSummary,
  EnterpriseCustomerExperienceAuraContext,
  EnterpriseCustomerExperienceDashboard,
  UpdateCxEngagementPreferencesRequest,
  UpdateCxPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  cxAnalyticsSnapshots,
  cxAppointmentBookings,
  cxAuditLogs,
  cxCustomerDocuments,
  cxCustomerProperties,
  cxEngagementPreferences,
  cxLoyaltyPrograms,
  cxLoyaltyReferrals,
  cxPlatformConfig,
  cxReviewsFeedback,
  documents,
  gpsPositions,
  jobs,
  portalUsers,
  ucDispatchNotifications,
  vehicles,
} from '@titan/db';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { EnterpriseUnifiedCommunicationsService } from './enterprise-unified-communications.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { PortalCustomerScope, PortalExperienceService } from './portal-experience.service.js';

export class EnterpriseCustomerExperienceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseCustomerExperienceError';
  }
}

type StaffScope = { companyId: string; userId: string };

type CustomerExperienceDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  portalExperienceService: PortalExperienceService;
  enterpriseUnifiedCommunicationsService: EnterpriseUnifiedCommunicationsService;
  integrationsService: IntegrationsService;
};

export class EnterpriseCustomerExperienceService {
  constructor(private readonly deps: CustomerExperienceDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseCustomerExperienceDashboard> {
    const isPlatformOwner = await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      portalUserCount,
      activeBookingCount,
      pendingApprovalBookingCount,
      openReviewCount,
      referralCount,
      loyaltyProgramCount,
      analytics,
      recentBookings,
      recentReviews,
      recentReferrals,
      fleetContext,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.countPortalUsers(companyId),
      this.countBookings(companyId, ['draft', 'pending_approval', 'approved', 'confirmed']),
      this.countBookings(companyId, ['pending_approval']),
      this.countReviews(companyId, ['submitted', 'acknowledged']),
      this.countReferrals(companyId),
      this.countLoyaltyPrograms(companyId),
      this.getLatestAnalytics(companyId),
      this.listBookings(companyId, { limit: 20 }),
      this.listReviews(companyId, { limit: 20 }),
      this.listReferrals(companyId, { limit: 20 }),
      this.deps.integrationsService.buildFleetTrackingContext(companyId),
    ]);

    return {
      summary: `${portalUserCount} portal user(s), ${activeBookingCount} active booking(s), ${pendingApprovalBookingCount} pending approval, ${openReviewCount} open review(s).`,
      isPlatformOwner,
      platformConfig,
      portalUserCount,
      activeBookingCount,
      pendingApprovalBookingCount,
      openReviewCount,
      referralCount,
      loyaltyProgramCount,
      analytics,
      recentBookings,
      recentReviews,
      recentReferrals,
      trackingEnabled: platformConfig.trackingEnabled,
      pwaEnabled: platformConfig.pwaEnabled,
      cartrackConnected: fleetContext.cartrackConnected,
    };
  }

  async getCustomerDashboard(scope: PortalCustomerScope): Promise<CxCustomerDashboard> {
    const base = await this.deps.portalExperienceService.getExperienceDashboard(scope);
    const [properties, openBookings, recentDocuments, loyaltyPrograms, engagementPreferences, referralCount, openReviewCount] =
      await Promise.all([
        this.listCustomerProperties(scope),
        this.listCustomerBookings(scope, { statuses: ['draft', 'pending_approval', 'approved', 'confirmed'] }),
        this.listCustomerDocuments(scope),
        this.listActiveLoyaltyPrograms(scope.companyId),
        this.getEngagementPreferences(scope),
        this.countCustomerReferrals(scope),
        this.countCustomerReviews(scope, ['submitted', 'acknowledged']),
      ]);

    await this.recordAudit(scope.companyId, {
      portalUserId: scope.portalUserId,
      customerId: scope.customerId,
      actionType: 'portal_dashboard_view',
    });

    return {
      ...base,
      openBookingCount: openBookings.length,
      openReviewCount,
      referralCount,
      properties,
      openBookings: openBookings.slice(0, 10),
      recentDocuments: recentDocuments.slice(0, 10),
      loyaltyPrograms,
      engagementPreferences,
    };
  }

  async getDocumentCentre(scope: PortalCustomerScope): Promise<CxDocumentCentre> {
    const [documentsList, quotes, finance] = await Promise.all([
      this.listCustomerDocuments(scope),
      this.deps.portalExperienceService.listQuotes(scope),
      scope.permissions.includes('portal.invoices:read')
        ? this.deps.portalExperienceService.getFinanceCentre(scope)
        : Promise.resolve({ invoices: [], outstandingBalanceCents: 0, currency: 'USD', payments: [] } as CxFinanceCentre),
    ]);

    return {
      documents: documentsList,
      invoices: finance.invoices,
      quotes,
    };
  }

  async getCommunicationCentre(scope: PortalCustomerScope): Promise<CxCommunicationCentre> {
    const [comms, requests] = await Promise.all([
      this.deps.portalExperienceService.getCommunicationsCentre(scope),
      this.deps.portalExperienceService.listCustomerRequests(scope),
    ]);

    return {
      communications: comms.communications,
      supportTicketCount: requests.filter((r) => r.requestType === 'support_message').length,
      pendingRequestCount: requests.filter((r) => r.status === 'pending_approval').length,
    };
  }

  async getTechnicianTracking(
    scope: PortalCustomerScope,
    jobId: string,
  ): Promise<CxTechnicianTrackingSummary | null> {
    const tracking = await this.deps.portalExperienceService.getJobTracking(scope, jobId);
    if (!tracking) return null;

    const config = await this.getPlatformConfig(scope.companyId);
    const engagement = await this.getEngagementPreferences(scope);
    const fleetContext = await this.deps.integrationsService.buildFleetTrackingContext(scope.companyId);

    let lastKnownLocation: CxTechnicianTrackingSummary['lastKnownLocation'] = null;
    if (config.trackingEnabled && engagement.trackingConsent && fleetContext.cartrackConnected) {
      const job = await this.deps.db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)),
        with: { assignedUser: true },
      });

      if (job?.assignedUserId) {
        const vehicle = await this.deps.db.query.vehicles.findFirst({
          where: and(
            eq(vehicles.companyId, scope.companyId),
            eq(vehicles.assignedUserId, job.assignedUserId),
          ),
        });
        const position = vehicle
          ? await this.deps.db.query.gpsPositions.findFirst({
              where: and(
                eq(gpsPositions.companyId, scope.companyId),
                eq(gpsPositions.vehicleId, vehicle.id),
              ),
              orderBy: [desc(gpsPositions.recordedAt)],
            })
          : null;
        if (position) {
          lastKnownLocation = {
            latitude: Number(position.latitude),
            longitude: Number(position.longitude),
            recordedAt: position.recordedAt.toISOString(),
          };
        }
      }
    }

    const dispatchRows = await this.deps.db.query.ucDispatchNotifications.findMany({
      where: and(
        eq(ucDispatchNotifications.companyId, scope.companyId),
        eq(ucDispatchNotifications.jobId, jobId),
        eq(ucDispatchNotifications.customerId, scope.customerId),
      ),
      orderBy: [desc(ucDispatchNotifications.createdAt)],
      limit: 20,
    });

    const progressPercent =
      tracking.job.status === 'completed'
        ? 100
        : tracking.job.status === 'in_progress'
          ? 60
          : tracking.job.status === 'scheduled'
            ? 30
            : 10;

    return {
      jobId,
      jobTitle: tracking.job.title,
      jobStatus: tracking.job.status,
      technicianName: tracking.job.assignedUserName ?? null,
      etaAt: tracking.job.etaAt,
      trackingEnabled: config.trackingEnabled,
      trackingConsent: engagement.trackingConsent,
      liveLocationAvailable: lastKnownLocation !== null,
      lastKnownLocation,
      progressPercent,
      dispatchNotifications: dispatchRows.map((n) => ({
        notificationType: n.notificationType,
        status: n.status,
        sentAt: n.sentAt?.toISOString() ?? null,
      })),
    };
  }

  async getPlatformConfig(companyId: string): Promise<CxPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateCxPlatformConfigRequest,
  ): Promise<CxPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(cxPlatformConfig)
      .set({
        globalPolicies: input.globalPolicies ?? existing.globalPolicies,
        brandingTemplates: input.brandingTemplates ?? existing.brandingTemplates,
        portalDefaults: input.portalDefaults ?? existing.portalDefaults,
        communicationPolicies: input.communicationPolicies ?? existing.communicationPolicies,
        engagementRules: input.engagementRules ?? existing.engagementRules,
        loyaltySettings: input.loyaltySettings ?? existing.loyaltySettings,
        trackingEnabled: input.trackingEnabled ?? existing.trackingEnabled,
        pwaEnabled: input.pwaEnabled ?? existing.pwaEnabled,
        updatedAt: new Date(),
      })
      .where(eq(cxPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope.companyId, {
      actionType: 'platform_config_updated',
      metadata: { userId: scope.userId },
    });

    return toPlatformConfigSummary(updated!);
  }

  async listCustomerProperties(scope: PortalCustomerScope): Promise<CxCustomerPropertySummary[]> {
    const rows = await this.deps.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, scope.companyId),
        eq(cxCustomerProperties.customerId, scope.customerId),
      ),
      orderBy: [desc(cxCustomerProperties.isPrimary), desc(cxCustomerProperties.createdAt)],
    });
    return rows.map(toPropertySummary);
  }

  async createCustomerProperty(
    scope: PortalCustomerScope,
    input: CreateCxCustomerPropertyRequest,
  ): Promise<CxCustomerPropertySummary> {
    if (input.isPrimary) {
      await this.deps.db
        .update(cxCustomerProperties)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(cxCustomerProperties.companyId, scope.companyId),
            eq(cxCustomerProperties.customerId, scope.customerId),
          ),
        );
    }

    const [created] = await this.deps.db
      .insert(cxCustomerProperties)
      .values({
        companyId: scope.companyId,
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        propertyName: input.propertyName,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null,
        isPrimary: input.isPrimary ?? false,
      })
      .returning();

    await this.recordAudit(scope.companyId, {
      portalUserId: scope.portalUserId,
      customerId: scope.customerId,
      actionType: 'property_created',
      entityType: 'cx_customer_property',
      entityId: created!.id,
    });

    return toPropertySummary(created!);
  }

  async createBooking(
    scope: PortalCustomerScope,
    input: CreateCxAppointmentBookingRequest,
  ): Promise<CxAppointmentBookingSummary> {
    const config = await this.getPlatformConfig(scope.companyId);
    const portalDefaults = config.portalDefaults as { requiresBookingApproval?: boolean };
    const requiresApproval = portalDefaults.requiresBookingApproval !== false;
    const status = requiresApproval ? 'pending_approval' : 'approved';

    const [created] = await this.deps.db
      .insert(cxAppointmentBookings)
      .values({
        companyId: scope.companyId,
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        propertyId: input.propertyId ?? null,
        bookingType: input.bookingType ?? 'standard',
        status,
        subject: input.subject,
        preferredDate: input.preferredDate ?? null,
        preferredTimeWindow: input.preferredTimeWindow ?? null,
        jobNotes: input.jobNotes ?? null,
        photoUrls: input.photoUrls ?? [],
        payload: input.payload ?? {},
      })
      .returning();

    await this.recordAudit(scope.companyId, {
      portalUserId: scope.portalUserId,
      customerId: scope.customerId,
      actionType: 'booking_created',
      entityType: 'cx_appointment_booking',
      entityId: created!.id,
      metadata: { status },
    });

    return toBookingSummary(created!);
  }

  async approveBooking(scope: StaffScope, bookingId: string): Promise<CxAppointmentBookingSummary> {
    const booking = await this.getBookingOrThrow(scope.companyId, bookingId);
    if (booking.status !== 'pending_approval') {
      throw new EnterpriseCustomerExperienceError('VALIDATION_ERROR', 'Booking is not pending approval');
    }

    const [updated] = await this.deps.db
      .update(cxAppointmentBookings)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(cxAppointmentBookings.id, bookingId))
      .returning();

    await this.recordAudit(scope.companyId, {
      actionType: 'booking_approved',
      entityType: 'cx_appointment_booking',
      entityId: bookingId,
      metadata: { userId: scope.userId },
    });

    return toBookingSummary(updated!);
  }

  async confirmBooking(scope: StaffScope, bookingId: string): Promise<CxAppointmentBookingSummary> {
    const booking = await this.getBookingOrThrow(scope.companyId, bookingId);
    if (!['approved', 'pending_approval'].includes(booking.status)) {
      throw new EnterpriseCustomerExperienceError('VALIDATION_ERROR', 'Booking cannot be confirmed');
    }

    const [updated] = await this.deps.db
      .update(cxAppointmentBookings)
      .set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(cxAppointmentBookings.id, bookingId))
      .returning();

    const engagement = await this.getEngagementPreferencesForCustomer(
      scope.companyId,
      booking.customerId,
      booking.portalUserId,
    );

    if (engagement.emailEnabled || engagement.smsEnabled || engagement.whatsappEnabled) {
      await this.deps.enterpriseUnifiedCommunicationsService.queueDispatchNotification(scope, {
        jobId: booking.id,
        customerId: booking.customerId,
        notificationType: 'appointment_confirmation',
        messageBody: `Your appointment "${booking.subject}" has been confirmed.`,
      });
    }

    await this.recordAudit(scope.companyId, {
      actionType: 'booking_confirmed',
      entityType: 'cx_appointment_booking',
      entityId: bookingId,
      metadata: { userId: scope.userId },
    });

    return toBookingSummary(updated!);
  }

  async cancelBooking(
    scope: PortalCustomerScope | StaffScope,
    bookingId: string,
    isStaff: boolean,
  ): Promise<CxAppointmentBookingSummary> {
    const companyId = scope.companyId;
    const booking = await this.getBookingOrThrow(companyId, bookingId);

    if (!isStaff && 'customerId' in scope && booking.customerId !== scope.customerId) {
      throw new EnterpriseCustomerExperienceError('FORBIDDEN', 'Booking access denied');
    }

    const [updated] = await this.deps.db
      .update(cxAppointmentBookings)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(cxAppointmentBookings.id, bookingId))
      .returning();

    await this.recordAudit(companyId, {
      portalUserId: 'portalUserId' in scope ? scope.portalUserId : undefined,
      customerId: booking.customerId,
      actionType: 'booking_cancelled',
      entityType: 'cx_appointment_booking',
      entityId: bookingId,
    });

    return toBookingSummary(updated!);
  }

  async listCustomerBookings(
    scope: PortalCustomerScope,
    options?: { statuses?: string[] },
  ): Promise<CxAppointmentBookingSummary[]> {
    const rows = await this.deps.db.query.cxAppointmentBookings.findMany({
      where: and(
        eq(cxAppointmentBookings.companyId, scope.companyId),
        eq(cxAppointmentBookings.customerId, scope.customerId),
        options?.statuses?.length
          ? inArray(cxAppointmentBookings.status, options.statuses as never[])
          : undefined,
      ),
      orderBy: [desc(cxAppointmentBookings.createdAt)],
      limit: 50,
    });
    return rows.map(toBookingSummary);
  }

  async listBookings(
    companyId: string,
    options?: { limit?: number; customerId?: string },
  ): Promise<CxAppointmentBookingSummary[]> {
    const rows = await this.deps.db.query.cxAppointmentBookings.findMany({
      where: and(
        eq(cxAppointmentBookings.companyId, companyId),
        options?.customerId ? eq(cxAppointmentBookings.customerId, options.customerId) : undefined,
      ),
      orderBy: [desc(cxAppointmentBookings.createdAt)],
      limit: options?.limit ?? 50,
    });
    return rows.map(toBookingSummary);
  }

  async submitReview(
    scope: PortalCustomerScope,
    input: CreateCxReviewFeedbackRequest,
  ): Promise<CxReviewFeedbackSummary> {
    const [created] = await this.deps.db
      .insert(cxReviewsFeedback)
      .values({
        companyId: scope.companyId,
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        jobId: input.jobId ?? null,
        reviewType: input.reviewType,
        subject: input.subject,
        feedback: input.feedback,
        rating: input.rating ?? null,
      })
      .returning();

    await this.recordAudit(scope.companyId, {
      portalUserId: scope.portalUserId,
      customerId: scope.customerId,
      actionType: 'review_submitted',
      entityType: 'cx_reviews_feedback',
      entityId: created!.id,
    });

    return toReviewSummary(created!);
  }

  async updateReviewStatus(
    scope: StaffScope,
    reviewId: string,
    status: 'acknowledged' | 'resolved' | 'closed',
    resolutionNotes?: string,
  ): Promise<CxReviewFeedbackSummary> {
    const review = await this.deps.db.query.cxReviewsFeedback.findFirst({
      where: and(eq(cxReviewsFeedback.id, reviewId), eq(cxReviewsFeedback.companyId, scope.companyId)),
    });
    if (!review) {
      throw new EnterpriseCustomerExperienceError('NOT_FOUND', 'Review not found');
    }

    const [updated] = await this.deps.db
      .update(cxReviewsFeedback)
      .set({
        status,
        resolutionNotes: resolutionNotes ?? review.resolutionNotes,
        updatedAt: new Date(),
      })
      .where(eq(cxReviewsFeedback.id, reviewId))
      .returning();

    return toReviewSummary(updated!);
  }

  async listReviews(
    companyId: string,
    options?: { limit?: number; customerId?: string },
  ): Promise<CxReviewFeedbackSummary[]> {
    const rows = await this.deps.db.query.cxReviewsFeedback.findMany({
      where: and(
        eq(cxReviewsFeedback.companyId, companyId),
        options?.customerId ? eq(cxReviewsFeedback.customerId, options.customerId) : undefined,
      ),
      orderBy: [desc(cxReviewsFeedback.createdAt)],
      limit: options?.limit ?? 50,
    });
    return rows.map(toReviewSummary);
  }

  async createLoyaltyProgram(
    scope: StaffScope,
    input: CreateCxLoyaltyProgramRequest,
  ): Promise<CxLoyaltyProgramSummary> {
    const [created] = await this.deps.db
      .insert(cxLoyaltyPrograms)
      .values({
        companyId: scope.companyId,
        name: input.name,
        tier: input.tier ?? 'bronze',
        pointsRequired: input.pointsRequired ?? 0,
        rewardDescription: input.rewardDescription ?? null,
        discountPercent: input.discountPercent != null ? String(input.discountPercent) : null,
        isActive: input.isActive ?? false,
        config: input.config ?? {},
      })
      .returning();

    return toLoyaltyProgramSummary(created!);
  }

  async listLoyaltyPrograms(companyId: string): Promise<CxLoyaltyProgramSummary[]> {
    const rows = await this.deps.db.query.cxLoyaltyPrograms.findMany({
      where: eq(cxLoyaltyPrograms.companyId, companyId),
      orderBy: [desc(cxLoyaltyPrograms.createdAt)],
    });
    return rows.map(toLoyaltyProgramSummary);
  }

  async createReferral(
    scope: PortalCustomerScope,
    input: CreateCxLoyaltyReferralRequest,
  ): Promise<CxLoyaltyReferralSummary> {
    const [created] = await this.deps.db
      .insert(cxLoyaltyReferrals)
      .values({
        companyId: scope.companyId,
        referrerCustomerId: scope.customerId,
        referrerPortalUserId: scope.portalUserId,
        referredEmail: input.referredEmail,
      })
      .returning();

    await this.recordAudit(scope.companyId, {
      portalUserId: scope.portalUserId,
      customerId: scope.customerId,
      actionType: 'referral_created',
      entityType: 'cx_loyalty_referral',
      entityId: created!.id,
    });

    return toReferralSummary(created!);
  }

  async listReferrals(companyId: string, options?: { limit?: number }): Promise<CxLoyaltyReferralSummary[]> {
    const rows = await this.deps.db.query.cxLoyaltyReferrals.findMany({
      where: eq(cxLoyaltyReferrals.companyId, companyId),
      orderBy: [desc(cxLoyaltyReferrals.invitedAt)],
      limit: options?.limit ?? 50,
    });
    return rows.map(toReferralSummary);
  }

  async getEngagementPreferences(scope: PortalCustomerScope): Promise<CxEngagementPreferencesSummary> {
    const row = await this.ensureEngagementPreferences(scope.companyId, scope.portalUserId);
    return toEngagementSummary(row);
  }

  async updateEngagementPreferences(
    scope: PortalCustomerScope,
    input: UpdateCxEngagementPreferencesRequest,
  ): Promise<CxEngagementPreferencesSummary> {
    const existing = await this.ensureEngagementPreferences(scope.companyId, scope.portalUserId);
    const [updated] = await this.deps.db
      .update(cxEngagementPreferences)
      .set({
        pushEnabled: input.pushEnabled ?? existing.pushEnabled,
        smsEnabled: input.smsEnabled ?? existing.smsEnabled,
        emailEnabled: input.emailEnabled ?? existing.emailEnabled,
        whatsappEnabled: input.whatsappEnabled ?? existing.whatsappEnabled,
        marketingEnabled: input.marketingEnabled ?? existing.marketingEnabled,
        trackingConsent: input.trackingConsent ?? existing.trackingConsent,
        preferences: input.preferences ?? existing.preferences,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cxEngagementPreferences.companyId, scope.companyId),
          eq(cxEngagementPreferences.portalUserId, scope.portalUserId),
        ),
      )
      .returning();

    return toEngagementSummary(updated!);
  }

  async listCustomerDocuments(scope: PortalCustomerScope): Promise<CxCustomerDocumentSummary[]> {
    const cxDocs = await this.deps.db.query.cxCustomerDocuments.findMany({
      where: and(
        eq(cxCustomerDocuments.companyId, scope.companyId),
        eq(cxCustomerDocuments.customerId, scope.customerId),
      ),
      orderBy: [desc(cxCustomerDocuments.createdAt)],
      limit: 100,
    });

    if (scope.permissions.includes('portal.documents:read')) {
      const jobDocs = await this.deps.db.query.documents.findMany({
        where: and(eq(documents.companyId, scope.companyId), eq(documents.customerId, scope.customerId)),
        orderBy: [desc(documents.updatedAt)],
        limit: 50,
      });

      for (const doc of jobDocs) {
        const exists = cxDocs.some((d) => d.documentId === doc.id);
        if (!exists) {
          await this.deps.db.insert(cxCustomerDocuments).values({
            companyId: scope.companyId,
            customerId: scope.customerId,
            documentId: doc.id,
            accessType: 'job_card',
            title: doc.title,
            fileName: doc.fileName,
            version: 1,
          });
        }
      }
    }

    const refreshed = await this.deps.db.query.cxCustomerDocuments.findMany({
      where: and(
        eq(cxCustomerDocuments.companyId, scope.companyId),
        eq(cxCustomerDocuments.customerId, scope.customerId),
      ),
      orderBy: [desc(cxCustomerDocuments.createdAt)],
      limit: 100,
    });

    return refreshed.map(toDocumentSummary);
  }

  async captureAnalytics(companyId: string): Promise<CxAnalyticsSummary> {
    const [portalUsage, mobileUsage, bookingStats, reviewStats, referralStats, loyaltyStats] =
      await Promise.all([
        this.deps.db.select({ count: count() }).from(cxAuditLogs).where(
          and(eq(cxAuditLogs.companyId, companyId), eq(cxAuditLogs.actionType, 'portal_dashboard_view')),
        ),
        this.deps.db.select({ count: count() }).from(cxAuditLogs).where(
          and(eq(cxAuditLogs.companyId, companyId), eq(cxAuditLogs.actionType, 'mobile_app_view')),
        ),
        this.deps.db.query.cxAppointmentBookings.findMany({
          where: eq(cxAppointmentBookings.companyId, companyId),
          columns: { status: true },
        }),
        this.deps.db.query.cxReviewsFeedback.findMany({
          where: eq(cxReviewsFeedback.companyId, companyId),
          columns: { rating: true },
        }),
        this.countReferrals(companyId),
        this.countLoyaltyPrograms(companyId),
      ]);

    const totalBookings = bookingStats.length;
    const confirmedBookings = bookingStats.filter(
      (b: { status: string }) => b.status === 'confirmed' || b.status === 'completed',
    ).length;
    const bookingConversionRate = totalBookings > 0 ? (confirmedBookings / totalBookings) * 100 : null;

    const ratings = reviewStats.filter((r) => r.rating != null).map((r) => r.rating!);
    const customerSatisfactionScore =
      ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;

    const [snapshot] = await this.deps.db
      .insert(cxAnalyticsSnapshots)
      .values({
        companyId,
        portalUsageCount: portalUsage[0]?.count ?? 0,
        mobileUsageCount: mobileUsage[0]?.count ?? 0,
        bookingConversionRate: bookingConversionRate != null ? String(bookingConversionRate) : null,
        customerSatisfactionScore:
          customerSatisfactionScore != null ? String(customerSatisfactionScore) : null,
        referralCount: referralStats,
        loyaltyParticipationCount: loyaltyStats,
        metrics: { totalBookings, confirmedBookings, reviewCount: reviewStats.length },
      })
      .returning();

    return toAnalyticsSummary(snapshot!);
  }

  async getLatestAnalytics(companyId: string): Promise<CxAnalyticsSummary> {
    const row = await this.deps.db.query.cxAnalyticsSnapshots.findFirst({
      where: eq(cxAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(cxAnalyticsSnapshots.capturedAt)],
    });

    if (!row) {
      return {
        portalUsageCount: 0,
        mobileUsageCount: 0,
        bookingConversionRate: null,
        customerSatisfactionScore: null,
        avgResponseTimeHours: null,
        technicianArrivalAccuracy: null,
        referralCount: 0,
        loyaltyParticipationCount: 0,
        capturedAt: null,
      };
    }

    return toAnalyticsSummary(row);
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseCustomerExperienceAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      activeBookingCount: dashboard.activeBookingCount,
      pendingApprovalBookingCount: dashboard.pendingApprovalBookingCount,
      openReviewCount: dashboard.openReviewCount,
      referralCount: dashboard.referralCount,
      portalUsageCount: dashboard.analytics.portalUsageCount,
      customerSatisfactionScore: dashboard.analytics.customerSatisfactionScore,
      recentBookings: dashboard.recentBookings.slice(0, 5).map((b) => ({
        subject: b.subject,
        status: b.status,
        bookingType: b.bookingType,
        createdAt: b.createdAt,
      })),
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.cxPlatformConfig.findFirst({
      where: eq(cxPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(cxPlatformConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async ensureEngagementPreferences(companyId: string, portalUserId: string) {
    const existing = await this.deps.db.query.cxEngagementPreferences.findFirst({
      where: and(
        eq(cxEngagementPreferences.companyId, companyId),
        eq(cxEngagementPreferences.portalUserId, portalUserId),
      ),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(cxEngagementPreferences)
      .values({ companyId, portalUserId })
      .returning();
    return created!;
  }

  private async getEngagementPreferencesForCustomer(
    companyId: string,
    customerId: string,
    portalUserId: string | null,
  ): Promise<CxEngagementPreferencesSummary> {
    if (portalUserId) {
      const row = await this.ensureEngagementPreferences(companyId, portalUserId);
      return toEngagementSummary(row);
    }

    const portalUser = await this.deps.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, customerId)),
    });
    if (portalUser) {
      const row = await this.ensureEngagementPreferences(companyId, portalUser.id);
      return toEngagementSummary(row);
    }

    return {
      pushEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      whatsappEnabled: true,
      marketingEnabled: false,
      trackingConsent: false,
      preferences: {},
    };
  }

  private async getBookingOrThrow(companyId: string, bookingId: string) {
    const booking = await this.deps.db.query.cxAppointmentBookings.findFirst({
      where: and(eq(cxAppointmentBookings.id, bookingId), eq(cxAppointmentBookings.companyId, companyId)),
    });
    if (!booking) {
      throw new EnterpriseCustomerExperienceError('NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private async listActiveLoyaltyPrograms(companyId: string): Promise<CxLoyaltyProgramSummary[]> {
    const rows = await this.deps.db.query.cxLoyaltyPrograms.findMany({
      where: and(eq(cxLoyaltyPrograms.companyId, companyId), eq(cxLoyaltyPrograms.isActive, true)),
      orderBy: [desc(cxLoyaltyPrograms.pointsRequired)],
    });
    return rows.map(toLoyaltyProgramSummary);
  }

  private async countPortalUsers(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(portalUsers)
      .where(eq(portalUsers.companyId, companyId));
    return row?.count ?? 0;
  }

  private async countBookings(companyId: string, statuses: string[]): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxAppointmentBookings)
      .where(
        and(
          eq(cxAppointmentBookings.companyId, companyId),
          inArray(cxAppointmentBookings.status, statuses as never[]),
        ),
      );
    return row?.count ?? 0;
  }

  private async countReviews(companyId: string, statuses: string[]): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxReviewsFeedback)
      .where(
        and(
          eq(cxReviewsFeedback.companyId, companyId),
          inArray(cxReviewsFeedback.status, statuses as never[]),
        ),
      );
    return row?.count ?? 0;
  }

  private async countCustomerReviews(scope: PortalCustomerScope, statuses: string[]): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxReviewsFeedback)
      .where(
        and(
          eq(cxReviewsFeedback.companyId, scope.companyId),
          eq(cxReviewsFeedback.customerId, scope.customerId),
          inArray(cxReviewsFeedback.status, statuses as never[]),
        ),
      );
    return row?.count ?? 0;
  }

  private async countReferrals(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxLoyaltyReferrals)
      .where(eq(cxLoyaltyReferrals.companyId, companyId));
    return row?.count ?? 0;
  }

  private async countCustomerReferrals(scope: PortalCustomerScope): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxLoyaltyReferrals)
      .where(
        and(
          eq(cxLoyaltyReferrals.companyId, scope.companyId),
          eq(cxLoyaltyReferrals.referrerCustomerId, scope.customerId),
        ),
      );
    return row?.count ?? 0;
  }

  private async countLoyaltyPrograms(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(cxLoyaltyPrograms)
      .where(and(eq(cxLoyaltyPrograms.companyId, companyId), eq(cxLoyaltyPrograms.isActive, true)));
    return row?.count ?? 0;
  }

  private async recordAudit(
    companyId: string,
    input: {
      portalUserId?: string;
      customerId?: string;
      actionType: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.deps.db.insert(cxAuditLogs).values({
      companyId,
      portalUserId: input.portalUserId ?? null,
      customerId: input.customerId ?? null,
      actionType: input.actionType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof cxPlatformConfig.$inferSelect): CxPlatformConfigSummary {
  return {
    globalPolicies: row.globalPolicies,
    brandingTemplates: row.brandingTemplates,
    portalDefaults: row.portalDefaults,
    communicationPolicies: row.communicationPolicies,
    engagementRules: row.engagementRules,
    loyaltySettings: row.loyaltySettings,
    trackingEnabled: row.trackingEnabled,
    pwaEnabled: row.pwaEnabled,
  };
}

function toPropertySummary(row: typeof cxCustomerProperties.$inferSelect): CxCustomerPropertySummary {
  return {
    id: row.id,
    propertyName: row.propertyName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postalCode: row.postalCode,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBookingSummary(row: typeof cxAppointmentBookings.$inferSelect): CxAppointmentBookingSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    propertyId: row.propertyId,
    bookingType: row.bookingType,
    status: row.status,
    subject: row.subject,
    preferredDate: row.preferredDate,
    preferredTimeWindow: row.preferredTimeWindow,
    jobNotes: row.jobNotes,
    photoUrls: row.photoUrls,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDocumentSummary(row: typeof cxCustomerDocuments.$inferSelect): CxCustomerDocumentSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    accessType: row.accessType,
    title: row.title,
    fileName: row.fileName,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

function toReviewSummary(row: typeof cxReviewsFeedback.$inferSelect): CxReviewFeedbackSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    jobId: row.jobId,
    reviewType: row.reviewType,
    status: row.status,
    rating: row.rating,
    subject: row.subject,
    feedback: row.feedback,
    resolutionNotes: row.resolutionNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLoyaltyProgramSummary(row: typeof cxLoyaltyPrograms.$inferSelect): CxLoyaltyProgramSummary {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    pointsRequired: row.pointsRequired,
    rewardDescription: row.rewardDescription,
    discountPercent: row.discountPercent != null ? Number(row.discountPercent) : null,
    isActive: row.isActive,
  };
}

function toReferralSummary(row: typeof cxLoyaltyReferrals.$inferSelect): CxLoyaltyReferralSummary {
  return {
    id: row.id,
    referrerCustomerId: row.referrerCustomerId,
    referredEmail: row.referredEmail,
    referredCustomerId: row.referredCustomerId,
    status: row.status,
    rewardApplied: row.rewardApplied,
    invitedAt: row.invitedAt.toISOString(),
    convertedAt: row.convertedAt?.toISOString() ?? null,
  };
}

function toEngagementSummary(row: typeof cxEngagementPreferences.$inferSelect): CxEngagementPreferencesSummary {
  return {
    pushEnabled: row.pushEnabled,
    smsEnabled: row.smsEnabled,
    emailEnabled: row.emailEnabled,
    whatsappEnabled: row.whatsappEnabled,
    marketingEnabled: row.marketingEnabled,
    trackingConsent: row.trackingConsent,
    preferences: row.preferences,
  };
}

function toAnalyticsSummary(row: typeof cxAnalyticsSnapshots.$inferSelect): CxAnalyticsSummary {
  return {
    portalUsageCount: row.portalUsageCount,
    mobileUsageCount: row.mobileUsageCount,
    bookingConversionRate: row.bookingConversionRate != null ? Number(row.bookingConversionRate) : null,
    customerSatisfactionScore:
      row.customerSatisfactionScore != null ? Number(row.customerSatisfactionScore) : null,
    avgResponseTimeHours: row.avgResponseTimeHours != null ? Number(row.avgResponseTimeHours) : null,
    technicianArrivalAccuracy:
      row.technicianArrivalAccuracy != null ? Number(row.technicianArrivalAccuracy) : null,
    referralCount: row.referralCount,
    loyaltyParticipationCount: row.loyaltyParticipationCount,
    capturedAt: row.capturedAt.toISOString(),
  };
}
