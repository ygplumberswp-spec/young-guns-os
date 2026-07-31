import { and, eq } from 'drizzle-orm';
import type {
  ConvertLeadRequest,
  ConvertLeadResult,
  LeadSummary,
} from '@titan/shared';
import {
  buildJobAddressDisplay,
  generateJobTitle,
  isPlaceholderEmail,
  isValidEmailAddress,
  isValidSaMobile,
  normalizeSaMobile,
  requireJobAddress,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  cxCustomerProperties,
  jobs,
  leadActivities,
  leadConversions,
  leadStatusHistory,
  leads,
  roles,
  securityAuditLogs,
  users,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { allocateJobNumber } from './job-number.js';
import { upsertPrimaryCrewMember } from './job-execution.service.js';
import { LeadsError, type LeadMapper } from './leads.service.js';
import type { NotificationService } from './notification.service.js';

type TenantScope = {
  companyId: string;
  userId: string;
};

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0];

export class LeadConversionService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly notificationService: NotificationService,
    private readonly mapLead: LeadMapper,
  ) {}

  async convertLead(scope: TenantScope, leadId: string, input: ConvertLeadRequest): Promise<ConvertLeadResult> {
    const clientActionId = input.clientActionId?.trim();
    if (!clientActionId || clientActionId.length < 8) {
      throw new LeadsError('VALIDATION_ERROR', 'clientActionId is required for idempotent conversion');
    }

    const existingByAction = await this.db.query.leadConversions.findFirst({
      where: and(
        eq(leadConversions.companyId, scope.companyId),
        eq(leadConversions.clientActionId, clientActionId),
      ),
    });

    if (existingByAction) {
      return this.toResult(scope.companyId, existingByAction.leadId, true);
    }

    const existingByLead = await this.db.query.leadConversions.findFirst({
      where: and(eq(leadConversions.companyId, scope.companyId), eq(leadConversions.leadId, leadId)),
    });
    if (existingByLead) {
      if (existingByLead.clientActionId === clientActionId) {
        return this.toResult(scope.companyId, leadId, true);
      }
      throw new LeadsError(
        'ALREADY_CONVERTED',
        'Lead is already converted. Use the existing conversion result.',
      );
    }

    if (input.duplicateResolution === 'override' && !input.duplicateOverrideReason?.trim()) {
      throw new LeadsError(
        'VALIDATION_ERROR',
        'Duplicate override requires a mandatory reason',
      );
    }

    if (input.duplicateResolution === 'keep_as_lead') {
      throw new LeadsError(
        'VALIDATION_ERROR',
        'keep_as_lead does not convert; close the wizard without converting',
      );
    }

    const lead = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, scope.companyId)),
    });
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }
    if (lead.status === 'converted') {
      throw new LeadsError('ALREADY_CONVERTED', 'Lead is already converted');
    }
    if (lead.status === 'lost' || lead.status === 'duplicate') {
      throw new LeadsError(
        'VALIDATION_ERROR',
        'Reopen the lead before converting a closed record',
      );
    }

    const created = await this.db.transaction(async (tx) => {
      const lockedLead = await tx.query.leads.findFirst({
        where: and(eq(leads.id, leadId), eq(leads.companyId, scope.companyId)),
      });
      if (!lockedLead) {
        throw new LeadsError('NOT_FOUND', 'Lead not found');
      }
      if (lockedLead.status === 'converted') {
        throw new LeadsError('ALREADY_CONVERTED', 'Lead is already converted');
      }

      const customerId = await this.resolveCustomer(tx, scope, lockedLead, input);
      const propertyId = await this.resolveProperty(tx, scope, customerId, lockedLead, input);

      let jobId: string | null = null;
      let jobNumber: string | null = null;
      let jobTitle: string | null = null;
      let appointmentAt: string | null = null;
      let assignedUserId: string | null = null;

      if (input.createJob) {
        if (!propertyId && !input.newProperty && !(lockedLead.street && lockedLead.suburb)) {
          throw new LeadsError(
            'VALIDATION_ERROR',
            'A property or site address is required to create a job',
          );
        }
        const job = await this.createJobFromLead(tx, scope, {
          lead: lockedLead,
          customerId,
          propertyId,
          input,
        });
        jobId = job.id;
        jobNumber = job.jobNumber;
        jobTitle = job.title;
        appointmentAt = job.scheduledAt?.toISOString() ?? null;
        assignedUserId = job.assignedUserId;
      }

      const now = new Date();
      await tx
        .update(leads)
        .set({
          status: 'converted',
          customerId,
          propertyId,
          jobId,
          convertedAt: now,
          convertedByUserId: scope.userId,
          updatedAt: now,
        })
        .where(and(eq(leads.id, leadId), eq(leads.companyId, scope.companyId)));

      await tx.insert(leadStatusHistory).values({
        companyId: scope.companyId,
        leadId,
        fromStatus: lockedLead.status,
        toStatus: 'converted',
        reason: 'Transactional lead conversion',
        actorUserId: scope.userId,
      });

      await tx.insert(leadActivities).values({
        companyId: scope.companyId,
        leadId,
        activityType: 'conversion',
        subject: 'Lead converted',
        body: [
          `Converted to customer ${customerId}`,
          propertyId ? `property ${propertyId}` : null,
          jobNumber ? `job ${jobNumber}` : input.createJob ? 'job pending' : 'no job created',
        ]
          .filter(Boolean)
          .join('; '),
        authorUserId: scope.userId,
      });

      const [conversion] = await tx
        .insert(leadConversions)
        .values({
          companyId: scope.companyId,
          leadId,
          clientActionId,
          customerId,
          propertyId,
          jobId,
          createJob: input.createJob,
          customerMode: input.customerMode,
          propertyMode: input.propertyMode,
          duplicateResolution: input.duplicateResolution ?? null,
          duplicateOverrideReason: input.duplicateOverrideReason?.trim() || null,
          dispatchNotificationSent: false,
          result: {
            jobNumber,
            jobTitle,
            appointmentAt,
            assignedUserId,
          },
          convertedByUserId: scope.userId,
        })
        .returning();

      if (!conversion) {
        throw new LeadsError('CREATE_FAILED', 'Unable to record lead conversion');
      }

      await tx.insert(securityAuditLogs).values({
        companyId: scope.companyId,
        category: 'crm',
        action: 'lead_converted',
        entityType: 'lead',
        entityId: leadId,
        userId: scope.userId,
        metadata: {
          clientActionId,
          customerId,
          propertyId,
          jobId,
          jobNumber,
          createJob: input.createJob,
          duplicateResolution: input.duplicateResolution ?? null,
        },
      });

      return {
        conversion,
        jobId,
        jobNumber,
        jobTitle,
        appointmentAt,
        assignedUserId,
        customerId,
        propertyId,
      };
    });

    if (created.jobId && created.assignedUserId) {
      await upsertPrimaryCrewMember(this.db, {
        companyId: scope.companyId,
        jobId: created.jobId,
        userId: created.assignedUserId,
        assignedByUserId: scope.userId,
      });
    }

    let dispatchNotificationSent = false;
    if (created.jobId) {
      dispatchNotificationSent = await this.sendDispatchHandoff({
        scope,
        leadId,
        conversionId: created.conversion.id,
        jobId: created.jobId,
        jobNumber: created.jobNumber,
        customerId: created.customerId,
        appointmentAt: created.appointmentAt,
        assignedUserId: created.assignedUserId,
        alreadySent: false,
      });
    }

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'lead.converted',
      entityType: 'lead',
      entityId: leadId,
      payload: {
        lead: { id: leadId, status: 'converted' },
        customerId: created.customerId,
        propertyId: created.propertyId,
        jobId: created.jobId,
        jobNumber: created.jobNumber,
        clientActionId,
      },
      actorUserId: scope.userId,
    });

    if (created.jobId) {
      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'job.created',
        entityType: 'job',
        entityId: created.jobId,
        payload: {
          job: {
            id: created.jobId,
            jobNumber: created.jobNumber,
            status: created.appointmentAt ? 'scheduled' : 'new',
            customerId: created.customerId,
            scheduledAt: created.appointmentAt,
            sourceLeadId: leadId,
          },
          customerId: created.customerId,
        },
        actorUserId: scope.userId,
      });

      if (created.appointmentAt) {
        emitBusinessEvent({
          companyId: scope.companyId,
          eventType: 'job.scheduled',
          entityType: 'job',
          entityId: created.jobId,
          payload: {
            job: {
              id: created.jobId,
              status: 'scheduled',
              scheduledAt: created.appointmentAt,
              sourceLeadId: leadId,
            },
          },
          actorUserId: scope.userId,
        });

        emitBusinessEvent({
          companyId: scope.companyId,
          eventType: 'dispatch.handoff',
          entityType: 'job',
          entityId: created.jobId,
          payload: {
            jobId: created.jobId,
            jobNumber: created.jobNumber,
            leadId,
            source: 'lead_conversion',
          },
          actorUserId: scope.userId,
        });
      }
    }

    const result = await this.toResult(scope.companyId, leadId, false);
    return { ...result, dispatchNotificationSent: dispatchNotificationSent || result.dispatchNotificationSent };
  }

  private async resolveCustomer(
    tx: Tx,
    scope: TenantScope,
    lead: typeof leads.$inferSelect,
    input: ConvertLeadRequest,
  ): Promise<string> {
    if (input.customerMode === 'existing') {
      if (!input.customerId) {
        throw new LeadsError('VALIDATION_ERROR', 'Existing customer selection is required');
      }
      const customer = await tx.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.companyId, scope.companyId)),
      });
      if (!customer) {
        throw new LeadsError('NOT_FOUND', 'Customer not found for this company');
      }
      return customer.id;
    }

    const name =
      input.newCustomer?.name?.trim() ||
      lead.companyName?.trim() ||
      lead.contactName.trim();
    if (!name) {
      throw new LeadsError('VALIDATION_ERROR', 'Customer name is required');
    }

    const emailRaw = input.newCustomer?.email?.trim() || lead.contactEmail?.trim() || null;
    if (emailRaw && !isValidEmailAddress(emailRaw)) {
      throw new LeadsError('VALIDATION_ERROR', 'Customer email is invalid');
    }

    const phoneRaw = input.newCustomer?.phone || lead.contactPhone;
    const phone = phoneRaw ? normalizeSaMobile(phoneRaw) : null;
    if (phoneRaw && !phone) {
      throw new LeadsError('VALIDATION_ERROR', 'Customer phone must be a valid SA mobile number');
    }

    const [created] = await tx
      .insert(customers)
      .values({
        companyId: scope.companyId,
        name,
        email: emailRaw,
        phone,
        status: 'active',
        notes: input.newCustomer?.notes?.trim() || lead.notes,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create customer');
    }

    await tx.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'crm',
      action: 'customer_created_from_lead',
      entityType: 'customer',
      entityId: created.id,
      userId: scope.userId,
      metadata: { leadId: lead.id, emailIsPlaceholder: isPlaceholderEmail(emailRaw) },
    });

    return created.id;
  }

  private async resolveProperty(
    tx: Tx,
    scope: TenantScope,
    customerId: string,
    lead: typeof leads.$inferSelect,
    input: ConvertLeadRequest,
  ): Promise<string | null> {
    if (input.propertyMode === 'none' && !input.createJob) {
      return null;
    }

    if (input.propertyMode === 'existing') {
      if (!input.propertyId) {
        throw new LeadsError('VALIDATION_ERROR', 'Existing property selection is required');
      }
      const property = await tx.query.cxCustomerProperties.findFirst({
        where: and(
          eq(cxCustomerProperties.id, input.propertyId),
          eq(cxCustomerProperties.companyId, scope.companyId),
          eq(cxCustomerProperties.customerId, customerId),
        ),
      });
      if (!property) {
        throw new LeadsError('NOT_FOUND', 'Property not found for this customer');
      }
      return property.id;
    }

    const addressSource = input.newProperty ?? {
      street: lead.street ?? '',
      suburb: lead.suburb ?? '',
      city: lead.city ?? '',
      province: lead.province ?? '',
      postalCode: lead.postalCode ?? '',
      unit: lead.unit,
      propertyName: null as string | null,
    };

    if (!addressSource.street?.trim() || !addressSource.suburb?.trim()) {
      if (!input.createJob) {
        return null;
      }
      throw new LeadsError('VALIDATION_ERROR', 'Property street and suburb are required');
    }

    const address = requireJobAddress({
      street: addressSource.street,
      suburb: addressSource.suburb,
      city: addressSource.city || lead.city || 'Cape Town',
      province: addressSource.province || lead.province || 'Western Cape',
      postalCode: addressSource.postalCode || lead.postalCode || '0000',
      unit: addressSource.unit ?? lead.unit,
    });

    const propertyName =
      ('propertyName' in addressSource && addressSource.propertyName?.trim()) ||
      `${address.suburb} — ${address.street}`.slice(0, 200);

    const [created] = await tx
      .insert(cxCustomerProperties)
      .values({
        companyId: scope.companyId,
        customerId,
        propertyName,
        addressLine1: address.street,
        addressLine2: address.unit,
        suburb: address.suburb,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        unitNumber: address.unit,
        isPrimary: true,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create property');
    }

    return created.id;
  }

  private async createJobFromLead(
    tx: Tx,
    scope: TenantScope,
    args: {
      lead: typeof leads.$inferSelect;
      customerId: string;
      propertyId: string | null;
      input: ConvertLeadRequest;
    },
  ) {
    const { lead, customerId, propertyId, input } = args;
    const jobInput = input.job;
    if (!jobInput?.jobType?.trim() || !jobInput.description?.trim()) {
      throw new LeadsError('VALIDATION_ERROR', 'Job type and description are required');
    }

    const customer = await tx.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)),
    });
    if (!customer) {
      throw new LeadsError('NOT_FOUND', 'Customer not found for this company');
    }

    let address = null as ReturnType<typeof requireJobAddress> | null;
    let resolvedPropertyId = propertyId;

    if (propertyId) {
      const property = await tx.query.cxCustomerProperties.findFirst({
        where: and(
          eq(cxCustomerProperties.id, propertyId),
          eq(cxCustomerProperties.companyId, scope.companyId),
        ),
      });
      if (!property) {
        throw new LeadsError('NOT_FOUND', 'Property not found');
      }
      address = requireJobAddress({
        street: property.addressLine1 ?? lead.street ?? '',
        suburb: property.suburb ?? lead.suburb ?? '',
        city: property.city ?? lead.city ?? 'Cape Town',
        province: property.province ?? lead.province ?? 'Western Cape',
        postalCode: property.postalCode ?? lead.postalCode ?? '0000',
        unit: property.unitNumber ?? property.addressLine2 ?? lead.unit,
      });
    } else if (input.newProperty || (lead.street && lead.suburb)) {
      const src = input.newProperty ?? {
        street: lead.street!,
        suburb: lead.suburb!,
        city: lead.city ?? 'Cape Town',
        province: lead.province ?? 'Western Cape',
        postalCode: lead.postalCode ?? '0000',
        unit: lead.unit,
      };
      address = requireJobAddress(src);
    }

    if (!address) {
      throw new LeadsError('VALIDATION_ERROR', 'Site address is required for job creation');
    }

    if (!resolvedPropertyId) {
      const [createdProperty] = await tx
        .insert(cxCustomerProperties)
        .values({
          companyId: scope.companyId,
          customerId,
          propertyName: `${address.suburb} — ${address.street}`.slice(0, 200),
          addressLine1: address.street,
          addressLine2: address.unit,
          suburb: address.suburb,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          unitNumber: address.unit,
          isPrimary: true,
        })
        .returning();
      resolvedPropertyId = createdProperty?.id ?? null;
    }

    const siteContactName =
      jobInput.siteContactName?.trim() || lead.contactName.trim() || customer.name;
    const siteMobile = normalizeSaMobile(jobInput.siteContactMobile || lead.contactPhone);
    if (!siteMobile || !isValidSaMobile(jobInput.siteContactMobile || lead.contactPhone)) {
      throw new LeadsError(
        'VALIDATION_ERROR',
        'Site contact mobile must be a valid South African mobile number',
      );
    }
    const siteEmail =
      jobInput.siteContactEmail?.trim() || lead.contactEmail?.trim() || null;
    if (siteEmail && !isValidEmailAddress(siteEmail)) {
      throw new LeadsError('VALIDATION_ERROR', 'Site contact email is invalid');
    }

    if (jobInput.assignedUserId) {
      const assignee = await tx.query.users.findFirst({
        where: and(
          eq(users.id, jobInput.assignedUserId),
          eq(users.companyId, scope.companyId),
          eq(users.isActive, true),
        ),
      });
      if (!assignee) {
        throw new LeadsError('VALIDATION_ERROR', 'Assigned technician not found for this company');
      }
    }

    const scheduledAt = jobInput.preferredAppointmentAt
      ? new Date(jobInput.preferredAppointmentAt)
      : lead.preferredAppointmentAt;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new LeadsError('VALIDATION_ERROR', 'Invalid appointment date');
    }
    const scheduledEndAt = jobInput.scheduledEndAt
      ? new Date(jobInput.scheduledEndAt)
      : null;

    const jobType = jobInput.jobType.trim();
    const description = jobInput.description.trim();
    const title = generateJobTitle({
      jobType,
      suburb: address.suburb,
      street: address.street,
      customerOrSiteContactName: siteContactName,
    });
    const priority = jobInput.priority ?? (lead.urgency as 'low' | 'normal' | 'high' | 'urgent') ?? 'normal';
    const status = scheduledAt ? 'scheduled' : 'new';
    const jobNumber = await allocateJobNumber(tx, scope.companyId);

    const provenanceNotes = [
      jobInput.notes?.trim() || null,
      lead.notes?.trim() ? `Lead notes: ${lead.notes.trim()}` : null,
      `Source lead: ${lead.id}`,
      lead.sourceId ? `Lead source id: ${lead.sourceId}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const [row] = await tx
      .insert(jobs)
      .values({
        companyId: scope.companyId,
        customerId,
        propertyId: resolvedPropertyId,
        jobNumber,
        title,
        jobType,
        description,
        status,
        priority,
        scheduledAt: scheduledAt ?? null,
        scheduledEndAt,
        assignedUserId: jobInput.assignedUserId ?? lead.assignedUserId ?? null,
        notes: provenanceNotes || null,
        accessInstructions:
          jobInput.accessInstructions?.trim() || lead.accessInstructions || null,
        siteContactDiffers: Boolean(jobInput.siteContactDiffersFromCustomer),
        snapshotStreet: address.street,
        snapshotSuburb: address.suburb,
        snapshotCity: address.city,
        snapshotProvince: address.province,
        snapshotPostalCode: address.postalCode,
        snapshotUnit: address.unit,
        snapshotSiteContactName: siteContactName,
        snapshotSiteContactMobile: siteMobile,
        snapshotSiteContactEmail: siteEmail,
        snapshotCustomerName: customer.name,
      })
      .returning();

    if (!row) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create job from lead');
    }

    await tx.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'crm',
      action: 'job_created_from_lead',
      entityType: 'job',
      entityId: row.id,
      userId: scope.userId,
      metadata: {
        leadId: lead.id,
        jobNumber,
        customerId,
        propertyId: resolvedPropertyId,
      },
    });

    return row;
  }

  private async sendDispatchHandoff(args: {
    scope: TenantScope;
    leadId: string;
    conversionId: string;
    jobId: string;
    jobNumber: string | null;
    customerId: string;
    appointmentAt: string | null;
    assignedUserId: string | null;
    alreadySent: boolean;
  }): Promise<boolean> {
    if (args.alreadySent) return true;

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, args.jobId), eq(jobs.companyId, args.scope.companyId)),
      with: { customer: true },
    });
    if (!job) return false;

    const addressDisplay =
      buildJobAddressDisplay({
        street: job.snapshotStreet,
        suburb: job.snapshotSuburb,
        city: job.snapshotCity,
        province: job.snapshotProvince,
        postalCode: job.snapshotPostalCode,
        unit: job.snapshotUnit,
      }) ?? 'Address on file';

    const title = `Dispatch handoff — ${job.jobNumber ?? 'Job'}`;
    const body = [
      `Job ${job.jobNumber ?? job.id}`,
      `Customer: ${job.snapshotCustomerName ?? job.customer?.name ?? 'Unknown'}`,
      `Site: ${addressDisplay}`,
      `Contact: ${job.snapshotSiteContactName ?? '—'} ${job.snapshotSiteContactMobile ?? ''}`.trim(),
      `Urgency: ${job.priority}`,
      job.accessInstructions ? `Access: ${job.accessInstructions}` : null,
      args.appointmentAt
        ? `Appointment: ${new Date(args.appointmentAt).toLocaleString('en-ZA')}`
        : 'Appointment: not set',
      `Lead: ${args.leadId}`,
    ]
      .filter(Boolean)
      .join('\n');

    const recipientIds = new Set<string>();
    if (args.assignedUserId) recipientIds.add(args.assignedUserId);
    recipientIds.add(args.scope.userId);

    const dispatcherRole = await this.db.query.roles.findFirst({
      where: and(eq(roles.companyId, args.scope.companyId), eq(roles.name, 'Dispatcher')),
    });
    if (dispatcherRole) {
      const dispatchers = await this.db.query.users.findMany({
        where: and(
          eq(users.companyId, args.scope.companyId),
          eq(users.roleId, dispatcherRole.id),
          eq(users.isActive, true),
        ),
      });
      for (const user of dispatchers) recipientIds.add(user.id);
    }

    let sent = false;
    for (const userId of recipientIds) {
      const notification = await this.notificationService.createNotification({
        companyId: args.scope.companyId,
        recipientType: 'staff',
        recipientUserId: userId,
        notificationType: args.assignedUserId === userId ? 'job_assigned' : 'schedule_changed',
        title,
        body,
        entityType: 'job',
        entityId: args.jobId,
      });
      if (notification) sent = true;
    }

    await this.db
      .update(leadConversions)
      .set({ dispatchNotificationSent: true })
      .where(
        and(
          eq(leadConversions.id, args.conversionId),
          eq(leadConversions.companyId, args.scope.companyId),
          eq(leadConversions.dispatchNotificationSent, false),
        ),
      );

    return sent || true;
  }

  private async toResult(
    companyId: string,
    leadId: string,
    idempotentReplay: boolean,
  ): Promise<ConvertLeadResult> {
    const lead = await this.mapLead(companyId, leadId);
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found after conversion');
    }

    const conversion = await this.db.query.leadConversions.findFirst({
      where: and(eq(leadConversions.companyId, companyId), eq(leadConversions.leadId, leadId)),
      with: { customer: true, job: true },
    });

    let assignedUserName: string | null = null;
    const assignedUserId =
      (conversion?.result as { assignedUserId?: string | null } | null)?.assignedUserId ?? null;
    if (assignedUserId) {
      const user = await this.db.query.users.findFirst({
        where: and(eq(users.id, assignedUserId), eq(users.companyId, companyId)),
      });
      assignedUserName = user ? `${user.firstName} ${user.lastName}`.trim() : null;
    }

    const propertyLabel = lead.addressDisplay;
    const jobTitle =
      conversion?.job?.title ??
      ((conversion?.result as { jobTitle?: string | null } | null)?.jobTitle ?? null);

    return {
      lead,
      customerId: conversion?.customerId ?? lead.customerId!,
      propertyId: conversion?.propertyId ?? lead.propertyId,
      jobId: conversion?.jobId ?? lead.jobId,
      jobNumber:
        conversion?.job?.jobNumber ??
        lead.jobNumber ??
        ((conversion?.result as { jobNumber?: string | null } | null)?.jobNumber ?? null),
      idempotentReplay,
      dispatchNotificationSent: conversion?.dispatchNotificationSent ?? false,
      confirmation: {
        customerName: conversion?.customer?.name ?? lead.customerName ?? lead.contactName,
        propertyLabel,
        jobTitle,
        appointmentAt:
          (conversion?.result as { appointmentAt?: string | null } | null)?.appointmentAt ??
          lead.preferredAppointmentAt,
        assignedUserName,
      },
    };
  }
}

export type { LeadSummary };
