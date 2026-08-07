import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLongOpenJobAttention,
  buildRepeatedRescheduleAttention,
  isInvoiceBlockedByVisitState,
  JOB_RESCHEDULE_REASONS,
} from './job-visits.js';

describe('isInvoiceBlockedByVisitState', () => {
  it('blocks when phase is work_continues', () => {
    const gate = isInvoiceBlockedByVisitState({
      executionPhase: 'work_continues',
      hasOpenVisit: false,
      jobCompleted: false,
    });
    assert.equal(gate.blocked, true);
    assert.match(gate.reason ?? '', /Still Busy|work continues/i);
  });

  it('blocks when an open visit exists', () => {
    const gate = isInvoiceBlockedByVisitState({
      executionPhase: 'in_progress',
      hasOpenVisit: true,
      jobCompleted: false,
    });
    assert.equal(gate.blocked, true);
  });

  it('does not block after final completion', () => {
    const gate = isInvoiceBlockedByVisitState({
      executionPhase: 'completed',
      hasOpenVisit: false,
      jobCompleted: true,
    });
    assert.equal(gate.blocked, false);
  });
});

describe('reschedule attention', () => {
  it('surfaces repeated reschedules for owner review', () => {
    const item = buildRepeatedRescheduleAttention({
      jobId: 'job-1',
      jobTitle: 'YG-100',
      customerName: 'Acme',
      rescheduleCount: 2,
    });
    assert.ok(item);
    assert.equal(item!.priority, 'attention');
    assert.equal(item!.draftActionAvailable, false);
    assert.equal(item!.href, '/jobs/job-1');
  });

  it('escalates at 4+ reschedules', () => {
    const item = buildRepeatedRescheduleAttention({
      jobId: 'job-2',
      jobTitle: 'YG-200',
      customerName: null,
      rescheduleCount: 4,
    });
    assert.equal(item?.priority, 'critical');
  });

  it('surfaces long-open multi-day jobs', () => {
    const item = buildLongOpenJobAttention({
      jobId: 'job-3',
      jobTitle: 'YG-300',
      customerName: null,
      openDays: 5,
      visitCount: 3,
    });
    assert.ok(item);
    assert.match(item!.reason, /Still Busy|multi-day/i);
    assert.equal(item!.ageLabel, '5d');
  });
});

describe('JOB_RESCHEDULE_REASONS', () => {
  it('includes field reasons from the brief', () => {
    for (const code of [
      'customer_unavailable',
      'parts_required',
      'access_problem',
      'additional_work_required',
      'site_not_ready',
    ] as const) {
      assert.ok(JOB_RESCHEDULE_REASONS.includes(code));
    }
  });
});
