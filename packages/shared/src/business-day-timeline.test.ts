import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBusinessDayTimelineSummary,
  categoryForTimeEntry,
  labelForWorkflowAction,
  mergeBusinessDayTimelineEvents,
  parseBusinessDayRange,
  type BusinessDayTimelineEvent,
} from './business-day-timeline.js';

describe('parseBusinessDayRange', () => {
  it('returns UTC bounds for a valid ISO date', () => {
    const { from, to } = parseBusinessDayRange('2026-08-01');
    assert.equal(from.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(to.toISOString(), '2026-08-01T23:59:59.999Z');
  });

  it('rejects invalid date strings', () => {
    assert.throws(() => parseBusinessDayRange('08-01-2026'), /INVALID_DATE/);
    assert.throws(() => parseBusinessDayRange('not-a-date'), /INVALID_DATE/);
  });
});

describe('categoryForTimeEntry', () => {
  it('maps entry types to timeline categories', () => {
    assert.equal(categoryForTimeEntry('clock_in'), 'attendance');
    assert.equal(categoryForTimeEntry('job_time'), 'labour');
    assert.equal(categoryForTimeEntry('travel'), 'travel');
    assert.equal(categoryForTimeEntry('break_start'), 'break');
  });
});

describe('labelForWorkflowAction', () => {
  it('returns human labels for known actions', () => {
    assert.equal(labelForWorkflowAction('en_route'), 'Started travel');
    assert.equal(labelForWorkflowAction('complete'), 'Completed job');
  });

  it('falls back to spaced action name', () => {
    assert.equal(labelForWorkflowAction('custom_action'), 'custom action');
  });
});

describe('mergeBusinessDayTimelineEvents', () => {
  it('sorts events newest first', () => {
    const events: BusinessDayTimelineEvent[] = [
      {
        id: '1',
        kind: 'time_entry',
        occurredAt: '2026-08-01T08:00:00.000Z',
        label: 'Clock in',
        detail: null,
        userId: 'u1',
        userName: 'Tech',
        jobId: null,
        jobNumber: null,
        jobTitle: null,
        durationMinutes: null,
        category: 'attendance',
      },
      {
        id: '2',
        kind: 'workflow',
        occurredAt: '2026-08-01T10:00:00.000Z',
        label: 'Started work',
        detail: null,
        userId: 'u1',
        userName: 'Tech',
        jobId: 'j1',
        jobNumber: 'JOB-000001',
        jobTitle: 'Leak repair',
        durationMinutes: null,
        category: 'workflow',
      },
    ];

    const merged = mergeBusinessDayTimelineEvents(events);
    assert.equal(merged[0]?.id, '2');
    assert.equal(merged[1]?.id, '1');
  });
});

describe('buildBusinessDayTimelineSummary', () => {
  it('aggregates labour, travel and workflow counts', () => {
    const events: BusinessDayTimelineEvent[] = [
      {
        id: '1',
        kind: 'time_entry',
        occurredAt: '2026-08-01T09:00:00.000Z',
        label: 'On-site labour',
        detail: null,
        userId: 'u1',
        userName: 'A',
        jobId: 'j1',
        jobNumber: 'JOB-1',
        jobTitle: 'Job',
        durationMinutes: 45,
        category: 'labour',
      },
      {
        id: '2',
        kind: 'time_entry',
        occurredAt: '2026-08-01T08:30:00.000Z',
        label: 'Travel',
        detail: null,
        userId: 'u1',
        userName: 'A',
        jobId: 'j1',
        jobNumber: 'JOB-1',
        jobTitle: 'Job',
        durationMinutes: 20,
        category: 'travel',
      },
      {
        id: '3',
        kind: 'workflow',
        occurredAt: '2026-08-01T10:00:00.000Z',
        label: 'Arrived',
        detail: null,
        userId: 'u2',
        userName: 'B',
        jobId: 'j2',
        jobNumber: 'JOB-2',
        jobTitle: 'Other',
        durationMinutes: null,
        category: 'workflow',
      },
    ];

    const summary = buildBusinessDayTimelineSummary('2026-08-01', events);
    assert.equal(summary.totalEvents, 3);
    assert.equal(summary.uniqueUsers, 2);
    assert.equal(summary.totalJobTimeMinutes, 45);
    assert.equal(summary.totalTravelMinutes, 20);
    assert.equal(summary.workflowEventCount, 1);
  });
});
