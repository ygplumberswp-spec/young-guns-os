import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateCompletionGate,
  JOB_EXECUTION_TRANSITIONS,
  phaseToJobStatus,
  requiredChecklistForJobType,
} from './job-execution.js';

describe('UX-B job execution contract', () => {
  it('maps execution phases onto canonical job statuses', () => {
    assert.equal(phaseToJobStatus('en_route'), 'scheduled');
    assert.equal(phaseToJobStatus('in_progress'), 'in_progress');
    assert.equal(phaseToJobStatus('completed'), 'completed');
  });

  it('blocks complete from assigned phase via transition table', () => {
    assert.equal(JOB_EXECUTION_TRANSITIONS.complete.includes('assigned'), false);
    assert.equal(JOB_EXECUTION_TRANSITIONS.accept.includes('assigned'), true);
  });

  it('requires gas-specific checklist items for geyser work', () => {
    const keys = requiredChecklistForJobType('Geyser / hot water');
    assert.ok(keys.includes('leak_test_completed'));
  });

  it('blocks completion when evidence and declaration are missing', () => {
    const gate = evaluateCompletionGate({
      jobType: 'Leak detection',
      workPerformedSummary: '',
      checklist: {},
      hasBeforePhoto: false,
      hasAfterPhoto: false,
      hasLabour: false,
      hasMaterialsOrExplicitNone: false,
      siteCondition: null,
      customerRepName: null,
      hasSignature: false,
      signatureUnavailableReason: null,
      cocRequired: 'pending_classification',
      technicianDeclaration: false,
      pendingVariationCount: 1,
    });
    assert.equal(gate.canComplete, false);
    assert.ok(gate.missing.includes('work_performed_summary'));
    assert.ok(gate.missing.includes('pending_variations'));
  });

  it('allows completion when all gates are satisfied', () => {
    const checklist = Object.fromEntries(
      requiredChecklistForJobType('Leak detection').map((k) => [k, true]),
    );
    const gate = evaluateCompletionGate({
      jobType: 'Leak detection',
      workPerformedSummary: 'Located and repaired leak under basin.',
      checklist,
      hasBeforePhoto: true,
      hasAfterPhoto: true,
      hasLabour: true,
      hasMaterialsOrExplicitNone: true,
      siteCondition: 'Basement dry after repair',
      customerRepName: 'Site Agent',
      hasSignature: true,
      signatureUnavailableReason: null,
      cocRequired: 'not_required',
      technicianDeclaration: true,
      pendingVariationCount: 0,
    });
    assert.equal(gate.canComplete, true);
    assert.deepEqual(gate.missing, []);
  });
});
