import type {
  ApiResponse,
  PortalAuthSession,
  PortalAuthUser,
  PortalCustomerCommunicationsCentre,
  PortalCustomerExperienceDashboard,
  PortalCustomerRequestSummary,
  PortalFinanceCentre,
  PortalJobTrackingDetail,
  PortalKnowledgeArticleSummary,
  PortalQuoteDetail,
  PortalDashboardResponse,
  NotificationSummary,
  CxCustomerDashboard,
  CxDocumentCentre,
  CxAppointmentBookingSummary,
  CxCustomerPropertySummary,
  CxReviewFeedbackSummary,
  CxLoyaltyReferralSummary,
  CxEngagementPreferencesSummary,
  CxTechnicianTrackingSummary,
} from '@titan/shared';
import { isApiError } from '@titan/shared';

const API_BASE = '/api/v1';

type RequestOptions = {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<PortalAuthSession | null> | null = null;

export class PortalApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PortalApiClientError';
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload) ? payload.error.message : 'Request failed';
    throw new PortalApiClientError(
      message,
      response.status,
      isApiError(payload) ? payload.error.code : 'REQUEST_FAILED',
    );
  }

  return payload.data;
}

async function refreshPortalAccessToken(): Promise<PortalAuthSession | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/portal/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          return null;
        }

        const data = await parseResponse<{ user: PortalAuthUser; session: PortalAuthSession }>(
          response,
        );
        return data.session;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function portalRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !options.skipAuthRefresh && options.accessToken) {
    const refreshed = await refreshPortalAccessToken();

    if (refreshed) {
      return portalRequest<T>(path, {
        ...options,
        accessToken: refreshed.accessToken,
        skipAuthRefresh: true,
      });
    }
  }

  return parseResponse<T>(response);
}

export type PortalAuthPayload = {
  user: PortalAuthUser;
  session: PortalAuthSession;
};

export async function portalLogin(body: {
  email: string;
  password: string;
}): Promise<PortalAuthPayload> {
  return portalRequest<PortalAuthPayload>('/portal/auth/login', {
    method: 'POST',
    body,
    skipAuthRefresh: true,
  });
}

export async function portalLogout(): Promise<void> {
  await portalRequest<{ success: boolean }>('/portal/auth/logout', {
    method: 'POST',
    skipAuthRefresh: true,
  });
}

export async function restorePortalSession(): Promise<PortalAuthPayload | null> {
  const response = await fetch(`${API_BASE}/portal/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  return parseResponse<PortalAuthPayload>(response);
}

export async function fetchPortalDashboard(
  accessToken: string,
): Promise<PortalDashboardResponse> {
  return portalRequest<PortalDashboardResponse>('/portal/dashboard', { accessToken });
}

export async function fetchPortalExperienceDashboard(
  accessToken: string,
): Promise<PortalCustomerExperienceDashboard> {
  const data = await portalRequest<{ dashboard: PortalCustomerExperienceDashboard }>(
    '/portal/experience/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchPortalJobs(accessToken: string) {
  return portalRequest<{ jobs: PortalCustomerExperienceDashboard['activeJobs'] }>('/portal/jobs', {
    accessToken,
  });
}

export async function fetchPortalJob(accessToken: string, jobId: string) {
  const data = await portalRequest<{ job: PortalJobTrackingDetail }>(`/portal/jobs/${jobId}`, {
    accessToken,
  });
  return data.job;
}

export async function fetchPortalQuotes(accessToken: string) {
  const data = await portalRequest<{ quotes: PortalQuoteDetail[] }>('/portal/quotes', { accessToken });
  return data.quotes;
}

export async function fetchPortalFinance(accessToken: string) {
  const data = await portalRequest<{ finance: PortalFinanceCentre }>('/portal/finance', { accessToken });
  return data.finance;
}

export async function fetchPortalAppointments(accessToken: string) {
  const data = await portalRequest<{ appointments: PortalCustomerExperienceDashboard['upcomingAppointments'] }>(
    '/portal/appointments',
    { accessToken },
  );
  return data.appointments;
}

export async function fetchPortalCommunications(accessToken: string) {
  const data = await portalRequest<{ communications: PortalCustomerCommunicationsCentre }>(
    '/portal/communications',
    { accessToken },
  );
  return data.communications;
}

export async function searchPortalKnowledge(accessToken: string, query: string) {
  const data = await portalRequest<{ results: PortalKnowledgeArticleSummary[] }>(
    `/portal/knowledge/search?q=${encodeURIComponent(query)}`,
    { accessToken },
  );
  return data.results;
}

export async function fetchPortalNotifications(accessToken: string) {
  const data = await portalRequest<{ notifications: NotificationSummary[] }>('/portal/notifications', {
    accessToken,
  });
  return data.notifications;
}

export async function createPortalRequest(
  accessToken: string,
  body: {
    requestType: PortalCustomerRequestSummary['requestType'];
    subject: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
  },
) {
  const data = await portalRequest<{ request: PortalCustomerRequestSummary }>('/portal/requests', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.request;
}

export async function fetchCxPortalDashboard(accessToken: string): Promise<CxCustomerDashboard> {
  const data = await portalRequest<{ dashboard: CxCustomerDashboard }>(
    '/enterprise-customer-experience/portal/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchCxPortalDocuments(accessToken: string): Promise<CxDocumentCentre> {
  const data = await portalRequest<{ documentCentre: CxDocumentCentre }>(
    '/enterprise-customer-experience/portal/documents',
    { accessToken },
  );
  return data.documentCentre;
}

export async function fetchCxPortalBookings(accessToken: string): Promise<CxAppointmentBookingSummary[]> {
  const data = await portalRequest<{ bookings: CxAppointmentBookingSummary[] }>(
    '/enterprise-customer-experience/portal/bookings',
    { accessToken },
  );
  return data.bookings;
}

export async function createCxPortalBooking(
  accessToken: string,
  body: {
    subject: string;
    bookingType?: 'standard' | 'emergency' | 'reschedule' | 'cancellation';
    preferredDate?: string;
    preferredTimeWindow?: string;
    jobNotes?: string;
    photoUrls?: string[];
  },
) {
  const data = await portalRequest<{ booking: CxAppointmentBookingSummary }>(
    '/enterprise-customer-experience/portal/bookings',
    { method: 'POST', accessToken, body },
  );
  return data.booking;
}

export async function fetchCxPortalProperties(accessToken: string): Promise<CxCustomerPropertySummary[]> {
  const data = await portalRequest<{ properties: CxCustomerPropertySummary[] }>(
    '/enterprise-customer-experience/portal/properties',
    { accessToken },
  );
  return data.properties;
}

export async function createCxPortalProperty(
  accessToken: string,
  body: { propertyName: string; addressLine1?: string; city?: string; postalCode?: string; isPrimary?: boolean },
) {
  const data = await portalRequest<{ property: CxCustomerPropertySummary }>(
    '/enterprise-customer-experience/portal/properties',
    { method: 'POST', accessToken, body },
  );
  return data.property;
}

export async function fetchCxPortalReviews(accessToken: string): Promise<CxReviewFeedbackSummary[]> {
  const data = await portalRequest<{ reviews: CxReviewFeedbackSummary[] }>(
    '/enterprise-customer-experience/portal/reviews',
    { accessToken },
  );
  return data.reviews;
}

export async function submitCxPortalReview(
  accessToken: string,
  body: {
    reviewType: CxReviewFeedbackSummary['reviewType'];
    subject: string;
    feedback: string;
    rating?: number;
    jobId?: string;
  },
) {
  const data = await portalRequest<{ review: CxReviewFeedbackSummary }>(
    '/enterprise-customer-experience/portal/reviews',
    { method: 'POST', accessToken, body },
  );
  return data.review;
}

export async function fetchCxPortalReferrals(accessToken: string): Promise<CxLoyaltyReferralSummary[]> {
  const data = await portalRequest<{ referrals: CxLoyaltyReferralSummary[] }>(
    '/enterprise-customer-experience/portal/referrals',
    { accessToken },
  );
  return data.referrals;
}

export async function createCxPortalReferral(accessToken: string, referredEmail: string) {
  const data = await portalRequest<{ referral: CxLoyaltyReferralSummary }>(
    '/enterprise-customer-experience/portal/referrals',
    { method: 'POST', accessToken, body: { referredEmail } },
  );
  return data.referral;
}

export async function fetchCxEngagementPreferences(accessToken: string): Promise<CxEngagementPreferencesSummary> {
  const data = await portalRequest<{ preferences: CxEngagementPreferencesSummary }>(
    '/enterprise-customer-experience/portal/engagement-preferences',
    { accessToken },
  );
  return data.preferences;
}

export async function updateCxEngagementPreferences(
  accessToken: string,
  body: Partial<CxEngagementPreferencesSummary>,
) {
  const data = await portalRequest<{ preferences: CxEngagementPreferencesSummary }>(
    '/enterprise-customer-experience/portal/engagement-preferences',
    { method: 'PATCH', accessToken, body },
  );
  return data.preferences;
}

export async function fetchCxTechnicianTracking(accessToken: string, jobId: string): Promise<CxTechnicianTrackingSummary> {
  const data = await portalRequest<{ tracking: CxTechnicianTrackingSummary }>(
    `/enterprise-customer-experience/portal/tracking/${jobId}`,
    { accessToken },
  );
  return data.tracking;
}
