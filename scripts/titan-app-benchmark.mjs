#!/usr/bin/env node
/**
 * Whole-app API benchmark for TITAN performance verification.
 * Does not print secrets. Requires API on :3000.
 *
 * Env:
 *   TITAN_BENCH_EMAIL / TITAN_BENCH_PASSWORD — optional existing owner account
 *   TITAN_BENCH_SIGNUP=1 — ephemeral signup when credentials omitted
 */
const API_BASE = process.env.TITAN_BENCH_API_BASE ?? 'http://localhost:3000/api/v1';
const EMAIL = process.env.TITAN_BENCH_EMAIL;
const PASSWORD = process.env.TITAN_BENCH_PASSWORD;

const ENDPOINTS = [
  { name: 'health', path: '/health', auth: false },
  { name: 'crm-stats', path: '/crm/stats', auth: true },
  { name: 'jobs-stats', path: '/jobs/stats', auth: true },
  { name: 'finance-stats', path: '/finance/stats', auth: true },
  { name: 'company-profile', path: '/company/profile', auth: true },
  { name: 'integrations-hub', path: '/integrations/hub/dashboard', auth: true },
  { name: 'mission-control', path: '/mission-control/dashboard', auth: true },
];

const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{8,}/, /AURA_OPENAI_API_KEY\s*=\s*\S+/];

function assertNoSecrets(label, text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`${label} appears to expose a secret`);
    }
  }
}

async function request(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${API_BASE}${path}`, options);
  const bodyText = await response.text();
  const elapsedMs = Date.now() - started;
  assertNoSecrets('Response body', bodyText);
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = null;
  }
  return { response, elapsedMs, serverTiming: response.headers.get('Server-Timing'), payload, bodyText };
}

async function signupAndLogin() {
  const suffix = Date.now();
  const signup = await request('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: `Bench Co ${suffix}`,
      email: `bench-${suffix}@example.com`,
      password: 'BenchPass123!',
      firstName: 'Bench',
      lastName: 'Owner',
    }),
  });
  if (!signup.response.ok) throw new Error(`Signup failed (${signup.response.status})`);
  return signup.payload.data.session.accessToken;
}

async function login() {
  if (process.env.TITAN_BENCH_SIGNUP === '1' || !EMAIL || !PASSWORD) {
    return signupAndLogin();
  }
  const result = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!result.response.ok) throw new Error(`Login failed (${result.response.status})`);
  return result.payload.data.session.accessToken;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

async function main() {
  const loginStarted = Date.now();
  const accessToken = await login();
  const loginMs = Date.now() - loginStarted;

  const cold = [];
  for (const endpoint of ENDPOINTS) {
    const headers = endpoint.auth
      ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
    const result = await request(endpoint.path, { headers });
    cold.push({
      name: endpoint.name,
      status: result.response.status,
      ms: result.elapsedMs,
      serverTiming: result.serverTiming,
      phase: 'cold',
    });
  }

  const warm = [];
  for (const endpoint of ENDPOINTS) {
    const headers = endpoint.auth
      ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
    const result = await request(endpoint.path, { headers });
    warm.push({
      name: endpoint.name,
      status: result.response.status,
      ms: result.elapsedMs,
      serverTiming: result.serverTiming,
      phase: 'warm',
    });
  }

  const auraBench = process.env.TITAN_BENCH_AURA === '0'
    ? null
    : await (async () => {
        const create = await request('/aura/conversations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        if (!create.response.ok) return { error: `conversation create ${create.response.status}` };
        const conversation = create.payload.data.conversation;
        const message = await request(`/aura/conversations/${conversation.id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'Give me a brief overview of what TITAN can help me manage.',
          }),
        });
        return {
          totalApiMs: message.payload?.data?.diagnostics?.totalApiMs ?? message.elapsedMs,
          providerRoutingMs: message.payload?.data?.diagnostics?.providerRoutingMs ?? null,
          providerMs: message.payload?.data?.diagnostics?.providerMs ?? null,
        };
      })();

  const report = {
    loginMs,
    cold,
    warm,
    summary: {
      coldMedianMs: median(cold.map((entry) => entry.ms)),
      warmMedianMs: median(warm.map((entry) => entry.ms)),
      slowestCold: cold.reduce((max, entry) => (entry.ms > max.ms ? entry : max), cold[0]),
      slowestWarm: warm.reduce((max, entry) => (entry.ms > max.ms ? entry : max), warm[0]),
    },
    aura: auraBench,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
