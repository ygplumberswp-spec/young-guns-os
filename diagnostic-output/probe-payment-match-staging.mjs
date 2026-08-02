#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const API = 'https://young-guns-os-staging.up.railway.app';

async function mintToken() {
  execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
  const scriptPath = path.join(repoRoot, '.tmp-mint-probe.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP}';
const [user] = await sql\`SELECT u.id, u.role_id, r.name as role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = \${companyId} AND u.is_active = true ORDER BY u.created_at ASC LIMIT 1\`;
const sessionId = crypto.randomUUID();
const refreshHash = hashRefreshToken(generateRefreshToken());
await sql\`INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address) VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, NOW() + interval '7 days', NOW(), 'probe', '127.0.0.1')\`;
const { token } = createAccessToken({ sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: user.permissions }, process.env.JWT_SECRET);
process.stdout.write(token);
await sql.end();`,
  );
  try {
    return execSync(`railway run -s young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

const token = await mintToken();
const scriptPath = path.join(repoRoot, '.tmp-probe-payment-match.mjs');
fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const YGP = '${YGP}';
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const mappings = await sql\`
  SELECT m.xero_invoice_id, i.invoice_number, i.amount_cents, i.amount_paid_cents, i.status
  FROM xero_invoice_mappings m
  JOIN invoices i ON i.id = m.invoice_id
  WHERE m.company_id = \${YGP}::uuid AND m.sync_status = 'synced'
  ORDER BY i.invoice_number\`;
const counts = await sql\`
  SELECT
    (SELECT count(*)::int FROM payments WHERE company_id=\${YGP}::uuid) AS payments,
    (SELECT count(*)::int FROM xero_payment_mappings WHERE company_id=\${YGP}::uuid) AS payment_mappings\`;
const anchors = await sql\`
  SELECT i.invoice_number, i.amount_cents, i.total_cents, i.amount_paid_cents, i.status,
    coalesce(p.allocated_cents,0)::int allocated, coalesce(p.payment_count,0)::int payment_count
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, sum(amount_cents)::int allocated_cents, count(*)::int payment_count
    FROM payments WHERE company_id=\${YGP}::uuid GROUP BY invoice_id
  ) p ON p.invoice_id = i.id
  WHERE i.company_id=\${YGP}::uuid AND i.invoice_number IN ('INV-0423','INV-0424')
  ORDER BY i.invoice_number\`;
process.stdout.write(JSON.stringify({ mappings, counts: counts[0], anchors }, null, 2));
await sql.end();`,
);

const db = JSON.parse(
  execSync(`railway run -s young-guns-os node ${scriptPath}`, { cwd: repoRoot, encoding: 'utf8' }).trim(),
);
fs.unlinkSync(scriptPath);

const xeroIds = new Set(db.mappings.map((m) => m.xero_invoice_id));

// Pull Xero payment sample via sync logs or integration status - use xero sync logs table
const logScript = path.join(repoRoot, '.tmp-probe-xero-logs.mjs');
fs.writeFileSync(
  logScript,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const logs = await sql\`
  SELECT action, status, message, created_at
  FROM xero_sync_logs
  WHERE company_id = '${YGP}'::uuid AND entity_type = 'payment'
  ORDER BY created_at DESC LIMIT 10\`;
process.stdout.write(JSON.stringify(logs, null, 2));
await sql.end();`,
);

let logs = [];
try {
  logs = JSON.parse(
    execSync(`railway run -s young-guns-os node ${logScript}`, { cwd: repoRoot, encoding: 'utf8' }).trim(),
  );
} catch {
  logs = [];
}
fs.unlinkSync(logScript);

console.log(
  JSON.stringify(
    {
      db,
      syncedInvoiceXeroIds: [...xeroIds],
      recentPaymentLogs: logs,
      note: '511 Xero payments likely reference invoices outside the 5 TITAN invoice rows on YGP staging',
    },
    null,
    2,
  ),
);
