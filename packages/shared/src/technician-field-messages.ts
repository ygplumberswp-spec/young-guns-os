/**
 * Technician Field Messages — authorised job/dispatch/site threads only.
 * Not interchangeable with Notifications; never the company Communications Hub.
 */

export const TECHNICIAN_FIELD_MESSAGES_PATH = '/mobile/messages' as const;
export const TECHNICIAN_NOTIFICATIONS_PATH = '/mobile/notifications' as const;

/** Surfaces allowed inside Technician Messages. */
export const TECHNICIAN_FIELD_MESSAGE_SCOPES = [
  'assigned_jobs',
  'dispatch_office_requests',
  'authorised_customer_site_via_job_card',
] as const;

export type TechnicianFieldMessageScope = (typeof TECHNICIAN_FIELD_MESSAGE_SCOPES)[number];

/** Explicitly out of scope for Technician Messages. */
export const TECHNICIAN_FIELD_MESSAGE_EXCLUSIONS = [
  'communications_hub',
  'crm_inbox',
  'company_wide_threads',
  'unrelated_jobs',
  'owner_executive_alerts',
] as const;

/** Notification types that may appear as field-ops alerts (Notifications surface). */
export const TECHNICIAN_FIELD_NOTIFICATION_TYPES = [
  'job_assigned',
  'schedule_changed',
  'urgent_dispatch',
  'dispatch_alert',
  'job_update',
  'approval_request',
  'inventory_request',
  'system_alert',
  'quality_alert',
  'company_announcement',
] as const;
