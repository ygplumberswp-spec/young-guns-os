export function isSaveDataEnabled(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return connection?.saveData === true;
}

export function isSlowNetwork(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) {
    return false;
  }

  const effectiveType = connection.effectiveType;
  return effectiveType === 'slow-2g' || effectiveType === '2g';
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function shouldAllowBackgroundPreload(): boolean {
  if (typeof document !== 'undefined' && document.hidden) {
    return false;
  }

  if (isOffline()) {
    return false;
  }

  if (isSaveDataEnabled()) {
    return false;
  }

  if (isSlowNetwork()) {
    return false;
  }

  return true;
}

export function preloadDelayMs(): number {
  if (isSlowNetwork()) {
    return 2_000;
  }
  return 0;
}

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}
