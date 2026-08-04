import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AURA_EVOLUTION_GUARANTEES,
  AURA_EVOLUTION_KNOWLEDGE_KINDS,
  AURA_EVOLUTION_PATTERN_KINDS,
  canAccessAuraEvolution,
  canControlAuraEvolution,
  canWriteAuraEvolution,
  computeRecommendationConfidence,
  computeRecommendationSuccessRate,
  patternAvailabilityForSampleSize,
} from './aura-evolution.js';

describe('aura-evolution guarantees', () => {
  it('forbids auto mutations and demo data', () => {
    assert.equal(AURA_EVOLUTION_GUARANTEES.noDemoData, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.noFakeInsights, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.noFakePatterns, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.noAutoBusinessRuleChanges, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.noAutoFinancialActions, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.noAutoCustomerCommunication, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.autoExecuted, false);
    assert.equal(AURA_EVOLUTION_GUARANTEES.ownerMustEnableLearning, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.ownerMustApproveLearningChanges, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.extendsCommandCentreMemory, true);
    assert.equal(AURA_EVOLUTION_GUARANTEES.neverSourcesPersonalWhatsappPrivate, true);
  });
});

describe('aura-evolution access', () => {
  it('allows Owner and agents/intelligence readers', () => {
    assert.equal(canAccessAuraEvolution({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canAccessAuraEvolution({ roleName: 'Staff', permissions: ['agents:read'] }), true);
    assert.equal(canAccessAuraEvolution({ roleName: 'Staff', permissions: [] }), false);
  });

  it('restricts controls to Owner / Platform Owner / *', () => {
    assert.equal(canControlAuraEvolution({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(
      canControlAuraEvolution({ roleName: 'Staff', permissions: ['agents:write'] }),
      false,
    );
    assert.equal(canControlAuraEvolution({ roleName: 'Staff', permissions: ['*'] }), true);
    assert.equal(
      canWriteAuraEvolution({ roleName: 'Staff', permissions: ['intelligence:write'] }),
      true,
    );
  });
});

describe('aura-evolution scoring helpers', () => {
  it('returns null success rate until decisions exist', () => {
    assert.equal(computeRecommendationSuccessRate(0, 0), null);
    assert.equal(computeRecommendationSuccessRate(2, 2), 0.5);
  });

  it('requires enough volume for confidence', () => {
    assert.equal(computeRecommendationConfidence(2, 1, 1), null);
    assert.ok(computeRecommendationConfidence(5, 3, 1) !== null);
  });

  it('reports honest pattern availability from sample size', () => {
    assert.equal(patternAvailabilityForSampleSize(0, 5), 'unavailable');
    assert.equal(patternAvailabilityForSampleSize(2, 5), 'insufficient_data');
    assert.equal(patternAvailabilityForSampleSize(8, 5), 'available');
  });
});

describe('aura-evolution catalogs', () => {
  it('lists pattern and knowledge kinds', () => {
    assert.ok(AURA_EVOLUTION_PATTERN_KINDS.includes('busy_period'));
    assert.ok(AURA_EVOLUTION_KNOWLEDGE_KINDS.includes('operating_rule'));
  });
});
