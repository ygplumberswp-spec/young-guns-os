/** Enter saves; Shift+Enter expands for multiline notes. */
export function shouldSaveAuraMemoryOnEnter(event: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return event.key === 'Enter' && !event.shiftKey;
}

export function shouldExpandAuraMemoryOnEnter(event: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return event.key === 'Enter' && event.shiftKey;
}

export const AURA_MEMORY_SAVED_MESSAGE = 'Saved to company memory.';

export const AURA_MEMORY_INPUT_PLACEHOLDER = 'Add a quick business rule for AURA…';
