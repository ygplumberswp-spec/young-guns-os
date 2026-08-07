/**
 * Local in-process rate-budget provider probe (staging DB only).
 * Used when staging API route is not yet deployed but secrets are available in env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '@titan/db';
import { loadEnv, resolveXeroOAuthConfig } from '../apps/api/src/config.ts';
import { XeroOAuthService } from '../apps/api/src/services/xero-oauth.service.ts';
import { XeroRateBudgetService } from '../apps/api/src/services/xero-rate-budget.service.ts';
import { XeroRateBudgetProviderProbeService } from '../apps/api/src/services/xero-rate-budget-provider-probe.service.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

async function main() {
  const stagingEnv = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const dbMatch = stagingEnv.match(/^DATABASE_URL=(.+)$/m);
  if (!dbMatch) throw new Error('DATABASE_URL missing from .env.staging.local');
  const dbUrl = dbMatch[1].trim().replace(/^["']|["']$/g, '');
  if (dbUrl.includes(FORBIDDEN) || !dbUrl.includes(STAGING_REF)) {
    throw new Error('Refusing — not staging cpkuwtaipjxeipvbssvn');
  }

  process.env.DATABASE_URL = dbUrl;
  process.env.APP_ENV = 'staging';
  process.env.TITAN_ENV = 'staging';
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET ||= 'local-probe-jwt-secret-32-characters-min';
  process.env.JWT_REFRESH_SECRET ||= 'local-probe-refresh-secret-32-chars-min';
  process.env.APP_URL = 'https://comfortable-determination-staging.up.railway.app';
  process.env.API_PUBLIC_URL = 'https://young-guns-os-staging.up.railway.app';
  process.env.PROVIDERS_ENABLED = 'true';
  process.env.XERO_SYNC_ENABLED = 'true';
  process.env.READY_REQUIRE_REDIS = 'false';

  if (!process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
    console.error(JSON.stringify({ ok: false, code: 'ENCRYPTION_KEY_MISSING' }));
    process.exit(3);
  }

  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const xeroOAuth = XeroOAuthService.create({
    db,
    encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
    appUrl: env.APP_URL,
    oauthConfig: resolveXeroOAuthConfig(env, env.API_PUBLIC_URL!),
  });
  const rateBudget = XeroRateBudgetService.create(db);
  xeroOAuth.setRateBudget(rateBudget);
  const probeService = new XeroRateBudgetProviderProbeService(xeroOAuth, rateBudget);

  const result = await probeService.probeProvider(YGP);
  console.log(JSON.stringify({ ok: true, result }));
  await closeDb();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: String(error?.message || error).slice(0, 300) }));
  process.exit(1);
});
