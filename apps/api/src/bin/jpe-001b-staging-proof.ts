/**
 * JPE-001B — manual source calculation vs TITAN on staging. STAGING ONLY.
 * Usage: node --import tsx src/bin/jpe-001b-staging-proof.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import {
  companyFinanceSettings,
  createDb,
  invoices,
  jobDirectCostEntries,
  jobMaterialLines,
  jobProfitabilityAdjustments,
  jobProfitabilitySnapshots,
  jobs,
  mobileTimeEntries,
  payments,
  purchaseOrders,
  quotes,
} from '@titan/db';
import {
  canAccessJobProfitability,
  canManageJobProfitabilityAdjustments,
  canViewJobProfitabilityMargin,
} from '@titan/shared';
import { JobProfitabilityService } from '../services/job-profitability.service.js';

const STAGING = 'cpkuwtaipjxeipvbssvn';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const YG = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function loadEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const env = loadEnv(path.resolve(repoRoot, 'apps/api/.env.staging.local'));
if (!env.DATABASE_URL?.includes(STAGING) || env.DATABASE_URL.includes(FORBIDDEN)) {
  console.error('BLOCKED: staging guard');
  process.exit(2);
}

const db = createDb(env.DATABASE_URL);
const service = new JobProfitabilityService(db);

const out: Record<string, unknown> = {
  label: 'jpe-001b-manual-vs-titan',
  generatedAt: new Date().toISOString(),
  stagingRef: STAGING,
  companyId: YG,
};

try {
  const jobRows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      title: jobs.title,
      status: jobs.status,
    })
    .from(jobs)
    .where(eq(jobs.companyId, YG))
    .limit(5);

  out.availableJobs = jobRows;
  const proofJob = jobRows[0];
  if (!proofJob) throw new Error('No Young Guns jobs on staging');
  const jobId = proofJob.id;

  out.selectedProofJob = {
    id: jobId,
    jobNumber: proofJob.jobNumber,
    title: proofJob.title,
    status: proofJob.status,
    reason:
      'Only Young Guns Plumbing job on staging. Staging has 589 company invoices and 512 payments but zero job_id linkages on quotes/invoices; no material lines, time entries, or POs tenant-wide.',
  };

  const [
    invoiceRows,
    quoteRows,
    materialRows,
    timeRows,
    directRows,
    adjustmentRows,
    paymentRows,
    settingsRow,
  ] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.companyId, YG), eq(invoices.jobId, jobId))),
    db.query.quotes.findMany({
      where: and(eq(quotes.companyId, YG), eq(quotes.jobId, jobId)),
      with: { lineItems: true },
    }),
    db
      .select()
      .from(jobMaterialLines)
      .where(and(eq(jobMaterialLines.companyId, YG), eq(jobMaterialLines.jobId, jobId))),
    db
      .select()
      .from(mobileTimeEntries)
      .where(and(eq(mobileTimeEntries.companyId, YG), eq(mobileTimeEntries.jobId, jobId))),
    db
      .select()
      .from(jobDirectCostEntries)
      .where(and(eq(jobDirectCostEntries.companyId, YG), eq(jobDirectCostEntries.jobId, jobId))),
    db
      .select()
      .from(jobProfitabilityAdjustments)
      .where(and(eq(jobProfitabilityAdjustments.companyId, YG), eq(jobProfitabilityAdjustments.jobId, jobId))),
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.companyId, YG),
          sql`exists (select 1 from invoices where invoices.id = ${payments.invoiceId} and invoices.job_id = ${jobId})`,
        ),
      ),
    db.select().from(companyFinanceSettings).where(eq(companyFinanceSettings.companyId, YG)).limit(1),
  ]);

  const poRows = await db.query.purchaseOrders.findMany({
    where: and(eq(purchaseOrders.companyId, YG), eq(purchaseOrders.jobId, jobId)),
    with: { items: true },
  });

  out.sources = {
    invoices: invoiceRows.length,
    quotes: quoteRows.length,
    materials: materialRows.length,
    timeEntries: timeRows.length,
    purchaseOrders: poRows.length,
    directCosts: directRows.length,
    adjustments: adjustmentRows.length,
    payments: paymentRows.length,
  };

  const labourRate = settingsRow[0]?.defaultInternalLabourRateCentsPerHour ?? 8000;

  let baseRevenue = 0;
  let revenueSource = 'none';
  const invTotal = invoiceRows.reduce((s, i) => s + (i.totalCents ?? 0), 0);
  if (invoiceRows.length > 0 && invTotal > 0) {
    baseRevenue = invTotal;
    revenueSource = 'invoice';
  } else {
    const accepted = quoteRows.filter((q) => ['accepted', 'approved', 'sent'].includes(q.status));
    const qTotal = accepted.reduce((s, q) => s + (q.totalCents ?? 0), 0);
    if (accepted.length > 0 && qTotal > 0) {
      baseRevenue = qTotal;
      revenueSource = 'approved_quote';
    }
  }
  const revAdj = adjustmentRows.filter((a) => a.kind === 'revenue').reduce((s, a) => s + a.amountCents, 0);
  const manualRevenue = baseRevenue + revAdj;

  let manualMaterials = 0;
  for (const m of materialRows) {
    const qty = Number(m.quantity ?? 0);
    const unit = m.unitCostCents ?? 0;
    if (m.status === 'returned') manualMaterials -= Math.round(qty * unit);
    else manualMaterials += Math.round(qty * unit);
  }
  manualMaterials += adjustmentRows
    .filter((a) => a.kind === 'material_cost')
    .reduce((s, a) => s + a.amountCents, 0);

  let manualLabour = 0;
  for (const t of timeRows) {
    const mins = t.durationMinutes ?? 0;
    const meta = t.metadata as { overtimeMultiplier?: number } | null;
    const ot = typeof meta?.overtimeMultiplier === 'number' ? meta.overtimeMultiplier : 1;
    manualLabour += Math.round((mins / 60) * labourRate * ot);
  }
  manualLabour += adjustmentRows
    .filter((a) => a.kind === 'labour_cost')
    .reduce((s, a) => s + a.amountCents, 0);

  let manualOther = 0;
  for (const d of directRows) {
    if (d.sourceType === 'purchase_order' || d.sourceType === 'material_line') continue;
    manualOther += d.amountCents;
  }
  manualOther += adjustmentRows
    .filter((a) => a.kind === 'other_direct_cost')
    .reduce((s, a) => s + a.amountCents, 0);

  const manualTotalCost = manualMaterials + manualLabour + manualOther;
  const manualGrossProfit = manualRevenue - manualTotalCost;
  const manualMargin =
    manualRevenue > 0 ? Math.round((manualGrossProfit / manualRevenue) * 10_000) / 100 : null;
  const manualCashCollected = paymentRows.reduce((s, p) => s + p.amountCents, 0);
  const manualCashSpent = directRows.filter((d) => d.isPaid).reduce((s, d) => s + d.amountCents, 0);
  const manualRealisedCash = manualCashCollected - manualCashSpent;

  out.manual = {
    revenueSource,
    revenueCents: manualRevenue,
    materialCents: manualMaterials,
    labourCents: manualLabour,
    otherCents: manualOther,
    totalCostCents: manualTotalCost,
    grossProfitCents: manualGrossProfit,
    grossMarginPct: manualMargin,
    cashCollectedCents: manualCashCollected,
    cashSpentCents: manualCashSpent,
    realisedCashProfitCents: manualRealisedCash,
  };

  const titan = await service.getJobProfitability(YG, jobId, { includeSensitiveCosts: true });
  out.titan = {
    revenueCents: titan.summary.jobRevenueCents,
    materialCents: titan.summary.materialCostCents,
    labourCents: titan.summary.labourCostCents,
    otherCents: titan.summary.otherDirectCostCents,
    totalCostCents: titan.summary.totalDirectCostCents,
    grossProfitCents: titan.summary.grossProfitCents,
    grossMarginPct: titan.summary.grossMarginPct,
    cashCollectedCents: titan.cash.cashCollectedCents,
    cashSpentCents: titan.cash.cashSpentCents,
    realisedCashProfitCents: titan.cash.realisedCashProfitCents,
    completeness: titan.completeness,
    completenessWarnings: titan.completenessWarnings,
    revenueSource: titan.summary.revenueSource,
    isLiveCalculation: titan.snapshot.isLiveCalculation,
    calculationVersion: titan.snapshot.calculationVersion,
  };

  out.comparison = {
    revenue: manualRevenue === titan.summary.jobRevenueCents,
    materials: manualMaterials === titan.summary.materialCostCents,
    labour: manualLabour === titan.summary.labourCostCents,
    other: manualOther === titan.summary.otherDirectCostCents,
    totalCost: manualTotalCost === titan.summary.totalDirectCostCents,
    grossProfit: manualGrossProfit === titan.summary.grossProfitCents,
    margin: manualMargin === titan.summary.grossMarginPct,
    cashCollected: manualCashCollected === titan.cash.cashCollectedCents,
    cashSpent: manualCashSpent === titan.cash.cashSpentCents,
    realisedCash: manualRealisedCash === titan.cash.realisedCashProfitCents,
  };

  out.explainabilityTree = {
    revenue: titan.explainability.revenue,
    cash: titan.explainability.cash,
    costTransactions: titan.costTransactions,
  };
  out.expectedVsActual = { expected: titan.expected, variance: titan.variance, leakage: titan.leakage };

  out.rbac = {
    ownerFinance: canAccessJobProfitability({ permissions: ['finance:read'] }),
    technicianDenied: !canAccessJobProfitability({ permissions: ['jobs:read'] }),
    marginOwner: canViewJobProfitabilityMargin(['finance:read'], 'Company Owner'),
    marginTechHidden: !canViewJobProfitabilityMargin(['jobs:read'], 'Technician'),
    adjustmentsOwner: canManageJobProfitabilityAdjustments({
      permissions: ['finance:write'],
      roleName: 'Company Owner',
    }),
  };

  const snapRows = await db
    .select()
    .from(jobProfitabilitySnapshots)
    .where(and(eq(jobProfitabilitySnapshots.companyId, YG), eq(jobProfitabilitySnapshots.jobId, jobId)))
    .limit(1);
  out.snapshotPersisted = snapRows.length > 0;

  const allJobRows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.companyId, YG));
  const completenessMap: Record<string, number> = {};
  for (const j of allJobRows) {
    const r = await service.getJobProfitability(YG, j.id, { includeSensitiveCosts: true });
    completenessMap[r.completeness] = (completenessMap[r.completeness] ?? 0) + 1;
  }
  out.completenessDistribution = completenessMap;
  out.allMatch = Object.values(out.comparison as Record<string, boolean>).every(Boolean);
} catch (e) {
  out.error = e instanceof Error ? e.message : String(e);
} finally {
  await db.$client.end({ timeout: 5 });
}

const outPath = path.resolve(repoRoot, 'diagnostic-output/jpe-001b-manual-vs-titan.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.error) process.exit(1);
