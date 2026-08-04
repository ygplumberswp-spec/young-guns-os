import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(root, 'CustomerDuplicateMergePanel.tsx'), 'utf8');
const pageSource = readFileSync(
  join(root, '../../pages/crm/CustomerDuplicateMergePage.tsx'),
  'utf8',
);
const listSource = readFileSync(join(root, 'CustomerList.tsx'), 'utf8');
const apiSource = readFileSync(join(root, '../../lib/crm-api.ts'), 'utf8');

describe('customer duplicate merge web wiring', () => {
  it('Owner-only merge/dismiss controls; office may review', () => {
    assert.match(panelSource, /Only Company Owner can dismiss or execute a merge/);
    assert.match(panelSource, /isOwner/);
    assert.match(panelSource, /Not a duplicate/);
    assert.match(panelSource, /Keep left & merge/);
    assert.match(panelSource, /Keep right & merge/);
    assert.match(pageSource, /isOwnerUser/);
  });

  it('shows side-by-side comparison with links and conflicts', () => {
    assert.match(panelSource, /Side-by-side merge review/);
    assert.match(panelSource, /Conflicts requiring Owner confirmation/);
    assert.match(panelSource, /formatLinks/);
    assert.match(panelSource, /Active jobs \/ unpaid invoices/);
    assert.match(panelSource, /Selectively keep fields/);
  });

  it('wires CRM API client and list navigation to \/crm\/duplicates', () => {
    assert.match(apiSource, /\/crm\/customers\/duplicates/);
    assert.match(apiSource, /\/crm\/customers\/duplicates\/scan/);
    assert.match(apiSource, /\/crm\/customers\/duplicates\/preview/);
    assert.match(apiSource, /\/crm\/customers\/duplicates\/decide/);
    assert.match(listSource, /\/crm\/duplicates/);
    assert.doesNotMatch(listSource, /#duplicate-review/);
  });

  it('never auto-merges from the UI', () => {
    assert.match(panelSource, /never run automatically/);
    assert.doesNotMatch(panelSource, /autoMerge|auto-merge/);
  });
});
