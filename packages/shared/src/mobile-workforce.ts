import type { JobSummary } from './jobs.js';
import type { NotificationSummary } from './mobile.js';
import type { IntelligenceGreeting } from './intelligence.js';
import type { Recommendation } from './intelligence.js';
import type { ScheduledJobEvent } from './scheduling.js';
import type {
  JobCompletionGateResult,
  JobCrewMemberSummary,
  JobExecutionException,
  JobExecutionPhase,
  JobMaterialLineSummary,
  JobVariationSummary,
  JobVehicleAssignmentSummary,
  JobWorkflowAction,
} from './job-execution.js';
import type { JobEvidencePhase } from './job-evidence.js';

export type MobileWorkforceRequestType =
  | 'inventory_allocation'
  | 'inventory_request'
  | 'inventory_shortage'
  | 'overtime_request'
  | 'schedule_change'
  | 'job_reschedule'
  | 'general_request';

export type MobileWorkforceRequestStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type MobileTimeEntryType =
  'clock_in' | 'clock_out' | 'break_start' | 'break_end' | 'travel' | 'job_time';

export type MobileDocumentationType =
  'photo' | 'video' | 'document' | 'inspection_form' | 'safety_checklist' | 'customer_signature';

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
  jobNumber: string | null;
  jobTitle: string | null;
  userId: string;
  userName: string;
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
  storageKey: string | null;
  checksumSha256: string | null;
  evidencePhase: JobEvidencePhase | null;
  hasBinary: boolean;
  /** Relative API path to fetch the stored binary, or null when no binary is stored. */
  downloadPath: string | null;
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
  navigationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MobileRouteSummary = {
  stopCount: number;
  nextDestination: MobileRouteStop | null;
  estimatedTravelMinutes: number | null;
  /** Honest label when live minutes are unavailable. */
  travelEstimateLabel: string | null;
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
    ignitionOn: boolean | null;
    /**
     * True only when this position belongs to the vehicle assigned to this
     * technician. A readable address is resolved for their own vehicle only —
     * technicians never get fleet-wide addresses from this surface.
     */
    isAssignedVehicle: boolean;
    licensePlate: string | null;
    address: import('./vehicle-position-address.js').VehiclePositionAddressResult;
  } | null;
  cartrackConnected: boolean;
  /** UX-I — never claim live Maps/Cartrack when provider path is absent. */
  mapsCapabilityState: import('./young-guns-ops.js').MapsEtaCapabilityState;
  mapsCapabilityLabel: string;
  etaSource: 'none' | 'schedule_only' | 'google_maps';
  liveTrackingAvailable: boolean;
};

export type TechnicianEnRouteConfirmResponse = {
  job: import('./jobs.js').JobDetail;
  eta: import('./technician-en-route-eta.js').TechnicianEnRouteEtaTruth;
  customerNotification: {
    status:
      | 'queued'
      | 'already_queued'
      | 'skipped_opt_out'
      | 'skipped_no_channel'
      | 'skipped_no_recipient';
    notificationId: string | null;
    messageBody: string;
  };
  vehicle: {
    id: string | null;
    name: string | null;
    licensePlate: string | null;
    positionUsed: boolean;
  };
  alreadyEnRoute: boolean;
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

export type MobileJobWorkspacePropertyHistoryEntry = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  completedAt: string | null;
};

export type MobileJobExecutionWorkspace = {
  jobId: string;
  jobNumber: string | null;
  jobType: string | null;
  priority: string;
  title: string;
  status: string;
  executionPhase: JobExecutionPhase;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  workInstructions: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  address: {
    display: string | null;
    street: string | null;
    suburb: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    unit: string | null;
  };
  /** Verified site geocode for technician map pin — not a live vehicle feed. */
  siteMap: {
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
    formattedAddress: string | null;
  };
  accessInstructions: string | null;
  siteContact: {
    name: string | null;
    mobile: string | null;
    email: string | null;
  };
  /** Internal work notes — office/technician only, never customer- or finance-facing. */
  internalNotes: string | null;
  customerVisibleNotes: string | null;
  navigationUrl: string | null;
  crew: JobCrewMemberSummary[];
  vehicle: JobVehicleAssignmentSummary | null;
  variations: JobVariationSummary[];
  materialLines: JobMaterialLineSummary[];
  exceptions: JobExecutionException[];
  availableActions: JobWorkflowAction[];
  completionGate: JobCompletionGateResult;
  propertyHistory: MobileJobWorkspacePropertyHistoryEntry[];
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
  metadata?: Record<string, unknown>;
  clientActionId?: string;
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
  /**
   * Legacy metadata-only path. Setting a phase on a photo/signature without binary evidence is
   * rejected — use the evidence upload endpoint (`UploadJobEvidenceRequest`) to attach a phase-gated file.
   */
  evidencePhase?: JobEvidencePhase;
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

export type MobileInventoryCatalogItem = {
  id: string;
  name: string;
  sku: string | null;
};

export type MobileInventoryCatalogLocation = {
  id: string;
  name: string;
  locationType: 'warehouse' | 'van' | 'other';
  vehicleId: string | null;
};

export type MobileWorkforceInventoryCentre = {
  alerts: MobileInventoryAlert[];
  recentUsage: MobileJobInventoryUsageSummary[];
  pendingUsageCount: number;
  /** UX-F / UX-042 — stock-linked material requests from the field. */
  catalogItems: MobileInventoryCatalogItem[];
  locations: MobileInventoryCatalogLocation[];
};

export type MobileWorkforceNotificationCentre = {
  notifications: NotificationSummary[];
  unreadCount: number;
};
