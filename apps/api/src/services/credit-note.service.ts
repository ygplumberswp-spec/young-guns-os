import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateCreditNoteDraftRequest,
  CreditNoteLineItemInput,
  CreditNoteSummary,
  UpdateCreditNoteDraftRequest,
} from '@titan/shared';
import {
  isProviderWriteAuthorized,
  resolveEffectiveInvoiceOutstandingCents,
  resolveEffectiveInvoiceTotalCents,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  creditNoteLineItems,
  creditNotes,
  invoices,
  securityAuditLogs,
} from '@titan/db';
import type { FinanceActor } from './finance.service.js';

export class CreditNoteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CreditNoteError';
  }
}

function computeLineTotals(line: CreditNoteLineItemInput) {
  const quantity = line.quantity ?? 1;
  const subtotal = Math.round(quantity * line.unitPriceCents);
  const vatRateBps = line.vatRateBps ?? 1500;
  const vat = Math.round((subtotal * vatRateBps) / 10000);
  return { subtotal, vat, total: subtotal + vat, quantity, vatRateBps };
}

function toSummary(
  row: typeof creditNotes.$inferSelect & {
    invoice: {
      displayNumber: string;
      customer?: { name: string } | null;
    };
    lineItems: Array<typeof creditNoteLineItems.$inferSelect>;
  },
): CreditNoteSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    invoiceId: row.invoiceId,
    invoiceDisplayNumber: row.invoice.displayNumber,
    customerId: row.customerId,
    customerName: row.invoice.customer?.name ?? 'Customer',
    jobId: row.jobId,
    status: row.status,
    reason: row.reason,
    subtotalCents: row.subtotalCents,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    invoiceBalancePreviewCents: row.invoiceBalancePreviewCents,
    providerReference: row.providerReference,
    xeroWriteApprovalId: row.xeroWriteApprovalId,
    errorState: row.errorState ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lineItems: row.lineItems.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      quantity: Number(line.quantity),
      unitPriceCents: line.unitPriceCents,
      vatRateBps: line.vatRateBps,
      lineSubtotalCents: line.lineSubtotalCents,
      lineVatCents: line.lineVatCents,
      lineTotalCents: line.lineTotalCents,
    })),
  };
}

export class CreditNoteService {
  constructor(private readonly db: DatabaseClient) {}

  async listForInvoice(companyId: string, invoiceId: string): Promise<CreditNoteSummary[]> {
    const rows = await this.db.query.creditNotes.findMany({
      where: and(eq(creditNotes.companyId, companyId), eq(creditNotes.invoiceId, invoiceId)),
      orderBy: [desc(creditNotes.createdAt)],
      with: {
        lineItems: true,
        invoice: { with: { customer: true } },
      },
    });

    return rows.map((row) =>
      toSummary({
        ...row,
        invoice: {
          displayNumber:
            row.invoice.xeroInvoiceNumber?.trim() ||
            row.invoice.internalNumber?.trim() ||
            row.invoice.invoiceNumber,
          customer: row.invoice.customer,
        },
      }),
    );
  }

  async getCreditNote(companyId: string, creditNoteId: string): Promise<CreditNoteSummary | null> {
    const row = await this.db.query.creditNotes.findFirst({
      where: and(eq(creditNotes.id, creditNoteId), eq(creditNotes.companyId, companyId)),
      with: {
        lineItems: true,
        invoice: { with: { customer: true } },
      },
    });
    if (!row) return null;
    return toSummary({
      ...row,
      invoice: {
        displayNumber:
          row.invoice.xeroInvoiceNumber?.trim() ||
          row.invoice.internalNumber?.trim() ||
          row.invoice.invoiceNumber,
        customer: row.invoice.customer,
      },
    });
  }

  async createDraft(
    actor: FinanceActor,
    invoiceId: string,
    input: CreateCreditNoteDraftRequest,
  ): Promise<CreditNoteSummary> {
    if (!actor.canWrite) {
      throw new CreditNoteError('FORBIDDEN', 'Finance write permission required');
    }

    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, actor.companyId)),
    });
    if (!invoice) throw new CreditNoteError('NOT_FOUND', 'Invoice not found');

    const existing = await this.db.query.creditNotes.findFirst({
      where: and(
        eq(creditNotes.companyId, actor.companyId),
        eq(creditNotes.idempotencyKey, input.clientActionId),
      ),
    });
    if (existing) {
      return (await this.getCreditNote(actor.companyId, existing.id))!;
    }

    const totals = this.sumLines(input.lineItems);
    const outstanding = resolveEffectiveInvoiceOutstandingCents({
      amountCents: invoice.amountCents,
      totalCents: resolveEffectiveInvoiceTotalCents(invoice),
      amountPaidCents: invoice.amountPaidCents,
    });

    if (totals.total > outstanding) {
      throw new CreditNoteError('VALIDATION_ERROR', 'Credit amount exceeds invoice outstanding balance');
    }

    const [created] = await this.db
      .insert(creditNotes)
      .values({
        companyId: actor.companyId,
        invoiceId,
        customerId: invoice.customerId,
        jobId: invoice.jobId,
        status: 'draft',
        reason: input.reason.trim(),
        subtotalCents: totals.subtotal,
        vatCents: totals.vat,
        totalCents: totals.total,
        invoiceBalancePreviewCents: Math.max(outstanding - totals.total, 0),
        idempotencyKey: input.clientActionId,
        createdByUserId: actor.userId ?? null,
      })
      .returning();

    if (!created) throw new CreditNoteError('CREATE_FAILED', 'Unable to create credit note draft');

    await this.insertLines(created.id, actor.companyId, input.lineItems);
    await this.audit(actor, 'credit_note_draft_created', created.id, { invoiceId });

    return (await this.getCreditNote(actor.companyId, created.id))!;
  }

  async updateDraft(
    actor: FinanceActor,
    creditNoteId: string,
    input: UpdateCreditNoteDraftRequest,
  ): Promise<CreditNoteSummary> {
    if (!actor.canWrite) {
      throw new CreditNoteError('FORBIDDEN', 'Finance write permission required');
    }

    const current = await this.db.query.creditNotes.findFirst({
      where: and(eq(creditNotes.id, creditNoteId), eq(creditNotes.companyId, actor.companyId)),
      with: { invoice: true },
    });
    if (!current) throw new CreditNoteError('NOT_FOUND', 'Credit note not found');
    if (current.status !== 'draft') {
      throw new CreditNoteError('INVALID_STATE', 'Only draft credit notes can be edited');
    }

    const lineItems = input.lineItems ?? null;
    const totals = lineItems ? this.sumLines(lineItems) : null;
    if (totals) {
      const outstanding = resolveEffectiveInvoiceOutstandingCents({
        amountCents: current.invoice.amountCents,
        totalCents: resolveEffectiveInvoiceTotalCents(current.invoice),
        amountPaidCents: current.invoice.amountPaidCents,
      });
      if (totals.total > outstanding) {
        throw new CreditNoteError('VALIDATION_ERROR', 'Credit amount exceeds invoice outstanding balance');
      }
    }

    await this.db
      .update(creditNotes)
      .set({
        reason: input.reason?.trim() || current.reason,
        ...(totals && {
          subtotalCents: totals.subtotal,
          vatCents: totals.vat,
          totalCents: totals.total,
          invoiceBalancePreviewCents: Math.max(
            resolveEffectiveInvoiceOutstandingCents({
              amountCents: current.invoice.amountCents,
              totalCents: resolveEffectiveInvoiceTotalCents(current.invoice),
              amountPaidCents: current.invoice.amountPaidCents,
            }) - totals.total,
            0,
          ),
        }),
        updatedAt: new Date(),
      })
      .where(eq(creditNotes.id, creditNoteId));

    if (lineItems) {
      await this.db.delete(creditNoteLineItems).where(eq(creditNoteLineItems.creditNoteId, creditNoteId));
      await this.insertLines(creditNoteId, actor.companyId, lineItems);
    }

    await this.audit(actor, 'credit_note_draft_updated', creditNoteId, {});
    return (await this.getCreditNote(actor.companyId, creditNoteId))!;
  }

  async linkFromWriteApproval(
    companyId: string,
    approvalId: string,
    invoiceId: string,
    input: {
      reason: string;
      lineItems: CreditNoteLineItemInput[];
      creditAmountCents: number;
      requestedByUserId?: string | null;
    },
  ): Promise<string> {
    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
    });
    if (!invoice) throw new CreditNoteError('NOT_FOUND', 'Invoice not found');

    const totals = input.lineItems.length
      ? this.sumLines(input.lineItems)
      : {
          subtotal: input.creditAmountCents,
          vat: 0,
          total: input.creditAmountCents,
        };

    const outstanding = resolveEffectiveInvoiceOutstandingCents({
      amountCents: invoice.amountCents,
      totalCents: resolveEffectiveInvoiceTotalCents(invoice),
      amountPaidCents: invoice.amountPaidCents,
    });

    const [created] = await this.db
      .insert(creditNotes)
      .values({
        companyId,
        invoiceId,
        customerId: invoice.customerId,
        jobId: invoice.jobId,
        status: isProviderWriteAuthorized() ? 'approved' : 'approved_awaiting_provider_write',
        reason: input.reason,
        subtotalCents: totals.subtotal,
        vatCents: totals.vat,
        totalCents: totals.total,
        invoiceBalancePreviewCents: Math.max(outstanding - totals.total, 0),
        xeroWriteApprovalId: approvalId,
        idempotencyKey: `approval:${approvalId}`,
        createdByUserId: input.requestedByUserId ?? null,
        metadata: {
          providerGated: !isProviderWriteAuthorized(),
          message: 'Owner approval + provider authorization required before Xero write',
        },
      })
      .returning();

    if (!created) throw new CreditNoteError('CREATE_FAILED', 'Unable to create credit note from approval');

    if (input.lineItems.length) {
      await this.insertLines(created.id, companyId, input.lineItems);
    } else {
      await this.db.insert(creditNoteLineItems).values({
        companyId,
        creditNoteId: created.id,
        position: 0,
        description: input.reason,
        quantity: '1',
        unitPriceCents: input.creditAmountCents,
        lineSubtotalCents: input.creditAmountCents,
        lineTotalCents: input.creditAmountCents,
      });
    }

    return created.id;
  }

  async markExecuted(companyId: string, creditNoteId: string, providerReference?: string | null) {
    await this.db
      .update(creditNotes)
      .set({
        status: 'executed',
        providerReference: providerReference ?? null,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(creditNotes.id, creditNoteId), eq(creditNotes.companyId, companyId)));
  }

  private sumLines(lineItems: CreditNoteLineItemInput[]) {
    return lineItems.reduce(
      (acc, line) => {
        const computed = computeLineTotals(line);
        return {
          subtotal: acc.subtotal + computed.subtotal,
          vat: acc.vat + computed.vat,
          total: acc.total + computed.total,
        };
      },
      { subtotal: 0, vat: 0, total: 0 },
    );
  }

  private async insertLines(
    creditNoteId: string,
    companyId: string,
    lineItems: CreditNoteLineItemInput[],
  ) {
    for (const [index, line] of lineItems.entries()) {
      const computed = computeLineTotals(line);
      await this.db.insert(creditNoteLineItems).values({
        companyId,
        creditNoteId,
        position: index,
        description: line.description.trim(),
        quantity: String(computed.quantity),
        unitPriceCents: line.unitPriceCents,
        vatRateBps: computed.vatRateBps,
        lineSubtotalCents: computed.subtotal,
        lineVatCents: computed.vat,
        lineTotalCents: computed.total,
      });
    }
  }

  private async audit(
    actor: FinanceActor,
    action: string,
    creditNoteId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'credit_note',
      entityId: creditNoteId,
      userId: actor.userId ?? null,
      metadata,
    });
  }
}

export function mapCreditNoteError(res: import('express').Response, error: unknown) {
  if (error instanceof CreditNoteError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}
