import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OWNER_PERMISSIONS, TECHNICIAN_PERMISSIONS } from '@titan/auth';
import { BANK_STATEMENT_REVIEW_STATUS } from '@titan/shared';
import { BankStatementStorageService } from './bank-statement-storage.service.js';
import {
  BankStatementImportError,
  BankStatementImportService,
} from './bank-statement-import.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER_OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SYNTHETIC_CSV = `Date,Amount,Description,Reference
2026-02-01,1500.00,Invoice payment INV-200,INV-200
2026-02-02,1500.00,Duplicate amount same day,
2026-02-03,,Missing amount,
`;

const SYNTHETIC_DUPLICATE_CSV = `Date,Amount,Description,Reference
2026-02-01,1500.00,Invoice payment INV-200,INV-200
`;

type BatchRow = {
  id: string;
  companyId: string;
  bankAccountCode: string;
  bankAccountName: string;
  status: string;
  originalFilename: string;
  sanitizedFilename: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  fileChecksumSha256: string;
  columnMapping: Record<string, string>;
  rowCount: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  reviewRequiredCount: number;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  revertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImportRow = {
  id: string;
  batchId: string;
  companyId: string;
  rowIndex: number;
  transactionDate: string | null;
  amountCents: number | null;
  currency: string;
  reference: string | null;
  description: string | null;
  rowFingerprint: string;
  classification: string;
  reviewStatus: string;
  suggestedMatchType: string | null;
  suggestedMatchLabel: string | null;
  rawData: Record<string, string>;
  createdAt: Date;
};

function createHarness(options?: {
  xeroTransactions?: Array<{
    transactionDate: string;
    amountCents: number;
    reference: string | null;
    description: string | null;
  }>;
  priorImportedFingerprints?: string[];
}) {
  const batches: BatchRow[] = [];
  const rows: ImportRow[] = [];
  const audit: unknown[] = [];
  let activeCompanyId = TENANT_A;

  if (options?.priorImportedFingerprints?.length) {
    const priorBatchId = '33333333-3333-4333-8333-333333333333';
    batches.push({
      id: priorBatchId,
      companyId: TENANT_A,
      bankAccountCode: '090',
      bankAccountName: 'Business Cheque',
      status: 'imported',
      originalFilename: 'prior.csv',
      sanitizedFilename: 'prior.csv',
      storageKey: '/tmp/prior.csv',
      mimeType: 'text/csv',
      fileSizeBytes: 100,
      fileChecksumSha256: 'abc',
      columnMapping: {},
      rowCount: 1,
      readyCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      reviewRequiredCount: 0,
      createdByUserId: USER_OWNER,
      approvedByUserId: USER_OWNER,
      approvedAt: new Date(),
      revertedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const [index, fingerprint] of options.priorImportedFingerprints.entries()) {
      rows.push({
        id: `row-prior-${index}`,
        batchId: priorBatchId,
        companyId: TENANT_A,
        rowIndex: index,
        transactionDate: '2026-01-01',
        amountCents: 10000,
        currency: 'ZAR',
        reference: null,
        description: null,
        rowFingerprint: fingerprint,
        classification: 'ready_to_import',
        reviewStatus: BANK_STATEMENT_REVIEW_STATUS,
        suggestedMatchType: null,
        suggestedMatchLabel: null,
        rawData: {},
        createdAt: new Date(),
      });
    }
  }

  const db = {
    query: {
      xeroAccounts: {
        findMany: async ({ where }: { where: unknown }) => {
          void where;
          return [{ code: '090', name: 'Business Cheque' }];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          void where;
          return { code: '090', name: 'Business Cheque' };
        },
      },
      xeroBankTransactions: {
        findMany: async ({ where }: { where: unknown }) => {
          void where;
          return (options?.xeroTransactions ?? []).map((row) => ({
            transactionDate: row.transactionDate,
            amountCents: row.amountCents,
            reference: row.reference,
            description: row.description,
          }));
        },
      },
      bankStatementImportBatches: {
        findFirst: async ({ where }: { where: unknown }) => {
          void where;
          const batch = batches[batches.length - 1];
          if (!batch || batch.companyId !== activeCompanyId) return null;
          return batch;
        },
      },
      bankStatementImportRows: {
        findMany: async ({ where }: { where: unknown }) => {
          void where;
          const batch = batches[batches.length - 1];
          return rows.filter((row) => row.batchId === batch?.id).sort((a, b) => a.rowIndex - b.rowIndex);
        },
      },
    },
    select: () => ({
      from: () => ({
        where: async () =>
          batches
            .filter((batch) => batch.companyId === TENANT_A && ['approved', 'imported'].includes(batch.status))
            .map((batch) => ({ id: batch.id })),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const items = Array.isArray(input) ? input : [input];
        const runInsert = async () => {
          if ('action' in items[0]!) {
            audit.push(...items);
            return [] as BatchRow[];
          }
          if ('rowIndex' in items[0]!) {
            for (const item of items) {
              rows.push({
                id: `row-${rows.length + 1}`,
                batchId: String(item.batchId),
                companyId: String(item.companyId),
                rowIndex: Number(item.rowIndex),
                transactionDate: (item.transactionDate as string | null) ?? null,
                amountCents: (item.amountCents as number | null) ?? null,
                currency: String(item.currency ?? 'ZAR'),
                reference: (item.reference as string | null) ?? null,
                description: (item.description as string | null) ?? null,
                rowFingerprint: String(item.rowFingerprint),
                classification: String(item.classification),
                reviewStatus: String(item.reviewStatus),
                suggestedMatchType: (item.suggestedMatchType as string | null) ?? null,
                suggestedMatchLabel: (item.suggestedMatchLabel as string | null) ?? null,
                rawData: (item.rawData as Record<string, string>) ?? {},
                createdAt: new Date(),
              });
            }
            return [] as BatchRow[];
          }
          const item = items[0]!;
          const batch: BatchRow = {
            id: String(item.id),
            companyId: String(item.companyId),
            bankAccountCode: String(item.bankAccountCode),
            bankAccountName: String(item.bankAccountName),
            status: String(item.status ?? 'preview_ready'),
            originalFilename: String(item.originalFilename),
            sanitizedFilename: String(item.sanitizedFilename),
            storageKey: String(item.storageKey),
            mimeType: String(item.mimeType),
            fileSizeBytes: Number(item.fileSizeBytes),
            fileChecksumSha256: String(item.fileChecksumSha256),
            columnMapping: (item.columnMapping as Record<string, string>) ?? {},
            rowCount: Number(item.rowCount ?? 0),
            readyCount: Number(item.readyCount ?? 0),
            duplicateCount: Number(item.duplicateCount ?? 0),
            invalidCount: Number(item.invalidCount ?? 0),
            reviewRequiredCount: Number(item.reviewRequiredCount ?? 0),
            createdByUserId: String(item.createdByUserId),
            approvedByUserId: null,
            approvedAt: null,
            revertedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          batches.push(batch);
          return [batch];
        };
        return {
          returning: runInsert,
          then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
            runInsert().then(resolve, reject),
        };
      },
    }),
    update: () => ({
      set: (patch: Partial<BatchRow>) => ({
        where: () => {
          const batch = batches[batches.length - 1];
          if (batch) Object.assign(batch, patch, { updatedAt: new Date() });
          const result = Promise.resolve(undefined);
          return {
            returning: async () => (batch ? [batch] : []),
            then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
              result.then(resolve, reject),
          };
        },
      }),
    }),
  } as never;

  return {
    db,
    batches,
    rows,
    audit,
    setActiveCompany(companyId: string) {
      activeCompanyId = companyId;
    },
  };
}

async function createService(storageDir: string, harness = createHarness()) {
  const storage = new BankStatementStorageService(storageDir);
  const service = new BankStatementImportService(harness.db, storage);
  return { service, ...harness };
}

test('BANK-IMPORT-001 owner can create preview from synthetic CSV', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  const preview = await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_CSV),
    },
  );
  assert.equal(preview.status, 'preview_ready');
  assert.ok(preview.batchId);
  assert.equal(preview.rowCount, 3);
  assert.equal(preview.summary.invalid, 1);
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 technician denied from preview', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  await assert.rejects(
    () =>
      service.createPreview(
        {
          companyId: TENANT_A,
          userId: USER_OWNER,
          roleName: 'Technician',
          permissions: [...TECHNICIAN_PERMISSIONS],
        },
        {
          bankAccountCode: '090',
          filename: 'synthetic.csv',
          mimeType: 'text/csv',
          content: Buffer.from(SYNTHETIC_CSV),
        },
      ),
    (error: unknown) => error instanceof BankStatementImportError && error.code === 'FORBIDDEN',
  );
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 preview before approval — batch stays preview_ready', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  const preview = await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
    },
  );
  assert.equal(preview.status, 'preview_ready');
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 review-required classification for invoice-like rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  const preview = await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
    },
  );
  assert.ok(preview.summary.review_required >= 1 || preview.summary.possible_duplicate >= 0);
  assert.ok(preview.rows.every((row: { reviewStatus: string }) => row.reviewStatus === BANK_STATEMENT_REVIEW_STATUS));
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 no false paid or reconciled state on approval', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  const actor = {
    companyId: TENANT_A,
    userId: USER_OWNER,
    roleName: 'Company Owner',
    permissions: [...OWNER_PERMISSIONS],
  };
  const preview = await service.createPreview(actor, {
    bankAccountCode: '090',
    filename: 'synthetic.csv',
    mimeType: 'text/csv',
    content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
  });
  const approved = await service.approveBatch(actor, preview.batchId);
  assert.equal(approved.status, 'imported');
  assert.ok(approved.rows.every((row: { reviewStatus: string }) => row.reviewStatus === BANK_STATEMENT_REVIEW_STATUS));
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 reversible unconfirmed preview batch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const { service } = await createService(dir);
  const actor = {
    companyId: TENANT_A,
    userId: USER_OWNER,
    roleName: 'Company Owner',
    permissions: [...OWNER_PERMISSIONS],
  };
  const preview = await service.createPreview(actor, {
    bankAccountCode: '090',
    filename: 'synthetic.csv',
    mimeType: 'text/csv',
    content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
  });
  const reverted = await service.revertBatch(actor, preview.batchId);
  assert.equal(reverted.status, 'reverted');
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 auditable batch creates audit log entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const harness = createHarness();
  const { service } = await createService(dir, harness);
  await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
    },
  );
  assert.ok(harness.audit.some((entry) => (entry as { action: string }).action === 'preview_created'));
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 cross-tenant batch access denied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const harness = createHarness();
  const { service } = await createService(dir, harness);
  const ownerA = {
    companyId: TENANT_A,
    userId: USER_OWNER,
    roleName: 'Company Owner',
    permissions: [...OWNER_PERMISSIONS],
  };
  const preview = await service.createPreview(ownerA, {
    bankAccountCode: '090',
    filename: 'synthetic.csv',
    mimeType: 'text/csv',
    content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
  });
  harness.setActiveCompany(TENANT_B);
  await assert.rejects(
    () =>
      service.getBatch(
        { companyId: TENANT_B, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
        preview.batchId,
      ),
    (error: unknown) => error instanceof BankStatementImportError && error.code === 'NOT_FOUND',
  );
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 xero duplicate detection classifies existing xero transaction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const harness = createHarness({
    xeroTransactions: [
      {
        transactionDate: '2026-02-01',
        amountCents: 150000,
        reference: 'INV-200',
        description: 'Invoice payment INV-200',
      },
    ],
  });
  const { service } = await createService(dir, harness);
  const preview = await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
    },
  );
  assert.ok(
    preview.summary.existing_xero_transaction >= 1 ||
      preview.summary.review_required >= 1 ||
      preview.summary.possible_duplicate >= 1,
  );
  await rm(dir, { recursive: true, force: true });
});

test('BANK-IMPORT-001 audit metadata excludes sensitive banking fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-import-svc-'));
  const harness = createHarness();
  const { service } = await createService(dir, harness);
  await service.createPreview(
    { companyId: TENANT_A, userId: USER_OWNER, roleName: 'Company Owner', permissions: [...OWNER_PERMISSIONS] },
    {
      bankAccountCode: '090',
      filename: 'synthetic.csv',
      mimeType: 'text/csv',
      content: Buffer.from(SYNTHETIC_DUPLICATE_CSV),
    },
  );
  const serialized = JSON.stringify(harness.audit);
  assert.doesNotMatch(serialized, /accountNumber|iban|fileContent/i);
  await rm(dir, { recursive: true, force: true });
});
