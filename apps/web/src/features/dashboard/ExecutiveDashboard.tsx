import { useAuth } from '../../lib/auth-context';
import { fetchExecutiveDashboardSummary } from '../../lib/dashboard-api-client';
import { fetchOpsIntelligenceSnapshot } from '../../lib/ops-intelligence-api-client';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SectionErrorBoundary } from '../../components/ux';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { DashboardUtilityRail } from './DashboardUtilityRail';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { OpsIntelligenceAlerts } from './OpsIntelligenceAlerts';
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

  const opsQuery = useStaffCachedQuery({
    queryKey: 'ops-intelligence/snapshot',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchOpsIntelligenceSnapshot(accessToken!),
  });

  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading && !summary;
  const loadError = summaryQuery.error;
  const liveJobs = summary?.liveOperations ?? [];
  const opsSnapshot = opsQuery.data;
  const opsLoading = opsQuery.isLoading && !opsSnapshot;
  const opsEvents = opsSnapshot?.events ?? [];

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
              generatedAt={summary?.generatedAt ?? null}
              isLoading={isLoading}
              error={loadError}
              onRetry={() => void summaryQuery.refetch()}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary
            sectionName="Operations intelligence"
            onRetry={() => void opsQuery.refetch()}
          >
            <OpsIntelligenceAlerts
              events={opsEvents}
              generatedAt={opsSnapshot?.generatedAt ?? null}
              isLoading={opsLoading}
              error={opsQuery.error}
              onRetry={() => void opsQuery.refetch()}
              onDismissed={() => void opsQuery.refetch()}
            />
          </SectionErrorBoundary>

          <div className="exec-dashboard-row exec-dashboard-row--primary">
            <div className="exec-dashboard-row__wide exec-dashboard-row__stack">
              <SectionErrorBoundary
                sectionName="Live operations"
                onRetry={() => void summaryQuery.refetch()}
              >
                <LiveOperationsPanel
                  jobs={liveJobs}
                  isLoading={isLoading}
                  error={loadError}
                  onRetry={() => void summaryQuery.refetch()}
                  opsStrip={opsSnapshot?.liveStrip ?? null}
                  opsStripLoading={opsLoading}
                  opsStripError={opsQuery.error}
                />
              </SectionErrorBoundary>
              <SectionErrorBoundary
                sectionName="Active jobs"
                onRetry={() => void summaryQuery.refetch()}
              >
                <ActiveJobsPanel
                  jobs={liveJobs}
                  generatedAt={summary?.generatedAt ?? null}
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
                generatedAt={summary?.generatedAt ?? null}
                isLoading={isLoading}
                error={loadError}
                onRetry={() => void summaryQuery.refetch()}
              />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Priorities">
              <PrioritiesSummaryPanel
                priorities={summary?.priorities ?? null}
                generatedAt={summary?.generatedAt ?? null}
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
                xeroFinance={summary?.xeroFinance ?? null}
                generatedAt={summary?.generatedAt ?? null}
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
