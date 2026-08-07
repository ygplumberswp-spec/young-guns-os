import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AURA_COMMAND_AGENT_KEYS,
  AURA_COMMAND_CENTRE_GUARANTEES,
  AURA_COMMAND_MEMORY_KINDS,
  AURA_COMMAND_UNDERSTANDS_MODULES,
  auraCommandDepartmentAvailability,
  canAccessAuraCommandCentre,
  canDecideAuraCommandCentre,
  canWriteAuraCommandCentre,
  isAuraCommandAgentKey,
} from './aura-command-centre.js';

describe('aura-command-centre guarantees', () => {
  it('never invents demo analytics or auto-executes actions', () => {
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.noDemoData, true);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.noFakeAnalytics, true);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.autoExecuted, false);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.actionsRequireApproval, true);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.neverSourcesPersonalWhatsappPrivate, true);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.specialistAgentsFoundationOnly, true);
    assert.equal(AURA_COMMAND_CENTRE_GUARANTEES.extendsExistingAuraFoundations, true);
  });
});

describe('aura-command-centre agent registry foundation', () => {
  it('lists the ten future specialist agents', () => {
    assert.equal(AURA_COMMAND_AGENT_KEYS.length, 10);
    assert.ok(isAuraCommandAgentKey('finance'));
    assert.ok(isAuraCommandAgentKey('market_intelligence'));
    assert.equal(isAuraCommandAgentKey('executive'), false);
  });

  it('marks incomplete departments honestly', () => {
    assert.equal(auraCommandDepartmentAvailability('finance'), 'live_signals');
    assert.equal(auraCommandDepartmentAvailability('compliance'), 'foundation_only');
    assert.equal(auraCommandDepartmentAvailability('hr'), 'partial_signals');
  });
});

describe('aura-command-centre memory kinds', () => {
  it('covers decisions, preferences, patterns, and context', () => {
    for (const kind of [
      'approved_decision',
      'preference',
      'operating_pattern',
      'important_context',
      'historical_decision',
    ] as const) {
      assert.ok(AURA_COMMAND_MEMORY_KINDS.includes(kind));
    }
  });
});

describe('aura-command-centre access', () => {
  it('allows intelligence/agents readers and owners', () => {
    assert.equal(canAccessAuraCommandCentre({ permissions: ['intelligence:read'] }), true);
    assert.equal(canAccessAuraCommandCentre({ permissions: ['agents:read'] }), true);
    assert.equal(canAccessAuraCommandCentre({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canAccessAuraCommandCentre({ roleName: 'Technician', permissions: [] }), false);
  });

  it('restricts privileged decisions to Owner / Platform Owner / *', () => {
    assert.equal(canDecideAuraCommandCentre({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canDecideAuraCommandCentre({ roleName: 'Platform Owner', permissions: [] }), true);
    assert.equal(
      canDecideAuraCommandCentre({ roleName: 'Dispatcher', permissions: ['agents:write'] }),
      false,
    );
    assert.equal(canDecideAuraCommandCentre({ permissions: ['*'] }), true);
    assert.equal(
      canWriteAuraCommandCentre({ roleName: 'Dispatcher', permissions: ['intelligence:write'] }),
      true,
    );
  });
});

describe('aura-command-centre module understanding', () => {
  it('lists core TITAN modules for chat integration', () => {
    assert.ok(AURA_COMMAND_UNDERSTANDS_MODULES.includes('Customers'));
    assert.ok(AURA_COMMAND_UNDERSTANDS_MODULES.includes('Jobs'));
    assert.ok(AURA_COMMAND_UNDERSTANDS_MODULES.includes('Communications'));
    assert.equal(AURA_COMMAND_UNDERSTANDS_MODULES.length, 10);
  });
});
