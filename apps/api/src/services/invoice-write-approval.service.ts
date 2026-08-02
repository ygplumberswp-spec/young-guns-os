import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateInvoiceWriteApprovalRequest,
  ExecuteInvoiceWriteApprovalResult,
  InvoiceWriteApprovalOperation,
  InvoiceWriteApprovalSummary,
} from '@titan/shared';
import {
  CREDIT_NOTE_ELIGIBLE_INVOICE_STATUSES,
  describeInvoiceWriteExpectedEffect,
  isProviderWriteAuthorized,
  resolveEffectiveInvoiceOutstandingCents,
  resolveEffectiveInvoiceTotalCents,
  VOID_ELIGIBLE_INVOICE_STATUSES,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { invoices, securityAuditLogs, xeroWriteApprovals } from '@titan/db';
import { FinanceError, type FinanceActor } from './finance.service.js';
import {
  XeroWriteApprovalGate,
  XeroWriteApprovalGateError,
} from './xero-write-approval-gate.service.js';

export class InvoiceWriteApprovalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvoiceWriteApprovalError';
  }
}

type InvoiceWriteApprovalActor = FinanceActor & {
  userId: string;
  roleName?: string | null;
};

function isCompanyOwner(actor: InvoiceWriteApprovalActor): boolean {
  return actor.permissions?.includes('*') === true || actor.roleName === 'Company Owner';
}

function toSummary(
  approval: typeof xeroWriteApprovals.$inferSelect,
  invoice: {
    displayInvoiceNumber: string;
    title: string;
    status: string;
    totalCents: number;
    outstandingCents: number;
  },
): InvoiceWriteApprovalSummary {
  const metadata = (approval.metadata ?? {}) as Record<string, unknown>;
  const providerWriteBlocked = metadata.providerWriteBlocked === true;
  const executionStatus =
    approval.status === 'approved' && providerWriteBlocked
      ? 'approved_awaiting_provider_write'
      : approval.status;

  return {
    id: approval.id,
    companyId: approval.companyId,
    entityType: 'invoice',
    entityId: approval.entityId,
    operation: approval.writeOperation as InvoiceWriteApprovalOperation,
    status: executionStatus as InvoiceWriteApprovalSummary['status'],
    idempotencyKey: approval.idempotencyKey,
    reason: String(metadata.reason ?? ''),
    requestedByUserId: (metadata.requestedByUserId as string | undefined) ?? null,
    requestedAt: String(metadata.requestedAt ?? approval.createdAt.toISOString()),
    approvedByUserId: approval.approvedByUserId,
    approvedAt: approval.approvedAt?.toISOString() ?? null,
    executedAt: approval.executedAt?.toISOString() ?? null,
    invoiceDisplayNumber: invoice.displayInvoiceNumber,
    invoiceTitle: invoice.title,
    invoiceStatus: invoice.status,
    invoiceTotalCents: invoice.totalCents,
    invoiceOutstandingCents: invoice.outstandingCents,
    expectedEffect: String(
      metadata.expectedEffect ??
        describeInvoiceWriteExpectedEffect(approval.writeOperation as InvoiceWriteApprovalOperation, {
          displayNumber: invoice.displayInvoiceNumber,
          outstandingCents: invoice.outstandingCents,
          creditAmountCents: metadata.creditAmountCents as number | undefined,
        }),
    ),
    providerWriteBlocked,
    providerWriteMessage: (metadata.providerWriteMessage as string | undefined) ?? null,
    metadata,
    createdAt: approval.createdAt.toISOString(),
    updatedAt: approval.updatedAt.toISOString(),
  };
}

export class InvoiceWriteApprovalService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly writeApprovalGate: XeroWriteApprovalGate,
  ) {}

  async listPending(companyId: string): Promise<InvoiceWriteApprovalSummary[]> {
    const rows = await this.db.query.xeroWriteApprovals.findMany({
      where: and(
        eq(xeroWriteApprovals.companyId, companyId),
        eq(xeroWriteApprovals.status, 'pending'),
      ),
      orderBy: [desc(xeroWriteApprovals.createdAt)],
    });

    const summaries: InvoiceWriteApprovalSummary[] = [];
    for (const row of rows) {
      if (row.entityType !== 'invoice') continue;
      const invoice = await this.loadInvoiceContext(companyId, row.entityId);
      if (!invoice) continue;
      summaries.push(toSummary(row, invoice));
    }
    return summaries;
  }

  async getApproval(companyId: string, approvalId: string): Promise<InvoiceWriteApprovalSummary | null> {
    const approval = await this.writeApprovalGate.findById(companyId, approvalId);
    if (!approval || approval.entityType !== 'invoice') return null;
    const invoice = await this.loadInvoiceContext(companyId, approval.entityId);
    if (!invoice) return null;
    return toSummary(approval, invoice);
  }

  async createRequest(
    actor: InvoiceWriteApprovalActor,
    invoiceId: string,
    input: CreateInvoiceWriteApprovalRequest,
  ): Promise<InvoiceWriteApprovalSummary> {
    if (!actor.canWrite) {
      throw new InvoiceWriteApprovalError('FORBIDDEN', 'Finance write permission required');
    }

    const reason = input.reason.trim();
    if (reason.length < 3) {
      throw new InvoiceWriteApprovalError('VALIDATION_ERROR', 'Reason is required (minimum 3 characters)');
    }

    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, actor.companyId)),
    });

    if (!invoice) {
      throw new InvoiceWriteApprovalError('NOT_FOUND', 'Invoice not found');
    }

    const outstandingCents = resolveEffectiveInvoiceOutstandingCents({
      amountCents: invoice.amountCents,
      totalCents: resolveEffectiveInvoiceTotalCents(invoice),
      amountPaidCents: invoice.amountPaidCents,
    });

    const displayNumber =
      invoice.xeroInvoiceNumber?.trim() || invoice.internalNumber?.trim() || invoice.invoiceNumber;

    if (input.operation === 'invoice_void') {
      this.assertVoidEligible(invoice.status);
    } else {
      this.assertCreditNoteEligible(invoice.status, input, outstandingCents, invoice.totalCents);
    }

    const creditAmountCents =
      input.operation === 'credit_note_create'
        ? (input.creditAmountCents ??
          input.lineItems?.reduce(
            (sum, line) => sum + Math.round((line.quantity ?? 1) * line.unitPriceCents),
            0,
          ) ??
          outstandingCents)
        : undefined;

    const expectedEffect = describeInvoiceWriteExpectedEffect(input.operation, {
      displayNumber,
      outstandingCents,
      creditAmountCents,
    });

    const payloadVersion = input.clientActionId.trim();
    const { approvalId } = await this.writeApprovalGate.createPendingRequest({
      companyId: actor.companyId,
      entityType: 'invoice',
      entityId: invoiceId,
      operation: input.operation,
      requestedByUserId: actor.userId,
      payloadVersion,
      metadata: {
        reason,
        clientActionId: payloadVersion,
        operation: input.operation,
        expectedEffect,
        invoiceSnapshot: {
          id: invoice.id,
          displayNumber,
          status: invoice.status,
          totalCents: invoice.totalCents,
          outstandingCents,
        },
        creditAmountCents,
        lineItems: input.lineItems ?? [],
        requestedByUserId: actor.userId,
        requestedAt: new Date().toISOString(),
      },
    });

    await this.recordAudit(actor, 'invoice_write_approval_requested', approvalId, {
      invoiceId,
      operation: input.operation,
      reason,
    });

    return (await this.getApproval(actor.companyId, approvalId))!;
  }

  async approveRequest(
    actor: InvoiceWriteApprovalActor,
    approvalId: string,
  ): Promise<InvoiceWriteApprovalSummary> {
    if (!isCompanyOwner(actor)) {
      throw new InvoiceWriteApprovalError(
        'FORBIDDEN',
        'Only Company Owner may approve Xero write requests',
      );
    }

    const approval = await this.writeApprovalGate.findById(actor.companyId, approvalId);
    if (!approval) {
      throw new InvoiceWriteApprovalError('NOT_FOUND', 'Approval not found');
    }

    await this.writeApprovalGate.approvePendingRequest({
      companyId: actor.companyId,
      approvalId,
      approvedByUserId: actor.userId,
      metadata: {
        ...(approval.metadata as Record<string, unknown>),
        approvedAt: new Date().toISOString(),
      },
    });

    await this.recordAudit(actor, 'invoice_write_approval_approved', approvalId, {
      invoiceId: approval.entityId,
      operation: approval.writeOperation,
    });

    return (await this.getApproval(actor.companyId, approvalId))!;
  }

  async rejectRequest(
    actor: InvoiceWriteApprovalActor,
    approvalId: string,
    reason?: string,
  ): Promise<InvoiceWriteApprovalSummary> {
    if (!isCompanyOwner(actor)) {
      throw new InvoiceWriteApprovalError(
        'FORBIDDEN',
        'Only Company Owner may reject Xero write requests',
      );
    }

    const approval = await this.writeApprovalGate.findById(actor.companyId, approvalId);
    if (!approval) {
      throw new InvoiceWriteApprovalError('NOT_FOUND', 'Approval not found');
    }

    await this.writeApprovalGate.rejectPendingRequest({
      companyId: actor.companyId,
      approvalId,
      rejectedByUserId: actor.userId,
      reason,
    });

    await this.recordAudit(actor, 'invoice_write_approval_rejected', approvalId, {
      invoiceId: approval.entityId,
      operation: approval.writeOperation,
      reason,
    });

    return (await this.getApproval(actor.companyId, approvalId))!;
  }

  async executeRequest(
    actor: InvoiceWriteApprovalActor,
    approvalId: string,
    clientActionId: string,
  ): Promise<ExecuteInvoiceWriteApprovalResult> {
    if (!isCompanyOwner(actor)) {
      throw new InvoiceWriteApprovalError(
        'FORBIDDEN',
        'Only Company Owner may execute Xero write requests',
      );
    }

    const approval = await this.writeApprovalGate.findById(actor.companyId, approvalId);
    if (!approval) {
      throw new InvoiceWriteApprovalError('NOT_FOUND', 'Approval not found');
    }

    if (approval.status === 'executed') {
      const summary = (await this.getApproval(actor.companyId, approvalId))!;
      return {
        approval: summary,
        executionStatus: 'executed',
        providerWriteBlocked: false,
        message: 'Already executed (idempotent retry)',
        invoiceUpdated: false,
      };
    }

    if (approval.status !== 'approved') {
      throw new InvoiceWriteApprovalError(
        'INVALID_STATE',
        `Approval must be approved before execution (current: ${approval.status})`,
      );
    }

    const metadata = (approval.metadata ?? {}) as Record<string, unknown>;
    if (metadata.providerWriteBlocked === true && metadata.executionAttemptClientActionId === clientActionId) {
      const summary = (await this.getApproval(actor.companyId, approvalId))!;
      return {
        approval: summary,
        executionStatus: 'approved_awaiting_provider_write',
        providerWriteBlocked: true,
        message: String(
          metadata.providerWriteMessage ??
            'Approved — awaiting explicit Xero provider write authorization. No invoice modified.',
        ),
        invoiceUpdated: false,
      };
    }

    await this.writeApprovalGate.assertWriteApproved({
      companyId: actor.companyId,
      entityType: approval.entityType,
      entityId: approval.entityId,
      operation: approval.writeOperation as InvoiceWriteApprovalOperation,
      payloadVersion: metadata.clientActionId as string | undefined,
    });

    const providerAuthorized = isProviderWriteAuthorized();
    if (!providerAuthorized) {
      const blockedMessage =
        'Approved — awaiting explicit Xero provider write authorization (TITAN_XERO_PROVIDER_WRITES_AUTHORIZED). No Xero write or silent invoice edit performed.';

      await this.db
        .update(xeroWriteApprovals)
        .set({
          metadata: {
            ...metadata,
            providerWriteBlocked: true,
            providerWriteMessage: blockedMessage,
            executionAttemptClientActionId: clientActionId,
            lastExecutionAttemptAt: new Date().toISOString(),
            lastExecutionAttemptByUserId: actor.userId,
          },
          updatedAt: new Date(),
        })
        .where(eq(xeroWriteApprovals.id, approvalId));

      await this.recordAudit(actor, 'invoice_write_execution_blocked', approvalId, {
        invoiceId: approval.entityId,
        operation: approval.writeOperation,
        providerWriteBlocked: true,
      });

      const summary = (await this.getApproval(actor.companyId, approvalId))!;
      return {
        approval: summary,
        executionStatus: 'approved_awaiting_provider_write',
        providerWriteBlocked: true,
        message: blockedMessage,
        invoiceUpdated: false,
      };
    }

    // Provider writes explicitly authorized — still no live Xero call in this pass.
    // Local state update only after labeled simulation boundary.
    const invoiceUpdated = await this.applyLocalExecution(actor.companyId, approval);

    await this.writeApprovalGate.markExecuted(actor.companyId, approvalId);
    await this.db
      .update(xeroWriteApprovals)
      .set({
        metadata: {
          ...metadata,
          providerWriteBlocked: false,
          executionClientActionId: clientActionId,
          executedByUserId: actor.userId,
          localSimulationOnly: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(xeroWriteApprovals.id, approvalId));

    await this.recordAudit(actor, 'invoice_write_executed', approvalId, {
      invoiceId: approval.entityId,
      operation: approval.writeOperation,
      localSimulationOnly: true,
    });

    const summary = (await this.getApproval(actor.companyId, approvalId))!;
    return {
      approval: summary,
      executionStatus: 'executed',
      providerWriteBlocked: false,
      message: 'Executed locally (simulation — Xero write path not invoked in staging clearance pass)',
      invoiceUpdated,
    };
  }

  private async applyLocalExecution(
    companyId: string,
    approval: typeof xeroWriteApprovals.$inferSelect,
  ): Promise<boolean> {
    const metadata = (approval.metadata ?? {}) as Record<string, unknown>;
    const reason = String(metadata.reason ?? '');

    if (approval.writeOperation === 'invoice_void') {
      await this.db
        .update(invoices)
        .set({
          status: 'cancelled',
          cancelReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, approval.entityId), eq(invoices.companyId, companyId)));
      return true;
    }

    // Credit note: record intent only — no credit note entity table yet (stub boundary).
    return false;
  }

  private assertVoidEligible(status: string): void {
    if (!VOID_ELIGIBLE_INVOICE_STATUSES.includes(status as (typeof VOID_ELIGIBLE_INVOICE_STATUSES)[number])) {
      if (status === 'draft') {
        throw new InvoiceWriteApprovalError(
          'VALIDATION_ERROR',
          'Draft invoices should be edited or deleted — void applies to issued invoices only',
        );
      }
      if (status === 'cancelled') {
        throw new InvoiceWriteApprovalError('ALREADY_VOID', 'Invoice is already voided/cancelled');
      }
      throw new InvoiceWriteApprovalError(
        'VALIDATION_ERROR',
        `Invoice status "${status}" is not eligible for void`,
      );
    }
  }

  private assertCreditNoteEligible(
    status: string,
    input: CreateInvoiceWriteApprovalRequest,
    outstandingCents: number,
    totalCents: number,
  ): void {
    if (
      !CREDIT_NOTE_ELIGIBLE_INVOICE_STATUSES.includes(
        status as (typeof CREDIT_NOTE_ELIGIBLE_INVOICE_STATUSES)[number],
      )
    ) {
      throw new InvoiceWriteApprovalError(
        'VALIDATION_ERROR',
        'Credit notes apply to issued invoices with an outstanding or credited balance',
      );
    }

    const creditAmount =
      input.creditAmountCents ??
      input.lineItems?.reduce(
        (sum, line) => sum + Math.round((line.quantity ?? 1) * line.unitPriceCents),
        0,
      ) ??
      outstandingCents;

    if (creditAmount <= 0) {
      throw new InvoiceWriteApprovalError('VALIDATION_ERROR', 'Credit amount must be greater than zero');
    }

    if (creditAmount > totalCents) {
      throw new InvoiceWriteApprovalError(
        'VALIDATION_ERROR',
        'Credit amount cannot exceed invoice total (over-credit blocked)',
      );
    }

    if (creditAmount > outstandingCents && outstandingCents > 0) {
      throw new InvoiceWriteApprovalError(
        'VALIDATION_ERROR',
        'Credit amount cannot exceed outstanding balance',
      );
    }
  }

  private async loadInvoiceContext(companyId: string, invoiceId: string) {
    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
    });
    if (!invoice) return null;

    const displayInvoiceNumber =
      invoice.xeroInvoiceNumber?.trim() || invoice.internalNumber?.trim() || invoice.invoiceNumber;
    const totalCents = resolveEffectiveInvoiceTotalCents(invoice);
    const outstandingCents = resolveEffectiveInvoiceOutstandingCents({
      amountCents: invoice.amountCents,
      totalCents,
      amountPaidCents: invoice.amountPaidCents,
    });

    return {
      displayInvoiceNumber,
      title: invoice.title,
      status: invoice.status,
      totalCents,
      outstandingCents,
    };
  }

  private async recordAudit(
    actor: InvoiceWriteApprovalActor,
    action: string,
    approvalId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'xero_write_approval',
      entityId: approvalId,
      userId: actor.userId,
      metadata,
    });
  }
}

export function mapInvoiceWriteApprovalError(error: unknown): FinanceError | InvoiceWriteApprovalError {
  if (error instanceof InvoiceWriteApprovalError || error instanceof FinanceError) {
    return error;
  }
  if (error instanceof XeroWriteApprovalGateError) {
    return new InvoiceWriteApprovalError(error.code, error.message);
  }
  throw error;
}
