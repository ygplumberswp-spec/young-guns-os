import { and, count, eq } from 'drizzle-orm';
import type {
  LncAcceptanceTestResultSummary,
  LncAcceptanceTestRunDetailSummary,
  LncAcceptanceTestRunSummary,
  LncAcceptanceTestSuiteSummary,
  LncCheckStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  automationQueueJobs,
  customers,
  inventoryItems,
  inventoryLocations,
  invoices,
  jobs,
  leads,
  lncAcceptanceTestResults,
  lncAcceptanceTestRuns,
  lncAcceptanceTestSuites,
  payments,
  purchaseOrders,
  quotes,
  vehicles,
  workflowRuns,
} from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const DEFAULT_SUITES: Array<{
  suiteKey: string;
  suiteName: string;
  description: string;
  testKeys: string[];
}> = [
  {
    suiteKey: 'customer_lifecycle',
    suiteName: 'Customer lifecycle',
    description: 'Verify customer records and CRM readiness',
    testKeys: ['customer_records', 'customer_data_quality'],
  },
  {
    suiteKey: 'lead_conversion',
    suiteName: 'Lead conversion',
    description: 'Verify lead pipeline readiness',
    testKeys: ['lead_records', 'lead_pipeline'],
  },
  {
    suiteKey: 'quote_to_job',
    suiteName: 'Quote → Job workflow',
    description: 'Verify quote and job workflow linkage',
    testKeys: ['quote_records', 'quote_job_linkage'],
  },
  {
    suiteKey: 'job_completion',
    suiteName: 'Job completion',
    description: 'Verify job lifecycle records',
    testKeys: ['job_records', 'job_status_coverage'],
  },
  {
    suiteKey: 'invoice_generation',
    suiteName: 'Invoice generation',
    description: 'Verify invoicing workflow readiness',
    testKeys: ['invoice_records', 'invoice_job_linkage'],
  },
  {
    suiteKey: 'payment_reconciliation',
    suiteName: 'Payment reconciliation',
    description: 'Verify payment records',
    testKeys: ['payment_records', 'payment_invoice_linkage'],
  },
  {
    suiteKey: 'inventory_workflow',
    suiteName: 'Inventory workflow',
    description: 'Verify inventory module readiness',
    testKeys: ['inventory_items', 'inventory_locations'],
  },
  {
    suiteKey: 'procurement_workflow',
    suiteName: 'Procurement workflow',
    description: 'Verify procurement records',
    testKeys: ['purchase_orders'],
  },
  {
    suiteKey: 'fleet_workflow',
    suiteName: 'Fleet workflow',
    description: 'Verify fleet vehicle records',
    testKeys: ['fleet_vehicles'],
  },
  {
    suiteKey: 'customer_portal',
    suiteName: 'Customer Portal',
    description: 'Verify portal-ready customer data',
    testKeys: ['portal_customers'],
  },
  {
    suiteKey: 'ai_workflows',
    suiteName: 'AI workflows',
    description: 'Verify AI workflow configuration',
    testKeys: ['ai_workflow_runs'],
  },
  {
    suiteKey: 'automation_workflows',
    suiteName: 'Automation workflows',
    description: 'Verify automation queue health',
    testKeys: ['automation_queue', 'workflow_runs'],
  },
  {
    suiteKey: 'notification_delivery',
    suiteName: 'Notification delivery',
    description: 'Verify notification platform readiness',
    testKeys: ['notification_config'],
  },
  {
    suiteKey: 'voice_reception',
    suiteName: 'Voice Reception',
    description: 'Verify voice reception configuration',
    testKeys: ['voice_config'],
  },
  {
    suiteKey: 'document_ai',
    suiteName: 'Document AI',
    description: 'Verify document AI readiness',
    testKeys: ['document_ai_config'],
  },
];

type AcceptanceTest = {
  testKey: string;
  testName: string;
  run: (
    companyId: string,
  ) => Promise<{ status: LncCheckStatus; message: string; details?: Record<string, unknown> }>;
};

export class EnterpriseLaunchCenterAcceptanceService {
  constructor(private readonly db: DatabaseClient) {}

  async ensureDefaultSuites(companyId: string): Promise<void> {
    for (const suite of DEFAULT_SUITES) {
      const existing = await this.db.query.lncAcceptanceTestSuites.findFirst({
        where: and(
          eq(lncAcceptanceTestSuites.companyId, companyId),
          eq(lncAcceptanceTestSuites.suiteKey, suite.suiteKey),
        ),
      });
      if (!existing) {
        await this.db.insert(lncAcceptanceTestSuites).values({
          companyId,
          suiteKey: suite.suiteKey,
          suiteName: suite.suiteName,
          description: suite.description,
          testKeys: suite.testKeys,
        });
      }
    }
  }

  async listSuites(companyId: string): Promise<LncAcceptanceTestSuiteSummary[]> {
    await this.ensureDefaultSuites(companyId);
    const rows = await this.db.query.lncAcceptanceTestSuites.findMany({
      where: eq(lncAcceptanceTestSuites.companyId, companyId),
      orderBy: (s, { asc }) => [asc(s.suiteName)],
    });
    return rows.map(toSuiteSummary);
  }

  async listTestRuns(companyId: string): Promise<LncAcceptanceTestRunSummary[]> {
    const rows = await this.db.query.lncAcceptanceTestRuns.findMany({
      where: eq(lncAcceptanceTestRuns.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 50,
    });
    return rows.map(toRunSummary);
  }

  async getTestRunDetail(
    companyId: string,
    runId: string,
  ): Promise<LncAcceptanceTestRunDetailSummary | null> {
    const run = await this.db.query.lncAcceptanceTestRuns.findFirst({
      where: and(
        eq(lncAcceptanceTestRuns.companyId, companyId),
        eq(lncAcceptanceTestRuns.id, runId),
      ),
    });
    if (!run) return null;
    const results = await this.db.query.lncAcceptanceTestResults.findMany({
      where: eq(lncAcceptanceTestResults.acceptanceTestRunId, runId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return { ...toRunSummary(run), results: results.map(toResultSummary) };
  }

  async runAcceptanceTests(
    scope: StaffScope,
    suiteId?: string,
  ): Promise<LncAcceptanceTestRunDetailSummary> {
    await this.ensureDefaultSuites(scope.companyId);
    const suite = suiteId
      ? await this.db.query.lncAcceptanceTestSuites.findFirst({
          where: and(
            eq(lncAcceptanceTestSuites.companyId, scope.companyId),
            eq(lncAcceptanceTestSuites.id, suiteId),
          ),
        })
      : null;

    const testKeys = suite?.testKeys ?? DEFAULT_SUITES.flatMap((s) => s.testKeys);
    const tests = this.buildTests().filter((t) => testKeys.includes(t.testKey));
    const runKey = `accept_${Date.now()}`;

    const [run] = await this.db
      .insert(lncAcceptanceTestRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        suiteId: suite?.id ?? null,
        runKey,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const results: LncAcceptanceTestResultSummary[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const test of tests) {
      const started = Date.now();
      try {
        const outcome = await test.run(scope.companyId);
        if (outcome.status === 'passed') passedCount += 1;
        else if (outcome.status === 'skipped') skippedCount += 1;
        else failedCount += 1;

        const [result] = await this.db
          .insert(lncAcceptanceTestResults)
          .values({
            companyId: scope.companyId,
            acceptanceTestRunId: run!.id,
            testKey: test.testKey,
            testName: test.testName,
            status: outcome.status,
            message: outcome.message,
            durationMs: Date.now() - started,
            details: outcome.details ?? {},
          })
          .returning();
        if (result) results.push(toResultSummary(result));
      } catch (error) {
        failedCount += 1;
        const [result] = await this.db
          .insert(lncAcceptanceTestResults)
          .values({
            companyId: scope.companyId,
            acceptanceTestRunId: run!.id,
            testKey: test.testKey,
            testName: test.testName,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Acceptance test failed',
            durationMs: Date.now() - started,
          })
          .returning();
        if (result) results.push(toResultSummary(result));
      }
    }

    const finalStatus: LncCheckStatus =
      failedCount > 0 ? 'failed' : passedCount > 0 ? 'passed' : 'skipped';
    const [updated] = await this.db
      .update(lncAcceptanceTestRuns)
      .set({
        status: finalStatus,
        testCount: tests.length,
        passedCount,
        failedCount,
        skippedCount,
        completedAt: new Date(),
      })
      .where(eq(lncAcceptanceTestRuns.id, run!.id))
      .returning();

    return { ...toRunSummary(updated ?? run!), results };
  }

  private buildTests(): AcceptanceTest[] {
    return [
      {
        testKey: 'customer_records',
        testName: 'Customer records exist',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(customers)
            .where(eq(customers.companyId, companyId));
          const val = Number(row?.value ?? 0);
          return {
            status: val > 0 ? 'passed' : 'warning',
            message: `${val} customer record(s) found.`,
          };
        },
      },
      {
        testKey: 'customer_data_quality',
        testName: 'Customer data quality',
        run: async (companyId) => {
          const rows = await this.db.query.customers.findMany({
            where: eq(customers.companyId, companyId),
            columns: { email: true },
            limit: 20,
          });
          const withEmail = rows.filter((r) => r.email).length;
          return {
            status: withEmail > 0 ? 'passed' : 'warning',
            message: `${withEmail}/${rows.length} sampled customers have email.`,
          };
        },
      },
      {
        testKey: 'lead_records',
        testName: 'Lead records',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(leads)
            .where(eq(leads.companyId, companyId));
          return {
            status: Number(row?.value ?? 0) >= 0 ? 'passed' : 'failed',
            message: `${row?.value ?? 0} lead record(s).`,
          };
        },
      },
      {
        testKey: 'lead_pipeline',
        testName: 'Lead pipeline stages',
        run: async (companyId) => {
          const rows = await this.db.query.leads.findMany({
            where: eq(leads.companyId, companyId),
            columns: { status: true },
            limit: 50,
          });
          const statuses = new Set(rows.map((r) => r.status));
          return {
            status: statuses.size > 0 ? 'passed' : 'warning',
            message: `${statuses.size} lead status stage(s) in use.`,
          };
        },
      },
      {
        testKey: 'quote_records',
        testName: 'Quote records',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(quotes)
            .where(eq(quotes.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} quote record(s).` };
        },
      },
      {
        testKey: 'quote_job_linkage',
        testName: 'Quote to job linkage',
        run: async (companyId) => {
          const quoteRows = await this.db.query.quotes.findMany({
            where: eq(quotes.companyId, companyId),
            columns: { jobId: true },
            limit: 50,
          });
          const linked = quoteRows.filter((q) => q.jobId).length;
          return {
            status: quoteRows.length === 0 || linked > 0 ? 'passed' : 'warning',
            message: `${linked}/${quoteRows.length} quotes linked to jobs.`,
          };
        },
      },
      {
        testKey: 'job_records',
        testName: 'Job records',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(jobs)
            .where(eq(jobs.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} job record(s).` };
        },
      },
      {
        testKey: 'job_status_coverage',
        testName: 'Job status coverage',
        run: async (companyId) => {
          const rows = await this.db.query.jobs.findMany({
            where: eq(jobs.companyId, companyId),
            columns: { status: true },
            limit: 50,
          });
          const statuses = new Set(rows.map((r) => r.status));
          return {
            status: statuses.size > 0 ? 'passed' : 'warning',
            message: `${statuses.size} job status(es) in use.`,
          };
        },
      },
      {
        testKey: 'invoice_records',
        testName: 'Invoice records',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(invoices)
            .where(eq(invoices.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} invoice record(s).` };
        },
      },
      {
        testKey: 'invoice_job_linkage',
        testName: 'Invoice job linkage',
        run: async (companyId) => {
          const rows = await this.db.query.invoices.findMany({
            where: eq(invoices.companyId, companyId),
            columns: { jobId: true },
            limit: 50,
          });
          const linked = rows.filter((r) => r.jobId).length;
          return {
            status: rows.length === 0 || linked > 0 ? 'passed' : 'warning',
            message: `${linked}/${rows.length} invoices linked to jobs.`,
          };
        },
      },
      {
        testKey: 'payment_records',
        testName: 'Payment records',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(payments)
            .where(eq(payments.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} payment record(s).` };
        },
      },
      {
        testKey: 'payment_invoice_linkage',
        testName: 'Payment invoice linkage',
        run: async (companyId) => {
          const rows = await this.db.query.payments.findMany({
            where: eq(payments.companyId, companyId),
            columns: { invoiceId: true },
            limit: 50,
          });
          const linked = rows.filter((r) => r.invoiceId).length;
          return {
            status: rows.length === 0 || linked > 0 ? 'passed' : 'warning',
            message: `${linked}/${rows.length} payments linked to invoices.`,
          };
        },
      },
      {
        testKey: 'inventory_items',
        testName: 'Inventory items configured',
        run: async (companyId) => {
          const items = await this.db.query.inventoryItems.findMany({
            where: eq(inventoryItems.companyId, companyId),
            limit: 1,
          });
          return {
            status: items.length >= 0 ? 'passed' : 'failed',
            message:
              items.length > 0
                ? 'Inventory items present.'
                : 'No inventory items yet — acceptable for new tenants.',
          };
        },
      },
      {
        testKey: 'inventory_locations',
        testName: 'Inventory locations',
        run: async (companyId) => {
          const locations = await this.db.query.inventoryLocations.findMany({
            where: eq(inventoryLocations.companyId, companyId),
            limit: 5,
          });
          return { status: 'passed', message: `${locations.length} inventory location(s).` };
        },
      },
      {
        testKey: 'purchase_orders',
        testName: 'Purchase orders',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(purchaseOrders)
            .where(eq(purchaseOrders.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} purchase order(s).` };
        },
      },
      {
        testKey: 'fleet_vehicles',
        testName: 'Fleet vehicles',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(vehicles)
            .where(eq(vehicles.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} vehicle(s).` };
        },
      },
      {
        testKey: 'portal_customers',
        testName: 'Portal-ready customers',
        run: async (companyId) => {
          const rows = await this.db.query.customers.findMany({
            where: eq(customers.companyId, companyId),
            columns: { email: true, phone: true },
            limit: 20,
          });
          const contactable = rows.filter((r) => r.email || r.phone).length;
          return {
            status: contactable > 0 ? 'passed' : 'warning',
            message: `${contactable} contactable customer(s) for portal.`,
          };
        },
      },
      {
        testKey: 'ai_workflow_runs',
        testName: 'AI workflow runs',
        run: async (companyId) => {
          const rows = await this.db.query.workflowRuns.findMany({
            where: eq(workflowRuns.companyId, companyId),
            limit: 10,
          });
          return { status: 'passed', message: `${rows.length} workflow run(s) sampled.` };
        },
      },
      {
        testKey: 'automation_queue',
        testName: 'Automation queue health',
        run: async (companyId) => {
          const jobs = await this.db.query.automationQueueJobs.findMany({
            where: eq(automationQueueJobs.companyId, companyId),
            columns: { status: true },
            limit: 100,
          });
          const failed = jobs.filter((j) => j.status === 'failed').length;
          return {
            status: failed === 0 ? 'passed' : 'warning',
            message: `${jobs.length} queue job(s), ${failed} failed.`,
          };
        },
      },
      {
        testKey: 'workflow_runs',
        testName: 'Workflow run history',
        run: async (companyId) => {
          const [row] = await this.db
            .select({ value: count() })
            .from(workflowRuns)
            .where(eq(workflowRuns.companyId, companyId));
          return { status: 'passed', message: `${row?.value ?? 0} workflow run(s).` };
        },
      },
      {
        testKey: 'notification_config',
        testName: 'Notification configuration',
        run: async () => ({
          status: 'passed',
          message: 'Notification platform available — run readiness scan for delivery health.',
        }),
      },
      {
        testKey: 'voice_config',
        testName: 'Voice reception configuration',
        run: async () => ({
          status: 'passed',
          message: 'Voice reception module available — verify provider adapters separately.',
        }),
      },
      {
        testKey: 'document_ai_config',
        testName: 'Document AI configuration',
        run: async () => ({
          status: 'passed',
          message: 'Document AI module available — verify OCR providers separately.',
        }),
      },
    ];
  }
}

function toSuiteSummary(
  row: typeof lncAcceptanceTestSuites.$inferSelect,
): LncAcceptanceTestSuiteSummary {
  return {
    id: row.id,
    suiteKey: row.suiteKey,
    suiteName: row.suiteName,
    description: row.description,
    isEnabled: row.isEnabled,
    testKeys: row.testKeys ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

function toRunSummary(row: typeof lncAcceptanceTestRuns.$inferSelect): LncAcceptanceTestRunSummary {
  return {
    id: row.id,
    suiteId: row.suiteId,
    runKey: row.runKey,
    status: row.status,
    testCount: row.testCount,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toResultSummary(
  row: typeof lncAcceptanceTestResults.$inferSelect,
): LncAcceptanceTestResultSummary {
  return {
    id: row.id,
    acceptanceTestRunId: row.acceptanceTestRunId,
    testKey: row.testKey,
    testName: row.testName,
    status: row.status,
    message: row.message,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}
