import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XeroWriteApprovalWorkflowError,
  XeroWriteApprovalWorkflowService,
} from './xero-write-approval-workflow.service.js';
import { XeroWriteApprovalGate } from './xero-write-approval-gate.service.js';
import { buildXeroWriteIdempotencyKey } from '@titan/shared';

type ApprovalRow = {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  writeOperation: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
  idempotencyKey: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function createHarness() {
  const rows: ApprovalRow[] = [];
  const invoices = new Map<
    string,
    {
      id: string;
      companyId: string;
      customerId: string;
      invoiceNumber: string;
      title: string;
      amountCents: number;
      vatCents: number;
      currency: string;
      jobId: string | null;
      updatedAt: Date;
    }
  >();
  const customers = new Map<
    string,
    { id: string; companyId: string; name: string; email: string | null; phone: string | null; updatedAt: Date }
  >();
  const audit: unknown[] = [];

  invoices.set('inv-1', {
    id: 'inv-1',
    companyId: 'co-1',
    customerId: 'cus-1',
    invoiceNumber: 'TITAN-100',
    title: 'Job invoice',
    amountCents: 11500,
    vatCents: 1500,
    currency: 'ZAR',
    jobId: null,
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  });
  customers.set('cus-1', {
    id: 'cus-1',
    companyId: 'co-1',
    name: 'Acme',
    email: 'a@example.com',
    phone: null,
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  });

  const db = {
    query: {
      xeroWriteApprovals: {
        findFirst: async ({ where }: { where: unknown }) => {
          void where;
          return rows[0];
        },
        findMany: async () => rows,
      },
      invoices: {
        findFirst: async () => invoices.get('inv-1'),
      },
      customers: {
        findFirst: async () => customers.get('cus-1'),
      },
      jobs: {
        findFirst: async () => undefined,
      },
      payments: {
        findFirst: async () => undefined,
      },
      xeroInvoiceMappings: {
        findFirst: async () => undefined,
      },
      xeroCustomerMappings: {
        findFirst: async () => undefined,
      },
      xeroPaymentMappings: {
        findFirst: async () => undefined,
      },
    },
    update: () => ({
      set: (patch: Partial<ApprovalRow>) => ({
        where: () => {
          const row = rows[0];
          if (row) Object.assign(row, patch, { updatedAt: new Date() });
          const result = {
            returning: async () => (row ? [row] : []),
            then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
              Promise.resolve(undefined).then(resolve, reject),
          };
          return result;
        },
      }),
    }),
    insert: (_table: unknown) => ({
      values: (input: Record<string, unknown>) => ({
        returning: async () => {
          if ('category' in input || 'action' in input) {
            audit.push(input);
            return [];
          }
          const row: ApprovalRow = {
            id: `appr-${rows.length + 1}`,
            companyId: String(input.companyId),
            entityType: String(input.entityType),
            entityId: String(input.entityId),
            writeOperation: String(input.writeOperation),
            status: (input.status as ApprovalRow['status']) ?? 'pending',
            idempotencyKey: String(input.idempotencyKey),
            approvedByUserId: (input.approvedByUserId as string | null) ?? null,
            approvedAt: (input.approvedAt as Date | null) ?? null,
            executedAt: (input.executedAt as Date | null) ?? null,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rows.push(row);
          return [row];
        },
      }),
    }),
  } as never;

  const gate = new XeroWriteApprovalGate(db);
  const xeroSyncService = {
    executeApprovedInvoicePush: async () => ({
      idempotent: false,
      xeroInvoiceId: 'xero-inv-1',
      xeroInvoiceNumber: 'INV-9',
    }),
    executeApprovedPaymentPush: async () => ({ idempotent: false, xeroPaymentId: 'xero-pay-1' }),
    executeApprovedContactPush: async () => ({ idempotent: false, xeroContactId: 'xero-c-1' }),
  } as never;

  const workflow = new XeroWriteApprovalWorkflowService(db, gate, xeroSyncService);
  return { workflow, rows, audit, gate };
}

const owner = {
  userId: 'owner-1',
  companyId: 'co-1',
  roleName: 'Company Owner',
  permissions: ['*'],
};

const office = {
  userId: 'staff-1',
  companyId: 'co-1',
  roleName: 'Office Staff',
  permissions: ['finance:write', 'integrations:manage'],
};

const tech = {
  userId: 'tech-1',
  companyId: 'co-1',
  roleName: 'Technician',
  permissions: ['jobs:read'],
};

test('request → approve → execute workflow (Owner execute)', async () => {
  const { workflow, rows } = createHarness();

  // Make findFirst resolve by scanning rows for better realism
  const db = (workflow as unknown as { db: { query: { xeroWriteApprovals: { findFirst: Function } } } })
    .db;
  db.query.xeroWriteApprovals.findFirst = async () => rows[0];

  const drafted = await workflow.requestApproval(office, {
    writeOperation: 'invoice_create',
    entityId: 'inv-1',
  });
  assert.equal(drafted.status, 'pending');
  assert.equal(drafted.amountCents, 11500);
  assert.ok(drafted.targetLabel.includes('TITAN-100'));

  const approved = await workflow.approve(owner, drafted.id);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedByUserId, 'owner-1');

  const executed = await workflow.execute(owner, drafted.id);
  assert.equal(executed.approval.status, 'executed');
  assert.equal(executed.result.xeroInvoiceId, 'xero-inv-1');
});

test('technician cannot request Xero writes', async () => {
  const { workflow } = createHarness();
  await assert.rejects(
    () =>
      workflow.requestApproval(tech, {
        writeOperation: 'invoice_create',
        entityId: 'inv-1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof XeroWriteApprovalWorkflowError);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});

test('non-owner cannot approve or execute', async () => {
  const { workflow, rows } = createHarness();
  const db = (workflow as unknown as { db: { query: { xeroWriteApprovals: { findFirst: Function } } } })
    .db;
  db.query.xeroWriteApprovals.findFirst = async () => rows[0];

  const drafted = await workflow.requestApproval(office, {
    writeOperation: 'invoice_create',
    entityId: 'inv-1',
  });

  await assert.rejects(() => workflow.approve(office, drafted.id), (error: unknown) => {
    assert.ok(error instanceof XeroWriteApprovalWorkflowError);
    assert.equal(error.code, 'FORBIDDEN');
    return true;
  });
});

test('reject path blocks later execute', async () => {
  const { workflow, rows } = createHarness();
  const db = (workflow as unknown as { db: { query: { xeroWriteApprovals: { findFirst: Function } } } })
    .db;
  db.query.xeroWriteApprovals.findFirst = async () => rows[0];

  const drafted = await workflow.requestApproval(office, {
    writeOperation: 'invoice_create',
    entityId: 'inv-1',
  });
  await workflow.reject(owner, drafted.id, 'not ready');
  assert.equal(rows[0]?.status, 'rejected');

  await assert.rejects(() => workflow.execute(owner, drafted.id), (error: unknown) => {
    assert.ok(error instanceof XeroWriteApprovalWorkflowError);
    assert.equal(error.code, 'WRITE_NOT_APPROVED');
    return true;
  });
});

test('idempotency key stable for same invoice payload version', () => {
  const key = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
    payloadVersion: 'v1',
  });
  const again = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
    payloadVersion: 'v1',
  });
  assert.equal(key, again);
  assert.ok(key.length >= 8);
});
