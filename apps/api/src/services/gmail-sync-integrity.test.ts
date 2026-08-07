/**
 * LIVE-001B — Gmail sync uniqueness + auto-update truth (code contracts).
 * Does not delete or modify real mailbox data.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(apiRoot, '../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Gmail sync deduplication (LIVE-001B)', () => {
  it('skips already-indexed Gmail message IDs before insert (application idempotency)', () => {
    const service = read(join(apiRoot, 'src/services/communications-platform.service.ts'));
    assert.ok(service.includes('existingIdSet'));
    assert.ok(service.includes('externalMessageId'));
    assert.ok(service.includes('if (existingIdSet.has(item.id))'));
    assert.ok(service.includes('skipped += 1'));
    // Index path stores Gmail provider message id.
    assert.ok(service.includes('externalMessageId: message.id'));
  });

  it('Owner Sync Now uses maxMessages=40 (matches 40→80 = two unique batches, not same-ID reimport)', () => {
    const panel = read(
      join(repoRoot, 'apps/web/src/features/communications-hub/CommunicationsPlatformPanel.tsx'),
    );
    assert.ok(panel.includes("maxMessages: 40"));
    const service = read(join(apiRoot, 'src/services/communications-platform.service.ts'));
    assert.ok(service.includes('maxMessages ?? 40'));
    assert.ok(service.includes('Math.min(Math.max(options.maxMessages ?? 40, 1), 100)'));
  });

  it('inbox foundation 0121 had no unique on external_message_id; LIVE-001E 0192 adds WA/hub partial unique', () => {
    const sql = read(
      join(repoRoot, 'packages/db/drizzle/0121_communications_platform_v1.sql'),
    );
    assert.ok(sql.includes('comm_platform_inbox_index'));
    assert.ok(sql.includes('external_message_id'));
    // Foundation migration itself does not declare UNIQUE — hardening is 0192.
    assert.equal(
      /UNIQUE\s*\([^)]*external_message_id/i.test(sql) ||
        /uniqueIndex\([^)]*external_message/i.test(sql),
      false,
    );
    const live001e = read(
      join(repoRoot, 'packages/db/drizzle/0192_whatsapp_inbound_idempotency.sql'),
    );
    assert.ok(live001e.includes('comm_platform_inbox_company_kind_external_uidx'));
  });
});

describe('Gmail automatic update mechanism (LIVE-001B truth)', () => {
  it('normal operation is manual Sync Now — no Gmail users.watch / push scheduler', () => {
    const service = read(join(apiRoot, 'src/services/communications-platform.service.ts'));
    assert.ok(service.includes('async syncGmailMailbox'));
    assert.doesNotMatch(service, /users\.watch|gmail\.watch|pushNotification|historyId\s*=/);

    const orchestrator = read(join(apiRoot, 'src/services/integration-sync-orchestrator.service.ts'));
    assert.doesNotMatch(orchestrator, /business_gmail|syncGmailMailbox|comm_platform_gmail/);

    // No dedicated Gmail scheduler bin/module.
    assert.equal(existsSync(join(apiRoot, 'src/bin/gmail-sync.ts')), false);
    assert.equal(existsSync(join(apiRoot, 'src/services/gmail-watch.service.ts')), false);
  });

  it('UI copy states Gmail uses Sync Now (not continuous pull)', () => {
    const panel = read(
      join(repoRoot, 'apps/web/src/features/communications-hub/CommunicationsPlatformPanel.tsx'),
    );
    assert.match(panel, /Gmail uses Sync Now/i);
  });
});
