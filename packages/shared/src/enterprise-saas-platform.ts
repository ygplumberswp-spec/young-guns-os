export type SaasTenantKind = 'platform_owner' | 'customer';

export type SaasTenantLifecycle = 'provisioning' | 'active' | 'suspended' | 'cancelled';

export type SaasSubscriptionStatus =
  'trial' | 'active' | 'grace_period' | 'suspended' | 'cancelled';

export type SaasPlanTier = 'free_trial' | 'starter' | 'professional' | 'enterprise';

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

export type SaasPlanLimits = {
  users?: number;
  storageMb?: number;
  apiRequests?: number;
  aiTokens?: number;
  integrations?: number;
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
