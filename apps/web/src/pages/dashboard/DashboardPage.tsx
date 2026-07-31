import { useAuth } from '../../lib/auth-context';
import { DashboardEmptyPanels } from '../../features/dashboard/DashboardEmptyPanels';
import { DashboardStats } from '../../features/dashboard/DashboardStats';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard owner-page-content">
      <DashboardStats />
      <DashboardEmptyPanels />
    </div>
  );
}
