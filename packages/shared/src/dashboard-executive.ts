/** Owner executive dashboard — real tenant aggregates only. */

export type ExecutiveHeaderCounts = {
  jobsToday: number;
  prioritiesToday: number;
  teamWorking: number;
  approvalsWaiting: number;
};

export type ExecutiveGlanceJobs = {
  scheduled: number;
  assigned: number;
  travelling: number;
  onSite: number;
  inProgress: number;
  completed: number;
  delayed: number;
  unassigned: number;
  href: string;
};

export type ExecutiveGlanceTeam = {
  working: number;
  available: number;
  travelling: number;
  onSite: number;
  offDuty: number;
  late: number;
  missingCheckIn: number;
};

export type ExecutiveGlanceMoney = {
  invoicedTodayCents: number | null;
  paymentsTodayCents: number | null;
  outstandingCents: number | null;
  overdueCents: number | null;
  dueThisWeekCount: number | null;
  depositsTodayCents: number | null;
  partialPaymentsTodayCount: number | null;
  jobsPaidInFullTodayCount: number | null;
  draftCount: number | null;
  currency: string;
  syncState: 'ready' | 'syncing' | 'unavailable';
};

export type ExecutiveGlanceCustomerActivity = {
  newLeads: number | null;
  followUpsDue: number | null;
  unreadMessages: number | null;
  returningCustomers: number | null;
  complaintsEscalations: number | null;
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
  areaLabel: string | null;
  status: string;
  technicianName: string | null;
  vehicleRegistration: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  expectedFinishAt: string | null;
  nextJobTitle: string | null;
  isDelayed: boolean;
  delayRisk: 'none' | 'watch' | 'high';
  gpsTimestamp: string | null;
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

export type ExecutiveOwnerActionItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  count: number;
  href: string;
  priority: 'critical' | 'high' | 'normal';
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
  actionQueue: ExecutiveOwnerActionItem[];
};

export type ExecutiveTeamMember = {
  userId: string;
  name: string;
  status: 'working' | 'available' | 'travelling' | 'on_site' | 'off_duty' | 'leave';
  currentTask: string | null;
  nextTask: string | null;
  isLate: boolean;
  missingCheckIn: boolean;
};

export type ExecutiveDashboardSummary = {
  generatedAt: string;
  header: ExecutiveHeaderCounts;
  todayAtAGlance: ExecutiveTodayAtAGlance;
  liveOperations: ExecutiveLiveJob[];
  completedToday: ExecutiveCompletedJob[];
  priorities: ExecutivePrioritiesSummary;
  teamToday: ExecutiveTeamMember[];
};
