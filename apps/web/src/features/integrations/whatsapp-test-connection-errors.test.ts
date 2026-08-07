/**
 * LIVE-001C — Owner-safe WhatsApp Test Connection error banners.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../pages/integrations/WhatsappSettingsPage.tsx'),
  'utf8',
);

describe('WhatsApp Test Connection Owner error mapping (LIVE-001C)', () => {
  it('maps provider auth/credential failures to safe banners', () => {
    for (const token of [
      'Meta authentication expired — reconnect required',
      'Stored credential unavailable',
      'Meta phone number not found',
      'Provider temporarily unavailable',
      'formatWhatsappTestConnectionError',
    ]) {
      assert.ok(page.includes(token), `missing ${token}`);
    }
  });

  it('does not treat hasCredentials-alone as plain Connected when status is error', () => {
    assert.ok(page.includes('Connected (verification needed)'));
    assert.ok(page.includes("connection.status === 'error' && connection.hasCredentials"));
  });
});
