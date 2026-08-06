#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const header = readFileSync(join(ROOT, 'docs/.master-agent-register-header.md'), 'utf8');
const tables = readFileSync(join(ROOT, 'docs/.agent-register-tables.md'), 'utf8');
const footer = `
---

## AGENT-001 role-family reconciliation

The 191 AGENT-001 role-family headings map to this 307-agent permanent register. See [TITAN_AGENT001_ROLE_RECONCILIATION.md](./TITAN_AGENT001_ROLE_RECONCILIATION.md) for the full mapping appendix.

---

**Maintenance:** Regenerate via \`node scripts/generate-master-agent-register.mjs\` → \`node scripts/render-agent-register-tables.mjs\` → \`node scripts/assemble-master-agent-register.mjs\` → \`node scripts/reconcile-agent001-roles.mjs\`.

**Document control:** AGENT-001B · Approved minimum **307** unique agents · Extensible beyond 307 · Recovered from \`363111f\`.
`;
writeFileSync(join(ROOT, 'docs/TITAN_MASTER_AGENT_REGISTER.md'), header + tables + footer);
console.log('Wrote docs/TITAN_MASTER_AGENT_REGISTER.md');
