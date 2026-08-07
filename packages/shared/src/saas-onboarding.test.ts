/**
 * Department 21 — Plug-and-play onboarding shared model proofs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SAAS_ONBOARDING_IMPORT_ENTITIES,
  SAAS_ONBOARDING_INTEGRATION_CATALOG,
  SAAS_ONBOARDING_STEPS,
  SAAS_TRADE_TYPES,
  computeOnboardingCompletionPercent,
  defaultOnboardingChecklist,
} from './saas-onboarding.js';

describe('SaaS onboarding shared model', () => {
  it('exposes ordered wizard steps Company→Review', () => {
    assert.deepEqual(
      SAAS_ONBOARDING_STEPS.map((step) => step.id),
      ['company', 'plan', 'team', 'import', 'integrations', 'operations', 'review'],
    );
  });

  it('trade types are configurable beyond plumbing', () => {
    const values = SAAS_TRADE_TYPES.map((entry) => entry.value);
    assert.ok(values.includes('plumbing'));
    assert.ok(values.includes('electrical'));
    assert.ok(values.includes('hvac'));
    assert.ok(values.includes('other'));
  });

  it('import catalog prioritises safe entities and does not claim unsupported commits', () => {
    const byType = Object.fromEntries(
      SAAS_ONBOARDING_IMPORT_ENTITIES.map((entity) => [entity.entityType, entity]),
    );
    assert.equal(byType.customer?.supported, true);
    assert.equal(byType.supplier?.supported, true);
    assert.equal(byType.inventory?.supported, true);
    assert.match(byType.inventory?.note ?? '', /Physical stock/i);
    assert.equal(byType.price_book?.supported, true);
    assert.match(byType.price_book?.note ?? '', /never creates stock/i);
    assert.equal(byType.property?.supported, true);
    assert.equal(byType.contact?.supported, true);
    assert.equal(byType.asset?.supported, true);
    assert.match(byType.asset?.note ?? '', /canonical asset registry/i);
    assert.equal(byType.job?.supported, true);
    assert.equal(byType.quote?.supported, true);
    assert.equal(byType.invoice?.supported, true);
    assert.match(byType.inventory?.note ?? '', /never overwritten/i);
  });

  it('integration catalog covers accounting/payments/maps/fleet/email/comms', () => {
    const keys = SAAS_ONBOARDING_INTEGRATION_CATALOG.map((item) => item.providerKey);
    for (const key of ['xero', 'yoco', 'google_maps', 'cartrack', 'gmail', 'whatsapp']) {
      assert.ok(keys.includes(key), `missing ${key}`);
    }
  });

  it('completion percent treats complete and skipped as done', () => {
    const checklist = defaultOnboardingChecklist();
    assert.equal(computeOnboardingCompletionPercent(checklist), 0);
    checklist.company = 'complete';
    checklist.plan = 'skipped';
    assert.equal(computeOnboardingCompletionPercent(checklist), Math.round((2 / 7) * 100));
  });
});
