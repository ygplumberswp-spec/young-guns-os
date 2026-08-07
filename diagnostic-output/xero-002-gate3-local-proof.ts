import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '@titan/db';
import { loadEnv, resolveXeroOAuthConfig } from '../apps/api/src/config.ts';
import { XeroOAuthService } from '../apps/api/src/services/xero-oauth.service.ts';
import { XeroSyncService } from '../apps/api/src/services/xero-sync.service.ts';
import { XeroWriteApprovalGate } from '../apps/api/src/services/xero-write-approval-gate.service.ts';
import { XeroGate3ControlledQuoteService } from '../apps/api/src/services/xero-gate3-controlled-quote.service.ts';

async function main() {
  const quoteId = process.env.GATE3_QUOTE_ID?.trim();
  if (!quoteId) {
    console.error(JSON.stringify({ ok: false, code: 'GATE3_QUOTE_ID_MISSING' }));
    process.exit(3);
  }

  if (!process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
    console.error(JSON.stringify({ ok: false, code: 'ENCRYPTION_KEY_MISSING' }));
    process.exit(3);
  }

  process.env.JWT_SECRET ||= 'gate3-local-jwt-secret-32chars-min';
  process.env.JWT_REFRESH_SECRET ||= 'gate3-local-refresh-secret-32chars-min';

  const env = loadEnv();
  const apiPublicUrl = env.API_PUBLIC_URL ?? 'https://young-guns-os-staging.up.railway.app';
  const db = createDb(env.DATABASE_URL);
  const xeroOAuth = XeroOAuthService.create({
    db,
    encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
    appUrl: env.APP_URL,
    oauthConfig: resolveXeroOAuthConfig(env, apiPublicUrl),
  });
  const writeGate = new XeroWriteApprovalGate(db);
  const xeroSync = XeroSyncService.create({
    db,
    encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
    xeroOAuthService: xeroOAuth,
    writeApprovalGate: writeGate,
  });
  const service = new XeroGate3ControlledQuoteService(db, xeroOAuth, xeroSync, writeGate);

  const companyId = '095aef76-fef5-4139-af37-a42f2d7e2faf';
  const actorUserId =
    process.env.GATE3_ACTOR_USER_ID ??
    (
      await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.companyId, companyId),
        columns: { id: true },
      })
    )?.id;

  if (!actorUserId) {
    console.error(JSON.stringify({ ok: false, code: 'ACTOR_USER_MISSING' }));
    process.exit(3);
  }

  const first = await service.pushApprovedDraftQuote({ companyId, quoteId, actorUserId });
  const retry = await service.pushApprovedDraftQuote({ companyId, quoteId, actorUserId });

  console.log(
    JSON.stringify({
      ok: true,
      first,
      retry,
      idempotentRetry: retry.push.idempotent && first.xero.xeroQuoteIdMasked === retry.xero.xeroQuoteIdMasked,
    }),
  );
  await closeDb();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: String(error?.message || error).slice(0, 200) }));
  process.exit(1);
});
