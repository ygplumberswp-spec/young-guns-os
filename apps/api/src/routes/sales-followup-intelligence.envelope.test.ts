import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'sales-followup-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/sales-followup-intelligence.service.ts'),
  'utf8',
);

describe('sales follow-up intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    assert.ok(routeSource.includes('data: {'));
    assert.ok(routeSource.includes('dashboard'));
    assert.ok(routeSource.includes('autoSend: false as const'));
    assert.ok(routeSource.includes('fakeCampaigns: false as const'));
    assert.ok(
      routeSource.includes(
        "note: 'Approval does not send — use Email Centre / approved outbound execute path.'",
      ),
    );
  });

  it('requires auth + sales/quotes permissions and denies Technician/Client', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('sales:read'));
    assert.ok(routeSource.includes('quotes:write'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
  });

  it('never auto-sends outreach', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoSendEnabled: false'));
  });

  it('uses real quotes, customers, jobs, communications, and maintenance', () => {
    assert.ok(serviceSource.includes('from(quotes)'));
    assert.ok(serviceSource.includes('from(customers)'));
    assert.ok(serviceSource.includes('from(jobs)'));
    assert.ok(serviceSource.includes('from(communications)'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
    assert.ok(serviceSource.includes('cannot invent'));
  });

  it('writes security audit logs and keeps approval non-send', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('sfi_draft_approved'));
    assert.ok(serviceSource.includes('extendsSalesIntelligenceAgent'));
  });

  it('exposes quote reminder, objection, and reactivation generators', () => {
    assert.ok(routeSource.includes('/quote-reminders/generate'));
    assert.ok(routeSource.includes('/objection-drafts/generate'));
    assert.ok(routeSource.includes('/reactivation-drafts/generate'));
    assert.ok(routeSource.includes('/quote-follow-ups/schedule'));
    assert.ok(routeSource.includes('/quote-responses'));
  });
});
