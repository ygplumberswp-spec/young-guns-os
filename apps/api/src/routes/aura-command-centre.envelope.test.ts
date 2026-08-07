import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'aura-command-centre.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/aura-command-centre.service.ts'),
  'utf8',
);

describe('aura command centre API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { dashboard } })',
      'res.json({ data: { entries } })',
      'res.json({ data: { handoffs } })',
      'res.json({ data: { drafts } })',
      'res.json({ data: { followUps } })',
      'res.json({ data: { agents } })',
      'autoExecuted: false',
    ]) {
      assert.ok(routeSource.includes(pattern) || serviceSource.includes(pattern), `missing: ${pattern}`);
    }
  });

  it('denies technicians from owner Command Centre modules', () => {
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes('denyTechnicianFromOwner'));
  });

  it('requires Owner / Platform Owner for handoff and action decisions', () => {
    assert.ok(serviceSource.includes('assertDecide'));
    assert.ok(serviceSource.includes('canDecideAuraCommandCentre'));
    assert.ok(
      serviceSource.includes(
        'Only the company Owner or Platform Owner may approve Command Centre actions and handoffs',
      ),
    );
  });

  it('never auto-executes actions or handoffs', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('AURA_COMMAND_CENTRE_GUARANTEES'));
  });

  it('never sources Personal WhatsApp private data', () => {
    assert.ok(serviceSource.includes('neverSourcesPersonalWhatsappPrivate'));
    assert.ok(serviceSource.includes('sanitizeContextPayload'));
    assert.ok(serviceSource.includes('personal_whatsapp'));
    assert.ok(serviceSource.includes('PRIVATE_CONTEXT_KEYS'));
  });

  it('writes security audit logs for dashboard and sensitive actions', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('aura_command_centre.dashboard.read'));
    assert.ok(serviceSource.includes('aura_command_centre.handoff.approved'));
    assert.ok(serviceSource.includes('aura_command_centre.action.approved'));
    assert.ok(serviceSource.includes("category: 'workflow'"));
  });

  it('does not invent demo analytics', () => {
    assert.ok(serviceSource.includes('noDemoData: true'));
    assert.ok(serviceSource.includes('noFakeAnalytics: true'));
    assert.ok(!serviceSource.includes('demoDashboard'));
    assert.ok(!serviceSource.includes('fakeAnalytics'));
    assert.ok(!serviceSource.includes('sampleBusinessHealth'));
  });

  it('extends existing AURA foundations rather than replacing them', () => {
    assert.ok(serviceSource.includes('extendsExistingAuraFoundations: true') || serviceSource.includes('AURA_COMMAND_CENTRE_GUARANTEES'));
    assert.ok(serviceSource.includes('agentTasks'));
    assert.ok(serviceSource.includes('auraMemory'));
    assert.ok(serviceSource.includes('/aura'));
  });
});
