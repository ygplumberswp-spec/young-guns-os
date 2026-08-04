/** Owner executive dashboard — real tenant aggregates only. */

export type ExecutiveHeaderCounts = {
  jobsToday: number;
  prioritiesToday: number;
  teamWorking: number;
  approvalsWaiting: number;
};

export type ExecutiveGlanceJobs = {
  scheduled: number;
  inProgress: number;
  completed: number;
  delayed: number;
  href: string;
};

export type ExecutiveGlanceTeam = {
  available: number;
  travelling: number;
  onSite: number;
  offDuty: number;
};

export type ExecutiveGlanceMoney = {
  invoicedTodayCents: number;
  paymentsTodayCents: number;
  outstandingCents: number;
  draftCount: number;
  currency: string;
};

export type ExecutiveGlanceCustomerActivity = {
  leads: number;
  followUps: number;
  messages: number;
  returning: number;
};

export type ExecutiveTodayAtAGlance = {
  jobs: ExecutiveGlanceJobs;
  team: ExecutiveGlanceTeam;
  money: ExecutiveGlanceMoney;
  customerActivity: ExecutiveGlanceCustomerActivity;
};

export type ExecutiveLiveJob = {
  id: string;
  jobNumber: string | null;
  title: string;
  customerName: string;
  suburb: string | null;
  status: string;
  technicianName: string | null;
  assignedUserId: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  /** Customer-visible / computed ETA when a real value exists — never invented. */
  etaAt: string | null;
  /** Open on-site time entry start when a real mobile clock-in exists. */
  timeOnSiteStartedAt: string | null;
  nextJobTitle: string | null;
  isDelayed: boolean;
  /** Verified job site coordinates only (snapshot geocode) — null when unknown. */
  latitude: number | null;
  longitude: number | null;
};

export type ExecutiveCompletedJob = {
  id: string;
  jobNumber: string | null;
  title: string;
  customerName: string;
  technicianName: string | null;
  completedAt: string;
  invoiceStatus: string | null;
  docsRequired: boolean;
  cocRequired: boolean;
};

export type ExecutivePriorityItem = {
  id: string;
  priority: 'normal' | 'high';
  reason: string;
  suggestedAction: string;
  approvalState: 'awaiting_owner' | 'not_required';
  href: string;
};

export type ExecutivePrioritiesSummary = {
  needsAttention: number;
  waitingApproval: number;
  blocked: number;
  summaryLine: string;
  /** M8 Today's Plan top priorities — real fields only. */
  items: ExecutivePriorityItem[];
  criticalIssues: Array<{
    id: string;
    title: string;
    description: string;
    href: string;
  }>;
};

export type ExecutiveTeamMember = {
  userId: string;
  name: string;
  status: 'working' | 'available' | 'travelling' | 'on_site' | 'off_duty' | 'leave';
  currentTask: string | null;
  nextTask: string | null;
  isLate: boolean;
};

export type ExecutiveOutstandingInvoiceRef = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string | null;
  outstandingCents: number;
};

/** Outstanding AR snapshot for Dashboard V1 — real invoice aggregates only. */
export type ExecutiveOutstandingInvoices = {
  outstandingCents: number;
  invoiceCount: number;
  currency: string;
  oldestOverdue: ExecutiveOutstandingInvoiceRef | null;
  /** Largest open balance among outstanding invoices — null when none. */
  largestOutstanding: ExecutiveOutstandingInvoiceRef | null;
  /**
   * Open invoices excluded from the total because their amounts are unusable
   * (null amount, or paid exceeding billed). Non-zero means partial coverage.
   */
  excludedInvoiceCount: number;
  /** Open invoices with no due date — counted in the total but not in overdue ageing. */
  undatedInvoiceCount: number;
};

export type ExecutiveXeroFinanceTrendPoint = {
  month: string;
  amountCents: number;
};

/**
 * Honest Xero finance feed status for the Owner dashboard.
 * Aggregates come from real synced TITAN invoices/payments/quotes — never invented.
 */
export type ExecutiveXeroFinance = {
  connected: boolean;
  organisationName: string | null;
  /** Connection-level last successful import/sync timestamp. */
  lastSyncAt: string | null;
  lastError: string | null;
  /** Latest import job display status when one exists. */
  importStatus: string | null;
  importMessage: string | null;
  syncedCustomerCount: number;
  syncedInvoiceCount: number;
  syncedPaymentCount: number;
  syncedQuoteCount: number;
  syncedBankTransactionCount: number;
  failedRecordCount: number;
  /** Revenue from paid/partially paid synced invoices — 0 when none. */
  revenueCents: number;
  outstandingCents: number;
  paidCents: number;
  overdueCents: number;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  overdueInvoiceCount: number;
  quotePipelineCents: number;
  quotePipelineCount: number;
  monthlyTurnover: ExecutiveXeroFinanceTrendPoint[];
  paymentTrends: ExecutiveXeroFinanceTrendPoint[];
  currency: string;
};

/** Dashboard areas whose availability is reported independently of one another. */
export type ExecutiveSectionKey =
  | 'todayAtAGlance'
  | 'money'
  | 'customerActivity'
  | 'priorities'
  | 'activeJobs'
  | 'completedToday'
  | 'outstandingInvoices'
  | 'team';

export type ExecutiveSectionState = 'live' | 'partial' | 'unavailable';

/**
 * Honest per-section availability. A section is only `live` when every source feeding it
 * resolved; `unavailable` means the value must not be read as a real zero.
 */
export type ExecutiveSectionStatus = {
  state: ExecutiveSectionState;
  /** Human-readable origin of the data, e.g. "TITAN jobs". */
  source: string;
  /** When the underlying read completed; null when the section did not resolve. */
  updatedAt: string | null;
  /** What the number does and does not include. */
  coverage: string | null;
  /** Redacted failure reason when not live. */
  reason: string | null;
};

export type ExecutiveDashboardSummary = {
  generatedAt: string;
  /** Per-section availability — one failed source must never blank the whole dashboard. */
  sections: Record<ExecutiveSectionKey, ExecutiveSectionStatus>;
  header: ExecutiveHeaderCounts;
  todayAtAGlance: ExecutiveTodayAtAGlance;
  liveOperations: ExecutiveLiveJob[];
  completedToday: ExecutiveCompletedJob[];
  priorities: ExecutivePrioritiesSummary;
  outstandingInvoices: ExecutiveOutstandingInvoices;
  /** Xero connection + last successful sync — always present, honest empty when disconnected. */
  xeroFinance: ExecutiveXeroFinance;
  /** @deprecated V1.1 — retained for compatibility; UI no longer renders Team Today. */
  teamToday: ExecutiveTeamMember[];
};
