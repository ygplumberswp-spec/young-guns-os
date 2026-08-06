import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'communication-aura-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/communication-aura-intelligence.service.ts'),
  'utf8',
);

describe('communication aura intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({\n        data: {\n          dashboard,\n          autoSend: false as const,\n          autoLinked: false as const,\n          usesPersonalWhatsapp: false as const,\n        },\n      })',
      'res.json({ data: { messages, autoSend: false as const } })',
      'res.json({ data: { insights, autoSend: false as const } })',
      'res.json({ data: { draft, autoSend: false as const } })',
      'res.json({ data: { proposal, autoLinked: false as const } })',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('requires auth + communications permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes("communications:read"));
    assert.ok(routeSource.includes("communications:write"));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-sends or auto-links', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoLinked: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoLinked: false'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
  });

  it('sources business inbox only — never Personal WhatsApp tables', () => {
    assert.ok(serviceSource.includes("accountKind, 'business_gmail'"));
    assert.ok(serviceSource.includes("accountKind, 'business_whatsapp'"));
    assert.ok(serviceSource.includes('commPlatformInboxIndex'));
    assert.ok(serviceSource.includes('Personal WhatsApp is never'));
    assert.ok(!serviceSource.includes('commPlatformPersonalThreads'));
    assert.ok(!serviceSource.includes('personalWaConnections'));
    assert.ok(!serviceSource.includes('whatsappMessages'));
  });

  it('keeps sentiment honesty (unavailable when no signal)', () => {
    assert.ok(serviceSource.includes('detectCommAuraSentiment'));
    assert.ok(serviceSource.includes("sentiment === 'unavailable'"));
  });

  it('writes security audit logs and links Communication Timeline', () => {
    assert.ok(serviceSource.includes("entityType: 'communication_aura_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('ucTimelineIndex'));
    assert.ok(serviceSource.includes("sourceModule: 'communication_aura_intelligence'"));
    assert.ok(serviceSource.includes('comm_aura_scan_completed'));
    assert.ok(serviceSource.includes('comm_aura_draft_approved'));
  });

  it('approval does not send outbound messages', () => {
    assert.ok(
      routeSource.includes(
        'Approval does not send — use Email Centre / Gmail draft execute path.',
      ),
    );
    assert.ok(serviceSource.includes('Approval does not send'));
  });
});
