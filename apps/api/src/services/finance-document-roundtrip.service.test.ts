import test from 'node:test';
import assert from 'node:assert/strict';
import { getTableName } from 'drizzle-orm';
import { canEditInvoice } from '@titan/shared';
import { invoices, quotes } from '@titan/db';
import { FinanceError, FinanceService } from './finance.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function lineItem(description: string, unitPriceCents: number) {
  return {
    category: 'labour' as const,
    description,
    quantity: 1,
    unitPriceCents,
    vatRateBps: 1500,
  };
}

function createMockFinanceDb(options?: {
  invoiceSynced?: boolean;
  scopedCompanyId?: string;
}) {
  let scopedCompanyId = options?.scopedCompanyId ?? TENANT_A;

  const quote = {
    id: 'quote-1',
    companyId: TENANT_A,
    customerId: CUSTOMER_A,
    quoteNumber: 'Q-000001',
    title: 'Round-trip quote',
    status: 'draft' as const,
    amountCents: 11500,
    subtotalCents: 10000,
    vatCents: 1500,
    totalCents: 11500,
    currency: 'ZAR',
    isImmutable: false,
    versionNumber: 1,
    notes: null as string | null,
    customerNotes: null as string | null,
    issuedAt: null as Date | null,
    validUntil: null as Date | null,
    billingAddress: null as string | null,
    siteAddress: null as string | null,
    postalAddress: null as string | null,
    discountCents: 0,
    estimatedCostCents: 0,
    grossProfitCents: 10000,
    markupBps: 0,
    marginBps: 0,
    profitFloorCents: 0,
    targetPriceCents: 0,
    belowFloorOverride: false,
    belowFloorReason: null,
    scopeOfWork: null,
    exclusions: null,
    assumptions: null,
    internalNotes: null,
    paymentTerms: null,
    depositPercent: null,
    optionTier: null,
    xeroQuoteId: null,
    jobId: null,
    propertyId: null,
    leadId: null,
    estimatorUserId: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    lineItems: [
      {
        id: 'line-1',
        category: 'labour',
        description: 'Labour',
        quantity: '1',
        unitPriceCents: 10000,
        unitCostCents: 0,
        vatRateBps: 1500,
        lineSubtotalCents: 10000,
        lineVatCents: 1500,
        lineTotalCents: 11500,
        lineCostCents: 0,
        position: 0,
        isOptional: false,
        optionTier: null,
      },
    ],
    customer: { name: 'Tenant A Customer' },
    job: null,
    acceptances: [] as [],
  };

  const invoice = {
    id: 'invoice-1',
    companyId: TENANT_A,
    customerId: CUSTOMER_A,
    invoiceNumber: 'TITAN-INV-000001',
    internalNumber: 'TITAN-INV-000001',
    title: 'Round-trip invoice',
    status: 'draft' as const,
    stage: 'standard' as const,
    amountCents: 11500,
    subtotalCents: 10000,
    vatCents: 1500,
    totalCents: 11500,
    amountPaidCents: 0,
    currency: 'ZAR',
    dueDate: null as Date | null,
    issuedAt: new Date('2026-08-02T00:00:00.000Z'),
    notes: null as string | null,
    xeroReference: null as string | null,
    xeroInvoiceNumber: options?.invoiceSynced ? 'INV-0558' : null,
    numberAuthority: options?.invoiceSynced ? 'xero' : 'internal_pending_xero',
    sourceProvider: options?.invoiceSynced ? 'xero' : null,
    billingAddress: null as string | null,
    siteAddress: null as string | null,
    postalAddress: null as string | null,
    paymentTerms: null,
    billingName: null,
    billingEmail: null,
    billingPhone: null,
    jobId: null,
    quoteId: null,
    quoteVersionNumber: null,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    lineItems: quote.lineItems,
    payments: [] as [],
    customer: { name: 'Tenant A Customer' },
    job: null,
    quote: null,
  };

  const db = {
    query: {
      companyFinanceSettings: {
        findFirst: async () => ({
          companyId: TENANT_A,
          defaultVatRateBps: 1500,
          profitFloorMarginBps: 2000,
          allowBelowFloorWithOverride: true,
          currency: 'ZAR',
        }),
      },
      quotes: {
        findFirst: async () => (quote.companyId === scopedCompanyId ? quote : null),
        findMany: async () => (quote.companyId === scopedCompanyId ? [quote] : []),
      },
      invoices: {
        findFirst: async () => (invoice.companyId === scopedCompanyId ? invoice : null),
        findMany: async () => (invoice.companyId === scopedCompanyId ? [invoice] : []),
      },
      customers: {
        findFirst: async () => ({ id: CUSTOMER_A, companyId: TENANT_A }),
      },
    },
    update: (table: typeof quotes | typeof invoices) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          const tableName = getTableName(table);
          if (tableName === 'quotes') Object.assign(quote, values, { updatedAt: new Date() });
          if (tableName === 'invoices') Object.assign(invoice, values, { updatedAt: new Date() });
        },
      }),
    }),
    delete: () => ({
      where: async () => undefined,
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
        returning: async () => [quote],
      }),
    }),
    setScopedCompanyId(companyId: string) {
      scopedCompanyId = companyId;
    },
  };

  return {
    db: db as unknown as ConstructorParameters<typeof FinanceService>[0],
    setScopedCompanyId: db.setScopedCompanyId.bind(db),
    quote,
    invoice,
  };
}

test('quote update → detail round-trip preserves notes, date and address snapshots', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  await service.updateQuote(actor, 'quote-1', {
    notes: 'Please confirm access before Friday.',
    issuedAt: '2026-08-04T00:00:00.000Z',
    billingAddress: 'Billing snapshot',
    siteAddress: 'Site snapshot',
    postalAddress: 'Postal snapshot',
    lineItems: [lineItem('Labour', 10000)],
  });

  const detail = await service.getQuoteDetail(TENANT_A, 'quote-1');
  assert.ok(detail);
  assert.equal(detail.notes, 'Please confirm access before Friday.');
  assert.equal(detail.issuedAt, '2026-08-04T00:00:00.000Z');
  assert.deepEqual(detail.addresses, {
    billingAddress: 'Billing snapshot',
    siteAddress: 'Site snapshot',
    postalAddress: 'Postal snapshot',
  });
});

test('invoice update → detail round-trip preserves customer reference, date and addresses', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  await service.updateInvoice(actor, 'invoice-1', {
    customerReference: 'PO-7781',
    issuedAt: '2026-08-05T00:00:00.000Z',
    billingAddress: 'Invoice billing snapshot',
    siteAddress: 'Invoice site snapshot',
    postalAddress: 'Invoice postal snapshot',
    notes: 'Payment within 7 days.',
    lineItems: [lineItem('Labour', 10000)],
  });

  const detail = await service.getInvoiceDetail(TENANT_A, 'invoice-1');
  assert.ok(detail);
  assert.equal(detail.customerReference, 'PO-7781');
  assert.equal(detail.xeroReference, 'PO-7781');
  assert.equal(detail.issuedAt, '2026-08-05T00:00:00.000Z');
  assert.equal(detail.notes, 'Payment within 7 days.');
  assert.deepEqual(detail.addresses, {
    billingAddress: 'Invoice billing snapshot',
    siteAddress: 'Invoice site snapshot',
    postalAddress: 'Invoice postal snapshot',
  });
});

test('tenant B cannot read tenant A finance documents when scoped by companyId', async () => {
  const { db, setScopedCompanyId } = createMockFinanceDb();
  setScopedCompanyId(TENANT_B);
  const service = new FinanceService(db);

  assert.equal(await service.getQuoteDetail(TENANT_B, 'quote-1'), null);
  assert.equal(await service.getInvoiceDetail(TENANT_B, 'invoice-1'), null);
});

test('synced Xero invoices remain protected from local edits', async () => {
  const { db } = createMockFinanceDb({ invoiceSynced: true });
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  assert.equal(
    canEditInvoice({ status: 'draft', xeroInvoiceNumber: 'INV-0558', numberAuthority: 'xero' }),
    false,
  );

  await assert.rejects(
    () =>
      service.updateInvoice(actor, 'invoice-1', {
        notes: 'Should fail',
        lineItems: [lineItem('Labour', 10000)],
      }),
    (error: unknown) => {
      assert.ok(error instanceof FinanceError);
      assert.equal(error.code, 'SYNC_CONFLICT');
      return true;
    },
  );
});

test('legacy rows with null round-trip fields remain readable', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);

  const quote = await service.getQuoteDetail(TENANT_A, 'quote-1');
  const invoice = await service.getInvoiceDetail(TENANT_A, 'invoice-1');

  assert.ok(quote);
  assert.ok(invoice);
  assert.equal(quote.notes, null);
  assert.deepEqual(quote.addresses, {
    billingAddress: null,
    siteAddress: null,
    postalAddress: null,
  });
  assert.equal(invoice.customerReference, null);
  assert.deepEqual(invoice.addresses, {
    billingAddress: null,
    siteAddress: null,
    postalAddress: null,
  });
});

test('finance summaries are title-free and use Xero pending labels until synced', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);

  const quote = await service.getQuoteDetail(TENANT_A, 'quote-1');
  const invoice = await service.getInvoiceDetail(TENANT_A, 'invoice-1');

  assert.ok(quote);
  assert.ok(invoice);
  assert.equal('title' in quote, false);
  assert.equal('title' in invoice, false);
  assert.equal(quote.displayQuoteNumber, 'Draft — Xero quote number pending');
  assert.equal(invoice.displayOfficialInvoiceNumber, 'Draft — Xero invoice number pending');
  assert.doesNotMatch(quote.displayQuoteNumber, /Q-000001/);
});

test('quote draft save with blank placeholder line keeps draft status and pending Xero number', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  await service.updateQuote(actor, 'quote-1', {
    status: 'draft',
    notes: 'Blank draft shell',
    lineItems: [
      {
        category: 'other',
        description: 'Draft — line items pending',
        quantity: 1,
        unitPriceCents: 0,
        vatRateBps: 1500,
      },
    ],
  });

  const detail = await service.getQuoteDetail(TENANT_A, 'quote-1');
  assert.ok(detail);
  assert.equal(detail.status, 'draft');
  assert.equal(detail.notes, 'Blank draft shell');
  assert.equal(detail.displayQuoteNumber, 'Draft — Xero quote number pending');
});

test('invoice incomplete draft save preserves reference and stays draft', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  await service.updateInvoice(actor, 'invoice-1', {
    status: 'draft',
    customerReference: 'STAGING-QA-REF',
    notes: 'Incomplete draft',
    lineItems: [
      {
        category: 'other',
        description: 'Draft — line items pending',
        quantity: 1,
        unitPriceCents: 0,
        vatRateBps: 1500,
      },
    ],
  });

  const detail = await service.getInvoiceDetail(TENANT_A, 'invoice-1');
  assert.ok(detail);
  assert.equal(detail.status, 'draft');
  assert.equal(detail.customerReference, 'STAGING-QA-REF');
  assert.equal(detail.displayOfficialInvoiceNumber, 'Draft — Xero invoice number pending');
});

test('completed draft save keeps real line items and draft status without Xero assignment', async () => {
  const { db } = createMockFinanceDb();
  const service = new FinanceService(db);
  const actor = { companyId: TENANT_A, canWrite: true, userId: 'user-1' };

  await service.updateQuote(actor, 'quote-1', {
    status: 'draft',
    notes: 'Completed draft',
    billingAddress: '1 Main Rd',
    lineItems: [lineItem('Call-out fee', 45000)],
  });

  const detail = await service.getQuoteDetail(TENANT_A, 'quote-1');
  assert.ok(detail);
  assert.equal(detail.status, 'draft');
  assert.equal(detail.notes, 'Completed draft');
  assert.equal(detail.addresses.billingAddress, '1 Main Rd');
  assert.equal(detail.displayQuoteNumber, 'Draft — Xero quote number pending');
  assert.equal(detail.xeroQuoteId, null);
});
