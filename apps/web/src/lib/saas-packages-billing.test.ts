/**
 * Department 21 — Packages UI wiring proofs.
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

describe('Department 21 SaaS packages UI', () => {
  it('Platform Plans tab shows package control columns', () => {
    const page = readWeb('../pages/platform/PlatformPage.tsx');
    assert.match(page, /Seed TITAN Packages/);
    assert.match(page, /Included seats/);
    assert.match(page, /Usage allowances/);
    assert.match(page, /Active tenants/);
    assert.match(page, /Configurable — not final launch pricing/);
    assert.match(page, /seedCanonicalPlans/);
    assert.match(page, /updateSubscriptionPlan/);
  });

  it('Tenant Owner subscription view shows seats / usage / renewal', () => {
    const page = readWeb('../pages/settings/OwnerBillingPage.tsx');
    assert.match(page, /fetchTenantSubscriptionView/);
    assert.match(page, /Included team/);
    assert.match(page, /Seats used/);
    assert.match(page, /Paid through/);
    assert.match(page, /Upgrade options/);
    assert.match(page, /Fair-use/);
    assert.doesNotMatch(page, /paymentProviderRef|estimatedCostCents|provider secret/i);
    assert.match(page, /Internal provider costs and margins are not shown/);
  });

  it('platform API client exposes plan admin + subscription view', () => {
    const client = readWeb('./platform-api-client.ts');
    assert.match(client, /seedCanonicalPlans/);
    assert.match(client, /updateSubscriptionPlan/);
    assert.match(client, /assignPlanToTenant/);
    assert.match(client, /fetchTenantSubscriptionView/);
  });
});
