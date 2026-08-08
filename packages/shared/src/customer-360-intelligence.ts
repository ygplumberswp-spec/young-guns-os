/**
 * Customer 360 Intelligence Platform (Department 11 / Expansion)
 *
 * Extends existing CRM customers — does not rebuild CRM or invent customers.
 * Combines real tenant-scoped records:
 * - Customer details / activities / properties
 * - Jobs, quotes, invoices, payments
 * - Communications, documents
 * - Equipment via recurring-maintenance plan asset links
 * - Maintenance history (Recurring Maintenance Engine)
 *
 * Surfaces:
 * - Unified customer profile
 * - Unified customer timeline
 * - AURA customer insights (maintenance opportunities, value, follow-ups, retention)
 *   as drafts/recommendations only — never auto-comms
 *
 * Invariants:
 * - No fake customers or invented metrics
 * - Tenant isolation via companyId; no cross-customer visibility
 * - Finance amounts / margins / profit gated by finance permissions
 * - Internal notes gated by customers:write / Owner-Admin
 * - Clients and Technicians denied staff 360 module access
 * - Recommendations never auto-send
 */

export const CUSTOMER_360_INTELLIGENCE_KEY = 'customer-360-intelligence' as const;

export type C360Availability = 'available' | 'unavailable';

export type C360InsightKind =
  | 'maintenance_opportunity'
  | 'customer_value'
  | 'follow_up'
  | 'retention';

export type C360InsightStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type C360AuraTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'crm'
  | 'customer_engagement'
  | 'homeshield'
  | 'recurring_maintenance'
  | 'communications'
  | 'finance';

export type C360TimelineKind =
  | 'activity'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'communication'
  | 'document'
  | 'maintenance'
  | 'equipment';

export type C360CustomerListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  jobCount: number;
  openJobCount: number;
  lastActivityAt: string | null;
};

export type C360Profile = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isSupplierOnly: boolean;
  doNotContact: boolean;
  /** Present only when actor may view internal notes. */
  notes: string | null;
  notesHidden: boolean;
  createdAt: string;
  updatedAt: string;
  propertyCount: number;
  activityCount: number;
};

export type C360JobSummary = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  priority: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type C360QuoteSummary = {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  /** Null when finance amounts are hidden for the actor. */
  totalCents: number | null;
  currency: string | null;
  financeHidden: boolean;
  issuedAt: string | null;
  createdAt: string;
};

export type C360InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  title: string;
  status: string;
  totalCents: number | null;
  amountPaidCents: number | null;
  currency: string | null;
  financeHidden: boolean;
  dueDate: string | null;
  createdAt: string;
};

export type C360PaymentSummary = {
  id: string;
  invoiceId: string;
  amountCents: number | null;
  currency: string | null;
  method: string;
  financeHidden: boolean;
  paidAt: string;
  reference: string | null;
};

export type C360CommunicationSummary = {
  id: string;
  channel: string;
  direction: string;
  visibility: string;
  subject: string | null;
  bodyPreview: string;
  occurredAt: string;
  jobId: string | null;
};

export type C360DocumentSummary = {
  id: string;
  title: string;
  fileName: string;
  jobId: string | null;
  createdAt: string;
};

export type C360EquipmentSummary = {
  id: string;
  name: string;
  assetType: string;
  status: string;
  serialNumber: string | null;
  planId: string | null;
  planName: string | null;
};

export type C360MaintenanceSummary = {
  planId: string;
  planName: string;
  status: string;
  nextDueAt: string | null;
  lastCompletedAt: string | null;
  assetId: string;
  assetName: string | null;
  intervalDays: number;
};

export type C360TimelineEvent = {
  id: string;
  kind: C360TimelineKind;
  occurredAt: string;
  title: string;
  summary: string;
  href: string | null;
  relatedId: string | null;
};

export type C360ValueSnapshot = {
  availability: C360Availability;
  jobCount: number;
  completedJobCount: number;
  quoteCount: number;
  invoiceCount: number;
  paymentCount: number;
  /** Sum of paid amounts when finance visible; otherwise null. */
  totalPaidCents: number | null;
  outstandingCents: number | null;
  financeHidden: boolean;
  classificationLabel: string | null;
  rationale: string;
};

export type C360InsightDraft = {
  id: string;
  kind: C360InsightKind;
  status: C360InsightStatus;
  customerId: string | null;
  customerName: string | null;
  title: string;
  body: string;
  autoSend: false;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type C360AuraInsightSummary = {
  id: string;
  target: C360AuraTarget;
  status: 'open' | 'acknowledged' | 'dismissed';
  title: string;
  insight: string;
  href: string | null;
  customerId: string | null;
  createdAt: string;
};

export type C360Settings = {
  id: string;
  insightsEnabled: boolean;
  timelineEnabled: boolean;
  recommendationDraftsEnabled: boolean;
  autoSendEnabled: false;
  inventCustomersEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type C360Connection = {
  target: string;
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: C360Availability;
  note: string;
};

export type C360CustomerView = {
  profile: C360Profile;
  jobs: C360JobSummary[];
  quotes: C360QuoteSummary[];
  invoices: C360InvoiceSummary[];
  payments: C360PaymentSummary[];
  communications: C360CommunicationSummary[];
  documents: C360DocumentSummary[];
  equipment: C360EquipmentSummary[];
  maintenance: C360MaintenanceSummary[];
  timeline: C360TimelineEvent[];
  value: C360ValueSnapshot;
  insights: C360InsightDraft[];
  policy: {
    rebuildsCrm: false;
    inventCustomers: false;
    autoSend: false;
    crossCustomerVisibility: false;
    financeGated: true;
    internalNotesGated: true;
  };
};

export type C360Dashboard = {
  summary: string;
  productClarification: {
    existingCrm: string;
    thisLayer: string;
    engagement: string;
    portal: string;
  };
  policy: {
    rebuildsCrm: false;
    inventCustomers: false;
    autoSend: false;
    crossCustomerVisibility: false;
    financeGated: true;
    technicianClientDenied: true;
  };
  customerCount: number;
  customers: C360CustomerListItem[];
  recentInsights: C360InsightDraft[];
  auraInsights: C360AuraInsightSummary[];
  connections: C360Connection[];
  settings: C360Settings;
};

export type UpdateC360SettingsRequest = {
  insightsEnabled?: boolean;
  timelineEnabled?: boolean;
  recommendationDraftsEnabled?: boolean;
  notes?: string | null;
};

export type DecideC360InsightRequest = {
  decision: 'approve' | 'reject' | 'acknowledge' | 'cancel';
  notes?: string;
};

export type RefreshC360InsightsRequest = {
  customerId?: string;
};

export const C360_PRODUCT_COPY = {
  existingCrm:
    'Operational CRM remains under /crm — Customer 360 extends real customer records and never rebuilds CRM or invents customers.',
  thisLayer:
    'Customer 360 Intelligence unifies real profile, jobs, quotes, invoices, payments, communications, documents, equipment, and maintenance into one staff view with AURA insight drafts only.',
  engagement:
    'Customer Engagement Intelligence (when present) owns outreach drafts — this layer does not auto-send notifications or review requests.',
  portal:
    'Customer portal (/my) remains customer-scoped own-data only — staff 360 never exposes other customers and never grants portal users cross-customer access.',
} as const;

export const C360_GUARANTEES = {
  noDemoData: true,
  noFakeCustomers: true,
  rebuildsCrm: false,
  autoSend: false,
  autoComms: false,
  crossCustomerVisibility: false,
  tenantIsolated: true,
  financeGated: true,
  internalNotesGated: true,
} as const;

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function canAccessCustomer360Intelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(role)) return true;
  return (
    permissions.includes('customers:read') ||
    permissions.includes('customers:write') ||
    permissions.includes('customer_experience:read') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

export function canWriteCustomer360Intelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessCustomer360Intelligence(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(identity.roleName)) return true;
  return (
    permissions.includes('customers:write') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

export function canViewCustomer360Finance(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessCustomer360Intelligence(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(identity.roleName)) return true;
  return permissions.includes('finance:read') || permissions.includes('finance:write');
}

export function canViewCustomer360InternalNotes(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessCustomer360Intelligence(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(identity.roleName)) return true;
  return permissions.includes('customers:write');
}

export function defaultC360Settings(partial?: Partial<C360Settings> & { id?: string }): C360Settings {
  return {
    id: partial?.id ?? 'pending',
    insightsEnabled: partial?.insightsEnabled ?? true,
    timelineEnabled: partial?.timelineEnabled ?? true,
    recommendationDraftsEnabled: partial?.recommendationDraftsEnabled ?? true,
    autoSendEnabled: false,
    inventCustomersEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function listC360Connections(): C360Connection[] {
  return [
    {
      target: 'crm',
      label: 'CRM Customers',
      href: '/crm',
      status: 'available_link',
      availability: 'available',
      note: 'Source of truth for customer identity — Customer 360 does not rebuild CRM.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      availability: 'available',
      note: 'Real job history per customer when linked.',
    },
    {
      target: 'finance',
      label: 'Finance',
      href: '/finance/invoices',
      status: 'available_link',
      availability: 'available',
      note: 'Quotes, invoices, and payments — amounts gated by finance permissions.',
    },
    {
      target: 'communications',
      label: 'Communication Timeline',
      href: '/communication-timeline',
      status: 'available_link',
      availability: 'available',
      note: 'Business communications only; Personal WhatsApp is never sourced.',
    },
    {
      target: 'recurring_maintenance',
      label: 'Recurring Maintenance',
      href: '/recurring-maintenance',
      status: 'available_link',
      availability: 'available',
      note: 'Maintenance plans and equipment links when present.',
    },
    {
      target: 'customer_engagement',
      label: 'Customer Engagement Intelligence',
      href: '/customer-engagement-intelligence',
      status: 'registry_stub',
      availability: 'unavailable',
      note: 'Outreach drafts live in Engagement when that module is mounted — never auto-send from 360.',
    },
    {
      target: 'portal',
      label: 'Customer Portal',
      href: '/my',
      status: 'available_link',
      availability: 'available',
      note: 'Portal remains own-customer only — staff 360 never grants cross-customer portal access.',
    },
  ];
}

export function buildC360ValueSnapshot(input: {
  jobCount: number;
  completedJobCount: number;
  quoteCount: number;
  invoiceCount: number;
  paymentCount: number;
  totalPaidCents: number | null;
  outstandingCents: number | null;
  financeHidden: boolean;
  classificationLabel?: string | null;
}): C360ValueSnapshot {
  const hasSignal =
    input.jobCount > 0 ||
    input.quoteCount > 0 ||
    input.invoiceCount > 0 ||
    input.paymentCount > 0;
  if (!hasSignal) {
    return {
      availability: 'unavailable',
      jobCount: 0,
      completedJobCount: 0,
      quoteCount: 0,
      invoiceCount: 0,
      paymentCount: 0,
      totalPaidCents: null,
      outstandingCents: null,
      financeHidden: input.financeHidden,
      classificationLabel: input.classificationLabel ?? null,
      rationale:
        'No real jobs, quotes, invoices, or payments for this customer yet — value not invented.',
    };
  }
  return {
    availability: 'available',
    jobCount: input.jobCount,
    completedJobCount: input.completedJobCount,
    quoteCount: input.quoteCount,
    invoiceCount: input.invoiceCount,
    paymentCount: input.paymentCount,
    totalPaidCents: input.financeHidden ? null : input.totalPaidCents,
    outstandingCents: input.financeHidden ? null : input.outstandingCents,
    financeHidden: input.financeHidden,
    classificationLabel: input.classificationLabel ?? null,
    rationale: input.financeHidden
      ? `Derived from ${input.jobCount} job(s), ${input.quoteCount} quote(s), ${input.invoiceCount} invoice(s). Finance amounts hidden for this role.`
      : `Derived from ${input.jobCount} job(s), ${input.completedJobCount} completed, ${input.invoiceCount} invoice(s), ${input.paymentCount} payment(s).`,
  };
}

export function buildC360TimelineEvents(input: {
  activities: Array<{ id: string; content: string; createdAt: string }>;
  jobs: Array<{ id: string; title: string; status: string; updatedAt: string; jobNumber?: string | null }>;
  quotes: Array<{ id: string; title: string; status: string; createdAt: string; quoteNumber: string }>;
  invoices: Array<{ id: string; title: string; status: string; createdAt: string; invoiceNumber: string }>;
  payments: Array<{
    id: string;
    paidAt: string;
    invoiceId: string;
    reference?: string | null;
    /** Official InvoiceNumber for display — never a UUID. */
    invoiceNumber?: string | null;
  }>;
  communications: Array<{
    id: string;
    subject: string | null;
    channel: string;
    occurredAt: string;
  }>;
  documents: Array<{ id: string; title: string; createdAt: string }>;
  maintenance: Array<{
    planId: string;
    planName: string;
    status: string;
    nextDueAt: string | null;
    lastCompletedAt: string | null;
  }>;
}): C360TimelineEvent[] {
  const events: C360TimelineEvent[] = [];

  for (const a of input.activities) {
    events.push({
      id: `activity:${a.id}`,
      kind: 'activity',
      occurredAt: a.createdAt,
      title: 'CRM activity',
      summary: a.content.slice(0, 160),
      href: null,
      relatedId: a.id,
    });
  }
  for (const j of input.jobs) {
    events.push({
      id: `job:${j.id}`,
      kind: 'job',
      occurredAt: j.updatedAt,
      title: j.jobNumber ? `Job ${j.jobNumber}` : 'Job',
      summary: `${j.title} — ${j.status}`,
      href: `/jobs/${j.id}`,
      relatedId: j.id,
    });
  }
  for (const q of input.quotes) {
    events.push({
      id: `quote:${q.id}`,
      kind: 'quote',
      occurredAt: q.createdAt,
      title: `Quote ${q.quoteNumber}`,
      summary: `${q.title} — ${q.status}`,
      href: `/finance/quotes/${q.id}`,
      relatedId: q.id,
    });
  }
  for (const inv of input.invoices) {
    events.push({
      id: `invoice:${inv.id}`,
      kind: 'invoice',
      occurredAt: inv.createdAt,
      title: `Invoice ${inv.invoiceNumber}`,
      summary: `${inv.title} — ${inv.status}`,
      href: `/finance/invoices/${inv.id}`,
      relatedId: inv.id,
    });
  }
  for (const p of input.payments) {
    const invoiceRef = p.invoiceNumber?.trim() || null;
    events.push({
      id: `payment:${p.id}`,
      kind: 'payment',
      occurredAt: p.paidAt,
      title: 'Payment recorded',
      // Row 87: never show invoice UUID prefix as the customer-facing invoice reference.
      summary: p.reference?.trim() || (invoiceRef ? `Payment on invoice ${invoiceRef}` : 'Payment recorded'),
      href: `/finance/payments`,
      relatedId: p.id,
    });
  }
  for (const c of input.communications) {
    events.push({
      id: `comm:${c.id}`,
      kind: 'communication',
      occurredAt: c.occurredAt,
      title: `${c.channel} communication`,
      summary: c.subject?.trim() || 'Communication logged',
      href: '/communication-timeline',
      relatedId: c.id,
    });
  }
  for (const d of input.documents) {
    events.push({
      id: `doc:${d.id}`,
      kind: 'document',
      occurredAt: d.createdAt,
      title: 'Document',
      summary: d.title,
      href: '/documents',
      relatedId: d.id,
    });
  }
  for (const m of input.maintenance) {
    const at = m.lastCompletedAt ?? m.nextDueAt;
    if (!at) continue;
    events.push({
      id: `maint:${m.planId}:${at}`,
      kind: 'maintenance',
      occurredAt: at,
      title: m.planName,
      summary: m.lastCompletedAt
        ? `Maintenance completed (${m.status})`
        : `Next due (${m.status})`,
      href: '/recurring-maintenance',
      relatedId: m.planId,
    });
  }

  return events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

export type C360InsightSeed = {
  kind: C360InsightKind;
  customerId: string;
  customerName: string | null;
  title: string;
  body: string;
};

export function buildC360InsightDraftSeeds(input: {
  customerId: string;
  customerName: string | null;
  completedJobCount: number;
  openJobCount: number;
  openMaintenancePlans: number;
  overdueMaintenancePlans: number;
  daysSinceLastJob: number | null;
  daysSinceLastCommunication: number | null;
  unpaidInvoiceCount: number;
  doNotContact: boolean;
}): C360InsightSeed[] {
  const seeds: C360InsightSeed[] = [];
  const name = input.customerName?.trim() || 'Customer';

  if (input.overdueMaintenancePlans > 0 || input.openMaintenancePlans > 0) {
    seeds.push({
      kind: 'maintenance_opportunity',
      customerId: input.customerId,
      customerName: input.customerName,
      title: `Maintenance opportunity — ${name}`,
      body:
        input.overdueMaintenancePlans > 0
          ? `${input.overdueMaintenancePlans} overdue maintenance plan(s) from Recurring Maintenance. Draft recommendation only — never auto-schedule or auto-message.`
          : `${input.openMaintenancePlans} open maintenance plan(s). Review next due dates; recommendation draft only — never auto-comms.`,
    });
  }

  if (input.completedJobCount >= 2 || input.unpaidInvoiceCount > 0) {
    seeds.push({
      kind: 'customer_value',
      customerId: input.customerId,
      customerName: input.customerName,
      title: `Customer value review — ${name}`,
      body: `Real history: ${input.completedJobCount} completed job(s), ${input.unpaidInvoiceCount} unpaid/partial/overdue invoice(s). Value insight is a draft recommendation — amounts remain finance-gated; never invent CLV.`,
    });
  }

  if (
    (input.daysSinceLastCommunication !== null && input.daysSinceLastCommunication >= 45) ||
    (input.daysSinceLastJob !== null && input.daysSinceLastJob >= 90)
  ) {
    if (!input.doNotContact) {
      seeds.push({
        kind: 'follow_up',
        customerId: input.customerId,
        customerName: input.customerName,
        title: `Follow-up suggestion — ${name}`,
        body: `Stale signal from real history (last job ${input.daysSinceLastJob ?? 'n/a'}d, last communication ${input.daysSinceLastCommunication ?? 'n/a'}d). Draft only — never auto-send.`,
      });
    }
  }

  if (
    input.unpaidInvoiceCount > 0 ||
    (input.daysSinceLastJob !== null && input.daysSinceLastJob >= 120 && input.completedJobCount > 0)
  ) {
    seeds.push({
      kind: 'retention',
      customerId: input.customerId,
      customerName: input.customerName,
      title: `Retention watch — ${name}`,
      body: `Retention recommendation from real unpaid invoices and/or long gap since last job. Draft only — Owner/ops approval required before any outreach; never auto-comms.`,
    });
  }

  return seeds;
}

export function previewBody(text: string, max = 140): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
