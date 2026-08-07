type DashboardSectionSkeletonProps = {
  rows?: number;
  className?: string;
};

/** Per-section loading placeholder for executive dashboard panels. */
export function DashboardSectionSkeleton({
  rows = 3,
  className = '',
}: DashboardSectionSkeletonProps) {
  return (
    <div className={`exec-dashboard-skeleton ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="exec-dashboard-skeleton__row" />
      ))}
    </div>
  );
}
