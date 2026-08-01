import { useAuth } from '../../lib/auth-context';
import { DashboardEmptyPanels } from '../../features/dashboard/DashboardEmptyPanels';
import { DashboardQuickActions } from '../../features/dashboard/DashboardQuickActions';
import { DashboardStats } from '../../features/dashboard/DashboardStats';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard owner-page-content">
      <DashboardStats />
      <DashboardQuickActions />
      <DashboardEmptyPanels />
    </div>
  );
}
