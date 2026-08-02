import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canWriteCompanyMemory } from '@titan/auth';
import { findDuplicateDayPlan, parseNaturalLanguageDayPlan } from '@titan/shared';
import { DayPlanError } from '../services/company-day-plan.service.js';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'intelligence.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../services/company-day-plan.service.ts'),
  'utf8',
);

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

test('M8 parse route is suggest-only and approve route persists aura_suggested items', () => {
  assert.match(routeSource, /\/day-plans\/parse/);
  assert.match(routeSource, /\/day-plans\/approve-suggestions/);
  assert.match(routeSource, /requireCompanyMemoryWrite\(\)/);
  assert.match(serviceSource, /day_plan_nl_parsed/);
  assert.match(serviceSource, /day_plan_nl_approved/);
  assert.match(serviceSource, /source: 'aura_suggested'/);
  // NL parse/approve must not execute payments, sends, or Xero writes (pending-count reads elsewhere are OK).
  const nlStart = serviceSource.indexOf('parseNaturalLanguagePriorities');
  const nlEnd = serviceSource.indexOf('async updatePlan');
  assert.ok(nlStart >= 0 && nlEnd > nlStart);
  const nlMethods = serviceSource.slice(nlStart, nlEnd);
  assert.doesNotMatch(nlMethods, /xeroWriteApprovals|executePayment|sendWhatsApp/);
});

test('M8 parser never invents executable payment/send actions', () => {
  const parsed = parseNaturalLanguageDayPlan('Pay all technicians and send SMS invoices today');
  assert.ok(parsed.unsafeExecutionHints.length > 0);
  assert.ok(parsed.items.every((item) => typeof item.content === 'string'));
  assert.ok(parsed.items.every((item) => item.approvalRequired));
});
