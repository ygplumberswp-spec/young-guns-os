import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'call-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/call-intelligence.service.js'.replace('.js', '.ts')), 'utf8');

describe('call intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'autoSend: false as const',
      'autoExecuted: false as const',
      'financeMarginsExposed: false as const',
      "note: 'Approval does not create CRM leads or send customer communication — Owner intent only.'",
      "note: 'Lead draft queued — Owner approval required. No automatic customer communication.'",
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('requires auth + voice/communications permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('voice:read'));
    assert.ok(routeSource.includes('voice:write'));
    assert.ok(routeSource.includes('voice_reception:manage'));
    assert.ok(routeSource.includes('communications:manage'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-sends or auto-executes lead/customer communication', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
  });

  it('extends VAIR + voice sessions and strips finance margins', () => {
    assert.ok(serviceSource.includes('vairCallSessions'));
    assert.ok(serviceSource.includes('voiceSessions'));
    assert.ok(serviceSource.includes('voiceConversations'));
    assert.ok(serviceSource.includes('financeMarginsExposed: false'));
    assert.ok(serviceSource.includes('internalNotesExposed: false'));
    assert.ok(serviceSource.includes('buildCiCallSummaryFromText'));
    assert.ok(serviceSource.includes('detectCiSentimentFromText'));
    assert.ok(serviceSource.includes('aggregateCiInsights'));
  });

  it('writes security audit logs and keeps approval non-execute', () => {
    assert.ok(serviceSource.includes("entityType: 'call_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('ci_lead_draft_approved'));
    assert.ok(serviceSource.includes('Approval records Owner intent only'));
  });

  it('exposes analyze, customer-history, insights, and lead-draft decide routes', () => {
    assert.ok(routeSource.includes("router.post('/analyze'"));
    assert.ok(routeSource.includes("router.post('/customer-history'"));
    assert.ok(routeSource.includes("router.get('/insights'"));
    assert.ok(routeSource.includes("router.post('/lead-drafts/:id/decide'"));
  });

  it('does not invent calls or expose quote margins columns', () => {
    assert.ok(serviceSource.includes('invented, false'));
    assert.ok(!serviceSource.includes('marginBps'));
    assert.ok(!serviceSource.includes('grossProfitCents'));
    assert.ok(!serviceSource.includes('internalNotes:'));
  });
});
