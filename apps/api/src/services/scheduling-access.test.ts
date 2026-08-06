import assert from 'node:assert/strict';
import test from 'node:test';
import { TECHNICIAN_ROLE_NAME, COMPANY_OWNER_ROLE_NAME, MANAGER_ROLE_NAME } from '@titan/auth';
import {
  canReadSchedulingCalendar,
  isTechnicianCalendarScope,
  resolveCalendarViewScope,
} from './scheduling-access.js';
import { SchedulingConflictService } from './scheduling-conflict.service.js';

test('canReadSchedulingCalendar allows dispatch and mobile readers', () => {
  assert.equal(canReadSchedulingCalendar(['mobile:read']), true);
  assert.equal(canReadSchedulingCalendar(['dispatch:read']), true);
  assert.equal(canReadSchedulingCalendar(['finance:read']), false);
});

test('technician calendar scope is own-only when mobile without dispatch', () => {
  const technician = { roleName: TECHNICIAN_ROLE_NAME, permissions: ['mobile:read', 'jobs:read'] };
  assert.equal(isTechnicianCalendarScope(technician), true);
  assert.equal(resolveCalendarViewScope(technician), 'own');

  const dispatcher = {
    roleName: 'Dispatcher',
    permissions: ['dispatch:read', 'jobs:read'],
  };
  assert.equal(isTechnicianCalendarScope(dispatcher), false);
  assert.equal(resolveCalendarViewScope(dispatcher), 'all');
});

test('Owner/Admin can override conflicts; dispatcher cannot', () => {
  const service = new SchedulingConflictService({} as never);
  assert.equal(
    service.canOverrideConflicts({ roleName: COMPANY_OWNER_ROLE_NAME, permissions: ['*'] }),
    true,
  );
  assert.equal(
    service.canOverrideConflicts({ roleName: MANAGER_ROLE_NAME, permissions: ['dispatch:write'] }),
    true,
  );
  assert.equal(
    service.canOverrideConflicts({ roleName: 'Dispatcher', permissions: ['dispatch:write'] }),
    false,
  );
});
