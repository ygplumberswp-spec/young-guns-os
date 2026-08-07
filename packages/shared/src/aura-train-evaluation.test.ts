import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AURA_TRAIN_EVALUATION_PACK,
  countAuraTrainEvalCases,
  listAuraTrainEvalCasesByRole,
} from './aura-train-evaluation.js';
import { isTechnicianForbiddenAuraTopic } from './aura-source-of-truth.js';

describe('AURA-TRAIN-001 evaluation pack', () => {
  it('covers Owner/Admin/Technician/Client plus hallucination/ambiguity/approval', () => {
    assert.ok(countAuraTrainEvalCases() >= 20);
    assert.ok(listAuraTrainEvalCasesByRole('Owner').length >= 5);
    assert.ok(listAuraTrainEvalCasesByRole('Technician').some((c) => c.expect.mustDeny));
    assert.ok(listAuraTrainEvalCasesByRole('Client').some((c) => c.expect.mustDeny));
    assert.ok(AURA_TRAIN_EVALUATION_PACK.some((c) => c.category === 'hallucination'));
    assert.ok(AURA_TRAIN_EVALUATION_PACK.some((c) => c.category === 'ambiguity'));
    assert.ok(AURA_TRAIN_EVALUATION_PACK.some((c) => c.expect.mustRequireApprovalBeforeSend));
  });

  it('technician forbidden eval prompts match role topic detector', () => {
    for (const c of listAuraTrainEvalCasesByRole('Technician').filter((x) => x.expect.mustDeny)) {
      assert.equal(isTechnicianForbiddenAuraTopic(c.prompt), true, c.id);
    }
  });

  it('owner finance cases require FIN/CASH grounding and completeness honesty', () => {
    const finance = AURA_TRAIN_EVALUATION_PACK.filter(
      (c) => c.role === 'Owner' && c.category === 'finance',
    );
    assert.ok(finance.length >= 2);
    for (const c of finance) {
      assert.equal(c.expect.mustNotInventRecords, true);
      assert.ok((c.expect.mustGroundInSources ?? []).length > 0);
    }
  });
});
