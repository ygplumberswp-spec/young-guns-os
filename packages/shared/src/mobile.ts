import type { CommunicationSummary } from './communications.js';
import type { DocumentSummary } from './documents.js';
import type { InvoiceSummary } from './finance.js';
import type {
  IntelligenceDashboard,
  IntelligenceGreeting,
  Recommendation,
} from './intelligence.js';
import type { JobDetail, JobSummary } from './jobs.js';
import type { PortalAccessPermission } from './portal.js';
import type { ScheduledJobEvent } from './scheduling.js';
import type { VehicleSummary } from './fleet.js';

export type NotificationType =
  | 'job_assigned'
  | 'schedule_changed'
  | 'approval_request'
  | 'invoice_reminder'
  | 'system_alert'
  | 'job_update'
  | 'quote_update'
  | 'appointment_update'
  | 'support_update'
  | 'urgent_dispatch'
  | 'inventory_request'
  | 'company_announcement'
  | 'quality_alert'
  | 'comeback_update'
  | 'warranty_update'
  | 'comm_intel_alert'
  | 'missed_call_alert'
  | 'asset_alert'
  | 'maintenance_update'
  | 'ai_orchestration_alert'
  | 'dispatch_alert'
  | 'fleet_alert'
  | 'personal_comm_alert'
  | 'security_alert';

export const NOTIFICATION_TYPE_OPTIONS: Array<{ value: NotificationType; label: string }> = [
  { value: 'job_assigned', label: 'Job assigned' },
  { value: 'schedule_changed', label: 'Schedule changed' },
  { value: 'approval_request', label: 'Approval request' },
  { value: 'invoice_reminder', label: 'Invoice reminder' },
  { value: 'system_alert', label: 'System alert' },
  { value: 'job_update', label: 'Job update' },
  { value: 'quote_update', label: 'Quote update' },
  { value: 'appointment_update', label: 'Appointment update' },
  { value: 'support_update', label: 'Support update' },
  { value: 'urgent_dispatch', label: 'Urgent dispatch' },
  { value: 'inventory_request', label: 'Inventory request' },
  { value: 'company_announcement', label: 'Company announcement' },
  { value: 'quality_alert', label: 'Quality alert' },
  { value: 'comeback_update', label: 'Comeback update' },
  { value: 'warranty_update', label: 'Warranty update' },
  { value: 'comm_intel_alert', label: 'Communications alert' },
  { value: 'missed_call_alert', label: 'Missed call alert' },
  { value: 'asset_alert', label: 'Asset alert' },
  { value: 'maintenance_update', label: 'Maintenance update' },
  { value: 'ai_orchestration_alert', label: 'AI orchestration alert' },
  { value: 'dispatch_alert', label: 'Dispatch alert' },
  { value: 'fleet_alert', label: 'Fleet alert' },
  { value: 'personal_comm_alert', label: 'Personal communications alert' },
  { value: 'security_alert', label: 'Security alert' },
];

export type MobileSyncScope = 'owner' | 'technician' | 'customer';

export type MobileQueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type MobileRole = 'owner' | 'technician' | 'customer';

export type NotificationSummary = {
  id: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationPreferenceSummary = {
  notificationType: NotificationType;
  enabled: boolean;
};

export type MobileSyncStateSummary = {
  scope: MobileSyncScope;
  deviceId: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
};

export type MobilePendingActionSummary = {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  status: MobileQueueStatus;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type MobileSyncProcessResult = {
  processed: number;
  failed: number;
  conflicts: number;
  retried: number;
};

export type MobileSyncQueueSummary = {
  id: string;
  resourceType: string;
  resourceId: string | null;
  status: MobileQueueStatus;
  queuedAt: string;
  processedAt: string | null;
  retryCount?: number;
  errorMessage?: string | null;
};

export type MobileOwnerDashboard = {
  greeting: IntelligenceGreeting;
  summary: Pick<
    IntelligenceDashboard,
    | 'todaysJobs'
    | 'outstandingInvoices'
    | 'pendingApprovals'
    | 'automationFailures'
    | 'fleetIssues'
    | 'revenue'
  >;
  recommendations: Recommendation[];
  alerts: MobileAlertSummary[];
  notifications: NotificationSummary[];
};

export type MobileTechnicianDashboard = {
  greeting: IntelligenceGreeting;
  todaysJobs: IntelligenceDashboard['todaysJobs'];
  upcomingSchedule: IntelligenceDashboard['upcomingSchedule'];
  fleetIssues: IntelligenceDashboard['fleetIssues'];
  recommendations: Recommendation[];
  assignedJobs: JobSummary[];
  notifications: NotificationSummary[];
};

export type MobileCustomerDashboard = {
  greeting: IntelligenceGreeting;
  customerName: string;
  companyName: string;
  permissions: PortalAccessPermission[];
  activeJobs: JobSummary[];
  recentInvoices: InvoiceSummary[];
  notifications: NotificationSummary[];
};

export type MobileAlertSummary = {
  id: string;
  type: 'automation_failure' | 'fleet_issue' | 'approval_request' | 'system_alert';
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type MobileApprovalSummary = {
  id: string;
  source: 'agent_task' | 'workflow_step' | 'whatsapp_draft';
  title: string;
  preview: string;
  status: string;
  createdAt: string;
};

export type MobileRevenueSummary = {
  revenueMtdCents: number;
  currency: string;
  openQuoteCount: number;
  invoiceCount: number;
  paymentCount: number;
};

export type MobileOwnerJobsOverview = {
  totalCount: number;
  activeCount: number;
  completedTodayCount: number;
  jobs: JobSummary[];
};

export type MobileTechnicianSchedule = {
  date: string;
  events: ScheduledJobEvent[];
};

export type MobileTechnicianCustomerDetails = {
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  job: JobDetail;
};

export type MobileTechnicianFleetInfo = {
  assignedVehicle: VehicleSummary | null;
  companyVehicles: VehicleSummary[];
};

export type MobileCustomerJobTracking = {
  jobs: JobSummary[];
};

export type MobileCustomerInvoices = {
  invoices: InvoiceSummary[];
};

export type MobileCustomerDocuments = {
  documents: DocumentSummary[];
};

export type MobileCustomerCommunications = {
  communications: CommunicationSummary[];
};

export type TechnicianJobAction =
  | 'accept_job'
  | 'start_job'
  | 'pause_job'
  | 'complete_job'
  | 'add_job_note'
  | 'submit_completion';

export type AddJobNoteRequest = {
  note: string;
};

export type SubmitJobCompletionRequest = {
  summary: string;
  checklist?: Record<string, boolean>;
  photoMetadata?: Array<{ filename: string; mimeType: string; sizeBytes: number }>;
};

export type UpdateNotificationPreferencesRequest = {
  preferences: Array<{ notificationType: NotificationType; enabled: boolean }>;
};

export type QueueMobileSyncRequest = {
  scope: MobileSyncScope;
  deviceId?: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
};

export type MobileAuraOwnerContext = {
  role: 'owner';
  summary: string;
  revenueMtdCents: number;
  currency: string;
  outstandingInvoiceCount: number;
  pendingApprovalCount: number;
  alertCount: number;
};

export type MobileAuraTechnicianContext = {
  role: 'technician';
  summary: string;
  nextJob: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    scheduledAt: string | null;
  } | null;
  assignedJobCount: number;
};

export type MobileAuraCustomerContext = {
  role: 'customer';
  summary: string;
  activeJob: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
  } | null;
  outstandingInvoiceCount: number;
};

export type MobileAuraContext =
  | MobileAuraOwnerContext
  | MobileAuraTechnicianContext
  | MobileAuraCustomerContext;
