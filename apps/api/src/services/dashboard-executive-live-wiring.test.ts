import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Guards the Owner dashboard "no fake values" contract at the source level.
 * These fields were previously hardcoded or derived from a truncated preview list,
 * which silently understated real tenant figures.
 */
const dashboardSource = readFileSync(
  fileURLToPath(new URL('./dashboard-executive.service.ts', import.meta.url)),
  'utf8',
);
const intelligenceSource = readFileSync(
  fileURLToPath(new URL('./intelligence.service.ts', import.meta.url)),
  'utf8',
);

describe('executive dashboard live wiring', () => {
  it('does not hardcode the returning customer count', () => {
    assert.doesNotMatch(dashboardSource, /returning:\s*0\b/);
    assert.match(dashboardSource, /returning:\s*returningCustomerCount/);
  });

  it('derives completion document flags from real completion snapshots', () => {
    assert.doesNotMatch(dashboardSource, /docsRequired:\s*false/);
    assert.doesNotMatch(dashboardSource, /cocRequired:\s*false/);
    assert.match(dashboardSource, /jobCompletionSnapshots/);
  });

  it('takes open AR from a SQL aggregate rather than the capped preview list', () => {
    assert.doesNotMatch(
      dashboardSource,
      /outstandingCents:\s*intelligenceDashboard\.outstandingInvoices\.totalOutstandingCents/,
    );
    assert.doesNotMatch(
      dashboardSource,
      /invoiceCount:\s*intelligenceDashboard\.outstandingInvoices\.count/,
    );
    assert.match(dashboardSource, /loadOutstandingSnapshot/);
  });

  it('counts customer follow-ups in SQL rather than from the preview page', () => {
    assert.doesNotMatch(intelligenceSource, /count:\s*followUpRows\.length/);
    assert.match(intelligenceSource, /countFollowUpCustomers/);
  });
});
