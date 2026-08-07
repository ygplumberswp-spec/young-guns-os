type NavTimingKind = 'cold' | 'warm' | 'prefetch-intent' | 'prefetch-idle';

type NavTimingEntry = {
  path: string;
  kind: NavTimingKind;
  at: number;
};

type WebVitalEntry = {
  name: 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB';
  value: number;
  path: string;
  at: number;
};

const entries: NavTimingEntry[] = [];
const webVitals: WebVitalEntry[] = [];
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

export function recordWebVital(
  name: WebVitalEntry['name'],
  value: number,
  path: string,
): void {
  webVitals.push({ name, value, path, at: performance.now() });
  if (webVitals.length > MAX_ENTRIES) {
    webVitals.splice(0, webVitals.length - MAX_ENTRIES);
  }
}

export function getNavPerformanceEntries(): NavTimingEntry[] {
  return [...entries];
}

export function getWebVitalEntries(): WebVitalEntry[] {
  return [...webVitals];
}

export function resetNavPerformance(): void {
  entries.length = 0;
  webVitals.length = 0;
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
  const devWindow = window as Window & {
    __titanNavPerf?: typeof getNavPerformanceEntries;
    __titanWebVitals?: typeof getWebVitalEntries;
  };
  devWindow.__titanNavPerf = getNavPerformanceEntries;
  devWindow.__titanWebVitals = getWebVitalEntries;
}
