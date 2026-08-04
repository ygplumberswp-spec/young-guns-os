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

  it('lists every open invoice rather than only the oldest and largest examples', () => {
    assert.doesNotMatch(dashboardSource, /oldestOverdue/);
    assert.doesNotMatch(dashboardSource, /largestOutstanding/);
    assert.match(dashboardSource, /invoices: invoiceRows/);
    assert.match(dashboardSource, /OUTSTANDING_INVOICE_ROW_LIMIT\s*=\s*\d{2,}/);
  });

  it('keeps open-AR totals on the aggregate query, not the listed rows', () => {
    const snapshot = dashboardSource.slice(
      dashboardSource.indexOf('private async loadOutstandingSnapshot'),
      dashboardSource.indexOf('private async countReturningCustomers'),
    );
    assert.ok(snapshot.length > 0, 'loadOutstandingSnapshot not found');
    // A total derived from invoiceRows would silently shrink once the list is capped.
    assert.doesNotMatch(snapshot, /outstandingCents:\s*invoiceRows/);
    assert.doesNotMatch(snapshot, /invoiceCount:\s*(invoiceRows|rows)\.length/);
    assert.match(snapshot, /outstandingCents:\s*Number\(totals\[0\]\?\.total/);
    assert.match(snapshot, /invoiceCount:\s*totals\[0\]\?\.count/);
    // Only the row list carries a limit; the aggregates must not.
    assert.equal(snapshot.match(/\.limit\(/g)?.length, 1);
  });

  it('splits open AR into ageing bands that add back up to the total', () => {
    const snapshot = dashboardSource.slice(
      dashboardSource.indexOf('private async loadOutstandingSnapshot'),
      dashboardSource.indexOf('private async countReturningCustomers'),
    );
    // Overdue / due-soon / current are each their own aggregate filter, so the summary
    // strip cannot drift from the headline total the way three separate queries would.
    assert.match(snapshot, /overdueTotal:[^\n]*filter \(where \$\{isOverdue\}\)/);
    assert.match(
      snapshot,
      /dueSoonTotal:[^\n]*filter \(where \$\{isDueToday\} or \$\{isDueSoon\}\)/,
    );
    // Undated balances are owed, so they belong to a band; they cannot be aged, so the
    // only honest home is current rather than overdue or due soon.
    assert.match(
      snapshot,
      /currentTotal:[^\n]*filter \(where \$\{isCurrent\} or \$\{invoices\.dueDate\} is null\)/,
    );
    assert.doesNotMatch(snapshot, /dueSoonCents:\s*Number\(totals\[0\]\?\.total\b/);
  });

  it('excludes settled invoices and keeps part-paid ones with a remaining balance', () => {
    const snapshot = dashboardSource.slice(
      dashboardSource.indexOf('private async loadOutstandingSnapshot'),
      dashboardSource.indexOf('private async countReturningCustomers'),
    );
    assert.match(
      dashboardSource,
      /OPEN_INVOICE_STATUSES\s*=\s*\['sent',\s*'partial',\s*'overdue'\]/,
    );
    assert.match(snapshot, /balance\D*\}\s*>\s*0/);
  });

  it('orders open invoices most overdue first, then by due date', () => {
    const snapshot = dashboardSource.slice(
      dashboardSource.indexOf('private async loadOutstandingSnapshot'),
      dashboardSource.indexOf('private async countReturningCustomers'),
    );
    assert.match(snapshot, /\.orderBy\(\s*sql`\$\{bucketRank\} asc`/);
    assert.match(snapshot, /due_date.*asc nulls last|dueDate\}\s*asc nulls last/s);
  });

  it('ages invoices against the operating day, so due-today is never reported overdue', () => {
    const snapshot = dashboardSource.slice(
      dashboardSource.indexOf('private async loadOutstandingSnapshot'),
      dashboardSource.indexOf('private async countReturningCustomers'),
    );
    assert.match(snapshot, /startOfLocalDay\(\)/);
    assert.doesNotMatch(snapshot, /lt\(invoices\.dueDate, new Date\(\)\)/);
  });
});
