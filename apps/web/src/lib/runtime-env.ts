/** Staging/production indicators baked at Vite build time. Never put secrets here. */

export function isStagingUi(): boolean {
  const appEnv = String(import.meta.env.VITE_APP_ENV || '').toLowerCase();
  const titanEnv = String(import.meta.env.VITE_TITAN_ENV || '').toLowerCase();
  return appEnv === 'staging' || titanEnv === 'staging';
}

/**
 * API origin for non-proxied deploys (Railway/Render separate services).
 * Empty → same-origin `/api/v1` (Vite proxy or reverse proxy).
 * Accepts either `https://api.example.com` or `https://api.example.com/api/v1`.
 */
export function resolveApiBase(): string {
  let raw = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw) return '/api/v1';
  raw = raw.replace(/\/+$/, '');
  raw = raw.replace(/\/api\/v1$/i, '');
  raw = raw.replace(/\/+$/, '');
  if (!raw) return '/api/v1';
  return `${raw}/api/v1`;
}
