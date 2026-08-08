import type {
  DuplicateConfidenceLabel,
  DuplicateResolutionType,
  ReconciliationLifecycleStatus,
} from '@titan/shared';
import { request } from './api-client';

export type ReconciliationQueueItem = {
  id: string;
  candidateId: string | null;
  leftCustomerId: string;
  rightCustomerId: string;
  leftName: string;
  rightName: string;
  confidenceLabel: DuplicateConfidenceLabel;
  suggestedResolution: DuplicateResolutionType | null;
  resolutionType: DuplicateResolutionType | null;
  status: ReconciliationLifecycleStatus;
  matchSignals: string[];
  differingSignals: string[];
  rationale: string[];
  reversible: boolean;
  updatedAt: string;
  createdAt: string;
};

export async function scanDuplicateReconciliations(accessToken: string) {
  return request<{
    candidates: unknown[];
    reconciliations: unknown[];
    autoMerge: false;
    xeroWrites: 0;
  }>('/customer-duplicate-reconciliation/scan', { accessToken, method: 'POST', body: {} });
}

export async function fetchDuplicateReconciliationQueue(
  accessToken: string,
  opts: { status?: string; confidence?: string } = {},
) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.confidence) params.set('confidence', opts.confidence);
  const qs = params.toString();
  const data = await request<{ items: ReconciliationQueueItem[]; autoMerge: false }>(
    `/customer-duplicate-reconciliation/queue${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
  return data.items;
}

export async function fetchDuplicateSideBySide(accessToken: string, reconciliationId: string) {
  return request<Record<string, unknown>>(
    `/customer-duplicate-reconciliation/cases/${reconciliationId}/side-by-side`,
    { accessToken },
  );
}

export async function draftDuplicateResolution(
  accessToken: string,
  reconciliationId: string,
  body: {
    resolutionType: DuplicateResolutionType;
    canonicalCustomerId: string;
    personId?: string | null;
    notes?: string | null;
  },
) {
  return request(`/customer-duplicate-reconciliation/cases/${reconciliationId}/draft`, {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function approveDuplicateResolution(accessToken: string, reconciliationId: string) {
  return request(`/customer-duplicate-reconciliation/cases/${reconciliationId}/approve`, {
    accessToken,
    method: 'POST',
    body: {},
  });
}

export async function executeDuplicateResolution(accessToken: string, reconciliationId: string) {
  return request(`/customer-duplicate-reconciliation/cases/${reconciliationId}/execute`, {
    accessToken,
    method: 'POST',
    body: {},
  });
}

export async function reverseDuplicateResolution(accessToken: string, reconciliationId: string) {
  return request(`/customer-duplicate-reconciliation/cases/${reconciliationId}/reverse`, {
    accessToken,
    method: 'POST',
    body: {},
  });
}

export async function warnPossibleDuplicateOnCreate(
  accessToken: string,
  body: { name: string; email?: string | null; phone?: string | null; vatNumber?: string | null },
) {
  return request<{
    warning: boolean;
    message: string | null;
    candidates: Array<{
      id: string;
      name: string;
      confidenceLabel: string;
      matchSignals: string[];
      href: string;
    }>;
    autoMerge: false;
    autoBlock: false;
  }>('/customer-duplicate-reconciliation/create-warning', {
    accessToken,
    method: 'POST',
    body,
  });
}
