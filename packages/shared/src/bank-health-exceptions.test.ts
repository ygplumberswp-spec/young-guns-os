import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBankHealthDeniedToTechClient,
  assertRow115SafetyGates,
  buildBankHealthAuraAttention,
  buildBankHealthSnapshot,
  canViewBankHealth,
} from './bank-health-exceptions.js';

describe('Row 115 bank health + exceptions', () => {
  it('builds truthful health; never fabricates connection/balance/count', () => {
    const health = buildBankHealthSnapshot({
      operatingMode: 'CONTROLLED_STATEMENT_IMPORT',
      connectionImportStatus: 'STATEMENT_IMPORT_ONLY',
      lastSuccessfulIntakeAt: null,
      lastAttemptedIntakeAt: '2026-08-01T00:00:00Z',
      statementBatchCount: 4,
      reconStateCounts: {
        UNMATCHED: 2,
        POSSIBLE_MATCH: 1,
        REVIEW_REQUIRED: 3,
        PARTIAL: 1,
      },
      providerImportErrorCount: 0,
      nowIso: '2026-08-08T12:00:00Z',
    });
    assert.equal(health.connectedClaim, false);
    assert.equal(health.bankBalanceCents, null);
    assert.equal(health.balanceFabricated, false);
    assert.equal(health.fabricatedHealth, false);
    assert.equal(health.statementBatchCount, 4);
    assert.equal(health.unmatchedCount, 2);
    assert.equal(health.reviewRequiredCount, 3);
    assert.equal(health.staleIntake, true);

    assert.throws(() =>
      buildBankHealthSnapshot({
        operatingMode: 'PROVIDER_UNAVAILABLE',
        connectionImportStatus: 'NOT_CONFIGURED',
        statementBatchCount: 0,
        reconStateCounts: {},
        inventConnection: true,
      }),
    );
    assert.throws(() =>
      buildBankHealthSnapshot({
        operatingMode: 'PROVIDER_UNAVAILABLE',
        connectionImportStatus: 'NOT_CONFIGURED',
        statementBatchCount: 0,
        reconStateCounts: {},
        inventBalance: true,
      }),
    );
  });

  it('AURA attention summary for Owner surface; Tech/Client denied', () => {
    const health = buildBankHealthSnapshot({
      operatingMode: 'PROVIDER_UNAVAILABLE',
      connectionImportStatus: 'STATEMENT_IMPORT_ONLY',
      statementBatchCount: 4,
      reconStateCounts: { REVIEW_REQUIRED: 2, UNMATCHED: 1 },
      lastSuccessfulIntakeAt: '2026-01-01T00:00:00Z',
      nowIso: '2026-08-08T00:00:00Z',
      staleAfterHours: 24,
    });
    const attention = buildBankHealthAuraAttention(health);
    assert.ok(attention.some((a) => a.kind === 'bank_exception'));
    assert.ok(attention.some((a) => a.sourceId === 'bank-review-required'));
    assert.ok(attention.every((a) => a.source === 'bank_health'));
    assert.equal(canViewBankHealth({ roleName: 'owner' }), true);
    assert.equal(canViewBankHealth({ roleName: 'technician' }), false);
    assert.equal(canViewBankHealth({ roleName: 'client' }), false);
    assert.throws(() => assertBankHealthDeniedToTechClient('technician'));
    assert.equal(assertRow115SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
