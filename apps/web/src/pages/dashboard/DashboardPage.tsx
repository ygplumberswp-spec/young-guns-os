import { useAuth } from '../../lib/auth-context';
import { ExecutiveDashboard } from '../../features/dashboard/ExecutiveDashboard';

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard exec-dashboard-page">
      <ExecutiveDashboard />
    </div>
  );
}
