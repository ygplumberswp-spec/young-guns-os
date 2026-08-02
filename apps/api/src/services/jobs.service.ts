import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import type {
  CreateJobRequest,
  JobDetail,
  JobDocumentLink,
  JobsStats,
  JobSummary,
  UpdateJobRequest,
} from '@titan/shared';
import {
  buildJobAddressDisplay,
  generateJobTitle,
  getCompletedJobPostCompletionAttempts,
  getCompletedJobStructuralAttempts,
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
  documents,
  invoices,
  jobCompletionSnapshots,
  jobMaterialLines,
  jobs,
  securityAuditLogs,
  users,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  buildTenantCacheKey,
  cachedTenantRead,
  CACHE_TTLS,
  invalidateJobsListCaches,
} from './api-read-cache.js';
import { upsertPrimaryCrewMember } from './job-execution.service.js';
import { allocateJobNumber } from './job-number.js';

const ACTIVE_JOB_STATUSES = ['new', 'scheduled', 'in_progress'] as const;

export class JobsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobsError';
  }
}

export type JobActor = {
  userId: string;
  companyId: string;
};

export type AuraJobsContext = {
  totalCount: number;
  activeCount: number;
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    customerId: string;
    customerName: string;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
  }>;
  focusedJob: {
    id: string;
    title: string;
    status: string;
    jobNumber: string | null;
    executionPhase: string | null;
    priority: string | null;
    description: string | null;
    notes: string | null;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    customerId: string;
    customerName: string;
    propertyId: string | null;
    siteAddress: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    materialLineCount: number;
    hasCompletionSnapshot: boolean;
  } | null;
};

export class JobsService {
  constructor(private readonly db: DatabaseClient) {}

  async listJobs(companyId: string, search?: string | null): Promise<JobSummary[]> {
    const q = search?.trim();

    if (!q) {
      return cachedTenantRead(
        buildTenantCacheKey(companyId, 'jobs/list', 'all'),
        async () => {
          const rows = await this.db.query.jobs.findMany({
            where: eq(jobs.companyId, companyId),
            with: { customer: true, assignedUser: true },
            orderBy: [desc(jobs.updatedAt)],
          });
          return rows.map(toJobSummary);
        },
        CACHE_TTLS.list,
      );
    }

    const pattern = `%${escapeLike(q)}%`;
    const normalizedMobile = normalizeSaMobile(q);
    const mobileDigits = (normalizedMobile ?? q).replace(/\D/g, '');
    const mobileDigitPattern =
      mobileDigits.length >= 9 ? `%${escapeLike(mobileDigits.slice(-9))}%` : null;
    const mobileMatchers = [
      ...(normalizedMobile
        ? [
            ilike(jobs.snapshotSiteContactMobile, `%${escapeLike(normalizedMobile)}%`),
            ilike(customers.phone, `%${escapeLike(normalizedMobile)}%`),
          ]
        : []),
      ...(mobileDigitPattern
        ? [
            ilike(jobs.snapshotSiteContactMobile, mobileDigitPattern),
            ilike(customers.phone, mobileDigitPattern),
          ]
        : []),
    ];
    const rows = await this.db
      .select({
        job: jobs,
        customer: customers,
        assignedUser: users,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .leftJoin(users, eq(jobs.assignedUserId, users.id))
      .where(
        and(
          eq(jobs.companyId, companyId),
          or(
            ilike(jobs.jobNumber, pattern),
            ilike(customers.name, pattern),
            ilike(jobs.title, pattern),
            ilike(jobs.jobType, pattern),
            ilike(jobs.snapshotStreet, pattern),
            ilike(jobs.snapshotSuburb, pattern),
            ilike(jobs.snapshotCity, pattern),
            ilike(jobs.snapshotPostalCode, pattern),
            ilike(jobs.snapshotSiteContactMobile, pattern),
            ilike(jobs.snapshotSiteContactName, pattern),
            ilike(customers.phone, pattern),
            ...mobileMatchers,
          ),
        ),
      )
      .orderBy(desc(jobs.updatedAt));

    return rows.map((row) =>
      toJobSummary({
        ...row.job,
        customer: row.customer,
        assignedUser: row.assignedUser,
      }),
    );
  }

  async getJob(companyId: string, jobId: string): Promise<JobDetail | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
      with: { customer: true, assignedUser: true },
    });

    if (!job) {
      return null;
    }

    const docs = await this.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)),
      orderBy: [desc(documents.createdAt)],
    });

    return toJobDetail(job, docs.map(toJobDocumentLink));
  }

  async createJob(actor: JobActor, input: CreateJobRequest): Promise<JobDetail> {
    const companyId = actor.companyId;
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, input.customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new JobsError('CUSTOMER_NOT_FOUND', 'Customer not found for this company');
    }

    const jobType = input.jobType?.trim();
    if (!jobType) {
      throw new JobsError('VALIDATION_ERROR', 'Job type is required');
    }

    const description = input.description?.trim();
    if (!description) {
      throw new JobsError('VALIDATION_ERROR', 'Work / problem description is required');
    }

    const siteContactName = input.siteContact?.name?.trim();
    if (!siteContactName) {
      throw new JobsError('VALIDATION_ERROR', 'Site contact name is required');
    }

    const siteMobile = normalizeSaMobile(input.siteContact?.mobile);
    if (!siteMobile || !isValidSaMobile(input.siteContact?.mobile)) {
      throw new JobsError(
        'VALIDATION_ERROR',
        'Site contact mobile must be a valid South African mobile number',
      );
    }

    const siteEmailRaw = input.siteContact?.email?.trim() || null;
    if (siteEmailRaw && !isValidEmailAddress(siteEmailRaw)) {
      throw new JobsError('VALIDATION_ERROR', 'Site contact email is invalid');
    }

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const scheduledAt = parseOptionalDate(input.preferredAppointmentAt);
    const scheduledEndAt = parseOptionalDate(input.scheduledEndAt);
    if (scheduledAt && scheduledEndAt) {
      validateScheduleRange(scheduledAt, scheduledEndAt);
    }

    let propertyId: string | null = input.propertyId ?? null;
    let address = input.address ? requireJobAddressSafe(input.address) : null;
    let propertyGeo: {
      latitude: number | null;
      longitude: number | null;
      placeId: string | null;
      formattedAddress: string | null;
    } | null = null;

    if (input.newProperty) {
      const newAddr = requireJobAddressSafe(input.newProperty);
      const propertyName =
        input.newProperty.propertyName?.trim() ||
        `${newAddr.suburb} — ${newAddr.street}`.slice(0, 200);
      const geoLat = input.newProperty.latitude ?? null;
      const geoLng = input.newProperty.longitude ?? null;
      const hasVerifiedGeo =
        typeof geoLat === 'number' &&
        typeof geoLng === 'number' &&
        Number.isFinite(geoLat) &&
        Number.isFinite(geoLng);

      const [createdProperty] = await this.db
        .insert(cxCustomerProperties)
        .values({
          companyId,
          customerId: customer.id,
          propertyName,
          addressLine1: newAddr.street,
          addressLine2: newAddr.unit,
          suburb: newAddr.suburb,
          city: newAddr.city,
          province: newAddr.province,
          postalCode: newAddr.postalCode,
          unitNumber: newAddr.unit,
          isPrimary: input.newProperty.isPrimary ?? false,
          latitude: hasVerifiedGeo ? geoLat : null,
          longitude: hasVerifiedGeo ? geoLng : null,
          placeId: input.newProperty.placeId?.trim() || null,
          formattedAddress: input.newProperty.formattedAddress?.trim() || null,
          geocodeStatus: hasVerifiedGeo
            ? (input.newProperty.geocodeStatus ?? 'verified')
            : (input.newProperty.geocodeStatus ?? 'unverified'),
          geocodedAt: hasVerifiedGeo ? new Date() : null,
        })
        .returning();

      if (!createdProperty) {
        throw new JobsError('CREATE_FAILED', 'Unable to create property');
      }

      propertyId = createdProperty.id;
      address = newAddr;
      propertyGeo = {
        latitude: createdProperty.latitude ?? null,
        longitude: createdProperty.longitude ?? null,
        placeId: createdProperty.placeId ?? null,
        formattedAddress: createdProperty.formattedAddress ?? null,
      };
    } else if (propertyId) {
      const property = await this.db.query.cxCustomerProperties.findFirst({
        where: and(
          eq(cxCustomerProperties.id, propertyId),
          eq(cxCustomerProperties.companyId, companyId),
          eq(cxCustomerProperties.customerId, customer.id),
        ),
      });

      if (!property) {
        throw new JobsError('PROPERTY_NOT_FOUND', 'Property not found for this customer');
      }

      if (!address) {
        address = requireJobAddressSafe({
          street: property.addressLine1 ?? '',
          suburb: property.suburb ?? '',
          city: property.city ?? '',
          province: property.province ?? '',
          postalCode: property.postalCode ?? '',
          unit: property.unitNumber ?? property.addressLine2,
        });
      }

      propertyGeo = {
        latitude: property.latitude ?? null,
        longitude: property.longitude ?? null,
        placeId: property.placeId ?? null,
        formattedAddress: property.formattedAddress ?? null,
      };

      if (input.updateVerifiedPropertyDetails) {
        await this.db
          .update(cxCustomerProperties)
          .set({
            addressLine1: address.street,
            addressLine2: address.unit,
            suburb: address.suburb,
            city: address.city,
            province: address.province,
            postalCode: address.postalCode,
            unitNumber: address.unit,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cxCustomerProperties.id, property.id),
              eq(cxCustomerProperties.companyId, companyId),
            ),
          );

        await this.db.insert(securityAuditLogs).values({
          companyId,
          category: 'crm',
          action: 'verified_property_details_updated',
          entityType: 'cx_customer_property',
          entityId: property.id,
          userId: actor.userId,
          metadata: {
            customerId: customer.id,
            street: address.street,
            suburb: address.suburb,
            city: address.city,
            source: 'job_create',
          },
        });
      }
    }

    if (!address) {
      throw new JobsError('VALIDATION_ERROR', 'Existing property or new site address is required');
    }

    if (input.updateVerifiedCustomerDetails) {
      const customerUpdates: Partial<typeof customers.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (!input.siteContactDiffersFromCustomer) {
        customerUpdates.phone = siteMobile;
        if (siteEmailRaw) {
          customerUpdates.email = siteEmailRaw;
        }
        if (siteContactName) {
          customerUpdates.name = siteContactName;
        }
      } else if (siteMobile && !customer.phone) {
        customerUpdates.phone = siteMobile;
      }

      await this.db
        .update(customers)
        .set(customerUpdates)
        .where(and(eq(customers.id, customer.id), eq(customers.companyId, companyId)));

      await this.db.insert(securityAuditLogs).values({
        companyId,
        category: 'crm',
        action: 'verified_customer_details_updated',
        entityType: 'customer',
        entityId: customer.id,
        userId: actor.userId,
        metadata: {
          phone: customerUpdates.phone ?? null,
          email: customerUpdates.email ?? null,
          name: customerUpdates.name ?? null,
          source: 'job_create',
          explicitConsent: true,
        },
      });
    }

    const title = generateJobTitle({
      jobType,
      suburb: address.suburb,
      street: address.street,
      customerOrSiteContactName: siteContactName || customer.name,
    });

    const priority = input.priority ?? 'normal';
    const status = scheduledAt ? 'scheduled' : 'new';

    const created = await this.db.transaction(async (tx) => {
      const jobNumber = await allocateJobNumber(tx, companyId);

      const [row] = await tx
        .insert(jobs)
        .values({
          companyId,
          customerId: customer.id,
          propertyId,
          jobNumber,
          title,
          jobType,
          description,
          status,
          priority,
          scheduledAt,
          scheduledEndAt,
          assignedUserId: input.assignedUserId ?? null,
          notes: normalizeOptionalText(input.notes),
          customerVisibleNotes: normalizeOptionalText(input.customerVisibleNotes),
          accessInstructions: normalizeOptionalText(input.accessInstructions),
          siteContactDiffers: Boolean(input.siteContactDiffersFromCustomer),
          snapshotStreet: address.street,
          snapshotSuburb: address.suburb,
          snapshotCity: address.city,
          snapshotProvince: address.province,
          snapshotPostalCode: address.postalCode,
          snapshotUnit: address.unit,
          snapshotLatitude: propertyGeo?.latitude ?? null,
          snapshotLongitude: propertyGeo?.longitude ?? null,
          snapshotPlaceId: propertyGeo?.placeId ?? null,
          snapshotFormattedAddress: propertyGeo?.formattedAddress ?? null,
          snapshotSiteContactName: siteContactName,
          snapshotSiteContactMobile: siteMobile,
          snapshotSiteContactEmail: siteEmailRaw,
          snapshotCustomerName: customer.name,
        })
        .returning();

      if (!row) {
        throw new JobsError('CREATE_FAILED', 'Unable to create job');
      }

      if (input.documents?.length) {
        for (const doc of input.documents) {
          const docTitle = doc.title?.trim();
          const fileName = doc.fileName?.trim();
          if (!docTitle || !fileName) {
            throw new JobsError('VALIDATION_ERROR', 'Document title and file name are required');
          }

          await tx.insert(documents).values({
            companyId,
            customerId: customer.id,
            jobId: row.id,
            uploadedByUserId: actor.userId,
            title: docTitle,
            fileName,
            fileType: normalizeOptionalText(doc.fileType),
            fileSizeBytes: doc.fileSizeBytes ?? null,
          });
        }
      }

      await tx.insert(securityAuditLogs).values({
        companyId,
        category: 'crm',
        action: 'job_created',
        entityType: 'job',
        entityId: row.id,
        userId: actor.userId,
        metadata: {
          jobNumber,
          customerId: customer.id,
          propertyId,
          jobType,
          priority,
          siteContactDiffers: Boolean(input.siteContactDiffersFromCustomer),
          updateVerifiedCustomerDetails: Boolean(input.updateVerifiedCustomerDetails),
          updateVerifiedPropertyDetails: Boolean(input.updateVerifiedPropertyDetails),
        },
      });

      return row;
    });

    if (input.assignedUserId) {
      await upsertPrimaryCrewMember(this.db, {
        companyId,
        jobId: created.id,
        userId: input.assignedUserId,
        assignedByUserId: actor.userId,
      });
    }

    const jobDetail = (await this.getJob(companyId, created.id))!;

    emitBusinessEvent({
      companyId,
      eventType: 'job.created',
      entityType: 'job',
      entityId: created.id,
      payload: {
        job: {
          id: created.id,
          jobNumber: created.jobNumber,
          status: created.status,
          customerId: created.customerId,
          scheduledAt: created.scheduledAt?.toISOString() ?? null,
        },
        customerId: created.customerId,
      },
    });

    if (created.scheduledAt) {
      emitBusinessEvent({
        companyId,
        eventType: 'job.scheduled',
        entityType: 'job',
        entityId: created.id,
        payload: {
          job: {
            id: created.id,
            status: created.status,
            customerId: created.customerId,
          },
          customerId: created.customerId,
        },
      });
    }

    invalidateJobsListCaches(companyId);
    return jobDetail;
  }

  async updateJob(
    companyId: string,
    jobId: string,
    input: UpdateJobRequest,
    actor?: { userId: string },
  ): Promise<JobDetail> {
    const existing = await this.getJob(companyId, jobId);

    if (!existing) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }

    if (existing.status === 'completed') {
      const attemptedStructural = getCompletedJobStructuralAttempts(input);
      if (attemptedStructural.length > 0) {
        throw new JobsError(
          'JOB_COMPLETED_IMMUTABLE',
          'Completed jobs cannot change operational fields. Reopen the job with a reason before editing.',
        );
      }
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, input.customerId);
    }

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new JobsError('VALIDATION_ERROR', 'Job title is required');
      }
      updates.title = title;
    }

    if (input.customerId !== undefined) {
      updates.customerId = input.customerId;
    }

    if (input.jobType !== undefined) {
      updates.jobType = normalizeOptionalText(input.jobType);
    }

    if (input.description !== undefined) {
      updates.description = normalizeOptionalText(input.description);
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if (input.priority !== undefined) {
      updates.priority = input.priority;
    }

    if (input.scheduledAt !== undefined) {
      updates.scheduledAt = parseOptionalDate(input.scheduledAt);
    }

    if (input.scheduledEndAt !== undefined) {
      updates.scheduledEndAt = parseOptionalDate(input.scheduledEndAt);
    }

    if (input.assignedUserId !== undefined) {
      updates.assignedUserId = input.assignedUserId ?? null;
    }

    if (updates.scheduledAt && updates.scheduledEndAt) {
      validateScheduleRange(updates.scheduledAt, updates.scheduledEndAt);
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeOptionalText(input.notes);
    }

    if (input.customerVisibleNotes !== undefined) {
      updates.customerVisibleNotes = normalizeOptionalText(input.customerVisibleNotes);
    }

    if (input.accessInstructions !== undefined) {
      updates.accessInstructions = normalizeOptionalText(input.accessInstructions);
    }

    const [updated] = await this.db
      .update(jobs)
      .set(updates)
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new JobsError('UPDATE_FAILED', 'Unable to update job');
    }

    if (existing.status === 'completed' && actor?.userId) {
      const postCompletionFields = getCompletedJobPostCompletionAttempts(input);
      if (postCompletionFields.length > 0) {
        await this.db.insert(securityAuditLogs).values({
          companyId,
          category: 'workflow',
          action: 'job_post_completion_update',
          entityType: 'job',
          entityId: jobId,
          userId: actor.userId,
          metadata: {
            fields: postCompletionFields,
            marked: 'post_completion',
          },
        });
      }
    }

    if (input.assignedUserId) {
      await upsertPrimaryCrewMember(this.db, {
        companyId,
        jobId,
        userId: input.assignedUserId,
        assignedByUserId: null,
      });
    }

    const jobPayload = {
      job: {
        id: jobId,
        status: updated.status,
        customerId: updated.customerId,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
      customerId: updated.customerId,
    };

    if (input.status !== undefined && input.status !== existing.status) {
      emitBusinessEvent({
        companyId,
        eventType: 'job.status_changed',
        entityType: 'job',
        entityId: jobId,
        payload: jobPayload,
      });

      if (updated.status === 'completed') {
        emitBusinessEvent({
          companyId,
          eventType: 'job.completed',
          entityType: 'job',
          entityId: jobId,
          payload: jobPayload,
        });
      }

      if (updated.status === 'scheduled') {
        emitBusinessEvent({
          companyId,
          eventType: 'job.scheduled',
          entityType: 'job',
          entityId: jobId,
          payload: jobPayload,
        });
      }
    }

    invalidateJobsListCaches(companyId);
    return (await this.getJob(companyId, jobId))!;
  }

  async getStats(companyId: string): Promise<JobsStats> {
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'jobs/stats'),
      async () => {
        const [totalRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(eq(jobs.companyId, companyId));

        const [activeRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(
            and(eq(jobs.companyId, companyId), inArray(jobs.status, [...ACTIVE_JOB_STATUSES])),
          );

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const [todayRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(
            and(
              eq(jobs.companyId, companyId),
              inArray(jobs.status, ['scheduled', 'in_progress']),
              gte(jobs.scheduledAt, start),
              lt(jobs.scheduledAt, end),
            ),
          );

        return {
          totalCount: totalRow?.count ?? 0,
          activeCount: activeRow?.count ?? 0,
          todayScheduledCount: todayRow?.count ?? 0,
        };
      },
      CACHE_TTLS.stats,
    );
  }

  /** UX-012 — today's scheduled/in-progress jobs for dashboard Upcoming Work. */
  async listTodaysScheduledJobs(companyId: string, limit = 20): Promise<JobSummary[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        inArray(jobs.status, ['scheduled', 'in_progress']),
        gte(jobs.scheduledAt, start),
        lt(jobs.scheduledAt, end),
      ),
      with: { customer: true, assignedUser: true },
      orderBy: [jobs.scheduledAt],
      limit,
    });

    return rows.map((row) => toJobSummary(row));
  }

  async buildAuraContext(companyId: string, jobId?: string): Promise<AuraJobsContext> {
    const stats = await this.getStats(companyId);

    const jobRows = await this.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(jobs.updatedAt)],
      limit: 25,
    });

    let focusedJob: AuraJobsContext['focusedJob'] = null;

    if (jobId) {
      const [detail, jobRow, materialCountRow, snapshotRow] = await Promise.all([
        this.getJob(companyId, jobId),
        this.db.query.jobs.findFirst({
          where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
          columns: { executionPhase: true },
        }),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobMaterialLines)
          .where(and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId))),
        this.db.query.jobCompletionSnapshots.findFirst({
          where: and(
            eq(jobCompletionSnapshots.companyId, companyId),
            eq(jobCompletionSnapshots.jobId, jobId),
          ),
          columns: { id: true },
        }),
      ]);

      if (detail) {
        focusedJob = {
          id: detail.id,
          title: detail.title,
          status: detail.status,
          jobNumber: detail.jobNumber ?? null,
          executionPhase: jobRow?.executionPhase ?? null,
          priority: detail.priority ?? null,
          description: detail.description,
          notes: detail.notes,
          scheduledAt: detail.scheduledAt,
          scheduledEndAt: detail.scheduledEndAt,
          customerId: detail.customerId,
          customerName: detail.customerName,
          propertyId: detail.propertyId ?? null,
          siteAddress: detail.address?.display ?? null,
          assignedUserId: detail.assignedUserId,
          assignedUserName: detail.assignedUserName,
          materialLineCount: materialCountRow[0]?.count ?? 0,
          hasCompletionSnapshot: Boolean(snapshotRow),
        };
      }
    }

    return {
      totalCount: stats.totalCount,
      activeCount: stats.activeCount,
      jobs: jobRows.map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        customerId: job.customerId,
        customerName: job.customer?.name ?? 'Unknown',
        scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
        scheduledEndAt: job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null,
        assignedUserId: job.assignedUserId,
        assignedUserName: job.assignedUser
          ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
          : null,
      })),
      focusedJob,
    };
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new JobsError('CUSTOMER_NOT_FOUND', 'Customer not found for this company');
    }
  }

  private async ensureAssigneeBelongsToCompany(companyId: string, userId: string): Promise<void> {
    const assignee = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });

    if (!assignee) {
      throw new JobsError('ASSIGNEE_NOT_FOUND', 'Team member not found for this company');
    }
  }

  async deleteJob(
    scope: JobActor,
    jobId: string,
    opts: { isOwner?: boolean } = {},
  ): Promise<void> {
    if (!opts.isOwner) {
      throw new JobsError('FORBIDDEN', 'Only the company owner may permanently delete jobs');
    }

    const job = await this.getJob(scope.companyId, jobId);
    if (!job) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }

    if (job.status !== 'new') {
      throw new JobsError(
        'VALIDATION_ERROR',
        'Only empty draft jobs can be deleted. Cancel or archive instead.',
      );
    }

    const [invoiceCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.jobId, jobId), eq(invoices.companyId, scope.companyId)));

    if ((invoiceCount?.count ?? 0) > 0) {
      throw new JobsError(
        'VALIDATION_ERROR',
        'Job has linked invoices. Cancel or archive instead.',
      );
    }

    const deleted = await this.db
      .delete(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, scope.companyId)))
      .returning({ id: jobs.id });

    if (deleted.length === 0) {
      throw new JobsError('DELETE_FAILED', 'Unable to delete job');
    }

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'job.deleted',
      entityType: 'job',
      entityId: jobId,
      payload: { job: { id: jobId, jobNumber: job.jobNumber } },
      actorUserId: scope.userId,
    });

    invalidateJobsListCaches(scope.companyId);
  }
}

type JobWithRelations = typeof jobs.$inferSelect & {
  customer: typeof customers.$inferSelect | null;
  assignedUser: typeof users.$inferSelect | null;
};

function toJobSummary(job: JobWithRelations): JobSummary {
  const addressDisplay =
    buildJobAddressDisplay({
      street: job.snapshotStreet,
      suburb: job.snapshotSuburb,
      city: job.snapshotCity,
      province: job.snapshotProvince,
      postalCode: job.snapshotPostalCode,
      unit: job.snapshotUnit,
    }) ?? null;

  return {
    id: job.id,
    jobNumber: job.jobNumber ?? null,
    customerId: job.customerId,
    customerName: job.snapshotCustomerName ?? job.customer?.name ?? 'Unknown',
    propertyId: job.propertyId ?? null,
    title: job.title,
    jobType: job.jobType ?? null,
    priority: job.priority ?? 'normal',
    status: job.status,
    addressDisplay,
    latitude: job.snapshotLatitude ?? null,
    longitude: job.snapshotLongitude ?? null,
    placeId: job.snapshotPlaceId ?? null,
    siteContactMobile: job.snapshotSiteContactMobile ?? null,
    scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
    scheduledEndAt: job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null,
    assignedUserId: job.assignedUserId,
    assignedUserName: job.assignedUser
      ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
      : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    etaAt: null,
  };
}

function toJobDetail(job: JobWithRelations, docs: JobDocumentLink[]): JobDetail {
  const summary = toJobSummary(job);
  const email = job.snapshotSiteContactEmail ?? null;

  return {
    ...summary,
    description: job.description,
    notes: job.notes,
    customerVisibleNotes: job.customerVisibleNotes ?? null,
    accessInstructions: job.accessInstructions ?? null,
    address: {
      street: job.snapshotStreet ?? null,
      suburb: job.snapshotSuburb ?? null,
      city: job.snapshotCity ?? null,
      province: job.snapshotProvince ?? null,
      postalCode: job.snapshotPostalCode ?? null,
      unit: job.snapshotUnit ?? null,
      display: summary.addressDisplay,
      latitude: job.snapshotLatitude ?? null,
      longitude: job.snapshotLongitude ?? null,
      placeId: job.snapshotPlaceId ?? null,
      formattedAddress: job.snapshotFormattedAddress ?? null,
    },
    siteContact: {
      name: job.snapshotSiteContactName ?? null,
      mobile: job.snapshotSiteContactMobile ?? null,
      email,
      emailIsPlaceholder: email ? isPlaceholderEmail(email) : false,
      differsFromCustomer: job.siteContactDiffers ?? false,
    },
    documents: docs,
  };
}

function toJobDocumentLink(doc: typeof documents.$inferSelect): JobDocumentLink {
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    fileType: doc.fileType,
    createdAt: doc.createdAt.toISOString(),
  };
}

function requireJobAddressSafe(address: {
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
}) {
  try {
    return requireJobAddress(address);
  } catch (error) {
    throw new JobsError(
      'VALIDATION_ERROR',
      error instanceof Error ? error.message : 'Invalid site address',
    );
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new JobsError('VALIDATION_ERROR', 'Invalid scheduled date');
  }

  return parsed;
}

function validateScheduleRange(start: Date, end: Date | null): void {
  if (end && end <= start) {
    throw new JobsError('VALIDATION_ERROR', 'Scheduled end must be after start');
  }
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
