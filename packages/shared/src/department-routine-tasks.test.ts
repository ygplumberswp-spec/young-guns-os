import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRoutineKey,
  canAccessDepartment,
  listAllDepartmentRoutineDefinitions,
  resolveRoutinePeriod,
} from './department-routine-tasks.js';

describe('department-routine-tasks', () => {
  it('builds stable routine keys from department definitions', () => {
    const key = buildRoutineKey('finance_accounting', 'weekly', 'Receivables aging review');
    assert.equal(key, 'finance_accounting:weekly:receivables-aging-review');
  });

  it('lists routine definitions from corporate departments', () => {
    const defs = listAllDepartmentRoutineDefinitions();
    assert.ok(defs.length >= 50);
    assert.ok(defs.some((row) => row.departmentId === 'finance_accounting' && row.cadence === 'weekly'));
    assert.ok(defs.some((row) => row.departmentId === 'executive_strategy' && row.cadence === 'daily'));
  });

  it('resolves weekly and monthly due periods', () => {
    const ref = new Date('2026-08-06T12:00:00');
    const weekly = resolveRoutinePeriod('weekly', ref);
    assert.equal(weekly.periodStart, '2026-08-04');
    assert.equal(weekly.dueDate, '2026-08-09');

    const monthly = resolveRoutinePeriod('monthly', ref);
    assert.equal(monthly.periodStart, '2026-08-01');
    assert.equal(monthly.dueDate, '2026-08-31');
  });

  it('denies finance department to ops-only permissions', () => {
    assert.equal(canAccessDepartment(['jobs:read', 'dispatch:read'], 'finance_accounting'), false);
    assert.equal(canAccessDepartment(['finance:read'], 'finance_accounting'), true);
  });
});
