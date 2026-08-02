export type IntegrationProvider =
  | 'cartrack'
  | 'xero'
  | 'email'
  | 'yoco'
  | 'whatsapp'
  | 'google_calendar'
  | 'google_maps'
  | 'microsoft_365'
  | 'resend'
  | 'custom';

/**
 * Honesty-only synthetic providers (Decision 6 / UX-G). These never map to a
 * real backend connector and must never appear in `IntegrationProvider`
 * columns/enums — they exist only as dashboard-status pseudo-entries so the
 * UI can render an honest "NOT IMPLEMENTED" card instead of hiding them.
 */
export type HonestyOnlyIntegrationProvider = 'gmail' | 'n8n'; // n8n remains in union for Integrations status card; not honesty-only after UX-J

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
    name: 'WhatsApp Business',
    description: 'WhatsApp Business API for customer messaging and notifications.',
    category: 'communications',
    availability: 'available',
    settingsPath: '/integrations/whatsapp',
    supportsSync: false,
    supportsWebhooks: true,
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Calendar sync for scheduling and appointment coordination.',
    category: 'communications',
    availability: 'planned',
    settingsPath: null,
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
    availability: 'planned',
    settingsPath: null,
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
  syncedAt: string;
  syncJobId?: string;
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
  }>;
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

export type YocoConnectionSummary = {
  provider: 'yoco';
  status: IntegrationConnectionStatus;
  environment: 'test' | 'live';
  secretKeyHint: string | null;
  businessName: string | null;
  businessId: string | null;
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
  environment: 'test' | 'live';
  syncedAt: string;
  syncJobId?: string;
};
