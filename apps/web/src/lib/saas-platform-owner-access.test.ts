/**
 * Department 21 — Platform Owner UI + customer locked-screen wiring proofs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function readWeb(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('Department 21 SaaS Platform Owner UI', () => {
  it('Platform tenants table shows control-plane columns and actions', () => {
    const page = readWeb('../pages/platform/PlatformPage.tsx');
    assert.match(page, /Paid Through/);
    assert.match(page, /statusChip/);
    assert.match(page, /suspendTenant/);
    assert.match(page, /reactivateTenant/);
    assert.match(page, /cancelTenantAccess/);
    assert.match(page, /Last Payment/);
    assert.match(page, /Business data preserved/);
  });

  it('customer locked experience is professional and non-technical', () => {
    const page = readWeb('../pages/subscription-attention/SubscriptionAttentionPage.tsx');
    assert.match(page, /TITAN subscription requires attention/);
    assert.match(page, /company data remains safely stored/i);
    assert.match(page, /Paid through/);
    assert.match(page, /Check access again/);
    assert.doesNotMatch(page, /companyId|paymentProviderRef|JWT|stack trace/i);
  });

  it('App wraps staff shells with SaasAccessGate', () => {
    const app = readWeb('../App.tsx');
    assert.match(app, /SaasAccessGate/);
    assert.match(app, /<SaasAccessGate>/);
  });

  it('platform API client exposes access-status and cancel-access', () => {
    const client = readWeb('./platform-api-client.ts');
    assert.match(client, /fetchSaasAccessStatus/);
    assert.match(client, /\/platform\/access-status/);
    assert.match(client, /cancelTenantAccess/);
    assert.match(client, /cancel-access/);
  });
});
