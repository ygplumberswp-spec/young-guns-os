/**
 * Extended report source policy — fleet freshness, compliance honesty, COC legal distinction.
 */

import type { ExtendedReportAudience } from './extended-report.js';
import { FLEET_SYNC_STALE_MS } from './fleet-tracking.js';

export type FleetStoredFreshnessState =
  | 'current'
  | 'recently_synced'
  | 'stale'
  | 'never_synced'
  | 'incomplete'
  | 'unavailable';

export const COMPLIANCE_COC_LEGAL_NOTICE =
  'This report supports TITAN compliance records and does not replace an officially issued and signed Certificate of Compliance.';

export const FLEET_STORED_DATA_NOTE =
  'Fleet data is from stored TITAN/Cartrack-synchronized records only. No live provider calls are made during report generation.';

export const FLEET_NO_LIVE_LOCATION_NOTE =
  'Stored positions are historical snapshots — not live location.';

export function resolveFleetStoredFreshness(
  lastSyncAt: string | null,
  now = new Date(),
): FleetStoredFreshnessState {
  if (!lastSyncAt) return 'never_synced';
  const syncTime = Date.parse(lastSyncAt);
  if (Number.isNaN(syncTime)) return 'unavailable';
  const ageMs = now.getTime() - syncTime;
  if (ageMs <= 60 * 60_000) return 'current';
  if (ageMs <= FLEET_SYNC_STALE_MS) return 'recently_synced';
  if (ageMs <= 7 * 24 * 60 * 60_000) return 'stale';
  return 'stale';
}

export type CocAttachmentResolution = {
  attachmentState: string;
  certificateNumber: string | null;
  issueDate: string | null;
  statusLabel: string;
};

/** Resolve COC attachment only from genuine linked records — never filename alone. */
export function resolveCocAttachmentState(input: {
  cocDocumentationId: string | null;
  diCocProfileLinked: boolean;
  workflowStatus: string | null;
  completionCertificateNumber: string | null;
  completionCertificateIssuedAt: string | null;
  cocRequiredRecorded: boolean | null;
  complianceWorkComplete: boolean | null;
}): CocAttachmentResolution {
  const hasEvidenceLink = Boolean(input.cocDocumentationId) || input.diCocProfileLinked;
  const certNum = input.completionCertificateNumber?.trim() || null;
  const issueDate = input.completionCertificateIssuedAt?.trim() || null;

  if (hasEvidenceLink && input.workflowStatus === 'issued') {
    return {
      attachmentState: 'Official COC attached',
      certificateNumber: certNum,
      issueDate,
      statusLabel: 'coc_attached',
    };
  }
  if (hasEvidenceLink) {
    return {
      attachmentState: 'Official COC attached',
      certificateNumber: certNum,
      issueDate,
      statusLabel: 'coc_attached',
    };
  }
  if (input.workflowStatus === 'issued' && certNum) {
    return {
      attachmentState: 'COC issued — attachment not linked in TITAN',
      certificateNumber: certNum,
      issueDate,
      statusLabel: 'coc_issued',
    };
  }
  if (input.workflowStatus === 'ready_for_issue' || input.workflowStatus === 'review') {
    return {
      attachmentState: 'COC pending',
      certificateNumber: certNum,
      issueDate,
      statusLabel: 'coc_pending',
    };
  }
  if (input.complianceWorkComplete === false) {
    return {
      attachmentState: 'Compliance work incomplete',
      certificateNumber: null,
      issueDate: null,
      statusLabel: 'compliance_work_incomplete',
    };
  }
  if (input.cocRequiredRecorded === false) {
    return {
      attachmentState: 'No COC required (recorded)',
      certificateNumber: null,
      issueDate: null,
      statusLabel: 'no_coc_required',
    };
  }
  if (input.workflowStatus) {
    return {
      attachmentState: 'Official COC not attached',
      certificateNumber: null,
      issueDate: null,
      statusLabel: 'coc_missing',
    };
  }
  return {
    attachmentState: 'COC status not recorded',
    certificateNumber: null,
    issueDate: null,
    statusLabel: 'coc_status_not_recorded',
  };
}

export function formatLastStoredPositionNote(recordedAt: string | null): string | null {
  if (!recordedAt) return null;
  return `Last stored position recorded at ${recordedAt}. Not a live location.`;
}

export const EXTENDED_REPORT_SENSITIVE_PATTERNS = [
  /\blatitude\b/i,
  /\blongitude\b/i,
  /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/,
  /\bexternal[_-]?vehicle[_-]?id\b/i,
  /\bcartrack[_-]?vehicle\b/i,
  /\bstorageKey\b/,
  /\bstoragePath\b/,
  /\bprovider[_-]?id\b/i,
  /\bxero tenant id\b/i,
  /\baccess[_-]?token\b/i,
  /\brefresh[_-]?token\b/i,
  /\bpayroll\b/i,
  /\bwage\b/i,
  /\bsalary\b/i,
  /\bunitCost\b/i,
  /\bmargin review\b/i,
] as const;

export function assertExtendedReportHtmlSafe(
  html: string,
  audience: ExtendedReportAudience,
): void {
  for (const pattern of EXTENDED_REPORT_SENSITIVE_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`Sensitive field leaked into ${audience} extended report HTML (${pattern})`);
    }
  }
  if (html.includes('/var/lib/') || html.includes('/api/v1/jobs/')) {
    throw new Error('Storage path leaked into extended report HTML');
  }
  if (audience === 'client' && /\binternalNotes\b/i.test(html)) {
    throw new Error('Internal notes leaked into client extended report HTML');
  }
}
