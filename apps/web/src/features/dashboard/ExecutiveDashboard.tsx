import { useAuth } from '../../lib/auth-context';
import { fetchExecutiveDashboardSummary } from '../../lib/dashboard-api-client';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SectionErrorBoundary } from '../../components/ux';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { DashboardUtilityRail } from './DashboardUtilityRail';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { OutstandingInvoicesPanel } from './OutstandingInvoicesPanel';
import { PrioritiesSummaryPanel } from './PrioritiesSummaryPanel';
import { QuickLinksPanel } from './QuickLinksPanel';
import { ScheduleOverviewPanel } from './ScheduleOverviewPanel';
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
  const liveJobs = summary?.liveOperations ?? [];

  return (
    <div className="exec-dashboard">
      <ExecutiveDashboardHeader
        firstName={user?.firstName}
        counts={summary?.header ?? null}
        isLoading={isLoading}
      />

      <div className="exec-dashboard-body">
        <div className="exec-dashboard-main">
          <SectionErrorBoundary
            sectionName="KPI row"
            onRetry={() => void summaryQuery.refetch()}
          >
            <TodayAtAGlanceGrid
              data={summary?.todayAtAGlance ?? null}
              isLoading={isLoading}
              error={loadError}
              onRetry={() => void summaryQuery.refetch()}
            />
          </SectionErrorBoundary>

          <div className="exec-dashboard-row exec-dashboard-row--primary">
            <div className="exec-dashboard-row__wide">
              <SectionErrorBoundary
                sectionName="Live operations"
                onRetry={() => void summaryQuery.refetch()}
              >
                <LiveOperationsPanel
                  jobs={liveJobs}
                  isLoading={isLoading}
                  error={loadError}
                  onRetry={() => void summaryQuery.refetch()}
                />
              </SectionErrorBoundary>
            </div>
            <SectionErrorBoundary
              sectionName="Completed today"
              onRetry={() => void summaryQuery.refetch()}
            >
              <CompletedTodayPanel
                jobs={summary?.completedToday ?? []}
                isLoading={isLoading}
                error={loadError}
                onRetry={() => void summaryQuery.refetch()}
              />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Priorities">
              <PrioritiesSummaryPanel
                priorities={summary?.priorities ?? null}
                isLoading={isLoading}
              />
            </SectionErrorBoundary>
          </div>

          <div className="exec-dashboard-row exec-dashboard-row--secondary">
            <div className="exec-dashboard-row__wide">
              <SectionErrorBoundary sectionName="Schedule overview">
                <ScheduleOverviewPanel />
              </SectionErrorBoundary>
            </div>
            <SectionErrorBoundary
              sectionName="Outstanding invoices"
              onRetry={() => void summaryQuery.refetch()}
            >
              <OutstandingInvoicesPanel
                data={summary?.outstandingInvoices ?? null}
                isLoading={isLoading}
                error={loadError}
                onRetry={() => void summaryQuery.refetch()}
              />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Quick links">
              <QuickLinksPanel />
            </SectionErrorBoundary>
          </div>
        </div>

        <DashboardUtilityRail
          summary={summary ?? null}
          isLoading={isLoading}
          error={loadError}
          onRetry={() => void summaryQuery.refetch()}
        />
      </div>
    </div>
  );
}
