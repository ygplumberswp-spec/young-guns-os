#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const scriptPath = path.join(repoRoot, '.tmp-probe-invoice-mappings.mjs');

fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const rows = await sql\`
  SELECT m.sync_status, m.xero_invoice_id, m.last_error, i.invoice_number, i.status
  FROM xero_invoice_mappings m
  JOIN invoices i ON i.id = m.invoice_id
  WHERE m.company_id = \${'${YGP}'}::uuid
  ORDER BY i.invoice_number
\`;
process.stdout.write(JSON.stringify(rows, null, 2));
await sql.end();
`,
);

try {
  console.log(
    execSync(`railway run --service young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
  );
} finally {
  fs.rmSync(scriptPath, { force: true });
}
