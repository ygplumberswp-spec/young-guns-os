/**
 * Last-minute technician / Owner NEW CALL / AURA scheduling intake.
 * Reuses Jobs, CRM match-by-phone, Scheduling conflicts, Dispatch matching, VAIR privacy rules.
 * Does NOT invent a parallel scheduling system or silently import personal call history.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  ConfirmTechnicianIntakeRequest,
  OwnerQuickCallIntakeRequest,
  QuickIntakeCreateResult,
  QuickIntakeCustomerMatch,
  QuickIntakeOpenJobWarning,
  QuickIntakePrepareResult,
  QuickIntakePropertyMatch,
  QuickIntakeScheduleProposal,
  QuickJobIntakeSource,
  QuickJobUrgency,
  TechnicianQuickAddJobRequest,
} from '@titan/shared';
import {
  expandIntakeAddress,
  isValidSaMobile,
  normalizePhoneDigits,
  normalizeSaMobile,
  PERSONAL_CALL_INTAKE_PRIVACY,
  suggestUrgencyFromText,
  technicianMaySelfAssign,
  urgencyToPriority,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  cxCustomerProperties,
  jobs,
  jobVisits,
  jobWorkflowEvents,
  roles,
  securityAuditLogs,
  users,
} from '@titan/db';
import type { JobsService } from './jobs.service.js';
import { JobsError } from './jobs.service.js';
import type { CrmService } from './crm.service.js';
import type { NotificationService } from './notification.service.js';
import type { DispatchIntelligenceService } from './dispatch-intelligence.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { SchedulingConflictService } from './scheduling-conflict.service.js';
import type { TravelTimeService } from './travel-time.service.js';

export class QuickJobIntakeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'QuickJobIntakeError';
  }
}

export type IntakeActor = {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions?: string[] | null;
};

const ACTIVE_STATUSES = ['new', 'scheduled', 'in_progress'] as const;

export class QuickJobIntakeService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jobsService: JobsService,
    private readonly crmService: CrmService,
    private readonly notificationService: NotificationService,
    private readonly dispatchIntelligenceService: DispatchIntelligenceService,
    private readonly schedulingService: SchedulingService,
    private readonly schedulingConflictService: SchedulingConflictService,
    private readonly travelTimeService: TravelTimeService,
  ) {}

  private staffIdentity(actor: IntakeActor) {
    return {
      roleName: actor.roleName ?? 'Manager',
      permissions: actor.permissions ?? ['jobs:write', 'scheduling:write'],
    };
  }

  /** Phone match only — never returns a CRM browse list. */
  async matchByPhone(companyId: string, phone: string): Promise<QuickIntakeCustomerMatch[]> {
    const normalized = normalizeSaMobile(phone) ?? normalizePhoneDigits(phone);
    if (!normalized) return [];

    const digits = normalized.replace(/\D/g, '');
    const national = digits.startsWith('27') ? digits.slice(2) : digits.replace(/^0/, '');
    const rows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') like ${'%' + national}`,
        ),
      )
      .limit(5);

    const out: QuickIntakeCustomerMatch[] = [];
    for (const row of rows) {
      const props = await this.db
        .select({ id: cxCustomerProperties.id })
        .from(cxCustomerProperties)
        .where(
          and(
            eq(cxCustomerProperties.companyId, companyId),
            eq(cxCustomerProperties.customerId, row.id),
          ),
        );
      const rowDigits = (row.phone ?? '').replace(/\D/g, '');
      const exact =
        rowDigits.endsWith(national) ||
        rowDigits === digits ||
        rowDigits === `27${national}`;
      out.push({
        customerId: row.id,
        customerName: row.name,
        phone: row.phone,
        propertyCount: props.length,
        matchConfidence: exact ? 'exact' : 'partial',
      });
    }
    return out;
  }

  async matchProperties(
    companyId: string,
    customerId: string,
    locationHint?: string | null,
  ): Promise<QuickIntakePropertyMatch[]> {
    const rows = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
      limit: 20,
    });
    const hint = locationHint?.trim().toLowerCase() ?? '';
    return rows
      .map((p) => ({
        propertyId: p.id,
        customerId: p.customerId,
        propertyName: p.propertyName,
        addressDisplay:
          [p.addressLine1, p.suburb, p.city].filter(Boolean).join(', ') || null,
        suburb: p.suburb,
        city: p.city,
      }))
      .filter((p) => {
        if (!hint) return true;
        const hay = `${p.propertyName} ${p.addressDisplay ?? ''} ${p.suburb ?? ''}`.toLowerCase();
        return hay.includes(hint);
      });
  }

  async findOpenJobWarnings(
    companyId: string,
    customerId: string,
    propertyId?: string | null,
  ): Promise<QuickIntakeOpenJobWarning[]> {
    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.customerId, customerId),
        inArray(jobs.status, [...ACTIVE_STATUSES]),
      ),
      orderBy: [desc(jobs.updatedAt)],
      limit: 10,
    });

    return rows
      .filter((j) => !propertyId || !j.propertyId || j.propertyId === propertyId)
      .map((j) => ({
        jobId: j.id,
        jobNumber: j.jobNumber,
        title: j.title,
        status: j.status,
        executionPhase: j.executionPhase,
        scheduledAt: j.scheduledAt?.toISOString() ?? null,
        reason:
          j.executionPhase === 'work_continues'
            ? 'Open multi-day / Still Busy job on this customer — do not duplicate'
            : 'Active open job may already cover this request',
      }));
  }

  async proposeSchedule(
    companyId: string,
    input: {
      urgency: QuickJobUrgency;
      workDescription: string;
      preferredTiming?: string | null;
      siteLatitude?: number | null;
      siteLongitude?: number | null;
      excludeTechnicianIds?: string[];
    },
  ): Promise<QuickIntakeScheduleProposal> {
    const [matches, cartrackUsed, schedulingStats] = await Promise.all([
      this.dispatchIntelligenceService.getTechnicianMatching(companyId),
      this.travelTimeService.isCartrackConnected(companyId),
      this.schedulingService.getStats(companyId),
    ]);
    const emergency = input.urgency === 'emergency';

    const openStillBusy = await this.db
      .select({
        jobId: jobs.id,
        title: jobs.title,
        assignedUserId: jobs.assignedUserId,
        technicianName: sql<string | null>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
      })
      .from(jobs)
      .leftJoin(users, eq(users.id, jobs.assignedUserId))
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.executionPhase, 'work_continues'),
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
      )
      .limit(50);

    const openVisitTechIds = new Set<string>();
    const openVisits = await this.db
      .select({ technicianUserId: jobVisits.technicianUserId })
      .from(jobVisits)
      .where(and(eq(jobVisits.companyId, companyId), eq(jobVisits.status, 'open')));
    for (const v of openVisits) openVisitTechIds.add(v.technicianUserId);

    const stillBusyByTech = new Set(
      openStillBusy.map((r) => r.assignedUserId).filter((id): id is string => Boolean(id)),
    );

    const candidates = matches
      .filter((m) => !(input.excludeTechnicianIds ?? []).includes(m.technicianId))
      .map((m) => {
        const hasStillBusyWork =
          stillBusyByTech.has(m.technicianId) || openVisitTechIds.has(m.technicianId);
        let availabilityScore = Number(m.availabilityScore ?? 0);
        if (hasStillBusyWork) availabilityScore = Math.max(0, availabilityScore - 35);
        if (emergency && m.workloadCount <= 2) availabilityScore = Math.min(100, availabilityScore + 10);
        return {
          technicianId: m.technicianId,
          technicianName: m.technicianName,
          availabilityScore,
          workloadCount: m.workloadCount,
          distanceKm: m.distanceKm,
          hasStillBusyWork,
          recommendation: hasStillBusyWork
            ? `${m.recommendation} Reduced score — Still Busy / open visit.`
            : m.recommendation,
        };
      })
      .sort((a, b) => b.availabilityScore - a.availabilityScore);

    const best = candidates[0] ?? null;
    const preferred = input.preferredTiming ? new Date(input.preferredTiming) : null;
    const slotStart =
      preferred && !Number.isNaN(preferred.getTime())
        ? preferred
        : emergency
          ? new Date()
          : null;
    const slotEnd = slotStart
      ? new Date(slotStart.getTime() + (emergency ? 90 : 120) * 60_000)
      : null;

    let overlapBlocked = false;
    if (best && slotStart && slotEnd) {
      const conflict = await this.schedulingConflictService.checkConflicts(
        companyId,
        { roleName: 'Manager', permissions: ['scheduling:write'] },
        {
          assignedUserId: best.technicianId,
          scheduledAt: slotStart.toISOString(),
          scheduledEndAt: slotEnd.toISOString(),
        },
      );
      overlapBlocked = (conflict.conflicts ?? []).some(
        (c) => c.severity === 'block' || c.type === 'overlap',
      );
    }

    const arrivalWindow = slotStart
      ? `${slotStart.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} ± ${
          emergency ? 45 : 90
        } min`
      : null;

    return {
      bestTechnicianId: best?.technicianId ?? null,
      bestTechnicianName: best?.technicianName ?? null,
      bestSlotStart: slotStart?.toISOString() ?? null,
      bestSlotEnd: slotEnd?.toISOString() ?? null,
      expectedArrivalWindow: arrivalWindow,
      urgency: input.urgency,
      priority: urgencyToPriority(input.urgency),
      rationale: best
        ? `Best available: ${best.technicianName} (score ${best.availabilityScore}, workload ${best.workloadCount}; company has ${schedulingStats.scheduledCount} scheduled).${
            cartrackUsed ? ' Cartrack available for live proximity.' : ' Cartrack not connected — proximity partial.'
          } Proposal only — Owner/office confirms dispatch.`
        : 'No technicians available to propose — office must assign manually.',
      overlapBlocked,
      stillBusyConflicts: openStillBusy.map((r) => ({
        jobId: r.jobId,
        title: r.title,
        technicianName: r.technicianName,
      })),
      cartrackUsed,
      mapsUsed: Boolean(input.siteLatitude && input.siteLongitude),
      emergency,
      candidates: candidates.slice(0, 8),
    };
  }

  async prepareOwnerQuickCall(
    actor: IntakeActor,
    input: OwnerQuickCallIntakeRequest,
  ): Promise<QuickIntakePrepareResult> {
    if (!isValidSaMobile(input.phone) && !normalizePhoneDigits(input.phone)) {
      throw new QuickJobIntakeError('VALIDATION_ERROR', 'A valid phone number is required');
    }
    const issue = input.issue.trim();
    if (!issue) throw new QuickJobIntakeError('VALIDATION_ERROR', 'Issue description is required');

    const matches = await this.matchByPhone(actor.companyId, input.phone);
    const primary = input.matchedCustomerId
      ? matches.find((m) => m.customerId === input.matchedCustomerId) ?? matches[0]
      : matches[0];

    const properties = primary
      ? await this.matchProperties(actor.companyId, primary.customerId, input.location)
      : [];
    const openJobWarnings = primary
      ? await this.findOpenJobWarnings(
          actor.companyId,
          primary.customerId,
          input.matchedPropertyId ?? properties[0]?.propertyId,
        )
      : [];

    const suggestedUrgency =
      input.urgencyHint ??
      suggestUrgencyFromText(`${issue} ${input.need ?? ''} ${input.preferredTiming ?? ''}`);

    const proposal = await this.proposeSchedule(actor.companyId, {
      urgency: suggestedUrgency,
      workDescription: issue,
      preferredTiming: input.preferredTiming,
    });

    const source = input.source ?? 'owner';
    return {
      matches,
      properties,
      openJobWarnings,
      suggestedUrgency,
      proposal,
      privacyNote: source === 'personal_call_manual' ? PERSONAL_CALL_INTAKE_PRIVACY : null,
    };
  }

  async technicianQuickAdd(
    actor: IntakeActor,
    input: TechnicianQuickAddJobRequest,
  ): Promise<QuickIntakeCreateResult> {
    const role = (actor.roleName ?? '').toLowerCase();
    if (!role.includes('technician') && !role.includes('owner') && !role.includes('admin')) {
      // Allow technicians primarily; owners may also use field path in staging tests.
      if (!role.includes('manager')) {
        throw new QuickJobIntakeError('FORBIDDEN', 'Field quick-add is for technicians');
      }
    }

    const phone = normalizeSaMobile(input.phone);
    if (!phone || !isValidSaMobile(input.phone)) {
      throw new QuickJobIntakeError(
        'VALIDATION_ERROR',
        'Phone must be a valid South African mobile number',
      );
    }
    const customerName = input.customerName.trim();
    const workDescription = input.workDescription.trim();
    const siteAddress = input.siteAddress.trim();
    if (!customerName || !workDescription || !siteAddress) {
      throw new QuickJobIntakeError(
        'VALIDATION_ERROR',
        'Customer name, phone, site address, and work description are required',
      );
    }

    return this.createFromIntake(actor, {
      source: 'technician',
      customerName,
      phone,
      siteAddress,
      workDescription,
      urgency: input.urgency,
      preferredTiming: input.preferredTiming,
      notes: input.notes,
      matchedCustomerId: input.matchedCustomerId,
      matchedPropertyId: input.matchedPropertyId,
      assignToSelf: Boolean(input.assignToSelf),
      overrideDuplicateWarning: Boolean(input.overrideDuplicateWarning),
      clientActionId: input.clientActionId,
    });
  }

  async ownerQuickCallCreate(
    actor: IntakeActor,
    input: OwnerQuickCallIntakeRequest,
  ): Promise<QuickIntakeCreateResult> {
    const prepared = await this.prepareOwnerQuickCall(actor, input);
    if (!input.createJobNow) {
      throw new QuickJobIntakeError(
        'VALIDATION_ERROR',
        'Set createJobNow to create; use prepare endpoint for match-only',
      );
    }

    const phone = normalizeSaMobile(input.phone) ?? input.phone.trim();
    const customerName =
      input.customerName?.trim() ||
      prepared.matches[0]?.customerName ||
      `Caller ${phone}`;
    const location = input.location?.trim() || 'Site TBC';
    const urgency = input.urgencyHint ?? prepared.suggestedUrgency;

    return this.createFromIntake(actor, {
      source: input.source ?? 'owner',
      customerName,
      phone,
      siteAddress: location,
      workDescription: input.issue.trim(),
      urgency,
      preferredTiming: input.preferredTiming ?? prepared.proposal.bestSlotStart,
      notes: [input.need, input.notes].filter(Boolean).join('\n') || null,
      matchedCustomerId: input.matchedCustomerId ?? prepared.matches[0]?.customerId,
      matchedPropertyId: input.matchedPropertyId ?? prepared.properties[0]?.propertyId,
      assignToSelf: false,
      proposedTechnicianId: prepared.proposal.bestTechnicianId,
      overrideDuplicateWarning: Boolean(input.overrideDuplicateWarning),
      clientActionId: input.clientActionId,
      proposalOverride: prepared.proposal,
    });
  }

  async confirmTechnicianIntake(
    actor: IntakeActor,
    jobId: string,
    input: ConfirmTechnicianIntakeRequest,
  ): Promise<QuickIntakeCreateResult['job']> {
    const role = (actor.roleName ?? '').toLowerCase();
    if (
      !role.includes('owner') &&
      !role.includes('admin') &&
      !role.includes('manager') &&
      !role.includes('office') &&
      !role.includes('dispatcher')
    ) {
      throw new QuickJobIntakeError('FORBIDDEN', 'Only office/owner can confirm field intake');
    }

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) throw new QuickJobIntakeError('NOT_FOUND', 'Job not found');
    if (job.intakeStatus !== 'needs_office_confirmation') {
      throw new QuickJobIntakeError('INVALID_STATE', 'Job does not need office confirmation');
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : job.scheduledAt;
    const scheduledEndAt = input.scheduledEndAt
      ? new Date(input.scheduledEndAt)
      : job.scheduledEndAt;

    if (input.assignedUserId && scheduledAt) {
      const conflict = await this.schedulingConflictService.checkConflicts(
        actor.companyId,
        this.staffIdentity(actor),
        {
          jobId,
          assignedUserId: input.assignedUserId,
          scheduledAt: scheduledAt.toISOString(),
          scheduledEndAt: scheduledEndAt?.toISOString() ?? null,
        },
      );
      const hard = (conflict.conflicts ?? []).filter((c) => c.severity === 'block');
      if (hard.length) {
        throw new QuickJobIntakeError(
          'SCHEDULE_CONFLICT',
          hard.map((c) => c.message).join('; ') || 'Schedule conflict',
        );
      }
    }

    const now = new Date();
    await this.db
      .update(jobs)
      .set({
        intakeStatus: 'confirmed',
        assignedUserId: input.assignedUserId ?? job.assignedUserId,
        scheduledAt: scheduledAt ?? job.scheduledAt,
        scheduledEndAt: scheduledEndAt ?? job.scheduledEndAt,
        status: scheduledAt || job.scheduledAt ? 'scheduled' : job.status,
        notes: input.notes?.trim()
          ? `${job.notes ? `${job.notes}\n` : ''}[Office confirm] ${input.notes.trim()}`
          : job.notes,
        intakeMetadata: {
          ...(job.intakeMetadata ?? {}),
          confirmedAt: now.toISOString(),
          confirmedByUserId: actor.userId,
          clientActionId: input.clientActionId ?? null,
        },
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)));

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action: 'job_intake_confirmed',
      entityType: 'job',
      entityId: jobId,
      userId: actor.userId,
      metadata: {
        assignedUserId: input.assignedUserId ?? job.assignedUserId,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      },
    });

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId,
      userId: actor.userId,
      action: 'intake_confirmed',
      fromPhase: job.executionPhase,
      toPhase: job.executionPhase,
      fromStatus: job.status,
      toStatus: scheduledAt || job.scheduledAt ? 'scheduled' : job.status,
      reason: input.notes?.trim() || 'Office confirmed field intake',
      clientActionId: input.clientActionId ?? null,
      metadata: {
        assignedUserId: input.assignedUserId ?? job.assignedUserId,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      },
    });

    const detail = await this.jobsService.getJob(actor.companyId, jobId);
    if (!detail) throw new QuickJobIntakeError('NOT_FOUND', 'Job not found after confirm');
    return detail;
  }

  async listPendingConfirmations(companyId: string) {
    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.intakeStatus, 'needs_office_confirmation'),
      ),
      orderBy: [desc(jobs.createdAt)],
      limit: 50,
    });
    return rows.map((j) => ({
      jobId: j.id,
      jobNumber: j.jobNumber,
      title: j.title,
      customerName: j.snapshotCustomerName,
      phone: j.snapshotSiteContactMobile,
      priority: j.priority,
      intakeSource: j.intakeSource,
      createdByUserId: j.createdByUserId,
      createdAt: j.createdAt.toISOString(),
      scheduledAt: j.scheduledAt?.toISOString() ?? null,
    }));
  }

  private async createFromIntake(
    actor: IntakeActor,
    input: {
      source: QuickJobIntakeSource;
      customerName: string;
      phone: string;
      siteAddress: string;
      workDescription: string;
      urgency: QuickJobUrgency;
      preferredTiming?: string | null;
      notes?: string | null;
      matchedCustomerId?: string | null;
      matchedPropertyId?: string | null;
      assignToSelf?: boolean;
      proposedTechnicianId?: string | null;
      overrideDuplicateWarning?: boolean;
      clientActionId?: string | null;
      proposalOverride?: QuickIntakeScheduleProposal;
    },
  ): Promise<QuickIntakeCreateResult> {
    const matches = await this.matchByPhone(actor.companyId, input.phone);
    let customerId = input.matchedCustomerId ?? matches[0]?.customerId ?? null;
    let customerCreated = false;

    if (customerId) {
      const exists = matches.some((m) => m.customerId === customerId);
      if (!exists) {
        const row = await this.db.query.customers.findFirst({
          where: and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)),
          columns: { id: true },
        });
        if (!row) {
          throw new QuickJobIntakeError('NOT_FOUND', 'Matched customer not found');
        }
      }
    } else {
      const created = await this.crmService.createCustomer(actor.companyId, {
        name: input.customerName,
        phone: input.phone,
        contactPerson: input.customerName,
        notes: `[Quick intake ${input.source}] created without CRM browse`,
      });
      customerId = created.id;
      customerCreated = true;
    }

    const openJobWarnings = await this.findOpenJobWarnings(
      actor.companyId,
      customerId,
      input.matchedPropertyId,
    );
    if (openJobWarnings.length && !input.overrideDuplicateWarning) {
      throw new QuickJobIntakeError(
        'DUPLICATE_OPEN_JOB',
        `${openJobWarnings[0]!.reason}. Pass overrideDuplicateWarning to continue.`,
      );
    }

    const properties = await this.matchProperties(
      actor.companyId,
      customerId,
      input.siteAddress,
    );
    let propertyId = input.matchedPropertyId ?? null;
    let propertyCreated = false;
    const address = expandIntakeAddress(input.siteAddress);

    if (propertyId) {
      const ok = properties.some((p) => p.propertyId === propertyId);
      if (!ok) {
        const row = await this.db.query.cxCustomerProperties.findFirst({
          where: and(
            eq(cxCustomerProperties.id, propertyId),
            eq(cxCustomerProperties.companyId, actor.companyId),
            eq(cxCustomerProperties.customerId, customerId),
          ),
        });
        if (!row) propertyId = null;
      }
    }

    const maySelf = technicianMaySelfAssign(actor);
    const assignToSelf = Boolean(input.assignToSelf) && maySelf && input.source === 'technician';
    // Never silently assign another technician's schedule from field create.
    const assignedUserId = assignToSelf
      ? actor.userId
      : input.source !== 'technician'
        ? input.proposedTechnicianId ?? null
        : null;

    const requiresOfficeConfirmation = input.source === 'technician' && !assignToSelf;
    const proposal =
      input.proposalOverride ??
      (await this.proposeSchedule(actor.companyId, {
        urgency: input.urgency,
        workDescription: input.workDescription,
        preferredTiming: input.preferredTiming,
      }));

    if (!propertyId) {
      propertyCreated = true;
    }

    let job;
    try {
      job = await this.jobsService.createJob(actor, {
        customerId,
        propertyId: propertyId,
        newProperty: propertyId
          ? null
          : {
              street: address.street,
              suburb: address.suburb,
              city: address.city,
              province: address.province,
              postalCode: address.postalCode,
              unit: address.unit,
              propertyName: `${address.suburb} — intake`.slice(0, 200),
            },
        siteContact: {
          name: input.customerName,
          mobile: input.phone,
          email: null,
        },
        jobType: proposal.emergency ? 'Emergency call-out' : 'Call-out',
        description: input.workDescription,
        priority: proposal.priority,
        preferredAppointmentAt: input.preferredTiming ?? proposal.bestSlotStart,
        scheduledEndAt: proposal.bestSlotEnd,
        assignedUserId,
        notes: input.notes,
        intakeSource: input.source,
        intakeStatus: requiresOfficeConfirmation ? 'needs_office_confirmation' : 'confirmed',
        intakeMetadata: {
          urgency: input.urgency,
          clientActionId: input.clientActionId ?? null,
          customerCreated,
          propertyCreated: !propertyId,
          assignToSelf,
          proposal,
          openJobWarnings,
          personalCallPrivacy:
            input.source === 'personal_call_manual' ? PERSONAL_CALL_INTAKE_PRIVACY : null,
        },
      });
    } catch (error) {
      if (error instanceof JobsError) {
        throw new QuickJobIntakeError(error.code, error.message);
      }
      throw error;
    }

    await this.db.insert(jobWorkflowEvents).values({
      companyId: actor.companyId,
      jobId: job.id,
      userId: actor.userId,
      action: 'intake_created',
      fromPhase: 'assigned',
      toPhase: 'assigned',
      fromStatus: 'new',
      toStatus: job.status,
      reason: `Quick intake (${input.source})`,
      clientActionId: input.clientActionId ?? null,
      metadata: {
        source: input.source,
        requiresOfficeConfirmation,
        assignedUserId,
        urgency: input.urgency,
      },
    });

    const notifiedRoles = await this.notifyOffice(actor.companyId, job.id, {
      title: requiresOfficeConfirmation
        ? 'Field job needs office confirmation'
        : 'New last-minute / call intake job',
      body: `${job.jobNumber ?? job.title} · ${input.customerName} · ${input.urgency}`,
    });

    return {
      job,
      customerCreated,
      propertyCreated: !propertyId || propertyCreated,
      intakeStatus: requiresOfficeConfirmation ? 'needs_office_confirmation' : 'confirmed',
      assignedToSelf: assignToSelf,
      requiresOfficeConfirmation,
      openJobWarnings,
      proposal,
      notifiedRoles,
      source: input.source,
    };
  }

  private async notifyOffice(
    companyId: string,
    jobId: string,
    content: { title: string; body: string },
  ): Promise<string[]> {
    const staff = await this.db
      .select({
        userId: users.id,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.companyId, companyId))
      .limit(80);

    const notified = new Set<string>();
    for (const row of staff) {
      const role = (row.roleName ?? '').toLowerCase();
      if (
        !role.includes('owner') &&
        !role.includes('admin') &&
        !role.includes('manager') &&
        !role.includes('office') &&
        !role.includes('dispatcher')
      ) {
        continue;
      }
      await this.notificationService.createNotification({
        companyId,
        recipientType: 'staff',
        recipientUserId: row.userId,
        notificationType: 'approval_request',
        title: content.title,
        body: content.body,
        entityType: 'job',
        entityId: jobId,
      });
      notified.add(row.roleName ?? 'staff');
    }
    return [...notified];
  }
}
