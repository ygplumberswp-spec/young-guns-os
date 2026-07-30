#!/usr/bin/env node
/**
 * Stage 2 verification for AURA message path.
 * Does not print secrets. Requires API on :3000 and valid owner credentials via env:
 *   AURA_STAGE2_EMAIL, AURA_STAGE2_PASSWORD
 */
const API_BASE = process.env.AURA_STAGE2_API_BASE ?? 'http://localhost:3000/api/v1';
const EMAIL = process.env.AURA_STAGE2_EMAIL;
const PASSWORD = process.env.AURA_STAGE2_PASSWORD;
const TEST_MESSAGE =
  process.env.AURA_STAGE2_MESSAGE ??
  'Give me a brief overview of what TITAN can help me manage.';

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

  return { response, payload, elapsedMs, bodyText };
}

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set AURA_STAGE2_EMAIL and AURA_STAGE2_PASSWORD for live verification');
  }

  const { response, payload } = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status}): ${payload?.error?.message ?? 'unknown'}`);
  }

  return payload.data.session.accessToken;
}

async function main() {
  const report = {
    browserRequestMs: null,
    diagnostics: null,
    serverTiming: null,
    providerStatus: null,
    messageSucceeded: false,
    assistantPreview: null,
  };

  const accessToken = await login();

  const create = await request('/aura/conversations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!create.response.ok) {
    throw new Error(`Create conversation failed: ${create.payload?.error?.message ?? 'unknown'}`);
  }

  const conversationId = create.payload.data.conversation.id;
  const sendStarted = Date.now();
  const send = await request(`/aura/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: TEST_MESSAGE }),
  });
  report.browserRequestMs = Date.now() - sendStarted;
  report.serverTiming = send.response.headers.get('server-timing');

  if (!send.response.ok) {
    console.log(JSON.stringify({ ok: false, status: send.response.status, report, error: send.payload?.error }, null, 2));
    process.exit(1);
  }

  report.diagnostics = send.payload.data.diagnostics ?? null;
  report.messageSucceeded = Boolean(send.payload.data.assistantMessage?.content);
  report.assistantPreview = send.payload.data.assistantMessage?.content?.slice(0, 180) ?? null;

  const providers = await request('/ai-orchestration/providers', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (providers.response.ok) {
    report.providerStatus = providers.payload.data.providers
      .filter((provider) => provider.isConfigured)
      .map((provider) => ({
        name: provider.name,
        providerKey: provider.providerKey,
        healthStatus: provider.healthStatus,
        isEnabled: provider.isEnabled,
        credentialsConfigured: provider.credentialsConfigured,
      }));
  }

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
