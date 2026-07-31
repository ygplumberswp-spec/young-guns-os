export type MobileDevicePlatform = 'ios' | 'android' | 'web' | 'pwa' | 'tablet';
export type MobileDeviceStatus = 'active' | 'inactive' | 'revoked' | 'lost';
export type MobileFleetProviderType =
  | 'cartrack'
  | 'netstar'
  | 'ctrack'
  | 'tracker'
  | 'mix_telematics'
  | 'geotab'
  | 'samsara'
  | 'verizon_connect'
  | 'wialon'
  | 'traccar'
  | 'generic_rest'
  | 'generic_mqtt';

export const MOBILE_FLEET_PROVIDER_TYPES: MobileFleetProviderType[] = [
  'cartrack',
  'netstar',
  'ctrack',
  'tracker',
  'mix_telematics',
  'geotab',
  'samsara',
  'verizon_connect',
  'wialon',
  'traccar',
  'generic_rest',
  'generic_mqtt',
];

export type MobileMediaType =
  'photo' | 'video' | 'document' | 'barcode' | 'qr_code' | 'signature' | 'voice_note';

export type MobileOfflineResourceType =
  | 'job'
  | 'customer'
  | 'quote'
  | 'invoice'
  | 'asset'
  | 'inventory'
  | 'vehicle'
  | 'timesheet'
  | 'inspection'
  | 'checklist'
  | 'document'
  | 'photo'
  | 'signature'
  | 'note'
  | 'form';

export const MOBILE_OFFLINE_RESOURCE_TYPES: MobileOfflineResourceType[] = [
  'job',
  'customer',
  'quote',
  'invoice',
  'asset',
  'inventory',
  'vehicle',
  'timesheet',
  'inspection',
  'checklist',
  'document',
  'photo',
  'signature',
  'note',
  'form',
];

export type MobilePlatformConfigSummary = {
  offlineRetentionDays: number;
  syncFrequencyMinutes: number;
  pushNotificationsEnabled: boolean;
  biometricLoginRequired: boolean;
  pwaEnabled: boolean;
  backgroundSyncEnabled: boolean;
  notificationPolicies: Record<string, unknown>;
  mobilePolicies: Record<string, unknown>;
};

export type MobileDeviceSummary = {
  id: string;
  userId: string | null;
  userName: string | null;
  deviceKey: string;
  deviceName: string | null;
  platform: MobileDevicePlatform;
  status: MobileDeviceStatus;
  appVersion: string | null;
  osVersion: string | null;
  encryptionVerified: boolean;
  lastSeenAt: string | null;
  registeredAt: string;
};

export type MobileSyncHistorySummary = {
  id: string;
  userId: string | null;
  deviceId: string | null;
  status: 'completed' | 'partial' | 'failed';
  processedCount: number;
  failedCount: number;
  conflictCount: number;
  retriedCount: number;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
};

export type MobileMediaAssetSummary = {
  id: string;
  jobId: string | null;
  mediaType: MobileMediaType;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string | null;
  version: number;
  createdAt: string;
};

export type MobileFleetTrackingProviderSummary = {
  id: string;
  providerType: MobileFleetProviderType;
  name: string;
  isActive: boolean;
  endpointUrl: string | null;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  vehicleMappingCount: number;
};

export type MobileFieldIntelligenceSummary = {
  technicianProductivityScore: number | null;
  travelEfficiencyScore: number | null;
  avgJobDurationMinutes: number | null;
  firstTimeFixRate: number | null;
  offlineUsageCount: number;
  syncHealthScore: number | null;
  deviceHealthScore: number | null;
  fleetUtilizationPercent: number | null;
  safetyComplianceScore: number | null;
  capturedAt: string | null;
};

export type MobileDispatcherTechnicianStatus = {
  userId: string;
  userName: string;
  assignedJobCount: number;
  activeJobTitle: string | null;
  lastSyncAt: string | null;
  deviceStatus: MobileDeviceStatus | null;
};

export type MobileDispatcherWorkspace = {
  summary: string;
  technicianStatuses: MobileDispatcherTechnicianStatus[];
  pendingDispatchCount: number;
  fleetVehicleCount: number;
  activeTrackingProvider: MobileFleetProviderType | null;
  incidentAlertCount: number;
  recommendations: string[];
};

export type EnterpriseMobilePlatformDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: MobilePlatformConfigSummary;
  devices: MobileDeviceSummary[];
  activeDeviceCount: number;
  syncHistory: MobileSyncHistorySummary[];
  pendingSyncQueueCount: number;
  pendingConflictCount: number;
  fleetProviders: MobileFleetTrackingProviderSummary[];
  fieldIntelligence: MobileFieldIntelligenceSummary | null;
  recentMediaAssets: MobileMediaAssetSummary[];
  offlineResourceTypes: MobileOfflineResourceType[];
  cartrackConnected: boolean;
};

export type EnterpriseMobilePlatformAuraContext = {
  summary: string;
  assignedJobCount: number;
  activeDeviceCount: number;
  pendingSyncCount: number;
  pendingConflictCount: number;
  fleetProviderCount: number;
  cartrackConnected: boolean;
};

export type RegisterMobileDeviceRequest = {
  deviceKey: string;
  deviceName?: string;
  platform?: MobileDevicePlatform;
  appVersion?: string;
  osVersion?: string;
  encryptionVerified?: boolean;
};

export type RegisterMobilePushTokenRequest = {
  deviceId: string;
  token: string;
  provider?: string;
};

export type CreateMobileMediaAssetRequest = {
  jobId?: string;
  mediaType: MobileMediaType;
  title: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  storageKey?: string;
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
};

export type CreateMobileFleetProviderRequest = {
  providerType: MobileFleetProviderType;
  name: string;
  endpointUrl?: string;
  credentialsVaultKey?: string;
  vehicleMapping?: Record<string, unknown>;
  isActive?: boolean;
};

export type UpdateMobilePlatformConfigRequest = {
  offlineRetentionDays?: number;
  syncFrequencyMinutes?: number;
  pushNotificationsEnabled?: boolean;
  biometricLoginRequired?: boolean;
  pwaEnabled?: boolean;
  backgroundSyncEnabled?: boolean;
  notificationPolicies?: Record<string, unknown>;
  mobilePolicies?: Record<string, unknown>;
};

export type ResolveMobileOfflineConflictRequest = {
  resolution: 'keep_server' | 'keep_client' | 'merge';
  notes?: string;
};
