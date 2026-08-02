import type { AnalyticsDateRange, AnalyticsPeriod } from './analytics.js';

export type ReportMetricKind = 'money' | 'count' | 'percent' | 'hours' | 'text' | 'unavailable';

export type ReportMetricValue =
  | { kind: 'money'; cents: number; currency: string }
  | { kind: 'count'; count: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'hours'; hours: number }
  | { kind: 'text'; text: string }
  | { kind: 'unavailable'; reason: string };

export type ReportMetric = {
  id: string;
  label: string;
  definition: string;
  value: ReportMetricValue;
  source: string;
  lastUpdatedAt: string;
  drillDownHref: string | null;
};

export type ReportBreakdownRow = {
  label: string;
  value: number;
  displayValue?: string;
  href: string | null;
};

export type ReportBreakdown = {
  id: string;
  title: string;
  definition: string;
  source: string;
  lastUpdatedAt: string;
  rows: ReportBreakdownRow[];
  emptyMessage: string;
};

export type AnalyticsReportingSectionId = 'executive' | 'operational' | 'financial' | 'sales';

export type AnalyticsReportingSection = {
  id: AnalyticsReportingSectionId;
  title: string;
  metrics: ReportMetric[];
  breakdowns: ReportBreakdown[];
};

export type AnalyticsReportingWorkspace = {
  period: AnalyticsPeriod;
  range: AnalyticsDateRange;
  currency: string;
  generatedAt: string;
  dataSources: string[];
  sections: AnalyticsReportingSection[];
};

export const ANALYTICS_REPORTING_SECTIONS: Array<{
  id: AnalyticsReportingSectionId;
  label: string;
  description: string;
}> = [
  {
    id: 'executive',
    label: 'Executive',
    description: 'Revenue, cash, jobs, conversion, retention, and fleet KPIs',
  },
  {
    id: 'operational',
    label: 'Operational',
    description: 'Jobs by status, technician workload, callbacks, travel, and stock use',
  },
  {
    id: 'financial',
    label: 'Financial',
    description: 'Invoiced vs collected, cash movement, debtor aging, and profitability',
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Leads by source, response time, conversion, and quote performance',
  },
];
