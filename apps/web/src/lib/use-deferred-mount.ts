import { useEffect, useState } from 'react';

/**
 * Defers mounting heavy panels until after first paint or a primary query completes.
 * Keeps hook order stable — use to gate `enabled` flags and conditional render together.
 */
export function useDeferredMount(active: boolean, delayMs = 0): boolean {
  const [ready, setReady] = useState(() => active && delayMs === 0);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    if (delayMs === 0) {
      setReady(true);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return ready;
}
