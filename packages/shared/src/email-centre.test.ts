import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMM_ATTACHMENT_KINDS } from './email-centre.js';
import { OWNER_STAFF_NAV_ITEMS, DISPATCHER_ALLOWED_HREFS } from './role-experience.js';

describe('email centre contracts', () => {
  it('supports document attachment kinds without blob storage assumptions', () => {
    assert.deepEqual(
      [...COMM_ATTACHMENT_KINDS].sort(),
      ['boq', 'coc', 'document', 'invoice', 'job_photo', 'quote', 'receipt', 'report'].sort(),
    );
  });

  it('registers Email Centre and Communication Timeline in staff nav', () => {
    const email = OWNER_STAFF_NAV_ITEMS.find((item) => item.href === '/email-centre');
    const timeline = OWNER_STAFF_NAV_ITEMS.find((item) => item.href === '/communication-timeline');
    assert.ok(email);
    assert.equal(email?.label, 'Email Centre');
    assert.ok(timeline);
    assert.equal(timeline?.label, 'Communication Timeline');
    assert.ok(DISPATCHER_ALLOWED_HREFS.has('/email-centre'));
    assert.ok(DISPATCHER_ALLOWED_HREFS.has('/communication-timeline'));
  });
});
