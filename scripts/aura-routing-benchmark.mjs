#!/usr/bin/env node
/**
 * AURA routing benchmark — runs the safe overview message multiple times.
 * Does not print secrets. Requires API on :3000.
 *
 * Env:
 *   AURA_STAGE2_EMAIL / AURA_STAGE2_PASSWORD — existing account
 *   or AURA_BENCH_SIGNUP=1 — ephemeral signup per run
 */
const API_BASE = process.env.AURA_BENCH_API_BASE ?? 'http://localhost:3000/api/v1';
const EMAIL = process.env.AURA_STAGE2_EMAIL;
const PASSWORD = process.env.AURA_STAGE2_PASSWORD;
const TEST_MESSAGE =
  'Give me a brief overview of what TITAN can help me manage.';
const RUNS = Number(process.env.AURA_BENCH_RUNS ?? 5);

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
  assertNoSecrets('Response headers', JSON.stringify(Object.fromEntries(response.headers.entries())));

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = { raw: bodyText };
  }

  return { response, payload, elapsedMs, bodyText, serverTiming: response.headers.get('Server-Timing') };
}

async function signupAndLogin() {
  const suffix = Date.now();
  const email = `aura-bench-${suffix}@example.com`;
  const password = 'BenchPass123!';

  const signup = await request('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: `Aura Bench ${suffix}`,
      email,
      password,
      firstName: 'Aura',
      lastName: 'Bench',
    }),
  });

  if (!signup.response.ok) {
    throw new Error(`Signup failed (${signup.response.status})`);
  }

  return signup.payload.data.session.accessToken;
}

async function login() {
  if (process.env.AURA_BENCH_SIGNUP === '1' || !EMAIL || !PASSWORD) {
    return signupAndLogin();
  }

  const { response, payload } = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`);
  }

  return payload.data.session.accessToken;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

async function main() {
  const accessToken = await login();

  const create = await request('/aura/conversations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!create.response.ok) {
    throw new Error(`Create conversation failed (${create.response.status})`);
  }

  const conversationId = create.payload.data.conversation.id;
  const runs = [];

  for (let index = 0; index < RUNS; index += 1) {
    const result = await request(`/aura/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: TEST_MESSAGE }),
    });

    if (!result.response.ok) {
      throw new Error(`Message ${index + 1} failed (${result.response.status})`);
    }

    const diagnostics = result.payload.data.diagnostics;
    runs.push({
      run: index + 1,
      totalApiMs: diagnostics?.totalApiMs ?? result.elapsedMs,
      providerRoutingMs: diagnostics?.providerRoutingMs ?? null,
      providerMs: diagnostics?.providerMs ?? null,
      contextBuildMs: diagnostics?.contextBuildMs ?? null,
      databaseMs: diagnostics?.databaseMs ?? null,
      routing: diagnostics?.routing ?? null,
      serverTiming: result.serverTiming,
      cacheHit: diagnostics?.routing?.cacheHit ?? null,
      fastPathUsed: diagnostics?.routing?.fastPathUsed ?? null,
      dbQueryCount: diagnostics?.routing?.dbQueryCount ?? null,
    });
  }

  const totals = runs.map((run) => run.totalApiMs);
  const routing = runs.map((run) => run.providerRoutingMs).filter((value) => value != null);

  const report = {
    runs,
    summary: {
      medianTotalMs: median(totals),
      fastestTotalMs: Math.min(...totals),
      slowestTotalMs: Math.max(...totals),
      medianRoutingMs: routing.length > 0 ? median(routing) : null,
      fastestRoutingMs: routing.length > 0 ? Math.min(...routing) : null,
      slowestRoutingMs: routing.length > 0 ? Math.max(...routing) : null,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
