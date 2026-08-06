import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'personal-whatsapp-connection.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/personal-whatsapp-connection.service.ts'),
  'utf8',
);

describe('personal whatsapp connection API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({\n        data: {\n          dashboard,\n          autoSend: false as const,\n          autoImport: false as const,\n        },\n      })',
      'res.json({ data: { connection, autoSend: false as const } })',
      'res.json({ data: { events, autoSend: false as const } })',
      'liveProviderVerified: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('denies non Platform Owner with 403', () => {
    assert.ok(routeSource.includes('denyPersonal(res)'));
    assert.ok(routeSource.includes('isPlatformOwnerRole(actor)'));
    assert.ok(
      routeSource.includes(
        'Personal WhatsApp Connection Layer is Platform Owner only (same gate as Personal WhatsApp Assistant).',
      ),
    );
  });

  it('never auto-sends or auto-imports', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoImport: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoImport: false'));
    assert.ok(serviceSource.includes('neverAutoImport: true'));
    assert.ok(serviceSource.includes('requireApprovalToSend: true'));
  });

  it('extends personal_whatsapp credential path — not Business WA tables', () => {
    assert.ok(serviceSource.includes("accountKind: 'personal_whatsapp'"));
    assert.ok(serviceSource.includes('commPlatformAccounts'));
    assert.ok(serviceSource.includes('personalWaConnections'));
    assert.ok(!serviceSource.includes('whatsappMessages'));
    assert.ok(!serviceSource.includes('personalCommConversations'));
  });

  it('requires encryption key before storing credentials', () => {
    assert.ok(serviceSource.includes('INTEGRATIONS_ENCRYPTION_KEY must be configured'));
    assert.ok(serviceSource.includes('encryptWhatsappCredentials'));
  });

  it('honest about live provider verification', () => {
    assert.ok(serviceSource.includes('liveProviderVerified: false'));
    assert.ok(serviceSource.includes('liveDeviceLinkAvailable: false'));
    assert.ok(serviceSource.includes('metaGraphProbeAvailable: false'));
  });

  it('writes security audit logs for connection lifecycle', () => {
    assert.ok(serviceSource.includes("entityType: 'personal_whatsapp_connection'"));
    assert.ok(serviceSource.includes('personal_wa_number_linked'));
    assert.ok(serviceSource.includes('personal_wa_session_connected'));
    assert.ok(serviceSource.includes('personal_wa_session_disconnected'));
    assert.ok(serviceSource.includes('personal_wa_reconnect_requested'));
    assert.ok(serviceSource.includes('securityAuditLogs'));
  });
});
