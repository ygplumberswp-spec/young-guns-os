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

  it('builds greeting without finance or company invoice language', () => {
    const empty = buildTechnicianFieldGreeting({
      activeAssignedJobCount: 0,
      now: new Date('2026-08-07T10:00:00.000Z'),
    });
    assert.match(empty.message, /No jobs are assigned/);
    assert.equal(technicianFieldCopyLeaksFinance(empty.message), false);

    const one = buildTechnicianFieldGreeting({
      activeAssignedJobCount: 1,
      now: new Date('2026-08-07T10:00:00.000Z'),
    });
    assert.match(one.message, /1 assigned job/);
    assert.doesNotMatch(one.message, /invoice/i);
    assert.equal(technicianFieldCopyLeaksFinance(one.message), false);
  });

  it('detects forbidden finance copy', () => {
    assert.equal(
      technicianFieldCopyLeaksFinance('You have 1 job today, 3 unpaid invoices.'),
      true,
    );
  });
});
