export type JobFinanceAction = 'quote' | 'invoice' | 'payment';

export type JobFinanceActionHrefParams = {
  jobId: string;
  customerId: string;
  from?: string;
};

const ACTION_PATH: Record<JobFinanceAction, string> = {
  quote: '/finance/quotes/new',
  invoice: '/finance/invoices/new',
  payment: '/finance/payments/new',
};

/** Build finance create-page href with job and customer prefill query params. */
export function buildJobFinanceActionHref(
  action: JobFinanceAction,
  params: JobFinanceActionHrefParams,
): string {
  const search = new URLSearchParams();
  search.set('jobId', params.jobId);
  search.set('customerId', params.customerId);
  if (params.from) search.set('from', params.from);
  return `${ACTION_PATH[action]}?${search.toString()}`;
}
