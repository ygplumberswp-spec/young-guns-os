export type AssetType =
  | 'vehicle'
  | 'machinery'
  | 'tool'
  | 'equipment'
  | 'office_asset'
  | 'it_equipment'
  | 'rented_asset';

export type AssetStatus = 'active' | 'inactive' | 'maintenance' | 'retired' | 'disposed' | 'out_of_service';

export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export type AssetLifecycleEventType =
  | 'acquisition'
  | 'assignment'
  | 'transfer'
  | 'maintenance'
  | 'repair'
  | 'calibration'
  | 'warranty'
  | 'retirement'
  | 'disposal';

export type AssetScheduleType =
  | 'recurring'
  | 'usage_based'
  | 'inspection_reminder'
  | 'warranty_reminder'
  | 'service_interval';

export type AssetMaintenanceType = 'planned' | 'emergency' | 'corrective' | 'preventative';

export type AssetMaintenanceStatus =
  | 'scheduled'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type AssetInspectionType = 'safety' | 'vehicle' | 'equipment' | 'toolbox' | 'compliance';

export type AssetInspectionStatus = 'scheduled' | 'in_progress' | 'passed' | 'failed' | 'overdue';

export type AssetCalibrationStatus = 'valid' | 'expiring' | 'expired' | 'not_required';

export type AssetCostType = 'maintenance' | 'repair' | 'downtime' | 'replacement' | 'warranty_recovery';

export type AssetActionType = 'maintenance_action' | 'replacement_recommendation';

export type AssetActionStatus = 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type AssetEquipmentSummary = {
  id: string;
  assetType: AssetType;
  name: string;
  description: string | null;
  serialNumber: string | null;
  barcodeReference: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchaseDate: string | null;
  warrantyExpiresAt: string | null;
  depreciationReference: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  branchKey: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  locationText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetLifecycleEventSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  eventType: AssetLifecycleEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
};

export type AssetMaintenanceScheduleSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  scheduleType: AssetScheduleType;
  title: string;
  description: string | null;
  intervalDays: number | null;
  intervalUsageHours: number | null;
  nextDueAt: string | null;
  lastCompletedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AssetMaintenanceRecordSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  maintenanceType: AssetMaintenanceType;
  status: AssetMaintenanceStatus;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  jobId: string | null;
  labourCostCents: number;
  partsCostCents: number;
  totalCostCents: number;
  downtimeHours: number | null;
  createdAt: string;
};

export type AssetInspectionSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  inspectionType: AssetInspectionType;
  status: AssetInspectionStatus;
  findings: string | null;
  inspectorUserId: string | null;
  inspectorName: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AssetCalibrationSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  certificationName: string;
  calibratedAt: string | null;
  expiresAt: string | null;
  complianceStatus: AssetCalibrationStatus;
  renewalRecommendation: string | null;
  createdAt: string;
};

export type AssetMaintenanceCostSummary = {
  id: string;
  assetId: string;
  assetName: string | null;
  maintenanceRecordId: string | null;
  costType: AssetCostType;
  amountCents: number;
  currency: string;
  notes: string | null;
  createdAt: string;
};

export type AssetMaintenanceActionSummary = {
  id: string;
  assetId: string | null;
  assetName: string | null;
  actionType: AssetActionType;
  status: AssetActionStatus;
  subject: string;
  recommendation: string;
  createdAt: string;
};

export type AssetPerformanceAnalytics = {
  totalAssets: number;
  activeAssetCount: number;
  maintenanceAssetCount: number;
  retiredAssetCount: number;
  averageAssetAgeYears: number | null;
  totalMaintenanceCostCents: number;
  totalDowntimeHours: number;
  warrantyRecoveryCents: number;
  currency: string;
  maintenanceFrequencyByAsset: Array<{ assetId: string; name: string; maintenanceCount: number }>;
  reliabilityScores: Array<{ assetId: string; name: string; reliabilityScore: number | null }>;
  replacementRecommendations: Array<{ assetId: string; name: string; reason: string }>;
  lifecycleTrends: Array<{ period: string; acquisitionCount: number; retirementCount: number }>;
};

export type AssetExecutiveDashboard = {
  summary: string;
  analytics: AssetPerformanceAnalytics;
  upcomingMaintenance: AssetMaintenanceScheduleSummary[];
  overdueInspections: AssetInspectionSummary[];
  expiringCalibrations: AssetCalibrationSummary[];
  pendingActions: AssetMaintenanceActionSummary[];
};

export type AssetAuraContext = {
  summary: string;
  totalAssets: number;
  activeAssetCount: number;
  pendingMaintenanceCount: number;
  overdueInspectionCount: number;
  expiringCalibrationCount: number;
  pendingActionCount: number;
  totalMaintenanceCostCents: number;
  currency: string;
};

export type CreateAssetEquipmentRequest = {
  assetType: AssetType;
  name: string;
  description?: string;
  serialNumber?: string;
  barcodeReference?: string;
  vehicleId?: string;
  supplierId?: string;
  purchaseDate?: string;
  warrantyExpiresAt?: string;
  depreciationReference?: string;
  assignedTechnicianId?: string;
  branchKey?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  locationText?: string;
};

export type UpdateAssetEquipmentRequest = {
  name?: string;
  description?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  assignedTechnicianId?: string;
  branchKey?: string;
  locationText?: string;
};

export type CreateAssetMaintenanceScheduleRequest = {
  assetId: string;
  scheduleType: AssetScheduleType;
  title: string;
  description?: string;
  intervalDays?: number;
  intervalUsageHours?: number;
  nextDueAt?: string;
};

export type CreateAssetMaintenanceRecordRequest = {
  assetId: string;
  maintenanceType: AssetMaintenanceType;
  title: string;
  description?: string;
  scheduledAt?: string;
  assignedTechnicianId?: string;
  jobId?: string;
  labourCostCents?: number;
  partsCostCents?: number;
  downtimeHours?: number;
  notes?: string;
};

export type CreateAssetInspectionRequest = {
  assetId: string;
  inspectionType: AssetInspectionType;
  checklist?: Array<{ item: string; passed: boolean | null }>;
  findings?: string;
  inspectorUserId?: string;
};

export type CreateAssetCalibrationRequest = {
  assetId: string;
  certificationName: string;
  calibratedAt?: string;
  expiresAt?: string;
  complianceStatus?: AssetCalibrationStatus;
  renewalRecommendation?: string;
};

export type CreateAssetMaintenanceActionRequest = {
  actionType: AssetActionType;
  assetId?: string;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type CreateAssetMaintenanceCostRequest = {
  assetId: string;
  maintenanceRecordId?: string;
  costType: AssetCostType;
  amountCents?: number;
  currency?: string;
  notes?: string;
};
