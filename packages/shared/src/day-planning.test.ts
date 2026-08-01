import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeFollowUpRecommendations, findDuplicateDayPlan, normalizeDayPlanText } from './day-planning.js';

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
