/**
 * HomeShield Customer Experience (Department 7.3)
 *
 * Extends Recurring Maintenance Engine, Customer Portal, Communication, and Billing with:
 * - Membership plans and customer subscriptions (real records only)
 * - Maintenance history (from Recurring Maintenance)
 * - Service reminders and customer benefits
 * - Renewal opportunities (draft → Owner approve; never auto-bill)
 * - Outreach drafts (approval-gated; never auto-send)
 * - AURA retention / customer value / maintenance / renewal recommendation drafts
 *
 * Invariants:
 * - No fake memberships / subscriptions
 * - No automatic billing or charge mutations
 * - Owner approval required for renewals and billing actions
 * - Portal customers see only their own membership data
 * - Tenant isolation via companyId on every query
 */

export const HOMESHIELD_GUARANTEES = {
  noDemoData: true,
  noFakeMemberships: true,
  noFakeSubscriptions: true,
  noAutomaticBilling: true,
  autoBillingEnabled: false as const,
  autoCharge: false as const,
  ownerApprovalForRenewals: true,
  ownerApprovalForOutreach: true,
  portalOwnDataOnly: true,
  tenantIsolated: true,
  extendsRecurringMaintenance: true,
} as const;

export type HsPlanStatus = 'draft' | 'active' | 'paused' | 'archived';
export type HsSubscriptionStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'cancelled'
  | 'expired';
export type HsBillingInterval = 'monthly' | 'quarterly' | 'annual' | 'custom';
export type HsReminderStatus = 'pending' | 'acknowledged' | 'dismissed' | 'snoozed' | 'cancelled';
export type HsRenewalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'executed';
export type HsOutreachStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';
export type HsAvailability = 'available' | 'unavailable';
export type HsAuraKind =
  | 'renewal_opportunity'
  | 'maintenance_opportunity'
  | 'customer_value'
  | 'retention';
export type HsAuraStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type HsMembershipPlanSummary = {
  id: string;
  name: string;
  description: string | null;
  billingInterval: HsBillingInterval;
  priceCents: number;
  currency: string;
  status: HsPlanStatus;
  benefitCount: number;
  createdAt: string;
  updatedAt: string;
};

export type HsSubscriptionSummary = {
  id: string;
  planId: string;
  planName: string | null;
  customerId: string;
  customerName: string | null;
  status: HsSubscriptionStatus;
  startsAt: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  autoBilling: false;
  createdAt: string;
  updatedAt: string;
};

export type HsBenefitSummary = {
  id: string;
  planId: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
};

export type HsServiceReminderSummary = {
  id: string;
  subscriptionId: string | null;
  customerId: string | null;
  maintenancePlanId: string | null;
  title: string;
  body: string;
  remindAt: string;
  status: HsReminderStatus;
  createdAt: string;
};

export type HsMaintenanceHistoryRow = {
  runId: string;
  planId: string;
  planName: string | null;
  customerId: string | null;
  status: string;
  completedAt: string | null;
  notes: string | null;
  plumbingKind: string | null;
};

export type HsRenewalOpportunitySummary = {
  id: string;
  subscriptionId: string | null;
  customerId: string | null;
  planId: string | null;
  status: HsRenewalStatus;
  title: string;
  body: string;
  autoBilling: false;
  billingCharged: false;
  decidedAt: string | null;
  createdAt: string;
};

export type HsOutreachDraftSummary = {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  renewalOpportunityId: string | null;
  status: HsOutreachStatus;
  subject: string;
  body: string;
  emailDraftId: string | null;
  autoExecuted: false;
  decidedAt: string | null;
  createdAt: string;
};

export type HsAuraInsightSummary = {
  id: string;
  kind: HsAuraKind;
  status: HsAuraStatus;
  title: string;
  body: string;
  customerId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  maintenancePlanId: string | null;
  autoBilling: false;
  autoExecuted: false;
  decidedAt: string | null;
  createdAt: string;
};

export type HsRetentionSnapshot = {
  availability: HsAvailability;
  atRiskSubscriptionCount: number;
  pausedOrExpiredCount: number;
  upcomingRenewalCount: number;
  rationale: string;
};

/** Honest CLV surface — never invents monetary lifetime value. */
export type HsCustomerLifetimeValueSnapshot = {
  availability: HsAvailability;
  /** Always null unless a real stored CLV/value metric exists (this layer never invents). */
  estimatedValueCents: number | null;
  currency: string | null;
  activeSubscriptionCount: number;
  pricedPlanCount: number;
  maintenanceRunCount: number;
  rationale: string;
};

export type HsSettings = {
  id: string;
  autoBillingEnabled: false;
  autoChargeEnabled: false;
  renewalDraftsEnabled: boolean;
  outreachDraftsEnabled: boolean;
  reminderDraftsEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type HsMembershipSnapshot = {
  availability: HsAvailability;
  planCount: number;
  activeSubscriptionCount: number;
  rationale: string;
};

export type HsDashboard = {
  summary: string;
  productClarification: {
    recurringMaintenance: string;
    customerPortal: string;
    communication: string;
    billing: string;
    thisLayer: string;
  };
  policy: {
    autoBillingEnabled: false;
    autoChargeEnabled: false;
    requiresOwnerApprovalForRenewals: true;
    requiresOwnerApprovalForOutreach: true;
    fakeMemberships: false;
  };
  membership: HsMembershipSnapshot;
  plans: HsMembershipPlanSummary[];
  subscriptions: HsSubscriptionSummary[];
  benefits: HsBenefitSummary[];
  reminders: HsServiceReminderSummary[];
  maintenanceHistory: HsMaintenanceHistoryRow[];
  renewalOpportunities: HsRenewalOpportunitySummary[];
  outreachDrafts: HsOutreachDraftSummary[];
  auraInsights: HsAuraInsightSummary[];
  retention: HsRetentionSnapshot;
  customerLifetimeValue: HsCustomerLifetimeValueSnapshot;
  settings: HsSettings;
  pendingRenewalApprovals: number;
  pendingOutreachApprovals: number;
  pendingAuraApprovals: number;
  connections: HsConnection[];
};

export type HsConnection = {
  key: 'recurring_maintenance' | 'customer_portal' | 'communication' | 'billing';
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type HsPortalMembershipView = {
  availability: HsAvailability;
  rationale: string;
  subscriptions: Array<{
    id: string;
    planName: string | null;
    status: HsSubscriptionStatus;
    startsAt: string | null;
    renewsAt: string | null;
    endsAt: string | null;
    benefits: Array<{ title: string; description: string | null }>;
  }>;
  reminders: Array<{
    id: string;
    title: string;
    body: string;
    remindAt: string;
    status: HsReminderStatus;
  }>;
  maintenanceHistory: Array<{
    planName: string | null;
    status: string;
    completedAt: string | null;
    notes: string | null;
  }>;
};

export type CreateHsPlanRequest = {
  name: string;
  description?: string | null;
  billingInterval?: HsBillingInterval;
  priceCents: number;
  currency?: string;
  status?: HsPlanStatus;
};

export type UpdateHsPlanRequest = {
  name?: string;
  description?: string | null;
  billingInterval?: HsBillingInterval;
  priceCents?: number;
  currency?: string;
  status?: HsPlanStatus;
};

export type CreateHsSubscriptionRequest = {
  planId: string;
  customerId: string;
  status?: HsSubscriptionStatus;
  startsAt?: string | null;
  renewsAt?: string | null;
  endsAt?: string | null;
};

export type CreateHsBenefitRequest = {
  planId?: string | null;
  title: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateHsReminderRequest = {
  subscriptionId?: string | null;
  customerId?: string | null;
  maintenancePlanId?: string | null;
  title: string;
  body: string;
  remindAt: string;
};

export type RefreshHsRenewalsRequest = {
  submitForApproval?: boolean;
  withinDays?: number;
};

export type DecideHsRenewalRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
};

export type CreateHsOutreachRequest = {
  customerId: string;
  subscriptionId?: string | null;
  renewalOpportunityId?: string | null;
  subject: string;
  body: string;
  submitForApproval?: boolean;
};

export type DecideHsOutreachRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
};

export type RefreshHsAuraInsightsRequest = {
  submitForApproval?: boolean;
};

export type DecideHsAuraInsightRequest = {
  decision: 'approve' | 'reject' | 'cancel' | 'acknowledge';
  notes?: string;
};

export type UpdateHsSettingsRequest = {
  renewalDraftsEnabled?: boolean;
  outreachDraftsEnabled?: boolean;
  reminderDraftsEnabled?: boolean;
  notes?: string | null;
};

export function canAccessHomeshieldExperience(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customers:read') ||
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('portal:read') ||
    identity.permissions.includes('portal:manage') ||
    identity.permissions.includes('agents:read') ||
    identity.permissions.includes('finance:read') ||
    identity.permissions.includes('finance:write')
  );
}

export function canWriteHomeshieldExperience(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessHomeshieldExperience(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('portal:manage') ||
    identity.permissions.includes('finance:write')
  );
}

export function canApproveHomeshieldActions(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteHomeshieldExperience(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManageHomeshieldSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveHomeshieldActions(identity);
}

export const HOMESHIELD_PRODUCT_COPY = {
  recurringMaintenance:
    'Maintenance plans, due items, and run history remain under /recurring-maintenance — this layer reads real history only.',
  customerPortal:
    'Customer Portal shows HomeShield membership for the linked customer only — never other customers.',
  communication:
    'Outreach drafts require Owner approval and never auto-send. Execute via Email Centre / Communications when approved.',
  billing:
    'Renewal recommendations are drafts only. No automatic billing, charge, or invoice mutation from this layer.',
  thisLayer:
    'HomeShield Experience manages membership plans, subscriptions, benefits, reminders, and Owner-gated renewal/outreach/AURA drafts from real records. No fake memberships. Never auto-bill.',
} as const;

export function buildHsMembershipSnapshot(input: {
  planCount: number;
  activeSubscriptionCount: number;
}): HsMembershipSnapshot {
  if (input.planCount === 0 && input.activeSubscriptionCount === 0) {
    return {
      availability: 'unavailable',
      planCount: 0,
      activeSubscriptionCount: 0,
      rationale:
        'No HomeShield membership plans or subscriptions yet — membership experience unavailable (not invented). Create real plans and link real customers first.',
    };
  }
  return {
    availability: 'available',
    planCount: input.planCount,
    activeSubscriptionCount: input.activeSubscriptionCount,
    rationale: `Derived from ${input.planCount} plan(s) and ${input.activeSubscriptionCount} active subscription(s). No invented memberships.`,
  };
}

export function buildHsRetentionSnapshot(input: {
  atRiskSubscriptionCount: number;
  pausedOrExpiredCount: number;
  upcomingRenewalCount: number;
}): HsRetentionSnapshot {
  if (
    input.atRiskSubscriptionCount === 0 &&
    input.pausedOrExpiredCount === 0 &&
    input.upcomingRenewalCount === 0
  ) {
    return {
      availability: 'unavailable',
      atRiskSubscriptionCount: 0,
      pausedOrExpiredCount: 0,
      upcomingRenewalCount: 0,
      rationale:
        'No retention signals from real HomeShield subscriptions yet — retention insights unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    atRiskSubscriptionCount: input.atRiskSubscriptionCount,
    pausedOrExpiredCount: input.pausedOrExpiredCount,
    upcomingRenewalCount: input.upcomingRenewalCount,
    rationale: `Retention derived from ${input.upcomingRenewalCount} upcoming renewal(s), ${input.atRiskSubscriptionCount} at-risk, and ${input.pausedOrExpiredCount} paused/expired subscription(s). No invented churn scores.`,
  };
}


export function buildHsCustomerLifetimeValueSnapshot(input: {
  activeSubscriptionCount: number;
  pricedPlanCount: number;
  maintenanceRunCount: number;
  /** Only pass when a real stored CLV/value figure exists — never fabricate. */
  storedValueCents?: number | null;
  currency?: string | null;
}): HsCustomerLifetimeValueSnapshot {
  const stored =
    input.storedValueCents != null && Number.isFinite(input.storedValueCents)
      ? Math.trunc(input.storedValueCents)
      : null;
  const hasMembershipSignal =
    input.activeSubscriptionCount > 0 || input.pricedPlanCount > 0 || input.maintenanceRunCount > 0;
  if (stored == null) {
    return {
      availability: 'unavailable',
      estimatedValueCents: null,
      currency: null,
      activeSubscriptionCount: input.activeSubscriptionCount,
      pricedPlanCount: input.pricedPlanCount,
      maintenanceRunCount: input.maintenanceRunCount,
      rationale: hasMembershipSignal
        ? 'Membership/maintenance signals exist, but no real stored customer lifetime value is available — CLV unavailable (not invented).'
        : 'Insufficient real membership, pricing, and maintenance data — customer lifetime value unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    estimatedValueCents: stored,
    currency: (input.currency ?? 'ZAR').slice(0, 10),
    activeSubscriptionCount: input.activeSubscriptionCount,
    pricedPlanCount: input.pricedPlanCount,
    maintenanceRunCount: input.maintenanceRunCount,
    rationale: `CLV uses stored value ${stored} ${(input.currency ?? 'ZAR')} from real records only — not estimated or invented by HomeShield.`,
  };
}

export function buildHsRenewalOpportunityDraft(input: {
  customerName: string;
  planName: string;
  renewsAt: string | null;
  daysUntilRenewal: number | null;
}): { title: string; body: string } {
  const when =
    input.daysUntilRenewal != null
      ? `in ${input.daysUntilRenewal} day(s)`
      : input.renewsAt
        ? `around ${input.renewsAt}`
        : 'soon';
  return {
    title: `Renewal opportunity — ${input.planName}`.slice(0, 200),
    body: [
      `${input.customerName} has an upcoming HomeShield renewal for ${input.planName} (${when}).`,
      '',
      'Renewal recommendation draft only — not a charge, invoice, or automatic billing change.',
      'Owner approval required before any billing or renewal action.',
    ].join('\n'),
  };
}

export function buildHsOutreachDraft(input: {
  customerName: string;
  subjectHint?: string;
}): { subject: string; body: string } {
  return {
    subject: (input.subjectHint ?? `HomeShield membership update for ${input.customerName}`).slice(
      0,
      200,
    ),
    body: [
      `Hi ${input.customerName},`,
      '',
      'This is a draft HomeShield membership message for Owner review.',
      'It will not send until approved and executed through Communications / Email Centre.',
      '',
      '— TITAN HomeShield',
    ].join('\n'),
  };
}

export function buildHsCustomerValueInsightDraft(input: {
  customerName: string;
  planName: string | null;
  subscriptionStatus: string;
  maintenanceRunCount: number;
  renewsAt: string | null;
}): { title: string; body: string } {
  return {
    title: `Customer value signal — ${input.customerName}`.slice(0, 200),
    body: [
      `${input.customerName} HomeShield membership: plan ${input.planName ?? 'unknown'}, status ${input.subscriptionStatus}.`,
      `Linked maintenance runs (Recurring Maintenance): ${input.maintenanceRunCount}.`,
      input.renewsAt ? `Next renewal marker: ${input.renewsAt}.` : 'No renewsAt on subscription.',
      '',
      'Customer value recommendation draft only — not a CLV invention, score fabrication, or billing change.',
      'Owner approval required before any retention or billing follow-up.',
    ].join('\n'),
  };
}

export function buildHsMaintenanceOpportunityDraft(input: {
  customerName: string;
  planName: string;
  nextDueAt: string | null;
  plumbingKind: string | null;
}): { title: string; body: string } {
  return {
    title: `Maintenance opportunity — ${input.planName}`.slice(0, 200),
    body: [
      `${input.customerName}: recurring maintenance plan "${input.planName}"${input.plumbingKind ? ` (${input.plumbingKind})` : ''}.`,
      input.nextDueAt ? `Next due: ${input.nextDueAt}.` : 'No next due date on plan.',
      '',
      'Maintenance opportunity draft from Recurring Maintenance records only — not invented visits.',
      'Does not auto-schedule or auto-bill. Owner approval required for outreach or billing actions.',
    ].join('\n'),
  };
}

export function buildHsRetentionInsightDraft(input: {
  customerName: string;
  planName: string | null;
  subscriptionStatus: string;
  reason: string;
}): { title: string; body: string } {
  return {
    title: `Retention insight — ${input.customerName}`.slice(0, 200),
    body: [
      `${input.customerName} may need retention attention (${input.reason}).`,
      `Plan: ${input.planName ?? 'unknown'}; subscription status: ${input.subscriptionStatus}.`,
      '',
      'Retention insight draft only — not an automatic win-back send or billing change.',
      'Owner approval required before outreach or renewal billing actions.',
    ].join('\n'),
  };
}

export function listHsConnections(): HsConnection[] {
  return [
    {
      key: 'recurring_maintenance',
      label: 'Recurring Maintenance',
      href: '/recurring-maintenance',
      status: 'available_link',
      note: 'Maintenance history and service plans — read-only from this layer.',
    },
    {
      key: 'customer_portal',
      label: 'Customer Portal',
      href: '/customer-experience',
      status: 'available_link',
      note: 'Portal members see own HomeShield data at /my/homeshield.',
    },
    {
      key: 'communication',
      label: 'Email Centre',
      href: '/email-centre',
      status: 'available_link',
      note: 'Outreach drafts never auto-send; execute after Owner approval.',
    },
    {
      key: 'billing',
      label: 'Finance / Billing',
      href: '/finance/invoices',
      status: 'registry_stub',
      note: 'Renewals stay draft — no auto charge from HomeShield.',
    },
  ];
}

export function defaultHsSettings(partial?: {
  id?: string;
  renewalDraftsEnabled?: boolean;
  outreachDraftsEnabled?: boolean;
  reminderDraftsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): HsSettings {
  return {
    id: partial?.id ?? 'pending',
    autoBillingEnabled: false,
    autoChargeEnabled: false,
    renewalDraftsEnabled: partial?.renewalDraftsEnabled ?? true,
    outreachDraftsEnabled: partial?.outreachDraftsEnabled ?? true,
    reminderDraftsEnabled: partial?.reminderDraftsEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
