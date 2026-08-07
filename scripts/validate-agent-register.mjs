#!/usr/bin/env node
/**
 * AGENT-001B validation — deterministic register integrity checks.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPROVED_COMMIT = '363111f5df0f0ffa6e06e915320b4a88a0824aad';

const current = JSON.parse(readFileSync(join(ROOT, 'docs/.agent-register-data.json'), 'utf8'));
const approved = JSON.parse(
  execSync(`git show ${APPROVED_COMMIT}:docs/.agent-register-data.json`, { cwd: ROOT }).toString(),
);

const approvedIds = new Set(approved.agents.map((a) => a.id));
const currentIds = new Set(current.agents.map((a) => a.id));
const missing = [...approvedIds].filter((id) => !currentIds.has(id));

const deptSum = Object.values(current.departmentTotals).reduce((a, b) => a + b, 0);
const implSum = Object.values(current.implementationTotals).reduce((a, b) => a + b, 0);
const actSum = Object.values(current.activationTotals).reduce((a, b) => a + b, 0);

const dupes = current.agents.map((a) => a.id).filter((id, i, arr) => arr.indexOf(id) !== i);

const missingDual = current.agents.filter(
  (a) => !a.implementationStatus || !a.activationLifecycleStatus,
);

const docs = [
  'TITAN_MASTER_AGENT_REGISTER.md',
  'TITAN_AGENT_CAPABILITY_MATRIX.md',
  'TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md',
  'TITAN_AGENT_ACTIVATION_ROADMAP.md',
  'TITAN_INTEGRATION_REGISTER.md',
  'TITAN_MASTER_ACCEPTANCE_REGISTER.md',
  'TITAN_GAP_CLOSURE_PLAN.md',
  'TITAN_MASTER_COMPLETION_CHECKLIST.md',
  'TITAN_AGENT001_ROLE_RECONCILIATION.md',
];

const brokenLinks = [];
for (const f of docs) {
  const text = readFileSync(join(ROOT, 'docs', f), 'utf8');
  for (const m of text.matchAll(/\]\(\.\/([^)]+)\)/g)) {
    if (!readFileSync(join(ROOT, 'docs', m[1]), 'utf8') && false) {}
    try {
      readFileSync(join(ROOT, 'docs', m[1]));
    } catch {
      brokenLinks.push(`${f} -> ${m[1]}`);
    }
  }
}

const fbChecks = [];
for (const f of docs) {
  const t = readFileSync(join(ROOT, 'docs', f), 'utf8');
  if (t.includes('pending Owner deploy')) fbChecks.push(`${f}: pending Owner deploy`);
}

const results = {
  finalAgentCount: current.totalUniqueAgents,
  atLeast307: current.totalUniqueAgents >= 307,
  uniqueIds: dupes.length === 0,
  missingApprovedIds: missing,
  missingApprovedCount: missing.length,
  departmentCount: Object.keys(current.departmentTotals).length,
  departmentSumMatchesTotal: deptSum === current.totalUniqueAgents,
  implementationSumMatchesTotal: implSum === current.totalUniqueAgents,
  activationSumMatchesTotal: actSum === current.totalUniqueAgents,
  dualStatusComplete: missingDual.length === 0,
  implementationTotals: current.implementationTotals,
  activationTotals: current.activationTotals,
  departmentTotals: current.departmentTotals,
  brokenLinks: brokenLinks.length ? brokenLinks : 'NONE',
  facebookBadPhrases: fbChecks.length ? fbChecks : 'NONE',
  universalRule: readFileSync(join(ROOT, 'docs/TITAN_INTEGRATION_REGISTER.md'), 'utf8').includes(
    'INT-UNIVERSAL-001',
  ),
  xeroParked: readFileSync(join(ROOT, 'docs/TITAN_MASTER_ACCEPTANCE_REGISTER.md'), 'utf8').includes(
    'XERO-002',
  ),
};

let pass = true;
if (!results.atLeast307) pass = false;
if (results.missingApprovedCount > 0) pass = false;
if (!results.uniqueIds) pass = false;
if (!results.departmentSumMatchesTotal) pass = false;
if (!results.implementationSumMatchesTotal) pass = false;
if (!results.activationSumMatchesTotal) pass = false;
if (!results.dualStatusComplete) pass = false;
if (results.brokenLinks !== 'NONE') pass = false;
if (results.facebookBadPhrases !== 'NONE') pass = false;

console.log(JSON.stringify({ pass, ...results }, null, 2));
process.exit(pass ? 0 : 1);
