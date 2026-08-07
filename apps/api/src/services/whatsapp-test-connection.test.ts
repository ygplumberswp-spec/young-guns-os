/**
 * LIVE-001B — WhatsApp Test Connection contracts (no outbound message).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CLIENT_PERMISSIONS, TECHNICIAN_PERMISSIONS } from '@titan/auth';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('WhatsApp testStoredConnection wiring (LIVE-001B)', () => {
  it('exposes POST /whatsapp/test-connection distinct from outbound /whatsapp/test', () => {
    const routes = read('src/routes/integrations.ts');
    assert.ok(routes.includes("'/whatsapp/test-connection'"));
    assert.ok(routes.includes('testStoredConnection'));
    assert.ok(routes.includes("'/whatsapp/test'"));
    assert.ok(routes.includes('sendTestMessage'));
    // Read-only route must not call sendTestMessage.
    const testConnectionBlock = routes.slice(
      routes.indexOf("'/whatsapp/test-connection'"),
      routes.indexOf("router.post('/whatsapp/test'"),
    );
    assert.ok(testConnectionBlock.includes('testStoredConnection'));
    assert.doesNotMatch(testConnectionBlock, /sendTestMessage/);
  });

  it('Test Connection requires integrations:manage (Technician/Client blocked)', () => {
    const routes = read('src/routes/integrations.ts');
    const idx = routes.indexOf("'/whatsapp/test-connection'");
    const window = routes.slice(Math.max(0, idx - 200), idx + 250);
    assert.ok(window.includes("requireAnyPermission('integrations:manage')"));
    assert.equal(TECHNICIAN_PERMISSIONS.includes('integrations:manage' as never), false);
    assert.equal(CLIENT_PERMISSIONS.includes('integrations:manage' as never), false);
  });

  it('service testStoredConnection uses verifyConnection and never sendTextMessage', () => {
    const service = read('src/services/whatsapp.service.ts');
    assert.ok(service.includes('async testStoredConnection'));
    const start = service.indexOf('async testStoredConnection');
    const end = service.indexOf('async saveConnection', start);
    const body = service.slice(start, end);
    assert.ok(body.includes('verifyConnection'));
    assert.doesNotMatch(body, /sendTextMessage|sendTemplateMessage|\/messages/);
    assert.ok(body.includes('providerWritePerformed: false'));
    assert.ok(body.includes('outboundMessageSent: false'));
    // Must not require outbound messages for a read-only proof.
    assert.doesNotMatch(body, /ensureOutboundEnabled/);
  });

  it('Owner UI exposes Test Connection via read-only API helper', () => {
    const page = read('../web/src/pages/integrations/WhatsappSettingsPage.tsx');
    const api = read('../web/src/lib/whatsapp-api.ts');
    assert.ok(page.includes('Test Connection'));
    assert.ok(page.includes('testWhatsappConnection'));
    assert.ok(api.includes('/integrations/whatsapp/test-connection'));
    assert.doesNotMatch(
      api.slice(api.indexOf('testWhatsappConnection'), api.indexOf('sendWhatsappTestMessage')),
      /\/integrations\/whatsapp\/test'/,
    );
  });
});
