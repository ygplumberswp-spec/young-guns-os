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

export const AURA_MEMORY_INPUT_PLACEHOLDER = 'Add a quick business rule for AURA…';
