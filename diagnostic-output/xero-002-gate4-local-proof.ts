import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '@titan/db';
import { loadEnv, resolveXeroOAuthConfig } from '../apps/api/src/config.ts';
import { XeroOAuthService } from '../apps/api/src/services/xero-oauth.service.ts';
import { XeroSyncService } from '../apps/api/src/services/xero-sync.service.ts';
import { XeroWriteApprovalGate } from '../apps/api/src/services/xero-write-approval-gate.service.ts';
import { XeroGate4ControlledInvoiceService } from '../apps/api/src/services/xero-gate4-controlled-invoice.service.ts';

async function main() {
  const invoiceId = process.env.GATE4_INVOICE_ID?.trim();
  if (!invoiceId) {
    console.error(JSON.stringify({ ok: false, code: 'GATE4_INVOICE_ID_MISSING' }));
    process.exit(3);
  }

  if (!process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
    console.error(JSON.stringify({ ok: false, code: 'ENCRYPTION_KEY_MISSING' }));
    process.exit(3);
  }

  process.env.JWT_SECRET ||= 'gate4-local-jwt-secret-32chars-min';
  process.env.JWT_REFRESH_SECRET ||= 'gate4-local-refresh-secret-32chars-min';

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
  const service = new XeroGate4ControlledInvoiceService(db, xeroOAuth, xeroSync, writeGate);

  const companyId = '095aef76-fef5-4139-af37-a42f2d7e2faf';
  const actorUserId =
    process.env.GATE4_ACTOR_USER_ID ??
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

  const first = await service.pushApprovedDraftInvoice({
    companyId,
    invoiceId,
    actorUserId,
    runTargetedRefresh: true,
  });
  const retry = await service.pushApprovedDraftInvoice({
    companyId,
    invoiceId,
    actorUserId,
    runTargetedRefresh: false,
  });

  console.log(
    JSON.stringify({
      ok: true,
      first,
      retry,
      idempotentRetry:
        retry.push.idempotent &&
        first.xero.xeroInvoiceIdMasked === retry.xero.xeroInvoiceIdMasked &&
        first.xero.xeroInvoiceNumber === retry.xero.xeroInvoiceNumber,
    }),
  );
  await closeDb();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: String(error?.message || error).slice(0, 200) }));
  process.exit(1);
});
