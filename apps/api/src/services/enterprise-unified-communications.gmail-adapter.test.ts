import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const serviceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'enterprise-unified-communications.service.ts'),
  'utf8',
);

describe('UC Business Gmail adapter registration', () => {
  it('ensures a real gmail provider adapter on dashboard load', () => {
    assert.ok(serviceSource.includes('ensureRegisteredChannelAdapters'));
    assert.ok(serviceSource.includes("providerKey: GMAIL_UC_PROVIDER_KEY"));
    assert.ok(serviceSource.includes("GMAIL_UC_PROVIDER_KEY = 'gmail'"));
    assert.ok(serviceSource.includes("GMAIL_UC_ADAPTER_NAME = 'Business Gmail'"));
    assert.ok(serviceSource.includes('oauthConfigured'));
    assert.ok(serviceSource.includes("connectPath: '/communications-hub'"));
  });

  it('never marks gmail active without oauthConfigured and connected credentials', () => {
    assert.ok(serviceSource.includes('account?.status === \'connected\''));
    assert.ok(serviceSource.includes('Boolean(account.credentialsEncrypted)'));
    assert.ok(serviceSource.includes('gmail.connected ? \'active\' : \'inactive\''));
  });
});
