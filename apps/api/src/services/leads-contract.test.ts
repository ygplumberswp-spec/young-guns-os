import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlaceholderEmail,
  isValidSaMobile,
  LEAD_STATUS_OPTIONS,
  LEAD_TERMINAL_STATUSES,
  normalizeSaMobile,
} from '@titan/shared';

describe('UX-D lead intake contract', () => {
  it('exposes canonical lifecycle statuses including intake and terminal states', () => {
    const values = LEAD_STATUS_OPTIONS.map((option) => option.value);
    for (const required of [
      'new',
      'attempted_contact',
      'contacted',
      'qualified',
      'awaiting_information',
      'quote_required',
      'ready_to_book',
      'converted',
      'lost',
      'duplicate',
    ]) {
      assert.ok(values.includes(required as never), `missing ${required}`);
    }
    assert.deepEqual(LEAD_TERMINAL_STATUSES, ['converted', 'lost', 'duplicate']);
  });

  it('normalises SA mobiles to E.164 for lead identity', () => {
    assert.equal(normalizeSaMobile('082 123 4567'), '+27821234567');
    assert.equal(isValidSaMobile('0821234567'), true);
    assert.equal(isValidSaMobile('0211234567'), false);
  });

  it('treats placeholder emails as non-identity', () => {
    assert.equal(isPlaceholderEmail('noreply@youngguns.co.za'), true);
    assert.equal(isPlaceholderEmail('owner@example-customer.co.za'), false);
  });

  it('keeps marketing consent conceptually separate from operational contact', () => {
    const lead = {
      marketingConsent: false,
      operationalContactPermission: true,
    };
    assert.notEqual(lead.marketingConsent, lead.operationalContactPermission);
  });
});
