/**
 * JPE-004 — Live job cost capture & technician-safe financial readiness.
 */

import type { JobProfitabilityResult } from './job-profitability.js';
import { isReceiptRequiredForDirectCost } from './job-cost-control.js';

export type JobCostCaptureStatus =
  | 'not_started'
  | 'capturing'
  | 'needs_attention'
  | 'ready_for_finance';

export type TechnicianChecklistItemStatus = 'ok' | 'warning' | 'missing' | 'not_applicable';

export type TechnicianCompletionChecklistItem = {
  key: string;
  label: string;
  status: TechnicianChecklistItemStatus;
  detail: string;
};

export type TechnicianCompletionChecklist = {
  jobId: string;
  items: TechnicianCompletionChecklistItem[];
  canCompleteOperationally: true;
  warningCount: number;
};

export type DailyCostCaptureSummary = {
  date: string;
  jobsCompleted: number;
  financiallyReady: number;
  needReview: number;
  missingTime: number;
  missingMaterials: number;
  missingReceipts: number;
  unallocatedCostsCents: number;
};

export type ActiveTimeEntryConflict = {
  code: 'ACTIVE_JOB_TIME_EXISTS' | 'ACTIVE_TRAVEL_EXISTS' | 'JOB_ALREADY_COMPLETED' | 'INVALID_DURATION';
  message: string;
};

export type TimeEntryStopInput = {
  timeEntryId: string;
  endedAt?: string;
  clientActionId?: string;
};

export function hasAuthoritativeLabourCapture(
  labourEntries: Array<{ durationMinutes: number; approved?: boolean }>,
): boolean {
  return labourEntries.some((row) => row.durationMinutes > 0 && row.approved !== false);
}

export function hasOpenTimeEntry(
  entries: Array<{ entryType: string; endedAt: string | null; jobId: string | null }>,
  options: { entryType?: string; jobId?: string } = {},
): boolean {
  return entries.some((row) => {
    if (row.endedAt) return false;
    if (options.entryType && row.entryType !== options.entryType) return false;
    if (options.jobId && row.jobId !== options.jobId) return false;
    return row.entryType === 'job_time' || row.entryType === 'travel';
  });
}

export function detectActiveTimeConflict(
  entries: Array<{ id: string; entryType: string; endedAt: string | null; jobId: string | null }>,
  input: { entryType: 'job_time' | 'travel'; jobId?: string; jobStatus?: string },
): ActiveTimeEntryConflict | null {
  if (input.jobStatus === 'completed') {
    return {
      code: 'JOB_ALREADY_COMPLETED',
      message: 'Cannot start time capture on a completed job.',
    };
  }
  if (input.entryType === 'job_time') {
    const activeJobTime = entries.find((row) => row.entryType === 'job_time' && !row.endedAt);
    if (activeJobTime) {
      return {
        code: 'ACTIVE_JOB_TIME_EXISTS',
        message: 'Technician already has an active job time entry — stop it before starting another.',
      };
    }
  }
  if (input.entryType === 'travel') {
    const activeTravel = entries.find((row) => row.entryType === 'travel' && !row.endedAt);
    if (activeTravel) {
      return {
        code: 'ACTIVE_TRAVEL_EXISTS',
        message: 'Technician already has an active travel entry — stop it before starting another.',
      };
    }
  }
  return null;
}

export function computeDurationMinutes(startedAt: Date, endedAt: Date): number {
  if (endedAt.getTime() < startedAt.getTime()) {
    throw new Error('End time cannot be before start time');
  }
  return Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}

export function buildTechnicianCompletionChecklist(input: {
  jobId: string;
  hasAuthoritativeLabour: boolean;
  materialLineCount: number;
  materialsNeedingConfirmation: number;
  missingReceiptCount: number;
  photoEvidenceCount: number;
  hasSignature: boolean;
}): TechnicianCompletionChecklist {
  const items: TechnicianCompletionChecklistItem[] = [
    {
      key: 'time',
      label: 'Job Time',
      status: input.hasAuthoritativeLabour ? 'ok' : 'warning',
      detail: input.hasAuthoritativeLabour ? 'Captured' : 'Confirm job time is recorded',
    },
    {
      key: 'materials',
      label: 'Materials',
      status:
        input.materialLineCount === 0
          ? 'not_applicable'
          : input.materialsNeedingConfirmation > 0
            ? 'warning'
            : 'ok',
      detail:
        input.materialLineCount === 0
          ? 'No materials recorded'
          : input.materialsNeedingConfirmation > 0
            ? 'Confirm materials used'
            : 'Materials recorded',
    },
    {
      key: 'receipts',
      label: 'Receipts',
      status: input.missingReceiptCount > 0 ? 'warning' : 'ok',
      detail:
        input.missingReceiptCount > 0
          ? `${input.missingReceiptCount} receipt${input.missingReceiptCount === 1 ? '' : 's'} missing`
          : 'Receipt evidence complete',
    },
    {
      key: 'photos',
      label: 'Photos',
      status: input.photoEvidenceCount > 0 ? 'ok' : 'warning',
      detail: input.photoEvidenceCount > 0 ? 'Uploaded' : 'Add job photos if required',
    },
    {
      key: 'signature',
      label: 'Signature',
      status: input.hasSignature ? 'ok' : 'warning',
      detail: input.hasSignature ? 'Complete' : 'Customer signature or reason required',
    },
  ];

  const warningCount = items.filter((row) => row.status === 'warning' || row.status === 'missing').length;

  return {
    jobId: input.jobId,
    items,
    canCompleteOperationally: true,
    warningCount,
  };
}

export function deriveJobCostCaptureStatus(input: {
  jobStatus: string;
  hasAnyCapture: boolean;
  warningCount: number;
  financiallyComplete: boolean;
}): JobCostCaptureStatus {
  if (input.financiallyComplete) return 'ready_for_finance';
  if (input.jobStatus !== 'completed' && !input.hasAnyCapture) return 'not_started';
  if (input.jobStatus !== 'completed' && input.hasAnyCapture) return 'capturing';
  if (input.warningCount > 0) return 'needs_attention';
  return 'ready_for_finance';
}

/** Strip sensitive finance fields from profitability payloads for technician API responses. */
export function redactProfitabilityForTechnician(
  result: JobProfitabilityResult,
): Pick<JobProfitabilityResult, 'completeness' | 'completenessWarnings'> {
  return {
    completeness: result.completeness,
    completenessWarnings: result.completenessWarnings.filter(
      (warning) => !/margin|profit|rate|wage|cost/i.test(warning),
    ),
  };
}

export function countMissingReceipts(
  directCosts: Array<{
    category: string;
    sourceType: string;
    amountCents: number;
    receiptDocumentId: string | null;
  }>,
): number {
  return directCosts.filter((row) =>
    isReceiptRequiredForDirectCost({
      category: row.category,
      sourceType: row.sourceType,
      amountCents: row.amountCents,
    }) && !row.receiptDocumentId,
  ).length;
}

export function materialLinesNeedingCostReview(
  lines: Array<{ unitCostCents: number | null | undefined; status: string }>,
): number {
  return lines.filter(
    (row) =>
      ['requested', 'approved', 'used', 'partially_fulfilled'].includes(row.status) &&
      (row.unitCostCents == null || row.unitCostCents <= 0),
  ).length;
}
