#!/usr/bin/env node
/**
 * Read-only diagnostic for deployment storage configuration.
 * Never exposes raw filesystem paths in output.
 */
import { loadEnv } from '../config.js';
import { resolveCompanyMediaStoragePath } from '../lib/company-media-storage.js';
import { resolveJobEvidenceStoragePath } from '../lib/job-evidence-storage.js';
import {
  buildStorageDiagnosticReport,
  validateDeploymentStorageConfiguration,
} from '../lib/deployment-storage-validation.js';
import {
  countFinanceStagingFiles,
  isStorageRootWritable,
} from '../services/finance-document-staging-cleanup.service.js';

const env = loadEnv();
const jobEvidenceStoragePath = resolveJobEvidenceStoragePath(process.env.JOB_EVIDENCE_STORAGE_PATH);
const companyMediaStoragePath = resolveCompanyMediaStoragePath(
  process.env.COMPANY_MEDIA_STORAGE_PATH,
);

const validation = validateDeploymentStorageConfiguration({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  jobEvidenceStoragePath,
  companyMediaStoragePath,
});

const writable = await isStorageRootWritable(jobEvidenceStoragePath);
const stagedMetadataCount = await countFinanceStagingFiles(jobEvidenceStoragePath);

console.log(
  JSON.stringify(
    {
      phase: 'storage-diagnostic',
      ...buildStorageDiagnosticReport({
        jobEvidenceStoragePath,
        companyMediaStoragePath,
        financeDirectUsesJobEvidenceRoot: true,
      }),
      validationOk: validation.ok,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      jobEvidenceWritable: writable,
      financeStagingMetadataFiles: stagedMetadataCount,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);

process.exit(validation.ok && writable ? 0 : 1);
