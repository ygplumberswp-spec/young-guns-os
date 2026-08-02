import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES,
  OPS_INTELLIGENCE_GUARANTEES,
  buildNavigateHref,
  buildOpsReminderDedupeKey,
  buildRouteOptimisationSuggestedAction,
  buildRunningLateSuggestedActions,
  buildStandardEventActions,
  computeLeaveByMs,
  detectJobScheduleReminder,
  isLeaveNow,
  isNextJobApproaching,
  isOnArrival,
  isRunningLate,
  resolveOpsMapsCapability,
  shouldEmitReminder,
} from './ops-intelligence.js';

describe('ops-intelligence leave-by timing', () => {
  it('uses dynamic travel minutes, not a fixed 20-minute leave window', () => {
    const scheduledAtMs = Date.parse('2026-08-02T10:00:00.000Z');
    const leaveBy45 = computeLeaveByMs({ scheduledAtMs, travelMinutes: 45, prepMinutes: 5 });
    const leaveByDefault = computeLeaveByMs({
      scheduledAtMs,
      travelMinutes: OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES,
      prepMinutes: 5,
    });
    assert.equal(leaveBy45, Date.parse('2026-08-02T09:10:00.000Z'));
    assert.equal(leaveByDefault, Date.parse('2026-08-02T09:35:00.000Z'));
    assert.notEqual(leaveBy45, leaveByDefault);
  });

  it('detects approaching → leave_now → running_late progression', () => {
    const scheduledAtMs = Date.parse('2026-08-02T10:00:00.000Z');
    const travelMinutes = 30;
    const leaveByMs = computeLeaveByMs({ scheduledAtMs, travelMinutes });

    assert.equal(
      detectJobScheduleReminder({
        nowMs: leaveByMs - 10 * 60_000,
        scheduledAtMs,
        travelMinutes,
        travelSource: 'google_maps',
      }),
      'next_job_approaching',
    );
    assert.equal(isNextJobApproaching({ nowMs: leaveByMs - 10 * 60_000, leaveByMs }), true);
    assert.equal(isLeaveNow({ nowMs: leaveByMs + 60_000, leaveByMs, scheduledAtMs }), true);
    assert.equal(
      detectJobScheduleReminder({
        nowMs: leaveByMs + 60_000,
        scheduledAtMs,
        travelMinutes,
        travelSource: 'default',
      }),
      'leave_now',
    );
    assert.equal(isRunningLate({ nowMs: scheduledAtMs + 60_000, scheduledAtMs }), true);
    assert.equal(
      detectJobScheduleReminder({
        nowMs: scheduledAtMs + 60_000,
        scheduledAtMs,
        travelMinutes,
        travelSource: 'google_maps',
      }),
      'running_late',
    );
  });
});

describe('ops-intelligence late + geofence honesty', () => {
  it('does not invent on-arrival without real GPS + job coords', () => {
    assert.equal(
      isOnArrival({
        technicianLatitude: null,
        technicianLongitude: null,
        jobLatitude: -33.9249,
        jobLongitude: 18.4241,
      }),
      false,
    );
    assert.equal(
      isOnArrival({
        technicianLatitude: -33.9249,
        technicianLongitude: 18.4241,
        jobLatitude: null,
        jobLongitude: null,
      }),
      false,
    );
  });

  it('detects on-arrival only inside real proximity radius', () => {
    assert.equal(
      isOnArrival({
        technicianLatitude: -33.9249,
        technicianLongitude: 18.4241,
        jobLatitude: -33.925,
        jobLongitude: 18.4242,
        radiusMeters: 150,
      }),
      true,
    );
    assert.equal(
      isOnArrival({
        technicianLatitude: -33.9249,
        technicianLongitude: 18.4241,
        jobLatitude: -33.94,
        jobLongitude: 18.45,
        radiusMeters: 150,
      }),
      false,
    );
    assert.equal(
      detectJobScheduleReminder({
        nowMs: Date.parse('2026-08-02T09:50:00.000Z'),
        scheduledAtMs: Date.parse('2026-08-02T10:00:00.000Z'),
        travelMinutes: 20,
        travelSource: 'google_maps',
        onArrival: true,
      }),
      'on_arrival',
    );
  });
});

describe('ops-intelligence dedupe + advisory guarantees', () => {
  it('suppresses duplicate reminders after ack/dismiss and cooldown', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    assert.equal(
      shouldEmitReminder({ existingStatus: 'acknowledged', lastNotifiedAtMs: null, nowMs: now }),
      false,
    );
    assert.equal(
      shouldEmitReminder({ existingStatus: 'dismissed', lastNotifiedAtMs: null, nowMs: now }),
      false,
    );
    assert.equal(
      shouldEmitReminder({
        existingStatus: 'notified',
        lastNotifiedAtMs: now - 5 * 60_000,
        nowMs: now,
      }),
      false,
    );
    assert.equal(
      shouldEmitReminder({
        existingStatus: 'notified',
        lastNotifiedAtMs: now - 45 * 60_000,
        nowMs: now,
      }),
      true,
    );
    assert.equal(
      shouldEmitReminder({ existingStatus: null, lastNotifiedAtMs: null, nowMs: now }),
      true,
    );
  });

  it('builds stable dedupe keys per tenant/job/type/day', () => {
    assert.equal(
      buildOpsReminderDedupeKey({
        companyId: 'c1',
        reminderType: 'leave_now',
        jobId: 'j1',
        planDate: '2026-08-02',
      }),
      'c1:leave_now:j1:2026-08-02',
    );
  });

  it('running-late actions never auto-send and require owner approval for customer/schedule', () => {
    const actions = buildRunningLateSuggestedActions({
      jobId: 'job-1',
      navigateHref: null,
      technicianId: 'tech-1',
    });
    const notify = actions.find((a) => a.type === 'notify_customer');
    const move = actions.find((a) => a.type === 'move_booking');
    const reassign = actions.find((a) => a.type === 'reassign');
    assert.ok(notify);
    assert.equal(notify.requiresOwnerApproval, true);
    assert.ok(notify.honestyNote?.includes('will not send'));
    assert.equal(move?.wouldChangeSchedule, true);
    assert.equal(move?.requiresOwnerApproval, true);
    assert.equal(reassign?.requiresOwnerApproval, true);
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.autoCustomerMessages, false);
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.autoScheduleChanges, false);
    assert.equal(OPS_INTELLIGENCE_GUARANTEES.ownerApprovalRequired, true);
  });

  it('navigate uses real coords/address only', () => {
    assert.equal(buildNavigateHref({ formattedAddress: null, latitude: null, longitude: null }), null);
    assert.match(
      buildNavigateHref({ latitude: -33.92, longitude: 18.42 }) ?? '',
      /destination=-33\.92,18\.42/,
    );
    assert.match(
      buildNavigateHref({ formattedAddress: '12 Main Rd, Cape Town' }) ?? '',
      /query=12%20Main%20Rd/,
    );
  });

  it('maps capability is honest when not connected', () => {
    assert.equal(
      resolveOpsMapsCapability({ googleMapsConnected: false, hasSchedule: true }),
      'schedule_only',
    );
    assert.equal(
      resolveOpsMapsCapability({ googleMapsConnected: true, hasSchedule: true }),
      'connected',
    );
    assert.equal(
      resolveOpsMapsCapability({
        googleMapsConnected: true,
        providerError: true,
        hasSchedule: true,
      }),
      'provider_unavailable',
    );
  });

  it('route optimisation suggestion is advisory-only', () => {
    const action = buildRouteOptimisationSuggestedAction();
    assert.equal(action.type, 'suggest_route_order');
    assert.equal(action.requiresOwnerApproval, true);
    assert.equal(action.wouldChangeSchedule, true);
    assert.match(action.honestyNote ?? '', /No automatic booking changes/i);

    const standard = buildStandardEventActions({
      jobId: 'job-1',
      navigateHref: null,
      technicianId: 'tech-1',
      includeRouteOptimisation: true,
    });
    assert.ok(standard.some((a) => a.type === 'suggest_route_order'));
  });
});
