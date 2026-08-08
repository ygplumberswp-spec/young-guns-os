/** Thin launcher — canonical script under packages/db/scripts. */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'packages/db/scripts/row105-multi-job-supplier-invoice-allocation-verify.mjs');
const r = spawnSync(process.execPath, [script], {
  cwd: join(root, 'packages/db'),
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
