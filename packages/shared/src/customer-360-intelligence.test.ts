import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildC360InsightDraftSeeds,
  buildC360TimelineEvents,
  buildC360ValueSnapshot,
  canAccessCustomer360Intelligence,
  canViewCustomer360Finance,
  canViewCustomer360InternalNotes,
  canWriteCustomer360Intelligence,
  C360_GUARANTEES,
  C360_PRODUCT_COPY,
  defaultC360Settings,
  listC360Connections,
} from './customer-360-intelligence.js';

describe('customer 360 intelligence', () => {
  it('RBAC: staff with customers:read; Technician/Client denied; finance gated', () => {
    assert.equal(
      canAccessCustomer360Intelligence({ roleName: 'Company Owner', permissions: [] }),
      true,
    );
    assert.equal(
      canAccessCustomer360Intelligence({
        roleName: 'Manager',
        permissions: ['customers:read'],
      }),
      true,
    );
    assert.equal(
      canAccessCustomer360Intelligence({ roleName: 'Technician', permissions: ['customers:read'] }),
      false,
    );
    assert.equal(canAccessCustomer360Intelligence({ roleName: 'Client', permissions: ['*'] }), false);
    assert.equal(
      canViewCustomer360Finance({ roleName: 'Manager', permissions: ['customers:read'] }),
      false,
    );
    assert.equal(
      canViewCustomer360Finance({ roleName: 'Manager', permissions: ['customers:read', 'finance:read'] }),
      true,
    );
    assert.equal(
      canViewCustomer360InternalNotes({ roleName: 'Manager', permissions: ['customers:read'] }),
      false,
    );
    assert.equal(
      canViewCustomer360InternalNotes({ roleName: 'Manager', permissions: ['customers:write'] }),
      true,
    );
    assert.equal(
      canWriteCustomer360Intelligence({ roleName: 'Manager', permissions: ['customers:write'] }),
      true,
    );
  });

  it('honest unavailable value + no invent guarantees', () => {
    assert.equal(C360_GUARANTEES.rebuildsCrm, false);
    assert.equal(C360_GUARANTEES.autoSend, false);
    assert.equal(C360_GUARANTEES.crossCustomerVisibility, false);
    assert.equal(defaultC360Settings().autoSendEnabled, false);
    assert.equal(defaultC360Settings().inventCustomersEnabled, false);
    assert.ok(/never rebuilds CRM|does not rebuild CRM/i.test(C360_PRODUCT_COPY.existingCrm));
    const empty = buildC360ValueSnapshot({
      jobCount: 0,
      completedJobCount: 0,
      quoteCount: 0,
      invoiceCount: 0,
      paymentCount: 0,
      totalPaidCents: null,
      outstandingCents: null,
      financeHidden: false,
    });
    assert.equal(empty.availability, 'unavailable');
    assert.ok(/not invented/i.test(empty.rationale));
  });

  it('timeline unifies real events newest-first; insights are drafts only', () => {
    const timeline = buildC360TimelineEvents({
      activities: [{ id: 'a1', content: 'Called customer', createdAt: '2026-01-01T10:00:00.000Z' }],
      jobs: [
        {
          id: 'j1',
          title: 'Leak fix',
          status: 'completed',
          updatedAt: '2026-02-01T10:00:00.000Z',
          jobNumber: 'J-1',
        },
      ],
      quotes: [],
      invoices: [],
      payments: [],
      communications: [
        {
          id: 'c1',
          subject: 'ETA update',
          channel: 'email',
          occurredAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      documents: [],
      maintenance: [],
    });
    assert.equal(timeline.length, 3);
    assert.equal(timeline[0]!.kind, 'job');
    assert.equal(timeline[1]!.kind, 'communication');

    const seeds = buildC360InsightDraftSeeds({
      customerId: 'cust-1',
      customerName: 'Acme',
      completedJobCount: 3,
      openJobCount: 0,
      openMaintenancePlans: 1,
      overdueMaintenancePlans: 1,
      daysSinceLastJob: 130,
      daysSinceLastCommunication: 50,
      unpaidInvoiceCount: 1,
      doNotContact: false,
    });
    assert.ok(seeds.some((s) => s.kind === 'maintenance_opportunity'));
    assert.ok(seeds.some((s) => s.kind === 'follow_up'));
    assert.ok(seeds.some((s) => s.kind === 'retention'));
    assert.ok(seeds.every((s) => /draft|never auto/i.test(s.body)));
    assert.ok(listC360Connections().some((c) => c.href === '/crm'));
  });

  it('finance-hidden value strips amounts', () => {
    const snap = buildC360ValueSnapshot({
      jobCount: 2,
      completedJobCount: 1,
      quoteCount: 1,
      invoiceCount: 1,
      paymentCount: 1,
      totalPaidCents: 5000,
      outstandingCents: 1000,
      financeHidden: true,
    });
    assert.equal(snap.availability, 'available');
    assert.equal(snap.totalPaidCents, null);
    assert.equal(snap.outstandingCents, null);
    assert.equal(snap.financeHidden, true);
  });
});
