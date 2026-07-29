import type { JobSummary } from './jobs.js';
import type { NotificationSummary } from './mobile.js';
import type { IntelligenceGreeting } from './intelligence.js';
import type { Recommendation } from './intelligence.js';
import type { ScheduledJobEvent } from './scheduling.js';

export type MobileWorkforceRequestType =
  | 'inventory_allocation'
  | 'inventory_request'
  | 'inventory_shortage'
  | 'overtime_request'
  | 'schedule_change'
  | 'general_request';

export type MobileWorkforceRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type MobileTimeEntryType =
  | 'clock_in'
  | 'clock_out'
  | 'break_start'
  | 'break_end'
  | 'travel'
  | 'job_time';

export type MobileDocumentationType =
  | 'photo'
  | 'video'
  | 'document'
  | 'inspection_form'
  | 'safety_checklist'
  | 'customer_signature';

export type MobileInventoryUsageStatus = 'pending_approval' | 'approved' | 'rejected' | 'executed';

export type MobileSyncConflictStatus = 'pending' | 'resolved' | 'failed';

export type MobileWorkforceRequestSummary = {
  id: string;
  requestType: MobileWorkforceRequestType;
  status: MobileWorkforceRequestStatus;
  subject: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileTimeEntrySummary = {
  id: string;
  entryType: MobileTimeEntryType;
  jobId: string | null;
  jobTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
};

export type MobileJobInventoryUsageSummary = {
  id: string;
  jobId: string;
  inventoryItemId: string;
  itemSku: string;
  itemName: string;
  quantity: number;
  status: MobileInventoryUsageStatus;
  scanCode: string | null;
  notes: string | null;
  createdAt: string;
};

export type MobileJobDocumentationSummary = {
  id: string;
  jobId: string;
  documentationType: MobileDocumentationType;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  content: string | null;
  createdAt: string;
};

export type MobileCompanyAnnouncementSummary = {
  id: string;
  title: string;
  body: string;
  announcementType: string;
  publishedAt: string;
  expiresAt: string | null;
};

export type MobileInventoryAlert = {
  itemId: string;
  sku: string;
  name: string;
  totalQuantityOnHand: number;
  reorderLevel: number;
};

export type MobileRouteStop = {
  jobId: string;
  title: string;
  customerName: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  sequence: number;
};

export type MobileRouteSummary = {
  stopCount: number;
  nextDestination: MobileRouteStop | null;
  estimatedTravelMinutes: number | null;
  assignedVehicleName: string | null;
  assignedVehiclePlate: string | null;
  stops: MobileRouteStop[];
};

export type MobileTravelHistoryEntry = {
  jobId: string | null;
  jobTitle: string | null;
  entryType: MobileTimeEntryType;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
};

export type MobileRouteIntelligence = {
  route: MobileRouteSummary;
  travelHistory: MobileTravelHistoryEntry[];
  latestGps: {
    latitude: number;
    longitude: number;
    recordedAt: string;
    speedKmh: number | null;
  } | null;
  cartrackConnected: boolean;
};

export type MobileWorkforceDashboard = {
  greeting: IntelligenceGreeting;
  assignedJobs: JobSummary[];
  todaysSchedule: ScheduledJobEvent[];
  upcomingSchedule: ScheduledJobEvent[];
  routeSummary: MobileRouteSummary;
  outstandingTaskCount: number;
  pendingRequestCount: number;
  inventoryAlerts: MobileInventoryAlert[];
  safetyNotices: MobileCompanyAnnouncementSummary[];
  companyAnnouncements: MobileCompanyAnnouncementSummary[];
  recommendations: Recommendation[];
  notifications: NotificationSummary[];
  unreadNotificationCount: number;
};

export type MobileJobExecutionWorkspace = {
  jobId: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  workInstructions: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  checklist: Record<string, boolean>;
  laborTimeEntries: MobileTimeEntrySummary[];
  materialsUsed: MobileJobInventoryUsageSummary[];
  documentation: MobileJobDocumentationSummary[];
  completionSummary: string | null;
};

export type MobileOfflineBundle = {
  jobs: JobSummary[];
  pendingActions: Array<{ id: string; actionType: string; entityId: string; status: string }>;
  queue: Array<{ id: string; resourceType: string; resourceId: string | null; status: string }>;
  conflicts: Array<{ id: string; resourceType: string; status: MobileSyncConflictStatus }>;
  syncState: { lastSyncedAt: string | null };
};

export type CreateMobileWorkforceRequest = {
  requestType: MobileWorkforceRequestType;
  subject: string;
  message: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

export type CreateMobileTimeEntryRequest = {
  entryType: MobileTimeEntryType;
  jobId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  notes?: string;
};

export type SubmitMobileInventoryUsageRequest = {
  inventoryItemId: string;
  quantity: number;
  scanCode?: string;
  notes?: string;
};

export type SubmitMobileJobDocumentationRequest = {
  documentationType: MobileDocumentationType;
  title: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type ReportMobileSyncConflictRequest = {
  queueItemId?: string;
  resourceType: string;
  resourceId?: string;
  clientVersion?: string;
  serverVersion?: string;
  clientPayload?: Record<string, unknown>;
  serverPayload?: Record<string, unknown>;
};

export type ResolveMobileSyncConflictRequest = {
  resolution: 'keep_client' | 'keep_server' | 'merge';
  notes?: string;
};

export type MobileWorkforceAuraContext = {
  summary: string;
  assignedJobCount: number;
  nextJobTitle: string | null;
  routeStopCount: number;
  pendingRequestCount: number;
  inventoryAlertCount: number;
  unreadNotificationCount: number;
  cartrackConnected: boolean;
};

export type MobileWorkforceJobList = {
  jobs: JobSummary[];
  activeCount: number;
  completedCount: number;
};

export type MobileWorkforceInventoryCentre = {
  alerts: MobileInventoryAlert[];
  recentUsage: MobileJobInventoryUsageSummary[];
  pendingUsageCount: number;
};

export type MobileWorkforceNotificationCentre = {
  notifications: NotificationSummary[];
  unreadCount: number;
};
