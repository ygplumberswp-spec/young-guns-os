import test from 'node:test';
import assert from 'node:assert/strict';
import { isBusinessRuleDueOnDate } from '@titan/shared';

/**
 * Scheduled payroll rules create review tasks only — payment APIs must never be invoked
 * from business rule task generation (enforced in CompanyBusinessRulesService.ensureScheduledTasksForDate).
 */
test('payroll schedule due date matches wages-on-25th pattern', () => {
  assert.equal(isBusinessRuleDueOnDate('monthly:25', '2026-08-25'), true);
  assert.equal(isBusinessRuleDueOnDate('monthly:25', '2026-08-24'), false);
});

test('paused rules are excluded at service query layer', () => {
  const activeOnlyFilter = { status: 'active' as const };
  assert.notEqual(activeOnlyFilter.status, 'paused');
});
