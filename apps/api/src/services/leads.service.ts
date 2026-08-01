import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  AcquisitionInsight,
  CreateLeadActivityRequest,
  CreateLeadRequest,
  CreateLeadSourceRequest,
  LeadActivitySummary,
  LeadAuraContext,
  LeadDetail,
  LeadDuplicateCheckResult,
  LeadDuplicateMatch,
  LeadListQuery,
  LeadPipelineMetrics,
  LeadRecommendationSummary,
  LeadScoreSummary,
  LeadScoringResult,
  LeadSourceSummary,
  LeadStats,
  LeadStatus,
  LeadStatusHistorySummary,
  LeadSummary,
  SalesHandoffPreview,
  UpdateLeadRecommendationRequest,
  UpdateLeadRequest,
  UpdateLeadSourceRequest,
} from '@titan/shared';
import {
  buildJobAddressDisplay,
  formatAddressLine,
  isPlaceholderEmail,
  isValidEmailAddress,
  isValidSaMobile,
  LEAD_TERMINAL_STATUSES,
  normalizeSaMobile,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customerActivities,
  customers,
  cxCustomerProperties,
  jobs,
  leadActivities,
  leadConversions,
  leadRecommendations,
  leadScores,
  leadSources,
  leadStatusHistory,
  leads,
  payments,
  quotes,
  users,
} from '@titan/db';

export class LeadsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LeadsError';
  }
}

export type LeadMapper = (companyId: string, leadId: string) => Promise<LeadSummary | null>;

type TenantScope = {
  companyId: string;
  userId: string;
};

export class LeadsService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<LeadStats> {
    const [leadRows, sources, recommendations, crmLeads] = await Promise.all([
      this.db.query.leads.findMany({ where: eq(leads.companyId, companyId) }),
      this.db.query.leadSources.findMany({ where: eq(leadSources.companyId, companyId) }),
      this.db.query.leadRecommendations.findMany({
        where: and(
          eq(leadRecommendations.companyId, companyId),
          eq(leadRecommendations.status, 'pending'),
        ),
      }),
      this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), eq(customers.status, 'lead')),
      }),
    ]);

    const active = leadRows.filter((row) => !LEAD_TERMINAL_STATUSES.includes(row.status));
    const now = Date.now();

    return {
      totalLeadCount: leadRows.length,
      activeLeadCount: active.length,
      qualifiedLeadCount: leadRows.filter((row) =>
        ['qualified', 'contacted', 'opportunity', 'ready_to_book'].includes(row.status),
      ).length,
      convertedLeadCount: leadRows.filter((row) => row.status === 'converted').length,
      sourceCount: sources.length,
      pendingRecommendationCount: recommendations.length,
      crmLeadCustomerCount: crmLeads.length,
      overdueFollowUpCount: active.filter(
        (row) => row.nextActionDueAt && row.nextActionDueAt.getTime() < now,
      ).length,
    };
  }

  async listSources(companyId: string): Promise<LeadSourceSummary[]> {
    const rows = await this.db.query.leadSources.findMany({
      where: eq(leadSources.companyId, companyId),
      orderBy: [leadSources.name],
    });

    return Promise.all(
      rows.map(async (row) => {
        const [countRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(eq(leads.companyId, companyId), eq(leads.sourceId, row.id)));

        return toSourceSummary(row, countRow?.count ?? 0);
      }),
    );
  }

  async createSource(
    scope: TenantScope,
    input: CreateLeadSourceRequest,
  ): Promise<LeadSourceSummary> {
    const sourceKey = input.sourceKey.trim();
    const name = input.name.trim();

    if (!sourceKey || !name) {
      throw new LeadsError('VALIDATION_ERROR', 'Source key and name are required');
    }

    const [created] = await this.db
      .insert(leadSources)
      .values({
        companyId: scope.companyId,
        sourceKey,
        name,
        description: input.description?.trim() || null,
        enabled: input.enabled ?? true,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead source');
    }

    return toSourceSummary(created, 0);
  }

  async updateSource(
    companyId: string,
    sourceId: string,
    input: UpdateLeadSourceRequest,
  ): Promise<LeadSourceSummary> {
    const existing = await this.db.query.leadSources.findFirst({
      where: and(eq(leadSources.id, sourceId), eq(leadSources.companyId, companyId)),
    });

    if (!existing) {
      throw new LeadsError('NOT_FOUND', 'Lead source not found');
    }

    const [updated] = await this.db
      .update(leadSources)
      .set({
        sourceKey: input.sourceKey?.trim() || existing.sourceKey,
        name: input.name?.trim() || existing.name,
        description:
          input.description !== undefined
            ? input.description?.trim() || null
            : existing.description,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(leadSources.id, sourceId))
      .returning();

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.sourceId, sourceId)));

    return toSourceSummary(updated!, countRow?.count ?? 0);
  }

  async listLeads(companyId: string, query: LeadListQuery = {}): Promise<LeadSummary[]> {
    const rows = await this.db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
      with: { customer: true, source: true, job: true, assignedUser: true },
      orderBy: [desc(leads.updatedAt)],
    });

    const phoneNeedle = query.q ? normalizeSaMobile(query.q) : null;
    const q = query.q?.trim().toLowerCase() ?? '';
    const statusFilter = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : null;

    return rows
      .map(toLeadSummary)
      .filter((lead) => {
        if (statusFilter && !statusFilter.includes(lead.status)) return false;
        if (query.sourceId && lead.sourceId !== query.sourceId) return false;
        if (query.serviceType && lead.serviceType !== query.serviceType) return false;
        if (query.assignedUserId && lead.assignedUserId !== query.assignedUserId) return false;
        if (query.overdueOnly && !lead.isOverdue) return false;
        if (!q) return true;
        const haystack = [
          lead.contactName,
          lead.companyName,
          lead.contactEmail,
          lead.contactPhone,
          lead.contactPhoneE164,
          lead.suburb,
          lead.street,
          lead.city,
          lead.serviceType,
          lead.sourceName,
          lead.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (haystack.includes(q)) return true;
        if (phoneNeedle && (lead.contactPhoneE164 === phoneNeedle || lead.contactPhone === q)) {
          return true;
        }
        return false;
      });
  }

  async getLead(companyId: string, leadId: string): Promise<LeadSummary | null> {
    const row = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, companyId)),
      with: { customer: true, source: true, job: true, assignedUser: true },
    });

    return row ? toLeadSummary(row) : null;
  }

  async getLeadDetail(companyId: string, leadId: string): Promise<LeadDetail | null> {
    const lead = await this.getLead(companyId, leadId);
    if (!lead) return null;

    const [historyRows, conversion, activities] = await Promise.all([
      this.db.query.leadStatusHistory.findMany({
        where: and(eq(leadStatusHistory.companyId, companyId), eq(leadStatusHistory.leadId, leadId)),
        with: { actor: true },
        orderBy: [desc(leadStatusHistory.createdAt)],
      }),
      this.db.query.leadConversions.findFirst({
        where: and(eq(leadConversions.companyId, companyId), eq(leadConversions.leadId, leadId)),
        with: { job: true },
      }),
      this.listActivities(companyId, leadId),
    ]);

    return {
      ...lead,
      statusHistory: historyRows.map(
        (row): LeadStatusHistorySummary => ({
          id: row.id,
          leadId: row.leadId,
          fromStatus: (row.fromStatus as LeadStatus | null) ?? null,
          toStatus: row.toStatus as LeadStatus,
          reason: row.reason,
          actorUserId: row.actorUserId,
          actorName: row.actor
            ? `${row.actor.firstName} ${row.actor.lastName}`.trim()
            : null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      conversion: conversion
        ? {
            id: conversion.id,
            leadId: conversion.leadId,
            clientActionId: conversion.clientActionId,
            customerId: conversion.customerId,
            propertyId: conversion.propertyId,
            jobId: conversion.jobId,
            jobNumber: conversion.job?.jobNumber ?? lead.jobNumber,
            createJob: conversion.createJob,
            customerMode: conversion.customerMode,
            propertyMode: conversion.propertyMode,
            duplicateResolution: conversion.duplicateResolution,
            dispatchNotificationSent: conversion.dispatchNotificationSent,
            convertedByUserId: conversion.convertedByUserId,
            createdAt: conversion.createdAt.toISOString(),
          }
        : null,
      activities,
    };
  }

  async findDuplicates(
    companyId: string,
    input: {
      contactName?: string | null;
      companyName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      street?: string | null;
      suburb?: string | null;
      excludeLeadId?: string | null;
    },
  ): Promise<LeadDuplicateCheckResult> {
    const email = input.contactEmail?.trim().toLowerCase() || null;
    const placeholderEmailWarning = Boolean(email && isPlaceholderEmail(email));
    const phoneE164 = input.contactPhone ? normalizeSaMobile(input.contactPhone) : null;
    const name = (input.contactName || input.companyName || '').trim().toLowerCase();
    const suburb = input.suburb?.trim().toLowerCase() || null;
    const street = input.street?.trim().toLowerCase() || null;

    const [leadRows, customerRows, propertyRows] = await Promise.all([
      this.db.query.leads.findMany({
        where: eq(leads.companyId, companyId),
        with: { customer: true },
        limit: 500,
      }),
      this.db.query.customers.findMany({
        where: eq(customers.companyId, companyId),
        limit: 500,
      }),
      this.db.query.cxCustomerProperties.findMany({
        where: eq(cxCustomerProperties.companyId, companyId),
        limit: 500,
      }),
    ]);

    const matches: LeadDuplicateMatch[] = [];

    for (const row of leadRows) {
      if (input.excludeLeadId && row.id === input.excludeLeadId) continue;
      if (phoneE164 && row.contactPhoneE164 === phoneE164) {
        matches.push({
          kind: 'mobile',
          score: 95,
          leadId: row.id,
          customerId: row.customerId ?? undefined,
          label: row.contactName,
          detail: `Matching mobile on lead “${row.title}”`,
        });
      }
      if (email && !placeholderEmailWarning && row.contactEmail?.toLowerCase() === email) {
        matches.push({
          kind: 'email',
          score: 90,
          leadId: row.id,
          customerId: row.customerId ?? undefined,
          label: row.contactName,
          detail: `Matching email on lead “${row.title}”`,
          emailIsPlaceholder: false,
        });
      }
      if (name && row.contactName.toLowerCase() === name) {
        matches.push({
          kind: 'name',
          score: 60,
          leadId: row.id,
          customerId: row.customerId ?? undefined,
          label: row.contactName,
          detail: `Matching contact name on lead “${row.title}”`,
        });
      }
      if (
        suburb &&
        street &&
        row.suburb?.toLowerCase() === suburb &&
        row.street?.toLowerCase() === street
      ) {
        matches.push({
          kind: 'address',
          score: 80,
          leadId: row.id,
          customerId: row.customerId ?? undefined,
          label: row.contactName,
          detail: `Matching address on lead “${row.title}”`,
        });
      }
    }

    for (const customer of customerRows) {
      if (phoneE164 && customer.phone === phoneE164) {
        matches.push({
          kind: 'mobile',
          score: 97,
          customerId: customer.id,
          label: customer.name,
          detail: 'Matching mobile on existing customer',
        });
      }
      if (email && !placeholderEmailWarning && customer.email?.toLowerCase() === email) {
        matches.push({
          kind: 'email',
          score: 92,
          customerId: customer.id,
          label: customer.name,
          detail: 'Matching email on existing customer',
        });
      }
      if (name && customer.name.toLowerCase() === name) {
        matches.push({
          kind: 'name',
          score: 55,
          customerId: customer.id,
          label: customer.name,
          detail: 'Matching name on existing customer',
        });
      }
    }

    for (const property of propertyRows) {
      if (
        suburb &&
        street &&
        property.suburb?.toLowerCase() === suburb &&
        property.addressLine1?.toLowerCase() === street
      ) {
        matches.push({
          kind: 'property',
          score: 85,
          customerId: property.customerId,
          propertyId: property.id,
          label: property.propertyName,
          detail: `Matching property ${property.suburb}`,
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return { matches: matches.slice(0, 20), placeholderEmailWarning };
  }

  async createLead(
    scope: TenantScope,
    input: CreateLeadRequest,
  ): Promise<{ lead: LeadSummary; warnings: string[] }> {
    const contactName = input.contactName.trim();
    if (!contactName) {
      throw new LeadsError('VALIDATION_ERROR', 'Contact name is required');
    }

    const serviceType = input.serviceType?.trim() || null;
    const title =
      input.title?.trim() ||
      [serviceType || 'Enquiry', input.suburb?.trim() || input.companyName?.trim() || contactName]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 200);

    const warnings: string[] = [];
    const email = input.contactEmail?.trim() || null;
    if (email && !isValidEmailAddress(email)) {
      throw new LeadsError('VALIDATION_ERROR', 'Email address is invalid');
    }
    if (email && isPlaceholderEmail(email)) {
      warnings.push('Email looks like a placeholder and will not be treated as identity proof');
      if (!input.acknowledgePlaceholderEmail) {
        throw new LeadsError(
          'PLACEHOLDER_EMAIL',
          'Placeholder email detected. Acknowledge to continue or provide a real email.',
        );
      }
    }

    let phoneE164: string | null = null;
    if (input.contactPhone?.trim()) {
      phoneE164 = normalizeSaMobile(input.contactPhone);
      if (!phoneE164 || !isValidSaMobile(input.contactPhone)) {
        throw new LeadsError(
          'VALIDATION_ERROR',
          'Mobile must be a valid South African mobile number',
        );
      }
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);
    }
    if (input.sourceId) {
      await this.ensureSourceBelongsToCompany(scope.companyId, input.sourceId);
    }
    if (input.assignedUserId) {
      await this.ensureUserBelongsToCompany(scope.companyId, input.assignedUserId);
    }

    const dupes = await this.findDuplicates(scope.companyId, {
      contactName,
      companyName: input.companyName,
      contactEmail: email,
      contactPhone: input.contactPhone,
      street: input.street,
      suburb: input.suburb,
    });
    if (dupes.matches.some((m) => m.score >= 90) && !input.duplicateOverrideReason?.trim()) {
      throw new LeadsError(
        'DUPLICATE_SUSPECTED',
        'Possible duplicate found. Resolve explicitly or provide an override reason.',
      );
    }

    const preferredAppointmentAt = parseOptionalDate(input.preferredAppointmentAt);
    const nextActionDueAt = parseOptionalDate(input.nextActionDueAt);

    const [created] = await this.db
      .insert(leads)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        sourceId: input.sourceId ?? null,
        status: input.status && input.status !== 'converted' ? input.status : 'new',
        title,
        companyName: input.companyName?.trim() || null,
        contactName,
        contactEmail: email,
        contactPhone: phoneE164 ?? (input.contactPhone?.trim() || null),
        contactPhoneE164: phoneE164,
        serviceType,
        urgency: input.urgency ?? 'normal',
        street: input.street?.trim() || null,
        suburb: input.suburb?.trim() || null,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        unit: input.unit?.trim() || null,
        accessInstructions: input.accessInstructions?.trim() || null,
        preferredAppointmentAt,
        nextAction: input.nextAction?.trim() || null,
        nextActionDueAt,
        marketingConsent: input.marketingConsent ?? false,
        operationalContactPermission: input.operationalContactPermission ?? true,
        assignedUserId: input.assignedUserId ?? null,
        notes: input.notes?.trim() || null,
        metadata: {
          ...(input.metadata ?? {}),
          duplicateOverrideReason: input.duplicateOverrideReason?.trim() || null,
          placeholderEmailAcknowledged: Boolean(input.acknowledgePlaceholderEmail),
        },
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead');
    }

    await this.db.insert(leadStatusHistory).values({
      companyId: scope.companyId,
      leadId: created.id,
      fromStatus: null,
      toStatus: created.status,
      reason: 'Lead created',
      actorUserId: scope.userId,
    });

    if (input.duplicateOverrideReason?.trim()) {
      await this.db.insert(leadActivities).values({
        companyId: scope.companyId,
        leadId: created.id,
        activityType: 'duplicate_override',
        subject: 'Duplicate override on create',
        body: input.duplicateOverrideReason.trim(),
        authorUserId: scope.userId,
      });
    }

    const scored = await this.scoreLead(scope.companyId, created.id);
    await this.db
      .update(leads)
      .set({ score: scored.score, updatedAt: new Date() })
      .where(eq(leads.id, created.id));

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'lead.created',
      entityType: 'lead',
      entityId: created.id,
      payload: { lead: { id: created.id, status: created.status, title: created.title } },
      actorUserId: scope.userId,
    });

    return {
      lead: (await this.getLead(scope.companyId, created.id))!,
      warnings,
    };
  }

  async updateLead(
    scope: TenantScope,
    leadId: string,
    input: UpdateLeadRequest,
  ): Promise<LeadSummary> {
    const existingRow = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, scope.companyId)),
    });
    if (!existingRow) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    if (input.status === 'converted') {
      throw new LeadsError(
        'VALIDATION_ERROR',
        'Use the conversion wizard to convert a lead. Status-only conversion is not allowed.',
      );
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);
    }
    if (input.sourceId) {
      await this.ensureSourceBelongsToCompany(scope.companyId, input.sourceId);
    }
    if (input.assignedUserId) {
      await this.ensureUserBelongsToCompany(scope.companyId, input.assignedUserId);
    }

    const nextStatus = input.status ?? existingRow.status;
    if (
      (nextStatus === 'lost' || nextStatus === 'duplicate') &&
      existingRow.status !== nextStatus &&
      !input.lostReason?.trim() &&
      !existingRow.lostReason
    ) {
      throw new LeadsError(
        'VALIDATION_ERROR',
        nextStatus === 'lost'
          ? 'Lost reason is required'
          : 'Duplicate/spam reason is required',
      );
    }

    if (
      LEAD_TERMINAL_STATUSES.includes(existingRow.status) &&
      !LEAD_TERMINAL_STATUSES.includes(nextStatus) &&
      existingRow.status !== nextStatus &&
      !input.reopenReason?.trim()
    ) {
      throw new LeadsError('VALIDATION_ERROR', 'Reopen reason is required');
    }

    let phoneE164 = existingRow.contactPhoneE164;
    let contactPhone = existingRow.contactPhone;
    if (input.contactPhone !== undefined) {
      if (!input.contactPhone?.trim()) {
        phoneE164 = null;
        contactPhone = null;
      } else {
        phoneE164 = normalizeSaMobile(input.contactPhone);
        if (!phoneE164 || !isValidSaMobile(input.contactPhone)) {
          throw new LeadsError(
            'VALIDATION_ERROR',
            'Mobile must be a valid South African mobile number',
          );
        }
        contactPhone = phoneE164;
      }
    }

    if (input.contactEmail !== undefined && input.contactEmail?.trim()) {
      if (!isValidEmailAddress(input.contactEmail)) {
        throw new LeadsError('VALIDATION_ERROR', 'Email address is invalid');
      }
    }

    const lostAt =
      (nextStatus === 'lost' || nextStatus === 'duplicate') &&
      existingRow.status !== nextStatus
        ? new Date()
        : nextStatus !== 'lost' && nextStatus !== 'duplicate'
          ? null
          : undefined;

    await this.db
      .update(leads)
      .set({
        customerId: input.customerId !== undefined ? input.customerId : undefined,
        sourceId: input.sourceId !== undefined ? input.sourceId : undefined,
        status: input.status ?? undefined,
        title: input.title?.trim() || undefined,
        companyName:
          input.companyName !== undefined ? input.companyName?.trim() || null : undefined,
        contactName: input.contactName?.trim() || undefined,
        contactEmail:
          input.contactEmail !== undefined ? input.contactEmail?.trim() || null : undefined,
        contactPhone: input.contactPhone !== undefined ? contactPhone : undefined,
        contactPhoneE164: input.contactPhone !== undefined ? phoneE164 : undefined,
        serviceType:
          input.serviceType !== undefined ? input.serviceType?.trim() || null : undefined,
        urgency: input.urgency ?? undefined,
        street: input.street !== undefined ? input.street?.trim() || null : undefined,
        suburb: input.suburb !== undefined ? input.suburb?.trim() || null : undefined,
        city: input.city !== undefined ? input.city?.trim() || null : undefined,
        province: input.province !== undefined ? input.province?.trim() || null : undefined,
        postalCode:
          input.postalCode !== undefined ? input.postalCode?.trim() || null : undefined,
        unit: input.unit !== undefined ? input.unit?.trim() || null : undefined,
        accessInstructions:
          input.accessInstructions !== undefined
            ? input.accessInstructions?.trim() || null
            : undefined,
        preferredAppointmentAt:
          input.preferredAppointmentAt !== undefined
            ? parseOptionalDate(input.preferredAppointmentAt)
            : undefined,
        nextAction:
          input.nextAction !== undefined ? input.nextAction?.trim() || null : undefined,
        nextActionDueAt:
          input.nextActionDueAt !== undefined
            ? parseOptionalDate(input.nextActionDueAt)
            : undefined,
        lostReason:
          input.lostReason !== undefined ? input.lostReason?.trim() || null : undefined,
        reopenReason:
          input.reopenReason !== undefined ? input.reopenReason?.trim() || null : undefined,
        marketingConsent: input.marketingConsent ?? undefined,
        operationalContactPermission: input.operationalContactPermission ?? undefined,
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        metadata: input.metadata ?? undefined,
        lostAt: lostAt !== undefined ? lostAt : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, leadId), eq(leads.companyId, scope.companyId)));

    if (nextStatus !== existingRow.status) {
      await this.db.insert(leadStatusHistory).values({
        companyId: scope.companyId,
        leadId,
        fromStatus: existingRow.status,
        toStatus: nextStatus,
        reason:
          input.lostReason?.trim() ||
          input.reopenReason?.trim() ||
          `Status changed to ${nextStatus}`,
        actorUserId: scope.userId,
      });

      await this.db.insert(leadActivities).values({
        companyId: scope.companyId,
        leadId,
        activityType: 'status_change',
        subject: `Status → ${nextStatus}`,
        body:
          input.lostReason?.trim() ||
          input.reopenReason?.trim() ||
          `Changed from ${existingRow.status} to ${nextStatus}`,
        authorUserId: scope.userId,
      });

      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'lead.status_changed',
        entityType: 'lead',
        entityId: leadId,
        payload: {
          lead: {
            id: leadId,
            fromStatus: existingRow.status,
            toStatus: nextStatus,
          },
        },
        actorUserId: scope.userId,
      });
    }

    return (await this.getLead(scope.companyId, leadId))!;
  }

  async listActivities(companyId: string, leadId: string): Promise<LeadActivitySummary[]> {
    await this.ensureLeadBelongsToCompany(companyId, leadId);

    const rows = await this.db.query.leadActivities.findMany({
      where: and(eq(leadActivities.companyId, companyId), eq(leadActivities.leadId, leadId)),
      with: { author: true },
      orderBy: [desc(leadActivities.occurredAt)],
    });

    return rows.map(toActivitySummary);
  }

  async createActivity(
    scope: TenantScope,
    leadId: string,
    input: CreateLeadActivityRequest,
  ): Promise<LeadActivitySummary> {
    await this.ensureLeadBelongsToCompany(scope.companyId, leadId);

    const body = input.body.trim();
    if (!body) {
      throw new LeadsError('VALIDATION_ERROR', 'Activity body is required');
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new LeadsError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const [created] = await this.db
      .insert(leadActivities)
      .values({
        companyId: scope.companyId,
        leadId,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body,
        authorUserId: scope.userId,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead activity');
    }

    const row = await this.db.query.leadActivities.findFirst({
      where: eq(leadActivities.id, created.id),
      with: { author: true },
    });

    return toActivitySummary(row!);
  }

  async analyzeLeadScore(companyId: string, leadId: string): Promise<LeadScoringResult> {
    const lead = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, companyId)),
    });

    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    const signals = await this.buildScoringSignals(companyId, lead);
    const score = computeScoreFromSignals(signals);

    return {
      leadId,
      score,
      signals,
      summary: `Lead scored ${score}/100 based on ${Object.keys(signals).length} real data signal(s).`,
    };
  }

  async scoreLead(companyId: string, leadId: string): Promise<LeadScoringResult> {
    const result = await this.analyzeLeadScore(companyId, leadId);

    await this.db.insert(leadScores).values({
      companyId,
      leadId: result.leadId,
      score: result.score,
      signals: result.signals,
    });

    await this.db
      .update(leads)
      .set({ score: result.score, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return result;
  }

  async listScores(companyId: string, leadId: string): Promise<LeadScoreSummary[]> {
    await this.ensureLeadBelongsToCompany(companyId, leadId);

    const rows = await this.db.query.leadScores.findMany({
      where: and(eq(leadScores.companyId, companyId), eq(leadScores.leadId, leadId)),
      orderBy: [desc(leadScores.scoredAt)],
      limit: 20,
    });

    return rows.map(toScoreSummary);
  }

  async getPipelineMetrics(companyId: string): Promise<LeadPipelineMetrics> {
    const leadRows = await this.db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
    });

    const statuses: LeadStatus[] = [
      'new',
      'attempted_contact',
      'contacted',
      'qualified',
      'awaiting_information',
      'quote_required',
      'ready_to_book',
      'opportunity',
      'converted',
      'lost',
      'duplicate',
    ];
    const stages = statuses.map((status) => {
      const stageLeads = leadRows.filter((row) => row.status === status);
      const averageScore =
        stageLeads.length > 0
          ? Math.round(stageLeads.reduce((sum, row) => sum + row.score, 0) / stageLeads.length)
          : 0;

      return { status, count: stageLeads.length, averageScore };
    });

    const converted = leadRows.filter((row) => row.status === 'converted').length;
    const lost = leadRows.filter((row) => row.status === 'lost').length;
    const closed = converted + lost;

    return {
      stages,
      totalActive: leadRows.filter((row) => !['converted', 'lost'].includes(row.status)).length,
      convertedCount: converted,
      lostCount: lost,
      conversionRatePercent: closed > 0 ? Math.round((converted / closed) * 100) : null,
    };
  }

  async getAcquisitionInsights(companyId: string): Promise<AcquisitionInsight[]> {
    const [leadRows, crmLeads, quoteRows, jobRows] = await Promise.all([
      this.listLeads(companyId),
      this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), eq(customers.status, 'lead')),
      }),
      this.db.query.quotes.findMany({ where: eq(quotes.companyId, companyId) }),
      this.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId) }),
    ]);

    const insights: AcquisitionInsight[] = [];

    const highScoreLeads = leadRows
      .filter((row) => row.score >= 70 && !['converted', 'lost'].includes(row.status))
      .sort((a, b) => b.score - a.score);

    if (highScoreLeads.length > 0) {
      insights.push({
        insightType: 'high_potential_leads',
        title: 'High-potential leads need attention',
        description: `${highScoreLeads.length} lead(s) scored 70+ and may be ready for sales handoff.`,
        priority: 'high',
        context: { leadIds: highScoreLeads.slice(0, 10).map((row) => row.id) },
      });
    }

    if (crmLeads.length > 0) {
      insights.push({
        insightType: 'crm_lead_customers',
        title: 'CRM lead-status customers',
        description: `${crmLeads.length} CRM customer(s) have lead status and may need qualification.`,
        priority: 'medium',
        context: { customerIds: crmLeads.slice(0, 10).map((row) => row.id) },
      });
    }

    const sourceCounts = new Map<string, number>();
    for (const lead of leadRows) {
      if (!lead.sourceName) continue;
      sourceCounts.set(lead.sourceName, (sourceCounts.get(lead.sourceName) ?? 0) + 1);
    }

    const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topSource) {
      insights.push({
        insightType: 'lead_source',
        title: `Top lead source: ${topSource[0]}`,
        description: `${topSource[1]} lead(s) tracked from this source.`,
        priority: 'low',
        context: { sourceName: topSource[0], count: topSource[1] },
      });
    }

    const serviceDemand = new Map<string, number>();
    for (const job of jobRows) {
      const key = job.title.trim().toLowerCase().slice(0, 40);
      serviceDemand.set(key, (serviceDemand.get(key) ?? 0) + 1);
    }

    const topService = [...serviceDemand.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topService && topService[1] >= 2) {
      insights.push({
        insightType: 'service_demand',
        title: 'Service demand signal',
        description: `"${topService[0]}" appears in ${topService[1]} job(s) — potential acquisition focus.`,
        priority: 'medium',
        context: { serviceTitle: topService[0], jobCount: topService[1] },
      });
    }

    const openQuotes = quoteRows.filter((row) => ['draft', 'sent'].includes(row.status));
    if (openQuotes.length > 0) {
      insights.push({
        insightType: 'quote_interest',
        title: 'Open quotes indicate acquisition interest',
        description: `${openQuotes.length} open quote(s) may represent warm acquisition opportunities.`,
        priority: 'medium',
        context: { quoteCount: openQuotes.length },
      });
    }

    return insights.slice(0, 15);
  }

  async getSalesHandoffPreview(companyId: string, leadId: string): Promise<SalesHandoffPreview> {
    const lead = await this.getLead(companyId, leadId);
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    if (['converted', 'lost'].includes(lead.status)) {
      throw new LeadsError('INVALID_STATUS', 'Lead is already closed');
    }

    return {
      leadId: lead.id,
      leadTitle: lead.title,
      contactName: lead.contactName,
      currentScore: lead.score,
      suggestedOpportunityTitle: `Opportunity — ${lead.title}`,
      suggestedOpportunityType: lead.score >= 70 ? 'high_value_customer' : 'follow_up',
      requiresApproval: true,
    };
  }

  async listRecommendations(companyId: string): Promise<LeadRecommendationSummary[]> {
    const rows = await this.db.query.leadRecommendations.findMany({
      where: and(
        eq(leadRecommendations.companyId, companyId),
        inArray(leadRecommendations.status, ['pending', 'accepted']),
      ),
      with: { lead: true },
      orderBy: [desc(leadRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<LeadRecommendationSummary[]> {
    const [leadRows, insights] = await Promise.all([
      this.listLeads(companyId),
      this.getAcquisitionInsights(companyId),
    ]);

    const signals: Array<{
      leadId: string | null;
      recommendationType: LeadRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const lead of leadRows) {
      if (['converted', 'lost'].includes(lead.status)) continue;

      if (lead.score >= 70 && ['qualified', 'contacted', 'opportunity'].includes(lead.status)) {
        signals.push({
          leadId: lead.id,
          recommendationType: 'handoff',
          title: `Sales handoff — ${lead.title}`,
          description: `${lead.contactName} scored ${lead.score}/100. Recommend sales opportunity handoff for approval.`,
          priority: 'high',
          context: { score: lead.score, status: lead.status },
        });
      } else if (lead.status === 'new') {
        signals.push({
          leadId: lead.id,
          recommendationType: 'qualification',
          title: `Qualify lead — ${lead.title}`,
          description: `New lead ${lead.contactName} needs qualification and initial contact.`,
          priority: 'medium',
          context: { score: lead.score },
        });
      } else if (lead.status === 'contacted') {
        signals.push({
          leadId: lead.id,
          recommendationType: 'follow_up',
          title: `Follow up — ${lead.title}`,
          description: `${lead.contactName} was contacted. Schedule a follow-up task.`,
          priority: 'medium',
          context: { score: lead.score },
        });
      }
    }

    for (const insight of insights.slice(0, 5)) {
      signals.push({
        leadId: null,
        recommendationType:
          insight.insightType === 'high_potential_leads'
            ? 'conversion'
            : insight.insightType === 'crm_lead_customers'
              ? 'engagement'
              : 'retention',
        title: insight.title,
        description: insight.description,
        priority: insight.priority,
        context: insight.context,
      });
    }

    if (signals.length === 0) {
      return [];
    }

    const inserted = await this.db
      .insert(leadRecommendations)
      .values(
        signals.map((signal) => ({
          companyId,
          leadId: signal.leadId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          status: 'pending' as const,
          context: signal.context,
        })),
      )
      .returning();

    const rows = await this.db.query.leadRecommendations.findMany({
      where: inArray(
        leadRecommendations.id,
        inserted.map((row) => row.id),
      ),
      with: { lead: true },
    });

    return rows.map(toRecommendationSummary);
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateLeadRecommendationRequest,
  ): Promise<LeadRecommendationSummary> {
    const existing = await this.db.query.leadRecommendations.findFirst({
      where: and(
        eq(leadRecommendations.id, recommendationId),
        eq(leadRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new LeadsError('NOT_FOUND', 'Lead recommendation not found');
    }

    await this.db
      .update(leadRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(leadRecommendations.id, recommendationId));

    const row = await this.db.query.leadRecommendations.findFirst({
      where: eq(leadRecommendations.id, recommendationId),
      with: { lead: true },
    });

    return toRecommendationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<LeadAuraContext> {
    const [stats, leadRows, insights] = await Promise.all([
      this.getStats(companyId),
      this.listLeads(companyId),
      this.getAcquisitionInsights(companyId),
    ]);

    const activeLeads = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));
    const averageScore =
      activeLeads.length > 0
        ? Math.round(activeLeads.reduce((sum, row) => sum + row.score, 0) / activeLeads.length)
        : 0;

    return {
      activeLeadCount: stats.activeLeadCount,
      qualifiedLeadCount: stats.qualifiedLeadCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      averageScore,
      topLeads: [...activeLeads]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          title: row.title,
          contactName: row.contactName,
          status: row.status,
          score: row.score,
        })),
      acquisitionInsights: insights.slice(0, 8),
      summary: `${stats.activeLeadCount} active lead(s), ${stats.crmLeadCustomerCount} CRM lead customer(s), average score ${averageScore}.`,
    };
  }

  private async buildScoringSignals(
    companyId: string,
    lead: typeof leads.$inferSelect,
  ): Promise<Record<string, unknown>> {
    const signals: Record<string, unknown> = {
      status: lead.status,
      hasEmail: Boolean(lead.contactEmail),
      hasPhone: Boolean(lead.contactPhone),
    };

    const [activityCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadActivities)
      .where(eq(leadActivities.leadId, lead.id));

    signals.activityCount = activityCountRow?.count ?? 0;

    if (!lead.customerId) {
      return signals;
    }

    const [customer, jobRows, quoteRows, communicationRows, activityRows, paymentRows] =
      await Promise.all([
        this.db.query.customers.findFirst({
          where: and(eq(customers.id, lead.customerId), eq(customers.companyId, companyId)),
        }),
        this.db.query.jobs.findMany({
          where: and(eq(jobs.companyId, companyId), eq(jobs.customerId, lead.customerId)),
        }),
        this.db.query.quotes.findMany({
          where: and(eq(quotes.companyId, companyId), eq(quotes.customerId, lead.customerId)),
        }),
        this.db.query.communications.findMany({
          where: and(
            eq(communications.companyId, companyId),
            eq(communications.customerId, lead.customerId),
          ),
        }),
        this.db.query.customerActivities.findMany({
          where: and(
            eq(customerActivities.companyId, companyId),
            eq(customerActivities.customerId, lead.customerId),
          ),
        }),
        this.db.query.payments.findMany({
          where: eq(payments.companyId, companyId),
          with: { invoice: true },
        }),
      ]);

    if (customer) {
      signals.customerStatus = customer.status;
      signals.customerAgeDays = Math.floor(
        (Date.now() - customer.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
    }

    signals.completedJobCount = jobRows.filter((row) => row.status === 'completed').length;
    signals.openQuoteCount = quoteRows.filter((row) =>
      ['draft', 'sent'].includes(row.status),
    ).length;
    signals.communicationCount = communicationRows.length;
    signals.crmActivityCount = activityRows.length;

    const revenueCents = paymentRows
      .filter((row) => row.invoice?.customerId === lead.customerId)
      .reduce((sum, row) => sum + row.amountCents, 0);
    signals.revenueCents = revenueCents;

    const lastContactDates = [
      ...communicationRows.map((row) => row.occurredAt),
      ...activityRows.map((row) => row.createdAt),
    ];
    if (lastContactDates.length > 0) {
      signals.daysSinceLastContact = Math.floor(
        (Date.now() - Math.max(...lastContactDates.map((date) => date.getTime()))) /
          (24 * 60 * 60 * 1000),
      );
    }

    return signals;
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new LeadsError('NOT_FOUND', 'Customer not found');
    }
  }

  private async ensureSourceBelongsToCompany(companyId: string, sourceId: string): Promise<void> {
    const source = await this.db.query.leadSources.findFirst({
      where: and(eq(leadSources.id, sourceId), eq(leadSources.companyId, companyId)),
    });

    if (!source) {
      throw new LeadsError('NOT_FOUND', 'Lead source not found');
    }
  }

  private async ensureLeadBelongsToCompany(companyId: string, leadId: string): Promise<void> {
    const lead = await this.getLead(companyId, leadId);
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }
  }

  private async ensureUserBelongsToCompany(companyId: string, userId: string): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });
    if (!user) {
      throw new LeadsError('NOT_FOUND', 'Assigned user not found for this company');
    }
  }
}

function computeScoreFromSignals(signals: Record<string, unknown>): number {
  let score = 10;

  if (signals.hasEmail) score += 10;
  if (signals.hasPhone) score += 10;

  const status = String(signals.status ?? 'new');
  if (status === 'qualified') score += 15;
  if (status === 'contacted') score += 10;
  if (status === 'opportunity') score += 20;

  score += Math.min(Number(signals.activityCount ?? 0) * 5, 15);
  score += Math.min(Number(signals.completedJobCount ?? 0) * 8, 20);
  score += Math.min(Number(signals.openQuoteCount ?? 0) * 10, 20);
  score += Math.min(Number(signals.communicationCount ?? 0) * 3, 12);
  score += Math.min(Number(signals.crmActivityCount ?? 0) * 3, 12);

  const revenueCents = Number(signals.revenueCents ?? 0);
  if (revenueCents > 0) score += 10;
  if (revenueCents > 100_000) score += 10;

  const daysSince = signals.daysSinceLastContact;
  if (typeof daysSince === 'number' && daysSince <= 30) score += 8;

  if (signals.customerStatus === 'lead') score += 5;

  return Math.max(0, Math.min(100, score));
}

function toSourceSummary(
  row: typeof leadSources.$inferSelect,
  leadCount: number,
): LeadSourceSummary {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    leadCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLeadSummary(
  row: typeof leads.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    source?: typeof leadSources.$inferSelect | null;
    job?: { jobNumber: string | null } | null;
    assignedUser?: { firstName: string; lastName: string } | null;
  },
): LeadSummary {
  const addressDisplay =
    formatAddressLine({
      street: row.street,
      unit: row.unit,
      suburb: row.suburb,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
    }) ||
    buildJobAddressDisplay({
      street: row.street,
      suburb: row.suburb,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
      unit: row.unit,
    });

  const dueAt = row.nextActionDueAt?.getTime() ?? null;
  const ageMs = Date.now() - row.createdAt.getTime();

  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    propertyId: row.propertyId ?? null,
    jobId: row.jobId ?? null,
    jobNumber: row.job?.jobNumber ?? null,
    sourceId: row.sourceId,
    sourceName: row.source?.name ?? null,
    status: row.status,
    title: row.title,
    companyName: row.companyName ?? null,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    contactPhoneE164: row.contactPhoneE164 ?? null,
    serviceType: row.serviceType ?? null,
    urgency: (row.urgency as LeadSummary['urgency']) || 'normal',
    street: row.street ?? null,
    suburb: row.suburb ?? null,
    city: row.city ?? null,
    province: row.province ?? null,
    postalCode: row.postalCode ?? null,
    unit: row.unit ?? null,
    addressDisplay: addressDisplay || null,
    accessInstructions: row.accessInstructions ?? null,
    preferredAppointmentAt: row.preferredAppointmentAt?.toISOString() ?? null,
    nextAction: row.nextAction ?? null,
    nextActionDueAt: row.nextActionDueAt?.toISOString() ?? null,
    isOverdue: Boolean(
      dueAt &&
        dueAt < Date.now() &&
        !LEAD_TERMINAL_STATUSES.includes(row.status as LeadStatus),
    ),
    lostReason: row.lostReason ?? null,
    reopenReason: row.reopenReason ?? null,
    marketingConsent: row.marketingConsent ?? false,
    operationalContactPermission: row.operationalContactPermission ?? true,
    score: row.score,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUser
      ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
      : null,
    notes: row.notes,
    emailIsPlaceholder: isPlaceholderEmail(row.contactEmail),
    convertedAt: row.convertedAt?.toISOString() ?? null,
    convertedByUserId: row.convertedByUserId ?? null,
    lostAt: row.lostAt?.toISOString() ?? null,
    createdByUserId: row.createdByUserId,
    ageDays: Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000))),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new LeadsError('VALIDATION_ERROR', 'Invalid date value');
  }
  return parsed;
}

function toActivitySummary(
  row: typeof leadActivities.$inferSelect & {
    author?: { firstName: string; lastName: string } | null;
  },
): LeadActivitySummary {
  return {
    id: row.id,
    leadId: row.leadId,
    activityType: row.activityType,
    subject: row.subject,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toScoreSummary(row: typeof leadScores.$inferSelect): LeadScoreSummary {
  return {
    id: row.id,
    leadId: row.leadId,
    score: row.score,
    signals: row.signals ?? {},
    scoredAt: row.scoredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof leadRecommendations.$inferSelect & {
    lead?: typeof leads.$inferSelect | null;
  },
): LeadRecommendationSummary {
  return {
    id: row.id,
    leadId: row.leadId,
    leadTitle: row.lead?.title ?? null,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: row.context ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
