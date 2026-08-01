export type JobCreateHrefParams = {
  customerId?: string | null;
  propertyId?: string | null;
  siteContactMobile?: string | null;
  from?: string;
};

/** Build `/jobs/new` href with optional CRM and dispatch-intel prefill query params. */
export function buildJobCreateHref(params: JobCreateHrefParams = {}): string {
  const search = new URLSearchParams();
  if (params.customerId) search.set('customerId', params.customerId);
  if (params.propertyId) search.set('propertyId', params.propertyId);
  if (params.siteContactMobile) search.set('siteContactMobile', params.siteContactMobile);
  if (params.from) search.set('from', params.from);
  const qs = search.toString();
  return qs ? `/jobs/new?${qs}` : '/jobs/new';
}
