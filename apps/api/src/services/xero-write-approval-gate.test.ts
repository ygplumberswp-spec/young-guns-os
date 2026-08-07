import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XeroWriteApprovalGate,
  XeroWriteApprovalGateError,
} from './xero-write-approval-gate.service.js';

type ApprovalRow = {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  writeOperation: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
  idempotencyKey: string;
};

function createMockDb(initial: ApprovalRow[] = []) {
  const rows = [...initial];
  return {
    query: {
      xeroWriteApprovals: {
        findFirst: async ({ where }: { where: unknown }) => {
          void where;
          return rows[0] ?? undefined;
        },
      },
    },
    insert: (table: { _: unknown }) => ({
      values: (input: Omit<ApprovalRow, 'id'>) => ({
        returning: async () => {
          void table;
          const row = { id: `approval-${rows.length + 1}`, ...input };
          rows.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
    _rows: rows,
  } as never;
}

test('XeroWriteApprovalGate blocks write without approval record', async () => {
  const gate = new XeroWriteApprovalGate(createMockDb());

  await assert.rejects(
    () =>
      gate.assertWriteApproved({
        companyId: 'co-1',
        entityType: 'invoice',
        entityId: 'inv-1',
        operation: 'invoice_create',
      }),
    (error: unknown) => {
      assert.ok(error instanceof XeroWriteApprovalGateError);
      assert.equal(error.code, 'WRITE_NOT_APPROVED');
      return true;
    },
  );
});

test('XeroWriteApprovalGate allows mockApproved in tests only', async () => {
  const gate = new XeroWriteApprovalGate(createMockDb());
  const result = await gate.assertWriteApproved({
    companyId: 'co-1',
    entityType: 'invoice',
    entityId: 'inv-1',
    operation: 'invoice_create',
    mockApproved: true,
  });
  assert.equal(result.approvalId, 'mock-approval');
});

test('XeroWriteApprovalGate idempotent recordApproval upsert', async () => {
  const db = createMockDb();
  const gate = new XeroWriteApprovalGate(db);

  const first = await gate.recordApproval({
    companyId: 'co-1',
    entityType: 'invoice',
    entityId: 'inv-1',
    operation: 'invoice_create',
    approvedByUserId: 'owner-1',
  });

  const second = await gate.recordApproval({
    companyId: 'co-1',
    entityType: 'invoice',
    entityId: 'inv-1',
    operation: 'invoice_create',
    approvedByUserId: 'owner-1',
  });

  assert.equal(first.idempotencyKey, second.idempotencyKey);
});
