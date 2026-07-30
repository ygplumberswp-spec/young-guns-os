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
};
