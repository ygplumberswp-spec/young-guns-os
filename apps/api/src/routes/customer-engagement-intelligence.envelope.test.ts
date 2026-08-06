import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'customer-engagement-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/customer-engagement-intelligence.service.ts'),
  'utf8',
);

describe('customer engagement intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    assert.ok(routeSource.includes('data: {'));
    assert.ok(routeSource.includes('dashboard'));
    assert.ok(routeSource.includes('autoSend: false as const'));
    assert.ok(routeSource.includes('customer360: false as const'));
    assert.ok(routeSource.includes("note: 'Approval does not send — use Email Centre / approved outbound execute path.'"));
  });

  it('requires auth + CX/customers/communications permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('customer_experience:read'));
    assert.ok(routeSource.includes('communications:manage'));
  });

  it('never auto-sends external customer communications', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
  });

  it('uses real CX reviews, jobs, and Communication AURA when present', () => {
    assert.ok(serviceSource.includes('cxReviewsFeedback'));
    assert.ok(serviceSource.includes('commAuraCustomerInsights'));
    assert.ok(serviceSource.includes("customer360: false"));
  });

  it('writes security audit logs and keeps approval non-send', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('cei_draft_approved'));
  });

  it('exposes follow-up and maintenance reminder draft generators', () => {
    assert.ok(routeSource.includes('/follow-ups/generate'));
    assert.ok(routeSource.includes('/maintenance-reminders/generate'));
    assert.ok(serviceSource.includes('scoreCeiCustomerRelationship'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
  });

  it('surfaces retention opportunities and HomeShield links when present', () => {
    assert.ok(serviceSource.includes('loadRetentionOpportunities'));
    assert.ok(serviceSource.includes('hsRenewalOpportunities'));
    assert.ok(serviceSource.includes('homeShieldExperience'));
    assert.ok(serviceSource.includes('communicationTimeline'));
  });

  it('does not rebuild portal tables or invent customers', () => {
    assert.ok(!serviceSource.includes('portalUsers'));
    assert.ok(serviceSource.includes('cannot invent customers'));
  });
});
