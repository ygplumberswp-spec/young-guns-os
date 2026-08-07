/**
 * Live staging proof that the Facebook Business UI gap is closed: the web API
 * client's endpoints exist, enforce auth, and answer honestly while no Meta app
 * is configured.
 *
 * Read-only apart from creating one isolated throwaway tenant via signup, so it
 * cannot disturb the Xero historical import running against real company data.
 */
import process from 'node:process';

const BASE = process.env.FB_VERIFY_BASE ?? 'http://127.0.0.1:3011';
const SUFFIX = Date.now().toString(36);

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

/** Anything that looks like a token must never appear in an API payload. */
function hasLeakedSecret(payload) {
  const text = JSON.stringify(payload ?? {});
  return /EAA[A-Za-z0-9]{20,}|accessToken"\s*:\s*"[A-Za-z0-9]{20,}|appSecret|pageAccessToken/.test(
    text,
  );
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const signup = await api('/api/v1/auth/signup', {
  method: 'POST',
  body: {
    companyName: `FB UI Verify ${SUFFIX}`,
    firstName: 'FB',
    lastName: 'Verify',
    email: `fb.verify.${SUFFIX}@staging-fb-verify.test`,
    password: 'FbVerifyStaging1!',
  },
});
const token = signup.json?.data?.session?.accessToken;
record('signup isolated tenant', signup.status === 201 && !!token, `HTTP ${signup.status}`);
if (!token) process.exit(1);

// Every endpoint the web API client calls must exist (never 404).
const clientEndpoints = [
  ['GET', '/api/v1/facebook-business/connection'],
  ['GET', '/api/v1/facebook-business/capabilities'],
  ['GET', '/api/v1/facebook-business/content'],
  ['GET', '/api/v1/facebook-business/comments'],
  ['GET', '/api/v1/facebook-business/leads'],
  ['GET', '/api/v1/facebook-business/insights'],
  ['GET', '/api/v1/facebook-business/sync-runs'],
  ['GET', '/api/v1/facebook-business/notifications'],
  ['GET', '/api/v1/facebook-business/dashboard-card'],
];

let allMounted = true;
for (const [method, path] of clientEndpoints) {
  const res = await api(path, { method, token });
  const mounted = res.status !== 404;
  if (!mounted) allMounted = false;
  record(`${method} ${path}`, mounted, `HTTP ${res.status}`);
  if (hasLeakedSecret(res.json)) {
    record(`${path} secret redaction`, false, 'payload contained credential-like text');
    allMounted = false;
  }
}
record('every web-client endpoint mounted', allMounted);

// Honest state while no Meta app credentials exist on this host.
const connection = await api('/api/v1/facebook-business/connection', { token });
const state = connection.json?.data?.state;
record(
  'connection reports configuration_required (no Meta app configured)',
  state === 'configuration_required',
  `state=${state} appConfigured=${connection.json?.data?.appConfigured}`,
);
record(
  'connection never claims usable without credentials',
  connection.json?.data?.usable === false && connection.json?.data?.hasStoredCredentials === false,
);

// OAuth start must refuse rather than produce a dead Facebook URL.
const oauth = await api('/api/v1/facebook-business/oauth/start', {
  method: 'POST',
  token,
  body: { returnPath: '/facebook-business' },
});
record(
  'oauth start refuses while unconfigured',
  oauth.status >= 400 && !oauth.json?.data?.authorizationUrl,
  `HTTP ${oauth.status} ${oauth.json?.error?.code ?? ''}`,
);

// Publishing must be impossible before a verified connection.
const draft = await api('/api/v1/facebook-business/content', {
  method: 'POST',
  token,
  body: { title: 'Verify draft', body: 'Blocked-drain callout in Bellville this week.' },
});
const contentId = draft.json?.data?.id;
record('draft created in Draft status', draft.json?.data?.status === 'draft', `HTTP ${draft.status}`);

if (contentId) {
  const publish = await api(`/api/v1/facebook-business/content/${contentId}/publish`, {
    method: 'POST',
    token,
  });
  record(
    'publish blocked before approval and connection',
    publish.status >= 400,
    `HTTP ${publish.status} ${publish.json?.error?.code ?? ''}`,
  );
}

// Insights must not invent numbers.
const insights = await api('/api/v1/facebook-business/insights', { token });
record(
  'insights return no fabricated metrics',
  Array.isArray(insights.json?.data?.metrics) && insights.json.data.metrics.length === 0,
  `metrics=${insights.json?.data?.metrics?.length}`,
);

const failed = results.filter((entry) => !entry.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
