export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
  href?: string;
};

/** UX-012 — KPI definitions shown on home (wired to live stats APIs). */
export const DASHBOARD_METRICS: DashboardMetric[] = [
  {
    id: 'customers',
    label: 'Customers',
    value: '0',
    hint: 'Live count from CRM',
    href: '/crm',
  },
  {
    id: 'active-jobs',
    label: 'Active Jobs',
    value: '0',
    hint: 'New, scheduled, and in progress',
    href: '/jobs',
  },
  {
    id: 'jobs-today',
    label: 'Jobs Today',
    value: '0',
    hint: 'Scheduled or in progress today',
    href: '/scheduling',
  },
  {
    id: 'open-quotes',
    label: 'Open Quotes',
    value: '0',
    hint: 'Draft and sent quotes',
    href: '/finance/quotes',
  },
  {
    id: 'revenue',
    label: 'Revenue (MTD)',
    value: '—',
    hint: 'Payments received this month',
    href: '/finance/payments',
  },
  {
    id: 'outstanding',
    label: 'Outstanding AR',
    value: '—',
    hint: 'Open invoice balances (total − paid)',
    href: '/finance/invoices',
  },
  {
    id: 'overdue-invoices',
    label: 'Overdue Invoices',
    value: '0',
    hint: 'Past due and still open',
    href: '/finance/invoices?overdueOnly=1',
  },
  {
    id: 'stock-alerts',
    label: 'Stock Alerts',
    value: '0',
    hint: 'Items at or below reorder level',
    href: '/inventory/products',
  },
  {
    id: 'fleet',
    label: 'Fleet In Use',
    value: '0',
    hint: 'Vehicles currently in use',
    href: '/fleet',
  },
  {
    id: 'leads',
    label: 'Active Leads',
    value: '0',
    hint: 'Open leads in the pipeline',
    href: '/leads',
  },
];
