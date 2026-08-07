/** Invoked via: railway run node diagnostic-output/218-cartrack-sync-runner.mjs <companyId> */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const companyId = process.argv[2];
if (!companyId) {
  console.error('companyId required');
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING = 'cpkuwtaipjxeipvbssvn';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes(STAGING) || dbUrl.includes(FORBIDDEN)) {
  console.error('Refusing non-staging DATABASE_URL');
  process.exit(2);
}

const { createDb } = await import(path.join(repoRoot, 'packages/db/dist/index.js'));
const { IntegrationsService } = await import(
  path.join(repoRoot, 'apps/api/dist/services/integrations.service.js')
);

const encryptionKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error('INTEGRATIONS_ENCRYPTION_KEY missing');
  process.exit(2);
}

const db = createDb(dbUrl);
const service = IntegrationsService.create({ db, encryptionKey });
const result = await service.syncCartrack(companyId);
console.log(JSON.stringify({ ok: true, result }));
