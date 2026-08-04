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

  it('settles every summary source so one failure cannot fail the whole endpoint', () => {
    // Each entry of the aggregation must go through settle(), which records the failure
    // against a section instead of rejecting the shared Promise.all.
    const aggregation = dashboardSource.slice(
      dashboardSource.indexOf('] = await Promise.all(['),
      dashboardSource.indexOf('const calendarEvents'),
    );
    assert.ok(aggregation.length > 0, 'aggregation block not found');
    const settled = aggregation.match(/settle\(/g)?.length ?? 0;
    assert.ok(settled >= 18, `expected every source to be settled, saw ${settled}`);
    assert.match(dashboardSource, /sections: buildSectionStatuses\(/);
  });

  it('binds timestamps as ISO text inside raw sql templates', () => {
    // postgres-js has no encoder for a Date inside a sql`` template; a raw Date there
    // throws ERR_INVALID_ARG_TYPE at runtime and 500s the whole summary.
    for (const source of [dashboardSource, intelligenceSource]) {
      assert.doesNotMatch(source, /\$\{(start|end|cutoff|now)\}::timestamptz/);
    }
  });

  it('uses a real completion timestamp in the operating timezone', () => {
    assert.doesNotMatch(dashboardSource, /completedAt:\s*job\.updatedAt\.toISOString\(\)/);
    assert.match(dashboardSource, /COMPANY_TIME_ZONE\s*=\s*'Africa\/Johannesburg'/);
    assert.match(dashboardSource, /max\(snap\.created_at\)/);
  });

  it('reports outstanding coverage instead of silently summing unusable records', () => {
    assert.match(dashboardSource, /excludedInvoiceCount/);
    assert.match(dashboardSource, /undatedInvoiceCount/);
  });
});
