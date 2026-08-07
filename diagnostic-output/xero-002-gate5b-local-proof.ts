import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '@titan/db';
import { loadEnv, resolveXeroOAuthConfig } from '../apps/api/src/config.ts';
import { XeroOAuthService } from '../apps/api/src/services/xero-oauth.service.ts';
import { XeroSyncService } from '../apps/api/src/services/xero-sync.service.ts';
import { XeroWriteApprovalGate } from '../apps/api/src/services/xero-write-approval-gate.service.ts';
import { XeroGate5bPaymentObservationService } from '../apps/api/src/services/xero-gate5b-payment-observation.service.ts';

async function main() {
  const selectionPath = path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    'diagnostic-output/xero-002-gate2-selection.json',
  );
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));

  if (!process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
    console.error(JSON.stringify({ ok: false, code: 'ENCRYPTION_KEY_MISSING' }));
    process.exit(3);
  }

  process.env.JWT_SECRET ||= 'gate5b-local-jwt-secret-32chars-min';
  process.env.JWT_REFRESH_SECRET ||= 'gate5b-local-refresh-secret-32chars-min';

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
  const service = new XeroGate5bPaymentObservationService(db, xeroOAuth, xeroSync);

  const result = await service.observePaymentState({
    companyId: selection.companyId,
    invoiceId: selection.selected.invoiceId,
    runTargetedRefresh: true,
  });

  console.log(JSON.stringify({ ok: true, result }));
  await closeDb();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: String(error?.message || error).slice(0, 200) }));
  process.exit(1);
});
