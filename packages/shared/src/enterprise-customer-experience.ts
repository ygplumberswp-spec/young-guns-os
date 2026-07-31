import type { CommunicationSummary } from './communications.js';
import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import type { JobSummary } from './jobs.js';
import type { NotificationSummary } from './mobile.js';
import type { PortalAccessPermission } from './portal.js';
import type { PortalAppointmentSummary } from './portal-experience.js';

export type CxBookingStatus =
  'draft' | 'pending_approval' | 'approved' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export type CxBookingType = 'standard' | 'emergency' | 'reschedule' | 'cancellation';

export type CxReviewType =
  | 'satisfaction_survey'
  | 'job_rating'
  | 'technician_rating'
  | 'business_review'
  | 'complaint'
  | 'internal_feedback';

export type CxReviewStatus = 'submitted' | 'acknowledged' | 'resolved' | 'closed';

export type CxReferralStatus = 'invited' | 'registered' | 'converted' | 'rewarded' | 'expired';

export type CxLoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'custom';

export type CxDocumentAccessType =
  | 'invoice'
  | 'quotation'
  | 'certificate'
  | 'compliance_report'
  | 'job_card'
  | 'warranty'
  | 'upload';

export type CxPlatformConfigSummary = {
  globalPolicies: Record<string, unknown>;
  brandingTemplates: Record<string, unknown>;
  portalDefaults: Record<string, unknown>;
  communicationPolicies: Record<string, unknown>;
  engagementRules: Record<string, unknown>;
  loyaltySettings: Record<string, unknown>;
  trackingEnabled: boolean;
  pwaEnabled: boolean;
};

export type CxCustomerPropertySummary = {
  id: string;
  propertyName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unitNumber: string | null;
  isPrimary: boolean;
  createdAt: string;
};

export type CxAppointmentBookingSummary = {
  id: string;
  customerId: string;
  propertyId: string | null;
  bookingType: CxBookingType;
  status: CxBookingStatus;
  subject: string;
  preferredDate: string | null;
  preferredTimeWindow: string | null;
  jobNotes: string | null;
  photoUrls: string[];
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CxCustomerDocumentSummary = {
  id: string;
  documentId: string | null;
  accessType: CxDocumentAccessType;
  title: string;
  fileName: string | null;
  version: number;
  createdAt: string;
};

export type CxReviewFeedbackSummary = {
  id: string;
  customerId: string;
  jobId: string | null;
  reviewType: CxReviewType;
  status: CxReviewStatus;
  rating: number | null;
  subject: string;
  feedback: string;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CxLoyaltyProgramSummary = {
  id: string;
  name: string;
  tier: CxLoyaltyTier;
  pointsRequired: number;
  rewardDescription: string | null;
  discountPercent: number | null;
  isActive: boolean;
};

export type CxLoyaltyReferralSummary = {
  id: string;
  referrerCustomerId: string;
  referredEmail: string;
  referredCustomerId: string | null;
  status: CxReferralStatus;
  rewardApplied: boolean;
  invitedAt: string;
  convertedAt: string | null;
};

export type CxEngagementPreferencesSummary = {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  marketingEnabled: boolean;
  trackingConsent: boolean;
  preferences: Record<string, unknown>;
};

export type CxTechnicianTrackingSummary = {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  technicianName: string | null;
  etaAt: string | null;
  trackingEnabled: boolean;
  trackingConsent: boolean;
  liveLocationAvailable: boolean;
  lastKnownLocation: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  } | null;
  progressPercent: number | null;
  dispatchNotifications: Array<{
    notificationType: string;
    status: string;
    sentAt: string | null;
  }>;
};

export type CxAnalyticsSummary = {
  portalUsageCount: number;
  mobileUsageCount: number;
  bookingConversionRate: number | null;
  customerSatisfactionScore: number | null;
  avgResponseTimeHours: number | null;
  technicianArrivalAccuracy: number | null;
  referralCount: number;
  loyaltyParticipationCount: number;
  capturedAt: string | null;
};

export type CxCustomerDashboard = {
  customerName: string;
  companyName: string;
  permissions: PortalAccessPermission[];
  activeJobCount: number;
  completedJobCount: number;
  pendingQuoteCount: number;
  outstandingInvoiceCount: number;
  outstandingBalanceCents: number;
  currency: string;
  upcomingAppointmentCount: number;
  unreadNotificationCount: number;
  openBookingCount: number;
  openReviewCount: number;
  referralCount: number;
  activeJobs: JobSummary[];
  pendingQuotes: QuoteSummary[];
  recentInvoices: InvoiceSummary[];
  upcomingAppointments: PortalAppointmentSummary[];
  recentCommunications: CommunicationSummary[];
  notifications: NotificationSummary[];
  properties: CxCustomerPropertySummary[];
  openBookings: CxAppointmentBookingSummary[];
  recentDocuments: CxCustomerDocumentSummary[];
  loyaltyPrograms: CxLoyaltyProgramSummary[];
  engagementPreferences: CxEngagementPreferencesSummary | null;
};

export type EnterpriseCustomerExperienceDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: CxPlatformConfigSummary;
  portalUserCount: number;
  activeBookingCount: number;
  pendingApprovalBookingCount: number;
  openReviewCount: number;
  referralCount: number;
  loyaltyProgramCount: number;
  analytics: CxAnalyticsSummary;
  recentBookings: CxAppointmentBookingSummary[];
  recentReviews: CxReviewFeedbackSummary[];
  recentReferrals: CxLoyaltyReferralSummary[];
  trackingEnabled: boolean;
  pwaEnabled: boolean;
  cartrackConnected: boolean;
};

export type EnterpriseCustomerExperienceAuraContext = {
  activeBookingCount: number;
  pendingApprovalBookingCount: number;
  openReviewCount: number;
  referralCount: number;
  portalUsageCount: number;
  customerSatisfactionScore: number | null;
  recentBookings: Array<{
    subject: string;
    status: CxBookingStatus;
    bookingType: CxBookingType;
    createdAt: string;
  }>;
};

export type CreateCxCustomerPropertyRequest = {
  propertyName: string;
  addressLine1?: string;
  addressLine2?: string;
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  unitNumber?: string;
  isPrimary?: boolean;
};

export type CreateCxAppointmentBookingRequest = {
  bookingType?: CxBookingType;
  subject: string;
  propertyId?: string;
  preferredDate?: string;
  preferredTimeWindow?: string;
  jobNotes?: string;
  photoUrls?: string[];
  payload?: Record<string, unknown>;
};

export type CreateCxReviewFeedbackRequest = {
  reviewType: CxReviewType;
  subject: string;
  feedback: string;
  rating?: number;
  jobId?: string;
};

export type CreateCxLoyaltyReferralRequest = {
  referredEmail: string;
};

export type CreateCxLoyaltyProgramRequest = {
  name: string;
  tier?: CxLoyaltyTier;
  pointsRequired?: number;
  rewardDescription?: string;
  discountPercent?: number;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateCxPlatformConfigRequest = {
  globalPolicies?: Record<string, unknown>;
  brandingTemplates?: Record<string, unknown>;
  portalDefaults?: Record<string, unknown>;
  communicationPolicies?: Record<string, unknown>;
  engagementRules?: Record<string, unknown>;
  loyaltySettings?: Record<string, unknown>;
  trackingEnabled?: boolean;
  pwaEnabled?: boolean;
};

export type UpdateCxEngagementPreferencesRequest = {
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  marketingEnabled?: boolean;
  trackingConsent?: boolean;
  preferences?: Record<string, unknown>;
};

export type CxDocumentCentre = {
  documents: CxCustomerDocumentSummary[];
  invoices: InvoiceSummary[];
  quotes: QuoteSummary[];
};

export type CxFinanceCentre = {
  outstandingBalanceCents: number;
  currency: string;
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
};

export type CxCommunicationCentre = {
  communications: CommunicationSummary[];
  supportTicketCount: number;
  pendingRequestCount: number;
};
