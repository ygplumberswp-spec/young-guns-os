/** Default retention for abandoned staged finance direct uploads (days). */
export const FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT = 7;

export function financeStagingEvidenceRetentionMs(
  retentionDays: number = FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT,
): number {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new Error('Finance staging retention days must be a positive number');
  }
  return retentionDays * 24 * 60 * 60 * 1000;
}
