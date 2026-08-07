/**
 * Read-only staging probe + requirements snapshot for WhatsApp contact enrichment.
 * NEVER production (rshuiaghmtrvvilhqpwm). Read-only SELECT only.
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing forbidden production ref');
  process.exit(3);
}
if (!baseUrl.toLowerCase().includes(STAGING_REF)) {
  console.error(`Refusing: expected staging ref ${STAGING_REF}`);
  process.exit(3);
}

const sql = postgres(baseUrl, { max: 1, onnotice: () => {} });

const requirements = {
  bindingDoc: 'TITAN_WHATSAPP_CONTACT_ENRICHMENT.md',
  branch: 'cursor/titan-frozen-scope-completion',
  customerValueClassificationCrossRef: 'packages/shared/src/customer-value-classification.ts',
  queueBehindXeroImport: true,
  neverImportWhatsappAsCustomer: true,
  neverSilentXeroWrite: true,
  apiRoutes: [
    'GET /api/v1/whatsapp/enrichment/metrics',
    'GET /api/v1/whatsapp/enrichment/reviews',
    'POST /api/v1/whatsapp/enrichment/reviews/:id/approve',
  ],
  migration: 'packages/db/drizzle/0107_whatsapp_contact_enrichment.sql',
  frz015Rerun: false,
};

async function main() {
  const [xeroJobs] = await sql`
    SELECT count(*)::int AS running
    FROM integration_sync_jobs
    WHERE provider = 'xero'
      AND status IN ('running', 'pending')
  `;

  const whatsappRows = await sql`
    SELECT wc.status, wc.display_phone_number, wc.connected_at, wc.last_error,
           c.name AS company_name
    FROM whatsapp_connections wc
    JOIN companies c ON c.id = wc.company_id
    ORDER BY wc.updated_at DESC
    LIMIT 10
  `;

  const youngGuns = whatsappRows.find((r) =>
    String(r.company_name ?? '').toLowerCase().includes('young guns'),
  );

  const connectionState = youngGuns
    ? {
        company: youngGuns.company_name,
        status: youngGuns.status,
        displayPhoneNumber: youngGuns.display_phone_number,
        connectedAt: youngGuns.connected_at,
        lastError: youngGuns.last_error,
        connected: youngGuns.status === 'connected',
      }
    : whatsappRows[0]
      ? {
          company: whatsappRows[0].company_name,
          status: whatsappRows[0].status,
          displayPhoneNumber: whatsappRows[0].display_phone_number,
          connectedAt: whatsappRows[0].connected_at,
          lastError: whatsappRows[0].last_error,
          connected: whatsappRows[0].status === 'connected',
        }
      : { status: 'disconnected', connected: false, note: 'No whatsapp_connections rows' };

  const [msgCount] = await sql`SELECT count(*)::int AS n FROM whatsapp_messages`;

  let enrichmentTablesPresent = false;
  try {
    const [t] = await sql`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'whatsapp_match_reviews'
    `;
    enrichmentTablesPresent = (t?.n ?? 0) > 0;
  } catch {
    enrichmentTablesPresent = false;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    readOnly: true,
    productionAccessed: false,
    requirements,
    stagingWhatsapp: {
      connectionState,
      allConnectionsSampled: whatsappRows.length,
      whatsappMessageCount: msgCount?.n ?? 0,
    },
    xeroImport: {
      runningOrPendingJobs: xeroJobs?.running ?? 0,
      importInProgress: (xeroJobs?.running ?? 0) > 0,
      enrichmentShouldQueue: (xeroJobs?.running ?? 0) > 0,
    },
    schema: {
      migration0107AppliedOnStaging: enrichmentTablesPresent,
      applyDuringActiveImport: false,
    },
    notes: [
      'Read-only probe — no writes, no FRZ-015 re-run.',
      'Enrichment migration apply deferred if Xero import active.',
    ],
  };

  const outPath = path.resolve(__dirname, '../../../diagnostic-output/183-whatsapp-enrichment-requirements.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sql.end());
