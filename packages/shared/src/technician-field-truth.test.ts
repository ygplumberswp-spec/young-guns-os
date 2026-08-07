import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTechnicianFieldGreeting,
  countTechnicianActiveAssignedJobs,
  technicianFieldCopyLeaksFinance,
} from './technician-field-truth.js';

describe('YG-CUTOVER-001E technician field truth', () => {
  it('counts active assigned jobs consistently for greeting/jobs/route', () => {
    assert.equal(
      countTechnicianActiveAssignedJobs([
        { status: 'scheduled' },
        { status: 'in_progress' },
        { status: 'completed' },
        { status: 'cancelled' },
      ]),
      2,
    );
  });

  it('uses only the caller-supplied assigned list (no other tech / tenant bleed)', () => {
    const techAJobs = [{ status: 'scheduled' }, { status: 'en_route' }];
    const techBJobs = [
      { status: 'scheduled' },
      { status: 'in_progress' },
      { status: 'paused' },
      { status: 'on_site' },
    ];
    const tenantXJobs = [{ status: 'scheduled' }];

    const countA = countTechnicianActiveAssignedJobs(techAJobs);
    const countB = countTechnicianActiveAssignedJobs(techBJobs);
    const countX = countTechnicianActiveAssignedJobs(tenantXJobs);

    assert.equal(countA, 2);
    assert.equal(countB, 4);
    assert.equal(countX, 1);

    const greetingA = buildTechnicianFieldGreeting({ activeAssignedJobCount: countA });
    const greetingB = buildTechnicianFieldGreeting({ activeAssignedJobCount: countB });
    assert.equal(greetingA.message, 'You have 2 jobs today.');
    assert.equal(greetingB.message, 'You have 4 jobs today.');
    assert.notEqual(greetingA.message, greetingB.message);
  });

  it('builds 0 / 1 / many job greetings with singular/plural and no extras', () => {
    const zero = buildTechnicianFieldGreeting({ activeAssignedJobCount: 0 });
    assert.equal(zero.message, 'You have 0 jobs today.');

    const one = buildTechnicianFieldGreeting({ activeAssignedJobCount: 1 });
    assert.equal(one.message, 'You have 1 job today.');

    const many = buildTechnicianFieldGreeting({ activeAssignedJobCount: 5 });
    assert.equal(many.message, 'You have 5 jobs today.');

    for (const greeting of [zero, one, many]) {
      assert.doesNotMatch(greeting.message, /good (morning|afternoon|evening)/i);
      assert.doesNotMatch(greeting.message, /unpaid/i);
      assert.doesNotMatch(greeting.message, /invoice/i);
      assert.doesNotMatch(greeting.message, /revenue|profit|payment|finance/i);
      assert.equal(technicianFieldCopyLeaksFinance(greeting.message), false);
      // Single sentence only.
      assert.equal(greeting.message.split('.').filter(Boolean).length, 1);
    }
  });

  it('never includes unpaid invoice or finance summary in greeting', () => {
    const greeting = buildTechnicianFieldGreeting({ activeAssignedJobCount: 1 });
    assert.equal(greeting.message, 'You have 1 job today.');
    assert.doesNotMatch(greeting.message, /unpaid invoice/i);
    assert.doesNotMatch(greeting.message, /outstanding/i);
    assert.equal(technicianFieldCopyLeaksFinance(greeting.message), false);
    assert.equal(
      technicianFieldCopyLeaksFinance('You have 1 job today, 3 unpaid invoices.'),
      true,
    );
  });

  it('greeting count is the canonical activeAssignedJobCount input (no separate calc)', () => {
    const assigned = [
      { status: 'scheduled' },
      { status: 'dispatched' },
      { status: 'completed' },
    ];
    const canonical = countTechnicianActiveAssignedJobs(assigned);
    assert.equal(canonical, 2);
    assert.equal(
      buildTechnicianFieldGreeting({ activeAssignedJobCount: canonical }).message,
      'You have 2 jobs today.',
    );
  });
});
