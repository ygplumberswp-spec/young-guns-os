#!/usr/bin/env node
/**
 * Safe cleanup for abandoned staged finance direct attachments.
 * Does not run automatically — schedule explicitly after staging deploy.
 */
import { createDb, closeDb, titanDocuments } from '@titan/db';
import { loadEnv } from '../config.js';
import { resolveJobEvidenceStoragePath } from '../lib/job-evidence-storage.js';
import {
  collectReferencedFinanceDirectStorageKeys,
  FinanceDocumentStagingCleanupService,
} from '../services/finance-document-staging-cleanup.service.js';
import { FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT } from '@titan/shared';

const dryRun = process.argv.includes('--dry-run');
const retentionArg = process.argv.find((arg) => arg.startsWith('--retention-days='));
const companyArg = process.argv.find((arg) => arg.startsWith('--company-id='));
const retentionDays = retentionArg
  ? Number(retentionArg.split('=')[1])
  : FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT;
const companyId = companyArg?.split('=')[1]?.trim() || undefined;

if (!Number.isFinite(retentionDays) || retentionDays < 1) {
  console.error('Invalid --retention-days value (must be >= 1)');
  process.exit(2);
}

const env = loadEnv();
const storageRoot = resolveJobEvidenceStoragePath(process.env.JOB_EVIDENCE_STORAGE_PATH);
const db = createDb(env.DATABASE_URL);

try {
  const photoRows = await db.select({ photos: titanDocuments.photos }).from(titanDocuments);
  const referencedStorageKeys = collectReferencedFinanceDirectStorageKeys(photoRows);

  const cleanup = new FinanceDocumentStagingCleanupService(storageRoot);
  const result = await cleanup.cleanup({
    referencedStorageKeys,
    retentionDays,
    dryRun,
    companyId,
  });

  console.log(
    JSON.stringify(
      {
        phase: 'finance-staging-cleanup',
        companyId: companyId ?? null,
        referencedStorageKeyCount: referencedStorageKeys.size,
        ...result,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  process.exit(0);
} finally {
  await closeDb();
}
