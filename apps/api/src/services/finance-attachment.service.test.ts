import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateFinanceAttachmentFile,
  isFinanceAttachmentMimeType,
  normaliseFinanceAttachmentOrder,
} from '@titan/shared';
import { FinanceAttachmentStorageService, FinanceAttachmentStorageError } from './finance-attachment-storage.service.js';
import { FinanceAttachmentService, FinanceAttachmentError } from './finance-attachment.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const QUOTE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('validateFinanceAttachmentFile rejects unsupported mime types and oversize payloads', () => {
  assert.equal(isFinanceAttachmentMimeType('image/jpeg'), true);
  assert.equal(isFinanceAttachmentMimeType('text/plain'), false);

  const invalidType = validateFinanceAttachmentFile({ mimeType: 'text/plain', sizeBytes: 100 });
  assert.equal(invalidType.ok, false);
  if (!invalidType.ok) assert.equal(invalidType.code, 'INVALID_FILE_TYPE');

  const tooLargeImage = validateFinanceAttachmentFile({
    mimeType: 'image/png',
    sizeBytes: 9 * 1024 * 1024,
  });
  assert.equal(tooLargeImage.ok, false);
  if (!tooLargeImage.ok) assert.equal(tooLargeImage.code, 'FILE_TOO_LARGE');

  const tooLargePdf = validateFinanceAttachmentFile({
    mimeType: 'application/pdf',
    sizeBytes: 11 * 1024 * 1024,
  });
  assert.equal(tooLargePdf.ok, false);
  if (!tooLargePdf.ok) assert.equal(tooLargePdf.code, 'FILE_TOO_LARGE');

  assert.deepEqual(validateFinanceAttachmentFile({ mimeType: 'image/webp', sizeBytes: 1024 }), { ok: true });
});

test('finance attachment storage enforces tenant isolation on read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finance-attach-'));
  try {
    const storage = new FinanceAttachmentStorageService(root);
    const stored = await storage.store({
      companyId: TENANT_A,
      mimeType: 'image/png',
      buffer: Buffer.from('png-bytes'),
      originalFileName: 'photo.png',
    });

    await assert.rejects(
      () => storage.read({ companyId: TENANT_B, storageKey: stored.storageKey }),
      (error: unknown) =>
        error instanceof FinanceAttachmentStorageError && error.code === 'FORBIDDEN',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createMockDb(options?: { scopedCompanyId?: string }) {
  const scopedCompanyId = options?.scopedCompanyId ?? TENANT_A;
  const attachmentRows: Array<Record<string, unknown>> = [];

  return {
    attachmentRows,
    db: {
      query: {
        quotes: {
          findFirst: async ({ where }: { where: unknown }) => {
            void where;
            return scopedCompanyId === TENANT_A ? { id: QUOTE_A, companyId: TENANT_A } : null;
          },
        },
        invoices: { findFirst: async () => null },
        financeDocumentAttachments: {
          findFirst: async () => null,
          findMany: async () => attachmentRows,
        },
        mobileJobDocumentation: { findFirst: async () => null, findMany: async () => [] },
      },
      insert: () => ({
        values: (row: Record<string, unknown>) => ({
          returning: async () => {
            const created = {
              id: `att-${attachmentRows.length + 1}`,
              companyId: row.companyId,
              quoteId: row.quoteId ?? null,
              invoiceId: row.invoiceId ?? null,
              draftClientActionId: row.draftClientActionId ?? null,
              source: row.source ?? 'upload',
              jobId: row.jobId ?? null,
              documentationId: row.documentationId ?? null,
              storageKey: row.storageKey ?? null,
              fileName: row.fileName,
              mimeType: row.mimeType,
              sizeBytes: row.sizeBytes,
              caption: row.caption ?? null,
              sortOrder: row.sortOrder ?? 0,
              includeInPdf: row.includeInPdf ?? false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            attachmentRows.push(created);
            return [created];
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [] }),
        }),
      }),
      delete: () => ({ where: async () => undefined }),
      select: () => ({
        from: () => ({
          where: async () => [{ max: attachmentRows.length - 1 }],
        }),
      }),
    },
  };
}

test('finance attachment service rejects invalid uploads before persisting rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finance-attach-'));
  try {
    const storage = new FinanceAttachmentStorageService(root);
    const { db, attachmentRows } = createMockDb();
    const service = new FinanceAttachmentService(db as never, storage, {} as never);

    await assert.rejects(
      () =>
        service.uploadAttachment(
          { companyId: TENANT_A, userId: USER_A },
          { quoteId: QUOTE_A },
          {
            fileName: 'notes.txt',
            mimeType: 'text/plain',
            dataBase64: Buffer.from('hello').toString('base64'),
          },
        ),
      (error: unknown) => error instanceof FinanceAttachmentError && error.code === 'INVALID_FILE_TYPE',
    );

    assert.equal(attachmentRows.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('finance attachment service scopes uploads to tenant-owned quotes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finance-attach-'));
  try {
    const storage = new FinanceAttachmentStorageService(root);
    const { db } = createMockDb({ scopedCompanyId: TENANT_B });
    const service = new FinanceAttachmentService(db as never, storage, {} as never);

    await assert.rejects(
      () =>
        service.uploadAttachment(
          { companyId: TENANT_B, userId: USER_A },
          { quoteId: QUOTE_A },
          {
            fileName: 'photo.jpg',
            mimeType: 'image/jpeg',
            dataBase64: Buffer.from('jpeg').toString('base64'),
          },
        ),
      (error: unknown) => error instanceof FinanceAttachmentError && error.code === 'NOT_FOUND',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPreviewAttachments includes only includeInPdf attachments with data URLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finance-attach-'));
  try {
    const storage = new FinanceAttachmentStorageService(root);
    const stored = await storage.store({
      companyId: TENANT_A,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('jpeg-preview'),
      originalFileName: 'site.jpg',
    });

    const attachments = [
      {
        id: 'att-1',
        companyId: TENANT_A,
        quoteId: QUOTE_A,
        invoiceId: null,
        draftClientActionId: null,
        source: 'upload' as const,
        jobId: null,
        documentationId: null,
        storageKey: stored.storageKey,
        fileName: 'site.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: stored.sizeBytes,
        caption: 'Before repair',
        sortOrder: 0,
        includeInPdf: true,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        id: 'att-2',
        companyId: TENANT_A,
        quoteId: QUOTE_A,
        invoiceId: null,
        draftClientActionId: null,
        source: 'upload' as const,
        jobId: null,
        documentationId: null,
        storageKey: stored.storageKey,
        fileName: 'hidden.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: stored.sizeBytes,
        caption: null,
        sortOrder: 1,
        includeInPdf: false,
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ];

    const service = new FinanceAttachmentService(
      {
        query: {
          financeDocumentAttachments: {
            findMany: async () => attachments,
            findFirst: async ({ where }: { where: unknown }) => {
              void where;
              return attachments[0];
            },
          },
        },
      } as never,
      storage,
      {} as never,
    );

    const preview = await service.buildPreviewAttachments(TENANT_A, { quoteId: QUOTE_A });
    assert.equal(preview.length, 1);
    assert.equal(preview[0]?.fileName, 'site.jpg');
    assert.match(preview[0]?.dataUrl ?? '', /^data:image\/jpeg;base64,/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normaliseFinanceAttachmentOrder sorts by sortOrder then createdAt', () => {
  const ordered = normaliseFinanceAttachmentOrder([
    {
      id: '2',
      companyId: TENANT_A,
      quoteId: QUOTE_A,
      invoiceId: null,
      draftClientActionId: null,
      source: 'upload',
      jobId: null,
      documentationId: null,
      storageKey: 'k',
      fileName: 'b.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      caption: null,
      sortOrder: 1,
      includeInPdf: true,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    {
      id: '1',
      companyId: TENANT_A,
      quoteId: QUOTE_A,
      invoiceId: null,
      draftClientActionId: null,
      source: 'upload',
      jobId: null,
      documentationId: null,
      storageKey: 'k',
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      caption: null,
      sortOrder: 0,
      includeInPdf: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(ordered.map((item) => item.id), ['1', '2']);
});
