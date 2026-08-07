export type SaasTenantKind = 'platform_owner' | 'customer';

export type SaasTenantLifecycle = 'provisioning' | 'active' | 'suspended' | 'cancelled';

export type SaasSubscriptionStatus =
  'trial' | 'active' | 'grace_period' | 'suspended' | 'cancelled';

export type SaasPlanTier =
  | 'free_trial'
  | 'starter'
  | 'business'
  | 'pro'
  | 'professional' // legacy alias of pro
  | 'enterprise';

export type SaasBillingInterval = 'monthly' | 'annual';

export type SaasBillingRecordType = 'invoice' | 'payment' | 'renewal' | 'credit' | 'coupon' | 'tax';

export type SaasBillingRecordStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'void';

export type SaasPlatformActionType =
  | 'tenant_provision'
  | 'tenant_suspend'
  | 'tenant_reactivate'
  | 'plan_upgrade'
  | 'plan_downgrade'
  | 'subscription_cancel'
  | 'branding_update'
  | 'feature_flag_update';

export type SaasPlatformActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

/**
 * Plan limits JSONB — extended for seats/fair-use without a parallel billing system.
 * Prefer building catalogs via saas-packages.ts TITAN_CANONICAL_PLANS.
 */
export type SaasPlanLimits = {
  users?: number;
  storageMb?: number;
  apiRequests?: number;
  aiTokens?: number;
  integrations?: number;
  seats?: {
    adminOffice: number | null;
    technician: number | null;
    total?: number | null;
  };
  fairUse?: {
    aiTokensMonthly?: number | null;
    storageMb?: number | null;
    communicationsMonthly?: number | null;
    photosMonthly?: number | null;
    highVolumeIntegrations?: number | null;
    approachingPercent?: number;
    warningPercent?: number;
  };
  extraSeatPricing?: {
    technicianCents?: number | null;
    adminOfficeCents?: number | null;
    currency?: string;
    pricingConfigurable?: boolean;
  };
};

export type SaasCommercialConfig = {
  indicativeBandMinCents?: number | null;
  indicativeBandMaxCents?: number | null;
  pricingConfigurable: boolean;
  pricingLocked: boolean;
  notes?: string;
  costInclusions?: Record<string, string>;
};

export type SaasExtraSeatEntitlements = {
  adminOffice?: number;
  technician?: number;
  total?: number;
};

export type SaasOverLimitState = 'none' | 'action_required';

export type SaasFairUseState =
  | 'normal'
  | 'approaching'
  | 'warning'
  | 'overage_upgrade_required'
  | 'restricted';

export type SaasSeatUsage = {
  adminOfficeUsed: number;
  technicianUsed: number;
  totalUsed: number;
};

export type SaasTenantSummary = {
  companyId: string;
  companyName: string;
  companySlug: string;
  tenantKind: SaasTenantKind;
  lifecycleStatus: SaasTenantLifecycle;
  subscriptionStatus: SaasSubscriptionStatus | null;
  planName: string | null;
  branchCount: number;
  userCount: number;
  provisionedAt: string | null;
  createdAt: string;
  /** Platform Owner control-plane fields (metadata only — not tenant business content). */
  primaryContactEmail?: string | null;
  primaryContactName?: string | null;
  paidThroughAt?: string | null;
  accessState?: 'allowed' | 'suspended';
  subscriptionDisplayStatus?: string | null;
  paymentFailed?: boolean;
  lastSuccessfulPaymentAt?: string | null;
  lastPaymentFailedAt?: string | null;
  suspensionReason?: string | null;
  cancellationState?: 'none' | 'cancelled';
  reactivationEligible?: boolean;
  lastAccessAction?: string | null;
  lastAccessActionAt?: string | null;
  statusChip?: string | null;
};

export type SaasTenantBranchSummary = {
  id: string;
  branchKey: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type SaasSubscriptionPlanSummary = {
  id: string;
  planKey: string;
  name: string;
  description: string;
  tier: SaasPlanTier;
  priceCents: number;
  billingInterval: SaasBillingInterval;
  features: string[];
  limits: SaasPlanLimits;
  isActive: boolean;
  currency?: string;
  pricingConfigurable?: boolean;
  commercialConfig?: SaasCommercialConfig | null;
  activeTenantCount?: number;
};

export type SaasSubscriptionSummary = {
  id: string;
  status: SaasSubscriptionStatus;
  plan: SaasSubscriptionPlanSummary | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEndsAt: string | null;
  cancelledAt: string | null;
  subscriptionEnforced: boolean;
  paidThroughAt?: string | null;
  lastSuccessfulPaymentAt?: string | null;
  lastPaymentFailedAt?: string | null;
  scheduledPlanId?: string | null;
  scheduledChangeType?: 'upgrade' | 'downgrade' | null;
  scheduledChangeAt?: string | null;
  overLimitState?: SaasOverLimitState;
  overLimitDetails?: Record<string, unknown> | null;
  extraSeatEntitlements?: SaasExtraSeatEntitlements;
  currency?: string;
};

export type SaasBillingRecordSummary = {
  id: string;
  recordType: SaasBillingRecordType;
  status: SaasBillingRecordStatus;
  amountCents: number;
  currency: string;
  description: string;
  issuedAt: string;
};

export type SaasBrandingProfileSummary = {
  id: string;
  logoUrl: string | null;
  companyDisplayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  emailBranding: Record<string, unknown>;
  pdfBranding: Record<string, unknown>;
  invoiceBranding: Record<string, unknown>;
  portalBranding: Record<string, unknown>;
  loginBranding: Record<string, unknown>;
  mobileBranding: Record<string, unknown>;
};

export type SaasFeatureEntitlementSummary = {
  id: string;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
};

export type SaasFeatureFlagSummary = {
  id: string;
  flagKey: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  tenantEnabled: boolean | null;
};

export type SaasUsageSummary = {
  userCount: number;
  storageBytes: number;
  apiRequestCount: number;
  aiUsageCount: number;
  integrationCount: number;
  capturedAt: string | null;
};

export type SaasPlatformAnalyticsSummary = {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  trialTenants: number;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
};

export type SaasPlatformAuditSummary = {
  id: string;
  actionType: string;
  subject: string;
  details: string | null;
  performedAt: string;
};

export type SaasPlatformActionSummary = {
  id: string;
  actionType: SaasPlatformActionType;
  status: SaasPlatformActionStatus;
  subject: string;
  recommendation: string;
  targetCompanyId: string | null;
  createdAt: string;
};

export type SaasSeatStatusSummary = {
  usage: SaasSeatUsage;
  adminOfficeIncluded: number | null;
  technicianIncluded: number | null;
  totalIncluded: number | null;
  adminOfficePermitted: number | null;
  technicianPermitted: number | null;
  totalPermitted: number | null;
  overLimitState: SaasOverLimitState;
};

export type SaasFairUseStatusSummary = {
  overall: SaasFairUseState;
  metrics: Array<{
    metric: string;
    state: SaasFairUseState;
    used: number;
    allowance: number | null;
    percentUsed: number | null;
    message: string;
  }>;
};

/** Tenant Owner–safe subscription view (no internal margin/provider secrets). */
export type SaasTenantSubscriptionView = {
  companyName: string;
  plan: SaasSubscriptionPlanSummary | null;
  subscription: SaasSubscriptionSummary | null;
  seats: SaasSeatStatusSummary;
  fairUse: SaasFairUseStatusSummary;
  paidThroughAt: string | null;
  nextRenewalAt: string | null;
  billingAttention: boolean;
  upgradePlans: SaasSubscriptionPlanSummary[];
  entitlements: SaasFeatureEntitlementSummary[];
};

export type EnterpriseSaasPlatformDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  subscriptionEnforced: boolean;
  tenantProfile: {
    tenantKind: SaasTenantKind;
    lifecycleStatus: SaasTenantLifecycle;
    branchLabel: string | null;
    storageAllocationMb: number;
    provisionedAt: string | null;
  } | null;
  subscription: SaasSubscriptionSummary | null;
  branding: SaasBrandingProfileSummary | null;
  usage: SaasUsageSummary;
  entitlements: SaasFeatureEntitlementSummary[];
  featureFlags: SaasFeatureFlagSummary[];
  tenants: SaasTenantSummary[];
  plans: SaasSubscriptionPlanSummary[];
  billingRecords: SaasBillingRecordSummary[];
  branches: SaasTenantBranchSummary[];
  platformAnalytics: SaasPlatformAnalyticsSummary | null;
  recentAudits: SaasPlatformAuditSummary[];
  pendingActionCount: number;
  seatStatus?: SaasSeatStatusSummary | null;
  fairUseStatus?: SaasFairUseStatusSummary | null;
};

export type EnterpriseSaasPlatformAuraContext = {
  summary: string;
  isPlatformOwner: boolean;
  tenantCount: number;
  activeSubscriptionCount: number;
  pendingActionCount: number;
  subscriptionStatus: SaasSubscriptionStatus | null;
};

export type CreateSaasSubscriptionPlanRequest = {
  planKey: string;
  name: string;
  description: string;
  tier: SaasPlanTier;
  priceCents?: number;
  billingInterval?: SaasBillingInterval;
  features?: string[];
  limits?: SaasPlanLimits;
  currency?: string;
  pricingConfigurable?: boolean;
  commercialConfig?: SaasCommercialConfig | null;
};

export type UpdateSaasSubscriptionPlanRequest = {
  name?: string;
  description?: string;
  priceCents?: number;
  billingInterval?: SaasBillingInterval;
  features?: string[];
  limits?: SaasPlanLimits;
  isActive?: boolean;
  currency?: string;
  pricingConfigurable?: boolean;
  commercialConfig?: SaasCommercialConfig | null;
};

export type AssignSaasPlanRequest = {
  planId: string;
  reason?: string | null;
  /** Extra seats beyond plan included (configurable; pricing not locked). */
  extraSeatEntitlements?: SaasExtraSeatEntitlements | null;
};

export type ScheduleSaasPlanChangeRequest = {
  planId: string;
  changeType: 'upgrade' | 'downgrade';
  effectiveAt?: string | null;
  reason?: string | null;
};

export type UpdateSaasBrandingRequest = {
  logoUrl?: string | null;
  companyDisplayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  emailBranding?: Record<string, unknown>;
  pdfBranding?: Record<string, unknown>;
  invoiceBranding?: Record<string, unknown>;
  portalBranding?: Record<string, unknown>;
  loginBranding?: Record<string, unknown>;
  mobileBranding?: Record<string, unknown>;
};

export type ProvisionSaasTenantRequest = {
  companyName: string;
  branchLabel?: string | null;
  planId?: string | null;
};

export type CreateSaasPlatformActionRequest = {
  actionType: SaasPlatformActionType;
  subject: string;
  recommendation: string;
  targetCompanyId?: string | null;
  payload?: Record<string, unknown>;
};

export type ChangeSaasSubscriptionPlanRequest = {
  planId: string;
};

export type CreateSaasFeatureFlagRequest = {
  flagKey: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
};

export type CreateSaasTenantBranchRequest = {
  branchKey: string;
  name: string;
};

export type MarkPlatformOwnerRequest = {
  confirm: true;
};
