export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly';

export const ANALYTICS_PERIOD_OPTIONS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export type ReportType =
  | 'revenue'
  | 'customer'
  | 'job_performance'
  | 'technician_performance'
  | 'finance'
  | 'fleet'
  | 'inventory';

export const REPORT_TYPE_OPTIONS: Array<{ value: ReportType; label: string; description: string }> =
  [
    {
      value: 'revenue',
      label: 'Revenue Report',
      description: 'Payment and revenue totals for the selected period',
    },
    {
      value: 'customer',
      label: 'Customer Report',
      description: 'Customer growth, repeat business, and activity',
    },
    {
      value: 'job_performance',
      label: 'Job Performance Report',
      description: 'Job volume, completion rates, and status breakdown',
    },
    {
      value: 'technician_performance',
      label: 'Technician Performance Report',
      description: 'Workload and completion metrics by assigned technician',
    },
    {
      value: 'finance',
      label: 'Finance Report',
      description: 'Invoices, payments, cash flow, and outstanding balances',
    },
    {
      value: 'fleet',
      label: 'Fleet Report',
      description: 'Vehicle status and utilisation overview',
    },
    {
      value: 'inventory',
      label: 'Inventory Report',
      description: 'Stock levels and low-stock items',
    },
  ];

export type ReportRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AnalyticsDateRange = {
  from: string;
  to: string;
};

export type AnalyticsTrendPoint = {
  label: string;
  date: string;
  value: number;
};

export type AnalyticsDashboard = {
  period: AnalyticsPeriod;
  range: AnalyticsDateRange;
  currency: string;
  revenue: {
    totalCents: number;
    previousPeriodCents: number;
    changePercent: number | null;
  };
  jobVolume: {
    total: number;
    completed: number;
    active: number;
    previousPeriodTotal: number;
    trend: AnalyticsTrendPoint[];
  };
  customerGrowth: {
    /** Verified customers with qualifying invoice evidence — not raw Xero contact import count. */
    totalCustomers: number;
    rawContactRecords: number;
    newInPeriod: number;
    previousPeriodNew: number;
    trend: AnalyticsTrendPoint[];
  };
  invoicePerformance: {
    created: number;
    sent: number;
    paid: number;
    overdue: number;
    totalInvoicedCents: number;
    totalPaidCents: number;
  };
  paymentPerformance: {
    count: number;
    totalCents: number;
    averageCents: number;
  };
  outstandingBalances: {
    count: number;
    totalCents: number;
  };
  operationalKpis: {
    scheduledJobs: number;
    completionRatePercent: number | null;
    lowStockItems: number;
    fleetInUse: number;
    fleetMaintenance: number;
  };
};

export type AnalyticsTrends = {
  period: AnalyticsPeriod;
  range: AnalyticsDateRange;
  revenue: AnalyticsTrendPoint[];
  jobVolume: AnalyticsTrendPoint[];
  customerGrowth: AnalyticsTrendPoint[];
  payments: AnalyticsTrendPoint[];
};

export type JobProfitabilityRecord = {
  jobId: string;
  jobTitle: string;
  customerName: string;
  status: string;
  revenueCents: number;
  materialCostCents: number | null;
  labourHours: number | null;
  labourCostCents: number | null;
  estimatedProfitCents: number | null;
  marginPercent: number | null;
  costTrackingAvailable: boolean;
};

export type JobProfitabilityAnalytics = {
  range: AnalyticsDateRange;
  currency: string;
  jobs: JobProfitabilityRecord[];
  totals: {
    revenueCents: number;
    estimatedProfitCents: number | null;
    averageMarginPercent: number | null;
  };
};

export type TechnicianPerformanceRecord = {
  userId: string;
  name: string;
  jobsCompleted: number;
  jobsAssigned: number;
  averageCompletionHours: number | null;
  workloadScore: number;
  customerRatingsAvailable: false;
};

export type TechnicianPerformanceAnalytics = {
  range: AnalyticsDateRange;
  technicians: TechnicianPerformanceRecord[];
};

export type CustomerAnalytics = {
  range: AnalyticsDateRange;
  newCustomers: number;
  repeatCustomers: number;
  /** Verified customers with qualifying invoice evidence. */
  totalCustomers: number;
  rawContactRecords: number;
  activityCount: number;
  quoteConversionRatePercent: number | null;
  quotesSent: number;
  quotesAccepted: number;
  customersWithOutstandingInvoices: number;
  topCustomersByRevenue: Array<{
    customerId: string;
    customerName: string;
    revenueCents: number;
  }>;
  trend: AnalyticsTrendPoint[];
};

export type FinanceAnalytics = {
  range: AnalyticsDateRange;
  currency: string;
  cashFlow: {
    inflowCents: number;
    invoicedCents: number;
    outstandingCents: number;
  };
  revenueTrend: AnalyticsTrendPoint[];
  paymentTrend: AnalyticsTrendPoint[];
  outstandingInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    outstandingCents: number;
    dueDate: string | null;
    daysOverdue: number | null;
  }>;
  monthlyComparison: {
    currentPeriodRevenueCents: number;
    previousPeriodRevenueCents: number;
    changePercent: number | null;
  };
};

export type ReportDefinitionSummary = {
  id: string | null;
  reportType: ReportType;
  name: string;
  description: string;
  isBuiltIn: boolean;
};

export type ReportRunSummary = {
  id: string;
  reportType: ReportType;
  status: ReportRunStatus;
  summary: string | null;
  parameters: Record<string, unknown>;
  generatedByUserId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type ReportRunDetail = ReportRunSummary & {
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  exportReady: boolean;
};

export type GenerateReportRequest = {
  reportType: ReportType;
  from?: string;
  to?: string;
  period?: AnalyticsPeriod;
};

export type AnalyticsDashboardQuery = {
  period?: AnalyticsPeriod;
  from?: string;
  to?: string;
};
