import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
  ROYAL_CAPE_OWNER_CRC,
  ROYAL_CAPE_PRODUCTION_FORBIDDEN,
  ROYAL_CAPE_SAFETY_CONTRACT,
  ROYAL_CAPE_SCREENSHOT_EVIDENCE,
  ROYAL_CAPE_STAGING_IDENTITY,
  assertFullHistoryRuleRemainsActive,
  assertOwnerCrcCanonical,
  assertRoyalCapeIdempotency,
  assertRoyalCapeJpeRelationship,
  assertRoyalCapeRbacSeparation,
  assertStagingDatabaseIdentity,
  buildRoyalCapeAuditEvents,
  buildRoyalCapeJob360View,
  buildRoyalCapeRehearsalPlan,
  classifyQuoteSyncFailure,
  compareScreenshotToXeroQuote,
  planCanonicalQuoteMatch,
  planCustomerMatch,
  planRoyalCapeJobMatch,
  planRoyalCapePropertyMatch,
  proveProductionUntouched,
  rehearseRoyalCapeMultiDayWorkflow,
  type RoyalCapeXeroQuoteSnapshot,
} from './royal-cape-job360-rehearsal.js';

function sampleQuote(
  overrides: Partial<RoyalCapeXeroQuoteSnapshot> = {},
): RoyalCapeXeroQuoteSnapshot {
  return {
    titanQuoteId: 'q-1',
    quoteNumber: ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
    xeroQuoteId: 'xero-quote-guid-0183',
    sourceExternalId: 'xero-quote-guid-0183',
    sourceProvider: 'xero',
    issuedAt: '2026-07-15T00:00:00.000Z',
    customerId: 'cust-1',
    customerName: 'Cape Rowing Club NPC',
    reference: 'Royal Cape Yacht Club',
    status: 'sent',
    subtotalCents: 3_715_000,
    vatCents: 557_250,
    totalCents: 4_272_250,
    currency: 'ZAR',
    jobId: null,
    lineItemCount: 3,
    syncStatus: 'synced',
    ...overrides,
  };
}

describe('Royal Cape Yacht Club staging Job 360 rehearsal', () => {
  it('locks staging identity and forbids production', () => {
    assert.equal(ROYAL_CAPE_STAGING_IDENTITY.supabaseProjectRef, 'cpkuwtaipjxeipvbssvn');
    assert.equal(ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef, 'rshuiaghmtrvvilhqpwm');
    assert.deepEqual(
      assertStagingDatabaseIdentity({
        appEnv: 'staging',
        titanEnv: 'staging',
        databaseUrl: `postgres://u:p@db.${ROYAL_CAPE_STAGING_IDENTITY.supabaseProjectRef}.supabase.co/postgres`,
      }),
      { ok: true },
    );
    assert.equal(
      assertStagingDatabaseIdentity({
        appEnv: 'staging',
        titanEnv: 'staging',
        databaseUrl: `postgres://u:p@db.${ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef}.supabase.co/postgres`,
      }).ok,
      false,
    );
    const proof = proveProductionUntouched({
      databaseUrl: `postgres://u:p@db.${ROYAL_CAPE_STAGING_IDENTITY.supabaseProjectRef}.supabase.co/postgres`,
      xeroWriteCalls: 0,
      customerSendCalls: 0,
      productionMigrationApplied: false,
    });
    assert.equal(proof.productionTouched, false);
  });

  it('treats Xero as canonical when screenshot differs', () => {
    const compare = compareScreenshotToXeroQuote({
      quoteNumber: ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
      issuedAt: '2026-07-16',
      subtotalCents: 3_800_000,
      vatCents: 570_000,
      totalCents: 4_370_000,
      currency: 'ZAR',
      reference: 'Other',
      customerName: 'Legal Name From Xero',
    });
    assert.equal(compare.xeroWins, true);
    assert.ok(compare.diffs.some((d) => d.field === 'totalCents' && d.winner === 'XERO'));
    assert.equal(ROYAL_CAPE_SCREENSHOT_EVIDENCE.authority, 'screenshot_supporting_only');
  });

  it('never allows creating a duplicate QU-0183', () => {
    const found = planCanonicalQuoteMatch({ quotes: [sampleQuote()] });
    assert.equal(found.decision, 'USE_EXISTING');
    assert.equal(found.createQuoteAllowed, false);

    const missing = planCanonicalQuoteMatch({ quotes: [] });
    assert.equal(missing.decision, 'MISSING_CANONICAL');
    assert.equal(missing.createQuoteAllowed, false);

    const dupes = planCanonicalQuoteMatch({
      quotes: [sampleQuote({ titanQuoteId: 'a' }), sampleQuote({ titanQuoteId: 'b' })],
    });
    assert.equal(dupes.decision, 'REVIEW_REQUIRED');
  });

  it('keeps quote-linked company canonical and preserves related contacts without merge', () => {
    const customer = planCustomerMatch({
      quoteCustomerId: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
      candidates: [
        {
          id: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
          name: 'CRC',
          email: 'rowan@crcon.co.za',
          phone: null,
          sourceExternalId: ROYAL_CAPE_OWNER_CRC.xeroContactId,
          matchReasons: ['quote'],
        },
        {
          id: ROYAL_CAPE_OWNER_CRC.rowanCrcCustomerId,
          name: 'Rowan CRC',
          email: 'Rowan@crcon.co.za',
          phone: null,
          sourceExternalId: 'b37e7820-178f-42d1-8855-11d647c42d62',
          matchReasons: ['name'],
        },
      ],
    });
    assert.equal(customer.decision, 'USE_EXISTING');
    assert.equal(customer.customer?.id, ROYAL_CAPE_OWNER_CRC.titanCustomerId);
    assert.equal(customer.duplicateCandidates.length, 0);
    assert.equal(customer.relatedContactsToPreserve.length, 1);
    assert.equal(customer.relatedContactsToPreserve[0]?.id, ROYAL_CAPE_OWNER_CRC.rowanCrcCustomerId);

    const ownerOk = assertOwnerCrcCanonical({
      quoteCustomerId: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
      xeroContactId: ROYAL_CAPE_OWNER_CRC.xeroContactId,
      selectedCustomerId: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
    });
    assert.equal(ownerOk.ok, true);
    assert.equal(
      assertOwnerCrcCanonical({
        quoteCustomerId: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
        xeroContactId: ROYAL_CAPE_OWNER_CRC.xeroContactId,
        selectedCustomerId: ROYAL_CAPE_OWNER_CRC.rowanCrcCustomerId,
      }).ok,
      false,
    );

    const syncFail = classifyQuoteSyncFailure({
      syncStatus: 'failed',
      lastError: 'Xero write blocked: no approval for quote_create on quote:41178762',
      xeroQuoteId: '4d9b1ceb-83dc-4ac6-8d58-ce7ac08f6db8',
      lastSuccessfulSyncAt: '2026-08-04T13:31:44.608Z',
    });
    assert.equal(syncFail.classification, 'stale_outbound_write_block');
    assert.equal(syncFail.xeroWriteRequiredToClear, false);

    const strictReview = planCustomerMatch({
      quoteCustomerId: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
      preserveRelatedContactsWithoutMerge: false,
      candidates: [
        {
          id: ROYAL_CAPE_OWNER_CRC.titanCustomerId,
          name: 'CRC',
          email: null,
          phone: null,
          sourceExternalId: ROYAL_CAPE_OWNER_CRC.xeroContactId,
          matchReasons: ['quote'],
        },
        {
          id: ROYAL_CAPE_OWNER_CRC.rowanCrcCustomerId,
          name: 'Rowan CRC',
          email: null,
          phone: null,
          sourceExternalId: 'x2',
          matchReasons: ['name'],
        },
      ],
    });
    assert.equal(strictReview.decision, 'REVIEW_REQUIRED');

    const sites = planRoyalCapePropertyMatch({
      customerId: 'cust-1',
      candidates: [
        {
          id: 'p1',
          name: 'Royal Cape Yacht Club',
          customerId: 'cust-1',
          address: null,
          sourceExternalId: null,
          matchReasons: ['name'],
        },
        {
          id: 'p2',
          name: 'Royal Cape Yacht Club - Marina',
          customerId: 'cust-1',
          address: null,
          sourceExternalId: null,
          matchReasons: ['name'],
        },
      ],
    });
    assert.equal(sites.decision, 'REVIEW_REQUIRED');

    const createSite = planRoyalCapePropertyMatch({ customerId: 'cust-1', candidates: [] });
    assert.equal(createSite.decision, 'CREATE_ONCE');
  });

  it('plans exactly one Job linked to QU-0183', () => {
    const quote = sampleQuote();
    const create = planRoyalCapeJobMatch({
      customerId: 'cust-1',
      propertyId: 'prop-1',
      quote,
      candidates: [],
    });
    assert.equal(create.decision, 'CREATE_ONCE');

    const link = planRoyalCapeJobMatch({
      customerId: 'cust-1',
      propertyId: 'prop-1',
      quote,
      candidates: [
        {
          id: 'job-1',
          jobNumber: 'JOB-100',
          title: 'Royal Cape works',
          customerId: 'cust-1',
          propertyId: 'prop-1',
          status: 'new',
          executionPhase: null,
          quoteNumbers: [],
          matchReasons: ['site'],
        },
      ],
    });
    assert.equal(link.decision, 'LINK_EXISTING');

    const already = planRoyalCapeJobMatch({
      customerId: 'cust-1',
      propertyId: 'prop-1',
      quote: sampleQuote({ jobId: 'job-9' }),
      candidates: [
        {
          id: 'job-9',
          jobNumber: 'JOB-9',
          title: 'Linked',
          customerId: 'cust-1',
          propertyId: 'prop-1',
          status: 'in_progress',
          executionPhase: 'work_continues',
          quoteNumbers: [ROYAL_CAPE_CANONICAL_QUOTE_NUMBER],
          matchReasons: ['quote'],
        },
      ],
    });
    assert.equal(already.decision, 'ALREADY_LINKED');
  });

  it('builds Job 360 view without inventing field evidence', () => {
    const view = buildRoyalCapeJob360View({
      jobNumber: 'JOB-RC-1',
      customerName: 'Cape Rowing Club NPC',
      status: 'new',
      quote: sampleQuote(),
      paymentCount: 0,
      quotePdfLinked: false,
      historyEvents: ['quote_matched', 'job_created', 'quote_linked_to_job'],
    });
    assert.equal(view.commercial.quoteNumber, 'QU-0183');
    assert.equal(view.payment.state, 'unpaid_no_payment_record');
    assert.equal(view.invented.photos, false);
    assert.equal(view.invented.payments, false);
    assert.equal(view.documents.inventDocumentsForbidden, true);
  });

  it('rehearses multi-day Still Busy without completing or invoicing', () => {
    const rehearsal = rehearseRoyalCapeMultiDayWorkflow();
    assert.equal(rehearsal.oneJobPersists, true);
    assert.equal(rehearsal.stillBusyBlocksFinalInvoice, true);
    assert.equal(rehearsal.invoiceGate.blocked, true);
    assert.equal(rehearsal.stillBusyKeepsJobOpen, true);
    assert.equal(rehearsal.noDuplicateJobsPerDay, true);
    const stillBusy = rehearsal.steps.find((s) => s.step.startsWith('Still Busy'));
    assert.equal(stillBusy?.allowed, true);
  });

  it('keeps JPE honest and RBAC/client finance separated', () => {
    const jpe = assertRoyalCapeJpeRelationship({
      quotedRevenueCents: 4_272_250,
      paymentCount: 0,
      labourCostCents: 0,
      materialCostCents: 0,
    });
    assert.equal(jpe.quoteIsNotCashReceived, true);

    const rbac = assertRoyalCapeRbacSeparation({
      ownerPermissions: ['finance:read'],
      technicianPermissions: ['jobs:read'],
      clientPayload: {
        quoteNumber: 'QU-0183',
        totalCents: 4_272_250,
        estimatedCostCents: 99,
        jpe: { margin: 1 },
        marginBps: 1200,
      },
    });
    assert.equal(rbac.ownerMaySeeJpe, true);
    assert.equal(rbac.technicianMaySeeJpe, false);
    assert.equal(rbac.clientHasNoInternalFinance, true);
    assert.equal(rbac.clientStripped.quoteNumber, 'QU-0183');
  });

  it('is idempotent and records audit without fake data', () => {
    assert.equal(
      assertRoyalCapeIdempotency({
        first: { customerId: 'c', propertyId: 'p', jobId: 'j', quoteId: 'q' },
        second: { customerId: 'c', propertyId: 'p', jobId: 'j', quoteId: 'q' },
      }).idempotent,
      true,
    );
    const audit = buildRoyalCapeAuditEvents({
      actorUserId: 'user-1',
      tenantCompanyId: ROYAL_CAPE_STAGING_IDENTITY.youngGunsCompanyId,
      quoteId: 'q-1',
      customerId: 'c-1',
      propertyId: 'p-1',
      propertyCreated: true,
      jobId: 'j-1',
      jobCreated: true,
      quoteLinked: true,
      documentLinked: false,
    });
    assert.ok(audit.some((e) => e.action === 'quote_linked_to_job'));
    assert.ok(audit.every((e) => e.source === 'royal_cape_staging_rehearsal'));
  });

  it('keeps full-history rule active and safety contract closed', () => {
    const full = assertFullHistoryRuleRemainsActive();
    assert.equal(full.active, true);
    assert.equal(full.syncModeRequiredForInitialMigration, 'FULL_HISTORY');
    assert.equal(ROYAL_CAPE_SAFETY_CONTRACT.noLiveXeroWrites, true);
    assert.equal(ROYAL_CAPE_SAFETY_CONTRACT.noLiveCustomerSends, true);
    assert.equal(ROYAL_CAPE_SAFETY_CONTRACT.doNotRecreateQuote, true);
  });

  it('builds an end-to-end rehearsal plan for happy path', () => {
    const plan = buildRoyalCapeRehearsalPlan({
      quotes: [sampleQuote()],
      customers: [
        {
          id: 'cust-1',
          name: 'Cape Rowing Club NPC',
          email: null,
          phone: null,
          sourceExternalId: 'x-contact',
          matchReasons: ['quote.customerId'],
        },
      ],
      properties: [],
      jobs: [],
    });
    assert.equal(plan.quotePlan.decision, 'USE_EXISTING');
    assert.equal(plan.customerPlan.decision, 'USE_EXISTING');
    assert.equal(plan.propertyPlan.decision, 'CREATE_ONCE');
    assert.equal(plan.jobPlan.decision, 'CREATE_ONCE');
    assert.equal(plan.blocked, false);
    assert.equal(plan.multiDay.invoiceGate.blocked, true);
  });
});
