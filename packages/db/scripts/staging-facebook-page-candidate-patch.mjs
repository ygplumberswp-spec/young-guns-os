#!/usr/bin/env node
/**
 * J-6.7F4 — One-time staging metadata patch for verified Young Guns Facebook Page ID.
 *
 * STAGING ONLY. Refuses production ref rshuiaghmtrvvilhqpwm.
 * Idempotent: second run is a no-op when candidate already matches.
 *
 * Usage:
 *   node packages/db/scripts/staging-facebook-page-candidate-patch.mjs --preview
 *   node packages/db/scripts/staging-facebook-page-candidate-patch.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');

const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const REQUIRED_STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YOUNG_GUNS_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const YOUNG_GUNS_SLUG = 'young-guns-plumbing-e5cb91';
const OLD_PAGE_ID = '394603137072407';
const VERIFIED_PAGE_ID = '61564442420962';
const VERIFIED_PAGE_NAME = 'Young Guns Plumbing – Cape Town';

const mode = process.argv.includes('--apply') ? 'apply' : 'preview';

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
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

function sanitizePreview(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const candidate =
    metadata.pendingPageCandidate && typeof metadata.pendingPageCandidate === 'object'
      ? metadata.pendingPageCandidate
      : null;
  return {
    connectionExists: true,
    connectionId: row.id,
    companyId: row.company_id,
    state: row.state,
    pageId: row.page_id,
    pageName: row.page_name,
    credentialsPreserved: Boolean(row.has_creds),
    oldCandidateId: candidate?.pageId ?? null,
    newCandidateId: VERIFIED_PAGE_ID,
    candidateName: candidate?.pageName ?? null,
    metadataKeys: Object.keys(metadata),
  };
}

function buildPatchedMetadata(existingMetadata) {
  const metadata =
    existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? { ...existingMetadata }
      : {};

  const existingCandidate =
    metadata.pendingPageCandidate && typeof metadata.pendingPageCandidate === 'object'
      ? metadata.pendingPageCandidate
      : null;

  const existingPageId =
    typeof existingCandidate?.pageId === 'string' ? existingCandidate.pageId.trim() : null;
  const existingPageName =
    typeof existingCandidate?.pageName === 'string' ? existingCandidate.pageName.trim() : null;

  const alreadyCorrect =
    existingPageId === VERIFIED_PAGE_ID && existingPageName === VERIFIED_PAGE_NAME;

  if (alreadyCorrect) {
    return { changed: false, metadata, oldCandidateId: existingPageId };
  }

  const oldCandidateId = existingPageId;
  metadata.pendingPageCandidate = {
    pageId: VERIFIED_PAGE_ID,
    pageName: VERIFIED_PAGE_NAME,
    source:
      existingCandidate?.source === 'connection_metadata' ? 'connection_metadata' : 'tenant_known_page',
  };

  return { changed: true, metadata, oldCandidateId: oldCandidateId ?? OLD_PAGE_ID };
}

async function main() {
  const env = loadEnv(envPath);
  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL — DATABASE_URL required (apps/api/.env.staging.local)');
    process.exit(1);
  }
  if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
    console.error(`FAIL — production ref ${FORBIDDEN_PROD_REF} forbidden`);
    process.exit(1);
  }
  if (!databaseUrl.includes(REQUIRED_STAGING_REF)) {
    console.error(`FAIL — expected staging ref ${REQUIRED_STAGING_REF}`);
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });

  try {
    const [company] = await sql`
      SELECT id, slug, name FROM companies
      WHERE id = ${YOUNG_GUNS_COMPANY_ID} OR slug = ${YOUNG_GUNS_SLUG}
      LIMIT 1
    `;
    if (!company) {
      console.error('FAIL — Young Guns Plumbing company not found on staging');
      process.exit(1);
    }

    const [row] = await sql`
      SELECT
        id,
        company_id,
        state,
        page_id,
        page_name,
        metadata,
        credentials_encrypted IS NOT NULL AS has_creds
      FROM fb_connections
      WHERE company_id = ${company.id}
      LIMIT 1
    `;

    if (!row) {
      console.error('FAIL — no fb_connections row for Young Guns staging tenant');
      process.exit(1);
    }

    const before = sanitizePreview(row);
    const { changed, metadata, oldCandidateId } = buildPatchedMetadata(row.metadata);

    const report = {
      mode,
      environment: 'staging',
      companyId: company.id,
      companySlug: company.slug,
      before,
      after: changed
        ? {
            ...before,
            oldCandidateId: oldCandidateId ?? OLD_PAGE_ID,
            newCandidateId: VERIFIED_PAGE_ID,
            candidateName: VERIFIED_PAGE_NAME,
            pageId: before.pageId,
            pageName: before.pageName,
            state: before.state,
            credentialsPreserved: before.credentialsPreserved,
          }
        : {
            ...before,
            newCandidateId: VERIFIED_PAGE_ID,
            candidateName: VERIFIED_PAGE_NAME,
            noOp: true,
          },
      willChange: changed,
      pageIdRemainsNull: row.page_id == null,
      pageTokenAbsent: row.page_id == null,
    };

    console.log(JSON.stringify(report, null, 2));

    if (mode === 'preview') {
      console.log('PREVIEW ONLY — re-run with --apply to execute');
      return;
    }

    if (!changed) {
      console.log('NO-OP — candidate metadata already correct');
      return;
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE fb_connections
        SET metadata = ${tx.json(metadata)}
        WHERE id = ${row.id}
          AND company_id = ${company.id}
          AND state = 'partial'
          AND page_id IS NULL
      `;

      const auditMetadata = {
        environment: 'staging',
        reason: 'Owner-verified Facebook Page URL correction',
        oldCandidateId: oldCandidateId ?? OLD_PAGE_ID,
        newCandidateId: VERIFIED_PAGE_ID,
        candidatePageName: VERIFIED_PAGE_NAME,
        timestamp: new Date().toISOString(),
        connectionId: row.id,
        companyId: company.id,
      };

      await tx`
        INSERT INTO security_audit_logs (
          company_id,
          category,
          action,
          entity_type,
          entity_id,
          metadata
        ) VALUES (
          ${company.id},
          'integrations',
          'facebook.connection.page_candidate_patch',
          'facebook_business',
          ${row.id},
          ${tx.json(auditMetadata)}
        )
      `;

      await tx`
        INSERT INTO fb_connection_events (
          company_id,
          connection_id,
          event_type,
          state_before,
          state_after,
          message,
          metadata
        ) VALUES (
          ${company.id},
          ${row.id},
          'page_candidate_id_corrected',
          'partial',
          'partial',
          'Staging metadata patch: verified Facebook Page candidate id updated',
          ${tx.json(auditMetadata)}
        )
      `;
    });

    const [afterRow] = await sql`
      SELECT id, company_id, state, page_id, page_name, metadata,
             credentials_encrypted IS NOT NULL AS has_creds
      FROM fb_connections WHERE id = ${row.id}
    `;

    console.log(
      JSON.stringify(
        {
          applied: true,
          auditEventCreated: true,
          after: sanitizePreview(afterRow),
          pageIdRemainsNull: afterRow.page_id == null,
          credentialsPreserved: Boolean(afterRow.has_creds),
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('FAIL —', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
