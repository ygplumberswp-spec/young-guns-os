type DashboardPanelEmptyIconProps = {
  panelId: string;
};

export function DashboardPanelEmptyIcon({ panelId }: DashboardPanelEmptyIconProps) {
  return (
    <span className="dashboard-panel-empty-icon" aria-hidden="true">
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {panelId === 'upcoming-work' ? (
          <>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
          </>
        ) : (
          <>
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </>
        )}
      </svg>
    </span>
  );
}
