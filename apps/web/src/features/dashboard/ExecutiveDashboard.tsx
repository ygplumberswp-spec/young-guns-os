import { Suspense, lazy, useEffect } from 'react';
import { OPS_SNAPSHOT_FOLLOW_UP_MS } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { fetchExecutiveDashboardSummary } from '../../lib/dashboard-api-client';
import {
  fetchOpsIntelligenceSnapshot,
  refreshOpsIntelligenceSnapshot,
} from '../../lib/ops-intelligence-api-client';
import { useDeferredMount } from '../../lib/use-deferred-mount';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SectionErrorBoundary } from '../../components/ux';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { FleetOverviewPanel } from './FleetOverviewPanel';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { OpsIntelligenceAlerts } from './OpsIntelligenceAlerts';
import { OutstandingInvoicesPanel } from './OutstandingInvoicesPanel';
import { PrioritiesSummaryPanel } from './PrioritiesSummaryPanel';
import { QuickLinksPanel } from './QuickLinksPanel';
import { ScheduleOverviewPanel } from './ScheduleOverviewPanel';
import { TodayAtAGlancePanel } from './TodayAtAGlancePanel';

const AuraExecutiveChatPanel = lazy(async () => {
  const mod = await import('./AuraExecutiveChatPanel');
  return { default: mod.AuraExecutiveChatPanel };
});

/** Defer secondary panels so executive summary paints first (PERF-001). */
const DEFER_OPS_MS = 120;
const DEFER_FLEET_MS = 180;
const DEFER_SCHEDULE_MS = 280;
const DEFER_CONNECTIONS_MS = 360;
const DEFER_AURA_MS = 520;

export function ExecutiveDashboard() {
  const { accessToken, user } = useAuth();
  const authReady = Boolean(accessToken);

  const deferOps = useDeferredMount(authReady, DEFER_OPS_MS);
  const deferFleet = useDeferredMount(authReady, DEFER_FLEET_MS);
  const deferSchedule = useDeferredMount(authReady, DEFER_SCHEDULE_MS);
  const deferConnections = useDeferredMount(authReady, DEFER_CONNECTIONS_MS);
  const deferAura = useDeferredMount(authReady, DEFER_AURA_MS);

  const summaryQuery = useStaffCachedQuery({
    queryKey: 'dashboard/executive-summary',
    enabled: authReady,
    fetcher: (signal) => fetchExecutiveDashboardSummary(accessToken!, { signal }),
  });

  const opsQuery = useStaffCachedQuery({
    queryKey: 'ops-intelligence/snapshot',
    enabled: authReady && deferOps,
    fetcher: (signal) => fetchOpsIntelligenceSnapshot(accessToken!, { signal }),
  });

  const {
    tracking,
    isPolling,
    lastFetchedAt: fleetFetchedAt,
    error: fleetError,
  } = useCartrackLivePositions({
    accessToken,
    enabled: authReady && deferFleet,
  });

  const summary = summaryQuery.data;
  const isLoading = summaryQuery.isLoading && !summary;
  const loadError = summaryQuery.error;
  const liveJobs = summary?.liveOperations ?? [];
  const opsSnapshot = opsQuery.data;
  const opsLoading = opsQuery.isLoading && !opsSnapshot;
  const opsEvents = opsSnapshot?.events ?? [];
  const opsRefreshing = opsSnapshot?.refreshing ?? false;
  const opsDataAvailable = opsSnapshot?.dataAvailable ?? true;
  const opsGeneratedAt = opsSnapshot?.generatedAt ?? null;
  const refetchOps = opsQuery.refetch;

  useEffect(() => {
    if (!opsRefreshing && opsDataAvailable) return;
    const timer = setTimeout(() => void refetchOps(), OPS_SNAPSHOT_FOLLOW_UP_MS);
    return () => clearTimeout(timer);
  }, [opsRefreshing, opsDataAvailable, opsGeneratedAt, refetchOps]);

  const refetchSummary = () => void summaryQuery.refetch();
  const refreshOps = () => {
    void (async () => {
      if (accessToken) {
        await refreshOpsIntelligenceSnapshot(accessToken).catch(() => undefined);
      }
      await opsQuery.refetch();
    })();
  };

  return (
    <div className="exec-dashboard">
      <ExecutiveDashboardHeader
        firstName={user?.firstName}
        counts={summary?.header ?? null}
        isLoading={isLoading}
      />

      {deferOps && (opsEvents.length > 0 || opsQuery.error) ? (
        <SectionErrorBoundary sectionName="Operations intelligence" onRetry={refreshOps}>
          <OpsIntelligenceAlerts
            events={opsEvents}
            generatedAt={opsSnapshot?.generatedAt ?? null}
            isLoading={opsLoading}
            error={opsQuery.error}
            onRetry={refreshOps}
            onDismissed={() => void opsQuery.refetch()}
          />
        </SectionErrorBoundary>
      ) : null}

      <div className="exec-dashboard-row exec-dashboard-row--top">
        <SectionErrorBoundary sectionName="Today at a glance" onRetry={refetchSummary}>
          <TodayAtAGlancePanel
            summary={summary ?? null}
            tracking={deferFleet ? tracking : null}
            fleetError={deferFleet ? fleetError : null}
            isLoading={isLoading}
            error={loadError}
            onRetry={refetchSummary}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Fleet overview">
          {deferFleet ? (
            <FleetOverviewPanel
              tracking={tracking}
              lastFetchedAt={fleetFetchedAt}
              error={fleetError}
              isLoading={!tracking && !fleetError}
            />
          ) : (
            <DashboardSectionSkeleton rows={3} />
          )}
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
          {deferAura ? (
            <Suspense fallback={<DashboardSectionSkeleton rows={4} />}>
              <AuraExecutiveChatPanel />
            </Suspense>
          ) : (
            <DashboardSectionSkeleton rows={4} />
          )}
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--operations">
        <SectionErrorBoundary sectionName="Live fleet map" onRetry={refetchSummary}>
          <LiveOperationsPanel
            jobs={liveJobs}
            tracking={deferFleet ? tracking : null}
            lastFetchedAt={fleetFetchedAt}
            isPolling={isPolling}
            fleetError={deferFleet ? fleetError : null}
            opsStrip={deferOps ? (opsSnapshot?.liveStrip ?? null) : null}
            opsStripLoading={opsLoading}
            opsStripError={opsQuery.error}
            opsFreshness={opsSnapshot?.freshness ?? null}
            opsAgeSeconds={opsSnapshot?.ageSeconds ?? 0}
            opsRefreshing={opsRefreshing}
            opsDataAvailable={opsDataAvailable}
            opsSources={opsSnapshot?.sources ?? []}
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
          {deferSchedule ? (
            <ScheduleOverviewPanel />
          ) : (
            <DashboardSectionSkeleton rows={4} />
          )}
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Quick links">
          <QuickLinksPanel />
        </SectionErrorBoundary>
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
            {deferConnections ? (
              <ConnectionsPanel />
            ) : (
              <DashboardSectionSkeleton rows={6} />
            )}
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
}
