import { useAuth } from '../../lib/auth-context';
import { fetchExecutiveDashboardSummary } from '../../lib/dashboard-api-client';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { CustomerValueMetricsPanel } from '../crm/CustomerValueMetricsPanel';
import { SectionErrorBoundary } from '../../components/ux';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { PrioritiesSummaryPanel } from './PrioritiesSummaryPanel';
import { TeamTodayPanel } from './TeamTodayPanel';
import { TodayAtAGlanceGrid } from './TodayAtAGlanceGrid';

export function ExecutiveDashboard() {
  const { accessToken, user } = useAuth();

  const summaryQuery = useStaffCachedQuery({
    queryKey: 'dashboard/executive-summary',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchExecutiveDashboardSummary(accessToken!),
  });

  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading && !summary;
  const loadError = summaryQuery.error;

  return (
    <div className="exec-dashboard">
      <ExecutiveDashboardHeader
        firstName={user?.firstName}
        counts={summary?.header ?? null}
        isLoading={isLoading}
      />

      <SectionErrorBoundary sectionName="Today at a glance" onRetry={() => void summaryQuery.refetch()}>
        <TodayAtAGlanceGrid
          data={summary?.todayAtAGlance ?? null}
          isLoading={isLoading}
          error={loadError}
          onRetry={() => void summaryQuery.refetch()}
        />
      </SectionErrorBoundary>

      <div className="exec-dashboard-grid">
        <SectionErrorBoundary sectionName="Live operations" onRetry={() => void summaryQuery.refetch()}>
          <LiveOperationsPanel
            jobs={summary?.liveOperations ?? []}
            isLoading={isLoading}
            error={loadError}
            onRetry={() => void summaryQuery.refetch()}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Completed today" onRetry={() => void summaryQuery.refetch()}>
          <CompletedTodayPanel
            jobs={summary?.completedToday ?? []}
            isLoading={isLoading}
            error={loadError}
            onRetry={() => void summaryQuery.refetch()}
          />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-grid">
        <SectionErrorBoundary sectionName="Priorities">
          <PrioritiesSummaryPanel
            priorities={summary?.priorities ?? null}
            isLoading={isLoading}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Team today" onRetry={() => void summaryQuery.refetch()}>
          <TeamTodayPanel
            members={summary?.teamToday ?? []}
            isLoading={isLoading}
            error={loadError}
            onRetry={() => void summaryQuery.refetch()}
          />
        </SectionErrorBoundary>
      </div>

      <SectionErrorBoundary sectionName="Customer value">
        <CustomerValueMetricsPanel compact />
      </SectionErrorBoundary>
    </div>
  );
}
