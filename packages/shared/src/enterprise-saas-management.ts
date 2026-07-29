import type {
  EnterpriseSaasPlatformDashboard,
  SaasBillingRecordSummary,
  SaasSubscriptionPlanSummary,
  SaasSubscriptionSummary,
  SaasTenantSummary,
  SaasUsageSummary,
} from './enterprise-saas-platform.js';

export type SmAccountTypeKey =
  | 'trial'
  | 'active'
  | 'suspended'
  | 'cancelled'
  | 'expired_trial'
  | 'enterprise'
  | 'lifetime'
  | 'internal';

export type SmPlatformConfigSummary = {
  billingPolicy: Record<string, unknown>;
  provisioningPolicy: Record<string, unknown>;
  licensingPolicy: Record<string, unknown>;
  partnerPolicy: Record<string, unknown>;
  usagePolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type SmAccountTypeSummary = {
  id: string;
  accountTypeKey: SmAccountTypeKey;
  name: string;
  description: string | null;
  isSystemType: boolean;
};

export type SmLicenseSummary = {
  id: string;
  targetCompanyId: string;
  licenseKey: string;
  licenseType: string;
  status: string;
  seatLimit: number | null;
  seatsUsed: number;
  deviceTrackingEnabled: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type SmLicenseHistorySummary = {
  id: string;
  licenseId: string;
  changeType: string;
  previousStatus: string | null;
  newStatus: string | null;
  notes: string | null;
  createdAt: string;
};

export type SmPaymentProviderSummary = {
  id: string;
  providerKey: string;
  name: string;
  enabled: boolean;
  supportedCurrencies: string[];
  workflowStatus: string;
};

export type SmBillingPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  workflowStatus: string;
  createdAt: string;
};

export type SmCouponSummary = {
  id: string;
  couponCode: string;
  name: string;
  discountType: string;
  discountValue: number;
  currency: string;
  redemptionCount: number;
  maxRedemptions: number | null;
  workflowStatus: string;
};

export type SmAddOnSummary = {
  id: string;
  addOnKey: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingInterval: string;
  features: string[];
  workflowStatus: string;
};

export type SmTenantAddOnSummary = {
  id: string;
  targetCompanyId: string;
  addOnKey: string;
  addOnName: string;
  status: string;
  purchasedAt: string;
  expiresAt: string | null;
};

export type SmPartnerAccountSummary = {
  id: string;
  partnerCompanyId: string;
  partnerType: string;
  name: string;
  whiteLabelEnabled: boolean;
  workflowStatus: string;
  managedTenantCount: number;
};

export type SmPartnerCommissionSummary = {
  id: string;
  partnerAccountId: string;
  targetCompanyId: string | null;
  amountCents: number;
  currency: string;
  commissionType: string;
  status: string;
  earnedAt: string;
};

export type SmUsageThresholdSummary = {
  id: string;
  targetCompanyId: string | null;
  metricKey: string;
  warningPercent: number;
  criticalPercent: number;
  limitValue: number | null;
};

export type SmUsageMonitoringSummary = {
  userCount: number;
  storageBytes: number;
  apiRequestCount: number;
  aiUsageCount: number;
  documentCount: number;
  automationCount: number;
  integrationCount: number;
  industryPackCount: number;
  alerts: string[];
};

export type SmNotificationSummary = {
  id: string;
  notificationType: string;
  title: string;
  message: string | null;
  status: string;
  targetCompanyId: string | null;
  createdAt: string;
};

export type SmSaasAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  targetCompanyId: string | null;
  createdAt: string;
};

export type SmActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type SmAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type SmAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type SmBillingHealthSummary = {
  failedPaymentCount: number;
  pendingRenewalCount: number;
  openAlertCount: number;
  overallBillingHealthStatus: string;
};

export type SmOwnerBillingSummary = {
  subscription: SaasSubscriptionSummary | null;
  billingRecords: SaasBillingRecordSummary[];
  usage: SaasUsageSummary;
  plans: SaasSubscriptionPlanSummary[];
  addOns: SmTenantAddOnSummary[];
};

export type EnterpriseSaasManagementDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: SmPlatformConfigSummary;
  legacySaasPlatform: EnterpriseSaasPlatformDashboard | null;
  accountTypeCount: number;
  activeSubscriptionCount: number;
  trialExpirationCount: number;
  failedPaymentCount: number;
  openAlertCount: number;
  licenseCount: number;
  partnerCount: number;
  overallBillingHealthStatus: string;
  billingHealth: SmBillingHealthSummary;
  usageMonitoring: SmUsageMonitoringSummary;
  analytics: SmAnalyticsSummary | null;
  tenants: SaasTenantSummary[];
  plans: SaasSubscriptionPlanSummary[];
  subscriptions: SaasSubscriptionSummary[];
  licenses: SmLicenseSummary[];
  billingRecords: SaasBillingRecordSummary[];
  addOns: SmAddOnSummary[];
  partners: SmPartnerAccountSummary[];
  recentAlerts: SmSaasAlertSummary[];
  recentNotifications: SmNotificationSummary[];
};

export type EnterpriseSaasManagementAuraContext = {
  summary: string;
  isPlatformOwner: boolean;
  activeSubscriptionCount: number;
  trialExpirationCount: number;
  failedPaymentCount: number;
  openAlertCount: number;
  licenseCount: number;
  overallBillingHealthStatus: string;
};

export type UpdateSmPlatformConfigRequest = {
  billingPolicy?: Record<string, unknown>;
  provisioningPolicy?: Record<string, unknown>;
  licensingPolicy?: Record<string, unknown>;
  partnerPolicy?: Record<string, unknown>;
  usagePolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateSmLicenseRequest = {
  targetCompanyId: string;
  licenseKey: string;
  licenseType: string;
  seatLimit?: number;
  deviceTrackingEnabled?: boolean;
  expiresAt?: string;
};

export type CreateSmPaymentProviderRequest = {
  providerKey: string;
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  supportedCurrencies?: string[];
};

export type CreateSmBillingPolicyRequest = {
  policyKey: string;
  name: string;
  retryPolicy?: Record<string, unknown>;
  prorationPolicy?: Record<string, unknown>;
  taxPolicy?: Record<string, unknown>;
  currencyPolicy?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateSmCouponRequest = {
  couponCode: string;
  name: string;
  discountType: string;
  discountValue: number;
  currency?: string;
  maxRedemptions?: number;
  validFrom?: string;
  validUntil?: string;
};

export type CreateSmAddOnRequest = {
  addOnKey: string;
  name: string;
  description?: string;
  priceCents?: number;
  currency?: string;
  billingInterval?: string;
  features?: string[];
  limits?: Record<string, unknown>;
};

export type CreateSmPartnerAccountRequest = {
  partnerCompanyId: string;
  partnerType: string;
  name: string;
  whiteLabelEnabled?: boolean;
  pricingPolicy?: Record<string, unknown>;
};

export type CreateSmUsageThresholdRequest = {
  targetCompanyId?: string;
  metricKey: string;
  warningPercent?: number;
  criticalPercent?: number;
  limitValue?: number;
  config?: Record<string, unknown>;
};

export type CreateSmFeatureAccessRuleRequest = {
  featureKey: string;
  scopeType: string;
  scopeRef?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type CreateSmActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export const SM_USAGE_METRIC_KEYS = [
  'users',
  'storage',
  'api_calls',
  'ai_requests',
  'documents',
  'automations',
  'integrations',
  'industry_packs',
] as const;

export const SM_NOTIFICATION_TYPES = [
  'trial_ending',
  'payment_failed',
  'renewal_due',
  'license_expiry',
  'usage_limit_reached',
  'subscription_changed',
] as const;
