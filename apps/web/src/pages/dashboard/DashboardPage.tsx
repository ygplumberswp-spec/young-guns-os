import { useAuth } from '../../lib/auth-context';
import { DashboardEmptyPanels } from '../../features/dashboard/DashboardEmptyPanels';
import { DashboardStats } from '../../features/dashboard/DashboardStats';
import { DashboardWelcome } from '../../features/dashboard/DashboardWelcome';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard owner-page-content">
      <DashboardWelcome />
      <DashboardStats />
      <DashboardEmptyPanels />
    </div>
  );
}
