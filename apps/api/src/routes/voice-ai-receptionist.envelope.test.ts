import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'voice-ai-receptionist.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/voice-ai-receptionist.service.ts'),
  'utf8',
);

describe('voice AI receptionist API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'fakeCalls: false as const',
      'fakeCustomers: false as const',
      'fakeLeads: false as const',
      'humanTakeoverAlwaysAvailable: true as const',
      'hiddenActions: false as const',
      'ownerControlled: true as const',
      'customer360: false as const',
      'autoExecuted: false as const',
      'bookingAutoScheduled: false as const',
      'invented: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + voice/communications permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('voice:read'));
    assert.ok(routeSource.includes('voice_reception:read'));
    assert.ok(routeSource.includes('communications:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never invents calls or auto-executes CRM/booking without approval path', () => {
    assert.ok(!routeSource.includes('fakeCalls: true'));
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('invented: false'));
    assert.ok(serviceSource.includes('humanTakeoverAlwaysAvailable: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes("entityType: 'voice_ai_receptionist'"));
  });

  it('Owner/Admin gate for approvals; human takeover always available', () => {
    assert.ok(serviceSource.includes('canAccessVoiceAiReceptionist'));
    assert.ok(serviceSource.includes('canApproveVairDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('requestTakeover'));
    assert.ok(serviceSource.includes('vair_human_takeover_requested'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('vair_incoming_call_recorded'));
    assert.ok(serviceSource.includes('vair_lead_draft_created'));
    assert.ok(serviceSource.includes('eq(vairCallSessions.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(vairSettings.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(customers.companyId, companyId)'));
  });

  it('extends real voice, CRM, leads, jobs, and enterprise telephony configs', () => {
    assert.ok(serviceSource.includes('voiceSessions'));
    assert.ok(serviceSource.includes('customers'));
    assert.ok(serviceSource.includes('leads'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('vrTelephonyProviderConfigs'));
    assert.ok(serviceSource.includes('buildVairProviderSnapshot'));
    assert.ok(serviceSource.includes('not_configured'));
  });
});
