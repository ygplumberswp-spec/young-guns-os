import type { AuraMemorySummary } from './intelligence.js';

/** Normalize memory text for duplicate detection within a tenant. */
export function normalizeAuraMemoryText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?;,]+$/, '');
}

export function isDuplicateAuraMemory(
  existing: Pick<AuraMemorySummary, 'information'>,
  candidate: string,
): boolean {
  const normalizedCandidate = normalizeAuraMemoryText(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  return normalizeAuraMemoryText(existing.information) === normalizedCandidate;
}

export function findDuplicateAuraMemory(
  memories: Array<Pick<AuraMemorySummary, 'id' | 'information'>>,
  candidate: string,
): Pick<AuraMemorySummary, 'id' | 'information'> | null {
  return memories.find((memory) => isDuplicateAuraMemory(memory, candidate)) ?? null;
}
