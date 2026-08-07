import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPS_INTELLIGENCE_GUARANTEES,
  buildRunningLateSuggestedActions,
  computeLeaveByMs,
  detectJobScheduleReminder,
  shouldEmitReminder,
} from '@titan/shared';

describe('OpsIntelligenceService contracts (no auto-message / no auto-schedule)', () => {
  it('guarantees owner-controlled advisory-only behaviour', () => {
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.autoCustomerMessages, false);
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.autoScheduleChanges, false);
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.ownerApprovalRequired, true);
  });

  it('leave-by is dynamic from travel minutes (not fixed 20 when real travel exists)', () => {
    const scheduledAtMs = Date.parse('2026-08-02T14:00:00.000Z');
    const withTraffic = computeLeaveByMs({ scheduledAtMs, travelMinutes: 55, prepMinutes: 5 });
    const withDefault = computeLeaveByMs({ scheduledAtMs, travelMinutes: 20, prepMinutes: 5 });
    assert.equal(withTraffic, Date.parse('2026-08-02T13:00:00.000Z'));
    assert.notEqual(withTraffic, withDefault);
  });

  it('dedupes notified reminders inside cooldown window', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    assert.equal(
      shouldEmitReminder({
        existingStatus: 'notified',
        lastNotifiedAtMs: now - 10 * 60_000,
        nowMs: now,
      }),
      false,
    );
  });

  it('running late suggestions never imply auto customer messaging', () => {
    const actions = buildRunningLateSuggestedActions({
      jobId: '11111111-1111-1111-1111-111111111111',
      navigateHref: 'https://www.google.com/maps/dir/?api=1&destination=-33.9,18.4',
      technicianId: '22222222-2222-2222-2222-222222222222',
    });
    for (const action of actions) {
      if (action.type === 'notify_customer' || action.type === 'move_booking' || action.type === 'reassign') {
        assert.equal(action.requiresOwnerApproval, true);
        assert.ok(action.honestyNote);
      }
    }
    assert.equal(
      detectJobScheduleReminder({
        nowMs: Date.parse('2026-08-02T14:05:00.000Z'),
        scheduledAtMs: Date.parse('2026-08-02T14:00:00.000Z'),
        travelMinutes: 25,
        travelSource: 'google_maps',
      }),
      'running_late',
    );
  });
});
