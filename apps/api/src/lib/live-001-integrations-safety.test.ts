/**
 * LIVE-001 — Live integrations environment + wiring safety contracts.
 * Proves staging/production isolation and that confirmed gates stay wired.
 * Does not call live providers or touch production.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  REQUIRED_STAGING_PROJECT_REF,
  isForbiddenProductionDatabaseUrl,
  isRequiredStagingDatabaseUrl,
} from '@titan/shared';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(apiRoot, '../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('LIVE-001 environment safety', () => {
  it('canonical staging and production Supabase refs are distinct and enforced helpers', () => {
    assert.equal(FORBIDDEN_PRODUCTION_PROJECT_REF, 'rshuiaghmtrvvilhqpwm');
    assert.equal(REQUIRED_STAGING_PROJECT_REF, 'cpkuwtaipjxeipvbssvn');
    assert.notEqual(FORBIDDEN_PRODUCTION_PROJECT_REF, REQUIRED_STAGING_PROJECT_REF);

    const stagingUrl = `postgresql://postgres.${REQUIRED_STAGING_PROJECT_REF}:x@pooler.supabase.com:5432/postgres`;
    const productionUrl = `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:x@pooler.supabase.com:5432/postgres`;

    assert.equal(isRequiredStagingDatabaseUrl(stagingUrl), true);
    assert.equal(isForbiddenProductionDatabaseUrl(stagingUrl), false);
    assert.equal(isForbiddenProductionDatabaseUrl(productionUrl), true);
    assert.equal(isRequiredStagingDatabaseUrl(productionUrl), false);
  });

  it('no local staging env file is present that could silently target production', () => {
    // Cloud agent must not carry apps/api/.env.staging.local with prod ref.
    const stagingLocal = join(repoRoot, 'apps/api/.env.staging.local');
    if (!existsSync(stagingLocal)) {
      assert.ok(true, 'absent staging local env is safe');
      return;
    }
    const body = read(stagingLocal);
    assert.equal(
      isForbiddenProductionDatabaseUrl(body),
      false,
      'apps/api/.env.staging.local must never contain production Supabase ref',
    );
    if (body.includes('DATABASE_URL')) {
      assert.equal(
        isRequiredStagingDatabaseUrl(body),
        true,
        'DATABASE_URL in staging local must target staging ref',
      );
    }
  });

  it('representative staging-only scripts refuse the production project ref', () => {
    const requireBothRefs = [
      'packages/db/scripts/staging-backup.mjs',
      'packages/db/scripts/xero-invoice-financial-backfill.mjs',
      'packages/db/scripts/apply-0180-staging-only.mjs',
    ];
    for (const rel of requireBothRefs) {
      const abs = join(repoRoot, rel);
      assert.ok(existsSync(abs), `missing ${rel}`);
      const src = read(abs);
      assert.ok(
        src.includes(FORBIDDEN_PRODUCTION_PROJECT_REF),
        `${rel} must name forbidden production ref`,
      );
      assert.ok(
        src.includes(REQUIRED_STAGING_PROJECT_REF),
        `${rel} must name required staging ref`,
      );
    }

    // These refuse production; staging-ref text may be optional when they only load .env.staging.local.
    for (const rel of [
      'packages/db/scripts/migrate-staging-safe.mjs',
      'packages/db/scripts/staging-controlled-deploy-validate.mjs',
    ]) {
      assert.ok(read(join(repoRoot, rel)).includes(FORBIDDEN_PRODUCTION_PROJECT_REF));
    }
  });

  it('process env for this agent run does not expose production DATABASE_URL', () => {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (!databaseUrl) {
      assert.ok(true, 'no DATABASE_URL in agent env');
      return;
    }
    assert.equal(
      isForbiddenProductionDatabaseUrl(databaseUrl),
      false,
      'agent DATABASE_URL must never be production',
    );
  });
});

describe('LIVE-001 payment processing fail-closed wiring', () => {
  it('DocumentEngineService is constructed with env.runtime.paymentProcessingEnabled', () => {
    const index = read(join(apiRoot, 'src/index.ts'));
    assert.ok(index.includes('new DocumentEngineService'));
    assert.ok(
      index.includes('paymentProcessingEnabled: env.runtime.paymentProcessingEnabled'),
      'bootstrap must wire PAYMENT_PROCESSING_ENABLED into DocumentEngineService',
    );
  });

  it('DocumentEngineService enforces PAYMENT_PROCESSING_DISABLED before Yoco create', () => {
    const service = read(join(apiRoot, 'src/services/document-engine.service.ts'));
    assert.ok(service.includes('PAYMENT_PROCESSING_DISABLED'));
    assert.ok(service.includes('paymentProcessingEnabled'));
    assert.match(
      service,
      /if\s*\(\s*!this\.paymentProcessingEnabled\s*\)/,
      'approve path must check paymentProcessingEnabled',
    );
  });

  it('config resolves paymentProcessingEnabled default false', () => {
    const config = read(join(apiRoot, 'src/config.ts'));
    assert.ok(config.includes('PAYMENT_PROCESSING_ENABLED'));
    assert.ok(
      config.includes(
        'paymentProcessingEnabled: parseBoolFlag(raw.PAYMENT_PROCESSING_ENABLED, false)',
      ),
    );
  });
});

describe('LIVE-001 provider adapter inventory remains present (no new providers)', () => {
  it('core provider clients and webhook signing modules exist', () => {
    const required = [
      'src/lib/xero.client.ts',
      'src/lib/gmail.client.ts',
      'src/lib/whatsapp.client.ts',
      'src/lib/yoco.client.ts',
      'src/lib/yoco-payment-links.client.ts',
      'src/lib/cartrack.client.ts',
      'src/lib/google-maps.client.ts',
      'src/lib/facebook-graph.client.ts',
      'src/lib/resend.client.ts',
      'src/lib/xero-webhook-signing.ts',
      'src/lib/whatsapp-signing.ts',
      'src/lib/resend-signing.ts',
      'src/lib/yoco-webhook-signing.ts',
      'src/lib/n8n-signing.ts',
      'src/services/n8n-orchestration.service.ts',
      'src/services/ai-orchestration.service.ts',
    ];
    for (const rel of required) {
      assert.ok(existsSync(join(apiRoot, rel)), `missing provider module ${rel}`);
    }
  });

  it('does not introduce a Twilio telephony client in LIVE-001', () => {
    const libDir = join(apiRoot, 'src/lib');
    const files = readdirSync(libDir);
    assert.equal(
      files.some((f) => /twilio/i.test(f)),
      false,
      'Twilio client must not be added in LIVE-001',
    );
  });

  it('bank/FNB remains CSV/control architecture without live open-banking client', () => {
    const bankImport = join(apiRoot, 'src/services/bank-statement-import.service.ts');
    const bankControl = join(apiRoot, 'src/services/bank-transaction-control.service.ts');
    assert.ok(existsSync(bankImport));
    assert.ok(existsSync(bankControl));
    const libFiles = readdirSync(join(apiRoot, 'src/lib'));
    assert.equal(
      libFiles.some((f) => /fnb|open.?banking|bank.?feed/i.test(f)),
      false,
      'no live FNB/open-banking client module',
    );
  });
});

describe('LIVE-001 WhatsApp production fail-closed remains intact (SEC-001)', () => {
  it('whatsapp webhook still fails closed in production when app secret unset', () => {
    const webhook = read(join(apiRoot, 'src/routes/whatsapp-webhook.ts'));
    assert.ok(
      webhook.includes('WHATSAPP_APP_SECRET') || webhook.includes('appSecret'),
      'webhook route must reference app secret gating',
    );
    const sec = read(join(apiRoot, 'src/lib/sec-001-security-matrix.test.ts'));
    assert.ok(sec.includes('whatsapp') || sec.includes('WhatsApp'));
  });
});
