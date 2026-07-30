import { PageHeader } from '@titan/ui';

export function DashboardWelcome() {
  return (
    <div className="dashboard-header">
      <PageHeader
        title="Dashboard"
        description="Overview of your business activity"
      />
      <span className="dashboard-header__status">All metrics at zero — no data added yet</span>
    </div>
  );
}
