export type VoiceSessionStatus = 'active' | 'completed' | 'missed' | 'abandoned' | 'failed';

export type VoiceChannel = 'phone' | 'web_voice';

export type VoiceEnquiryType =
  | 'new_enquiry'
  | 'existing_customer'
  | 'service_request'
  | 'quote_request'
  | 'appointment_request'
  | 'other';

export type VoiceSpeaker = 'caller' | 'agent' | 'system';

export type VoiceOutcomeType =
  | 'qualified'
  | 'appointment_requested'
  | 'quote_requested'
  | 'follow_up_required'
  | 'transferred'
  | 'resolved'
  | 'unresolved'
  | 'other';

export type VoiceFollowUpType =
  | 'customer_note'
  | 'lead_draft'
  | 'sales_follow_up'
  | 'appointment_request'
  | 'communication_draft';

export type VoiceFollowUpStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export const VOICE_SESSION_STATUS_OPTIONS: Array<{ value: VoiceSessionStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'abandoned', label: 'Abandoned' },
  { value: 'failed', label: 'Failed' },
];

export const VOICE_ENQUIRY_TYPE_OPTIONS: Array<{ value: VoiceEnquiryType; label: string }> = [
  { value: 'new_enquiry', label: 'New Enquiry' },
  { value: 'existing_customer', label: 'Existing Customer' },
  { value: 'service_request', label: 'Service Request' },
  { value: 'quote_request', label: 'Quote Request' },
  { value: 'appointment_request', label: 'Appointment Request' },
  { value: 'other', label: 'Other' },
];

export type VoiceSessionSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  agentProfileId: string | null;
  status: VoiceSessionStatus;
  channel: VoiceChannel;
  enquiryType: VoiceEnquiryType;
  callerName: string | null;
  callerPhone: string | null;
  callerEmail: string | null;
  durationSeconds: number | null;
  summary: string | null;
  followUpRequired: boolean;
  qualification: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoiceConversationSummary = {
  id: string;
  sessionId: string;
  speaker: VoiceSpeaker;
  content: string;
  occurredAt: string;
  createdAt: string;
};

export type VoiceOutcomeSummary = {
  id: string;
  sessionId: string;
  outcomeType: VoiceOutcomeType;
  title: string;
  description: string;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type VoiceFollowUpSummary = {
  id: string;
  sessionId: string;
  customerId: string | null;
  followUpType: VoiceFollowUpType;
  status: VoiceFollowUpStatus;
  title: string;
  description: string;
  priority: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type VoiceStats = {
  totalSessionCount: number;
  activeSessionCount: number;
  completedSessionCount: number;
  followUpRequiredCount: number;
  pendingFollowUpCount: number;
  appointmentRequestCount: number;
  quoteRequestCount: number;
};

export type VoiceCallSummary = {
  sessionId: string;
  summary: string;
  turnCount: number;
  callerTurnCount: number;
  agentTurnCount: number;
  keyTopics: string[];
  followUpRequired: boolean;
};

export type VoiceQualificationResult = {
  sessionId: string;
  customerId: string | null;
  isExistingCustomer: boolean;
  enquiryType: VoiceEnquiryType;
  serviceType: string | null;
  urgency: 'low' | 'medium' | 'high' | null;
  serviceArea: string | null;
  salesOpportunitySignal: boolean;
  signals: Record<string, unknown>;
  summary: string;
};

export type VoiceAppointmentAssistance = {
  scheduledJobCount: number;
  upcomingAppointments: Array<{
    jobId: string;
    title: string;
    scheduledAt: string | null;
    customerName: string | null;
  }>;
  recommendation: string;
  requiresApproval: true;
};

export type VoiceInsight = {
  insightType: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type VoiceAuraContext = {
  activeSessionCount: number;
  followUpRequiredCount: number;
  pendingFollowUpCount: number;
  recentSessions: Array<{
    id: string;
    callerName: string | null;
    enquiryType: VoiceEnquiryType;
    status: VoiceSessionStatus;
    summary: string | null;
    followUpRequired: boolean;
  }>;
  waitingEnquiries: VoiceInsight[];
  summary: string;
};

export type CreateVoiceSessionRequest = {
  customerId?: string | null;
  agentProfileId?: string | null;
  status?: VoiceSessionStatus;
  channel?: VoiceChannel;
  enquiryType?: VoiceEnquiryType;
  callerName?: string | null;
  callerPhone?: string | null;
  callerEmail?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  followUpRequired?: boolean;
  qualification?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string | null;
};

export type UpdateVoiceSessionRequest = Partial<CreateVoiceSessionRequest>;

export type CreateVoiceConversationRequest = {
  speaker: VoiceSpeaker;
  content: string;
  occurredAt?: string;
};

export type CreateVoiceOutcomeRequest = {
  outcomeType: VoiceOutcomeType;
  title: string;
  description: string;
  context?: Record<string, unknown>;
};

export type UpdateVoiceFollowUpRequest = {
  status: VoiceFollowUpStatus;
};
