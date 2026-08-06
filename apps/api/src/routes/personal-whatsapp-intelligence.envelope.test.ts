import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'personal-whatsapp-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/personal-whatsapp-intelligence.service.ts'),
  'utf8',
);

describe('personal whatsapp intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { dashboard } })',
      'res.json({ data: { threads } })',
      'res.status(201).json({ data: { result, autoSend: false as const, autoLinked: false as const } })',
      'res.json({ data: { proposals, autoLinked: false as const } })',
      'res.json({ data: { suggestions, autoSend: false as const } })',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('denies non Platform Owner with 403', () => {
    assert.ok(routeSource.includes('denyPersonal(res)'));
    assert.ok(routeSource.includes('isPlatformOwnerRole(actor)'));
    assert.ok(routeSource.includes('Personal WhatsApp Intelligence is Platform Owner only'));
  });

  it('never auto-sends or auto-links', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoLinked: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoLinked: false'));
    assert.ok(serviceSource.includes('Approval does not send any WhatsApp message'));
  });

  it('does not use Business WhatsApp messages as the source path', () => {
    assert.ok(serviceSource.includes('usesBusinessWhatsappMessages: false'));
    assert.ok(serviceSource.includes('neverBusinessWhatsappMessages: true'));
    assert.ok(serviceSource.includes('commPlatformPersonalThreads'));
    assert.ok(!serviceSource.includes('whatsappService.listMessages'));
  });

  it('blocks private-personal CRM/timeline links without reclassification', () => {
    assert.ok(serviceSource.includes('PRIVACY_BLOCKED'));
    assert.ok(serviceSource.includes('Private-personal threads cannot be linked'));
  });

  it('clarifies PCI vs Personal Assistant vs this workflow', () => {
    assert.ok(serviceSource.includes('PERSONAL_WA_INTEL_PRODUCT_COPY'));
    assert.ok(serviceSource.includes('productClarification'));
  });
});
