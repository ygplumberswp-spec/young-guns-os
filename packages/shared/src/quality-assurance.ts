export type QualityComebackType = 'callback' | 'revisit' | 'warranty_visit' | 'quality_inspection';

export type QualityComebackStatus = 'open' | 'investigating' | 'resolved' | 'closed' | 'cancelled';

export type QualityRootCause =
  | 'installation_error'
  | 'workmanship'
  | 'wrong_diagnosis'
  | 'incorrect_materials'
  | 'defective_materials'
  | 'manufacturer_defect'
  | 'customer_misuse'
  | 'unrelated_new_fault'
  | 'wear_and_tear'
  | 'warranty'
  | 'unknown';

export type QualityActionType =
  | 'coaching'
  | 'retraining'
  | 'warning'
  | 'labour_recovery'
  | 'material_recovery'
  | 'payroll_recommendation';

export type QualityActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type QualityComebackSummary = {
  id: string;
  comebackType: QualityComebackType;
  status: QualityComebackStatus;
  originalJobId: string;
  originalJobTitle: string | null;
  comebackJobId: string | null;
  originalTechnicianId: string | null;
  originalTechnicianName: string | null;
  currentTechnicianId: string | null;
  currentTechnicianName: string | null;
  customerId: string;
  customerName: string;
  branchKey: string | null;
  reason: string;
  resolution: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  labourHours: number | null;
  photoDocumentIds: string[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type QualityRootCauseAnalysisSummary = {
  id: string;
  comebackId: string;
  classification: QualityRootCause;
  notes: string | null;
  auraRecommendedCause: QualityRootCause | null;
  auraConfidence: number | null;
  createdAt: string;
  updatedAt: string;
};

export type QualityCostEntrySummary = {
  id: string;
  comebackId: string;
  labourCostCents: number;
  materialCostCents: number;
  travelCostCents: number;
  totalComebackCostCents: number;
  warrantyCostCents: number;
  supplierRecoveryCents: number;
  companyLossCents: number;
  currency: string;
  notes: string | null;
  createdAt: string;
};

export type QualityWarrantyClaimSummary = {
  id: string;
  comebackId: string | null;
  jobId: string;
  jobTitle: string | null;
  customerId: string;
  customerName: string;
  status: QualityComebackStatus;
  claimNumber: string | null;
  description: string;
  resolvedAt: string | null;
  createdAt: string;
};

export type QualitySupplierDefectSummary = {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  inventoryItemId: string | null;
  itemName: string | null;
  comebackId: string | null;
  defectDescription: string;
  isRecurring: boolean;
  replacementCount: number;
  createdAt: string;
};

export type QualityActionSummary = {
  id: string;
  actionType: QualityActionType;
  status: QualityActionStatus;
  technicianId: string | null;
  technicianName: string | null;
  comebackId: string | null;
  subject: string;
  recommendation: string;
  createdAt: string;
  updatedAt: string;
};

export type QualityTechnicianScore = {
  technicianId: string;
  technicianName: string;
  completedJobCount: number;
  comebackCount: number;
  warrantyCount: number;
  firstTimeFixRatePercent: number | null;
  comebackRatePercent: number | null;
  warrantyRatePercent: number | null;
  averageQualityScore: number | null;
  repeatFailureCount: number;
};

export type QualityTrendPoint = {
  period: string;
  comebackCount: number;
  warrantyCount: number;
  totalCostCents: number;
  firstTimeFixRatePercent: number | null;
  qualityScore: number | null;
};

export type QualityTechnicianIntelligence = {
  technicians: QualityTechnicianScore[];
  monthlyTrends: QualityTrendPoint[];
  yearlyTrends: QualityTrendPoint[];
  customerSatisfactionAvailable: boolean;
};

export type QualityExecutiveDashboard = {
  comebackCostCents: number;
  warrantyCostCents: number;
  totalQualityCostCents: number;
  companyLossCents: number;
  supplierRecoveryCents: number;
  currency: string;
  firstTimeFixRatePercent: number | null;
  openComebackCount: number;
  openWarrantyCount: number;
  monthlyQualityScore: number | null;
  technicianRankings: Array<{ technicianId: string; name: string; qualityScore: number | null }>;
  branchRankings: Array<{ branchKey: string; comebackCount: number; costCents: number }>;
  supplierRankings: Array<{ supplierId: string; name: string; defectCount: number }>;
  commonFailureReasons: Array<{ cause: QualityRootCause; count: number }>;
  qualityTrends: QualityTrendPoint[];
};

export type QualitySupplierIntelligence = {
  defects: QualitySupplierDefectSummary[];
  totalDefectCount: number;
  recurringDefectCount: number;
  warrantyClaimCount: number;
  topSuppliers: Array<{
    supplierId: string;
    name: string;
    defectCount: number;
    replacementCount: number;
  }>;
};

export type QualityAuraContext = {
  summary: string;
  openComebackCount: number;
  openWarrantyCount: number;
  firstTimeFixRatePercent: number | null;
  totalQualityCostCents: number;
  currency: string;
  pendingActionCount: number;
  topRootCause: QualityRootCause | null;
};

export type CreateQualityComebackRequest = {
  comebackType: QualityComebackType;
  originalJobId: string;
  comebackJobId?: string;
  originalTechnicianId?: string;
  currentTechnicianId?: string;
  branchKey?: string;
  reason: string;
  resolution?: string;
  occurredAt?: string;
  labourHours?: number;
  photoDocumentIds?: string[];
  documentIds?: string[];
};

export type UpdateQualityComebackRequest = {
  status?: QualityComebackStatus;
  resolution?: string;
  currentTechnicianId?: string;
  labourHours?: number;
  photoDocumentIds?: string[];
  documentIds?: string[];
};

export type CreateQualityRootCauseRequest = {
  classification: QualityRootCause;
  notes?: string;
  auraRecommendedCause?: QualityRootCause;
  auraConfidence?: number;
};

export type CreateQualityCostEntryRequest = {
  labourCostCents?: number;
  materialCostCents?: number;
  travelCostCents?: number;
  warrantyCostCents?: number;
  supplierRecoveryCents?: number;
  currency?: string;
  notes?: string;
};

export type CreateQualityWarrantyClaimRequest = {
  jobId: string;
  comebackId?: string;
  claimNumber?: string;
  description: string;
};

export type CreateQualitySupplierDefectRequest = {
  supplierId?: string;
  inventoryItemId?: string;
  comebackId?: string;
  defectDescription: string;
  isRecurring?: boolean;
  replacementCount?: number;
};

export type CreateQualityActionRequest = {
  actionType: QualityActionType;
  technicianId?: string;
  comebackId?: string;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};
