import type { ExecutiveStats } from './executive.js';

export type DigitalTwinSimulationType =
  | 'job_scheduling'
  | 'technician_allocation'
  | 'dispatch_optimization'
  | 'fleet_utilization'
  | 'inventory_demand'
  | 'purchasing'
  | 'cash_flow'
  | 'staffing'
  | 'customer_demand'
  | 'growth';

export type DigitalTwinScenarioStatus = 'draft' | 'active' | 'archived';

export type DigitalTwinSimulationStatus = 'pending' | 'running' | 'completed' | 'failed';

export type DigitalTwinHeatMapType =
  | 'technician_workload'
  | 'fleet_activity'
  | 'job_density'
  | 'customer_demand'
  | 'inventory_pressure'
  | 'financial_hotspots'
  | 'branch_performance';

export type DigitalTwinRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type DigitalTwinActionType =
  | 'operational_improvement'
  | 'scenario_recommendation'
  | 'bottleneck_fix'
  | 'optimization_plan'
  | 'executive_recommendation';

export type DigitalTwinActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type DigitalTwinReplayEventType =
  | 'job_event'
  | 'dispatch_event'
  | 'fleet_event'
  | 'inventory_event'
  | 'finance_event'
  | 'workflow_event'
  | 'decision_event';

export type DigitalTwinOperationalState = {
  jobs: Record<string, unknown>;
  scheduling: Record<string, unknown>;
  fleet: Record<string, unknown>;
  inventory: Record<string, unknown>;
  finance: Record<string, unknown>;
  workforce: Record<string, unknown>;
  procurement: Record<string, unknown>;
  executive: Record<string, unknown>;
  capturedAt: string;
};

export type DigitalTwinStateSnapshotSummary = {
  id: string;
  label: string | null;
  summary: string | null;
  capturedAt: string;
};

export type DigitalTwinScenarioSummary = {
  id: string;
  name: string;
  description: string | null;
  simulationType: DigitalTwinSimulationType;
  status: DigitalTwinScenarioStatus;
  assumptions: Record<string, unknown>;
  variables: Record<string, unknown>;
  baselineSnapshotId: string | null;
  clonedFromScenarioId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DigitalTwinSimulationSummary = {
  id: string;
  scenarioId: string;
  scenarioName: string | null;
  simulationType: DigitalTwinSimulationType;
  status: DigitalTwinSimulationStatus;
  resultSummary: string | null;
  projectedOutcomes: Record<string, unknown>;
  comparisonMetrics: Record<string, unknown>;
  isReadOnly: boolean;
  startedAt: string;
  completedAt: string | null;
};

export type DigitalTwinScenarioComparisonSummary = {
  id: string;
  name: string;
  scenarioIds: string[];
  comparisonResults: Record<string, unknown>;
  summary: string | null;
  createdAt: string;
};

export type DigitalTwinHeatMapSummary = {
  id: string;
  heatMapType: DigitalTwinHeatMapType;
  dataPoints: Array<Record<string, unknown>>;
  summary: string | null;
  capturedAt: string;
};

export type DigitalTwinReplayEventSummary = {
  id: string;
  eventType: DigitalTwinReplayEventType;
  title: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  eventAt: string;
};

export type DigitalTwinRecommendationSummary = {
  id: string;
  scenarioId: string | null;
  title: string;
  recommendation: string;
  priority: string;
  status: DigitalTwinRecommendationStatus;
  createdAt: string;
};

export type DigitalTwinPlatformActionSummary = {
  id: string;
  actionType: DigitalTwinActionType;
  status: DigitalTwinActionStatus;
  subject: string;
  recommendation: string;
  scenarioId: string | null;
  createdAt: string;
};

export type DigitalTwinCapacityUtilization = {
  technicianUtilizationPercent: number | null;
  fleetUtilizationPercent: number | null;
  inventoryPressureScore: number | null;
  cashFlowHealthScore: number | null;
};

export type DigitalTwinRiskIndicators = {
  operationalRiskLevel: 'low' | 'medium' | 'high';
  bottleneckCount: number;
  overdueJobCount: number;
  lowStockItemCount: number;
  pendingExecutiveAlertCount: number;
};

export type EnterpriseDigitalTwinDashboard = {
  summary: string;
  operationalState: DigitalTwinOperationalState;
  executiveStats: ExecutiveStats;
  capacityUtilization: DigitalTwinCapacityUtilization;
  riskIndicators: DigitalTwinRiskIndicators;
  activeScenarios: DigitalTwinScenarioSummary[];
  recentSimulations: DigitalTwinSimulationSummary[];
  heatMaps: DigitalTwinHeatMapSummary[];
  recommendations: DigitalTwinRecommendationSummary[];
  recentReplayEvents: DigitalTwinReplayEventSummary[];
  pendingActionCount: number;
};

export type EnterpriseDigitalTwinAuraContext = {
  summary: string;
  healthScore: number | null;
  activeScenarioCount: number;
  completedSimulationCount: number;
  pendingRecommendationCount: number;
  operationalRiskLevel: string;
  pendingActionCount: number;
};

export type CreateDigitalTwinScenarioRequest = {
  name: string;
  description?: string | null;
  simulationType: DigitalTwinSimulationType;
  assumptions?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  baselineSnapshotId?: string | null;
};

export type CloneDigitalTwinScenarioRequest = {
  name: string;
  description?: string | null;
};

export type RunDigitalTwinSimulationRequest = {
  scenarioId: string;
};

export type CompareDigitalTwinScenariosRequest = {
  name: string;
  scenarioIds: string[];
};

export type CreateDigitalTwinActionRequest = {
  actionType: DigitalTwinActionType;
  subject: string;
  recommendation: string;
  scenarioId?: string | null;
  payload?: Record<string, unknown>;
};

export type CaptureDigitalTwinSnapshotRequest = {
  label?: string | null;
};
