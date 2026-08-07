import { and, eq } from 'drizzle-orm';
import type { XeroWriteOperation } from '@titan/shared';
import { buildXeroWriteIdempotencyKey } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { xeroWriteApprovals } from '@titan/db';

export class XeroWriteApprovalGateError extends Error {
  constructor(
    public readonly code: 'WRITE_NOT_APPROVED' | 'APPROVAL_EXPIRED' | 'ALREADY_EXECUTED',
    message: string,
  ) {
    super(message);
    this.name = 'XeroWriteApprovalGateError';
  }
}

export type XeroWriteApprovalAssertInput = {
  companyId: string;
  entityType: string;
  entityId: string;
  operation: XeroWriteOperation;
  payloadVersion?: string;
  /** When true (tests only), bypass gate — never set in production paths. */
  mockApproved?: boolean;
};

export class XeroWriteApprovalGate {
  constructor(private readonly db: DatabaseClient) {}

  buildIdempotencyKey(input: Omit<XeroWriteApprovalAssertInput, 'mockApproved'>): string {
    return buildXeroWriteIdempotencyKey({
      companyId: input.companyId,
      operation: input.operation,
      entityId: input.entityId,
      payloadVersion: input.payloadVersion,
    });
  }

  async assertWriteApproved(input: XeroWriteApprovalAssertInput): Promise<{
    approvalId: string;
    idempotencyKey: string;
  }> {
    if (input.mockApproved) {
      return {
        approvalId: 'mock-approval',
        idempotencyKey: this.buildIdempotencyKey(input),
      };
    }

    const idempotencyKey = this.buildIdempotencyKey(input);
    const approval = await this.db.query.xeroWriteApprovals.findFirst({
      where: and(
        eq(xeroWriteApprovals.companyId, input.companyId),
        eq(xeroWriteApprovals.idempotencyKey, idempotencyKey),
      ),
    });

    if (!approval) {
      throw new XeroWriteApprovalGateError(
        'WRITE_NOT_APPROVED',
        `Xero write blocked: no approval for ${input.operation} on ${input.entityType}:${input.entityId}`,
      );
    }

    if (approval.status === 'executed') {
      throw new XeroWriteApprovalGateError(
        'ALREADY_EXECUTED',
        `Xero write already executed for idempotency key ${idempotencyKey}`,
      );
    }

    if (approval.status === 'rejected' || approval.status === 'expired') {
      throw new XeroWriteApprovalGateError(
        'APPROVAL_EXPIRED',
        `Xero write approval is ${approval.status} for ${input.operation}`,
      );
    }

    if (approval.status !== 'approved') {
      throw new XeroWriteApprovalGateError(
        'WRITE_NOT_APPROVED',
        `Xero write blocked: approval status is ${approval.status}`,
      );
    }

    return { approvalId: approval.id, idempotencyKey };
  }

  async recordApproval(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    operation: XeroWriteOperation;
    approvedByUserId: string;
    payloadVersion?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ approvalId: string; idempotencyKey: string }> {
    const idempotencyKey = buildXeroWriteIdempotencyKey({
      companyId: input.companyId,
      operation: input.operation,
      entityId: input.entityId,
      payloadVersion: input.payloadVersion,
    });

    const existing = await this.db.query.xeroWriteApprovals.findFirst({
      where: and(
        eq(xeroWriteApprovals.companyId, input.companyId),
        eq(xeroWriteApprovals.idempotencyKey, idempotencyKey),
      ),
    });

    if (existing) {
      if (existing.status === 'approved' || existing.status === 'executed') {
        return { approvalId: existing.id, idempotencyKey };
      }

      const [updated] = await this.db
        .update(xeroWriteApprovals)
        .set({
          status: 'approved',
          approvedByUserId: input.approvedByUserId,
          approvedAt: new Date(),
          metadata: input.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(xeroWriteApprovals.id, existing.id))
        .returning();

      return { approvalId: updated!.id, idempotencyKey };
    }

    const [created] = await this.db
      .insert(xeroWriteApprovals)
      .values({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        writeOperation: input.operation,
        status: 'approved',
        idempotencyKey,
        approvedByUserId: input.approvedByUserId,
        approvedAt: new Date(),
        metadata: input.metadata ?? {},
      })
      .returning();

    return { approvalId: created!.id, idempotencyKey };
  }

  async markExecuted(companyId: string, approvalId: string): Promise<void> {
    await this.db
      .update(xeroWriteApprovals)
      .set({
        status: 'executed',
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(xeroWriteApprovals.id, approvalId), eq(xeroWriteApprovals.companyId, companyId)));
  }
}
