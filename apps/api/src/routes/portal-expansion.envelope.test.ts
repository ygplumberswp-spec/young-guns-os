import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'portal-expansion.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/portal-expansion.service.ts'),
  'utf8',
);

describe('portal expansion API envelope & safety', () => {
  it('wraps success responses with customer-safe honesty flags', () => {
    for (const pattern of [
      'invented: false as const',
      'ownDataOnly: true as const',
      'marginsHidden: true as const',
      'xeroInternalsHidden: true as const',
      'onlinePayAvailable: false as const',
      'internalNotesHidden: true as const',
      'customerVisibleOnly: true as const',
      'sharedOnly: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires portal auth + portal permissions on customer routes', () => {
    assert.ok(routeSource.includes('requirePortalAuth'));
    assert.ok(routeSource.includes("requirePortalPermission('portal.dashboard:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.jobs:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.quotes:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.invoices:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.documents:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.communications:read')"));
    assert.ok(routeSource.includes("requirePortalPermission('portal.appointments:read')"));
  });

  it('scopes queries by companyId and customerId', () => {
    assert.ok(serviceSource.includes('eq(jobs.companyId, scope.companyId)'));
    assert.ok(serviceSource.includes('eq(jobs.customerId, scope.customerId)'));
    assert.ok(serviceSource.includes('eq(quotes.companyId, scope.companyId)'));
    assert.ok(serviceSource.includes('eq(quotes.customerId, scope.customerId)'));
    assert.ok(serviceSource.includes('eq(invoices.companyId, scope.companyId)'));
    assert.ok(serviceSource.includes('eq(invoices.customerId, scope.customerId)'));
    assert.ok(serviceSource.includes('eq(communications.customerId, scope.customerId)'));
    assert.ok(serviceSource.includes("eq(communications.visibility, 'customer_visible')"));
  });

  it('never exposes margins, costs, Xero internals, or staff notes in mappers', () => {
    assert.ok(!serviceSource.includes('marginBps:'));
    assert.ok(!serviceSource.includes('grossProfitCents:'));
    assert.ok(!serviceSource.includes('unitCostCents:'));
    assert.ok(!serviceSource.includes('xeroPaymentId:'));
    assert.ok(!serviceSource.includes('yocoPaymentId:'));
    assert.ok(!serviceSource.includes('xeroReference:'));
    assert.ok(!serviceSource.includes('internalNotes:'));
    assert.ok(serviceSource.includes('customerVisibleNotes'));
    assert.ok(serviceSource.includes('buildPortalSafeInvoiceDisplayNumber'));
  });

  it('writes security audit logs for booking and document share actions', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes("action: 'cpe_booking_created'"));
    assert.ok(serviceSource.includes("action: 'cpe_document_shared'"));
    assert.ok(serviceSource.includes("action: 'cpe_document_share_revoked'"));
    assert.ok(serviceSource.includes("entityType: 'portal_expansion'"));
  });

  it('staff document shares require office RBAC (not Technician/Client)', () => {
    assert.ok(routeSource.includes('requireStaffAuth'));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(serviceSource.includes('canStaffManagePortalDocumentShares'));
    assert.ok(serviceSource.includes('canStaffReadPortalDocumentShares'));
  });
});
