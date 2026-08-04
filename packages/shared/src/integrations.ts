export type IntegrationProvider =
  | 'cartrack'
  | 'xero'
  | 'email'
  | 'yoco'
  | 'whatsapp'
  | 'google_calendar'
  | 'google_maps'
  | 'gmail'
  | 'microsoft_365'
  | 'resend'
  | 'custom';

/**
 * Non-enum provider ids that may appear on Integrations status cards only.
 * Gmail graduated to a real OAuth connector (Communications Platform).
 * n8n is Automation-owned (UX-J) and still widens IntegrationProviderStatus.
 */
export type HonestyOnlyIntegrationProvider = 'n8n';

export type IntegrationConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error';

export type IntegrationMappingStatus = 'unmapped' | 'mapped' | 'ignored';

export type IntegrationProviderCategory =
  | 'fleet'
  | 'accounting'
  | 'communications'
  | 'payments'
  | 'automation';

export type IntegrationProviderAvailability = 'available' | 'planned';

export type IntegrationSyncJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type IntegrationSyncJobType = 'manual' | 'scheduled';

export type IntegrationWebhookEventStatus = 'received' | 'processed' | 'failed' | 'ignored';

export const INTEGRATION_CONNECTION_STATUS_OPTIONS: Array<{
  value: IntegrationConnectionStatus;
  label: string;
}> = [
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'pending', label: 'Pending' },
  { value: 'connected', label: 'Connected' },
  { value: 'error', label: 'Error' },
];

export const INTEGRATION_SYNC_JOB_STATUS_OPTIONS: Array<{
  value: IntegrationSyncJobStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const INTEGRATION_WEBHOOK_EVENT_STATUS_OPTIONS: Array<{
  value: IntegrationWebhookEventStatus;
  label: string;
}> = [
  { value: 'received', label: 'Received' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
  { value: 'ignored', label: 'Ignored' },
];

export type IntegrationProviderRegistryEntry = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  category: IntegrationProviderCategory;
  availability: IntegrationProviderAvailability;
  settingsPath: string | null;
  supportsSync: boolean;
  supportsWebhooks: boolean;
};

export const INTEGRATION_PROVIDER_REGISTRY: IntegrationProviderRegistryEntry[] = [
  {
    provider: 'cartrack',
    name: 'Cartrack',
    description: 'Fleet GPS tracking and vehicle telematics integration.',
    category: 'fleet',
    availability: 'available',
    settingsPath: '/integrations/cartrack',
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'xero',
    name: 'Xero',
    description: 'Accounting connection for organisation verification and future finance sync.',
    category: 'accounting',
    availability: 'available',
    settingsPath: '/integrations/xero',
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'email',
    name: 'Email (SMTP)',
    description: 'Transactional email delivery via your SMTP provider.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/integrations/email',
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'yoco',
    name: 'Yoco',
    description: 'Payment provider connection for business verification and future payment flows.',
    category: 'payments',
    availability: 'available',
    settingsPath: '/integrations/yoco',
    supportsSync: true,
    supportsWebhooks: true,
  },
  {
    provider: 'whatsapp',
    name: 'Business WhatsApp',
    description:
      'Connect your Meta WhatsApp Business account for customer messaging, notifications and AI communications.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/integrations/whatsapp',
    supportsSync: false,
    supportsWebhooks: true,
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description:
      'Google Calendar via official Google OAuth — mirrors TITAN jobs, imports Google events as external entries, and flags scheduling conflicts for review.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/integrations/google-calendar',
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'google_maps',
    name: 'Google Maps',
    description:
      'Google Maps Platform — Places, Geocoding, Directions, Distance Matrix, and Maps JavaScript.',
    category: 'fleet',
    availability: 'available',
    settingsPath: '/integrations/google-maps',
    supportsSync: false,
    supportsWebhooks: false,
  },
  {
    provider: 'gmail',
    name: 'Business Gmail',
    description:
      'Business Gmail via official Google OAuth — Inbox, Sent, Drafts, Labels, sync, and approved sends.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/communications-hub',
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'microsoft_365',
    name: 'Microsoft 365',
    description: 'Microsoft 365 integration for email, calendar, and productivity.',
    category: 'communications',
    availability: 'planned',
    settingsPath: null,
    supportsSync: true,
    supportsWebhooks: false,
  },
  {
    provider: 'resend',
    name: 'Resend',
    description: 'Transactional email delivery via Resend API.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/integrations/resend',
    supportsSync: true,
    supportsWebhooks: true,
  },
  {
    provider: 'custom',
    name: 'Custom Integration',
    description: 'Tenant-defined custom API integration.',
    category: 'communications',
    availability: 'planned',
    settingsPath: null,
    supportsSync: true,
    supportsWebhooks: true,
  },
];

export function getIntegrationProviderRegistryEntry(
  provider: IntegrationProvider,
): IntegrationProviderRegistryEntry | undefined {
  return INTEGRATION_PROVIDER_REGISTRY.find((entry) => entry.provider === provider);
}

export type IntegrationProviderStatus = Omit<IntegrationProviderRegistryEntry, 'provider'> & {
  /** Widened to include honesty-only synthetic providers (Decision 6 / UX-G). */
  provider: IntegrationProvider | HonestyOnlyIntegrationProvider;
  connectionId: string | null;
  connectionStatus: IntegrationConnectionStatus;
  isConfigured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  /** Decision 4 / UX-G — sole source of truth for UI capability labels. */
  capabilityState: import('./integration-capability.js').IntegrationCapabilityState;
  capabilityLabel: import('./integration-capability.js').IntegrationCapabilityStateLabel;
  /** When false, Connect/Send must be disabled. */
  canConnect: boolean;
  canSend: boolean;
  /** True for synthetic honesty-only cards (gmail, n8n) with no real backend. */
  honestyOnly?: boolean;
};

export type IntegrationHubStats = {
  providerCount: number;
  configuredConnectionCount: number;
  connectedCount: number;
  errorCount: number;
  syncJobCount: number;
  activeSyncJobCount: number;
  webhookEndpointCount: number;
  activeWebhookEndpointCount: number;
  webhookEventCount: number;
};

export type IntegrationHubDashboard = {
  stats: IntegrationHubStats;
  providers: IntegrationProviderStatus[];
  recentSyncJobs: IntegrationSyncJobSummary[];
  recentWebhookEvents: IntegrationWebhookEventSummary[];
};

export type IntegrationSyncJobSummary = {
  id: string;
  provider: IntegrationProvider;
  providerName: string;
  jobType: IntegrationSyncJobType;
  status: IntegrationSyncJobStatus;
  syncScope: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  connectionId: string | null;
};

export type IntegrationSyncJobDetail = IntegrationSyncJobSummary & {
  resultSummary: Record<string, unknown> | null;
};

export type IntegrationWebhookEndpointSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationWebhookEndpointDetail = IntegrationWebhookEndpointSummary & {
  secret?: string;
};

export type IntegrationWebhookEventSummary = {
  id: string;
  endpointId: string | null;
  endpointName: string | null;
  provider: IntegrationProvider | null;
  eventType: string;
  status: IntegrationWebhookEventStatus;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
};

export type CreateIntegrationWebhookEndpointRequest = {
  name: string;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateIntegrationWebhookEndpointRequest = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

export type IntegrationSyncHealth = 'healthy' | 'degraded' | 'failed' | 'unknown';

export type CartrackConnectionSummary = {
  provider: 'cartrack';
  status: IntegrationConnectionStatus;
  baseUrl: string | null;
  usernameHint: string | null;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  lastCredentialChangeAt: string | null;
  nextScheduledSyncAt: string | null;
  syncHealth: IntegrationSyncHealth;
  mappedVehicleCount: number;
  unmappedVehicleCount: number;
  positionCount: number;
};

export type SaveCartrackConnectionRequest = {
  baseUrl: string;
  username: string;
  password: string;
};

export type IntegrationVehicleMappingSummary = {
  id: string;
  externalVehicleId: string;
  externalRegistration: string | null;
  externalName: string | null;
  status: IntegrationMappingStatus;
  reviewCategory: import('./vehicle-registration.js').IntegrationMappingReviewCategory;
  reviewLabel: string;
  vehicleId: string | null;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
};

export type ValidateCartrackCredentialsRequest = SaveCartrackConnectionRequest;

export type ValidateCartrackCredentialsResult = {
  valid: boolean;
  message: string;
};

export type UpdateIntegrationVehicleMappingRequest = {
  vehicleId?: string | null;
  status?: IntegrationMappingStatus;
};

export type CartrackSyncResult = {
  externalVehicleCount: number;
  mappingsCreated: number;
  mappingsUpdated: number;
  autoMappedCount: number;
  positionsStored: number;
  /**
   * Polls that returned a position TITAN had already stored. Cartrack repeats its last
   * known reading, so this being the common case is normal and not a failure.
   */
  positionsUnchanged: number;
  syncedAt: string;
  syncJobId?: string;
  /**
   * True when the provider call was slow/failed and TITAN kept the last stored snapshot
   * instead of inventing positions or blanking the fleet map.
   */
  degraded?: boolean;
  failedEndpoint?: string | null;
  timeoutMessage?: string | null;
  showingCachedSnapshot?: boolean;
};

/** Honest provider-refresh state for fleet surfaces when Cartrack is slow or partial. */
export type CartrackProviderRefreshState = {
  status: 'ok' | 'degraded' | 'unavailable';
  lastSuccessfulAt: string | null;
  dataAgeMs: number | null;
  failedEndpoint: string | null;
  timeoutMessage: string | null;
  showingCachedSnapshot: boolean;
};

export type FleetTrackingContext = {
  cartrackStatus: IntegrationConnectionStatus;
  cartrackConnected: boolean;
  /** True when encrypted Cartrack credentials exist for this tenant. */
  hasCredentials: boolean;
  /** Honest capability state — never claim live/usable without a real connection. */
  capabilityState: import('./integration-capability.js').IntegrationCapabilityState;
  /** Operator-facing connection/sync state for fleet UI. */
  connectionDisplayState: import('./fleet-tracking.js').FleetConnectionDisplayState;
  mappedVehicleCount: number;
  unmappedVehicleCount: number;
  positionCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** False when credentials missing or connection is not usable for live polling. */
  livePollingAllowed: boolean;
  /**
   * How often TITAN polls Cartrack, from the connector's own schedule. Surfaces must
   * state this rather than implying a streaming connection.
   */
  syncIntervalMs: number | null;
  /** Present when the latest provider refresh was slow, partial, or unavailable. */
  providerRefresh: CartrackProviderRefreshState;
  latestPositions: Array<{
    vehicleId: string | null;
    vehicleName: string | null;
    licensePlate: string | null;
    make: string | null;
    model: string | null;
    assignedUserName: string | null;
    driverName: string | null;
    externalVehicleId: string;
    latitude: number;
    longitude: number;
    speedKmh: number | null;
    heading: number | null;
    ignitionOn: boolean | null;
    odometerKm: number | null;
    recordedAt: string;
    /**
     * Readable address for the coordinates above. Preferred source is Cartrack's own
     * `position_description`, which arrives with the telemetry; Google reverse-geocoding
     * is the fallback. Derived either way — the coordinates stay the source of truth, and
     * `unresolved` carries the real reason so surfaces fall back to coordinates rather
     * than showing a blank.
     */
    address: import('./vehicle-position-address.js').VehiclePositionAddressResult;
    /**
     * Full parsed provider reading. Each field is a real Cartrack value or an
     * `unavailable` reason — never a default — so a surface can show road speed,
     * ignition, odometer and driver only where the account actually supplies them.
     */
    telemetry: import('./cartrack-telemetry.js').CartrackVehicleTelemetry;
    /** Real TITAN job this vehicle is assigned to right now, when there is one. */
    assignedJob: { id: string; reference: string } | null;
  }>;
};

/** One stored Cartrack reading for a single vehicle, used to draw the follow trail. */
export type FleetVehicleTrailResponse = {
  vehicleId: string;
  licensePlate: string | null;
  cartrackConnected: boolean;
  syncIntervalMs: number | null;
  points: Array<{
    latitude: number;
    longitude: number;
    recordedAt: string;
    speedKmh: number | null;
  }>;
  /** Distinct reported positions before the display cap was applied. */
  distinctPositionCount: number;
};

export type XeroConnectionSummary = {
  provider: 'xero';
  status: IntegrationConnectionStatus;
  oauthConfigured: boolean;
  organisationName: string | null;
  organisationId: string | null;
  baseCurrency: string | null;
  hasCredentials: boolean;
  reconnectRequired: boolean;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type XeroConnectionTestResult = {
  organisationName: string;
  organisationId: string;
  baseCurrency: string | null;
  verifiedAt: string;
};

export type StartXeroOAuthRequest = {
  returnPath?: string | null;
};

export type StartXeroOAuthResponse = {
  authorizationUrl: string;
};

export type XeroSyncResult = {
  organisationName: string;
  organisationId: string;
  baseCurrency: string | null;
  syncedAt: string;
  syncJobId?: string;
  /** True when a Xero data import job was also queued after organisation verify. */
  queued?: boolean;
  message?: string;
};

export type EmailConnectionSummary = {
  provider: 'email';
  status: IntegrationConnectionStatus;
  host: string | null;
  port: number | null;
  secure: boolean;
  usernameHint: string | null;
  fromEmail: string | null;
  fromName: string | null;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type SaveEmailConnectionRequest = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string | null;
};

export type EmailSyncResult = {
  verified: true;
  fromEmail: string;
  host: string;
  syncedAt: string;
  syncJobId?: string;
};

export type YocoWebhookCapability = 'available' | 'unavailable' | 'unknown';

export type YocoConnectionSummary = {
  provider: 'yoco';
  status: IntegrationConnectionStatus;
  environment: 'test' | 'live';
  secretKeyHint: string | null;
  /**
   * Display label for the connected Checkout account (not a Yoco business-profile name).
   * Example: "Yoco Checkout (test)".
   */
  businessName: string | null;
  /**
   * Safe key fingerprint used as a stable account identifier (not a Yoco business id).
   */
  businessId: string | null;
  keyFingerprint: string | null;
  webhookCapability: YocoWebhookCapability | null;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type SaveYocoConnectionRequest = {
  secretKey: string;
  environment?: 'test' | 'live';
};

export type YocoSyncResult = {
  businessName: string;
  businessId: string;
  keyFingerprint: string;
  webhookCapability: YocoWebhookCapability;
  environment: 'test' | 'live';
  syncedAt: string;
  syncJobId?: string;
};

/** Transactional email purposes supported by the Resend delivery layer. */
export type ResendEmailPurpose =
  | 'customer_quote'
  | 'invoice'
  | 'payment_receipt'
  | 'job_confirmation'
  | 'appointment_reminder'
  | 'maintenance_reminder'
  | 'system_notification'
  | 'outbound_message';

export type ResendDeliveryStatus = 'sent' | 'delivered' | 'failed';

export type ResendConnectionSummary = {
  provider: 'resend';
  status: IntegrationConnectionStatus;
  /** True when status is connected and encrypted API key is present. */
  connected: boolean;
  fromEmail: string | null;
  fromName: string | null;
  apiKeyHint: string | null;
  hasCredentials: boolean;
  /** True when a Svix/Resend webhook signing secret (`whsec_…`) is stored. */
  hasWebhookSecret: boolean;
  /** Public inbound webhook URL owners should register in Resend. */
  webhookUrl: string | null;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: ResendDeliveryStatus | null;
  lastDeliveryError: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  /** Runtime gate: PROVIDERS_ENABLED && EMAIL_SENDING_ENABLED. */
  emailSendingEnabled: boolean;
};

export type SaveResendConnectionRequest = {
  /** Required on first connect; optional when updating from/webhook only. */
  apiKey?: string;
  fromEmail: string;
  fromName?: string | null;
  /** Resend webhook signing secret (`whsec_…`) for delivery events. */
  webhookSecret?: string | null;
};

export type ResendSyncResult = {
  verified: true;
  fromEmail: string;
  domainCount: number;
  syncedAt: string;
  syncJobId?: string;
};

export type ResendDeliverySummary = {
  id: string;
  purpose: ResendEmailPurpose;
  toEmail: string;
  subject: string;
  status: ResendDeliveryStatus;
  resendEmailId: string | null;
  communicationId: string | null;
  failureReason: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
};
