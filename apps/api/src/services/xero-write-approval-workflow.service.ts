import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  buildXeroWriteIdempotencyKey,
  summarizeXeroWriteApprovalMetadata,
  type XeroWriteApprovalQueueItem,
  type XeroWriteApprovalStatus,
  type XeroWriteConflictResolution,
  type XeroWriteOperation,
} from '@titan/shared';
import { isCompanyOwnerRole as isOwnerRole } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  invoices,
  jobs,
  payments,
  securityAuditLogs,
  xeroCustomerMappings,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroWriteApprovals,
} from '@titan/db';
import {
  XeroWriteApprovalGate,
  XeroWriteApprovalGateError,
} from './xero-write-approval-gate.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import { XeroSyncError } from './xero-sync.service.js';
import { XeroError } from '../lib/xero.client.js';

export class XeroWriteApprovalWorkflowError extends Error {
  constructor(
    public readonly code:
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'CONFLICT'
      | 'PROVIDER'
      | 'AUTH'
      | 'ALREADY_EXECUTED'
      | 'WRITE_NOT_APPROVED'
      | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'XeroWriteApprovalWorkflowError';
  }
}

export type StaffActor = {
  userId: string;
  companyId: string;
  roleName: string;
  permissions: string[];
};

const REQUESTABLE_OPS: XeroWriteOperation[] = [
  'invoice_create',
  'payment_create',
  'contact_update',
];

function canRequestWrite(actor: StaffActor): boolean {
  return (
    actor.permissions.includes('finance:write') ||
    actor.permissions.includes('integrations:manage') ||
    actor.permissions.includes('*') ||
    isOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })
  );
}

function assertOwner(actor: StaffActor): void {
  if (!isOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })) {
    throw new XeroWriteApprovalWorkflowError(
      'FORBIDDEN',
      'Only Company Owner may approve, reject, or execute Xero writes',
    );
  }
}

function toQueueItem(
  row: typeof xeroWriteApprovals.$inferSelect,
): XeroWriteApprovalQueueItem {
  const summary = summarizeXeroWriteApprovalMetadata(row.metadata);
  return {
    id: row.id,
    companyId: row.companyId,
    entityType: row.entityType,
    entityId: row.entityId,
    writeOperation: row.writeOperation as XeroWriteOperation,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    actionType: row.writeOperation as XeroWriteOperation,
    targetLabel: summary.targetLabel,
    amountCents: summary.amountCents,
    currency: summary.currency,
    requesterUserId: summary.requesterUserId,
    approvedByUserId: row.approvedByUserId,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
    metadata: row.metadata ?? {},
  };
}

export class XeroWriteApprovalWorkflowService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly gate: XeroWriteApprovalGate,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  async listApprovals(
    actor: StaffActor,
    options?: { status?: XeroWriteApprovalStatus | XeroWriteApprovalStatus[] },
  ): Promise<XeroWriteApprovalQueueItem[]> {
    if (!canRequestWrite(actor) && !actor.permissions.includes('integrations:read')) {
      throw new XeroWriteApprovalWorkflowError('FORBIDDEN', 'Not permitted to view Xero write queue');
    }

    const statuses = options?.status
      ? Array.isArray(options.status)
        ? options.status
        : [options.status]
      : undefined;

    const rows = await this.db.query.xeroWriteApprovals.findMany({
      where: statuses
        ? and(
            eq(xeroWriteApprovals.companyId, actor.companyId),
            inArray(xeroWriteApprovals.status, statuses),
          )
        : eq(xeroWriteApprovals.companyId, actor.companyId),
      orderBy: [desc(xeroWriteApprovals.createdAt)],
      limit: 100,
    });

    return rows.map(toQueueItem);
  }

  async getApproval(actor: StaffActor, approvalId: string): Promise<XeroWriteApprovalQueueItem> {
    const row = await this.requireApproval(actor.companyId, approvalId);
    return toQueueItem(row);
  }

  /**
   * Draft a write request (pending). No Xero API calls.
   * Office Staff with finance:write / integrations:manage may request; Owner may also request.
   */
  async requestApproval(
    actor: StaffActor,
    input: {
      writeOperation: XeroWriteOperation;
      entityId: string;
      payloadVersion?: string;
      notes?: string;
    },
  ): Promise<XeroWriteApprovalQueueItem> {
    if (!canRequestWrite(actor)) {
      throw new XeroWriteApprovalWorkflowError(
        'FORBIDDEN',
        'Technicians and customers cannot request Xero writes',
      );
    }

    if (!REQUESTABLE_OPS.includes(input.writeOperation)) {
      throw new XeroWriteApprovalWorkflowError(
        'VALIDATION',
        `Unsupported write operation: ${input.writeOperation}`,
      );
    }

    const prepared = await this.prepareEntityMetadata(
      actor.companyId,
      input.writeOperation,
      input.entityId,
    );

    const idempotencyKey = buildXeroWriteIdempotencyKey({
      companyId: actor.companyId,
      operation: input.writeOperation,
      entityId: input.entityId,
      payloadVersion: input.payloadVersion ?? prepared.payloadVersion,
    });

    const existing = await this.db.query.xeroWriteApprovals.findFirst({
      where: and(
        eq(xeroWriteApprovals.companyId, actor.companyId),
        eq(xeroWriteApprovals.idempotencyKey, idempotencyKey),
      ),
    });

    if (existing) {
      if (existing.status === 'executed') {
        throw new XeroWriteApprovalWorkflowError(
          'ALREADY_EXECUTED',
          'This Xero write was already executed — create a new payload version to retry',
        );
      }
      if (existing.status === 'approved' || existing.status === 'pending') {
        return toQueueItem(existing);
      }
      // rejected/expired — allow re-open as pending
      const [updated] = await this.db
        .update(xeroWriteApprovals)
        .set({
          status: 'pending',
          approvedByUserId: null,
          approvedAt: null,
          executedAt: null,
          metadata: {
            ...prepared.metadata,
            requesterUserId: actor.userId,
            requesterRole: actor.roleName,
            notes: input.notes ?? null,
            requestedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(xeroWriteApprovals.id, existing.id))
        .returning();

      await this.audit(actor, 'xero_write_approval_requested', updated!.id, {
        writeOperation: input.writeOperation,
        entityId: input.entityId,
        reopened: true,
      });

      return toQueueItem(updated!);
    }

    const [created] = await this.db
      .insert(xeroWriteApprovals)
      .values({
        companyId: actor.companyId,
        entityType: prepared.entityType,
        entityId: input.entityId,
        writeOperation: input.writeOperation,
        status: 'pending',
        idempotencyKey,
        metadata: {
          ...prepared.metadata,
          requesterUserId: actor.userId,
          requesterRole: actor.roleName,
          notes: input.notes ?? null,
          requestedAt: new Date().toISOString(),
        },
      })
      .returning();

    await this.audit(actor, 'xero_write_approval_requested', created!.id, {
      writeOperation: input.writeOperation,
      entityId: input.entityId,
    });

    return toQueueItem(created!);
  }

  async approve(actor: StaffActor, approvalId: string): Promise<XeroWriteApprovalQueueItem> {
    assertOwner(actor);
    const row = await this.requireApproval(actor.companyId, approvalId);

    if (row.status === 'executed') {
      throw new XeroWriteApprovalWorkflowError('ALREADY_EXECUTED', 'Approval already executed');
    }
    if (row.status === 'rejected' || row.status === 'expired') {
      throw new XeroWriteApprovalWorkflowError(
        'INVALID_STATE',
        `Cannot approve a ${row.status} request — request again`,
      );
    }
    if (row.status === 'approved') {
      return toQueueItem(row);
    }

    const [updated] = await this.db
      .update(xeroWriteApprovals)
      .set({
        status: 'approved',
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(xeroWriteApprovals.id, row.id))
      .returning();

    await this.audit(actor, 'xero_write_approval_approved', updated!.id, {
      writeOperation: updated!.writeOperation,
      entityId: updated!.entityId,
    });

    return toQueueItem(updated!);
  }

  async reject(
    actor: StaffActor,
    approvalId: string,
    reason?: string,
  ): Promise<XeroWriteApprovalQueueItem> {
    assertOwner(actor);
    const row = await this.requireApproval(actor.companyId, approvalId);

    if (row.status === 'executed') {
      throw new XeroWriteApprovalWorkflowError(
        'ALREADY_EXECUTED',
        'Cannot reject an executed write',
      );
    }

    const [updated] = await this.db
      .update(xeroWriteApprovals)
      .set({
        status: 'rejected',
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        metadata: {
          ...(row.metadata ?? {}),
          rejectReason: reason ?? null,
          rejectedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(xeroWriteApprovals.id, row.id))
      .returning();

    await this.audit(actor, 'xero_write_approval_rejected', updated!.id, {
      writeOperation: updated!.writeOperation,
      reason: reason ?? null,
    });

    return toQueueItem(updated!);
  }

  async cancel(actor: StaffActor, approvalId: string): Promise<XeroWriteApprovalQueueItem> {
    const row = await this.requireApproval(actor.companyId, approvalId);
    const isOwner = isOwnerRole({ roleName: actor.roleName, permissions: actor.permissions });
    const requesterId =
      typeof row.metadata?.requesterUserId === 'string' ? row.metadata.requesterUserId : null;

    if (!isOwner && requesterId !== actor.userId) {
      throw new XeroWriteApprovalWorkflowError(
        'FORBIDDEN',
        'Only the requester or Owner may cancel a pending Xero write request',
      );
    }

    if (row.status !== 'pending' && row.status !== 'approved') {
      throw new XeroWriteApprovalWorkflowError(
        'INVALID_STATE',
        `Cannot cancel a ${row.status} request`,
      );
    }

    const [updated] = await this.db
      .update(xeroWriteApprovals)
      .set({
        status: 'expired',
        metadata: {
          ...(row.metadata ?? {}),
          cancelledAt: new Date().toISOString(),
          cancelledByUserId: actor.userId,
        },
        updatedAt: new Date(),
      })
      .where(eq(xeroWriteApprovals.id, row.id))
      .returning();

    await this.audit(actor, 'xero_write_approval_cancelled', updated!.id, {
      writeOperation: updated!.writeOperation,
    });

    return toQueueItem(updated!);
  }

  /**
   * Owner-only execute. Performs the Xero write for a single approved row.
   * Idempotent: ALREADY_EXECUTED returns prior result without a second provider write.
   */
  async execute(
    actor: StaffActor,
    approvalId: string,
  ): Promise<{
    approval: XeroWriteApprovalQueueItem;
    result: Record<string, unknown>;
  }> {
    assertOwner(actor);
    const row = await this.requireApproval(actor.companyId, approvalId);

    if (row.status === 'executed') {
      return {
        approval: toQueueItem(row),
        result: {
          idempotent: true,
          code: 'ALREADY_EXECUTED',
          ...(typeof row.metadata?.executionResult === 'object'
            ? (row.metadata.executionResult as Record<string, unknown>)
            : {}),
        },
      };
    }

    if (row.status !== 'approved') {
      throw new XeroWriteApprovalWorkflowError(
        'WRITE_NOT_APPROVED',
        `Xero write blocked: approval status is ${row.status}`,
      );
    }

    // Re-assert gate (pending→approved only)
    try {
      await this.gate.assertWriteApproved({
        companyId: actor.companyId,
        entityType: row.entityType,
        entityId: row.entityId,
        operation: row.writeOperation as XeroWriteOperation,
        payloadVersion:
          typeof row.metadata?.payloadVersion === 'string'
            ? row.metadata.payloadVersion
            : undefined,
      });
    } catch (error) {
      if (error instanceof XeroWriteApprovalGateError) {
        throw new XeroWriteApprovalWorkflowError(
          error.code === 'ALREADY_EXECUTED' ? 'ALREADY_EXECUTED' : 'WRITE_NOT_APPROVED',
          error.message,
        );
      }
      throw error;
    }

    let executionResult: Record<string, unknown>;

    try {
      switch (row.writeOperation as XeroWriteOperation) {
        case 'invoice_create':
          executionResult = await this.xeroSyncService.executeApprovedInvoicePush({
            companyId: actor.companyId,
            invoiceId: row.entityId,
            approvalId: row.id,
            actorUserId: actor.userId,
          });
          break;
        case 'payment_create':
          executionResult = await this.xeroSyncService.executeApprovedPaymentPush({
            companyId: actor.companyId,
            paymentId: row.entityId,
            approvalId: row.id,
            actorUserId: actor.userId,
          });
          break;
        case 'contact_update':
          executionResult = await this.xeroSyncService.executeApprovedContactPush({
            companyId: actor.companyId,
            customerId: row.entityId,
            approvalId: row.id,
            actorUserId: actor.userId,
          });
          break;
        default:
          throw new XeroWriteApprovalWorkflowError(
            'VALIDATION',
            `Execute not supported for ${row.writeOperation}`,
          );
      }
    } catch (error) {
      throw this.mapProviderError(error);
    }

    await this.gate.markExecuted(actor.companyId, row.id);

    const [updated] = await this.db
      .update(xeroWriteApprovals)
      .set({
        metadata: {
          ...(row.metadata ?? {}),
          executionResult,
          executedByUserId: actor.userId,
        },
        updatedAt: new Date(),
      })
      .where(eq(xeroWriteApprovals.id, row.id))
      .returning();

    await this.audit(actor, 'xero_write_approval_executed', row.id, {
      writeOperation: row.writeOperation,
      entityId: row.entityId,
      executionResult,
    });

    return { approval: toQueueItem(updated!), result: executionResult };
  }

  async resolveConflict(
    actor: StaffActor,
    input: {
      entityType: 'invoice' | 'contact' | 'payment';
      entityId: string;
      resolution: XeroWriteConflictResolution;
    },
  ): Promise<{ cleared: boolean; resolution: XeroWriteConflictResolution }> {
    assertOwner(actor);

    if (input.entityType === 'invoice') {
      const mapping = await this.db.query.xeroInvoiceMappings.findFirst({
        where: and(
          eq(xeroInvoiceMappings.companyId, actor.companyId),
          eq(xeroInvoiceMappings.invoiceId, input.entityId),
        ),
      });
      if (!mapping?.conflictMetadata) {
        throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'No invoice conflict to resolve');
      }
      if (input.resolution === 'accept_remote') {
        const remote = (mapping.conflictMetadata as { remoteSnapshot?: Record<string, unknown> })
          .remoteSnapshot;
        if (remote?.invoiceNumber) {
          await this.db
            .update(invoices)
            .set({
              xeroInvoiceNumber: String(remote.invoiceNumber),
              numberAuthority: 'xero',
              updatedAt: new Date(),
            })
            .where(and(eq(invoices.id, input.entityId), eq(invoices.companyId, actor.companyId)));
          await this.db
            .update(xeroInvoiceMappings)
            .set({
              xeroInvoiceNumber: String(remote.invoiceNumber),
              conflictMetadata: null,
              syncStatus: 'synced',
              updatedAt: new Date(),
            })
            .where(eq(xeroInvoiceMappings.id, mapping.id));
        } else {
          await this.db
            .update(xeroInvoiceMappings)
            .set({ conflictMetadata: null, updatedAt: new Date() })
            .where(eq(xeroInvoiceMappings.id, mapping.id));
        }
      } else {
        // keep_local / dismiss — clear conflict; never silent overwrite remote
        await this.db
          .update(xeroInvoiceMappings)
          .set({
            conflictMetadata: null,
            syncStatus: input.resolution === 'keep_local' ? 'out_of_sync' : mapping.syncStatus,
            updatedAt: new Date(),
          })
          .where(eq(xeroInvoiceMappings.id, mapping.id));
      }
    } else if (input.entityType === 'contact') {
      const mapping = await this.db.query.xeroCustomerMappings.findFirst({
        where: and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, input.entityId),
        ),
      });
      if (!mapping?.conflictMetadata) {
        throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'No contact conflict to resolve');
      }
      await this.db
        .update(xeroCustomerMappings)
        .set({
          conflictMetadata: null,
          syncStatus: input.resolution === 'keep_local' ? 'out_of_sync' : 'synced',
          updatedAt: new Date(),
        })
        .where(eq(xeroCustomerMappings.id, mapping.id));
    } else {
      const mapping = await this.db.query.xeroPaymentMappings.findFirst({
        where: and(
          eq(xeroPaymentMappings.companyId, actor.companyId),
          eq(xeroPaymentMappings.paymentId, input.entityId),
        ),
      });
      if (!mapping?.conflictMetadata) {
        throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'No payment conflict to resolve');
      }
      await this.db
        .update(xeroPaymentMappings)
        .set({
          conflictMetadata: null,
          syncStatus: input.resolution === 'keep_local' ? 'out_of_sync' : 'synced',
          updatedAt: new Date(),
        })
        .where(eq(xeroPaymentMappings.id, mapping.id));
    }

    await this.audit(actor, 'xero_write_conflict_resolved', input.entityId, {
      entityType: input.entityType,
      resolution: input.resolution,
    });

    return { cleared: true, resolution: input.resolution };
  }

  private async requireApproval(companyId: string, approvalId: string) {
    const row = await this.db.query.xeroWriteApprovals.findFirst({
      where: and(
        eq(xeroWriteApprovals.companyId, companyId),
        eq(xeroWriteApprovals.id, approvalId),
      ),
    });
    if (!row) {
      throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'Xero write approval not found');
    }
    return row;
  }

  private async prepareEntityMetadata(
    companyId: string,
    operation: XeroWriteOperation,
    entityId: string,
  ): Promise<{ entityType: string; payloadVersion: string; metadata: Record<string, unknown> }> {
    if (operation === 'invoice_create') {
      const invoice = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, companyId), eq(invoices.id, entityId)),
      });
      if (!invoice) {
        throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'Invoice not found in tenant');
      }
      const customer = await this.db.query.customers.findFirst({
        where: and(eq(customers.companyId, companyId), eq(customers.id, invoice.customerId)),
      });
      let jobNumber: string | null = null;
      if (invoice.jobId) {
        const job = await this.db.query.jobs.findFirst({
          where: and(eq(jobs.companyId, companyId), eq(jobs.id, invoice.jobId)),
        });
        jobNumber = job?.jobNumber ?? null;
      }
      const payloadVersion = `inv:${invoice.updatedAt.toISOString()}:${invoice.amountCents}`;
      return {
        entityType: 'invoice',
        payloadVersion,
        metadata: {
          payloadVersion,
          targetLabel: invoice.invoiceNumber,
          invoiceNumber: invoice.invoiceNumber,
          amountCents: invoice.amountCents,
          vatCents: invoice.vatCents,
          currency: invoice.currency,
          customerName: customer?.name ?? null,
          jobNumber,
          actionLabel: 'Push invoice to Xero',
        },
      };
    }

    if (operation === 'payment_create') {
      const payment = await this.db.query.payments.findFirst({
        where: and(eq(payments.companyId, companyId), eq(payments.id, entityId)),
      });
      if (!payment) {
        throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'Payment not found in tenant');
      }
      const invoice = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, companyId), eq(invoices.id, payment.invoiceId)),
      });
      if (!invoice) {
        throw new XeroWriteApprovalWorkflowError('VALIDATION', 'Payment invoice linkage missing');
      }
      const payloadVersion = `pay:${payment.id}:${payment.amountCents}`;
      return {
        entityType: 'payment',
        payloadVersion,
        metadata: {
          payloadVersion,
          targetLabel: payment.reference ?? invoice.invoiceNumber,
          amountCents: payment.amountCents,
          currency: payment.currency,
          invoiceId: payment.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          actionLabel: 'Push payment to Xero',
        },
      };
    }

    // contact_update
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.companyId, companyId), eq(customers.id, entityId)),
    });
    if (!customer) {
      throw new XeroWriteApprovalWorkflowError('NOT_FOUND', 'Customer not found in tenant');
    }
    const payloadVersion = `cus:${customer.updatedAt.toISOString()}`;
    return {
      entityType: 'contact',
      payloadVersion,
      metadata: {
        payloadVersion,
        targetLabel: customer.name,
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone,
        actionLabel: 'Push contact update to Xero',
      },
    };
  }

  private mapProviderError(error: unknown): XeroWriteApprovalWorkflowError {
    if (error instanceof XeroWriteApprovalWorkflowError) {
      return error;
    }
    if (error instanceof XeroWriteApprovalGateError) {
      return new XeroWriteApprovalWorkflowError(
        error.code === 'ALREADY_EXECUTED' ? 'ALREADY_EXECUTED' : 'WRITE_NOT_APPROVED',
        error.message,
      );
    }
    if (error instanceof XeroSyncError) {
      if (error.code === 'WRITE_NOT_APPROVED') {
        return new XeroWriteApprovalWorkflowError('WRITE_NOT_APPROVED', error.message);
      }
      if (error.code === 'RECONNECT_REQUIRED' || error.code === 'NOT_CONNECTED') {
        return new XeroWriteApprovalWorkflowError('AUTH', error.message);
      }
      return new XeroWriteApprovalWorkflowError('PROVIDER', error.message);
    }
    if (error instanceof XeroError) {
      if (error.code === 'AUTH_FAILED') {
        return new XeroWriteApprovalWorkflowError('AUTH', error.message);
      }
      return new XeroWriteApprovalWorkflowError('PROVIDER', error.message);
    }
    return new XeroWriteApprovalWorkflowError(
      'PROVIDER',
      error instanceof Error ? error.message : 'Xero write failed',
    );
  }

  private async audit(
    actor: StaffActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      userId: actor.userId,
      category: 'integrations',
      action,
      entityType: 'xero_write_approval',
      entityId,
      metadata,
    });
  }
}
