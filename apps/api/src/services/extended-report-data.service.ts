import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  cmiCocWorkflows,
  cmiComplianceChecks,
  cxCustomerProperties,
  customers,
  diDocumentProfiles,
  documents,
  fleetDriverBehaviourEvents,
  gpsPositions,
  integrationConnections,
  jobs,
  mobileJobDocumentation,
  sdCompletionCertificates,
  sdDefects,
  sdInspections,
  titanDocuments,
  users,
  vehicles,
} from '@titan/db';
import {
  COMPLIANCE_COC_LEGAL_NOTICE,
  FLEET_STORED_DATA_NOTE,
  extendedMetric,
  formatLastStoredPositionNote,
  isJobInspectionEligible,
  resolveCocAttachmentState,
  resolveFleetStoredFreshness,
  resolveCompanyLocale,
  type ComplianceCocRegisterReportContext,
  type ComplianceSupportReportContext,
  type ExtendedReportPeriod,
  type FleetOperationsReportContext,
  type FleetVehicleActivityReportContext,
  type InspectionReportContext,
  type ExtendedReportAudience,
} from '@titan/shared';

export class ExtendedReportDataError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'ExtendedReportDataError';
  }
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function jobPublicReference(row: { jobNumber: string | null; id: string }): string {
  return row.jobNumber?.trim() || `JOB-${row.id.slice(0, 8).toUpperCase()}`;
}

function displayName(firstName: string | null, lastName: string | null, email?: string | null): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || email || 'Staff member';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function parseChecklist(findings: Record<string, unknown>): Array<{ label: string; result: string; note: string | null }> {
  const items: Array<{ label: string; result: string; note: string | null }> = [];
  const checklist = findings.checklist ?? findings.checklistResults ?? findings.items;
  if (Array.isArray(checklist)) {
    for (const entry of checklist) {
      if (typeof entry === 'object' && entry && 'label' in entry) {
        const row = entry as Record<string, unknown>;
        items.push({
          label: String(row.label ?? 'Item'),
          result: String(row.result ?? row.status ?? 'Recorded'),
          note: typeof row.note === 'string' ? row.note : null,
        });
      }
    }
  }
  return items;
}

type GpsPoint = {
  vehicleId: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: Date;
};

const TRIP_GAP_MINUTES = 30;
const IDLE_SPEED_KMH = 5;

export class ExtendedReportDataService {
  constructor(private readonly db: DatabaseClient) {}

  private async loadCompany(companyId: string) {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) throw new ExtendedReportDataError('NOT_FOUND', 'Company not found');
    return company;
  }

  private async loadFleetLastSync(companyId: string): Promise<string | null> {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });
    return connection?.lastSyncAt?.toISOString() ?? null;
  }

  async buildInspectionReport(
    companyId: string,
    jobId: string,
    audience: ExtendedReportAudience,
  ): Promise<InspectionReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new ExtendedReportDataError('NOT_FOUND', 'Job not found');

    const [inspectionRows, inspectionDocs, inspectionForms, defectRows] = await Promise.all([
      this.db.query.sdInspections.findMany({
        where: and(eq(sdInspections.companyId, companyId), eq(sdInspections.jobId, jobId)),
        orderBy: [asc(sdInspections.createdAt)],
      }),
      this.db.query.titanDocuments.findMany({
        where: and(
          eq(titanDocuments.companyId, companyId),
          eq(titanDocuments.jobId, jobId),
          eq(titanDocuments.reportKind, 'inspection'),
        ),
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
          eq(mobileJobDocumentation.documentationType, 'inspection_form'),
        ),
      }),
      this.db.query.sdDefects.findMany({
        where: and(eq(sdDefects.companyId, companyId), eq(sdDefects.jobId, jobId)),
      }),
    ]);

    const eligible = isJobInspectionEligible({
      jobType: job.jobType,
      hasSdInspection: inspectionRows.length > 0,
      hasInspectionDocument: inspectionDocs.length > 0,
      hasInspectionForm: inspectionForms.length > 0,
    });
    if (!eligible) {
      throw new ExtendedReportDataError(
        'VALIDATION_ERROR',
        'This job has no recorded inspection data eligible for an inspection report export.',
      );
    }

    const customer = job.customerId
      ? await this.db.query.customers.findFirst({
          where: and(eq(customers.id, job.customerId), eq(customers.companyId, companyId)),
        })
      : null;

    const property = job.propertyId
      ? await this.db.query.cxCustomerProperties.findFirst({
          where: and(
            eq(cxCustomerProperties.id, job.propertyId),
            eq(cxCustomerProperties.companyId, companyId),
          ),
        })
      : null;

    let inspectorName: string | null = null;
    const primaryInspection = inspectionRows[0] ?? null;
    if (primaryInspection?.inspectorUserId) {
      const inspector = await this.db.query.users.findFirst({
        where: and(eq(users.id, primaryInspection.inspectorUserId), eq(users.companyId, companyId)),
      });
      if (inspector) {
        inspectorName = displayName(inspector.firstName, inspector.lastName, inspector.email);
      }
    }

    const findings = (primaryInspection?.findings ?? {}) as Record<string, unknown>;
    const config = (primaryInspection?.config ?? {}) as Record<string, unknown>;
    const checklistResults = parseChecklist(findings);
    const findingsList = asStringArray(findings.findings ?? findings.summary ?? findings.notes);
    const areasInspected = asStringArray(findings.areasInspected ?? config.areasInspected);
    const workRequired = asStringArray(findings.workRequired ?? findings.remedialWork);
    const recommendedActions = asStringArray(findings.recommendedActions ?? findings.actions);
    const readingsRaw = findings.readings;
    const readings = Array.isArray(readingsRaw)
      ? readingsRaw
          .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
          .map((r) => ({ label: String(r.label ?? 'Reading'), value: String(r.value ?? '—') }))
      : [];

    const dataQualityWarnings: string[] = [];
    if (!primaryInspection) dataQualityWarnings.push('No sd_inspection record — report built from partial evidence only.');
    if (!inspectionDocs.length && !inspectionForms.length) {
      dataQualityWarnings.push('No inspection document or mobile inspection form linked.');
    }

    return {
      reportReference: `INS-${jobPublicReference(job).replace(/[^A-Z0-9-]/gi, '').slice(0, 16)}`,
      reportKind: 'inspection',
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      timezone: locale.timezone,
      periodStart: null,
      periodEnd: null,
      snapshotDate: null,
      dataSourceNote: 'Inspection data from sd_inspections, mobile inspection forms, and linked TITAN inspection documents.',
      dataQualityWarnings,
      dataLimitations: ['Report reflects stored inspection records only — not a live site assessment.'],
      audience,
      inspectionReference: primaryInspection
        ? `SDI-${primaryInspection.id.slice(0, 8).toUpperCase()}`
        : inspectionDocs[0]?.documentNumber ?? jobPublicReference(job),
      customerName: customer?.name ?? 'Customer not recorded',
      propertyName: property?.propertyName ?? null,
      siteAddress:
        property?.formattedAddress ??
        ([job.snapshotStreet, job.snapshotSuburb, job.snapshotCity].filter(Boolean).join(', ') || null),
      inspectionDate: isoDate(primaryInspection?.completedAt ?? primaryInspection?.updatedAt ?? (job.status === 'completed' ? job.updatedAt : job.scheduledAt)),
      inspectorName,
      inspectionType: typeof config.inspectionType === 'string' ? config.inspectionType : job.jobType,
      reasonForInspection: typeof findings.reason === 'string' ? findings.reason : typeof config.reason === 'string' ? config.reason : null,
      areasInspected,
      checklistResults,
      findings: findingsList.length ? findingsList : defectRows.map((d) => d.description),
      readings,
      defects: defectRows.map((d) => `${d.defectType}: ${d.description}`),
      workRequired,
      urgency: typeof findings.urgency === 'string' ? findings.urgency : null,
      photos: [],
      attachments: [
        ...inspectionDocs.map((d) => ({ title: d.title })),
        ...inspectionForms.map((f) => ({ title: f.title })),
      ],
      customerComments: typeof findings.customerComments === 'string' ? findings.customerComments : null,
      inspectorNotes: typeof findings.inspectorNotes === 'string' ? findings.inspectorNotes : null,
      internalNotes: typeof findings.internalNotes === 'string' ? findings.internalNotes : null,
      recommendedActions,
      recommendedMaintenance: typeof findings.recommendedMaintenance === 'string' ? findings.recommendedMaintenance : null,
      signatures: [],
      cocRecommendationState: typeof findings.cocRecommendation === 'string' ? findings.cocRecommendation : null,
      jobReference: jobPublicReference(job),
    };
  }

  async buildComplianceSupportReport(
    companyId: string,
    jobId: string,
    audience: ExtendedReportAudience,
  ): Promise<ComplianceSupportReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new ExtendedReportDataError('NOT_FOUND', 'Job not found');

    const [workflows, checks, certificates, titanDocs, jobDocs] = await Promise.all([
      this.db.query.cmiCocWorkflows.findMany({
        where: and(eq(cmiCocWorkflows.companyId, companyId), eq(cmiCocWorkflows.jobId, jobId)),
      }),
      this.db.query.cmiComplianceChecks.findMany({
        where: and(eq(cmiComplianceChecks.companyId, companyId), eq(cmiComplianceChecks.jobId, jobId)),
      }),
      this.db.query.sdCompletionCertificates.findMany({
        where: and(eq(sdCompletionCertificates.companyId, companyId), eq(sdCompletionCertificates.jobId, jobId)),
      }),
      this.db.query.titanDocuments.findMany({
        where: and(eq(titanDocuments.companyId, companyId), eq(titanDocuments.jobId, jobId)),
      }),
      this.db.query.documents.findMany({
        where: and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)),
      }),
    ]);

    const hasComplianceEvidence =
      workflows.length > 0 ||
      checks.length > 0 ||
      certificates.length > 0 ||
      titanDocs.some((d) => Boolean(d.cocDocumentationId)) ||
      jobDocs.length > 0;

    if (!hasComplianceEvidence) {
      throw new ExtendedReportDataError(
        'VALIDATION_ERROR',
        'This job has no recorded compliance or COC support data.',
      );
    }

    const customer = job.customerId
      ? await this.db.query.customers.findFirst({
          where: and(eq(customers.id, job.customerId), eq(customers.companyId, companyId)),
        })
      : null;

    const property = job.propertyId
      ? await this.db.query.cxCustomerProperties.findFirst({
          where: and(
            eq(cxCustomerProperties.id, job.propertyId),
            eq(cxCustomerProperties.companyId, companyId),
          ),
        })
      : null;

    const workflow = workflows[0] ?? null;
    const certificate = certificates.find((c) => c.workflowStatus === 'approved' || c.issuedAt) ?? certificates[0] ?? null;
    const cocDoc = titanDocs.find((d) => d.cocDocumentationId) ?? null;

    let diCocProfileLinked = false;
    if (jobDocs.length) {
      const profiles = await this.db.query.diDocumentProfiles.findMany({
        where: and(
          eq(diDocumentProfiles.companyId, companyId),
          inArray(
            diDocumentProfiles.documentId,
            jobDocs.map((d) => d.id),
          ),
          eq(diDocumentProfiles.documentType, 'coc'),
        ),
      });
      diCocProfileLinked = profiles.length > 0;
    }

    const cocResolution = resolveCocAttachmentState({
      cocDocumentationId: cocDoc?.cocDocumentationId ?? null,
      diCocProfileLinked,
      workflowStatus: workflow?.status ?? null,
      completionCertificateNumber: certificate?.certificateNumber ?? null,
      completionCertificateIssuedAt: certificate?.issuedAt?.toISOString() ?? null,
      cocRequiredRecorded: typeof (workflow?.metadata as Record<string, unknown> | undefined)?.cocRequired === 'boolean'
        ? ((workflow?.metadata as Record<string, unknown>).cocRequired as boolean)
        : null,
      complianceWorkComplete: job.status === 'completed' ? true : null,
    });

    const checklistResults = checks.map((c) => ({
      label: c.title,
      result: c.result,
      note: c.detail || null,
    }));

    return {
      reportReference: `CCS-${jobPublicReference(job).replace(/[^A-Z0-9-]/gi, '').slice(0, 16)}`,
      reportKind: 'compliance_coc_support',
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      timezone: locale.timezone,
      periodStart: null,
      periodEnd: null,
      snapshotDate: null,
      dataSourceNote: 'Compliance support data from CMI workflows, compliance checks, completion certificates, and linked documents.',
      dataQualityWarnings: cocResolution.statusLabel === 'coc_status_not_recorded'
        ? ['COC attachment status not fully recorded in TITAN.']
        : [],
      dataLimitations: ['This report supports compliance records — not an official signed COC.'],
      audience,
      legalNotice: COMPLIANCE_COC_LEGAL_NOTICE,
      customerName: customer?.name ?? 'Customer not recorded',
      propertyName: property?.propertyName ?? null,
      jobReference: jobPublicReference(job),
      workDescription: job.description ?? job.title ?? null,
      workDate: isoDate(job.status === 'completed' ? job.updatedAt : job.scheduledAt),
      responsiblePlumberName: null,
      plumberRegistrationNote: 'Plumber registration not recorded in TITAN',
      checklistResults,
      inspectionResults: checks.map((c) => `${c.title}: ${c.result}`),
      equipmentDetails: [],
      measurements: [],
      photos: [],
      supportingEvidence: [
        ...workflows.map((w) => ({ title: w.title, state: w.status })),
        ...certificates.map((c) => ({
          title: c.certificateNumber ? `Certificate ${c.certificateNumber}` : 'Completion certificate',
          state: c.workflowStatus,
        })),
      ],
      cocCertificateReference: cocResolution.certificateNumber,
      cocIssueDate: isoDate(cocResolution.issueDate),
      cocAttachmentState: cocResolution.attachmentState,
      outstandingComplianceItems: checks
        .filter((c) => c.result !== 'pass' && c.result !== 'not_applicable')
        .map((c) => c.title),
      recommendedCorrectiveWork: checks
        .filter((c) => c.result === 'fail')
        .map((c) => c.detail || c.title),
      signatures: [],
    };
  }

  async buildFleetVehicleActivityReport(
    companyId: string,
    vehicleId: string,
    period: ExtendedReportPeriod,
  ): Promise<FleetVehicleActivityReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);

    const vehicle = await this.db.query.vehicles.findFirst({
      where: and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)),
    });
    if (!vehicle) throw new ExtendedReportDataError('NOT_FOUND', 'Vehicle not found');

    const lastSyncAt = await this.loadFleetLastSync(companyId);
    const freshnessState = resolveFleetStoredFreshness(lastSyncAt);

    const [points, events, latestPosition] = await Promise.all([
      this.db.query.gpsPositions.findMany({
        where: and(
          eq(gpsPositions.companyId, companyId),
          eq(gpsPositions.vehicleId, vehicleId),
          gte(gpsPositions.recordedAt, period.fromInstant),
          lte(gpsPositions.recordedAt, period.toInstant),
        ),
        orderBy: [asc(gpsPositions.recordedAt)],
        limit: 10000,
      }),
      this.db.query.fleetDriverBehaviourEvents.findMany({
        where: and(
          eq(fleetDriverBehaviourEvents.companyId, companyId),
          eq(fleetDriverBehaviourEvents.vehicleId, vehicleId),
          gte(fleetDriverBehaviourEvents.occurredAt, period.fromInstant),
          lte(fleetDriverBehaviourEvents.occurredAt, period.toInstant),
        ),
        orderBy: [asc(fleetDriverBehaviourEvents.occurredAt)],
      }),
      this.db.query.gpsPositions.findFirst({
        where: and(eq(gpsPositions.companyId, companyId), eq(gpsPositions.vehicleId, vehicleId)),
        orderBy: [sql`${gpsPositions.recordedAt} desc`],
      }),
    ]);

    const gpsPoints: GpsPoint[] = points.map((p) => ({
      vehicleId: p.vehicleId,
      latitude: p.latitude,
      longitude: p.longitude,
      speedKmh: p.speedKmh,
      recordedAt: p.recordedAt,
    }));

    const tripSegments = segmentStoredTrips(gpsPoints);
    const totalDistanceKm = tripSegments.reduce((sum, t) => sum + t.distanceKm, 0);
    const totalDrivingMinutes = tripSegments.reduce((sum, t) => sum + t.drivingMinutes, 0);
    const totalStopMinutes = tripSegments.reduce((sum, t) => sum + t.stopMinutes, 0);

    let assignedDriverName: string | null = null;
    if (vehicle.assignedUserId) {
      const driver = await this.db.query.users.findFirst({
        where: and(eq(users.id, vehicle.assignedUserId), eq(users.companyId, companyId)),
      });
      if (driver) assignedDriverName = displayName(driver.firstName, driver.lastName, driver.email);
    }

    const eventTypes = new Map<string, number>();
    for (const event of events) {
      eventTypes.set(event.eventType, (eventTypes.get(event.eventType) ?? 0) + 1);
    }

    const dataQualityWarnings: string[] = [];
    if (freshnessState === 'never_synced') dataQualityWarnings.push('No successful Cartrack sync recorded.');
    if (freshnessState === 'stale') dataQualityWarnings.push('Fleet sync data is stale.');
    if (!points.length) dataQualityWarnings.push('No stored GPS positions in the selected period.');

    return {
      reportReference: `FVA-${vehicle.licensePlate.replace(/[^A-Z0-9-]/gi, '').slice(0, 12)}`,
      reportKind: 'fleet_vehicle_activity',
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      timezone: locale.timezone,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      dataSourceNote: FLEET_STORED_DATA_NOTE,
      dataQualityWarnings,
      dataLimitations: ['Trips derived from stored GPS segmentation — not live provider telemetry.'],
      vehicleReference: vehicle.name,
      registrationNumber: vehicle.licensePlate,
      makeModel: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || null,
      assignedDriverName,
      freshnessState,
      lastSuccessfulSyncAt: lastSyncAt,
      tripCount: tripSegments.length || null,
      totalDistanceKm: tripSegments.length ? Math.round(totalDistanceKm * 10) / 10 : null,
      totalDrivingMinutes: tripSegments.length ? Math.round(totalDrivingMinutes) : null,
      totalStopMinutes: tripSegments.length ? Math.round(totalStopMinutes) : null,
      eventCount: events.length || null,
      eventTypes: [...eventTypes.entries()].map(([type, count]) => ({ type, count })),
      odometerReading: null,
      licenceExpiryNote: null,
      maintenanceDueNote: vehicle.status === 'maintenance' ? 'Vehicle currently in maintenance status' : null,
      lastStoredPositionNote: formatLastStoredPositionNote(
        latestPosition?.recordedAt?.toISOString() ?? null,
      ),
      metrics: [
        extendedMetric('Trip count', {
          displayValue: tripSegments.length ? String(tripSegments.length) : undefined,
          state: tripSegments.length ? 'recorded' : 'not_recorded',
        }),
        extendedMetric('Distance (km)', {
          displayValue: tripSegments.length ? totalDistanceKm.toFixed(1) : undefined,
          state: tripSegments.length ? 'recorded' : 'not_recorded',
        }),
        extendedMetric('Behaviour events', {
          displayValue: events.length ? String(events.length) : undefined,
          state: events.length ? 'recorded' : events.length === 0 && points.length ? 'measured_zero' : 'not_recorded',
        }),
      ],
      trips: tripSegments.map((t) => ({
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt.toISOString(),
        distanceKm: Math.round(t.distanceKm * 10) / 10,
        drivingMinutes: t.drivingMinutes,
        stopMinutes: t.stopMinutes,
      })),
      events: events.map((e) => ({
        occurredAt: e.occurredAt.toISOString(),
        eventType: e.eventType,
        severity: String(e.severity),
        note:
          typeof (e.metadata as Record<string, unknown>).note === 'string'
            ? ((e.metadata as Record<string, unknown>).note as string)
            : null,
      })),
    };
  }

  async buildFleetOperationsReport(
    companyId: string,
    period: ExtendedReportPeriod,
  ): Promise<FleetOperationsReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);
    const lastSyncAt = await this.loadFleetLastSync(companyId);
    const freshnessState = resolveFleetStoredFreshness(lastSyncAt);

    const vehicleRows = await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
    });

    const allPoints = await this.db.query.gpsPositions.findMany({
      where: and(
        eq(gpsPositions.companyId, companyId),
        gte(gpsPositions.recordedAt, period.fromInstant),
        lte(gpsPositions.recordedAt, period.toInstant),
      ),
      orderBy: [asc(gpsPositions.recordedAt)],
      limit: 50000,
    });

    const pointsByVehicle = new Map<string, GpsPoint[]>();
    for (const p of allPoints) {
      if (!p.vehicleId) continue;
      const list = pointsByVehicle.get(p.vehicleId) ?? [];
      list.push({
        vehicleId: p.vehicleId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        recordedAt: p.recordedAt,
      });
      pointsByVehicle.set(p.vehicleId, list);
    }

    const vehicleSummaries = await Promise.all(
      vehicleRows.map(async (vehicle) => {
        const vehiclePoints = pointsByVehicle.get(vehicle.id) ?? [];
        const trips = segmentStoredTrips(vehiclePoints);
        const distanceKm = trips.reduce((sum, t) => sum + t.distanceKm, 0);
        const vehicleFreshness = resolveFleetStoredFreshness(lastSyncAt);
        const flags: string[] = [];
        if (!vehicle.assignedUserId) flags.push('Unassigned');
        if (vehicle.status === 'maintenance') flags.push('Maintenance');
        if (!vehiclePoints.length) flags.push('No GPS in period');

        let assignedDriverName: string | null = null;
        if (vehicle.assignedUserId) {
          const driver = await this.db.query.users.findFirst({
            where: and(eq(users.id, vehicle.assignedUserId), eq(users.companyId, companyId)),
          });
          if (driver) assignedDriverName = displayName(driver.firstName, driver.lastName, driver.email);
        }

        return {
          vehicleReference: vehicle.name,
          registrationNumber: vehicle.licensePlate,
          tripCount: trips.length,
          distanceKm: Math.round(distanceKm * 10) / 10,
          freshnessState: vehicleFreshness,
          assignedDriverName,
          flags,
        };
      }),
    );

    const vehiclesWithTripData = vehicleSummaries.filter((v) => v.tripCount > 0).length;
    const totalTrips = vehicleSummaries.reduce((sum, v) => sum + v.tripCount, 0);
    const totalDistanceKm = vehicleSummaries.reduce((sum, v) => sum + v.distanceKm, 0);

    return {
      reportReference: `FOS-${period.periodEnd.replace(/-/g, '')}`,
      reportKind: 'fleet_operations',
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      timezone: locale.timezone,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      dataSourceNote: FLEET_STORED_DATA_NOTE,
      dataQualityWarnings: freshnessState === 'never_synced' ? ['No successful Cartrack sync recorded.'] : [],
      dataLimitations: ['Fleet totals from stored GPS segmentation only.'],
      freshnessState,
      lastSuccessfulSyncAt: lastSyncAt,
      activeVehicleCount: vehicleRows.filter((v) => v.status !== 'out_of_service').length,
      vehiclesWithTripData,
      totalTrips: totalTrips || null,
      totalDistanceKm: totalDistanceKm || null,
      totalDrivingMinutes: null,
      eventBreakdown: [],
      staleVehicleCount: vehicleSummaries.filter((v) => v.freshnessState === 'stale').length,
      neverSyncedVehicleCount: freshnessState === 'never_synced' ? vehicleRows.length : 0,
      maintenanceDueCount: vehicleRows.filter((v) => v.status === 'maintenance').length,
      licenceExpiryWarningCount: 0,
      unassignedVehicleCount: vehicleRows.filter((v) => !v.assignedUserId).length,
      metrics: [
        extendedMetric('Active vehicles', { displayValue: String(vehicleRows.length), state: 'recorded' }),
        extendedMetric('Vehicles with trips', {
          displayValue: String(vehiclesWithTripData),
          state: vehiclesWithTripData ? 'recorded' : 'not_recorded',
        }),
        extendedMetric('Total distance (km)', {
          displayValue: totalDistanceKm ? totalDistanceKm.toFixed(1) : undefined,
          state: totalDistanceKm ? 'recorded' : 'not_recorded',
        }),
      ],
      vehicles: vehicleSummaries.sort((a, b) => b.distanceKm - a.distanceKm),
    };
  }

  async buildComplianceCocRegisterReport(
    companyId: string,
    period: ExtendedReportPeriod,
    statusFilter?: string | null,
  ): Promise<ComplianceCocRegisterReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);

    const workflowConditions = [
      eq(cmiCocWorkflows.companyId, companyId),
      or(
        and(
          gte(cmiCocWorkflows.createdAt, period.fromInstant),
          lte(cmiCocWorkflows.createdAt, period.toInstant),
        ),
        and(
          gte(cmiCocWorkflows.updatedAt, period.fromInstant),
          lte(cmiCocWorkflows.updatedAt, period.toInstant),
        ),
      ),
    ];
    if (statusFilter?.trim()) {
      workflowConditions.push(eq(cmiCocWorkflows.status, statusFilter.trim() as (typeof cmiCocWorkflows.$inferSelect)['status']));
    }

    const workflows = await this.db.query.cmiCocWorkflows.findMany({
      where: and(...workflowConditions),
      orderBy: [asc(cmiCocWorkflows.updatedAt)],
    });

    const jobIds = workflows.map((w) => w.jobId).filter((id): id is string => Boolean(id));
    const jobMap = new Map<string, { jobNumber: string | null; id: string; customerId: string | null; propertyId: string | null }>();
    if (jobIds.length) {
      const jobRows = await this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)),
      });
      for (const j of jobRows) jobMap.set(j.id, j);
    }

    const customerIds = [
      ...new Set(
        [
          ...workflows.map((w) => w.customerId),
          ...[...jobMap.values()].map((j) => j.customerId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const customerMap = new Map<string, string>();
    if (customerIds.length) {
      const customerRows = await this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), inArray(customers.id, customerIds)),
      });
      for (const c of customerRows) customerMap.set(c.id, c.name);
    }

    const propertyIds = [...new Set(workflows.map((w) => w.propertyId).filter(Boolean))] as string[];
    const propertyMap = new Map<string, string>();
    if (propertyIds.length) {
      const propertyRows = await this.db.query.cxCustomerProperties.findMany({
        where: and(eq(cxCustomerProperties.companyId, companyId), inArray(cxCustomerProperties.id, propertyIds)),
      });
      for (const p of propertyRows) propertyMap.set(p.id, p.propertyName ?? p.formattedAddress ?? 'Property');
    }

    const certRows = jobIds.length
      ? await this.db.query.sdCompletionCertificates.findMany({
          where: and(eq(sdCompletionCertificates.companyId, companyId), inArray(sdCompletionCertificates.jobId, jobIds)),
        })
      : [];
    const certByJob = new Map(certRows.map((c) => [c.jobId, c]));

    const rows = workflows.map((workflow) => {
      const job = workflow.jobId ? jobMap.get(workflow.jobId) : null;
      const customerId = workflow.customerId ?? job?.customerId ?? null;
      const cert = workflow.jobId ? certByJob.get(workflow.jobId) : undefined;
      const cocResolution = resolveCocAttachmentState({
        cocDocumentationId: workflow.documentId,
        diCocProfileLinked: Boolean(workflow.documentId),
        workflowStatus: workflow.status,
        completionCertificateNumber: cert?.certificateNumber ?? null,
        completionCertificateIssuedAt: cert?.issuedAt?.toISOString() ?? null,
        cocRequiredRecorded: null,
        complianceWorkComplete: workflow.status === 'issued' ? true : null,
      });

      return {
        jobReference: job ? jobPublicReference(job) : workflow.title,
        customerName: customerId ? (customerMap.get(customerId) ?? 'Customer not recorded') : 'Customer not recorded',
        propertyName: workflow.propertyId ? (propertyMap.get(workflow.propertyId) ?? null) : null,
        workDate: isoDate(workflow.updatedAt),
        responsiblePlumberName: null,
        registrationReference: null,
        cocStatus: workflow.status,
        certificateNumber: cocResolution.certificateNumber,
        issueDate: isoDate(cocResolution.issueDate),
        attachmentState: cocResolution.attachmentState,
        outstandingAction: workflow.status !== 'issued' ? `Workflow status: ${workflow.status}` : null,
        inspectionStatus: null,
        dataQualityWarning: cocResolution.statusLabel === 'coc_missing' ? 'Official COC not attached' : null,
      };
    });

    const filterSummary = statusFilter?.trim()
      ? `${period.periodStart} to ${period.periodEnd}; status=${statusFilter.trim()}`
      : `${period.periodStart} to ${period.periodEnd}; all statuses`;

    return {
      reportReference: `CCR-${period.periodEnd.replace(/-/g, '')}`,
      reportKind: 'compliance_coc_register',
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      timezone: locale.timezone,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      dataSourceNote: 'Register from stored CMI COC workflows and completion certificates — no fabricated COC entries.',
      dataQualityWarnings: rows.some((r) => r.dataQualityWarning) ? ['Some rows have incomplete COC attachment linkage.'] : [],
      dataLimitations: ['Register reflects TITAN workflow status — not statutory filing confirmation.'],
      filterSummary,
      rows,
    };
  }
}

type StoredTripSegment = {
  startedAt: Date;
  endedAt: Date;
  distanceKm: number;
  drivingMinutes: number;
  stopMinutes: number;
};

function segmentStoredTrips(points: GpsPoint[]): StoredTripSegment[] {
  if (points.length < 2) return [];

  const segments: StoredTripSegment[] = [];
  let current: GpsPoint[] = [points[0]!];

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const currentPoint = points[index]!;
    const gapMinutes = (currentPoint.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60);

    if (gapMinutes > TRIP_GAP_MINUTES) {
      if (current.length >= 2) segments.push(buildStoredTripSegment(current));
      current = [currentPoint];
    } else {
      current.push(currentPoint);
    }
  }

  if (current.length >= 2) segments.push(buildStoredTripSegment(current));
  return segments.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

function buildStoredTripSegment(points: GpsPoint[]): StoredTripSegment {
  const startedAt = points[0]!.recordedAt;
  const endedAt = points[points.length - 1]!.recordedAt;

  let distanceKm = 0;
  let idleMinutes = 0;
  let drivingMinutes = 0;

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const current = points[index]!;
    distanceKm += haversineKm(prev.latitude, prev.longitude, current.latitude, current.longitude);
    const deltaMinutes = (current.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60);
    const speed = current.speedKmh ?? 0;
    if (speed <= IDLE_SPEED_KMH) idleMinutes += deltaMinutes;
    else drivingMinutes += deltaMinutes;
  }

  return {
    startedAt,
    endedAt,
    distanceKm,
    drivingMinutes,
    stopMinutes: idleMinutes,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}
