/**
 * Fresh staging backup — never prints DATABASE_URL or secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const BACKUP_DIR = '/home/ubuntu/titan-staging-backups';

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv(envPath);
if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging') {
  console.error('NO-GO: APP_ENV/TITAN_ENV must be staging');
  process.exit(2);
}
if (!env.DATABASE_URL?.includes(STAGING_REF) || env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
  console.error('NO-GO: DATABASE_URL must target staging ref only');
  process.exit(2);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
try {
  fs.chmodSync(BACKUP_DIR, 0o700);
} catch {
  /* ignore */
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const backupPath = path.join(BACKUP_DIR, `titan-staging-${stamp}.dump`);

const dump = spawnSync('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', backupPath, env.DATABASE_URL], {
  encoding: 'utf8',
});
if (dump.status !== 0) {
  console.error(JSON.stringify({ status: 'backup_failed', exitCode: dump.status, stderr: dump.stderr?.slice(0, 500) }));
  process.exit(3);
}

fs.chmodSync(backupPath, 0o600);
const stat = fs.statSync(backupPath);
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(backupPath));
const sha256 = hash.digest('hex');

const list = spawnSync('pg_restore', ['--list', backupPath], { encoding: 'utf8' });
if (list.status !== 0) {
  console.error(JSON.stringify({ status: 'pg_restore_list_failed', exitCode: list.status }));
  process.exit(4);
}
const tocLines = list.stdout.trim().split('\n').filter(Boolean);

console.log(
  JSON.stringify(
    {
      status: 'backup_ok',
      path: backupPath,
      bytes: stat.size,
      sha256,
      pgRestoreListExitCode: list.status,
      tocLineCount: tocLines.length,
    },
    null,
    2,
  ),
);
