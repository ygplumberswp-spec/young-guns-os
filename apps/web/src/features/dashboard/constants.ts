export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

/** Zero-value metrics — real counts will replace these when modules ship. */
export const DASHBOARD_METRICS: DashboardMetric[] = [
  {
    id: 'customers',
    label: 'Customers',
    value: '0',
    hint: 'Live count from CRM',
  },
  {
    id: 'active-jobs',
    label: 'Active Jobs',
    value: '0',
    hint: 'New, scheduled, and in progress',
  },
  {
    id: 'open-quotes',
    label: 'Open Quotes',
    value: '0',
    hint: 'Draft and sent quotes',
  },
  {
    id: 'revenue',
    label: 'Revenue (MTD)',
    value: '$0.00',
    hint: 'Payments received this month',
  },
];

export type DashboardEmptyPanel = {
  id: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

export const DASHBOARD_EMPTY_PANELS: DashboardEmptyPanel[] = [
  {
    id: 'recent-activity',
    title: 'Recent Activity',
    description: 'Latest updates across your business',
    emptyTitle: 'No activity yet',
    emptyDescription: 'Activity will appear here once you start using TITAN modules.',
  },
  {
    id: 'upcoming-work',
    title: 'Upcoming Work',
    description: 'Scheduled jobs and tasks',
    emptyTitle: 'Nothing scheduled',
    emptyDescription: 'Jobs and schedules will show here in a future milestone.',
  },
];
