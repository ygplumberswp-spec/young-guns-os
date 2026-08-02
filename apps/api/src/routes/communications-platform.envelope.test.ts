import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'communications-platform.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../services/communications-platform.service.ts',
  ),
  'utf8',
);

describe('communications platform API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    const patterns = [
      'res.json({ data: { dashboard } })',
      'res.json({ data: { inbox: result } })',
      'res.json({ data: { search: result } })',
      'res.json({ data: { settings } })',
      'res.status(201).json({ data: { draft } })',
      'res.json({ data: { chats } })',
      "res.json({ data: { prompts, autoImport: false as const } })",
    ];
    for (const pattern of patterns) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('denies personal WhatsApp to non-owners with 403', () => {
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    assert.ok(routeSource.includes('Personal WhatsApp Assistant is Platform Owner only'));
    assert.ok(routeSource.includes('denyPersonal(res)'));
    assert.ok(routeSource.includes('isPlatformOwnerRole(actor)'));
  });

  it('has no auto-send path that bypasses approval', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(serviceSource.includes("autoSend: false"));
    assert.ok(serviceSource.includes('draft → approve → execute'));
    assert.ok(
      serviceSource.includes('Draft must be approved before execute — no auto-send path'),
    );
    // Execute requires prior approval status
    assert.ok(serviceSource.includes("existing.status !== 'approved'"));
  });

  it('business search hard-filters personal items', () => {
    assert.ok(serviceSource.includes('!i.isPersonal && i.isBusinessIndexed'));
    assert.ok(serviceSource.includes('businessOnly: true'));
    assert.ok(serviceSource.includes('Personal WhatsApp is never present in business search'));
  });

  it('import decisions never auto-import', () => {
    assert.ok(serviceSource.includes('autoImported: false'));
    assert.ok(serviceSource.includes('executedImport: false'));
    assert.ok(serviceSource.includes('Nothing was auto-imported'));
  });
});
