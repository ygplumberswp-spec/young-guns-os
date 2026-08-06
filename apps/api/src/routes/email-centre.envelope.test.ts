import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'email-centre.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../services/email-centre.service.ts'),
  'utf8',
);

describe('email centre API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    const patterns = [
      'res.json({ data: { dashboard } })',
      'res.json({ data: { mailbox } })',
      'res.json({ data: { thread } })',
      'res.json({ data: { drafts } })',
      'res.status(201).json({ data: { draft } })',
      'res.json({ data: { attachments } })',
      'res.status(201).json({ data: { attachment } })',
      'res.json({ data: { timeline } })',
      'res.status(201).json({ data: { note } })',
    ];
    for (const pattern of patterns) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('has no auto-send path that bypasses approval', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!serviceSource.includes('autoSend: true'));
    assert.ok(serviceSource.includes('draft → approve → execute'));
    assert.ok(serviceSource.includes("sendProvider: 'gmail_api'"));
    assert.ok(serviceSource.includes("transactionalProvider: 'resend'"));
  });

  it('reuses Gmail index and uc_timeline_index — no parallel silo', () => {
    assert.ok(serviceSource.includes('communicationsPlatformService.listInbox'));
    assert.ok(serviceSource.includes('createGmailDraft'));
    assert.ok(serviceSource.includes('approveGmailDraft'));
    assert.ok(serviceSource.includes('executeGmailDraft'));
    assert.ok(serviceSource.includes('ucTimelineIndex'));
    assert.ok(serviceSource.includes('comm_platform_inbox_index'));
    assert.ok(serviceSource.includes('Links existing TITAN entity IDs'));
  });

  it('requires communications RBAC', () => {
    assert.ok(routeSource.includes("requireAnyPermission("));
    assert.ok(routeSource.includes("'communications:read'"));
    assert.ok(routeSource.includes("'communications:write'"));
    assert.ok(routeSource.includes('router.use(requireAuth)'));
  });

  it('audits email centre actions', () => {
    assert.ok(serviceSource.includes("category: 'communications'"));
    assert.ok(serviceSource.includes('email_centre_draft_created'));
    assert.ok(serviceSource.includes('email_centre_attachment_linked'));
    assert.ok(serviceSource.includes('email_centre_timeline_synced'));
  });
});
