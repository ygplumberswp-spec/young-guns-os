import test from 'node:test';
import assert from 'node:assert/strict';
import { COC_EVIDENCE_ROLE } from '@titan/shared';
import { FinanceDocumentSectionsError, FinanceDocumentSectionsService } from './finance-document-sections.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const JOB_A = 'job-a';
const DOC_ID = 'doc-coc-1';

const evidenceRows = [
  {
    id: DOC_ID,
    companyId: TENANT_A,
    jobId: JOB_A,
    fileName: 'coc-2026.pdf',
    title: 'Gas COC',
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    storageKey: 'tenant/job/coc.pdf',
    metadata: { evidenceRole: COC_EVIDENCE_ROLE },
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  },
  {
    id: 'doc-other-tenant',
    companyId: '22222222-2222-4222-8222-222222222222',
    jobId: 'job-b',
    fileName: 'foreign.pdf',
    title: 'Foreign',
    mimeType: 'application/pdf',
    sizeBytes: 900,
    storageKey: 'other/coc.pdf',
    metadata: { evidenceRole: COC_EVIDENCE_ROLE },
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  },
  {
    id: 'doc-filename-only',
    companyId: TENANT_A,
    jobId: JOB_A,
    fileName: 'scan-coc.jpg',
    title: 'Not typed',
    mimeType: 'image/jpeg',
    sizeBytes: 500,
    storageKey: 'tenant/job/scan.jpg',
    metadata: { title: 'coc scan' },
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
  },
];

function createMockDb() {
  const titanRows: Array<Record<string, unknown>> = [];

  return {
    query: {
      titanDocuments: {
        findFirst: async () => titanRows[0] ?? null,
      },
    },
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          const created = { ...row, id: 'td-1', cocDocumentationId: row.cocDocumentationId ?? null };
          titanRows.push(created);
          return [created];
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            const base = titanRows[0] ?? { content: {}, cocDocumentationId: null };
            const updated = { ...base, ...patch };
            titanRows[0] = updated;
            return [updated];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (count: number) =>
            evidenceRows
              .filter((row) => row.companyId === TENANT_A && row.jobId === JOB_A)
              .slice(0, count),
          then(onFulfilled: (value: typeof evidenceRows) => unknown) {
            return Promise.resolve(
              evidenceRows.filter((row) => row.companyId === TENANT_A && row.jobId === JOB_A),
            ).then(onFulfilled);
          },
        }),
      }),
    }),
  } as unknown as import('@titan/db').DatabaseClient;
}

function createResolveMockDb(documentationId: string, companyId: string) {
  return {
    query: { titanDocuments: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            evidenceRows.filter(
              (row) => row.id === documentationId && row.companyId === companyId,
            ),
        }),
      }),
    }),
  } as unknown as import('@titan/db').DatabaseClient;
}

test('listCocEvidence returns typed metadata only', async () => {
  const service = new FinanceDocumentSectionsService(createMockDb());
  const options = await service.listCocEvidence(TENANT_A, JOB_A);
  assert.equal(options.length, 1);
  assert.equal(options[0]?.id, DOC_ID);
});

test('resolveCocAttachment denies cross-tenant and filename-only evidence', async () => {
  const foreign = new FinanceDocumentSectionsService(
    createResolveMockDb('doc-other-tenant', TENANT_A),
  );
  assert.equal((await foreign.resolveCocAttachment(TENANT_A, JOB_A, 'doc-other-tenant')).status, 'not_attached');

  const filenameOnly = new FinanceDocumentSectionsService(createResolveMockDb('doc-filename-only', TENANT_A));
  assert.equal((await filenameOnly.resolveCocAttachment(TENANT_A, JOB_A, 'doc-filename-only')).status, 'not_attached');

  const attached = new FinanceDocumentSectionsService(createResolveMockDb(DOC_ID, TENANT_A));
  const state = await attached.resolveCocAttachment(TENANT_A, JOB_A, DOC_ID);
  assert.equal(state.status, 'attached');
  if (state.status === 'attached') {
    assert.equal(state.fileName, 'coc-2026.pdf');
    assert.match(state.downloadPath, /^\/api\/v1\/jobs\//);
    assert.doesNotMatch(state.downloadPath, /storageKey|tenant\/job/);
  }
});

test('saveSections rejects COC evidence from unrelated job', async () => {
  const service = new FinanceDocumentSectionsService(createResolveMockDb(DOC_ID, TENANT_A));
  await assert.rejects(
    () =>
      service.saveSections(
        { companyId: TENANT_A, userId: 'user-1' },
        {
          invoiceId: 'inv-1',
          jobId: 'different-job',
          documentNumber: 'Draft',
          title: 'Invoice',
          cocDocumentationId: DOC_ID,
        },
      ),
    (error: unknown) =>
      error instanceof FinanceDocumentSectionsError && error.code === 'VALIDATION_ERROR',
  );
});
