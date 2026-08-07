import type { ReactElement } from 'react';

type DashboardMetricIconProps = {
  metricId: string;
};

export function DashboardMetricIcon({ metricId }: DashboardMetricIconProps) {
  return (
    <span className="dashboard-metric-icon" aria-hidden="true">
      <svg
        width={30}
        height={30}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {METRIC_ICONS[metricId] ?? METRIC_ICONS.customers}
      </svg>
    </span>
  );
}

const METRIC_ICONS: Record<string, ReactElement> = {
  customers: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  'active-jobs': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
    </>
  ),
  'open-quotes': (
    <>
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M8 9h8" />
    </>
  ),
  revenue: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 5-6" />
    </>
  ),
  outstanding: (
    <>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  'overdue-invoices': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  'jobs-today': (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  'stock-alerts': (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  fleet: (
    <>
      <path d="M14 16H9m10-8h1l-3 7H4l-3-7h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="17.5" r="2.5" />
    </>
  ),
  leads: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
};
