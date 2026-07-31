import {
  LOCAL_JOB_EVIDENCE_STORAGE_PATH,
  PRODUCTION_JOB_EVIDENCE_STORAGE_PATH,
  resolveStoragePath,
} from './storage-paths.js';

export function resolveJobEvidenceStoragePath(configuredPath?: string | null): string {
  return resolveStoragePath({
    configuredPath,
    localRelativeDefault: LOCAL_JOB_EVIDENCE_STORAGE_PATH,
    productionAbsoluteDefault: PRODUCTION_JOB_EVIDENCE_STORAGE_PATH,
    label: 'job-evidence',
  });
}
