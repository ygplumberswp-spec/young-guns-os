#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const header = readFileSync(join(ROOT, 'docs/.master-agent-register-header.md'), 'utf8');
const tables = readFileSync(join(ROOT, 'docs/.agent-register-tables.md'), 'utf8');
const footer =
  '\n---\n\n**Maintenance:** Regenerate via `node scripts/generate-master-agent-register.mjs` then `node scripts/render-agent-register-tables.mjs` then `node scripts/assemble-master-agent-register.mjs`.\n';
writeFileSync(join(ROOT, 'docs/TITAN_MASTER_AGENT_REGISTER.md'), header + tables + footer);
console.log('Wrote docs/TITAN_MASTER_AGENT_REGISTER.md');
