import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeFollowUpRecommendations,
  findDuplicateDayPlan,
  normalizeDayPlanText,
  parseNaturalLanguageDayPlan,
} from './day-planning.js';

test('normalizeDayPlanText trims and lowercases', () => {
  assert.equal(normalizeDayPlanText('  Push Marketing Emails.  '), 'push marketing emails');
});

test('findDuplicateDayPlan returns normalized match', () => {
  const duplicate = findDuplicateDayPlan(
    [{ id: 'plan-1', content: 'Answer all WhatsApp messages' }],
    'answer all whatsapp messages.',
  );

  assert.ok(duplicate);
  assert.equal(duplicate.id, 'plan-1');
});

test('dedupeFollowUpRecommendations merges same customer into one item', () => {
  const merged = dedupeFollowUpRecommendations([
    {
      id: 'follow-up-1',
      category: 'customer_follow_up',
      priority: 'medium',
      title: 'Follow up with Keanu',
      description: 'No recent activity recorded.',
      actionHint: 'Log CRM activity',
      entityType: 'customer',
      entityId: 'customer-1',
    },
    {
      id: 'follow-up-1b',
      category: 'customer_follow_up',
      priority: 'high',
      title: 'Follow up with Keanu',
      description: 'Quote sent 21 days ago.',
      actionHint: 'Draft WhatsApp',
      entityType: 'customer',
      entityId: 'customer-1',
    },
    {
      id: 'follow-up-2',
      category: 'customer_follow_up',
      priority: 'low',
      title: 'Follow up with Alex',
      description: 'No activity logged.',
      actionHint: 'Log CRM activity',
      entityType: 'customer',
      entityId: 'customer-2',
    },
  ]);

  assert.equal(merged.size, 2);
  const keanu = merged.get('customer-1');
  assert.ok(keanu);
  assert.equal(keanu.mergedSourceCount, 2);
  assert.equal(keanu.priority, 'high');
});

test('parseNaturalLanguageDayPlan splits bullets and classifies categories', () => {
  const parsed = parseNaturalLanguageDayPlan(
    'Today:\n- Answer all WhatsApps\n- Push marketing emails\n- Review overdue invoices',
    '2026-08-02',
  );

  assert.equal(parsed.planDate, '2026-08-02');
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0]?.category, 'communications');
  assert.equal(parsed.items[1]?.category, 'marketing');
  assert.equal(parsed.items[2]?.category, 'finance');
  assert.deepEqual(parsed.unsafeExecutionHints, []);
});

test('parseNaturalLanguageDayPlan flags unsafe execution hints without auto-executing', () => {
  const parsed = parseNaturalLanguageDayPlan(
    'Today we must send WhatsApp invoice blasts and process payroll',
    '2026-08-02',
  );

  assert.ok(parsed.items.length >= 1);
  assert.ok(parsed.unsafeExecutionHints.includes('payment_or_payroll'));
  assert.ok(parsed.items.every((item) => item.approvalRequired));
});
