import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TECHNICIAN_FIELD_MESSAGES_PATH,
  TECHNICIAN_FIELD_MESSAGE_EXCLUSIONS,
  TECHNICIAN_FIELD_MESSAGE_SCOPES,
  TECHNICIAN_NOTIFICATIONS_PATH,
} from './technician-field-messages.js';
import {
  TECHNICIAN_FORBIDDEN_MOBILE_PATHS,
  TECHNICIAN_PERFORMANCE_NAV_DECISION,
  TECHNICIAN_PERFORMANCE_PATH,
} from './technician-field-performance.js';

describe('Technician Field Messages vs Notifications', () => {
  it('keeps Messages and Notifications on distinct canonical paths', () => {
    assert.equal(TECHNICIAN_FIELD_MESSAGES_PATH, '/mobile/messages');
    assert.equal(TECHNICIAN_NOTIFICATIONS_PATH, '/mobile/notifications');
    assert.notEqual(TECHNICIAN_FIELD_MESSAGES_PATH, TECHNICIAN_NOTIFICATIONS_PATH);
  });

  it('scopes Messages to assigned jobs / dispatch / job-card site only', () => {
    assert.ok(TECHNICIAN_FIELD_MESSAGE_SCOPES.includes('assigned_jobs'));
    assert.ok(TECHNICIAN_FIELD_MESSAGE_SCOPES.includes('dispatch_office_requests'));
    assert.ok(TECHNICIAN_FIELD_MESSAGE_EXCLUSIONS.includes('communications_hub'));
    assert.ok(TECHNICIAN_FIELD_MESSAGE_EXCLUSIONS.includes('crm_inbox'));
  });

  it('removes Performance from Technician exposure', () => {
    assert.equal(TECHNICIAN_PERFORMANCE_NAV_DECISION, 'remove');
    assert.ok(TECHNICIAN_FORBIDDEN_MOBILE_PATHS.includes(TECHNICIAN_PERFORMANCE_PATH));
  });
});
