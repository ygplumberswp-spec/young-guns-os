import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  emptyCustomerMergeLinkCounts,
  isCustomerDuplicateCandidate,
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
  orderCustomerPairIds,
  scoreCustomerDuplicateEvidence,
  type CustomerDuplicateMatchEvidence,
  type CustomerMergeSideSnapshot,
} from '@titan/shared';
import {
  CustomerDuplicateMergeError,
  CustomerDuplicateMergeService,
} from './customer-duplicate-merge.service.js';

const servicePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'customer-duplicate-merge.service.ts',
);
const routePath = join(dirname(fileURLToPath(import.meta.url)), '../routes/crm.ts');
const source = readFileSync(servicePath, 'utf8');
const routeSource = readFileSync(routePath, 'utf8');

function side(partial: Partial<CustomerMergeSideSnapshot> & { id: string }): CustomerMergeSideSnapshot {
  return {
    name: 'Customer',
    contactPerson: null,
    email: null,
    phone: null,
    notes: null,
    status: 'active',
    doNotContact: false,
    isSupplierOnly: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    primaryAddressDisplay: null,
    xeroContactIds: [],
    linkCounts: emptyCustomerMergeLinkCounts(),
    hasActiveJobs: false,
    hasUnpaidInvoices: false,
    ...partial,
  };
}

describe('customer duplicate candidate detection', () => {
  it('requires strong evidence (phone/email/xero) or stacked weaker signals', () => {
    const nameOnly: CustomerDuplicateMatchEvidence[] = [
      { reason: 'normalized_name', detail: 'name', weight: 20 },
    ];
    assert.equal(isCustomerDuplicateCandidate(nameOnly), false);

    const phone: CustomerDuplicateMatchEvidence[] = [
      { reason: 'phone', detail: 'phone', weight: 40 },
    ];
    assert.equal(isCustomerDuplicateCandidate(phone), true);

    const email: CustomerDuplicateMatchEvidence[] = [
      { reason: 'email', detail: 'email', weight: 35 },
    ];
    assert.equal(isCustomerDuplicateCandidate(email), true);

    const xero: CustomerDuplicateMatchEvidence[] = [
      { reason: 'xero_mapping', detail: 'xero', weight: 50 },
    ];
    assert.equal(isCustomerDuplicateCandidate(xero), true);

    const stacked = [
      { reason: 'normalized_name', detail: 'name', weight: 20 },
      { reason: 'address_overlap', detail: 'addr', weight: 25 },
    ] satisfies CustomerDuplicateMatchEvidence[];
    assert.equal(scoreCustomerDuplicateEvidence(stacked) >= 40, true);
    assert.equal(isCustomerDuplicateCandidate(stacked), true);
  });

  it('normalizes match keys for phone/email/name comparison', () => {
    assert.equal(normalizeCustomerPhoneKey('082 555 0101'), normalizeCustomerPhoneKey('+27825550101'));
    assert.equal(normalizeCustomerEmailKey('A@B.com'), 'a@b.com');
    assert.equal(normalizeCustomerNameKey('Acme (Pty) Ltd'), normalizeCustomerNameKey('acme pty ltd'));
    assert.deepEqual(orderCustomerPairIds('b', 'a'), ['a', 'b']);
  });

  it('scan builds evidence from phone, email, name, address, and xero mappings', () => {
    assert.match(source, /reason: 'phone'/);
    assert.match(source, /reason: 'email'/);
    assert.match(source, /reason: 'normalized_name'/);
    assert.match(source, /reason: 'address_overlap'/);
    assert.match(source, /reason: 'xero_mapping'/);
    assert.match(source, /isCustomerDuplicateCandidate/);
    assert.match(source, /status === 'dismissed' \|\| existing\?\.status === 'merged'/);
  });
});

describe('customer duplicate merge RBAC and never-auto-merge', () => {
  it('blocks non-reviewers and non-owners via service guards', async () => {
    const service = new CustomerDuplicateMergeService({} as never);
    await assert.rejects(
      () =>
        service.listCandidates({
          userId: 'u1',
          companyId: 'c1',
          roleName: 'Technician',
          permissions: ['jobs:read'],
        }),
      (error: unknown) =>
        error instanceof CustomerDuplicateMergeError && error.code === 'FORBIDDEN',
    );

    await assert.rejects(
      () =>
        service.decide(
          {
            userId: 'u1',
            companyId: 'c1',
            roleName: 'Office Admin',
            permissions: ['customers:write'],
          },
          {
            leftCustomerId: '00000000-0000-4000-8000-000000000001',
            rightCustomerId: '00000000-0000-4000-8000-000000000002',
            decision: 'dismiss_not_duplicate',
          },
        ),
      (error: unknown) =>
        error instanceof CustomerDuplicateMergeError && error.code === 'FORBIDDEN',
    );
  });

  it('routes expose review/scan/preview/decide and owner-gated decide path', () => {
    assert.match(routeSource, /\/customers\/duplicates/);
    assert.match(routeSource, /\/customers\/duplicates\/scan/);
    assert.match(routeSource, /\/customers\/duplicates\/preview/);
    assert.match(routeSource, /\/customers\/duplicates\/decide/);
    assert.match(source, /Only Company Owner may dismiss or execute customer merges/);
    assert.match(source, /assertOwner\(actor\)/);
    assert.doesNotMatch(source, /auto[-_]?merge/i);
  });
});

describe('customer duplicate merge preservation and conflicts', () => {
  it('repoints core operational tables and preserves finance/history records', () => {
    for (const table of [
      'jobs',
      'quotes',
      'invoices',
      'documents',
      'communications',
      'customer_activities',
      'leads',
      'cx_customer_properties',
    ]) {
      assert.match(source, new RegExp(table));
    }
    assert.match(source, /mergedIntoCustomerId: survivorId/);
    assert.match(source, /status: 'inactive'/);
    assert.match(source, /customer_merged/);
    assert.match(source, /payments/);
    assert.doesNotMatch(source, /\.delete\(jobs\)/);
    assert.doesNotMatch(source, /\.delete\(invoices\)/);
    assert.doesNotMatch(source, /\.delete\(quotes\)/);
    assert.doesNotMatch(source, /\.delete\(payments\)/);
  });

  it('requires conflict confirmation and explicit Xero keep choice', () => {
    assert.match(source, /verified_phone_mismatch/);
    assert.match(source, /verified_email_mismatch/);
    assert.match(source, /address_mismatch/);
    assert.match(source, /separate_xero_mappings/);
    assert.match(source, /active_jobs_both/);
    assert.match(source, /unpaid_invoices_both/);
    assert.match(source, /confirmConflicts/);
    assert.match(source, /keepXeroContactId/);
    assert.match(source, /Choose which Xero contact mapping to keep/);
  });

  it('prevents duplicate provider mappings by keeping one Xero mapping', () => {
    assert.match(source, /mergeXeroMappings/);
    assert.match(source, /Keep one mapping on survivor/);
    assert.match(source, /\.delete\(xeroCustomerMappings\)/);
  });

  it('dismiss marks candidate as not duplicate without merging', () => {
    assert.match(source, /dismiss_not_duplicate/);
    assert.match(source, /status: 'dismissed'/);
    assert.match(source, /customer_duplicate_dismissed/);
    assert.match(source, /Dismissed as not duplicate/);
  });

  it('scopes all queries by companyId (tenant isolation)', () => {
    const companyScopedUpdates = source.match(/eq\([a-zA-Z]+\.companyId, companyId\)/g) ?? [];
    assert.ok(companyScopedUpdates.length >= 10);
    assert.match(source, /eq\(customerDuplicateCandidates\.companyId, actor\.companyId\)/);
    assert.match(source, /eq\(customers\.companyId, companyId\)/);
  });

  it('buildConflicts surfaces phone/email/xero/active-job conflicts for confirmation', () => {
    const service = new CustomerDuplicateMergeService({} as never);
    const conflicts = (
      service as unknown as {
        buildConflicts: (
          left: CustomerMergeSideSnapshot,
          right: CustomerMergeSideSnapshot,
        ) => Array<{ code: string }>;
      }
    ).buildConflicts(
      side({
        id: 'a',
        phone: '0825550101',
        email: 'alpha@acme.co.za',
        primaryAddressDisplay: '1 Main St',
        xeroContactIds: ['x1'],
        hasActiveJobs: true,
        hasUnpaidInvoices: true,
      }),
      side({
        id: 'b',
        phone: '0825550199',
        email: 'beta@acme.co.za',
        primaryAddressDisplay: '2 Side St',
        xeroContactIds: ['x2'],
        hasActiveJobs: true,
        hasUnpaidInvoices: true,
      }),
    );
    const codes = conflicts.map((item) => item.code);
    assert.ok(codes.includes('verified_phone_mismatch'));
    assert.ok(codes.includes('verified_email_mismatch'));
    assert.ok(codes.includes('address_mismatch'));
    assert.ok(codes.includes('separate_xero_mappings'));
    assert.ok(codes.includes('active_jobs_both'));
    assert.ok(codes.includes('unpaid_invoices_both'));
  });
});
