export type CandidateActivityType =
  'note' | 'screening' | 'interview' | 'assessment' | 'communication' | 'status_change' | 'other';

export type WorkforceRecommendationType =
  'staffing' | 'training' | 'recruitment' | 'capacity' | 'skill_gap' | 'performance';

export type WorkforceRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type CandidatePipelineStage = {
  status: string;
  label: string;
  count: number;
};

export type CandidateActivitySummary = {
  id: string;
  candidateId: string;
  activityType: CandidateActivityType;
  subject: string | null;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type EmployeeSkillSummary = {
  id: string;
  userId: string;
  userName: string | null;
  skillKey: string;
  skillName: string;
  proficiency: string;
  experienceYears: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CertificationSummary = {
  id: string;
  userId: string;
  userName: string | null;
  certificationKey: string;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrainingRecordSummary = {
  id: string;
  userId: string;
  userName: string | null;
  trainingKey: string;
  title: string;
  description: string | null;
  status: string;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkforceRecommendationSummary = {
  id: string;
  recommendationType: WorkforceRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: WorkforceRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SkillGapInsight = {
  skillKey: string;
  skillName: string;
  gapType: 'missing' | 'low_coverage' | 'training_needed';
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type StaffingInsight = {
  insightType: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type TechnicianPerformanceInsight = {
  userId: string;
  userName: string;
  jobsCompleted: number;
  jobsAssigned: number;
  completionRatePercent: number | null;
  averageCompletionHours: number | null;
  workloadScore: number;
  trainingNeedSignal: boolean;
  summary: string;
};

export type WorkforceStats = {
  candidateCount: number;
  activePipelineCount: number;
  employeeSkillCount: number;
  certificationCount: number;
  plannedTrainingCount: number;
  pendingRecommendationCount: number;
  technicianCount: number;
};

export type WorkforceAuraContext = {
  candidateCount: number;
  activePipelineCount: number;
  pendingRecommendationCount: number;
  skillGapCount: number;
  pipelineStages: CandidatePipelineStage[];
  topRecommendations: Array<{
    title: string;
    recommendationType: WorkforceRecommendationType;
    priority: string;
  }>;
  staffingInsights: StaffingInsight[];
  summary: string;
};

export type CreateCandidateActivityRequest = {
  activityType?: CandidateActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type CreateEmployeeSkillRequest = {
  userId: string;
  skillKey: string;
  skillName: string;
  proficiency?: string;
  experienceYears?: number | null;
  notes?: string | null;
};

export type UpdateEmployeeSkillRequest = Partial<Omit<CreateEmployeeSkillRequest, 'userId'>>;

export type CreateCertificationRequest = {
  userId: string;
  certificationKey: string;
  name: string;
  issuer?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

export type UpdateCertificationRequest = Partial<Omit<CreateCertificationRequest, 'userId'>>;

export type CreateTrainingRecordRequest = {
  userId: string;
  trainingKey: string;
  title: string;
  description?: string | null;
  status?: string;
  completedAt?: string | null;
  notes?: string | null;
};

export type UpdateTrainingRecordRequest = Partial<Omit<CreateTrainingRecordRequest, 'userId'>>;

export type UpdateWorkforceRecommendationRequest = {
  status: WorkforceRecommendationStatus;
};
