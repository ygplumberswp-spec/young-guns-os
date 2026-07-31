import type {
  AssetEquipmentSummary,
  AssetMaintenanceRecordSummary,
  AssetMaintenanceScheduleSummary,
} from './asset-equipment.js';

export type AlOwnershipType = 'customer_owned' | 'company_owned';

export type AlLifecycleStage =
  | 'procurement'
  | 'delivery'
  | 'installation'
  | 'commissioning'
  | 'active_operation'
  | 'inspection'
  | 'maintenance'
  | 'repair'
  | 'upgrade'
  | 'transfer'
  | 'decommissioning'
  | 'disposal';

export type AlLifecycleStageStatus =
  'draft' | 'pending_approval' | 'approved' | 'executed' | 'cancelled';

export type AlIotProviderType =
  | 'mqtt'
  | 'http_rest'
  | 'webhook'
  | 'modbus'
  | 'lorawan'
  | 'azure_iot'
  | 'aws_iot'
  | 'thingsboard'
  | 'particle'
  | 'siemens'
  | 'schneider'
  | 'bosch'
  | 'custom';

export const AL_IOT_PROVIDER_TYPES: AlIotProviderType[] = [
  'mqtt',
  'http_rest',
  'webhook',
  'modbus',
  'lorawan',
  'azure_iot',
  'aws_iot',
  'thingsboard',
  'particle',
  'siemens',
  'schneider',
  'bosch',
  'custom',
];

export type AlTelemetryField =
  | 'temperature'
  | 'pressure'
  | 'flow'
  | 'voltage'
  | 'current'
  | 'power'
  | 'energy_usage'
  | 'vibration'
  | 'humidity'
  | 'water_level'
  | 'fuel_level'
  | 'runtime'
  | 'starts_stops'
  | 'fault_code'
  | 'battery_level'
  | 'signal_strength'
  | 'gps_position'
  | 'device_health'
  | 'custom';

export const AL_TELEMETRY_FIELDS: AlTelemetryField[] = [
  'temperature',
  'pressure',
  'flow',
  'voltage',
  'current',
  'power',
  'energy_usage',
  'vibration',
  'humidity',
  'water_level',
  'fuel_level',
  'runtime',
  'starts_stops',
  'fault_code',
  'battery_level',
  'signal_strength',
  'gps_position',
  'device_health',
  'custom',
];

export type AlAlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type AlAlertStatus =
  'open' | 'acknowledged' | 'assigned' | 'escalated' | 'resolved' | 'closed';
export type AlAlertType =
  | 'high_temperature'
  | 'low_pressure'
  | 'abnormal_flow'
  | 'high_energy_usage'
  | 'vibration_anomaly'
  | 'water_leak'
  | 'equipment_offline'
  | 'sensor_failure'
  | 'battery_low'
  | 'warranty_risk'
  | 'maintenance_overdue'
  | 'critical_fault_code'
  | 'custom';

export type AlPlatformConfigSummary = {
  globalPolicies: Record<string, unknown>;
  iotAdapterTemplates: Record<string, unknown>;
  telemetryStandards: Record<string, unknown>;
  retentionPolicies: Record<string, unknown>;
  defaultAlertPolicies: Record<string, unknown>;
};

export type AlAssetCategorySummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AlAssetRegistryProfileSummary = {
  id: string;
  assetId: string;
  categoryId: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  ownershipType: AlOwnershipType;
  customerId: string | null;
  propertyId: string | null;
  manufacturer: string | null;
  model: string | null;
  installationDate: string | null;
  commissioningDate: string | null;
  warrantyDetails: Record<string, unknown>;
  criticality: string | null;
  lifecycleStage: AlLifecycleStage;
};

export type AlAssetRegistryEntry = AssetEquipmentSummary & {
  profile: AlAssetRegistryProfileSummary | null;
};

export type AlLifecycleStageHistorySummary = {
  id: string;
  assetId: string;
  stage: AlLifecycleStage;
  status: AlLifecycleStageStatus;
  title: string;
  description: string | null;
  responsibleUserId: string | null;
  costCents: number | null;
  occurredAt: string;
  createdAt: string;
};

export type AlIotProviderAdapterSummary = {
  id: string;
  providerType: AlIotProviderType;
  providerKey: string;
  name: string;
  status: 'active' | 'inactive' | 'testing' | 'error';
  endpointUrl: string | null;
  isPrimary: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
};

export type AlIotDeviceSummary = {
  id: string;
  assetId: string | null;
  assetName: string | null;
  providerAdapterId: string | null;
  externalDeviceId: string;
  deviceName: string;
  isActive: boolean;
  lastSeenAt: string | null;
  connectivityStatus: string | null;
  batteryLevel: number | null;
  signalStrength: number | null;
};

export type AlTelemetryReadingSummary = {
  id: string;
  deviceId: string;
  assetId: string | null;
  field: AlTelemetryField;
  customFieldName: string | null;
  normalizedValue: number;
  unit: string | null;
  quality: string;
  recordedAt: string;
};

export type AlAssetAlertSummary = {
  id: string;
  assetId: string | null;
  deviceId: string | null;
  alertType: AlAlertType;
  severity: AlAlertSeverity;
  status: AlAlertStatus;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type AlPreventiveMaintenanceDueSummary = {
  id: string;
  assetId: string;
  title: string;
  dueReason: string;
  status: string;
  dueAt: string | null;
};

export type AlPredictiveAssessmentSummary = {
  id: string;
  assetId: string;
  status: string;
  failureRiskScore: number | null;
  remainingUsefulLifeDays: number | null;
  maintenanceRecommendation: string | null;
  inspectionRecommendation: string | null;
  partsRecommendation: string | null;
  confidenceScore: number | null;
  explanation: string | null;
  createdAt: string;
};

export type AlWarrantyComplianceSummary = {
  id: string;
  assetId: string;
  warrantyStatus: string;
  expiresAt: string | null;
  serviceIntervalDays: number | null;
  complianceInspectionDueAt: string | null;
  recallNotice: string | null;
  manufacturerNotice: string | null;
};

export type AlWorkOrderDraftSummary = {
  id: string;
  assetId: string | null;
  alertId: string | null;
  draftType: string;
  status: string;
  subject: string;
  description: string | null;
  createdAt: string;
};

export type AlAnalyticsSummary = {
  assetUptimePercent: number | null;
  downtimeHours: number | null;
  failureRate: number | null;
  mtbfHours: number | null;
  mttrHours: number | null;
  maintenanceCostCents: number;
  energyUsageKwh: number | null;
  predictiveRiskAvg: number | null;
  deviceConnectivityPercent: number | null;
  alertResponseTimeHours: number | null;
  capturedAt: string | null;
};

export type AlIotMonitoringSummary = {
  deviceCount: number;
  connectedDeviceCount: number;
  recentReadings: AlTelemetryReadingSummary[];
  openAlertCount: number;
  thresholdBreaches: number;
};

export type EnterpriseAssetLifecycleDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: AlPlatformConfigSummary;
  assetCount: number;
  registryProfileCount: number;
  categoryCount: number;
  iotDeviceCount: number;
  activeProviderCount: number;
  openAlertCount: number;
  maintenanceDueCount: number;
  predictiveAssessmentCount: number;
  analytics: AlAnalyticsSummary;
  recentAssets: AlAssetRegistryEntry[];
  recentAlerts: AlAssetAlertSummary[];
  recentTelemetry: AlTelemetryReadingSummary[];
  iotProviders: AlIotProviderAdapterSummary[];
  maintenanceDue: AlPreventiveMaintenanceDueSummary[];
  predictiveAssessments: AlPredictiveAssessmentSummary[];
  workOrderDrafts: AlWorkOrderDraftSummary[];
  digitalTwinConnected: boolean;
};

export type EnterpriseAssetLifecycleAuraContext = {
  assetCount: number;
  openAlertCount: number;
  maintenanceDueCount: number;
  iotDeviceCount: number;
  predictiveAssessmentCount: number;
  recentAlerts: Array<{ title: string; severity: AlAlertSeverity; status: AlAlertStatus }>;
};

export type CreateAlAssetCategoryRequest = {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateAlAssetRegistryProfileRequest = {
  assetId: string;
  categoryId?: string;
  customCategoryName?: string;
  ownershipType?: AlOwnershipType;
  customerId?: string;
  propertyId?: string;
  manufacturer?: string;
  model?: string;
  installationDate?: string;
  commissioningDate?: string;
  warrantyDetails?: Record<string, unknown>;
  criticality?: string;
  lifecycleStage?: AlLifecycleStage;
};

export type CreateAlIotProviderAdapterRequest = {
  providerType: AlIotProviderType;
  providerKey: string;
  name: string;
  endpointUrl?: string;
  credentialsVaultKey?: string;
  isPrimary?: boolean;
  pollingIntervalSeconds?: number;
  config?: Record<string, unknown>;
};

export type CreateAlIotDeviceRequest = {
  providerAdapterId?: string;
  assetId?: string;
  externalDeviceId: string;
  deviceName: string;
  telemetryFieldMap?: Record<string, unknown>;
  thresholdConfig?: Record<string, unknown>;
};

export type IngestAlTelemetryRequest = {
  deviceId: string;
  field: AlTelemetryField;
  normalizedValue: number;
  unit?: string;
  quality?: 'good' | 'uncertain' | 'bad' | 'unknown';
  customFieldName?: string;
  rawPayloadRef?: string;
  recordedAt?: string;
};

export type CreateAlLifecycleStageRequest = {
  assetId: string;
  stage: AlLifecycleStage;
  title: string;
  description?: string;
  requiresApproval?: boolean;
  costCents?: number;
};

export type CreateAlWorkOrderDraftRequest = {
  assetId?: string;
  alertId?: string;
  draftType:
    | 'inspection_request'
    | 'maintenance_job'
    | 'emergency_job'
    | 'technician_assignment'
    | 'parts_requirement'
    | 'quotation_draft'
    | 'customer_notification';
  subject: string;
  description?: string;
  payload?: Record<string, unknown>;
};

export type UpdateAlPlatformConfigRequest = {
  globalPolicies?: Record<string, unknown>;
  iotAdapterTemplates?: Record<string, unknown>;
  telemetryStandards?: Record<string, unknown>;
  retentionPolicies?: Record<string, unknown>;
  defaultAlertPolicies?: Record<string, unknown>;
};

export type AlCustomerAssetSummary = {
  assetId: string;
  name: string;
  categoryName: string | null;
  lifecycleStage: AlLifecycleStage;
  warrantyStatus: string | null;
  warrantyExpiresAt: string | null;
  nextMaintenanceDueAt: string | null;
  openAlertCount: number;
};

export type AlCustomerAssetDetail = AlCustomerAssetSummary & {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  serviceHistory: AssetMaintenanceRecordSummary[];
  maintenanceSchedules: AssetMaintenanceScheduleSummary[];
  certificates: string[];
};
