import assert from 'node:assert/strict';
import test from 'node:test';
import { nextAuraThinkingPhase, resolveAuraThinkingLabel } from './aura-thinking.js';

test('resolveAuraThinkingLabel returns progressive status copy', () => {
  assert.equal(resolveAuraThinkingLabel('thinking', 500, false), 'Thinking…');
  assert.equal(resolveAuraThinkingLabel('thinking', 2500, true), 'Reviewing records…');
  assert.equal(resolveAuraThinkingLabel('reviewing', 3000, true), 'Reviewing records…');
  assert.equal(resolveAuraThinkingLabel('waiting_approval', 0, false), 'Waiting for approval…');
});

test('nextAuraThinkingPhase escalates to reviewing with page context', () => {
  assert.equal(nextAuraThinkingPhase('thinking', 500, true), 'thinking');
  assert.equal(nextAuraThinkingPhase('thinking', 2500, true), 'reviewing');
  assert.equal(nextAuraThinkingPhase('waiting_approval', 100, true), 'waiting_approval');
});
