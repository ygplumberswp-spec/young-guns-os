import test from 'node:test';
import assert from 'node:assert/strict';
import { FinanceDocumentPreviewEnrichmentService } from './finance-document-preview-enrichment.service.js';
import type { FinanceDocumentSectionsService } from './finance-document-sections.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID = 'inv-1';
const JOB_ID = 'job-1';

function ownerActor() {
  return {
    companyId: TENANT_A,
    userId: 'user-owner',
    roleName: 'Company Owner',
    permissions: ['finance:write'] as readonly string[],
  };
}

function officeActor() {
  return {
    companyId: TENANT_A,
    userId: 'user-office',
    roleName: 'Office Staff',
    permissions: ['finance:write'] as readonly string[],
  };
}

function createMockDb(options: {
  paymentUrl?: string | null;
  paymentStatus?: string;
  reviewUrl?: string | null;
  invoiceStatus?: string;
  jobId?: string | null;
}) {
  const paymentRows =
    options.paymentUrl != null
      ? [{ paymentUrl: options.paymentUrl, status: options.paymentStatus ?? 'active' }]
      : [];

  return {
    query: {
      quotes: { findFirst: async () => null },
      invoices: {
        findFirst: async () =>
          options.invoiceStatus
            ? {
                xeroInvoiceNumber: 'INV-001',
                status: options.invoiceStatus,
                amountPaidCents: 0,
                jobId: options.jobId ?? JOB_ID,
              }
            : null,
      },
      companies: {
        findFirst: async () => ({
          preferences: { googleReviewUrl: options.reviewUrl ?? null },
        }),
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => paymentRows,
          }),
        }),
      }),
    }),
  } as unknown as import('@titan/db').DatabaseClient;
}

function createSectionsStub(): FinanceDocumentSectionsService {
  return {
    loadSections: async () => ({ content: {}, cocDocumentationId: null }),
    resolveCocAttachment: async () => ({ status: 'not_attached' as const }),
  } as unknown as FinanceDocumentSectionsService;
}

test('preview enrichment resolves Yoco URL for saved same-tenant invoice only', async () => {
  const service = new FinanceDocumentPreviewEnrichmentService(
    createMockDb({
      paymentUrl: 'https://pay.yoco.com/r/abc123',
      invoiceStatus: 'sent',
      reviewUrl: null,
    }),
    createSectionsStub(),
  );

  const enriched = await service.enrichPreviewInput(ownerActor(), {
    kind: 'invoice',
    invoiceId: INVOICE_ID,
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
    paymentUrl: 'https://evil.example/spoof',
  });

  assert.equal(enriched.paymentUrl, 'https://pay.yoco.com/r/abc123');
});

test('preview enrichment ignores client spoofed review URL and uses tenant setting', async () => {
  const service = new FinanceDocumentPreviewEnrichmentService(
    createMockDb({
      reviewUrl: 'https://g.page/r/young-guns-plumbing/review',
      invoiceStatus: 'sent',
    }),
    createSectionsStub(),
  );

  const enriched = await service.enrichPreviewInput(ownerActor(), {
    kind: 'invoice',
    invoiceId: INVOICE_ID,
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
    reviewUrl: 'https://evil.example/review',
  });

  assert.equal(enriched.reviewUrl, 'https://g.page/r/young-guns-plumbing/review');
});

test('preview enrichment hides Yoco section on quotes and unsaved invoices', async () => {
  const service = new FinanceDocumentPreviewEnrichmentService(
    createMockDb({ paymentUrl: 'https://pay.yoco.com/r/abc123' }),
    createSectionsStub(),
  );

  const quote = await service.enrichPreviewInput(ownerActor(), {
    kind: 'quote',
    quoteId: 'quote-1',
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
    paymentUrl: 'https://pay.yoco.com/r/spoof',
  });
  assert.equal(quote.paymentUrl, null);

  const unsaved = await service.enrichPreviewInput(ownerActor(), {
    kind: 'invoice',
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
    paymentUrl: 'https://pay.yoco.com/r/spoof',
  });
  assert.equal(unsaved.paymentUrl, null);
});

test('draft bank details hidden unless Owner enables preview override', async () => {
  const service = new FinanceDocumentPreviewEnrichmentService(
    createMockDb({ invoiceStatus: 'draft' }),
    createSectionsStub(),
  );

  const officeBlocked = await service.enrichPreviewInput(officeActor(), {
    kind: 'invoice',
    invoiceId: INVOICE_ID,
    status: 'draft',
    showPaymentDetails: true,
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  assert.equal(officeBlocked.showPaymentDetails, false);

  const ownerAllowed = await service.enrichPreviewInput(ownerActor(), {
    kind: 'invoice',
    invoiceId: INVOICE_ID,
    status: 'draft',
    showPaymentDetails: true,
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  assert.equal(ownerAllowed.showPaymentDetails, true);
});
