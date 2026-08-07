import type {
  CashControlIssuesResult,
  CashControlJobView,
  CashControlLedgerPage,
  CashControlSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCashControlSummary(accessToken: string): Promise<CashControlSummary> {
  return request<CashControlSummary>('/finance/cash-control/summary', { accessToken });
}

export async function fetchCashControlLedger(
  accessToken: string,
  params: {
    page?: number;
    pageSize?: number;
    fromDate?: string;
    toDate?: string;
    q?: string;
    controlState?: string;
    direction?: 'debit' | 'credit';
  } = {},
): Promise<CashControlLedgerPage> {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.fromDate) search.set('fromDate', params.fromDate);
  if (params.toDate) search.set('toDate', params.toDate);
  if (params.q) search.set('q', params.q);
  if (params.controlState) search.set('controlState', params.controlState);
  if (params.direction) search.set('direction', params.direction);
  const qs = search.toString();
  return request<CashControlLedgerPage>(
    `/finance/cash-control/ledger${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
}

export async function fetchCashControlIssues(
  accessToken: string,
): Promise<CashControlIssuesResult> {
  return request<CashControlIssuesResult>('/finance/cash-control/issues', { accessToken });
}

export async function fetchCashControlJob(
  accessToken: string,
  jobId: string,
): Promise<CashControlJobView> {
  return request<CashControlJobView>(`/finance/cash-control/jobs/${jobId}`, { accessToken });
}
