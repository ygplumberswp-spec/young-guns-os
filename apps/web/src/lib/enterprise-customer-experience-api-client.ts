import { request, ApiClientError } from './api-client';
import type {
  CxAppointmentBookingSummary,
  CxPlatformConfigSummary,
  CxReviewFeedbackSummary,
  EnterpriseCustomerExperienceDashboard,
  UpdateCxPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseCustomerExperienceApiClientError };

export async function fetchCustomerExperienceDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseCustomerExperienceDashboard }>(
    '/enterprise-customer-experience/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureCustomerExperienceAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-customer-experience/analytics/capture',
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.analytics;
}

export async function updateCustomerExperiencePlatformConfig(
  accessToken: string,
  body: UpdateCxPlatformConfigRequest,
) {
  const data = await request<{ platformConfig: CxPlatformConfigSummary }>(
    '/enterprise-customer-experience/platform-config',
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.platformConfig;
}

export async function approveCustomerBooking(accessToken: string, bookingId: string) {
  const data = await request<{ booking: CxAppointmentBookingSummary }>(
    `/enterprise-customer-experience/bookings/${bookingId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.booking;
}

export async function confirmCustomerBooking(accessToken: string, bookingId: string) {
  const data = await request<{ booking: CxAppointmentBookingSummary }>(
    `/enterprise-customer-experience/bookings/${bookingId}/confirm`,
    { method: 'POST', accessToken },
  );
  return data.booking;
}

export async function updateCustomerReviewStatus(
  accessToken: string,
  reviewId: string,
  body: { status: 'acknowledged' | 'resolved' | 'closed'; resolutionNotes?: string },
) {
  const data = await request<{ review: CxReviewFeedbackSummary }>(
    `/enterprise-customer-experience/reviews/${reviewId}/status`,
    { method: 'PATCH', accessToken, body },
  );
  return data.review;
}
