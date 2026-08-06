import type { JobPriority } from './job-contract.js';

export type LeadStatus =
  | 'new'
  | 'attempted_contact'
  | 'contacted'
  | 'qualified'
  | 'awaiting_information'
  | 'quote_required'
  | 'ready_to_book'
  | 'opportunity'
  | 'converted'
  | 'lost'
  | 'duplicate';

export type LeadActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'follow_up'
  | 'note'
  | 'handoff'
  | 'status_change'
  | 'conversion'
  | 'duplicate_override'
  | 'other';

export type LeadRecommendationType =
  | 'follow_up'
  | 'qualification'
  | 'handoff'
  | 'engagement'
  | 'conversion'
  | 'retention';

export type LeadRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type LeadUrgency = JobPriority;

export type LeadDuplicateMatchKind =
  | 'mobile'
  | 'email'
  | 'name'
  | 'address'
  | 'customer'
  | 'property';

export type LeadDuplicateResolution =
  | 'use_existing_customer'
  | 'use_existing_property'
  | 'create_new'
  | 'keep_as_lead'
  | 'override';

export const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'attempted_contact', label: 'Attempted Contact' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'awaiting_information', label: 'Awaiting Information' },
  { value: 'quote_required', label: 'Quote / Estimate Required' },
  { value: 'ready_to_book', label: 'Ready To Book' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'converted', label: 'Converted / Won' },
  { value: 'lost', label: 'Lost / Not Proceeding' },
  { value: 'duplicate', label: 'Duplicate / Spam' },
];

export const LEAD_TERMINAL_STATUSES: LeadStatus[] = ['converted', 'lost', 'duplicate'];

export const LEAD_ACTIVITY_TYPE_OPTIONS: Array<{ value: LeadActivityType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'note', label: 'Note' },
  { value: 'handoff', label: 'Sales Handoff' },
  { value: 'status_change', label: 'Status Change' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'duplicate_override', label: 'Duplicate Override' },
  { value: 'other', label: 'Other' },
];

export type LeadSourceSummary = {
  id: string;
  sourceKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  leadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LeadSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  propertyId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  sourceId: string | null;
  sourceName: string | null;
  status: LeadStatus;
  title: string;
  companyName: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneE164: string | null;
  serviceType: string | null;
  urgency: LeadUrgency;
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unit: string | null;
  addressDisplay: string | null;
  accessInstructions: string | null;
  preferredAppointmentAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  isOverdue: boolean;
  lostReason: string | null;
  reopenReason: string | null;
  marketingConsent: boolean;
  operationalContactPermission: boolean;
  score: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
  notes: string | null;
  emailIsPlaceholder: boolean;
  convertedAt: string | null;
  convertedByUserId: string | null;
  lostAt: string | null;
  createdByUserId: string | null;
  ageDays: number;
  createdAt: string;
  updatedAt: string;
};

export type LeadStatusHistorySummary = {
  id: string;
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type LeadConversionSummary = {
  id: string;
  leadId: string;
  clientActionId: string;
  customerId: string | null;
  propertyId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  createJob: boolean;
  customerMode: string;
  propertyMode: string;
  duplicateResolution: string | null;
  dispatchNotificationSent: boolean;
  convertedByUserId: string | null;
  createdAt: string;
};

export type LeadDetail = LeadSummary & {
  statusHistory: LeadStatusHistorySummary[];
  conversion: LeadConversionSummary | null;
  activities: LeadActivitySummary[];
};

export type LeadActivitySummary = {
  id: string;
  leadId: string;
  activityType: LeadActivityType;
  subject: string | null;
  body: string;
  authorUserId: string;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type LeadScoreSummary = {
  id: string;
  leadId: string;
  score: number;
  signals: Record<string, unknown>;
  scoredAt: string;
  createdAt: string;
};

export type LeadRecommendationSummary = {
  id: string;
  leadId: string | null;
  leadTitle: string | null;
  recommendationType: LeadRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: LeadRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LeadPipelineMetrics = {
  stages: Array<{
    status: LeadStatus;
    count: number;
    averageScore: number;
  }>;
  totalActive: number;
  convertedCount: number;
  lostCount: number;
  conversionRatePercent: number | null;
};

export type AcquisitionInsight = {
  insightType: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type LeadScoringResult = {
  leadId: string;
  score: number;
  signals: Record<string, unknown>;
  summary: string;
};

export type SalesHandoffPreview = {
  leadId: string;
  leadTitle: string;
  contactName: string;
  currentScore: number;
  suggestedOpportunityTitle: string;
  suggestedOpportunityType: string;
  requiresApproval: true;
};

export type LeadAuraContext = {
  activeLeadCount: number;
  qualifiedLeadCount: number;
  pendingRecommendationCount: number;
  averageScore: number;
  topLeads: Array<{
    id: string;
    title: string;
    contactName: string;
    status: LeadStatus;
    score: number;
  }>;
  acquisitionInsights: AcquisitionInsight[];
  summary: string;
};

export type LeadStats = {
  totalLeadCount: number;
  activeLeadCount: number;
  qualifiedLeadCount: number;
  convertedLeadCount: number;
  sourceCount: number;
  pendingRecommendationCount: number;
  crmLeadCustomerCount: number;
  overdueFollowUpCount: number;
};

export type LeadDuplicateMatch = {
  kind: LeadDuplicateMatchKind;
  score: number;
  leadId?: string;
  customerId?: string;
  propertyId?: string;
  label: string;
  detail: string;
  emailIsPlaceholder?: boolean;
};

export type LeadDuplicateCheckResult = {
  matches: LeadDuplicateMatch[];
  placeholderEmailWarning: boolean;
};

export type CreateLeadSourceRequest = {
  sourceKey: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
};

export type UpdateLeadSourceRequest = Partial<CreateLeadSourceRequest>;

export type CreateLeadRequest = {
  customerId?: string | null;
  sourceId?: string | null;
  status?: LeadStatus;
  title?: string;
  companyName?: string | null;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  serviceType?: string | null;
  urgency?: LeadUrgency;
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
  accessInstructions?: string | null;
  preferredAppointmentAt?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  marketingConsent?: boolean;
  operationalContactPermission?: boolean;
  assignedUserId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  /** Explicit acknowledgement when creating despite suspected duplicates */
  duplicateOverrideReason?: string | null;
  acknowledgePlaceholderEmail?: boolean;
};

export type UpdateLeadRequest = {
  customerId?: string | null;
  sourceId?: string | null;
  status?: LeadStatus;
  title?: string;
  companyName?: string | null;
  contactName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  serviceType?: string | null;
  urgency?: LeadUrgency;
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
  accessInstructions?: string | null;
  preferredAppointmentAt?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  lostReason?: string | null;
  reopenReason?: string | null;
  marketingConsent?: boolean;
  operationalContactPermission?: boolean;
  assignedUserId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateLeadActivityRequest = {
  activityType?: LeadActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type UpdateLeadRecommendationRequest = {
  status: LeadRecommendationStatus;
};

export type LeadListQuery = {
  q?: string;
  status?: LeadStatus | LeadStatus[];
  sourceId?: string;
  serviceType?: string;
  assignedUserId?: string;
  overdueOnly?: boolean;
};

export type ConvertLeadRequest = {
  clientActionId: string;
  customerMode: 'existing' | 'new';
  customerId?: string | null;
  newCustomer?: {
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  } | null;
  propertyMode: 'existing' | 'new' | 'none';
  propertyId?: string | null;
  newProperty?: {
    propertyName?: string | null;
    street: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    unit?: string | null;
  } | null;
  createJob: boolean;
  job?: {
    jobType: string;
    description: string;
    priority?: JobPriority;
    preferredAppointmentAt?: string | null;
    scheduledEndAt?: string | null;
    assignedUserId?: string | null;
    accessInstructions?: string | null;
    notes?: string | null;
    siteContactName?: string | null;
    siteContactMobile?: string | null;
    siteContactEmail?: string | null;
    siteContactDiffersFromCustomer?: boolean;
  } | null;
  duplicateResolution?: LeadDuplicateResolution | null;
  duplicateOverrideReason?: string | null;
};

export type ConvertLeadResult = {
  lead: LeadSummary;
  customerId: string;
  propertyId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  idempotentReplay: boolean;
  dispatchNotificationSent: boolean;
  confirmation: {
    customerName: string;
    propertyLabel: string | null;
    jobTitle: string | null;
    appointmentAt: string | null;
    assignedUserName: string | null;
  };
};
