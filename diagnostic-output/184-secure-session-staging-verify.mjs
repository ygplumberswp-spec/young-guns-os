/**
 * Secure persistent session staging verification.
 * Staging only — no production writes. Does not trigger Xero import mutations.
 *
 * Usage:
 *   node diagnostic-output/184-secure-session-staging-verify.mjs
 *
 * Optional: OWNER_ACCESS_TOKEN for authenticated route checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/184-secure-session-staging-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(/\/$/, '');
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(/\/$/, '');
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN?.trim() || null;

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail: String(detail).slice(0, 300) });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 300) });
}
function partial(results, name, detail = '') {
  results.push({ name, status: 'PARTIAL', detail: String(detail).slice(0, 300) });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  const results = [];
  const startedAt = new Date().toISOString();

  if (API_ORIGIN.includes(FORBIDDEN) || WEB_ORIGIN.includes(FORBIDDEN)) {
    fail(results, 'staging_target_guard', 'Refused production Supabase ref');
    writeReport(results, startedAt);
    return;
  }

  // API health
  const health = await fetchJson(`${API_ORIGIN}/api/v1/health`);
  if (health.status === 200) {
    pass(results, 'api_health', `status=${health.status}`);
  } else {
    fail(results, 'api_health', `status=${health.status}`);
  }

  const ready = await fetchJson(`${API_ORIGIN}/api/v1/health/ready`);
  if (ready.status === 200) {
    pass(results, 'api_ready', 'ready');
  } else {
    partial(results, 'api_ready', `status=${ready.status}`);
  }

  // Web health (same-origin proxy)
  const web = await fetchJson(`${WEB_ORIGIN}/`);
  if (web.status === 200) {
    pass(results, 'web_health', `status=${web.status}`);
  } else {
    partial(results, 'web_health', `status=${web.status}`);
  }

  // Refresh contract — missing cookie
  const refreshMissing = await fetchJson(`${API_ORIGIN}/api/v1/auth/refresh`, { method: 'POST' });
  if (refreshMissing.status === 401 && refreshMissing.json?.error?.code === 'SESSION_MISSING') {
    pass(results, 'refresh_missing_cookie', refreshMissing.json.error.code);
  } else {
    fail(results, 'refresh_missing_cookie', JSON.stringify(refreshMissing.json));
  }

  // Same-origin web runtime config probe
  const runtime = await fetchJson(`${WEB_ORIGIN}/runtime-config.js`);
  if (runtime.status === 200) {
    pass(results, 'web_runtime_config', 'present');
  } else {
    partial(results, 'web_runtime_config', `status=${runtime.status}`);
  }

  // Protected route surfaces (HTML shell reachable)
  for (const route of ['/integrations/xero', '/', '/settings/security', '/mobile/jobs']) {
    const page = await fetchJson(`${WEB_ORIGIN}${route}`);
    if (page.status === 200) {
      pass(results, `web_route_shell_${route}`, 'shell OK');
    } else {
      partial(results, `web_route_shell_${route}`, `status=${page.status}`);
    }
  }

  if (OWNER_ACCESS_TOKEN) {
    const sessions = await fetchJson(`${API_ORIGIN}/api/v1/auth/sessions`, {
      headers: { Authorization: `Bearer ${OWNER_ACCESS_TOKEN}`, Accept: 'application/json' },
    });
    if (sessions.status === 200 && Array.isArray(sessions.json?.data?.sessions)) {
      pass(results, 'auth_my_sessions', `count=${sessions.json.data.sessions.length}`);
    } else {
      partial(results, 'auth_my_sessions', `status=${sessions.status}`);
    }

    const me = await fetchJson(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${OWNER_ACCESS_TOKEN}`, Accept: 'application/json' },
    });
    if (me.status === 200 && me.json?.data?.user?.companyId) {
      pass(results, 'auth_me_after_restore', me.json.data.user.roleName ?? 'ok');
    } else {
      partial(results, 'auth_me_after_restore', `status=${me.status}`);
    }
  } else {
    partial(results, 'auth_my_sessions', 'OWNER_ACCESS_TOKEN not set — cookie restore checks skipped');
    partial(results, 'auth_me_after_restore', 'OWNER_ACCESS_TOKEN not set');
  }

  writeReport(results, startedAt);
}

function writeReport(results, startedAt) {
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const partialCount = results.filter((r) => r.status === 'PARTIAL').length;
  const report = {
    label: 'SECURE-SESSION-184',
    startedAt,
    finishedAt: new Date().toISOString(),
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    summary: `${passCount} PASS / ${partialCount} PARTIAL / ${failCount} FAIL`,
    overall: failCount === 0 ? (partialCount === 0 ? 'GO' : 'PARTIAL') : 'NO-GO',
    results,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
