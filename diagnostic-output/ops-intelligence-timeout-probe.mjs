/**
 * Times GET /ops-intelligence/snapshot on the live staging API.
 *
 * Uses the repo's established staging-verification pattern: sign up a throwaway
 * staging tenant through the public API and measure with its Owner token. No real
 * tenant is touched and no credential is invented.
 */
const API = process.env.API_ORIGIN ?? 'https://young-guns-os-staging.up.railway.app';
const BASE = `${API}/api/v1`;

async function call(path, options = {}) {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ms: Math.round(performance.now() - started), status: response.status, json };
}

async function main() {
  const suffix = Date.now().toString(36);
  const signup = await call('/auth/signup', {
    method: 'POST',
    body: {
      companyName: `OPS-TIMEOUT-PROBE ${suffix}`,
      firstName: 'Ops',
      lastName: 'Probe',
      email: `ops-timeout-probe.${suffix}@staging-ops-probe.test`,
      password: 'OpsTimeoutProbe1!',
    },
  });
  if (signup.status !== 201) {
    console.error('signup failed', signup.status, JSON.stringify(signup.json));
    process.exit(1);
  }
  const token = signup.json.data.session.accessToken;
  console.log(`signup ${signup.status} in ${signup.ms} ms`);

  const health = await call('/health/ready');
  console.log(`health/ready ${health.status} in ${health.ms} ms`);

  const results = [];
  for (let i = 0; i < 4; i++) {
    const run = await call('/ops-intelligence/snapshot', { token });
    results.push(run.ms);
    console.log(
      `ops-intelligence/snapshot run ${i + 1}: ${run.status} in ${run.ms} ms` +
        (run.json?.error ? ` error=${JSON.stringify(run.json.error)}` : ''),
    );
  }

  const strip = await call('/ops-intelligence/live-strip', { token });
  console.log(`ops-intelligence/live-strip: ${strip.status} in ${strip.ms} ms`);
  const brief = await call('/ops-intelligence/morning-brief', { token });
  console.log(`ops-intelligence/morning-brief: ${brief.status} in ${brief.ms} ms`);

  const summary = await call('/dashboard/executive-summary', { token });
  console.log(`dashboard/executive-summary: ${summary.status} in ${summary.ms} ms`);

  console.log(
    `\nsnapshot median ${results.slice().sort((a, b) => a - b)[Math.floor(results.length / 2)]} ms · runs ${results.join(', ')}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
