import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decryptXeroCredentials, isXeroOAuthCredentials } from '../apps/api/src/lib/crypto.ts';

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const requireDb = createRequire(path.join(repoRoot, 'packages/db/package.json'));
  const postgres = requireDb('postgres');
  const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';

  const envRaw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const url = envRaw.match(/^DATABASE_URL=(.+)$/m)![1].trim().replace(/^["']|["']$/g, '');
  const keys = process.argv.slice(2);

  const sql = postgres(url, { max: 1, prepare: false });
  const [row] = await sql`
    SELECT credentials_encrypted FROM integration_connections
    WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;
  await sql.end({ timeout: 5 });

  for (const key of keys) {
    try {
      const cred = decryptXeroCredentials(row.credentials_encrypted, key);
      if (isXeroOAuthCredentials(cred)) {
        console.log(JSON.stringify({ decryptOk: true, keyPrefix: key.slice(0, 6), expiresAt: cred.expiresAt }));
        process.exit(0);
      }
    } catch {
      /* try next */
    }
  }
  console.log(JSON.stringify({ decryptOk: false }));
  process.exit(1);
}

main().catch((error) => {
  console.error(String(error?.message || error).slice(0, 200));
  process.exit(2);
});
