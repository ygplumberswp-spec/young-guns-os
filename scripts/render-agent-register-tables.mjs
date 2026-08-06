#!/usr/bin/env node
/**
 * Renders agent register markdown tables from docs/.agent-register-data.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'docs/.agent-register-data.json'), 'utf8'));

const DEPT_LABELS = {
  AURA: 'Central Intelligence',
  EXEC: 'Executive & Professional',
  FIN: 'Finance & Accounting',
  QS: 'QS, Estimating & Commercial Intelligence',
  OPS: 'Operations & Field Service',
  CRM: 'Sales, CRM & Customer Experience',
  COM: 'Communications & Reception',
  MKT: 'Marketing, Trends & Strategy',
  CRE: 'Creative Production',
  VID: 'Video & Audio Production',
  HR: 'HR, Training & Administration',
  LEG: 'Legal, Safety, Risk & Compliance',
  SW: 'Software, IT & Product',
  DAT: 'Data & Analytics',
  INV: 'Inventory, Procurement & Assets',
  FLT: 'Fleet, Maps & Driver Safety',
  SaaS: 'SaaS, Partnerships & Expansion',
  AUD: 'Permanent Audit Department',
};

function renderTable(dept) {
  const rows = data.agents.filter((a) => a.dept === dept);
  const lines = [
    '| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |',
    '|----------|-------------------|----------------------|-------------------|------------------|',
  ];
  for (const a of rows) {
    const key = a.registryKey ?? '—';
    const evidence =
      a.registryKey != null
        ? `\`packages/shared/src/agents.ts\` → \`${a.registryKey}\``
        : 'No executable agent implementation';
    lines.push(`| ${a.id} | ${a.name} | **${a.status}** | ${key} | ${evidence} |`);
  }
  return lines.join('\n');
}

let md = '';
for (const dept of Object.keys(DEPT_LABELS)) {
  md += `\n### ${DEPT_LABELS[dept]} (${data.departmentTotals[dept]} agents)\n\n`;
  md += renderTable(dept);
  md += '\n';
}

writeFileSync(join(ROOT, 'docs/.agent-register-tables.md'), md);
console.log('Wrote docs/.agent-register-tables.md');
