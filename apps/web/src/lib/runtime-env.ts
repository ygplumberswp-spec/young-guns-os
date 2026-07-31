/** Staging/production indicators baked at Vite build time. Never put secrets here. */

export function isStagingUi(): boolean {
  const appEnv = String(import.meta.env.VITE_APP_ENV || '').toLowerCase();
  const titanEnv = String(import.meta.env.VITE_TITAN_ENV || '').toLowerCase();
  return appEnv === 'staging' || titanEnv === 'staging';
}

declare global {
  interface Window {
    /** Set by /runtime-config.js (Docker/Railway). Empty string → same-origin `/api/v1`. */
    __TITAN_API_BASE__?: string;
  }
}

/**
 * Resolve API base from optional runtime override, then Vite build env.
 * - runtime `""` → same-origin `/api/v1` (nginx proxy)
 * - unset runtime → use `VITE_API_BASE_URL`
 * - empty Vite → same-origin `/api/v1`
 */
export function resolveApiBaseFrom(
  viteValue: string | undefined,
  runtimeDefined: boolean,
  runtimeValue: string | undefined,
): string {
  let raw = String(runtimeDefined ? (runtimeValue ?? '') : (viteValue ?? '')).trim();
  if (!raw) return '/api/v1';
  raw = raw.replace(/\/+$/, '');
  raw = raw.replace(/\/api\/v1$/i, '');
  raw = raw.replace(/\/+$/, '');
  if (!raw) return '/api/v1';
  return `${raw}/api/v1`;
}

/**
 * API origin for non-proxied deploys (Railway/Render separate services).
 * Empty → same-origin `/api/v1` (Vite proxy or nginx reverse proxy).
 */
export function resolveApiBase(): string {
  const runtimeDefined =
    typeof window !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(window, '__TITAN_API_BASE__');
  const runtimeValue = runtimeDefined ? window.__TITAN_API_BASE__ : undefined;
  return resolveApiBaseFrom(
    String(import.meta.env.VITE_API_BASE_URL || ''),
    runtimeDefined,
    runtimeValue,
  );
}
