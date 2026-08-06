#!/usr/bin/env node
/** Sanitised Gate 5B error probe — no secrets */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireAuth = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/auth/package.json'),
);
const requireDb = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const { hashPassword } = requireAuth('@titan/auth');
const postgres = requireDb('postgres');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = 'https://young-guns-os-staging.up.railway.app';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function redact(text) {
  return String(text ?? '')
    .replace(/Bearer\s+\S+/gi, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .slice(0, 300);
}

async function api(pathname, { method = 'GET', token, body, timeoutMs = 120_000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${STAGING}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: redact(text) };
    }
    return {
      status: res.status,
      elapsedMs: Date.now() - t0,
      retryAfter: res.headers.get('Retry-After'),
      errorCode: json?.error?.code ?? null,
      message: redact(json?.error?.message ?? json?.data?.result?.note ?? null),
      providerOk: json?.data?.result?.payment?.providerOk ?? json?.data?.result?.invoice?.providerOk ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const url = fs
    .readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8')
    .match(/^DATABASE_URL=(.+)$/m)[1]
    .trim()
    .replace(/^["']|["']$/g, '');

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const [budget] = await sql`
      SELECT min_limit_remaining, day_limit_remaining, rate_limit_problem,
             retry_after_until, updated_at
      FROM xero_rate_budget_state WHERE company_id = ${YGP}::uuid`;

    const suffix = randomBytes(3).toString('hex');
    const email = `gate5bprobe.${suffix}@staging-gate5b.test`;
    const passwordHash = await hashPassword('Gate5bProbe1!');
    const role = await sql`
      INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
      VALUES (${YGP}, ${'Gate5B Probe ' + suffix}, ${sql.json(['*', 'integrations:manage'])}, false, now(), now())
      RETURNING id`;
    await sql`
      INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
      VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'G', '5BP', now(), now())`;

    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password: 'Gate5bProbe1!' },
    });
    const token = login.errorCode ? null : (await fetch(`${STAGING}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Gate5bProbe1!' }),
    }).then((r) => r.json())).data?.session?.accessToken;

    const selection = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json'), 'utf8'),
    );

    const report = {
      at: new Date().toISOString(),
      rateBudget: budget ?? null,
      xeroTest: await api('/api/v1/integrations/xero/test', { method: 'POST', token }),
      gate5b: await api('/api/v1/integrations/xero/gate5b-payment-observation', {
        method: 'POST',
        token,
        body: { invoiceId: selection.selected.invoiceId, runTargetedRefresh: true },
      }),
    };

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.gate5b.status === 200 && report.gate5b.providerOk !== false ? 0 : 2);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(redact(e?.message || e));
  process.exit(1);
});
