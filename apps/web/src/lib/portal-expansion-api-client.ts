import type {
  ApiResponse,
  CreatePortalExpansionBookingRequest,
  PortalExpansionHub,
  PortalSafeAppointment,
  PortalSafeBooking,
  PortalSafeDocument,
  PortalSafeFinance,
  PortalSafeInvoice,
  PortalSafeJobDetail,
  PortalSafeJobStatus,
  PortalSafeQuote,
  PortalSafeTimelineEntry,
} from '@titan/shared';
import { isApiError } from '@titan/shared';
import { portalRequest, PortalApiClientError } from './portal-api-client';

async function expansionRequest<T>(
  path: string,
  accessToken: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  return portalRequest<T>(`/portal/expansion${path}`, {
    accessToken,
    method: options.method,
    body: options.body,
  });
}

export { PortalApiClientError };

export async function fetchPortalExpansionHub(accessToken: string): Promise<PortalExpansionHub> {
  const data = await expansionRequest<{ hub: PortalExpansionHub }>('/hub', accessToken);
  return data.hub;
}

export async function fetchPortalExpansionJobs(
  accessToken: string,
): Promise<PortalSafeJobStatus[]> {
  const data = await expansionRequest<{ jobs: PortalSafeJobStatus[] }>('/jobs', accessToken);
  return data.jobs;
}

export async function fetchPortalExpansionJob(
  accessToken: string,
  jobId: string,
): Promise<PortalSafeJobDetail> {
  const data = await expansionRequest<{ detail: PortalSafeJobDetail }>(
    `/jobs/${jobId}`,
    accessToken,
  );
  return data.detail;
}

export async function fetchPortalExpansionQuotes(
  accessToken: string,
): Promise<PortalSafeQuote[]> {
  const data = await expansionRequest<{ quotes: PortalSafeQuote[] }>('/quotes', accessToken);
  return data.quotes;
}

export async function fetchPortalExpansionQuote(
  accessToken: string,
  quoteId: string,
): Promise<PortalSafeQuote> {
  const data = await expansionRequest<{ quote: PortalSafeQuote }>(
    `/quotes/${quoteId}`,
    accessToken,
  );
  return data.quote;
}

export async function fetchPortalExpansionFinance(
  accessToken: string,
): Promise<PortalSafeFinance> {
  const data = await expansionRequest<{ finance: PortalSafeFinance }>('/finance', accessToken);
  return data.finance;
}

export async function fetchPortalExpansionInvoice(
  accessToken: string,
  invoiceId: string,
): Promise<PortalSafeInvoice> {
  const data = await expansionRequest<{ invoice: PortalSafeInvoice }>(
    `/invoices/${invoiceId}`,
    accessToken,
  );
  return data.invoice;
}

export async function fetchPortalExpansionDocuments(
  accessToken: string,
): Promise<PortalSafeDocument[]> {
  const data = await expansionRequest<{ documents: PortalSafeDocument[] }>(
    '/documents',
    accessToken,
  );
  return data.documents;
}

export async function fetchPortalExpansionTimeline(
  accessToken: string,
): Promise<PortalSafeTimelineEntry[]> {
  const data = await expansionRequest<{ timeline: PortalSafeTimelineEntry[] }>(
    '/timeline',
    accessToken,
  );
  return data.timeline;
}

export async function fetchPortalExpansionAppointments(
  accessToken: string,
): Promise<PortalSafeAppointment[]> {
  const data = await expansionRequest<{ appointments: PortalSafeAppointment[] }>(
    '/appointments',
    accessToken,
  );
  return data.appointments;
}

export async function fetchPortalExpansionBookings(
  accessToken: string,
): Promise<PortalSafeBooking[]> {
  const data = await expansionRequest<{ bookings: PortalSafeBooking[] }>('/bookings', accessToken);
  return data.bookings;
}

export async function createPortalExpansionBooking(
  accessToken: string,
  input: CreatePortalExpansionBookingRequest,
): Promise<PortalSafeBooking> {
  const data = await expansionRequest<{ booking: PortalSafeBooking }>('/bookings', accessToken, {
    method: 'POST',
    body: input,
  });
  return data.booking;
}

/** Staff helper — typed for completeness; uses staff bearer via portalRequest pattern only when portal token unused. */
export type { ApiResponse };
export { isApiError };
