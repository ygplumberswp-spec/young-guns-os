export type DispatchEmergencyType =
  | 'burst_pipe'
  | 'flooding'
  | 'blocked_drain'
  | 'gas_leak'
  | 'water_leak'
  | 'no_water'
  | 'sewer_overflow'
  | 'other';

export type DispatchRoutingType =
  'branch' | 'region' | 'department' | 'emergency' | 'technician' | 'office' | 'service_type';

export type DispatchCallbackStatus =
  'pending_approval' | 'approved' | 'scheduled' | 'completed' | 'cancelled' | 'missed';

export type DispatchActionType = 'dispatch_action' | 'callback_action';
export type DispatchActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type DispatchRecommendationType =
  | 'technician_reassignment'
  | 'overtime_reduction'
  | 'travel_optimization'
  | 'workload_balancing'
  | 'emergency_prioritization'
  | 'branch_balancing'
  | 'staffing_shortage'
  | 'call_routing';

export type DispatchReceptionistSummaryRecord = {
  id: string;
  voiceSessionId: string | null;
  customerId: string | null;
  customerName: string | null;
  serviceIntent: string | null;
  emergencyDetected: boolean;
  afterHours: boolean;
  branchKey: string | null;
  languagePreference: string | null;
  priorityScore: number;
  summary: string;
  createdAt: string;
};

export type DispatchRoutingRecommendationSummary = {
  id: string;
  voiceSessionId: string | null;
  callIntelligenceId: string | null;
  routingType: DispatchRoutingType;
  targetBranch: string | null;
  targetDepartment: string | null;
  priority: number;
  recommendation: string;
  createdAt: string;
};

export type DispatchCallbackRequestSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  voiceSessionId: string | null;
  phoneNumber: string | null;
  status: DispatchCallbackStatus;
  scheduledAt: string | null;
  outcome: string | null;
  missedCallTracked: boolean;
  createdAt: string;
};

export type DispatchEmergencyAssessmentSummary = {
  id: string;
  jobId: string | null;
  voiceSessionId: string | null;
  emergencyType: DispatchEmergencyType;
  priority: number;
  recommendedResponseMinutes: number | null;
  escalationRecommendation: string | null;
  branchRecommendation: string | null;
  createdAt: string;
};

export type DispatchRecommendationSummary = {
  id: string;
  recommendationType: DispatchRecommendationType;
  subject: string;
  recommendation: string;
  technicianId: string | null;
  technicianName: string | null;
  jobId: string | null;
  branchKey: string | null;
  createdAt: string;
};

export type DispatchActionSummary = {
  id: string;
  actionType: DispatchActionType;
  status: DispatchActionStatus;
  subject: string;
  recommendation: string;
  jobId: string | null;
  technicianId: string | null;
  callbackRequestId: string | null;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
};

export type DispatchCallQueueAnalytics = {
  liveQueueCount: number;
  callbackQueueCount: number;
  abandonedCallCount: number;
  averageWaitMinutes: number | null;
  receptionistWorkloadCount: number;
  busiestHours: Array<{ hour: number; callCount: number }>;
  staffingRecommendations: string[];
};

export type DispatchTechnicianMatchSummary = {
  technicianId: string;
  technicianName: string;
  distanceKm: number | null;
  availabilityScore: number | null;
  qualityScore: number | null;
  comebackRatePercent: number | null;
  workloadCount: number;
  overtimeRisk: 'low' | 'medium' | 'high' | null;
  recommendation: string;
};

export type DispatchOperationsDashboard = {
  summary: string;
  liveTechnicianCount: number;
  scheduledJobCount: number;
  delayedJobCount: number;
  emergencyAssessmentCount: number;
  pendingCallbackCount: number;
  pendingActionCount: number;
  branchWorkload: Array<{ branchKey: string; jobCount: number }>;
  callQueue: DispatchCallQueueAnalytics;
  recentRecommendations: DispatchRecommendationSummary[];
};

export type DispatchAuraContext = {
  summary: string;
  liveQueueCount: number;
  pendingCallbackCount: number;
  pendingActionCount: number;
  emergencyAssessmentCount: number;
  scheduledJobCount: number;
};

export type CreateDispatchReceptionistSummaryRequest = {
  voiceSessionId?: string;
  customerId?: string;
  serviceIntent?: string;
  emergencyDetected?: boolean;
  afterHours?: boolean;
  branchKey?: string;
  languagePreference?: string;
  priorityScore?: number;
  summary: string;
};

export type CreateDispatchRoutingRecommendationRequest = {
  voiceSessionId?: string;
  callIntelligenceId?: string;
  routingType: DispatchRoutingType;
  targetBranch?: string;
  targetDepartment?: string;
  priority?: number;
  recommendation: string;
};

export type CreateDispatchCallbackRequest = {
  customerId?: string;
  voiceSessionId?: string;
  phoneNumber?: string;
  scheduledAt?: string;
  missedCallTracked?: boolean;
  notes?: string;
};

export type CreateDispatchEmergencyAssessmentRequest = {
  jobId?: string;
  voiceSessionId?: string;
  emergencyType: DispatchEmergencyType;
  priority?: number;
  recommendedResponseMinutes?: number;
  escalationRecommendation?: string;
  branchRecommendation?: string;
};

export type CreateDispatchActionRequest = {
  actionType: DispatchActionType;
  subject: string;
  recommendation: string;
  jobId?: string;
  technicianId?: string;
  callbackRequestId?: string;
  payload?: Record<string, unknown>;
};

export type GenerateDispatchRecommendationsRequest = {
  recommendationTypes?: DispatchRecommendationType[];
  branchKey?: string;
};
