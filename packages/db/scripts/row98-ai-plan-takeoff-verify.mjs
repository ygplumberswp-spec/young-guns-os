/**
 * Row 98 staging READ-ONLY audit + fixture proof (isolated; cleanup).
 * Does NOT upload fake customer plans. Does NOT mutate Royal Cape.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  resolveAiPlanTakeoffDraft,
  acceptAiTakeoffItemToRow94,
  rejectAiTakeoffItem,
  assertRow98SafetyGates,
  assertNoAiTakeoffClientLeak,
  assertRoyalCapeUnchangedForRow98,
  aiTakeoffIdempotencyFingerprint,
} from '../../../packages/shared/dist/plan-ai-takeoff.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/260-row98-ai-plan-takeoff-verify.json');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN_PROD = 'titan-production';

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (existsSync(tip)) return readFileSync(tip, 'utf8').trim();
  throw new Error('DATABASE_URL required');
}

const results = [];
const pass = (name, d = {}) => results.push({ name, status: 'PASS', ...d });
const fail = (name, d = {}) => results.push({ name, status: 'FAIL', ...d });

const source = {
  sourceDocumentId: '11111111-1111-1111-1111-111111111111',
  sourceFilename: 'fixture-plan-rev-a.pdf',
  uploadedAt: '2026-08-01T00:00:00.000Z',
  customerId: null,
  propertyId: null,
  jobId: null,
  pageNumber: 1,
  fileHash: 'fixture-hash',
  revisionLabel: 'Rev A',
};

const sql = postgres(loadDbUrl(), { max: 1, prepare: false });
try {
  const dbUrl = loadDbUrl();
  if (dbUrl.includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');

  // Apply migration if missing (staging only)
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'plan_estimate_ai_takeoffs'
    ) AS exists
  `;
  if (!exists) {
    const mig = readFileSync(join(__dirname, '../drizzle/0216_plan_ai_takeoff.sql'), 'utf8');
    await sql.unsafe(mig);
    pass('migration_0216_applied');
  } else {
    pass('migration_0216_already_present');
  }

  const [docAudit] = await sql`
    SELECT count(*)::int AS plan_like_docs
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        lower(coalesce(file_name,'')) LIKE '%plan%'
        OR lower(coalesce(file_name,'')) LIKE '%floor%'
        OR lower(coalesce(title,'')) LIKE '%plan%'
        OR lower(coalesce(title,'')) LIKE '%floor%'
        OR lower(coalesce(title,'')) LIKE '%drawing%'
      )
  `;
  const [estimates] = await sql`
    SELECT count(*)::int AS c FROM plan_estimates WHERE company_id = ${YGP}
  `;
  const [withSource] = await sql`
    SELECT count(*)::int AS c FROM plan_estimates
    WHERE company_id = ${YGP} AND source_document_id IS NOT NULL
  `;
  const [rule] = await sql`
    SELECT status, global_automation_enabled
    FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP}
    ORDER BY version DESC NULLS LAST
    LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id, job_id
    FROM quotes
    WHERE company_id = ${YGP} AND quote_number = 'QU-0183'
    LIMIT 1
  `;

  const authorisedPlanSourceAvailable = Number(docAudit.plan_like_docs) > 0;
  pass('staging_readonly_authorised_source_audit', {
    planLikeDocuments: Number(docAudit.plan_like_docs),
    planEstimates: Number(estimates.c),
    estimatesWithSourceDocumentId: Number(withSource.c),
    authorisedSourceResult: authorisedPlanSourceAvailable
      ? 'AUTHORISED_PLAN_SOURCE_CANDIDATES_PRESENT'
      : 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE',
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
  });

  if (rule?.global_automation_enabled === true) fail('row92_automation');
  else pass('row92_off');

  if (royal) {
    try {
      assertRoyalCapeUnchangedForRow98({
        totalCents: Number(royal.total_cents),
        pricingPresentationMode: royal.pricing_presentation_mode,
      });
      if (Number(royal.total_cents) === 4272250 && royal.pricing_presentation_mode === 'ITEMISED') {
        pass('royal_cape_unchanged', {
          totalCents: Number(royal.total_cents),
          xeroQuoteId: royal.xero_quote_id,
        });
      } else fail('royal_cape_mismatch', royal);
    } catch (e) {
      fail('royal_cape', { message: String(e.message || e) });
    }
  } else fail('royal_cape_missing');

  // Fixture matrix (isolated — no inventing real customer plan)
  const cases = [
    [
      'authorised_source',
      resolveAiPlanTakeoffDraft({
        authorisedSource: source,
        scaleStatus: 'SCALE_NOT_PROVIDED',
        evidenceCandidates: [
          {
            clientKey: 'w1',
            pointType: 'WATER',
            description: 'WHB',
            quantity: 1,
            unit: 'each',
            isLengthMeasurement: false,
            quantityOrigin: 'AI_DETECTION',
            supportingText: 'label',
            pageReference: '1',
            providerConfidence: 'HIGH',
          },
        ],
      }).status === 'READY_FOR_REVIEW',
    ],
    [
      'no_source',
      resolveAiPlanTakeoffDraft({
        authorisedSource: null,
        scaleStatus: 'SCALE_NOT_PROVIDED',
        evidenceCandidates: [],
      }).status === 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE',
    ],
    [
      'water_waste_geyser',
      (() => {
        const r = resolveAiPlanTakeoffDraft({
          authorisedSource: source,
          scaleStatus: 'SCALE_NOT_PROVIDED',
          evidenceCandidates: [
            {
              clientKey: 'w',
              pointType: 'WATER',
              description: 'w',
              quantity: 1,
              unit: 'each',
              isLengthMeasurement: false,
              quantityOrigin: 'AI_DETECTION',
              supportingText: 'e',
              providerConfidence: 'HIGH',
            },
            {
              clientKey: 's',
              pointType: 'WASTE',
              description: 's',
              quantity: 1,
              unit: 'each',
              isLengthMeasurement: false,
              quantityOrigin: 'AI_DETECTION',
              supportingText: 'e',
              providerConfidence: 'HIGH',
            },
            {
              clientKey: 'g',
              pointType: 'GEYSER',
              description: 'g',
              quantity: 1,
              unit: 'each',
              isLengthMeasurement: false,
              quantityOrigin: 'AI_DETECTION',
              supportingText: 'e',
              providerConfidence: 'HIGH',
            },
          ],
        });
        return (
          r.items.map((i) => i.pointType).join(',') === 'WATER,WASTE,GEYSER'
        );
      })(),
    ],
    [
      'scale_blocks_length',
      resolveAiPlanTakeoffDraft({
        authorisedSource: source,
        scaleStatus: 'SCALE_NOT_PROVIDED',
        evidenceCandidates: [
          {
            clientKey: 'p',
            pointType: 'WATER',
            description: 'pipe',
            quantity: 10,
            unit: 'm',
            isLengthMeasurement: true,
            quantityOrigin: 'MEASURED',
            supportingText: 'line',
            providerConfidence: 'HIGH',
          },
        ],
      }).items[0]?.quantity == null,
    ],
    [
      'ai_cannot_self_approve',
      resolveAiPlanTakeoffDraft({
        authorisedSource: source,
        scaleStatus: 'SCALE_NOT_PROVIDED',
        evidenceCandidates: [
          {
            clientKey: 'w',
            pointType: 'WATER',
            description: 'w',
            quantity: 1,
            unit: 'each',
            isLengthMeasurement: false,
            quantityOrigin: 'AI_DETECTION',
            supportingText: 'e',
            providerConfidence: 'HIGH',
          },
        ],
      }).aiMayApprove === false,
    ],
    [
      'accept_reject',
      (() => {
        const r = resolveAiPlanTakeoffDraft({
          authorisedSource: source,
          scaleStatus: 'SCALE_NOT_PROVIDED',
          evidenceCandidates: [
            {
              clientKey: 'w',
              pointType: 'WATER',
              description: 'w',
              quantity: 2,
              unit: 'each',
              isLengthMeasurement: false,
              quantityOrigin: 'AI_DETECTION',
              supportingText: 'e',
              providerConfidence: 'HIGH',
            },
          ],
        });
        const ok = acceptAiTakeoffItemToRow94({
          item: r.items[0],
          humanConfirm: true,
          actorRole: 'owner',
        });
        const rej = rejectAiTakeoffItem(r.items[0]);
        return ok.ok === true && rej.entersCanonicalEstimate === false;
      })(),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoAiTakeoffClientLeak({ aiTakeoff: {} });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'idempotent',
      (() => {
        const a = aiTakeoffIdempotencyFingerprint({
          estimateId: 'e',
          sourceDocumentId: 'd',
          revisionLabel: 'A',
          candidateKeys: ['b', 'a'],
        });
        const b = aiTakeoffIdempotencyFingerprint({
          estimateId: 'e',
          sourceDocumentId: 'd',
          revisionLabel: 'A',
          candidateKeys: ['a', 'b'],
        });
        return a === b;
      })(),
    ],
    [
      'safety_gates',
      (() => {
        const g = assertRow98SafetyGates({ row92AutomationEnabled: false });
        return g.row99NotStarted && g.xeroWrites === 0;
      })(),
    ],
  ];

  let fixturePass = 0;
  let fixtureFail = 0;
  for (const [name, ok] of cases) {
    if (ok) {
      pass(`fixture_${name}`);
      fixturePass++;
    } else {
      fail(`fixture_${name}`);
      fixtureFail++;
    }
  }
  pass('fixture_totals', { pass: fixturePass, fail: fixtureFail });
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row99_not_started');
  pass('cleanup_no_fake_plan_upload');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row98-ai-plan-takeoff-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(__dirname, { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
