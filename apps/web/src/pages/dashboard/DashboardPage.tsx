import { useAuth } from '../../lib/auth-context';
import { DashboardEmptyPanels } from '../../features/dashboard/DashboardEmptyPanels';
import { DashboardQuickActions } from '../../features/dashboard/DashboardQuickActions';
import { DashboardStats } from '../../features/dashboard/DashboardStats';
import { AgentActivityCard, PageHeader } from '../../components/ux';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard owner-page-content">
      <PageHeader
        title="Dashboard"
        description="Overview of Young Guns Plumbing operational activity."
      />
      <DashboardStats />
      <DashboardQuickActions />
      <AgentActivityCard compact title="Recent agent activity" limit={4} />
      <DashboardEmptyPanels />
    </div>
  );
}
