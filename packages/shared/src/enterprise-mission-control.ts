import type { ExecutiveStats } from './executive.js';

export type MissionControlAlertCategory =
  | 'critical'
  | 'operational'
  | 'financial'
  | 'fleet'
  | 'inventory'
  | 'ai'
  | 'security'
  | 'integration';

export type MissionControlAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type MissionControlAlertStatus = 'pending' | 'acknowledged' | 'escalated' | 'resolved';

export type MissionControlIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type MissionControlIncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export type MissionControlTimelineEventType =
  | 'job_event'
  | 'dispatch_event'
  | 'fleet_event'
  | 'finance_event'
  | 'workflow_event'
  | 'security_event'
  | 'integration_event'
  | 'ai_event'
  | 'executive_action'
  | 'incident_event';

export type MissionControlCommandActionType =
  | 'executive_task'
  | 'workflow_launch'
  | 'approval_request'
  | 'investigation'
  | 'incident_escalation'
  | 'department_coordination'
  | 'executive_briefing';

export type MissionControlCommandActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type MissionControlRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type MissionControlAlertSummary = {
  id: string;
  category: MissionControlAlertCategory;
  severity: MissionControlAlertSeverity;
  status: MissionControlAlertStatus;
  escalationLevel: number;
  title: string;
  description: string;
  sourceModule: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
};

export type MissionControlIncidentSummary = {
  id: string;
  title: string;
  description: string;
  severity: MissionControlIncidentSeverity;
  status: MissionControlIncidentStatus;
  ownerUserId: string | null;
  rootCause: string | null;
  resolutionSummary: string | null;
  branchKey: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type MissionControlIncidentTimelineSummary = {
  id: string;
  incidentId: string;
  title: string;
  description: string | null;
  eventAt: string;
};

export type MissionControlOperationsMapPoint = {
  id: string;
  mapType: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  entityType: string | null;
  entityId: string | null;
  capturedAt: string;
};

export type MissionControlTimelineEventSummary = {
  id: string;
  eventType: MissionControlTimelineEventType;
  title: string;
  description: string | null;
  sourceModule: string | null;
  branchKey: string | null;
  eventAt: string;
};

export type MissionControlDepartmentHealthSummary = {
  id: string;
  departmentKey: string;
  departmentName: string;
  healthScore: number | null;
  status: string;
  capturedAt: string;
};

export type MissionControlModuleSnapshot = {
  module: string;
  status: string;
  summary: string;
  metrics: Record<string, unknown>;
};

export type MissionControlRecommendationSummary = {
  id: string;
  title: string;
  recommendation: string;
  priority: string;
  status: MissionControlRecommendationStatus;
  createdAt: string;
};

export type MissionControlCommandActionSummary = {
  id: string;
  actionType: MissionControlCommandActionType;
  status: MissionControlCommandActionStatus;
  subject: string;
  recommendation: string;
  incidentId: string | null;
  createdAt: string;
};

export type EnterpriseMissionControlDashboard = {
  summary: string;
  executiveStats: ExecutiveStats;
  businessHealthScore: number | null;
  pendingAlertCount: number;
  criticalAlertCount: number;
  activeIncidentCount: number;
  systemHealthStatus: string;
  moduleSnapshots: MissionControlModuleSnapshot[];
  departmentHealth: MissionControlDepartmentHealthSummary[];
  recentAlerts: MissionControlAlertSummary[];
  activeIncidents: MissionControlIncidentSummary[];
  timelineEvents: MissionControlTimelineEventSummary[];
  operationsMap: MissionControlOperationsMapPoint[];
  recommendations: MissionControlRecommendationSummary[];
  pendingActionCount: number;
};

export type EnterpriseMissionControlAuraContext = {
  summary: string;
  businessHealthScore: number | null;
  pendingAlertCount: number;
  criticalAlertCount: number;
  activeIncidentCount: number;
  pendingRecommendationCount: number;
  pendingActionCount: number;
};

export type CreateMissionControlIncidentRequest = {
  title: string;
  description: string;
  severity?: MissionControlIncidentSeverity;
  ownerUserId?: string | null;
  linkedEntities?: Array<Record<string, unknown>>;
  branchKey?: string | null;
};

export type UpdateMissionControlIncidentRequest = {
  status?: MissionControlIncidentStatus;
  ownerUserId?: string | null;
  rootCause?: string | null;
  resolutionSummary?: string | null;
};

export type AcknowledgeMissionControlAlertRequest = {
  alertId: string;
};

export type CreateMissionControlCommandActionRequest = {
  actionType: MissionControlCommandActionType;
  subject: string;
  recommendation: string;
  incidentId?: string | null;
  payload?: Record<string, unknown>;
};

export type AddMissionControlIncidentTimelineRequest = {
  title: string;
  description?: string | null;
};
