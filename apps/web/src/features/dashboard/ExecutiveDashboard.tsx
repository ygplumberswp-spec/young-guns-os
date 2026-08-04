import { useAuth } from '../../lib/auth-context';
import { fetchExecutiveDashboardSummary } from '../../lib/dashboard-api-client';
import { fetchOpsIntelligenceSnapshot } from '../../lib/ops-intelligence-api-client';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SectionErrorBoundary } from '../../components/ux';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { AuraExecutiveChatPanel } from './AuraExecutiveChatPanel';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { FleetOverviewPanel } from './FleetOverviewPanel';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { OpsIntelligenceAlerts } from './OpsIntelligenceAlerts';
import { OutstandingInvoicesPanel } from './OutstandingInvoicesPanel';
import { PrioritiesSummaryPanel } from './PrioritiesSummaryPanel';
import { QuickLinksPanel } from './QuickLinksPanel';
import { ScheduleOverviewPanel } from './ScheduleOverviewPanel';
import { TodayAtAGlancePanel } from './TodayAtAGlancePanel';

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

  // One Cartrack poller for the whole dashboard. Fleet Overview, the map and the glance
  // card read the same payload rather than each opening its own polling loop.
  const {
    tracking,
    isPolling,
    lastFetchedAt: fleetFetchedAt,
    error: fleetError,
  } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading && !summary;
  const loadError = summaryQuery.error;
  const liveJobs = summary?.liveOperations ?? [];
  const opsSnapshot = opsQuery.data;
  const opsLoading = opsQuery.isLoading && !opsSnapshot;
  const opsEvents = opsSnapshot?.events ?? [];
  const refetchSummary = () => void summaryQuery.refetch();

  return (
    <div className="exec-dashboard">
      <ExecutiveDashboardHeader
        firstName={user?.firstName}
        counts={summary?.header ?? null}
        isLoading={isLoading}
      />

      {opsEvents.length > 0 || opsQuery.error ? (
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
      ) : null}

      <div className="exec-dashboard-row exec-dashboard-row--top">
        <SectionErrorBoundary sectionName="Today at a glance" onRetry={refetchSummary}>
          <TodayAtAGlancePanel
            summary={summary ?? null}
            tracking={tracking}
            fleetError={fleetError}
            isLoading={isLoading}
            error={loadError}
            onRetry={refetchSummary}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Fleet overview">
          <FleetOverviewPanel
            tracking={tracking}
            lastFetchedAt={fleetFetchedAt}
            error={fleetError}
            isLoading={!tracking && !fleetError}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Priorities">
          <PrioritiesSummaryPanel
            priorities={summary?.priorities ?? null}
            section={summary?.sections.priorities ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="AURA executive chat">
          <AuraExecutiveChatPanel />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--operations">
        <SectionErrorBoundary sectionName="Live fleet map" onRetry={refetchSummary}>
          <LiveOperationsPanel
            jobs={liveJobs}
            tracking={tracking}
            lastFetchedAt={fleetFetchedAt}
            isPolling={isPolling}
            fleetError={fleetError}
            opsStrip={opsSnapshot?.liveStrip ?? null}
            opsStripLoading={opsLoading}
            opsStripError={opsQuery.error}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Outstanding invoices" onRetry={refetchSummary}>
          <OutstandingInvoicesPanel
            data={summary?.outstandingInvoices ?? null}
            xeroFinance={summary?.xeroFinance ?? null}
            section={summary?.sections.outstandingInvoices ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
            onRetry={refetchSummary}
          />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--lower">
        <SectionErrorBoundary sectionName="Active jobs" onRetry={refetchSummary}>
          <ActiveJobsPanel
            jobs={liveJobs}
            section={summary?.sections.activeJobs ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
            onRetry={refetchSummary}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Schedule overview">
          <ScheduleOverviewPanel />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Quick links">
          <QuickLinksPanel />
        </SectionErrorBoundary>
        {/* Completed Today sits directly above Connections in the fourth column. */}
        <div className="exec-dashboard-row__stack">
          <SectionErrorBoundary sectionName="Completed today" onRetry={refetchSummary}>
            <CompletedTodayPanel
              jobs={summary?.completedToday ?? []}
              section={summary?.sections.completedToday ?? null}
              generatedAt={summary?.generatedAt ?? null}
              isLoading={isLoading}
              error={loadError}
              onRetry={refetchSummary}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="Connections">
            <ConnectionsPanel />
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
}
