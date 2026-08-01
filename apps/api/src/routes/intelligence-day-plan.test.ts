import test from 'node:test';
import assert from 'node:assert/strict';
import { canWriteCompanyMemory } from '@titan/auth';
import { findDuplicateDayPlan } from '@titan/shared';
import { DayPlanError } from '../services/company-day-plan.service.js';

test('canWriteCompanyMemory blocks managers from day plan writes', () => {
  assert.equal(
    canWriteCompanyMemory({ roleName: 'Manager', permissions: ['intelligence:write'] }),
    false,
  );
});

test('duplicate day plan detection rejects normalized duplicates before save', () => {
  const duplicate = findDuplicateDayPlan(
    [{ id: 'plan-1', content: 'Answer all WhatsApp messages' }],
    'answer all whatsapp messages.',
  );

  assert.ok(duplicate);
  assert.equal(duplicate.id, 'plan-1');
});

test('DayPlanError exposes stable codes for route mapping', () => {
  const duplicate = new DayPlanError('DUPLICATE', 'duplicate');
  const forbidden = new DayPlanError('FORBIDDEN', 'forbidden');

  assert.equal(duplicate.code, 'DUPLICATE');
  assert.equal(forbidden.code, 'FORBIDDEN');
});
