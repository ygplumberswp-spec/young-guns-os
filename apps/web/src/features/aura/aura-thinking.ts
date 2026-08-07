export type AuraThinkingPhase = 'idle' | 'thinking' | 'reviewing' | 'waiting_approval';

export function resolveAuraThinkingLabel(
  phase: AuraThinkingPhase,
  elapsedMs: number,
  hasPageContext: boolean,
): string {
  if (phase === 'waiting_approval') {
    return 'Waiting for approval…';
  }

  if (phase === 'reviewing' || (phase === 'thinking' && hasPageContext && elapsedMs >= 2000)) {
    return 'Reviewing records…';
  }

  if (phase === 'thinking') {
    return 'Thinking…';
  }

  return '';
}

export function nextAuraThinkingPhase(
  current: AuraThinkingPhase,
  elapsedMs: number,
  hasPageContext: boolean,
): AuraThinkingPhase {
  if (current === 'waiting_approval' || current === 'idle') {
    return current;
  }

  if (hasPageContext && elapsedMs >= 2000) {
    return 'reviewing';
  }

  return 'thinking';
}
