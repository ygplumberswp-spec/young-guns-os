/**
 * 220 — Owner dashboard executive-summary failure reproduction.
 *
 * Runs the REAL DashboardExecutiveService dependency graph against a throwaway LOCAL
 * postgres database so each sub-section of GET /api/v1/dashboard/executive-summary can be
 * exercised in isolation and the failing one identified by name.
 *
 * Local only. Refuses any non-localhost DATABASE_URL so it can never touch staging or
 * production. The Xero sync service is deliberately NOT wired — this probe must not
 * interact with the Xero repair track.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user@localhost:5432/titan_dash_probe \
 *     node diagnostic-office/220-owner-dashboard-summary-repro.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/220-owner-dashboard-summary-repro.json');

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)) {
  console.error('REFUSED: this probe only runs against a local database.');
  process.exit(2);
}

const { createDb } = await import('../packages/db/src/index.ts');
const db = createDb(DATABASE_URL);
const sqlClient = db.$client;

const { JobsService } = await import('../apps/api/src/services/jobs.service.ts');
const { SchedulingService } = await import('../apps/api/src/services/scheduling.service.ts');
const { FinanceService } = await import('../apps/api/src/services/finance.service.ts');
const { InventoryService } = await import('../apps/api/src/services/inventory.service.ts');
const { AutomationService } = await import('../apps/api/src/services/automation.service.ts');
const { GoogleMapsService } = await import('../apps/api/src/services/google-maps.service.ts');
const { IntelligenceService } = await import('../apps/api/src/services/intelligence.service.ts');
const { CompanyDayPlanService } = await import(
  '../apps/api/src/services/company-day-plan.service.ts'
);
const { CompanyBusinessRulesService } = await import(
  '../apps/api/src/services/company-business-rules.service.ts'
);
const { DashboardExecutiveService } = await import(
  '../apps/api/src/services/dashboard-executive.service.ts'
);

const googleMapsService = GoogleMapsService.create({
  db,
  encryptionKey: '0'.repeat(64),
});
const jobsService = new JobsService(db);
const schedulingService = new SchedulingService(db, googleMapsService);
const financeService = new FinanceService(db);
const inventoryService = new InventoryService(db);
const automationService = new AutomationService(db);
const businessRulesService = new CompanyBusinessRulesService(db);
const dayPlanService = new CompanyDayPlanService(db, businessRulesService);
const intelligenceService = new IntelligenceService({
  db,
  financeService,
  schedulingService,
  inventoryService,
  automationService,
});
const dashboardExecutiveService = new DashboardExecutiveService({
  db,
  jobsService,
  schedulingService,
  financeService,
  intelligenceService,
  dayPlanService,
});

const results = [];
function record(name, status, detail) {
  const line = { name, status, detail: String(detail ?? '').slice(0, 400) };
  results.push(line);
  console.log(`${status.padEnd(5)} ${name}${line.detail ? ` — ${line.detail}` : ''}`);
}

async function probe(name, fn) {
  try {
    const value = await fn();
    record(name, 'PASS', Array.isArray(value) ? `${value.length} rows` : typeof value);
    return value;
  } catch (error) {
    record(name, 'FAIL', `${error?.name}: ${error?.message}`);
    let cause = error?.cause;
    let depth = 0;
    while (cause && depth < 4) {
      record(
        `${name} · cause[${depth}]`,
        'FAIL',
        `${cause?.code ?? cause?.name}: ${cause?.message}${cause?.hint ? ` | hint: ${cause.hint}` : ''}`,
      );
      cause = cause?.cause;
      depth += 1;
    }
    return null;
  }
}

// Seed the minimum tenant rows the summary path reads.
const [company] = await sqlClient`
  insert into companies (name, slug)
  values ('Dashboard Probe Co', ${'probe-' + Date.now()})
  returning id
`;
const companyId = company.id;
record('seed company', 'PASS', companyId);

// Seed real data that exercises the aggregate + timezone paths.
const [customer] = await sqlClient`
  insert into customers (company_id, name) values (${companyId}, 'Probe Customer') returning id
`;
// 25 open invoices proves the total is not capped by the old 20-row preview.
for (let i = 0; i < 25; i += 1) {
  await sqlClient`
    insert into invoices (company_id, customer_id, invoice_number, title, status,
                          amount_cents, amount_paid_cents, due_date, issued_at)
    values (${companyId}, ${customer.id}, ${'INV-' + i}, 'Probe invoice', 'sent',
            10000, 0, ${new Date(Date.now() - (i + 1) * 86_400_000).toISOString()}, now())
  `;
}
// One unusable record (paid exceeds billed) must be excluded and reported as reduced coverage.
await sqlClient`
  insert into invoices (company_id, customer_id, invoice_number, title, status,
                        amount_cents, amount_paid_cents, due_date, issued_at)
  values (${companyId}, ${customer.id}, 'INV-BAD', 'Broken invoice', 'sent', 5000, 9000, now(), now())
`;
// One open invoice with no due date — counted in the total, excluded from ageing.
await sqlClient`
  insert into invoices (company_id, customer_id, invoice_number, title, status,
                        amount_cents, amount_paid_cents, due_date, issued_at)
  values (${companyId}, ${customer.id}, 'INV-NODATE', 'Undated invoice', 'sent', 7000, 0, null, now())
`;
// A job completed at 00:30 Cape Town today = 22:30 UTC yesterday. A UTC-based day
// boundary would wrongly drop this from "Completed Today".
const capeTownMidnightUtc = new Date();
capeTownMidnightUtc.setUTCHours(22, 30, 0, 0);
capeTownMidnightUtc.setUTCDate(capeTownMidnightUtc.getUTCDate() - 1);
await sqlClient`
  insert into jobs (company_id, customer_id, title, status, execution_phase_updated_at, updated_at)
  values (${companyId}, ${customer.id}, 'Early morning SAST job', 'completed',
          ${capeTownMidnightUtc.toISOString()}, ${capeTownMidnightUtc.toISOString()})
`;
record('seed data', 'PASS', '27 invoices, 1 early-SAST completed job');

console.log('\n--- individual summary dependencies ---');
await probe('jobsService.getStats', () => jobsService.getStats(companyId));
await probe('jobsService.listTodaysScheduledJobs', () =>
  jobsService.listTodaysScheduledJobs(companyId, 50),
);
await probe('financeService.getStats', () => financeService.getStats(companyId));
await probe('inventoryService.getStats', () => inventoryService.getStats(companyId));
await probe('automationService.getStats', () => automationService.getStats(companyId));
await probe('dayPlanService.getTodayPlan', () => dayPlanService.getTodayPlan(companyId));
await probe('schedulingService.getCalendar', () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return schedulingService.getCalendar(companyId, start, end);
});
await probe('intelligenceService.getDashboard', () => intelligenceService.getDashboard(companyId));

console.log('\n--- full endpoint ---');
const summary = await probe('DashboardExecutiveService.getExecutiveSummary', () =>
  dashboardExecutiveService.getExecutiveSummary(companyId),
);

if (summary) {
  record('summary.outstandingInvoices', 'PASS', JSON.stringify(summary.outstandingInvoices));
  record('summary.todayAtAGlance.customerActivity', 'PASS',
    JSON.stringify(summary.todayAtAGlance.customerActivity));
  record('summary.priorities.summaryLine', 'PASS', summary.priorities.summaryLine);
  record('summary.completedToday', 'PASS', `${summary.completedToday.length} rows`);

  const oi = summary.outstandingInvoices;
  // 25 dated + 1 undated = 26 usable; the paid>billed record must be excluded.
  record('AR counts all 26 open invoices (not capped at 20)',
    oi.invoiceCount === 26 ? 'PASS' : 'FAIL', `invoiceCount=${oi.invoiceCount}`);
  record('AR total is 25*10000 + 7000',
    oi.outstandingCents === 257000 ? 'PASS' : 'FAIL', `${oi.outstandingCents}`);
  record('AR excludes the unusable record',
    oi.excludedInvoiceCount === 1 ? 'PASS' : 'FAIL', `excluded=${oi.excludedInvoiceCount}`);
  record('AR reports the undated invoice',
    oi.undatedInvoiceCount === 1 ? 'PASS' : 'FAIL', `undated=${oi.undatedInvoiceCount}`);
  record('AR oldest overdue is the earliest due date',
    oi.oldestOverdue?.invoiceNumber === 'INV-24' ? 'PASS' : 'FAIL',
    `${oi.oldestOverdue?.invoiceNumber}`);
  record('outstanding section marked partial due to excluded record',
    summary.sections.outstandingInvoices.state === 'partial' ? 'PASS' : 'FAIL',
    `${summary.sections.outstandingInvoices.state} · ${summary.sections.outstandingInvoices.coverage}`);
  record('early-SAST job counted in Completed Today (Cape Town day)',
    summary.completedToday.length === 1 ? 'PASS' : 'FAIL',
    `${summary.completedToday.length} completed`);
  for (const [key, status] of Object.entries(summary.sections)) {
    record(`section:${key}`, status.state === 'live' ? 'PASS' : 'WARN', status.state);
  }
}

// Section isolation: break one provider and confirm the endpoint still answers, with only
// the dependent sections degraded.
console.log('\n--- isolation: finance provider forced to throw ---');
financeService.getStats = async () => {
  throw new Error('forced finance outage for isolation test');
};
intelligenceService.getDashboard = async () => {
  throw new Error('forced intelligence outage for isolation test');
};

// Separate tenant so the cached first result cannot mask the degraded read.
const [company2] = await sqlClient`
  insert into companies (name, slug)
  values ('Dashboard Probe Co 2', ${'probe2-' + Date.now()})
  returning id
`;
const degraded = await probe('getExecutiveSummary with 2 providers down', () =>
  dashboardExecutiveService.getExecutiveSummary(company2.id),
);
if (degraded) {
  for (const [key, status] of Object.entries(degraded.sections)) {
    record(`degraded:${key}`, 'PASS', `${status.state}${status.reason ? ` (${status.reason})` : ''}`);
  }
  record(
    'degraded: priorities still operational',
    degraded.priorities.summaryLine ? 'PASS' : 'FAIL',
    degraded.priorities.summaryLine,
  );
  record('degraded: activeJobs section', degraded.sections.activeJobs.state === 'live' ? 'PASS' : 'FAIL',
    degraded.sections.activeJobs.state);
} else {
  record('degraded: endpoint survived provider outage', 'FAIL', 'endpoint still threw');
}

await sqlClient`delete from companies where id = ${companyId}`;
await sqlClient`delete from companies where id = ${company2.id}`;
await sqlClient.end();

const failures = results.filter((r) => r.status === 'FAIL');
writeFileSync(
  outPath,
  JSON.stringify(
    { label: '220-owner-dashboard-summary-repro', ranAt: new Date().toISOString(), results },
    null,
    2,
  ),
);
console.log(`\n${failures.length} failure(s). Written to ${outPath}`);
process.exit(failures.length > 0 ? 1 : 0);
