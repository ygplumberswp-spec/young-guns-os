#!/usr/bin/env node
/** Probe decrypt only — never prints tokens. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
const probeTs = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-decrypt-probe.ts');

const keys = [
  process.env.INTEGRATIONS_ENCRYPTION_KEY,
  process.env.GATE2_INTEGRATIONS_ENCRYPTION_KEY,
  'dev-integrations-encryption-key-32chars',
].filter(Boolean);

const r = spawnSync(tsx, [probeTs, ...keys], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production' },
});
process.stdout.write(r.stdout || '');
if (r.status !== 0) process.exit(r.status ?? 1);
