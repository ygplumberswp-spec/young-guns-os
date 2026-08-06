import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicateBusinessRule,
  isBusinessRuleDueOnDate,
  normalizeBusinessRuleInstruction,
} from '@titan/shared';
import { BusinessRuleError } from '../services/company-business-rules.service.js';

test('normalizeBusinessRuleInstruction dedupes punctuation and spacing', () => {
  assert.equal(
    normalizeBusinessRuleInstruction('  Pay wages on the 25th. '),
    normalizeBusinessRuleInstruction('pay wages on the 25th'),
  );
});

test('findDuplicateBusinessRule detects normalized duplicates', () => {
  const duplicate = findDuplicateBusinessRule(
    [{ id: 'rule-1', instruction: 'Never auto-pay payroll' }],
    'never auto-pay payroll.',
  );
  assert.ok(duplicate);
  assert.equal(duplicate.id, 'rule-1');
});

test('isBusinessRuleDueOnDate supports daily and monthly schedules', () => {
  assert.equal(isBusinessRuleDueOnDate('daily', '2026-08-01'), true);
  assert.equal(isBusinessRuleDueOnDate('monthly:25', '2026-08-25'), true);
  assert.equal(isBusinessRuleDueOnDate('monthly:25', '2026-08-01'), false);
});

test('BusinessRuleError exposes stable codes for route mapping', () => {
  assert.equal(new BusinessRuleError('DUPLICATE', 'dup').code, 'DUPLICATE');
  assert.equal(new BusinessRuleError('FORBIDDEN', 'no').code, 'FORBIDDEN');
});
