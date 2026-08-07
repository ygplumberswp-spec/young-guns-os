/**
 * AURA-TRAIN-001 — Contract proofs for role/source/approval/routing (no live LLM).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  AURA_SOURCE_OF_TRUTH_REGISTRY,
  AURA_TRAIN_EVALUATION_PACK,
  classifyAuraToolClass,
  extractAuraEntityQuery,
  getAgentToolDefinition,
  isTechnicianForbiddenAuraTopic,
  resolveAuraRoutingCategory,
} from '@titan/shared';
import { canViewOwnerFinancialCommand } from '@titan/shared';
import { TECHNICIAN_PERMISSIONS, TECHNICIAN_ROLE_NAME } from '@titan/auth';
import { resolveAuraContextDomains } from './aura-context-routing.js';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('AURA-TRAIN-001 contracts', () => {
  it('routes finance/attention prompts onto ownerFinance domain', () => {
    const finance = resolveAuraContextDomains(
      'What did we invoice this month and how much cash actually came in?',
    );
    assert.ok(finance.domains.has('ownerFinance'));
    assert.ok(finance.domains.has('finance'));

    const attention = resolveAuraContextDomains('What needs my attention today?');
    assert.ok(attention.domains.has('ownerFinance'));
  });

  it('maps loaded finance domains to business_analysis provider category', () => {
    assert.equal(resolveAuraRoutingCategory(['ownerFinance', 'finance']), 'business_analysis');
  });

  it('execute_workflow requires approval and is not auto-read', () => {
    const tool = getAgentToolDefinition('execute_workflow');
    assert.ok(tool);
    assert.equal(tool!.requiresApproval, true);
    assert.equal(
      classifyAuraToolClass({
        toolKey: 'execute_workflow',
        requiresApproval: true,
        executable: true,
      }),
      'approval_required',
    );
  });

  it('registers FIN/CASH/JPE/GROWTH read tools', () => {
    for (const key of [
      'read_owner_financial_command',
      'read_cash_control',
      'read_profit_analytics',
      'read_growth_planner',
    ]) {
      const tool = getAgentToolDefinition(key);
      assert.ok(tool, key);
      assert.equal(classifyAuraToolClass({ toolKey: key }), 'read');
    }
  });

  it('denies Technician Owner finance truth even with finance:read', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: TECHNICIAN_ROLE_NAME,
        permissions: [...TECHNICIAN_PERMISSIONS, 'finance:read'],
      }),
      false,
    );
    assert.equal(isTechnicianForbiddenAuraTopic('Show bank transactions and payroll.'), true);
  });

  it('wires owner finance truth + technician denial + audit in AuraService', () => {
    const aura = read('./aura.service.ts');
    assert.match(aura, /ownerFinancialCommandService/);
    assert.match(aura, /isTechnicianForbiddenAuraTopic/);
    assert.match(aura, /technicianDenied/);
    assert.match(aura, /aura\.message\.send/);
    assert.match(aura, /deferredAudit:\s*false/);
    assert.match(aura, /resolveAuraRoutingCategory/);
  });

  it('wires FIN services into AgentRuntimeService construction', () => {
    const index = read('../index.ts');
    assert.match(index, /ownerFinancialCommandService,/);
    assert.match(index, /growthPlannerService,/);
    assert.match(index, /cashControlService,/);
    assert.match(index, /profitAnalyticsService,/);
    const runtime = read('./agent-runtime.service.ts');
    assert.match(runtime, /read_owner_financial_command/);
    assert.match(runtime, /read_cash_control/);
    assert.match(runtime, /getSummary\(actor\)/);
  });

  it('entity query extraction supports Smith ambiguity probes', () => {
    assert.equal(extractAuraEntityQuery("What's happening with Smith's job?"), 'Smith');
    assert.ok(AURA_SOURCE_OF_TRUTH_REGISTRY.some((e) => e.domain === 'owner_finance'));
    assert.ok(AURA_TRAIN_EVALUATION_PACK.length >= 20);
  });

  it('context build loads ownerFinance and entity resolution', () => {
    const build = read('./aura-context-build.ts');
    assert.match(build, /domain:\s*'ownerFinance'/);
    assert.match(build, /buildAuraOwnerFinanceTruthContext/);
    assert.match(build, /extractAuraEntityQuery/);
    assert.match(build, /entityResolution/);
  });
});
