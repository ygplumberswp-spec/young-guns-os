/**
 * Department 21 — TITAN SaaS packages, seats, fair-use, and cost-model hooks.
 *
 * Configurable plan catalog (staging defaults). Exact public launch pricing is NOT locked.
 * Extends existing saas_* plan/subscription/entitlement architecture — no parallel billing system.
 */

import type {
  SaasBillingInterval,
  SaasCommercialConfig,
  SaasExtraSeatEntitlements,
  SaasFairUseState,
  SaasOverLimitState,
  SaasPlanLimits,
  SaasPlanTier,
  SaasSeatUsage,
} from './enterprise-saas-platform.js';


/** Commercial package keys — map onto saas_plan_tier (+ professional legacy). */
export type TitanPackageKey = 'starter' | 'business' | 'pro' | 'enterprise';

export type SaasSeatCategory = 'admin_office' | 'technician' | 'total';

export type SaasCostTruth = 'unknown' | 'not_available' | 'estimated' | 'actual';

export type SaasCostCategory =
  | 'hosting'
  | 'database'
  | 'storage'
  | 'ai_model_usage'
  | 'maps'
  | 'email'
  | 'whatsapp_comms'
  | 'payment_integration'
  | 'monitoring'
  | 'backups'
  | 'support_allocation'
  | 'other';

/** Included vs customer-connected vs metered vs add-on. */
export type SaasCostInclusion =
  | 'included_titan_cost'
  | 'customer_connected_external_account'
  | 'metered_fair_use'
  | 'optional_add_on';

/** Canonical capability / entitlement feature keys (server-enforced). */
export const SAAS_FEATURE_KEYS = {
  core_customers: 'core_customers',
  core_jobs: 'core_jobs',
  core_scheduling: 'core_scheduling',
  core_quotes_invoices: 'core_quotes_invoices',
  core_technician_mobile: 'core_technician_mobile',
  core_job_cards: 'core_job_cards',
  core_photos: 'core_photos',
  core_signatures: 'core_signatures',
  core_payments_status: 'core_payments_status',
  core_aura_basic: 'core_aura_basic',
  core_reporting: 'core_reporting',
  advanced_analytics: 'advanced_analytics',
  advanced_aura: 'advanced_aura',
  fleet_features: 'fleet_features',
  advanced_finance_jpe: 'advanced_finance_jpe',
  multi_branch: 'multi_branch',
  advanced_rbac_security: 'advanced_rbac_security',
  priority_support: 'priority_support',
  custom_enterprise: 'custom_enterprise',
} as const;

export type SaasFeatureKey = (typeof SAAS_FEATURE_KEYS)[keyof typeof SAAS_FEATURE_KEYS];

export const CORE_OPERATIONAL_FEATURES: SaasFeatureKey[] = [
  SAAS_FEATURE_KEYS.core_customers,
  SAAS_FEATURE_KEYS.core_jobs,
  SAAS_FEATURE_KEYS.core_scheduling,
  SAAS_FEATURE_KEYS.core_quotes_invoices,
  SAAS_FEATURE_KEYS.core_technician_mobile,
  SAAS_FEATURE_KEYS.core_job_cards,
  SAAS_FEATURE_KEYS.core_photos,
  SAAS_FEATURE_KEYS.core_signatures,
  SAAS_FEATURE_KEYS.core_payments_status,
  SAAS_FEATURE_KEYS.core_aura_basic,
  SAAS_FEATURE_KEYS.core_reporting,
];

export type SaasSeatLimits = NonNullable<SaasPlanLimits['seats']>;
export type SaasFairUseAllowances = NonNullable<SaasPlanLimits['fairUse']>;

/** Extended plan limits — alias of SaasPlanLimits for catalog clarity. */
export type SaasPlanLimitsExtended = SaasPlanLimits;

export type SaasCanonicalPlanDefinition = {
  planKey: string;
  name: string;
  description: string;
  tier: SaasPlanTier;
  packageKey: TitanPackageKey;
  billingInterval: SaasBillingInterval;
  /** Staging default priceCents — configurable, not final. */
  priceCents: number;
  currency: string;
  features: SaasFeatureKey[];
  limits: SaasPlanLimitsExtended;
  commercial: SaasCommercialConfig;
};

const COST_INCLUSIONS_STANDARD: Partial<Record<SaasCostCategory, SaasCostInclusion>> = {
  hosting: 'included_titan_cost',
  database: 'included_titan_cost',
  storage: 'metered_fair_use',
  ai_model_usage: 'metered_fair_use',
  maps: 'metered_fair_use',
  email: 'metered_fair_use',
  whatsapp_comms: 'customer_connected_external_account',
  payment_integration: 'customer_connected_external_account',
  monitoring: 'included_titan_cost',
  backups: 'included_titan_cost',
  support_allocation: 'included_titan_cost',
};

/**
 * Canonical TITAN package catalog (staging defaults).
 * Prices are configurable indicative bands — NOT locked launch pricing.
 */
export const TITAN_CANONICAL_PLANS: SaasCanonicalPlanDefinition[] = [
  {
    planKey: 'titan_starter',
    name: 'TITAN Starter',
    description:
      'Small trade business — full core operations with lean seats and fair-use allowances. Not a demo cripple.',
    tier: 'starter',
    packageKey: 'starter',
    billingInterval: 'monthly',
    priceCents: 224_900, // R2,249 staging midpoint of R1,999–R2,499
    currency: 'ZAR',
    features: [...CORE_OPERATIONAL_FEATURES],
    limits: {
      users: 4,
      storageMb: 5_120,
      apiRequests: 50_000,
      aiTokens: 250_000,
      integrations: 3,
      seats: { adminOffice: 1, technician: 1, total: 4 },
      fairUse: {
        aiTokensMonthly: 250_000,
        storageMb: 5_120,
        communicationsMonthly: 2_000,
        photosMonthly: 2_000,
        highVolumeIntegrations: 3,
      },
      extraSeatPricing: {
        technicianCents: null,
        adminOfficeCents: null,
        currency: 'ZAR',
        pricingConfigurable: true,
      },
    },
    commercial: {
      indicativeBandMinCents: 199_900,
      indicativeBandMaxCents: 249_900,
      pricingConfigurable: true,
      pricingLocked: false,
      notes: 'Staging indicative band R1,999–R2,499/month. Final launch price TBD after cost validation.',
      costInclusions: COST_INCLUSIONS_STANDARD,
    },
  },
  {
    planKey: 'titan_business',
    name: 'TITAN Business',
    description: 'Growing trade company — more seats, higher allowances, analytics and fleet basics.',
    tier: 'business',
    packageKey: 'business',
    billingInterval: 'monthly',
    priceCents: 474_900, // R4,749 staging midpoint of R3,999–R5,499
    currency: 'ZAR',
    features: [
      ...CORE_OPERATIONAL_FEATURES,
      SAAS_FEATURE_KEYS.advanced_analytics,
      SAAS_FEATURE_KEYS.fleet_features,
    ],
    limits: {
      users: 10,
      storageMb: 20_480,
      apiRequests: 150_000,
      aiTokens: 1_000_000,
      integrations: 8,
      seats: { adminOffice: 2, technician: 5, total: 10 },
      fairUse: {
        aiTokensMonthly: 1_000_000,
        storageMb: 20_480,
        communicationsMonthly: 8_000,
        photosMonthly: 8_000,
        highVolumeIntegrations: 8,
      },
      extraSeatPricing: {
        technicianCents: null,
        adminOfficeCents: null,
        currency: 'ZAR',
        pricingConfigurable: true,
      },
    },
    commercial: {
      indicativeBandMinCents: 399_900,
      indicativeBandMaxCents: 549_900,
      pricingConfigurable: true,
      pricingLocked: false,
      notes: 'Staging indicative band R3,999–R5,499/month. Final launch price TBD.',
      costInclusions: COST_INCLUSIONS_STANDARD,
    },
  },
  {
    planKey: 'titan_pro',
    name: 'TITAN Pro',
    description:
      'Larger operating team — advanced AURA, finance/JPE, multi-branch readiness, higher fair-use.',
    tier: 'pro',
    packageKey: 'pro',
    billingInterval: 'monthly',
    priceCents: 799_900, // R7,999 staging midpoint of R6,999–R8,999
    currency: 'ZAR',
    features: [
      ...CORE_OPERATIONAL_FEATURES,
      SAAS_FEATURE_KEYS.advanced_analytics,
      SAAS_FEATURE_KEYS.advanced_aura,
      SAAS_FEATURE_KEYS.fleet_features,
      SAAS_FEATURE_KEYS.advanced_finance_jpe,
      SAAS_FEATURE_KEYS.multi_branch,
      SAAS_FEATURE_KEYS.advanced_rbac_security,
    ],
    limits: {
      users: 20,
      storageMb: 51_200,
      apiRequests: 400_000,
      aiTokens: 3_000_000,
      integrations: 20,
      seats: { adminOffice: 3, technician: 10, total: 20 },
      fairUse: {
        aiTokensMonthly: 3_000_000,
        storageMb: 51_200,
        communicationsMonthly: 20_000,
        photosMonthly: 20_000,
        highVolumeIntegrations: 20,
      },
      extraSeatPricing: {
        technicianCents: null,
        adminOfficeCents: null,
        currency: 'ZAR',
        pricingConfigurable: true,
      },
    },
    commercial: {
      indicativeBandMinCents: 699_900,
      indicativeBandMaxCents: 899_900,
      pricingConfigurable: true,
      pricingLocked: false,
      notes: 'Staging indicative band R6,999–R8,999/month. Final launch price TBD.',
      costInclusions: {
        ...COST_INCLUSIONS_STANDARD,
        support_allocation: 'included_titan_cost',
      },
    },
  },
  {
    planKey: 'titan_enterprise',
    name: 'TITAN Enterprise',
    description:
      'Custom commercial agreement — configurable staff limits, branches, priority support, enterprise controls.',
    tier: 'enterprise',
    packageKey: 'enterprise',
    billingInterval: 'monthly',
    priceCents: 0, // Custom / negotiated
    currency: 'ZAR',
    features: [
      ...CORE_OPERATIONAL_FEATURES,
      SAAS_FEATURE_KEYS.advanced_analytics,
      SAAS_FEATURE_KEYS.advanced_aura,
      SAAS_FEATURE_KEYS.fleet_features,
      SAAS_FEATURE_KEYS.advanced_finance_jpe,
      SAAS_FEATURE_KEYS.multi_branch,
      SAAS_FEATURE_KEYS.advanced_rbac_security,
      SAAS_FEATURE_KEYS.priority_support,
      SAAS_FEATURE_KEYS.custom_enterprise,
    ],
    limits: {
      users: undefined,
      storageMb: 204_800,
      apiRequests: null as unknown as undefined,
      aiTokens: 10_000_000,
      integrations: 100,
      seats: { adminOffice: null, technician: null, total: null },
      fairUse: {
        aiTokensMonthly: 10_000_000,
        storageMb: 204_800,
        communicationsMonthly: 100_000,
        photosMonthly: 100_000,
        highVolumeIntegrations: 100,
      },
      extraSeatPricing: {
        technicianCents: null,
        adminOfficeCents: null,
        currency: 'ZAR',
        pricingConfigurable: true,
      },
    },
    commercial: {
      indicativeBandMinCents: null,
      indicativeBandMaxCents: null,
      pricingConfigurable: true,
      pricingLocked: false,
      notes: 'Custom / negotiated. Configurable limits. Not unlimited high-cost provider usage.',
      costInclusions: {
        ...COST_INCLUSIONS_STANDARD,
        support_allocation: 'included_titan_cost',
      },
    },
  },
];

export function packageKeyFromTier(tier: SaasPlanTier | string): TitanPackageKey | null {
  if (tier === 'starter') return 'starter';
  if (tier === 'business') return 'business';
  if (tier === 'pro' || tier === 'professional') return 'pro';
  if (tier === 'enterprise') return 'enterprise';
  return null;
}

export function resolveSeatCategory(roleName: string): SaasSeatCategory | null {
  const name = roleName.trim();
  if (name === 'Technician') return 'technician';
  if (
    name === 'Manager' ||
    name === 'Dispatcher' ||
    name === 'Accountant' ||
    name === 'Admin' ||
    name === 'Office'
  ) {
    return 'admin_office';
  }
  // Company Owner / Platform Owner / Client do not consume package seat pools via invite.
  return null;
}

export type SaasSeatAllowance = {
  adminOfficeIncluded: number | null;
  technicianIncluded: number | null;
  totalIncluded: number | null;
  adminOfficeExtra: number;
  technicianExtra: number;
  totalExtra: number;
  adminOfficePermitted: number | null;
  technicianPermitted: number | null;
  totalPermitted: number | null;
};

export function resolveSeatAllowance(
  limits: SaasPlanLimitsExtended | null | undefined,
  extra: SaasExtraSeatEntitlements | null | undefined,
): SaasSeatAllowance {
  const seats = limits?.seats;
  const adminOfficeIncluded = seats?.adminOffice ?? limits?.users ?? null;
  const technicianIncluded = seats?.technician ?? null;
  const totalIncluded = seats?.total ?? limits?.users ?? null;
  const adminOfficeExtra = Math.max(0, extra?.adminOffice ?? 0);
  const technicianExtra = Math.max(0, extra?.technician ?? 0);
  const totalExtra = Math.max(0, extra?.total ?? 0);

  return {
    adminOfficeIncluded,
    technicianIncluded,
    totalIncluded,
    adminOfficeExtra,
    technicianExtra,
    totalExtra,
    adminOfficePermitted:
      adminOfficeIncluded == null ? null : adminOfficeIncluded + adminOfficeExtra,
    technicianPermitted:
      technicianIncluded == null ? null : technicianIncluded + technicianExtra,
    totalPermitted: totalIncluded == null ? null : totalIncluded + totalExtra,
  };
}

export type SaasSeatDecision = {
  allowed: boolean;
  code: 'OK' | 'SEAT_LIMIT_REACHED' | 'NOT_APPLICABLE';
  message: string;
  category: SaasSeatCategory | null;
  used: number;
  included: number | null;
  permitted: number | null;
  allowance: SaasSeatAllowance;
};

/**
 * Seat gate for inviting/activating a user in a seat category.
 * Does not delete existing users when over limit — only blocks new seats.
 */
export function evaluateSeatAvailability(input: {
  roleName: string;
  usage: SaasSeatUsage;
  limits: SaasPlanLimitsExtended | null | undefined;
  extra?: SaasExtraSeatEntitlements | null;
  /** When true (platform_owner tenant), seats are not enforced. */
  bypass?: boolean;
}): SaasSeatDecision {
  const allowance = resolveSeatAllowance(input.limits, input.extra);
  if (input.bypass) {
    return {
      allowed: true,
      code: 'OK',
      message: 'Seat enforcement bypassed.',
      category: null,
      used: input.usage.totalUsed,
      included: null,
      permitted: null,
      allowance,
    };
  }

  const category = resolveSeatCategory(input.roleName);
  if (!category) {
    return {
      allowed: true,
      code: 'NOT_APPLICABLE',
      message: 'Role does not consume package seat pools.',
      category: null,
      used: input.usage.totalUsed,
      included: allowance.totalIncluded,
      permitted: allowance.totalPermitted,
      allowance,
    };
  }

  if (allowance.totalPermitted != null && input.usage.totalUsed >= allowance.totalPermitted) {
    return {
      allowed: false,
      code: 'SEAT_LIMIT_REACHED',
      message: 'Seat limit reached',
      category: 'total',
      used: input.usage.totalUsed,
      included: allowance.totalIncluded,
      permitted: allowance.totalPermitted,
      allowance,
    };
  }

  if (category === 'technician') {
    const permitted = allowance.technicianPermitted;
    if (permitted != null && input.usage.technicianUsed >= permitted) {
      return {
        allowed: false,
        code: 'SEAT_LIMIT_REACHED',
        message: 'Seat limit reached',
        category: 'technician',
        used: input.usage.technicianUsed,
        included: allowance.technicianIncluded,
        permitted,
        allowance,
      };
    }
  }

  if (category === 'admin_office') {
    const permitted = allowance.adminOfficePermitted;
    if (permitted != null && input.usage.adminOfficeUsed >= permitted) {
      return {
        allowed: false,
        code: 'SEAT_LIMIT_REACHED',
        message: 'Seat limit reached',
        category: 'admin_office',
        used: input.usage.adminOfficeUsed,
        included: allowance.adminOfficeIncluded,
        permitted,
        allowance,
      };
    }
  }

  const used =
    category === 'technician' ? input.usage.technicianUsed : input.usage.adminOfficeUsed;
  const included =
    category === 'technician' ? allowance.technicianIncluded : allowance.adminOfficeIncluded;
  const permitted =
    category === 'technician' ? allowance.technicianPermitted : allowance.adminOfficePermitted;

  return {
    allowed: true,
    code: 'OK',
    message: 'Seat available.',
    category,
    used,
    included,
    permitted,
    allowance,
  };
}

export type SaasFairUseDecision = {
  state: SaasFairUseState;
  metric: string;
  used: number;
  allowance: number | null;
  percentUsed: number | null;
  message: string;
  /** Hard restrict only when commercially configured — default false for warning/overage. */
  restrict: boolean;
};

export function evaluateFairUse(input: {
  metric: string;
  used: number;
  allowance: number | null | undefined;
  approachingPercent?: number;
  warningPercent?: number;
  /** When true, overage becomes restricted (controlled). Default: warn/upgrade only. */
  restrictWhenOver?: boolean;
}): SaasFairUseDecision {
  const allowance = input.allowance;
  if (allowance == null || allowance <= 0) {
    // null/0 means not configured — do not grant unlimited high-cost usage implicitly.
    if (allowance === 0) {
      return {
        state: 'restricted',
        metric: input.metric,
        used: input.used,
        allowance: 0,
        percentUsed: null,
        message: 'No allowance configured for this metered feature.',
        restrict: true,
      };
    }
    return {
      state: 'normal',
      metric: input.metric,
      used: input.used,
      allowance: null,
      percentUsed: null,
      message: 'Allowance not configured — treated as not unlimited.',
      restrict: false,
    };
  }

  const percent = (input.used / allowance) * 100;
  const approaching = input.approachingPercent ?? 80;
  const warning = input.warningPercent ?? 95;

  if (percent >= 100) {
    return {
      state: 'overage_upgrade_required',
      metric: input.metric,
      used: input.used,
      allowance,
      percentUsed: percent,
      message: 'Fair-use allowance exceeded — upgrade or wait for renewal.',
      restrict: input.restrictWhenOver === true,
    };
  }
  if (percent >= warning) {
    return {
      state: 'warning',
      metric: input.metric,
      used: input.used,
      allowance,
      percentUsed: percent,
      message: 'Fair-use warning — approaching hard limit.',
      restrict: false,
    };
  }
  if (percent >= approaching) {
    return {
      state: 'approaching',
      metric: input.metric,
      used: input.used,
      allowance,
      percentUsed: percent,
      message: 'Approaching allowance.',
      restrict: false,
    };
  }
  return {
    state: 'normal',
    metric: input.metric,
    used: input.used,
    allowance,
    percentUsed: percent,
    message: 'Within fair-use allowance.',
    restrict: false,
  };
}

export type SaasDowngradeImpact = {
  overLimit: boolean;
  overLimitState: SaasOverLimitState;
  details: {
    adminOfficeUsed: number;
    adminOfficePermitted: number | null;
    technicianUsed: number;
    technicianPermitted: number | null;
    totalUsed: number;
    totalPermitted: number | null;
  };
  /** Never delete users/data — preserve and require authorised adjustment. */
  preservesExistingUsers: true;
  message: string;
};

export function evaluateDowngradeSeatImpact(input: {
  usage: SaasSeatUsage;
  targetLimits: SaasPlanLimitsExtended | null | undefined;
  extra?: SaasExtraSeatEntitlements | null;
}): SaasDowngradeImpact {
  const allowance = resolveSeatAllowance(input.targetLimits, input.extra);
  const overAdmin =
    allowance.adminOfficePermitted != null &&
    input.usage.adminOfficeUsed > allowance.adminOfficePermitted;
  const overTech =
    allowance.technicianPermitted != null &&
    input.usage.technicianUsed > allowance.technicianPermitted;
  const overTotal =
    allowance.totalPermitted != null && input.usage.totalUsed > allowance.totalPermitted;
  const overLimit = overAdmin || overTech || overTotal;

  return {
    overLimit,
    overLimitState: overLimit ? 'action_required' : 'none',
    details: {
      adminOfficeUsed: input.usage.adminOfficeUsed,
      adminOfficePermitted: allowance.adminOfficePermitted,
      technicianUsed: input.usage.technicianUsed,
      technicianPermitted: allowance.technicianPermitted,
      totalUsed: input.usage.totalUsed,
      totalPermitted: allowance.totalPermitted,
    },
    preservesExistingUsers: true,
    message: overLimit
      ? 'Plan downgrade keeps existing users and data. Seat/access adjustment required before adding more seats.'
      : 'Downgrade fits current seat usage.',
  };
}

export type SaasCostLine = {
  category: SaasCostCategory;
  amountCents: number | null;
  currency: string;
  truth: SaasCostTruth;
  inclusion: SaasCostInclusion | null;
  note?: string;
};

export type SaasMarginSnapshot = {
  revenueCents: number | null;
  currency: string;
  costLines: SaasCostLine[];
  estimatedCostCents: number | null;
  estimatedGrossMarginCents: number | null;
  truth: SaasCostTruth;
  note: string;
};

/** Build truthful margin hooks — never fabricate provider costs. */
export function buildMarginSnapshot(input: {
  revenueCents: number | null;
  currency: string;
  costLines?: SaasCostLine[];
}): SaasMarginSnapshot {
  const lines = input.costLines ?? [];
  if (lines.length === 0) {
    return {
      revenueCents: input.revenueCents,
      currency: input.currency,
      costLines: [],
      estimatedCostCents: null,
      estimatedGrossMarginCents: null,
      truth: 'not_available',
      note: 'Provider/platform cost not available — margin UNKNOWN until cost intelligence is wired.',
    };
  }

  const truths = new Set(lines.map((line) => line.truth));
  let truth: SaasCostTruth = 'actual';
  if (truths.has('unknown') || truths.has('not_available')) truth = 'not_available';
  else if (truths.has('estimated')) truth = 'estimated';

  const known = lines.filter((line) => line.amountCents != null);
  if (known.length === 0) {
    return {
      revenueCents: input.revenueCents,
      currency: input.currency,
      costLines: lines,
      estimatedCostCents: null,
      estimatedGrossMarginCents: null,
      truth: 'not_available',
      note: 'No measurable cost lines — margin NOT AVAILABLE.',
    };
  }

  const estimatedCostCents = known.reduce((sum, line) => sum + (line.amountCents ?? 0), 0);
  const estimatedGrossMarginCents =
    input.revenueCents == null ? null : input.revenueCents - estimatedCostCents;

  return {
    revenueCents: input.revenueCents,
    currency: input.currency,
    costLines: lines,
    estimatedCostCents,
    estimatedGrossMarginCents,
    truth,
    note:
      truth === 'actual'
        ? 'Margin from actual provider cost lines.'
        : 'Margin estimated from partial cost lines — not fabricated.',
  };
}

/** Guard: never treat missing allowance as unlimited high-cost entitlement. */
export function assertNoUnlimitedHighCost(limits: SaasPlanLimitsExtended | null | undefined): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const fair = limits?.fairUse;
  if (fair?.aiTokensMonthly === Number.POSITIVE_INFINITY) {
    issues.push('aiTokensMonthly must not be infinite');
  }
  if (limits?.aiTokens === Number.POSITIVE_INFINITY) {
    issues.push('aiTokens must not be infinite');
  }
  return { ok: issues.length === 0, issues };
}
