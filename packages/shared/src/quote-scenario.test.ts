import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  QUOTE_SCENARIO_CODES,
  QUOTE_SCENARIO_LABELS,
  QUOTE_SCENARIO_ROYAL_CAPE,
  assertHistoricalAutoClassificationsZero,
  assertNoScenarioInternalLeak,
  assertPhaseStatusNotLifecycle,
  assertRow92StillInactiveForScenarios,
  assertRow95NoCustomerSends,
  assertRow95NoProductionWrites,
  assertRow95NoXeroWrites,
  assertRow95ScenarioGates,
  assertRoyalCapeQuoteScenarioUnchanged,
  assertVariationLeavesParentUnchanged,
  buildScenarioChangeAudit,
  diagnosticScenarioTextHints,
  emptyFixtureMatrix,
  getQuoteScenarioCapabilities,
  normalizeQuoteScenarioMetadata,
  projectCustomerSafeScenarioContext,
  resolveQuoteScenario,
  resolveQuoteScenarioCode,
  validateQuoteScenario,
} from './quote-scenario.js';

describe('Row 95 quote scenario registry', () => {
  it('registers all required scenarios including STANDARD', () => {
    for (const code of [
      'STANDARD',
      'EMERGENCY',
      'FIXED_PRICE',
      'GEYSER_COMPLIANCE',
      'DRAINS_CAMERA',
      'BATHROOM',
      'CONSTRUCTION',
      'COMMERCIAL_MANAGING_AGENT',
      'MAINTENANCE_AGREEMENT',
      'MULTI_PHASE_PROJECT',
      'PLAN_ESTIMATE',
      'BOQ_TENDER',
      'DEPOSIT_PROGRESS_FINAL',
      'VARIATION',
    ] as const) {
      assert.ok(QUOTE_SCENARIO_CODES.includes(code));
      assert.ok(QUOTE_SCENARIO_LABELS[code].length > 0);
      assert.notEqual(QUOTE_SCENARIO_LABELS[code], code);
    }
  });

  it('falls back historical null/LEGACY/UNCLASSIFIED to STANDARD', () => {
    assert.deepEqual(resolveQuoteScenarioCode(null), {
      scenario: 'STANDARD',
      isLegacyFallback: true,
    });
    assert.deepEqual(resolveQuoteScenarioCode('LEGACY'), {
      scenario: 'STANDARD',
      isLegacyFallback: true,
    });
    assert.deepEqual(resolveQuoteScenarioCode('UNCLASSIFIED'), {
      scenario: 'STANDARD',
      isLegacyFallback: true,
    });
    assert.equal(resolveQuoteScenarioCode('EMERGENCY').isLegacyFallback, false);
  });

  it('never accepts description inference', () => {
    const result = validateQuoteScenario({
      scenario: 'EMERGENCY',
      inferredFromDescription: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'DESCRIPTION_INFERENCE_FORBIDDEN');
  });

  it('rejects Row 92 automation', () => {
    const result = validateQuoteScenario({
      scenario: 'STANDARD',
      pricebookAutomationEnabled: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PRICING_AUTOMATION_FORBIDDEN');
    assertRow92StillInactiveForScenarios();
  });

  it('validates EMERGENCY without surcharge invention', () => {
    assert.equal(validateQuoteScenario({ scenario: 'EMERGENCY', metadata: { urgencyNote: 'Burst' } }).ok, true);
    assert.equal(
      validateQuoteScenario({
        scenario: 'EMERGENCY',
        metadata: { urgencyNote: 'Burst', emergencySurchargeCents: 5000 } as never,
      }).ok,
      false,
    );
  });

  it('validates FIXED_PRICE capability (Row 90 reuse)', () => {
    const caps = getQuoteScenarioCapabilities('FIXED_PRICE');
    assert.equal(caps.requiresFixedPricePresentation, true);
    assert.equal(validateQuoteScenario({ scenario: 'FIXED_PRICE' }).ok, true);
  });

  it('blocks fake COC on GEYSER_COMPLIANCE', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'GEYSER_COMPLIANCE',
        metadata: { geyserNotes: 'Replace', cocClaimed: true },
      }).ok,
      false,
    );
  });

  it('blocks fabricated drains findings', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'DRAINS_CAMERA',
        metadata: { inspectionFindingsPresent: true },
      }).ok,
      false,
    );
  });

  it('validates BATHROOM and CONSTRUCTION safely', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'BATHROOM',
        metadata: { bathroomScopeNotes: 'Full reno' },
      }).ok,
      true,
    );
    assert.equal(
      validateQuoteScenario({
        scenario: 'CONSTRUCTION',
        metadata: { siteName: 'Site A', preliminariesClaimed: true },
      }).ok,
      false,
    );
  });

  it('validates COMMERCIAL_MANAGING_AGENT relationships', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'COMMERCIAL_MANAGING_AGENT',
        metadata: {
          managingAgentCompanyId: 'c1',
          commercialReference: 'PO-9',
        },
      }).ok,
      true,
    );
    assert.equal(
      validateQuoteScenario({
        scenario: 'STANDARD',
        metadata: { managingAgentCompanyId: 'c1' },
      }).ok,
      false,
    );
  });

  it('blocks maintenance subscription engine', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'MAINTENANCE_AGREEMENT',
        metadata: { maintenanceScope: 'Quarterly', autoGenerateJobs: true },
      }).ok,
      false,
    );
    const normalized = normalizeQuoteScenarioMetadata({ autoGenerateJobs: true });
    assert.equal(normalized.autoGenerateJobs, false);
  });

  it('validates MULTI_PHASE_PROJECT phase totals and independence from lifecycle', () => {
    const phases = [
      { key: 'p1', label: 'Phase 1', sequence: 1, status: 'PLANNED' as const, totalCents: 1000 },
      { key: 'p2', label: 'Phase 2', sequence: 2, status: 'PLANNED' as const, totalCents: 500 },
    ];
    assert.equal(
      validateQuoteScenario({
        scenario: 'MULTI_PHASE_PROJECT',
        metadata: { phases, linePhaseMap: { line1: 'p1' } },
        quoteTotalCents: 1500,
      }).ok,
      true,
    );
    assert.equal(
      validateQuoteScenario({
        scenario: 'MULTI_PHASE_PROJECT',
        metadata: { phases },
        quoteTotalCents: 999,
      }).code,
      'PHASE_TOTAL_MISMATCH',
    );
    assert.doesNotThrow(() => assertPhaseStatusNotLifecycle('PLANNED', 'DRAFT'));
    assert.throws(() => assertPhaseStatusNotLifecycle('DRAFT', 'DRAFT'));
  });

  it('validates PLAN_ESTIMATE Row 94 link', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'PLAN_ESTIMATE',
        metadata: { planEstimateId: 'est-1', planEstimateVersion: 1 },
      }).ok,
      true,
    );
    assert.equal(validateQuoteScenario({ scenario: 'PLAN_ESTIMATE', metadata: {} }).ok, false);
  });

  it('validates BOQ_TENDER without Row 99 import', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'BOQ_TENDER',
        metadata: { tenderReference: 'T-1' },
      }).ok,
      true,
    );
    assert.equal(
      validateQuoteScenario({
        scenario: 'BOQ_TENDER',
        metadata: { tenderReference: 'T-1', row99ImportRequested: true } as never,
      }).code,
      'ROW99_IMPORT_FORBIDDEN',
    );
    assertRow95ScenarioGates({ row99Started: false });
  });

  it('validates DEPOSIT_PROGRESS_FINAL milestones ≠ payments', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'DEPOSIT_PROGRESS_FINAL',
        metadata: {
          milestones: [{ kind: 'DEPOSIT', label: '50% deposit', sequence: 1, percentBps: 5000 }],
        },
      }).ok,
      true,
    );
    assert.equal(
      validateQuoteScenario({
        scenario: 'DEPOSIT_PROGRESS_FINAL',
        metadata: {
          milestones: [{ kind: 'DEPOSIT', label: '50%', sequence: 1 }],
          milestonesPaid: true,
        } as never,
      }).code,
      'MILESTONE_IS_NOT_PAYMENT',
    );
  });

  it('validates VARIATION parent relationship and parent immutability', () => {
    assert.equal(
      validateQuoteScenario({
        scenario: 'VARIATION',
        metadata: { parentQuoteId: 'q-parent', variationAmountCents: 1000 },
      }).ok,
      true,
    );
    assert.equal(validateQuoteScenario({ scenario: 'VARIATION', metadata: {} }).ok, false);
    assert.doesNotThrow(() =>
      assertVariationLeavesParentUnchanged({
        parentQuoteId: 'q-parent',
        parentTotalCentsBefore: 100,
        parentTotalCentsAfter: 100,
        parentStatusBefore: 'sent',
        parentStatusAfter: 'sent',
        parentXeroQuoteIdBefore: 'x1',
        parentXeroQuoteIdAfter: 'x1',
      }),
    );
  });

  it('projects customer-safe context without enum/cost leaks', () => {
    const projected = projectCustomerSafeScenarioContext({
      scenario: 'EMERGENCY',
      metadata: { urgencyNote: 'Burst pipe' },
    });
    assert.equal(projected.customerFacingLabel, 'Emergency / urgent');
    assert.equal(projected.context.urgencyNote, 'Burst pipe');
    assert.doesNotThrow(() =>
      assertNoScenarioInternalLeak({
        label: projected.customerFacingLabel,
        context: projected.context,
      }),
    );
    assert.throws(() =>
      assertNoScenarioInternalLeak({
        customerFacing: { scenario: 'EMERGENCY' },
      }),
    );
  });

  it('builds scenario change audit evidence', () => {
    const audit = buildScenarioChangeAudit({
      quoteId: 'q1',
      companyId: 'c1',
      previousScenario: 'STANDARD',
      nextScenario: 'EMERGENCY',
      nextMetadata: { urgencyNote: 'Now' },
    });
    assert.equal(audit.type, 'quote_scenario_changed');
    assert.equal(audit.nextScenario, 'EMERGENCY');
  });

  it('keeps Royal Cape read-only invariants', () => {
    assert.doesNotThrow(() =>
      assertRoyalCapeQuoteScenarioUnchanged({
        totalCents: QUOTE_SCENARIO_ROYAL_CAPE.expectedTotalCents,
        pricingPresentationMode: 'ITEMISED',
        jobNumber: 'JOB-000002',
        xeroQuoteId: QUOTE_SCENARIO_ROYAL_CAPE.royalCapeXeroQuoteId,
        scenarioMutated: false,
      }),
    );
    assert.throws(() =>
      assertRoyalCapeQuoteScenarioUnchanged({
        totalCents: QUOTE_SCENARIO_ROYAL_CAPE.expectedTotalCents,
        scenarioMutated: true,
      }),
    );
  });

  it('allows diagnostic hints without classifying', () => {
    const hints = diagnosticScenarioTextHints('Emergency geyser COC variation');
    assert.ok(hints.includes('emergency_like'));
    assertHistoricalAutoClassificationsZero(0);
  });

  it('fixture matrix covers 13 proof scenarios', () => {
    const matrix = emptyFixtureMatrix();
    assert.equal(matrix.length, 13);
    assert.ok(matrix.every((row) => row.scenario !== 'STANDARD'));
  });

  it('guards later rows and write boundaries', () => {
    assertRow95ScenarioGates({
      row96Started: false,
      row97Started: false,
      row98Started: false,
      row99Started: false,
    });
    assertRow95NoXeroWrites(0);
    assertRow95NoCustomerSends(0);
    assertRow95NoProductionWrites(0);
    const resolved = resolveQuoteScenario({ scenario: null });
    assert.equal(resolved.scenario, 'STANDARD');
    assert.equal(resolved.isLegacyFallback, true);
  });
});
