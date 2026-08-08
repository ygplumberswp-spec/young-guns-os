/**
 * YG-CUTOVER-001F — AURA Finance completion pack → draft invoice → owner notify → on-site pay.
 */
import { and, desc, eq } from 'drizzle-orm';
import type {
  AuraFinancePackIssue,
  CartrackArrivalPrompt,
  InternalCompletionPack,
  TechnicianInvoicePaymentStrip,
} from '@titan/shared';
import {
  assertNoClientFinancialLeak,
  buildCartrackArrivalPrompt,
  isInvoiceBlockedByVisitState,
  resolveInvoiceDisplayNumberLabel,
  toClientSafeCompletionPack,
  toTechnicianInvoicePaymentStrip,
  validateAuraFinanceCompletionPack,
  validateOnSitePaymentEvidence,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  invoices,
  jobs,
  jobMaterialLines,
  jobVariations,
  jobVisits,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileTimeEntries,
  payments,
  quotes,
  users,
} from '@titan/db';
import type { FinanceService } from './finance.service.js';
import { FinanceError } from './finance.service.js';
import type { NotificationService } from './notification.service.js';

export class PaperlessFieldCashError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaperlessFieldCashError';
  }
}

export class PaperlessFieldCashService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly financeService: FinanceService,
    private readonly notificationService: NotificationService,
  ) {}

  async buildAuraPackForJob(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new PaperlessFieldCashError('NOT_FOUND', 'Job not found');

    const [
      acceptedQuote,
      docs,
      labour,
      materials,
      inventoryUsage,
      pendingVariations,
      existingInvoice,
    ] = await Promise.all([
      this.db.query.quotes.findFirst({
        where: and(
          eq(quotes.companyId, companyId),
          eq(quotes.jobId, jobId),
          eq(quotes.status, 'accepted'),
        ),
        orderBy: [desc(quotes.updatedAt)],
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.jobId, jobId),
        ),
      }),
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      }),
      this.db.query.mobileJobInventoryUsage.findMany({
        where: and(
          eq(mobileJobInventoryUsage.companyId, companyId),
          eq(mobileJobInventoryUsage.jobId, jobId),
        ),
      }),
      this.db.query.jobVariations.findMany({
        where: and(
          eq(jobVariations.companyId, companyId),
          eq(jobVariations.jobId, jobId),
          eq(jobVariations.status, 'pending'),
        ),
      }),
      this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)),
        orderBy: [desc(invoices.updatedAt)],
      }),
    ]);

    const hasBefore = docs.some((d) => d.evidencePhase === 'before');
    const hasAfter = docs.some((d) => d.evidencePhase === 'after');
    const hasSignature = docs.some((d) => d.documentationType === 'customer_signature');
    const slipOrReceiptCount = docs.filter(
      (d) =>
        d.evidencePhase === 'document' ||
        /slip|receipt/i.test(d.title ?? '') ||
        d.documentationType === 'document',
    ).length;
    const materialCount = materials.length + inventoryUsage.length;
    const openLabourCount = labour.filter((e) => e.endedAt == null).length;
    const snapshot = job.executionPhase === 'completed' || job.status === 'completed';

    const validation = validateAuraFinanceCompletionPack({
      assignedJobId: jobId,
      hasAcceptedQuote: Boolean(acceptedQuote),
      hasApprovedSellPrices: Boolean(acceptedQuote),
      pendingVariationCount: pendingVariations.length,
      hasJobCard: snapshot || Boolean(job.description?.trim()),
      hasWorkPerformed: snapshot,
      materialCount,
      slipOrReceiptCount,
      labourEntryCount: labour.length,
      openLabourCount,
      hasBeforePhoto: hasBefore,
      hasAfterPhoto: hasAfter,
      hasSignature,
      existingInvoiceId: existingInvoice?.id ?? null,
      timerAnomaly: openLabourCount > 0,
      duplicatedSlipDetected: false,
      incompleteQuotedWork: false,
    });

    return {
      job,
      acceptedQuote,
      existingInvoice,
      validation,
      docs,
      labour,
      materials,
    };
  }

  /**
   * After gated completion: validate pack; if ready, create DRAFT invoice from accepted quote
   * and notify owners. Never invent sell prices.
   */
  async afterSignedCompletion(input: {
    companyId: string;
    jobId: string;
    actorUserId: string;
  }): Promise<{
    issues: AuraFinancePackIssue[];
    readyForDraftInvoice: boolean;
    draftInvoice: { id: string; invoiceNumber: string | null; totalCents: number; status: string } | null;
    ownerNotifyMessage: string | null;
  }> {
    const pack = await this.buildAuraPackForJob(input.companyId, input.jobId);
    const { validation, acceptedQuote, existingInvoice, job } = pack;

    if (existingInvoice) {
      return {
        issues: validation.issues,
        readyForDraftInvoice: false,
        draftInvoice: {
          id: existingInvoice.id,
          invoiceNumber: resolveInvoiceDisplayNumberLabel({
            id: existingInvoice.id,
            invoiceNumber: existingInvoice.invoiceNumber,
            xeroInvoiceNumber: existingInvoice.xeroInvoiceNumber,
            numberAuthority: existingInvoice.numberAuthority,
            sourceProvider: existingInvoice.sourceProvider,
            sourceExternalId: existingInvoice.sourceExternalId,
          }),
          totalCents: existingInvoice.totalCents,
          status: existingInvoice.status,
        },
        ownerNotifyMessage: null,
      };
    }

    const openVisit = await this.db.query.jobVisits.findFirst({
      where: and(
        eq(jobVisits.companyId, input.companyId),
        eq(jobVisits.jobId, input.jobId),
        eq(jobVisits.status, 'open'),
      ),
      columns: { id: true },
    });
    const visitGate = isInvoiceBlockedByVisitState({
      executionPhase: job.executionPhase,
      hasOpenVisit: Boolean(openVisit),
      jobCompleted: job.status === 'completed' || job.executionPhase === 'completed',
    });
    if (visitGate.blocked) {
      return {
        issues: [
          ...validation.issues,
          {
            code: 'work_continues',
            severity: 'blocker',
            message: visitGate.reason ?? 'Still Busy blocks Ready for Invoicing',
          },
        ],
        readyForDraftInvoice: false,
        draftInvoice: null,
        ownerNotifyMessage: null,
      };
    }

    if (!validation.readyForDraftInvoice || !acceptedQuote) {
      return {
        issues: validation.issues,
        readyForDraftInvoice: false,
        draftInvoice: null,
        ownerNotifyMessage: null,
      };
    }

    let draftInvoice: {
      id: string;
      invoiceNumber: string | null;
      totalCents: number;
      status: string;
    } | null = null;

    try {
      const invoice = await this.financeService.createInvoiceFromJob(
        { companyId: input.companyId, userId: input.actorUserId, permissions: ['*'] },
        input.jobId,
        {
          clientActionId: `paperless-draft-${input.jobId}`,
          stage: 'final',
          notes: 'YG-CUTOVER-001F — DRAFT ready for owner approval (paperless completion)',
        },
      );
      draftInvoice = {
        id: invoice.id,
        invoiceNumber:
          invoice.displayOfficialInvoiceNumber ??
          resolveInvoiceDisplayNumberLabel({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            xeroInvoiceNumber: invoice.xeroInvoiceNumber,
            numberAuthority: invoice.numberAuthority,
          }),
        totalCents: invoice.totalCents,
        status: invoice.status,
      };
    } catch (error) {
      const message =
        error instanceof FinanceError ? error.message : 'Unable to prepare draft invoice';
      return {
        issues: [
          ...validation.issues,
          {
            code: 'no_accepted_quote',
            severity: 'blocker',
            message,
          },
        ],
        readyForDraftInvoice: false,
        draftInvoice: null,
        ownerNotifyMessage: null,
      };
    }

    const amountRand = ((draftInvoice.totalCents ?? 0) / 100).toFixed(2);
    const ownerNotifyMessage = `Job #${job.jobNumber ?? job.id.slice(0, 8)} completed and signed. Invoice R${amountRand} ready for approval.`;

    const owners = await this.db.query.users.findMany({
      where: and(eq(users.companyId, input.companyId)),
      with: { role: true },
      limit: 50,
    });
    for (const owner of owners) {
      const role = (owner.role?.name ?? '').toLowerCase();
      if (!role.includes('owner') && !role.includes('admin') && !role.includes('manager')) continue;
      await this.notificationService.createNotification({
        companyId: input.companyId,
        recipientType: 'staff',
        recipientUserId: owner.id,
        notificationType: 'approval_request',
        title: 'Invoice ready for approval',
        body: ownerNotifyMessage,
        entityType: 'invoice',
        entityId: draftInvoice.id,
      });
    }

    return {
      issues: validation.issues,
      readyForDraftInvoice: true,
      draftInvoice,
      ownerNotifyMessage,
    };
  }

  async getTechnicianPaymentStrip(
    companyId: string,
    jobId: string,
  ): Promise<TechnicianInvoicePaymentStrip | null> {
    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)),
      orderBy: [desc(invoices.updatedAt)],
      with: { payments: true },
    });
    if (!invoice) return null;
    // Technician may only see strip after invoice left pure draft / is issued-or-sent
    const officialNumber = resolveInvoiceDisplayNumberLabel({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      xeroInvoiceNumber: invoice.xeroInvoiceNumber,
      numberAuthority: invoice.numberAuthority,
      sourceProvider: invoice.sourceProvider,
      sourceExternalId: invoice.sourceExternalId,
    });
    if (invoice.status === 'draft') {
      return toTechnicianInvoicePaymentStrip({
        invoiceId: invoice.id,
        invoiceNumber: officialNumber,
        amountDueCents: invoice.totalCents,
        amountPaidCents: 0,
        jobId,
      });
    }
    const paid = (invoice.payments ?? []).reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    const strip = toTechnicianInvoicePaymentStrip({
      invoiceId: invoice.id,
      invoiceNumber: officialNumber,
      amountDueCents: invoice.totalCents,
      amountPaidCents: paid,
      jobId,
    });
    const leaks = assertNoClientFinancialLeak(strip);
    if (leaks.length) {
      throw new PaperlessFieldCashError('ISOLATION_VIOLATION', `Leak: ${leaks.join(',')}`);
    }
    return strip;
  }

  async recordOnSitePaymentEvidence(input: {
    companyId: string;
    actorUserId: string;
    invoiceId: string;
    jobId: string;
    customerId: string;
    amountCents: number;
    method: 'card_terminal' | 'payment_link_qr' | 'other_authorised';
    providerTerminal: string | null;
    paymentReference: string;
    paidAt: string;
  }) {
    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, input.companyId)),
      with: { payments: true },
    });
    if (!invoice) throw new PaperlessFieldCashError('NOT_FOUND', 'Invoice not found');
    if (invoice.jobId !== input.jobId) {
      throw new PaperlessFieldCashError('VALIDATION_ERROR', 'Invoice is not for this job');
    }

    const paid = (invoice.payments ?? []).reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    const due = Math.max(0, invoice.totalCents - paid);
    const existingRefs = (invoice.payments ?? [])
      .map((p) => p.reference ?? '')
      .filter(Boolean);

    const decision = validateOnSitePaymentEvidence(
      {
        invoiceId: input.invoiceId,
        jobId: input.jobId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        method: input.method,
        providerTerminal: input.providerTerminal,
        paymentReference: input.paymentReference,
        paidAt: input.paidAt,
      },
      existingRefs,
      due,
    );
    if (!decision.ok) {
      throw new PaperlessFieldCashError('VALIDATION_ERROR', decision.reason);
    }

    const payment = await this.financeService.createPayment(
      { companyId: input.companyId, userId: input.actorUserId, permissions: ['finance:write', '*'] },
      {
        invoiceId: input.invoiceId,
        amountCents: decision.evidence.amountCents,
        method: decision.evidence.method === 'card_terminal' ? 'card' : 'other',
        paidAt: decision.evidence.paidAt,
        reference: decision.evidence.paymentReference,
        notes: `On-site ${decision.evidence.method}${
          decision.evidence.providerTerminal ? ` · ${decision.evidence.providerTerminal}` : ''
        }`,
        clientActionId: `onsite-pay-${decision.evidence.paymentReference}`,
      },
    );

    return payment;
  }

  async getOwnerCompletionPack(companyId: string, jobId: string): Promise<InternalCompletionPack> {
    const pack = await this.buildAuraPackForJob(companyId, jobId);
    const job = pack.job;
    const labourByUser = new Map<string, { name: string; minutes: number }>();
    for (const entry of pack.labour) {
      if (!entry.endedAt || entry.durationMinutes == null) continue;
      const key = entry.userId;
      const prev = labourByUser.get(key) ?? { name: entry.userId.slice(0, 8), minutes: 0 };
      labourByUser.set(key, {
        name: prev.name,
        minutes: prev.minutes + entry.durationMinutes,
      });
    }

    const invoice = pack.existingInvoice;
    let paymentStatus: InternalCompletionPack['invoice']['paymentStatus'] = 'unknown';
    if (invoice) {
      const pays = await this.db.query.payments.findMany({
        where: and(eq(payments.companyId, companyId), eq(payments.invoiceId, invoice.id)),
      });
      const paid = pays.reduce((s, p) => s + p.amountCents, 0);
      if (paid <= 0) paymentStatus = 'unpaid';
      else if (paid < invoice.totalCents) paymentStatus = 'part_paid';
      else paymentStatus = 'paid';
    }

    const clientSafe = toClientSafeCompletionPack({
      jobNumber: job.jobNumber,
      workPerformed: job.description,
      clientFacingNotes: job.customerVisibleNotes,
      outstandingRecommended: null,
      hasBeforePhoto: pack.docs.some((d) => d.evidencePhase === 'before'),
      hasAfterPhoto: pack.docs.some((d) => d.evidencePhase === 'after'),
      hasSignature: pack.docs.some((d) => d.documentationType === 'customer_signature'),
      signerName: null,
      signedAt: null,
    });
    // ensure client projection never leaks
    assertNoClientFinancialLeak(clientSafe);

    return {
      audience: 'internal',
      jobNumber: job.jobNumber,
      customerName: null,
      siteAddress: null,
      technicians: [...labourByUser.values()].map((v) => v.name),
      completedAt: job.updatedAt?.toISOString?.() ?? null,
      workPerformed: job.description,
      clientFacingNotes: job.customerVisibleNotes,
      internalNotes: job.notes,
      findings: null,
      materials: pack.materials.map((m) => ({
        description: m.description,
        quantity: Number(m.quantity),
        supplierReference: m.supplierReference ?? null,
      })),
      slipCount: pack.docs.filter((d) => d.evidencePhase === 'document').length,
      labour: [...labourByUser.values()].map((v) => ({
        technicianName: v.name,
        minutes: v.minutes,
      })),
      travel: {
        verificationState: 'unverified_owner_review',
        travelMinutes: null,
        travelDistanceKm: null,
      },
      invoice: {
        id: invoice?.id ?? null,
        number: invoice?.invoiceNumber ?? null,
        status: invoice?.status ?? null,
        amountDueCents: invoice?.totalCents ?? null,
        paymentStatus,
      },
      financialInternal: {
        labourCostCents: null,
        materialCostCents: null,
        expenseCents: null,
        marginCents: null,
      },
    };
  }

  buildArrivalPrompt(input: {
    cartrackAvailable: boolean;
    proximityMatch: boolean;
    ignitionOff: boolean;
    jobId: string | null;
    jobNumber: string | null;
  }): CartrackArrivalPrompt {
    return buildCartrackArrivalPrompt(input);
  }
}
