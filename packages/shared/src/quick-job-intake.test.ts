import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandIntakeAddress,
  PERSONAL_CALL_INTAKE_PRIVACY,
  suggestUrgencyFromText,
  technicianMaySelfAssign,
  urgencyToPriority,
} from './quick-job-intake.js';

describe('quick job intake helpers', () => {
  it('maps emergency urgency to urgent priority', () => {
    assert.equal(urgencyToPriority('emergency'), 'urgent');
    assert.equal(urgencyToPriority('same_day'), 'high');
  });

  it('suggests emergency from burst/ASAP language', () => {
    assert.equal(suggestUrgencyFromText('burst pipe ASAP Durbanville'), 'emergency');
    assert.equal(suggestUrgencyFromText('geyser install next week'), 'scheduled');
  });

  it('expands suburb-only location without inventing a CRM record', () => {
    const addr = expandIntakeAddress('Durbanville');
    assert.equal(addr.suburb, 'Durbanville');
    assert.match(addr.street, /TBC/i);
    assert.equal(addr.province, 'Western Cape');
  });

  it('keeps street-like freeform text as street', () => {
    const addr = expandIntakeAddress('12 Oak Street, Durbanville');
    assert.equal(addr.street, '12 Oak Street');
    assert.equal(addr.suburb, 'Durbanville');
  });

  it('denies technician self-assign without explicit permission', () => {
    assert.equal(
      technicianMaySelfAssign({ roleName: 'Technician', permissions: ['jobs:read'] }),
      false,
    );
    assert.equal(
      technicianMaySelfAssign({
        roleName: 'Technician',
        permissions: ['jobs:field_self_assign'],
      }),
      true,
    );
  });

  it('states personal-call privacy honestly', () => {
    assert.match(PERSONAL_CALL_INTAKE_PRIVACY, /does not access ordinary personal phone/i);
  });
});
