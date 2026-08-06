import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  buildC360InsightDraftSeeds,
  buildC360TimelineEvents,
  buildC360ValueSnapshot,
  C360_PRODUCT_COPY,
  canAccessCustomer360Intelligence,
  canViewCustomer360Finance,
  canViewCustomer360InternalNotes,
  canWriteCustomer360Intelligence,
  defaultC360Settings,
  listC360Connections,
  previewBody,
  type C360AuraInsightSummary,
  type C360CustomerView,
  type C360Dashboard,
  type C360InsightDraft,
  type C360Settings,
  type DecideC360InsightRequest,
  type RefreshC360InsightsRequest,
  type UpdateC360SettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetEquipment,
  c360AuraInsights,
  c360InsightDrafts,
  c360Settings,
  communications,
  customerActivities,
  customers,
  cxCustomerProperties,
  documents,
  invoices,
  jobs,
  opsRecurringMaintenancePlans,
  payments,
  quotes,
  securityAuditLogs,
} from '@titan/db';

export class Customer360IntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Customer360IntelligenceError';
  }
}

export type C360Actor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export class Customer360IntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertAccess(actor: C360Actor): void {
    if (!canAccessCustomer360Intelligence(actor)) {
      throw new Customer360IntelligenceError(
        'FORBIDDEN',
        'Customer 360 Intelligence requires authorized staff access. Technicians and clients cannot open the staff Customer 360 module.',
      );
    }
  }

  private assertWrite(actor: C360Actor): void {
    this.assertAccess(actor);
    if (!canWriteCustomer360Intelligence(actor)) {
      throw new Customer360IntelligenceError(
        'FORBIDDEN',
        'Write actions require customers:write or Owner/Admin access.',
      );
    }
  }

  private async recordAudit(
    actor: C360Actor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'customer_360_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        inventCustomers: false,
        autoSend: false,
        crossCustomerVisibility: false,
        rebuildsCrm: false,
      },
    });
  }

  private toSettings(row: typeof c360Settings.$inferSelect): C360Settings {
    return defaultC360Settings({
      id: row.id,
      insightsEnabled: row.insightsEnabled,
      timelineEnabled: row.timelineEnabled,
      recommendationDraftsEnabled: row.recommendationDraftsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private toInsight(
    row: typeof c360InsightDrafts.$inferSelect,
    customerName: string | null = null,
  ): C360InsightDraft {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      customerId: row.customerId,
      customerName,
      title: row.title,
      body: row.body,
      autoSend: false,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toAura(row: typeof c360AuraInsights.$inferSelect): C360AuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      customerId: row.customerId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async ensureSettings(actor: C360Actor): Promise<C360Settings> {
    const existing = await this.db.query.c360Settings.findFirst({
      where: eq(c360Settings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(c360Settings)
      .values({
        companyId: actor.companyId,
        insightsEnabled: true,
        timelineEnabled: true,
        recommendationDraftsEnabled: true,
        autoSendEnabled: false,
        inventCustomersEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async assertCustomerInTenant(
    actor: C360Actor,
    customerId: string,
  ): Promise<typeof customers.$inferSelect> {
    const row = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)),
    });
    if (!row) {
      throw new Customer360IntelligenceError(
        'NOT_FOUND',
        'Customer not found in this tenant — cross-customer access denied.',
      );
    }
    return row;
  }

  async getDashboard(actor: C360Actor): Promise<C360Dashboard> {
    this.assertAccess(actor);
    const settings = await this.ensureSettings(actor);

    const customerRows = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        status: customers.status,
      })
      .from(customers)
      .where(
        and(eq(customers.companyId, actor.companyId), isNull(customers.mergedIntoCustomerId)),
      )
      .orderBy(desc(customers.updatedAt))
      .limit(100);

    const customerIds = customerRows.map((c) => c.id);
    const jobCounts = new Map<string, { total: number; open: number }>();
    const lastActivity = new Map<string, string>();

    if (customerIds.length > 0) {
      const jobRows = await this.db
        .select({
          customerId: jobs.customerId,
          status: jobs.status,
        })
        .from(jobs)
        .where(and(eq(jobs.companyId, actor.companyId), inArray(jobs.customerId, customerIds)));

      for (const j of jobRows) {
        const cur = jobCounts.get(j.customerId) ?? { total: 0, open: 0 };
        cur.total += 1;
        if (j.status !== 'completed' && j.status !== 'cancelled') cur.open += 1;
        jobCounts.set(j.customerId, cur);
      }

      const activityRows = await this.db
        .select({
          customerId: customerActivities.customerId,
          createdAt: customerActivities.createdAt,
        })
        .from(customerActivities)
        .where(
          and(
            eq(customerActivities.companyId, actor.companyId),
            inArray(customerActivities.customerId, customerIds),
          ),
        )
        .orderBy(desc(customerActivities.createdAt))
        .limit(500);

      for (const a of activityRows) {
        if (!lastActivity.has(a.customerId)) {
          lastActivity.set(a.customerId, a.createdAt.toISOString());
        }
      }
    }

    const insightRows = await this.db
      .select()
      .from(c360InsightDrafts)
      .where(eq(c360InsightDrafts.companyId, actor.companyId))
      .orderBy(desc(c360InsightDrafts.createdAt))
      .limit(40);

    const nameById = new Map(customerRows.map((c) => [c.id, c.name]));
    const auraRows = await this.db
      .select()
      .from(c360AuraInsights)
      .where(eq(c360AuraInsights.companyId, actor.companyId))
      .orderBy(desc(c360AuraInsights.createdAt))
      .limit(20);

    return {
      summary:
        customerRows.length === 0
          ? 'No real CRM customers in this tenant yet — Customer 360 stays empty (not invented).'
          : `Customer 360 over ${customerRows.length} real CRM customer(s). Extends /crm — does not rebuild CRM.`,
      productClarification: { ...C360_PRODUCT_COPY },
      policy: {
        rebuildsCrm: false,
        inventCustomers: false,
        autoSend: false,
        crossCustomerVisibility: false,
        financeGated: true,
        technicianClientDenied: true,
      },
      customerCount: customerRows.length,
      customers: customerRows.map((c) => {
        const jc = jobCounts.get(c.id) ?? { total: 0, open: 0 };
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          status: c.status,
          jobCount: jc.total,
          openJobCount: jc.open,
          lastActivityAt: lastActivity.get(c.id) ?? null,
        };
      }),
      recentInsights: insightRows.map((r) =>
        this.toInsight(r, r.customerId ? (nameById.get(r.customerId) ?? null) : null),
      ),
      auraInsights: auraRows.map((r) => this.toAura(r)),
      connections: listC360Connections(),
      settings,
    };
  }

  async getCustomer360(actor: C360Actor, customerId: string): Promise<C360CustomerView> {
    this.assertAccess(actor);
    const customer = await this.assertCustomerInTenant(actor, customerId);
    const financeVisible = canViewCustomer360Finance(actor);
    const notesVisible = canViewCustomer360InternalNotes(actor);
    const settings = await this.ensureSettings(actor);

    const [
      propertyCountRow,
      activityRows,
      jobRows,
      quoteRows,
      invoiceRows,
      communicationRows,
      documentRows,
      planRows,
      insightRows,
    ] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(cxCustomerProperties)
        .where(
          and(
            eq(cxCustomerProperties.companyId, actor.companyId),
            eq(cxCustomerProperties.customerId, customerId),
          ),
        ),
      this.db
        .select()
        .from(customerActivities)
        .where(
          and(
            eq(customerActivities.companyId, actor.companyId),
            eq(customerActivities.customerId, customerId),
          ),
        )
        .orderBy(desc(customerActivities.createdAt))
        .limit(100),
      this.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.customerId, customerId)))
        .orderBy(desc(jobs.updatedAt))
        .limit(100),
      this.db
        .select()
        .from(quotes)
        .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.customerId, customerId)))
        .orderBy(desc(quotes.createdAt))
        .limit(100),
      this.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.customerId, customerId)))
        .orderBy(desc(invoices.createdAt))
        .limit(100),
      this.db
        .select()
        .from(communications)
        .where(
          and(
            eq(communications.companyId, actor.companyId),
            eq(communications.customerId, customerId),
          ),
        )
        .orderBy(desc(communications.occurredAt))
        .limit(100),
      this.db
        .select()
        .from(documents)
        .where(and(eq(documents.companyId, actor.companyId), eq(documents.customerId, customerId)))
        .orderBy(desc(documents.createdAt))
        .limit(100),
      this.db
        .select()
        .from(opsRecurringMaintenancePlans)
        .where(
          and(
            eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
            eq(opsRecurringMaintenancePlans.customerId, customerId),
          ),
        )
        .orderBy(desc(opsRecurringMaintenancePlans.updatedAt))
        .limit(100),
      this.db
        .select()
        .from(c360InsightDrafts)
        .where(
          and(
            eq(c360InsightDrafts.companyId, actor.companyId),
            eq(c360InsightDrafts.customerId, customerId),
          ),
        )
        .orderBy(desc(c360InsightDrafts.createdAt))
        .limit(40),
    ]);

    const invoiceIds = invoiceRows.map((i) => i.id);
    const paymentRows =
      invoiceIds.length === 0
        ? []
        : await this.db
            .select()
            .from(payments)
            .where(
              and(eq(payments.companyId, actor.companyId), inArray(payments.invoiceId, invoiceIds)),
            )
            .orderBy(desc(payments.paidAt))
            .limit(100);

    const assetIds = [...new Set(planRows.map((p) => p.assetId))];
    const assetRows =
      assetIds.length === 0
        ? []
        : await this.db
            .select()
            .from(assetEquipment)
            .where(
              and(
                eq(assetEquipment.companyId, actor.companyId),
                inArray(assetEquipment.id, assetIds),
              ),
            );
    const assetById = new Map(assetRows.map((a) => [a.id, a]));

    const jobsMapped = jobRows.map((j) => ({
      id: j.id,
      jobNumber: j.jobNumber,
      title: j.title,
      status: j.status,
      priority: j.priority,
      scheduledAt: j.scheduledAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }));

    const quotesMapped = quoteRows.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      title: q.title,
      status: q.status,
      totalCents: financeVisible ? q.totalCents : null,
      currency: financeVisible ? q.currency : null,
      financeHidden: !financeVisible,
      issuedAt: q.issuedAt?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
      // Never expose margin/profit/internal notes on quote summaries.
    }));

    const invoicesMapped = invoiceRows.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      title: inv.title,
      status: inv.status,
      totalCents: financeVisible ? inv.totalCents : null,
      amountPaidCents: financeVisible ? inv.amountPaidCents : null,
      currency: financeVisible ? inv.currency : null,
      financeHidden: !financeVisible,
      dueDate: inv.dueDate?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    }));

    const paymentsMapped = paymentRows.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amountCents: financeVisible ? p.amountCents : null,
      currency: financeVisible ? p.currency : null,
      method: p.method,
      financeHidden: !financeVisible,
      paidAt: p.paidAt.toISOString(),
      reference: p.reference,
    }));

    const communicationsMapped = communicationRows.map((c) => ({
      id: c.id,
      channel: c.channel,
      direction: c.direction,
      visibility: c.visibility,
      subject: c.subject,
      bodyPreview: previewBody(c.body),
      occurredAt: c.occurredAt.toISOString(),
      jobId: c.jobId,
    }));

    const documentsMapped = documentRows.map((d) => ({
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      jobId: d.jobId,
      createdAt: d.createdAt.toISOString(),
    }));

    const maintenanceMapped = planRows.map((p) => {
      const asset = assetById.get(p.assetId);
      return {
        planId: p.id,
        planName: p.name,
        status: p.status,
        nextDueAt: p.nextDueAt?.toISOString() ?? null,
        lastCompletedAt: p.lastCompletedAt?.toISOString() ?? null,
        assetId: p.assetId,
        assetName: asset?.name ?? null,
        intervalDays: p.intervalDays,
      };
    });

    const equipmentMapped = planRows
      .map((p) => {
        const asset = assetById.get(p.assetId);
        if (!asset) return null;
        return {
          id: asset.id,
          name: asset.name,
          assetType: asset.assetType,
          status: asset.status,
          serialNumber: asset.serialNumber,
          planId: p.id,
          planName: p.name,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const uniqueEquipment = [...new Map(equipmentMapped.map((e) => [e.id, e])).values()];

    const timeline = settings.timelineEnabled
      ? buildC360TimelineEvents({
          activities: activityRows.map((a) => ({
            id: a.id,
            content: a.content,
            createdAt: a.createdAt.toISOString(),
          })),
          jobs: jobsMapped,
          quotes: quotesMapped.map((q) => ({
            id: q.id,
            title: q.title,
            status: q.status,
            createdAt: q.createdAt,
            quoteNumber: q.quoteNumber,
          })),
          invoices: invoicesMapped.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            createdAt: i.createdAt,
            invoiceNumber: i.invoiceNumber,
          })),
          payments: paymentsMapped.map((p) => ({
            id: p.id,
            paidAt: p.paidAt,
            invoiceId: p.invoiceId,
            reference: p.reference,
          })),
          communications: communicationsMapped.map((c) => ({
            id: c.id,
            subject: c.subject,
            channel: c.channel,
            occurredAt: c.occurredAt,
          })),
          documents: documentsMapped,
          maintenance: maintenanceMapped,
        })
      : [];

    const completedJobCount = jobRows.filter((j) => j.status === 'completed').length;
    const totalPaidCents = paymentRows.reduce((sum, p) => sum + p.amountCents, 0);
    const outstandingCents = invoiceRows
      .filter((i) => i.status !== 'cancelled' && i.status !== 'paid')
      .reduce((sum, i) => sum + Math.max(0, i.totalCents - i.amountPaidCents), 0);

    const value = buildC360ValueSnapshot({
      jobCount: jobRows.length,
      completedJobCount,
      quoteCount: quoteRows.length,
      invoiceCount: invoiceRows.length,
      paymentCount: paymentRows.length,
      totalPaidCents,
      outstandingCents,
      financeHidden: !financeVisible,
    });

    return {
      profile: {
        id: customer.id,
        name: customer.name,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        isSupplierOnly: customer.isSupplierOnly,
        doNotContact: customer.doNotContact,
        notes: notesVisible ? customer.notes : null,
        notesHidden: !notesVisible,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        propertyCount: propertyCountRow[0]?.count ?? 0,
        activityCount: activityRows.length,
      },
      jobs: jobsMapped,
      quotes: quotesMapped,
      invoices: invoicesMapped,
      payments: paymentsMapped,
      communications: communicationsMapped,
      documents: documentsMapped,
      equipment: uniqueEquipment,
      maintenance: maintenanceMapped,
      timeline,
      value,
      insights: insightRows.map((r) => this.toInsight(r, customer.name)),
      policy: {
        rebuildsCrm: false,
        inventCustomers: false,
        autoSend: false,
        crossCustomerVisibility: false,
        financeGated: true,
        internalNotesGated: true,
      },
    };
  }

  async refreshInsightDrafts(
    actor: C360Actor,
    body: RefreshC360InsightsRequest = {},
  ): Promise<{ created: number; insights: C360InsightDraft[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightsEnabled || !settings.recommendationDraftsEnabled) {
      throw new Customer360IntelligenceError(
        'INVALID_STATE',
        'Insight drafts are disabled in Customer 360 settings.',
      );
    }

    let customerList: Array<typeof customers.$inferSelect>;
    if (body.customerId) {
      customerList = [await this.assertCustomerInTenant(actor, body.customerId)];
    } else {
      customerList = await this.db
        .select()
        .from(customers)
        .where(
          and(eq(customers.companyId, actor.companyId), isNull(customers.mergedIntoCustomerId)),
        )
        .orderBy(desc(customers.updatedAt))
        .limit(40);
    }

    const created: C360InsightDraft[] = [];
    const now = new Date();

    for (const customer of customerList) {
      const [jobRows, invoiceRows, commRows, planRows] = await Promise.all([
        this.db
          .select({ status: jobs.status, updatedAt: jobs.updatedAt })
          .from(jobs)
          .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.customerId, customer.id))),
        this.db
          .select({ status: invoices.status })
          .from(invoices)
          .where(
            and(eq(invoices.companyId, actor.companyId), eq(invoices.customerId, customer.id)),
          ),
        this.db
          .select({ occurredAt: communications.occurredAt })
          .from(communications)
          .where(
            and(
              eq(communications.companyId, actor.companyId),
              eq(communications.customerId, customer.id),
            ),
          )
          .orderBy(desc(communications.occurredAt))
          .limit(1),
        this.db
          .select({
            status: opsRecurringMaintenancePlans.status,
            nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
          })
          .from(opsRecurringMaintenancePlans)
          .where(
            and(
              eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
              eq(opsRecurringMaintenancePlans.customerId, customer.id),
            ),
          ),
      ]);

      const completedJobCount = jobRows.filter((j) => j.status === 'completed').length;
      const openJobCount = jobRows.filter(
        (j) => j.status !== 'completed' && j.status !== 'cancelled',
      ).length;
      const lastJob = jobRows
        .map((j) => j.updatedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const lastComm = commRows[0]?.occurredAt ?? null;
      const openMaintenancePlans = planRows.filter(
        (p) => p.status === 'active' || p.status === 'draft' || p.status === 'paused',
      ).length;
      const overdueMaintenancePlans = planRows.filter(
        (p) =>
          p.nextDueAt &&
          p.nextDueAt.getTime() < now.getTime() &&
          p.status !== 'archived',
      ).length;

      const seeds = buildC360InsightDraftSeeds({
        customerId: customer.id,
        customerName: customer.name,
        completedJobCount,
        openJobCount,
        openMaintenancePlans,
        overdueMaintenancePlans,
        daysSinceLastJob: lastJob ? daysBetween(lastJob, now) : null,
        daysSinceLastCommunication: lastComm ? daysBetween(lastComm, now) : null,
        unpaidInvoiceCount: invoiceRows.filter((i) =>
          ['sent', 'partial', 'overdue'].includes(i.status),
        ).length,
        doNotContact: customer.doNotContact,
      });

      for (const seed of seeds) {
        const existing = await this.db.query.c360InsightDrafts.findFirst({
          where: and(
            eq(c360InsightDrafts.companyId, actor.companyId),
            eq(c360InsightDrafts.customerId, customer.id),
            eq(c360InsightDrafts.kind, seed.kind),
            inArray(c360InsightDrafts.status, ['draft', 'pending_approval']),
          ),
        });
        if (existing) continue;

        const [row] = await this.db
          .insert(c360InsightDrafts)
          .values({
            companyId: actor.companyId,
            kind: seed.kind,
            status: 'pending_approval',
            customerId: seed.customerId,
            title: seed.title,
            body: seed.body,
            autoSend: false,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: { source: 'customer_360_refresh' },
          })
          .returning();

        created.push(this.toInsight(row, customer.name));
        await this.recordAudit(actor, 'c360_insight_draft_created', row.id, {
          kind: seed.kind,
          customerId: customer.id,
          autoSend: false,
        });
      }
    }

    return { created: created.length, insights: created };
  }

  async decideInsight(
    actor: C360Actor,
    insightId: string,
    body: DecideC360InsightRequest,
  ): Promise<C360InsightDraft> {
    this.assertWrite(actor);
    const row = await this.db.query.c360InsightDrafts.findFirst({
      where: and(
        eq(c360InsightDrafts.id, insightId),
        eq(c360InsightDrafts.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new Customer360IntelligenceError('NOT_FOUND', 'Insight draft not found in this tenant.');
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      acknowledge: 'acknowledged',
      cancel: 'cancelled',
    } as const;

    const [updated] = await this.db
      .update(c360InsightDrafts)
      .set({
        status: statusMap[body.decision],
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: body.notes ?? null,
        autoSend: false,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(c360InsightDrafts.id, insightId), eq(c360InsightDrafts.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, 'c360_insight_draft_decided', insightId, {
      decision: body.decision,
      autoSend: false,
      autoExecuted: false,
    });

    let customerName: string | null = null;
    if (updated.customerId) {
      const c = await this.db.query.customers.findFirst({
        where: and(
          eq(customers.id, updated.customerId),
          eq(customers.companyId, actor.companyId),
        ),
      });
      customerName = c?.name ?? null;
    }

    return this.toInsight(updated, customerName);
  }

  async updateSettings(actor: C360Actor, body: UpdateC360SettingsRequest): Promise<C360Settings> {
    this.assertWrite(actor);
    await this.ensureSettings(actor);
    const patch: Partial<typeof c360Settings.$inferInsert> = {
      autoSendEnabled: false,
      inventCustomersEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (body.insightsEnabled !== undefined) patch.insightsEnabled = body.insightsEnabled;
    if (body.timelineEnabled !== undefined) patch.timelineEnabled = body.timelineEnabled;
    if (body.recommendationDraftsEnabled !== undefined) {
      patch.recommendationDraftsEnabled = body.recommendationDraftsEnabled;
    }
    if (body.notes !== undefined) patch.notes = body.notes;

    const [updated] = await this.db
      .update(c360Settings)
      .set(patch)
      .where(eq(c360Settings.companyId, actor.companyId))
      .returning();

    if (!updated) {
      throw new Customer360IntelligenceError('NOT_FOUND', 'Settings not found for this tenant.');
    }

    await this.recordAudit(actor, 'c360_settings_updated', updated.id, {
      autoSendEnabled: false,
      inventCustomersEnabled: false,
    });

    return this.toSettings(updated);
  }
}
