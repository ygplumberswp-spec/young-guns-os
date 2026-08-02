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
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  nextJobTitle: string | null;
  isDelayed: boolean;
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

export type ExecutivePrioritiesSummary = {
  needsAttention: number;
  waitingApproval: number;
  blocked: number;
  summaryLine: string;
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

/** Outstanding AR snapshot for Dashboard V1.1 — real invoice aggregates only. */
export type ExecutiveOutstandingInvoices = {
  outstandingCents: number;
  invoiceCount: number;
  currency: string;
  oldestOverdue: {
    id: string;
    invoiceNumber: string;
    customerName: string;
    dueDate: string | null;
    outstandingCents: number;
  } | null;
};

export type ExecutiveDashboardSummary = {
  generatedAt: string;
  header: ExecutiveHeaderCounts;
  todayAtAGlance: ExecutiveTodayAtAGlance;
  liveOperations: ExecutiveLiveJob[];
  completedToday: ExecutiveCompletedJob[];
  priorities: ExecutivePrioritiesSummary;
  outstandingInvoices: ExecutiveOutstandingInvoices;
  /** @deprecated V1.1 — retained for compatibility; UI no longer renders Team Today. */
  teamToday: ExecutiveTeamMember[];
};
