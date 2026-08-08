import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUSTOMER_360_CRC_STAGING,
  CUSTOMER_360_SECTIONS,
  assertAssociationDoesNotMoveOwnership,
  assertPopDoesNotCreatePayment,
  assertRoyalCapeRelationshipUnchanged,
  assertSourceIdsPreserved,
  assertTechnicianDeniedCustomer360,
  buildAssociatedHistoryTimelineTag,
  buildCustomer360AuditActions,
  canAccessCustomer360,
  canWriteCustomer360,
  dedupeTimelineEvents,
  paginateTimelineEvents,
  planRuahnAssociation,
  resolveConsentTruth,
  type CustomerPerson,
} from './customer-360.js';
import type { C360TimelineEvent } from './customer-360-intelligence.js';

function person(overrides: Partial<CustomerPerson> = {}): CustomerPerson {
  return {
    id: 'p1',
    customerId: CUSTOMER_360_CRC_STAGING.canonicalCustomerId,
    firstName: 'Rowan',
    lastName: null,
    displayName: 'Rowan',
    roleTitle: null,
    email: 'rowan@example.com',
    phone: null,
    mobile: null,
    isPrimary: false,
    isBillingContact: false,
    isSiteContact: true,
    emailAllowed: true,
    smsAllowed: true,
    whatsappAllowed: true,
    phoneAllowed: true,
    preferredContactMethod: 'email',
    consentStatus: 'unknown',
    consentSource: null,
    consentCapturedAt: null,
    status: 'active',
    notes: null,
    sourceProvider: 'xero',
    sourceExternalId: 'b37e7820-178f-42d1-8855-11d647c42d62',
    linkedSourceCustomerId: CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('Customer 360 (Row 83)', () => {
  it('supports multiple named contacts on one company', () => {
    const people = [
      person({ id: 'p1', displayName: 'Rowan', firstName: 'Rowan' }),
      person({
        id: 'p2',
        displayName: 'Ruahn',
        firstName: 'Ruahn',
        linkedSourceCustomerId: 'ruahn-id',
        sourceExternalId: 'xero-ruahn',
      }),
    ];
    assert.equal(people.length, 2);
    assert.equal(new Set(people.map((p) => p.customerId)).size, 1);
    assert.equal(people[0]!.customerId, CUSTOMER_360_CRC_STAGING.canonicalCustomerId);
  });

  it('keeps contact source IDs preserved and tenant-scoped by customerId', () => {
    const before = {
      sourceExternalId: 'xero-1',
      xeroContactId: CUSTOMER_360_CRC_STAGING.xeroContactId,
      quoteNumber: 'QU-0183',
    };
    assert.deepEqual(assertSourceIdsPreserved({ before, after: { ...before } }), {
      preserved: true,
    });
    assert.throws(() =>
      assertSourceIdsPreserved({
        before,
        after: { ...before, sourceExternalId: 'changed' },
      }),
    );
    const p = person();
    assert.equal(p.customerId, CUSTOMER_360_CRC_STAGING.canonicalCustomerId);
    assert.ok(p.sourceExternalId);
  });

  it('non-destructive association preserves ownership and Xero records', () => {
    const quotes = [CUSTOMER_360_CRC_STAGING.canonicalCustomerId, CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId];
    const invoices = [CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId];
    assert.deepEqual(
      assertAssociationDoesNotMoveOwnership({
        quoteCustomerIdsBefore: quotes,
        quoteCustomerIdsAfter: quotes,
        invoiceCustomerIdsBefore: invoices,
        invoiceCustomerIdsAfter: invoices,
      }),
      { ownershipUnchanged: true },
    );
    assert.throws(() =>
      assertAssociationDoesNotMoveOwnership({
        quoteCustomerIdsBefore: quotes,
        quoteCustomerIdsAfter: [CUSTOMER_360_CRC_STAGING.canonicalCustomerId],
        invoiceCustomerIdsBefore: invoices,
        invoiceCustomerIdsAfter: invoices,
      }),
    );
  });

  it('keeps CRC canonical and Rowan history preservable', () => {
    assert.equal(CUSTOMER_360_CRC_STAGING.canonicalName, 'CRC');
    assert.notEqual(
      CUSTOMER_360_CRC_STAGING.canonicalCustomerId,
      CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId,
    );
    const rowan = person();
    assert.equal(rowan.linkedSourceCustomerId, CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId);
    assert.equal(rowan.status, 'active');
  });

  it('stops Ruahn association when ambiguous', () => {
    assert.equal(planRuahnAssociation({ candidates: [] }).decision, 'NOT_FOUND');
    assert.equal(
      planRuahnAssociation({
        candidates: [
          { id: 'a', name: 'Ruahn CRC' },
          { id: 'b', name: 'Ruahn C R C' },
        ],
      }).decision,
      'REVIEW_REQUIRED',
    );
    assert.equal(
      planRuahnAssociation({ candidates: [{ id: 'a', name: 'Ruahn CRC' }] }).decision,
      'ASSOCIATE',
    );
  });

  it('models contact create/edit/deactivate without inventing consent', () => {
    const created = person({ displayName: 'New Contact', consentStatus: 'unknown' });
    assert.equal(created.status, 'active');
    const edited = { ...created, roleTitle: 'Site lead', email: 'n@example.com' };
    assert.equal(edited.roleTitle, 'Site lead');
    const deactivated = { ...edited, status: 'inactive' as const };
    assert.equal(deactivated.status, 'inactive');
    const consent = resolveConsentTruth({
      explicitConsentStatus: 'unknown',
      doNotContact: false,
      hasEmail: true,
      hasPhone: true,
    });
    assert.equal(consent.status, 'unknown');
    assert.equal(consent.inferredFromContactPresence, false);
  });

  it('treats opt-out as authoritative', () => {
    const denied = resolveConsentTruth({
      explicitConsentStatus: 'denied',
      doNotContact: false,
      hasEmail: true,
      hasPhone: false,
    });
    assert.equal(denied.optOutAuthoritative, true);
    const dnc = resolveConsentTruth({
      explicitConsentStatus: 'granted',
      doNotContact: true,
      hasEmail: true,
      hasPhone: true,
    });
    assert.equal(dnc.status, 'do_not_contact');
  });

  it('exposes billing/notes/properties/equipment section contracts', () => {
    const keys = CUSTOMER_360_SECTIONS.map((s) => s.key);
    for (const required of [
      'overview',
      'people',
      'properties',
      'equipment',
      'leads',
      'jobs',
      'quotes',
      'invoices',
      'payments',
      'documents',
      'communications',
      'notes',
    ]) {
      assert.ok(keys.includes(required as (typeof keys)[number]));
    }
  });

  it('builds leads/jobs/quotes/invoices/payments/documents/comms timeline without duplicates', () => {
    const events: C360TimelineEvent[] = [
      {
        id: 'job:1',
        kind: 'job',
        occurredAt: '2026-08-01T00:00:00.000Z',
        title: 'Job',
        summary: 'open',
        href: '/jobs/1',
        relatedId: '1',
      },
      {
        id: 'quote:1',
        kind: 'quote',
        occurredAt: '2026-07-15T00:00:00.000Z',
        title: 'Quote QU-0183',
        summary: 'sent',
        href: '/finance/quotes/1',
        relatedId: '1',
      },
      {
        id: 'invoice:1',
        kind: 'invoice',
        occurredAt: '2026-07-20T00:00:00.000Z',
        title: 'Invoice',
        summary: 'sent',
        href: '/finance/invoices/1',
        relatedId: '1',
      },
      {
        id: 'payment:1',
        kind: 'payment',
        occurredAt: '2026-07-21T00:00:00.000Z',
        title: 'Payment',
        summary: 'paid',
        href: '/finance/payments',
        relatedId: '1',
      },
      {
        id: 'doc:1',
        kind: 'document',
        occurredAt: '2026-07-16T00:00:00.000Z',
        title: 'Document',
        summary: 'file',
        href: '/documents',
        relatedId: '1',
      },
      {
        id: 'comm:1',
        kind: 'communication',
        occurredAt: '2026-07-17T00:00:00.000Z',
        title: 'email',
        summary: 'hi',
        href: '/communication-timeline',
        relatedId: '1',
      },
      {
        id: 'job:1',
        kind: 'job',
        occurredAt: '2026-08-01T00:00:00.000Z',
        title: 'Job',
        summary: 'duplicate',
        href: '/jobs/1',
        relatedId: '1',
      },
    ];
    const deduped = dedupeTimelineEvents(events);
    assert.equal(deduped.length, 6);
    const page = paginateTimelineEvents({ events, limit: 2, offset: 0, order: 'newest' });
    assert.equal(page.events.length, 2);
    assert.equal(page.hasMore, true);
    assert.equal(page.total, 6);
    assert.ok(page.events[0]!.occurredAt >= page.events[1]!.occurredAt);
  });

  it('enforces Owner/office access and denies Technician/Client', () => {
    assert.equal(canAccessCustomer360({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(
      canWriteCustomer360({ roleName: 'Manager', permissions: ['customers:write'] }),
      true,
    );
    assert.equal(
      assertTechnicianDeniedCustomer360({ roleName: 'Technician', permissions: ['customers:read'] })
        .allowed,
      false,
    );
    assert.equal(
      assertTechnicianDeniedCustomer360({ roleName: 'Client', permissions: ['*'] }).allowed,
      false,
    );
  });

  it('keeps POP from creating payments and Royal Cape relationship unchanged', () => {
    assert.deepEqual(
      assertPopDoesNotCreatePayment({
        popDocumentCount: 3,
        paymentCount: 0,
        paymentsInventedFromPop: false,
      }),
      { ok: true },
    );
    assert.throws(() =>
      assertPopDoesNotCreatePayment({
        popDocumentCount: 1,
        paymentCount: 1,
        paymentsInventedFromPop: true,
      }),
    );
    assert.deepEqual(
      assertRoyalCapeRelationshipUnchanged({
        quoteId: CUSTOMER_360_CRC_STAGING.royalCapeQuoteId,
        quoteNumber: 'QU-0183',
        customerId: CUSTOMER_360_CRC_STAGING.canonicalCustomerId,
        xeroQuoteId: CUSTOMER_360_CRC_STAGING.royalCapeXeroQuoteId,
        jobId: '5920ef4a-51a9-44ec-8577-09d187ca9c33',
      }),
      { unchanged: true },
    );
  });

  it('tags associated history without colliding timeline ids', () => {
    const tag = buildAssociatedHistoryTimelineTag({
      sourceCustomerId: CUSTOMER_360_CRC_STAGING.rowanSourceCustomerId,
      sourceCustomerName: 'Rowan CRC',
      kind: 'quote',
      relatedId: 'q-1',
    });
    assert.match(tag, /^assoc:/);
    assert.ok(buildCustomer360AuditActions().includes('customer_source_associated'));
  });
});
