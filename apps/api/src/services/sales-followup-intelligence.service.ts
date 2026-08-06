import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildSfiObjectionDraft,
  buildSfiQuoteFollowUpItem,
  buildSfiQuoteReminderDraft,
  buildSfiReactivationDraft,
  canAccessSalesFollowupIntelligence,
  canApproveSalesFollowupIntelligence,
  canWriteSalesFollowupIntelligence,
  defaultSfiSettings,
  detectSfiObjectionCategory,
  isSfiOpenQuoteStatus,
  SFI_PRODUCT_COPY,
  type CreateSfiDraftRequest,
  type DecideSfiDraftRequest,
  type GenerateSfiObjectionDraftsRequest,
  type GenerateSfiQuoteReminderDraftsRequest,
  type GenerateSfiReactivationDraftsRequest,
  type RecordSfiQuoteResponseRequest,
  type ScheduleSfiQuoteFollowUpRequest,
  type SfiCustomerResponseStatus,
  type SfiDashboard,
  type SfiObjectionSignal,
  type SfiOutreachDraftSummary,
  type SfiQuoteFollowUpItem,
  type SfiReactivationOpportunity,
  type SfiSettings,
  type UpdateSfiSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customers,
  jobs,
  opsRecurringMaintenancePlans,
  quotes,
  securityAuditLogs,
  sfiFollowupSettings,
  sfiOutreachDrafts,
  sfiQuoteResponseTracking,
} from '@titan/db';

export class SalesFollowupIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SalesFollowupIntelligenceError';
  }
}

export type SalesFollowupActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const OPEN_QUOTE_STATUSES = ['sent', 'viewed', 'approved_for_sending', 'accepted'] as const;

export class SalesFollowupIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: SalesFollowupActor): void {
    if (!canAccessSalesFollowupIntelligence(actor)) {
      throw new SalesFollowupIntelligenceError(
        'FORBIDDEN',
        'Sales Follow-up Intelligence requires Owner or sales/quotes access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: SalesFollowupActor): void {
    this.assertRead(actor);
    if (!canWriteSalesFollowupIntelligence(actor)) {
      throw new SalesFollowupIntelligenceError(
        'FORBIDDEN',
        'Sales Follow-up Intelligence write actions require Owner or sales/quotes write access.',
      );
    }
  }

  private assertApprove(actor: SalesFollowupActor): void {
    this.assertWrite(actor);
    if (!canApproveSalesFollowupIntelligence(actor)) {
      throw new SalesFollowupIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner or Platform Owner may approve sales follow-up outreach drafts.',
      );
    }
  }

  private async recordAudit(
    actor: SalesFollowupActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'sales_followup_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSend: false,
        spamProhibited: true,
        technicianClientDenied: true,
        extendsSalesIntelligenceAgent: true,
      },
    });
  }

  private toDraft(
    row: typeof sfiOutreachDrafts.$inferSelect,
    customerName: string | null = null,
    quoteNumber: string | null = null,
  ): SfiOutreachDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      channel: row.channel,
      customerId: row.customerId,
      customerName,
      quoteId: row.quoteId,
      quoteNumber,
      jobId: row.jobId,
      maintenancePlanId: row.maintenancePlanId,
      subject: row.subject,
      body: row.body,
      scheduledFollowUpAt: row.scheduledFollowUpAt?.toISOString() ?? null,
      customerResponseStatus: row.customerResponseStatus,
      objectionCategory: row.objectionCategory,
      autoSend: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toSettings(row: typeof sfiFollowupSettings.$inferSelect): SfiSettings {
    return {
      quoteRemindersEnabled: row.quoteRemindersEnabled,
      objectionDraftsEnabled: row.objectionDraftsEnabled,
      reactivationDraftsEnabled: row.reactivationDraftsEnabled,
      autoSendEnabled: false,
      defaultChannel: row.defaultChannel,
      staleQuoteDays: row.staleQuoteDays,
      reactivationIdleDays: row.reactivationIdleDays,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureSettings(actor: SalesFollowupActor): Promise<SfiSettings> {
    const existing = await this.db.query.sfiFollowupSettings.findFirst({
      where: eq(sfiFollowupSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(sfiFollowupSettings)
      .values({
        companyId: actor.companyId,
        updatedByUserId: actor.userId,
        autoSendEnabled: false,
      })
      .returning();
    return created ? this.toSettings(created) : defaultSfiSettings();
  }

  private async customerNameMap(
    companyId: string,
    customerIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(customerIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.companyId, companyId), inArray(customers.id, ids)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async quoteNumberMap(
    companyId: string,
    quoteIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(quoteIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: quotes.id, quoteNumber: quotes.quoteNumber })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), inArray(quotes.id, ids)));
    return new Map(rows.map((r) => [r.id, r.quoteNumber]));
  }

  async getDashboard(actor: SalesFollowupActor): Promise<SfiDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);
    const [quoteItems, objectionSignals, reactivationOps, draftRows] = await Promise.all([
      this.loadQuoteFollowUps(actor, settings),
      this.loadObjectionSignals(actor),
      this.loadReactivationOpportunities(actor, settings),
      this.db
        .select()
        .from(sfiOutreachDrafts)
        .where(eq(sfiOutreachDrafts.companyId, actor.companyId))
        .orderBy(desc(sfiOutreachDrafts.createdAt))
        .limit(50),
    ]);

    const nameMap = await this.customerNameMap(
      actor.companyId,
      draftRows.map((d) => d.customerId).filter((id): id is string => Boolean(id)),
    );
    const qMap = await this.quoteNumberMap(
      actor.companyId,
      draftRows.map((d) => d.quoteId).filter((id): id is string => Boolean(id)),
    );
    const drafts = draftRows.map((d) =>
      this.toDraft(
        d,
        d.customerId ? (nameMap.get(d.customerId) ?? null) : null,
        d.quoteId ? (qMap.get(d.quoteId) ?? null) : null,
      ),
    );
    const pendingApprovalCount = drafts.filter((d) => d.status === 'pending_approval').length;

    const openQuoteCount = quoteItems.length;
    const reminderDueCount = quoteItems.filter((q) => q.reminderRecommended).length;
    const awaitingResponseCount = quoteItems.filter((q) => q.responseStatus === 'awaiting').length;

    const summaryParts: string[] = [];
    if (openQuoteCount === 0 && objectionSignals.length === 0 && reactivationOps.length === 0) {
      summaryParts.push(
        'No open quotes, objection signals, or reactivation opportunities from real tenant data. Values are not invented.',
      );
    } else {
      summaryParts.push(
        `${openQuoteCount} open quote(s), ${reminderDueCount} reminder-due, ${objectionSignals.length} objection signal(s), ${reactivationOps.length} reactivation opportunit(ies).`,
      );
    }
    summaryParts.push(
      pendingApprovalCount > 0
        ? `${pendingApprovalCount} draft(s) pending Owner approval — nothing auto-sent.`
        : 'No pending follow-up approvals. Drafts require Owner approval before any send.',
    );

    return {
      summary: summaryParts.join(' '),
      policy: {
        autoSendEnabled: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeCampaignsInvented: false,
        extendsSalesIntelligenceAgent: true,
      },
      productClarification: {
        salesIntelligenceAgent: SFI_PRODUCT_COPY.salesIntelligenceAgent,
        thisLayer: SFI_PRODUCT_COPY.thisLayer,
      },
      quoteFollowUps: {
        availability: openQuoteCount > 0 ? 'available' : 'unavailable',
        openQuoteCount,
        reminderDueCount,
        awaitingResponseCount,
        items: quoteItems,
        note:
          openQuoteCount > 0
            ? 'Quote follow-ups grounded in real quotes table only.'
            : 'No open/sent quotes found — quote follow-up unavailable (not invented).',
      },
      objections: {
        availability: objectionSignals.length > 0 ? 'available' : 'unavailable',
        signalCount: objectionSignals.length,
        signals: objectionSignals,
        note:
          objectionSignals.length > 0
            ? 'Objection signals from real inbound communications / quote notes only.'
            : 'No objection language detected in stored communications or quote notes — unavailable.',
      },
      reactivation: {
        availability: reactivationOps.length > 0 ? 'available' : 'unavailable',
        opportunityCount: reactivationOps.length,
        opportunities: reactivationOps,
        note:
          reactivationOps.length > 0
            ? 'Reactivation opportunities from real completed jobs / maintenance plans only.'
            : 'No idle previous customers or maintenance opportunities found — unavailable.',
      },
      drafts,
      pendingApprovalCount,
      settings,
      auraConnections: [
        {
          target: 'sales_intelligence_agent',
          label: 'Sales Intelligence Agent',
          href: '/sales-intelligence-agent',
          note: 'Department 10.1 foundation — extend, do not rebuild.',
        },
        {
          target: 'quotes',
          label: 'Quotes',
          href: '/quotes',
          note: 'System of record for quote documents.',
        },
        {
          target: 'crm',
          label: 'Customers',
          href: '/customers',
          note: 'Real customer records only.',
        },
        {
          target: 'sales_pipeline',
          label: 'Sales Intelligence',
          href: '/sales-intelligence',
          note: 'Existing pipeline UI.',
        },
        {
          target: 'command_centre',
          label: 'AURA Command Centre',
          href: '/aura-command-centre',
          note: 'Agent coordination surface.',
        },
      ],
    };
  }

  private async loadQuoteFollowUps(
    actor: SalesFollowupActor,
    settings: SfiSettings,
  ): Promise<SfiQuoteFollowUpItem[]> {
    const quoteRows = await this.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        status: quotes.status,
        customerId: quotes.customerId,
        totalCents: quotes.totalCents,
        currency: quotes.currency,
        issuedAt: quotes.issuedAt,
        validUntil: quotes.validUntil,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          inArray(quotes.status, [...OPEN_QUOTE_STATUSES]),
        ),
      )
      .orderBy(desc(quotes.issuedAt))
      .limit(40);

    if (quoteRows.length === 0) return [];

    const tracking = await this.db
      .select()
      .from(sfiQuoteResponseTracking)
      .where(
        and(
          eq(sfiQuoteResponseTracking.companyId, actor.companyId),
          inArray(
            sfiQuoteResponseTracking.quoteId,
            quoteRows.map((q) => q.id),
          ),
        ),
      );
    const trackingByQuote = new Map(tracking.map((t) => [t.quoteId, t]));
    const nameMap = await this.customerNameMap(
      actor.companyId,
      quoteRows.map((q) => q.customerId),
    );

    return quoteRows.map((q) => {
      const track = trackingByQuote.get(q.id);
      return buildSfiQuoteFollowUpItem({
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        title: q.title,
        status: q.status,
        customerId: q.customerId,
        customerName: nameMap.get(q.customerId) ?? null,
        totalCents: q.totalCents,
        currency: q.currency,
        issuedAt: q.issuedAt?.toISOString() ?? null,
        validUntil: q.validUntil?.toISOString() ?? null,
        staleQuoteDays: settings.staleQuoteDays,
        responseStatus: (track?.responseStatus ?? 'none') as SfiCustomerResponseStatus,
        lastResponseAt: track?.lastResponseAt?.toISOString() ?? null,
        scheduledFollowUpAt: track?.scheduledFollowUpAt?.toISOString() ?? null,
      });
    });
  }

  private async loadObjectionSignals(actor: SalesFollowupActor): Promise<SfiObjectionSignal[]> {
    const signals: SfiObjectionSignal[] = [];

    const inbound = await this.db
      .select({
        id: communications.id,
        customerId: communications.customerId,
        subject: communications.subject,
        body: communications.body,
      })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, actor.companyId),
          eq(communications.direction, 'inbound'),
        ),
      )
      .orderBy(desc(communications.occurredAt))
      .limit(40);

    const nameMap = await this.customerNameMap(
      actor.companyId,
      inbound.map((c) => c.customerId),
    );

    for (const row of inbound) {
      const text = [row.subject, row.body].filter(Boolean).join(' ');
      const detected = detectSfiObjectionCategory(text);
      if (detected.availability === 'unavailable') continue;
      signals.push({
        id: `comm:${row.id}`,
        customerId: row.customerId,
        customerName: nameMap.get(row.customerId) ?? null,
        quoteId: null,
        quoteNumber: null,
        category: detected.category,
        availability: detected.availability,
        signalText: text.slice(0, 280),
        recommendation: `Customer concern (${detected.category}) — queue an objection/value draft for Owner approval (never auto-sent).`,
        autoExecuted: false,
      });
    }

    const declinedQuotes = await this.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        customerNotes: quotes.customerNotes,
        notes: quotes.notes,
        status: quotes.status,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          inArray(quotes.status, ['declined', 'viewed', 'sent']),
        ),
      )
      .orderBy(desc(quotes.updatedAt))
      .limit(30);

    const qNames = await this.customerNameMap(
      actor.companyId,
      declinedQuotes.map((q) => q.customerId),
    );

    for (const q of declinedQuotes) {
      const text = [q.customerNotes, q.notes].filter(Boolean).join(' ');
      const detected = detectSfiObjectionCategory(text);
      if (detected.availability === 'unavailable') continue;
      signals.push({
        id: `quote:${q.id}`,
        customerId: q.customerId,
        customerName: qNames.get(q.customerId) ?? null,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        category: detected.category,
        availability: detected.availability,
        signalText: text.slice(0, 280),
        recommendation: `Quote ${q.quoteNumber} note suggests ${detected.category} concern — draft response for Owner approval.`,
        autoExecuted: false,
      });
    }

    return signals.slice(0, 40);
  }

  private async loadReactivationOpportunities(
    actor: SalesFollowupActor,
    settings: SfiSettings,
  ): Promise<SfiReactivationOpportunity[]> {
    const completed = await this.db
      .select({
        customerId: jobs.customerId,
        completedCount: sql<number>`count(*)::int`,
        lastJobAt: sql<Date | null>`max(${jobs.updatedAt})`,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.status, 'completed')))
      .groupBy(jobs.customerId)
      .limit(80);

    if (completed.length === 0) return [];

    const idleMs = settings.reactivationIdleDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const idleCustomers = completed.filter((row) => {
      if (!row.lastJobAt) return false;
      const t = row.lastJobAt instanceof Date ? row.lastJobAt.getTime() : new Date(row.lastJobAt).getTime();
      return Number.isFinite(t) && now - t >= idleMs;
    });

    const plans = await this.db
      .select({
        id: opsRecurringMaintenancePlans.id,
        name: opsRecurringMaintenancePlans.name,
        customerId: opsRecurringMaintenancePlans.customerId,
        status: opsRecurringMaintenancePlans.status,
        nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
      })
      .from(opsRecurringMaintenancePlans)
      .where(eq(opsRecurringMaintenancePlans.companyId, actor.companyId))
      .limit(80);

    const plansByCustomer = new Map<string, typeof plans>();
    for (const p of plans) {
      if (!p.customerId) continue;
      const list = plansByCustomer.get(p.customerId) ?? [];
      list.push(p);
      plansByCustomer.set(p.customerId, list);
    }

    const nameMap = await this.customerNameMap(
      actor.companyId,
      idleCustomers.map((c) => c.customerId),
    );

    const opportunities: SfiReactivationOpportunity[] = [];
    for (const row of idleCustomers) {
      const customerPlans = plansByCustomer.get(row.customerId) ?? [];
      const openPlans = customerPlans.filter((p) => p.status !== 'archived' && p.status !== 'paused');
      const lastJobAt =
        row.lastJobAt instanceof Date
          ? row.lastJobAt.toISOString()
          : row.lastJobAt
            ? new Date(row.lastJobAt).toISOString()
            : null;

      if (openPlans.length > 0) {
        opportunities.push({
          id: `maint:${row.customerId}`,
          customerId: row.customerId,
          customerName: nameMap.get(row.customerId) ?? null,
          kind: 'maintenance_opportunity',
          availability: 'available',
          lastJobAt,
          completedJobCount: Number(row.completedCount) || 0,
          openMaintenancePlanCount: openPlans.length,
          recommendation: `Previous customer with ${openPlans.length} maintenance plan(s) — reactivation/maintenance draft recommended (Owner approval).`,
          autoExecuted: false,
        });
      } else {
        opportunities.push({
          id: `prev:${row.customerId}`,
          customerId: row.customerId,
          customerName: nameMap.get(row.customerId) ?? null,
          kind: 'previous_customer',
          availability: 'available',
          lastJobAt,
          completedJobCount: Number(row.completedCount) || 0,
          openMaintenancePlanCount: 0,
          recommendation:
            'Previous customer idle beyond reactivation window — service opportunity draft recommended (Owner approval; never auto-sent).',
          autoExecuted: false,
        });
      }
    }

    return opportunities.slice(0, 40);
  }

  async listDrafts(actor: SalesFollowupActor): Promise<SfiOutreachDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(sfiOutreachDrafts)
      .where(eq(sfiOutreachDrafts.companyId, actor.companyId))
      .orderBy(desc(sfiOutreachDrafts.createdAt))
      .limit(100);
    const nameMap = await this.customerNameMap(
      actor.companyId,
      rows.map((d) => d.customerId).filter((id): id is string => Boolean(id)),
    );
    const qMap = await this.quoteNumberMap(
      actor.companyId,
      rows.map((d) => d.quoteId).filter((id): id is string => Boolean(id)),
    );
    return rows.map((d) =>
      this.toDraft(
        d,
        d.customerId ? (nameMap.get(d.customerId) ?? null) : null,
        d.quoteId ? (qMap.get(d.quoteId) ?? null) : null,
      ),
    );
  }

  async createDraft(
    actor: SalesFollowupActor,
    input: CreateSfiDraftRequest,
  ): Promise<SfiOutreachDraftSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);

    let customerName: string | null = null;
    if (input.customerId) {
      const customer = await this.db.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)),
      });
      if (!customer) {
        throw new SalesFollowupIntelligenceError(
          'NOT_FOUND',
          'Customer not found for this tenant — cannot invent customers.',
        );
      }
      customerName = customer.name;
    }

    let quoteNumber: string | null = null;
    let quoteCustomerId: string | null = null;
    if (input.quoteId) {
      const quote = await this.db.query.quotes.findFirst({
        where: and(eq(quotes.id, input.quoteId), eq(quotes.companyId, actor.companyId)),
      });
      if (!quote) {
        throw new SalesFollowupIntelligenceError(
          'NOT_FOUND',
          'Quote not found for this tenant — cannot invent quotes.',
        );
      }
      quoteNumber = quote.quoteNumber;
      quoteCustomerId = quote.customerId;
      if (!customerName) {
        const c = await this.db.query.customers.findFirst({
          where: and(eq(customers.id, quote.customerId), eq(customers.companyId, actor.companyId)),
        });
        customerName = c?.name ?? null;
      }
    }

    if (input.jobId) {
      const job = await this.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.companyId, actor.companyId)),
      });
      if (!job) {
        throw new SalesFollowupIntelligenceError(
          'NOT_FOUND',
          'Job not found for this tenant — cannot invent jobs.',
        );
      }
    }

    let subject = input.subject?.trim() ?? '';
    let body = input.body?.trim() ?? '';
    if (!subject || !body) {
      if (input.kind === 'quote_reminder' || input.kind === 'quote_follow_up') {
        if (!input.quoteId) {
          throw new SalesFollowupIntelligenceError(
            'VALIDATION_ERROR',
            'quoteId is required for quote follow-up drafts.',
          );
        }
        const quote = await this.db.query.quotes.findFirst({
          where: and(eq(quotes.id, input.quoteId), eq(quotes.companyId, actor.companyId)),
        });
        if (!quote) {
          throw new SalesFollowupIntelligenceError('NOT_FOUND', 'Quote not found for this tenant.');
        }
        const built = buildSfiQuoteReminderDraft({
          customerName: customerName ?? 'Customer',
          quoteNumber: quote.quoteNumber,
          quoteTitle: customerName ?? 'Customer',
          totalCents: quote.totalCents,
          currency: quote.currency,
          validUntil: quote.validUntil?.toISOString() ?? null,
        });
        subject = subject || built.subject;
        body = body || built.body;
      } else if (
        input.kind === 'objection_response' ||
        input.kind === 'price_objection' ||
        input.kind === 'value_explanation'
      ) {
        const built = buildSfiObjectionDraft({
          customerName,
          category: input.objectionCategory ?? 'other',
          quoteNumber,
          signalText: null,
        });
        subject = subject || built.subject;
        body = body || built.body;
      } else {
        const built = buildSfiReactivationDraft({
          customerName,
          kind:
            input.kind === 'maintenance_opportunity'
              ? 'maintenance_opportunity'
              : input.kind === 'service_opportunity'
                ? 'service_opportunity'
                : 'previous_customer',
          lastJobAt: null,
          completedJobCount: 0,
          maintenancePlanName: null,
        });
        subject = subject || built.subject;
        body = body || built.body;
      }
    }

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [row] = await this.db
      .insert(sfiOutreachDrafts)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status,
        channel: input.channel ?? settings.defaultChannel,
        customerId: input.customerId ?? quoteCustomerId,
        quoteId: input.quoteId ?? null,
        jobId: input.jobId ?? null,
        maintenancePlanId: input.maintenancePlanId ?? null,
        subject,
        body,
        scheduledFollowUpAt: input.scheduledFollowUpAt
          ? new Date(input.scheduledFollowUpAt)
          : null,
        objectionCategory: input.objectionCategory ?? null,
        autoSend: false,
        createdByUserId: actor.userId,
      })
      .returning();

    if (!row) {
      throw new SalesFollowupIntelligenceError('CREATE_FAILED', 'Unable to create follow-up draft.');
    }

    await this.recordAudit(actor, 'sfi_draft_created', row.id, {
      kind: row.kind,
      status: row.status,
      quoteId: row.quoteId,
      customerId: row.customerId,
    });

    return this.toDraft(row, customerName, quoteNumber);
  }

  async decideDraft(
    actor: SalesFollowupActor,
    draftId: string,
    input: DecideSfiDraftRequest,
  ): Promise<SfiOutreachDraftSummary> {
    this.assertApprove(actor);
    const existing = await this.db.query.sfiOutreachDrafts.findFirst({
      where: and(
        eq(sfiOutreachDrafts.id, draftId),
        eq(sfiOutreachDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new SalesFollowupIntelligenceError('NOT_FOUND', 'Draft not found for this tenant.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new SalesFollowupIntelligenceError(
        'INVALID_STATE',
        `Draft is already ${existing.status} — cannot decide again.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'cancelled';

    const [row] = await this.db
      .update(sfiOutreachDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoSend: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sfiOutreachDrafts.id, draftId), eq(sfiOutreachDrafts.companyId, actor.companyId)),
      )
      .returning();

    if (!row) {
      throw new SalesFollowupIntelligenceError('UPDATE_FAILED', 'Unable to decide draft.');
    }

    await this.recordAudit(
      actor,
      nextStatus === 'approved' ? 'sfi_draft_approved' : `sfi_draft_${nextStatus}`,
      row.id,
      {
        decision: input.decision,
        note: 'Approval does not send — use Email Centre / approved outbound execute path.',
      },
    );

    const nameMap = await this.customerNameMap(
      actor.companyId,
      row.customerId ? [row.customerId] : [],
    );
    const qMap = await this.quoteNumberMap(actor.companyId, row.quoteId ? [row.quoteId] : []);
    return this.toDraft(
      row,
      row.customerId ? (nameMap.get(row.customerId) ?? null) : null,
      row.quoteId ? (qMap.get(row.quoteId) ?? null) : null,
    );
  }

  async scheduleQuoteFollowUp(
    actor: SalesFollowupActor,
    input: ScheduleSfiQuoteFollowUpRequest,
  ): Promise<{ quoteId: string; scheduledFollowUpAt: string; autoSend: false }> {
    this.assertWrite(actor);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, input.quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) {
      throw new SalesFollowupIntelligenceError(
        'NOT_FOUND',
        'Quote not found for this tenant — cannot invent quotes.',
      );
    }
    const when = new Date(input.scheduledFollowUpAt);
    if (Number.isNaN(when.getTime())) {
      throw new SalesFollowupIntelligenceError(
        'VALIDATION_ERROR',
        'scheduledFollowUpAt must be a valid ISO datetime.',
      );
    }

    const existing = await this.db.query.sfiQuoteResponseTracking.findFirst({
      where: and(
        eq(sfiQuoteResponseTracking.companyId, actor.companyId),
        eq(sfiQuoteResponseTracking.quoteId, input.quoteId),
      ),
    });

    if (existing) {
      await this.db
        .update(sfiQuoteResponseTracking)
        .set({
          scheduledFollowUpAt: when,
          notes: input.notes?.trim() || existing.notes,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(sfiQuoteResponseTracking.id, existing.id));
    } else {
      await this.db.insert(sfiQuoteResponseTracking).values({
        companyId: actor.companyId,
        quoteId: input.quoteId,
        customerId: quote.customerId,
        responseStatus: 'awaiting',
        scheduledFollowUpAt: when,
        notes: input.notes?.trim() || null,
        updatedByUserId: actor.userId,
      });
    }

    await this.recordAudit(actor, 'sfi_quote_followup_scheduled', input.quoteId, {
      scheduledFollowUpAt: when.toISOString(),
    });

    return {
      quoteId: input.quoteId,
      scheduledFollowUpAt: when.toISOString(),
      autoSend: false,
    };
  }

  async recordQuoteResponse(
    actor: SalesFollowupActor,
    input: RecordSfiQuoteResponseRequest,
  ): Promise<{ quoteId: string; responseStatus: SfiCustomerResponseStatus; autoSend: false }> {
    this.assertWrite(actor);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, input.quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) {
      throw new SalesFollowupIntelligenceError(
        'NOT_FOUND',
        'Quote not found for this tenant — cannot invent quotes.',
      );
    }

    const respondedAt = input.respondedAt ? new Date(input.respondedAt) : new Date();
    const existing = await this.db.query.sfiQuoteResponseTracking.findFirst({
      where: and(
        eq(sfiQuoteResponseTracking.companyId, actor.companyId),
        eq(sfiQuoteResponseTracking.quoteId, input.quoteId),
      ),
    });

    if (existing) {
      await this.db
        .update(sfiQuoteResponseTracking)
        .set({
          responseStatus: input.responseStatus,
          lastResponseAt: respondedAt,
          notes: input.notes?.trim() || existing.notes,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(sfiQuoteResponseTracking.id, existing.id));
    } else {
      await this.db.insert(sfiQuoteResponseTracking).values({
        companyId: actor.companyId,
        quoteId: input.quoteId,
        customerId: quote.customerId,
        responseStatus: input.responseStatus,
        lastResponseAt: respondedAt,
        notes: input.notes?.trim() || null,
        updatedByUserId: actor.userId,
      });
    }

    await this.recordAudit(actor, 'sfi_quote_response_recorded', input.quoteId, {
      responseStatus: input.responseStatus,
    });

    return {
      quoteId: input.quoteId,
      responseStatus: input.responseStatus,
      autoSend: false,
    };
  }

  async generateQuoteReminderDrafts(
    actor: SalesFollowupActor,
    input: GenerateSfiQuoteReminderDraftsRequest = {},
  ): Promise<{ created: number; drafts: SfiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.quoteRemindersEnabled) {
      return { created: 0, drafts: [] };
    }
    const items = await this.loadQuoteFollowUps(actor, settings);
    const due = items.filter((i) => i.reminderRecommended).slice(0, input.limit ?? 10);
    const created: SfiOutreachDraftSummary[] = [];
    for (const item of due) {
      if (!isSfiOpenQuoteStatus(item.status)) continue;
      const draft = await this.createDraft(actor, {
        kind: 'quote_reminder',
        quoteId: item.quoteId,
        customerId: item.customerId,
        submitForApproval: true,
      });
      created.push(draft);
    }
    await this.recordAudit(actor, 'sfi_quote_reminders_generated', actor.companyId, {
      created: created.length,
    });
    return { created: created.length, drafts: created };
  }

  async generateObjectionDrafts(
    actor: SalesFollowupActor,
    input: GenerateSfiObjectionDraftsRequest = {},
  ): Promise<{ created: number; drafts: SfiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.objectionDraftsEnabled) {
      return { created: 0, drafts: [] };
    }
    const signals = (await this.loadObjectionSignals(actor)).slice(0, input.limit ?? 10);
    const created: SfiOutreachDraftSummary[] = [];
    for (const signal of signals) {
      const built = buildSfiObjectionDraft({
        customerName: signal.customerName,
        category: signal.category,
        quoteNumber: signal.quoteNumber,
        signalText: signal.signalText,
      });
      const draft = await this.createDraft(actor, {
        kind: built.kind,
        customerId: signal.customerId ?? undefined,
        quoteId: signal.quoteId ?? undefined,
        subject: built.subject,
        body: built.body,
        objectionCategory: signal.category,
        submitForApproval: true,
      });
      created.push(draft);
    }
    await this.recordAudit(actor, 'sfi_objection_drafts_generated', actor.companyId, {
      created: created.length,
    });
    return { created: created.length, drafts: created };
  }

  async generateReactivationDrafts(
    actor: SalesFollowupActor,
    input: GenerateSfiReactivationDraftsRequest = {},
  ): Promise<{ created: number; drafts: SfiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.reactivationDraftsEnabled) {
      return { created: 0, drafts: [] };
    }
    const ops = (await this.loadReactivationOpportunities(actor, settings)).slice(
      0,
      input.limit ?? 10,
    );
    const created: SfiOutreachDraftSummary[] = [];
    for (const op of ops) {
      const plans = await this.db
        .select({
          id: opsRecurringMaintenancePlans.id,
          name: opsRecurringMaintenancePlans.name,
        })
        .from(opsRecurringMaintenancePlans)
        .where(
          and(
            eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
            eq(opsRecurringMaintenancePlans.customerId, op.customerId),
          ),
        )
        .limit(1);
      const built = buildSfiReactivationDraft({
        customerName: op.customerName,
        kind: op.kind,
        lastJobAt: op.lastJobAt,
        completedJobCount: op.completedJobCount,
        maintenancePlanName: plans[0]?.name ?? null,
      });
      const draft = await this.createDraft(actor, {
        kind: built.draftKind,
        customerId: op.customerId,
        maintenancePlanId: plans[0]?.id,
        subject: built.subject,
        body: built.body,
        submitForApproval: true,
      });
      created.push(draft);
    }
    await this.recordAudit(actor, 'sfi_reactivation_drafts_generated', actor.companyId, {
      created: created.length,
    });
    return { created: created.length, drafts: created };
  }

  async updateSettings(
    actor: SalesFollowupActor,
    input: UpdateSfiSettingsRequest,
  ): Promise<SfiSettings> {
    this.assertWrite(actor);
    await this.ensureSettings(actor);
    const [row] = await this.db
      .update(sfiFollowupSettings)
      .set({
        quoteRemindersEnabled: input.quoteRemindersEnabled,
        objectionDraftsEnabled: input.objectionDraftsEnabled,
        reactivationDraftsEnabled: input.reactivationDraftsEnabled,
        defaultChannel: input.defaultChannel,
        staleQuoteDays: input.staleQuoteDays,
        reactivationIdleDays: input.reactivationIdleDays,
        autoSendEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(sfiFollowupSettings.companyId, actor.companyId))
      .returning();

    if (!row) {
      throw new SalesFollowupIntelligenceError('UPDATE_FAILED', 'Unable to update settings.');
    }
    await this.recordAudit(actor, 'sfi_settings_updated', row.id, {
      autoSendEnabled: false,
    });
    return this.toSettings(row);
  }
}
