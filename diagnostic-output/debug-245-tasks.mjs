#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const API = 'https://young-guns-os-staging.up.railway.app';
const scriptPath = path.join(repoRoot, '.tmp-test-245.mjs');

fs.writeFileSync(
  scriptPath,
  `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), 'test', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ token }));
await sql.end();
`,
);

execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const { token } = JSON.parse(raw);

for (const route of [
  '/api/v1/corporate-departments/tasks/generate',
  '/api/v1/corporate-departments/finance_accounting/tasks',
  '/api/v1/corporate-departments/finance_accounting',
]) {
  const res = await fetch(`${API}${route}`, {
    method: route.includes('generate') ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  console.log('\n===', route, res.status, '===');
  console.log(text.slice(0, 800));
}

fs.rmSync(scriptPath, { force: true });
