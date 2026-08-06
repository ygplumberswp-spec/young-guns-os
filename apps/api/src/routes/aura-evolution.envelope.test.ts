import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'aura-evolution.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/aura-evolution.service.ts'),
  'utf8',
);

describe('aura evolution API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { overview } })',
      'res.json({ data: { settings } })',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern) || serviceSource.includes(pattern), `missing: ${pattern}`);
    }
  });

  it('denies technicians from owner AURA Evolution modules', () => {
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes('denyTechnicianFromOwner'));
  });

  it('requires Owner control for settings, insight decisions, and removals', () => {
    assert.ok(serviceSource.includes('assertControl'));
    assert.ok(serviceSource.includes('canControlAuraEvolution'));
    assert.ok(
      serviceSource.includes(
        'Only the company Owner or Platform Owner may control AURA Evolution learning',
      ),
    );
  });

  it('never auto-executes learning changes or business actions', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(routeSource.includes('autoExecuted: false as const') || serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('AURA_EVOLUTION_GUARANTEES'));
    assert.ok(serviceSource.includes('noAutoBusinessRuleChanges: true'));
    assert.ok(serviceSource.includes('noAutoFinancialActions: true'));
    assert.ok(serviceSource.includes('noAutoCustomerCommunication: true'));
    assert.ok(serviceSource.includes('noDemoData: true'));
  });

  it('writes security audit logs for overview and sensitive actions', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('aura_evolution.overview.read'));
    assert.ok(serviceSource.includes("category: 'workflow'"));
  });

  it('extends Command Centre business memory', () => {
    assert.ok(serviceSource.includes('auraCommandMemory'));
    assert.ok(serviceSource.includes('extendsCommandCentreMemory') || serviceSource.includes('AURA_EVOLUTION_GUARANTEES'));
  });

  it('does not invent demo insights or fake patterns', () => {
    assert.ok(serviceSource.includes('noDemoData: true'));
    assert.ok(!serviceSource.includes('demoInsight'));
    assert.ok(!serviceSource.includes('fakePattern'));
    assert.ok(!serviceSource.includes('sampleInsight'));
  });

  it('does not sync unstable network_approval sources', () => {
    assert.ok(!serviceSource.includes('auraNetworkApprovals'));
    assert.ok(serviceSource.includes('Network approval sources intentionally omitted'));
  });
});
