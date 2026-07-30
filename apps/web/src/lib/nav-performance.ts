type NavTimingKind = 'cold' | 'warm' | 'prefetch-intent' | 'prefetch-idle';

type NavTimingEntry = {
  path: string;
  kind: NavTimingKind;
  at: number;
};

const entries: NavTimingEntry[] = [];
const MAX_ENTRIES = 200;

export function recordNavVisit(path: string, kind: 'cold' | 'warm'): void {
  entries.push({ path, kind, at: performance.now() });
  trim();
}

export function recordNavPrefetch(path: string, kind: 'intent' | 'idle'): void {
  entries.push({
    path,
    kind: kind === 'intent' ? 'prefetch-intent' : 'prefetch-idle',
    at: performance.now(),
  });
  trim();
}

export function getNavPerformanceEntries(): NavTimingEntry[] {
  return [...entries];
}

export function resetNavPerformance(): void {
  entries.length = 0;
}

function trim(): void {
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

const isDevEnvironment =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

if (isDevEnvironment && typeof window !== 'undefined') {
  (window as Window & { __titanNavPerf?: typeof getNavPerformanceEntries }).__titanNavPerf =
    getNavPerformanceEntries;
}
