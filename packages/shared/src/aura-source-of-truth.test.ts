import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AURA_ROLE_ACCESS_MATRIX,
  AURA_SOURCE_OF_TRUTH_REGISTRY,
  classifyAuraToolClass,
  getAuraRoleAccessRule,
  isTechnicianForbiddenAuraTopic,
  mapCashCompletenessToAuraTruth,
  extractAuraEntityQuery,
  resolveAuraEntityMatches,
  resolveAuraRoutingCategory,
} from './aura-source-of-truth.js';

describe('AURA-TRAIN-001 source-of-truth registry', () => {
  it('covers FIN/CASH/JPE/GROWTH/BANK/jobs/CRM authorities', () => {
    const domains = new Set(AURA_SOURCE_OF_TRUTH_REGISTRY.map((e) => e.domain));
    for (const required of [
      'customers',
      'jobs',
      'cash',
      'owner_finance',
      'job_profitability',
      'budget',
      'growth',
      'bank_evidence',
      'fleet',
      'communications',
    ]) {
      assert.ok(domains.has(required as never), required);
    }
  });

  it('blocks technician and client from finance/cash/profit domains', () => {
    for (const domain of ['cash', 'owner_finance', 'job_profitability', 'budget', 'growth', 'bank_evidence']) {
      const entry = AURA_SOURCE_OF_TRUTH_REGISTRY.find((e) => e.domain === domain);
      assert.ok(entry);
      assert.equal(entry!.technicianAccess, 'none');
      assert.equal(entry!.clientAccess, 'none');
    }
  });
});

describe('AURA-TRAIN-001 role access matrix', () => {
  it('maps Owner/Admin/Technician/Client correctly', () => {
    assert.equal(AURA_ROLE_ACCESS_MATRIX.length, 4);
    assert.equal(getAuraRoleAccessRule('Owner')?.mayAccessCompanyFinance, true);
    assert.equal(getAuraRoleAccessRule('Technician')?.mayAccessCompanyFinance, false);
    assert.equal(getAuraRoleAccessRule('Technician')?.jobScope, 'assigned_only');
    assert.equal(getAuraRoleAccessRule('Client')?.jobScope, 'own_client_only');
  });

  it('detects technician forbidden finance topics', () => {
    assert.equal(isTechnicianForbiddenAuraTopic('What did we profit this month?'), true);
    assert.equal(isTechnicianForbiddenAuraTopic("What's my next job address?"), false);
  });
});

describe('AURA-TRAIN-001 entity resolution + completeness', () => {
  it('never guesses on ambiguous matches', () => {
    const ambiguous = resolveAuraEntityMatches('Smith', [
      { id: '1', label: 'Smith A', kind: 'customer' },
      { id: '2', label: 'Smith B', kind: 'customer' },
    ]);
    assert.equal(ambiguous.status, 'ambiguous');
    assert.equal(resolveAuraEntityMatches('Nobody', []).status, 'none');
    assert.equal(
      resolveAuraEntityMatches('Only', [{ id: '1', label: 'Only', kind: 'job' }]).status,
      'unique',
    );
    assert.equal(extractAuraEntityQuery("What's happening with Smith's job?"), 'Smith');
    assert.equal(extractAuraEntityQuery('What needs my attention today?'), null);
  });

  it('maps cash completeness labels honestly', () => {
    assert.equal(mapCashCompletenessToAuraTruth('VERIFIED'), 'verified');
    assert.equal(mapCashCompletenessToAuraTruth('PROVISIONAL'), 'provisional');
    assert.equal(mapCashCompletenessToAuraTruth('INCOMPLETE'), 'incomplete');
    assert.equal(mapCashCompletenessToAuraTruth(null), 'unavailable');
  });

  it('classifies tools and routing categories', () => {
    assert.equal(classifyAuraToolClass({ toolKey: 'read_jobs' }), 'read');
    assert.equal(
      classifyAuraToolClass({ toolKey: 'draft_whatsapp', requiresApproval: true }),
      'draft',
    );
    assert.equal(
      classifyAuraToolClass({ toolKey: 'execute_workflow', requiresApproval: true }),
      'approval_required',
    );
    assert.equal(resolveAuraRoutingCategory(['ownerFinance']), 'business_analysis');
    assert.equal(resolveAuraRoutingCategory(['agents']), 'summarization');
  });
});
