import { useEffect, useMemo } from 'react';
import {
  canAccessDashboardAuraSurface,
  DASHBOARD_LIST_LIMITS,
  OPS_SNAPSHOT_FOLLOW_UP_MS,
} from '@titan/shared';
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
import { AttentionRequiredPanel } from './AttentionRequiredPanel';
import { AuraExecutiveChatLauncher } from './AuraExecutiveChatLauncher';
import { AuraExecutiveRecommendationsPanel } from './AuraExecutiveRecommendationsPanel';
import { BusinessHeartbeatPanel } from './BusinessHeartbeatPanel';
import { CompletedTodayPanel } from './CompletedTodayPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { DashboardAlertsStrip } from './DashboardAlertsStrip';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { ExecutiveDashboardHeader } from './ExecutiveDashboardHeader';
import { FinancialTruthPanel } from './FinancialTruthPanel';
import { FleetOverviewPanel } from './FleetOverviewPanel';
import { LiveOperationsPanel } from './LiveOperationsPanel';
import { OpsIntelligenceAlerts } from './OpsIntelligenceAlerts';
import { OutstandingInvoicesPanel } from './OutstandingInvoicesPanel';
import { OwnerCommandFinancePulse } from './OwnerCommandFinancePulse';
import { QuickLinksPanel } from './QuickLinksPanel';
import { SalesOpportunitiesPanel } from './SalesOpportunitiesPanel';
import { TeamPerformancePanel } from './TeamPerformancePanel';
import { TodayAtAGlancePanel } from './TodayAtAGlancePanel';

const DEFER_OPS_MS = 120;
const DEFER_FLEET_MS = 180;
const DEFER_SUPPORT_MS = 320;

export function ExecutiveDashboard() {
  const { accessToken, user } = useAuth();
  const authReady = Boolean(accessToken);

  const deferOps = useDeferredMount(authReady, DEFER_OPS_MS);
  const deferFleet = useDeferredMount(authReady, DEFER_FLEET_MS);
  const deferSupport = useDeferredMount(authReady, DEFER_SUPPORT_MS);

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
  const dash001 = summary?.dash001 ?? null;
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

  const previewJobs = liveJobs.slice(0, DASHBOARD_LIST_LIMITS.activeJobs);

  /** Canonical AURA gate: agents/intelligence read (Manager + Owner). Not Technician/Client. */
  const canAccessDashboardAura = useMemo(
    () =>
      Boolean(
        user &&
          canAccessDashboardAuraSurface({
            roleName: user.roleName,
            permissions: user.permissions,
          }),
      ),
    [user],
  );

  return (
    <div className="exec-dashboard exec-dashboard--dash001a exec-dashboard--owner001">
      <div className="exec-dashboard-region exec-dashboard-region--greeting">
        <ExecutiveDashboardHeader
          firstName={user?.firstName}
          counts={summary?.header ?? null}
          headerExtended={dash001?.headerExtended ?? null}
          isLoading={isLoading}
        />

        {dash001?.alerts.length ? <DashboardAlertsStrip alerts={dash001.alerts} /> : null}

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
      </div>

      {/*
        YG-CUTOVER-001B AURA visibility: primary surface immediately after greeting.
        Required mobile order: AURA → Heartbeat → Attention → Jobs → Finance → Fleet → Tools.
        DOM placement must not rely on CSS order alone (iPhone regression when AURA sat after Fleet).
      */}
      {canAccessDashboardAura ? (
        <div className="exec-dashboard-row exec-dashboard-row--aura exec-dashboard-region exec-dashboard-region--aura">
          <SectionErrorBoundary sectionName="AURA Executive" onRetry={refetchSummary}>
            <AuraExecutiveRecommendationsPanel
              data={dash001?.auraExecutive ?? null}
              isLoading={isLoading}
              error={loadError}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="AURA">
            <AuraExecutiveChatLauncher />
          </SectionErrorBoundary>
        </div>
      ) : null}

      <div className="exec-dashboard-region exec-dashboard-region--heartbeat">
        <SectionErrorBoundary sectionName="Business Heartbeat" onRetry={refetchSummary}>
          <BusinessHeartbeatPanel
            data={dash001?.businessHeartbeat ?? null}
            section={summary?.sections.businessHeartbeat ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
          />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-region exec-dashboard-region--finance-pulse">
        <SectionErrorBoundary sectionName="Financial Command Pulse">
          <OwnerCommandFinancePulse />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--finance exec-dashboard-region exec-dashboard-region--finance">
        <SectionErrorBoundary sectionName="Financial Truth" onRetry={refetchSummary}>
          <FinancialTruthPanel
            data={dash001?.financialTruth ?? null}
            xeroFinance={summary?.xeroFinance ?? null}
            section={summary?.sections.financialTruth ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
          />
        </SectionErrorBoundary>
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
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--attention exec-dashboard-region exec-dashboard-region--attention">
        <SectionErrorBoundary sectionName="Attention Required" onRetry={refetchSummary}>
          <AttentionRequiredPanel
            data={dash001?.attentionRequired ?? null}
            isLoading={isLoading}
            error={loadError}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Sales & Opportunities" onRetry={refetchSummary}>
          <SalesOpportunitiesPanel
            data={dash001?.salesOpportunities ?? null}
            section={summary?.sections.salesOpportunities ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
          />
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--team-fleet exec-dashboard-region exec-dashboard-region--ops">
        <SectionErrorBoundary sectionName="Team Performance" onRetry={refetchSummary}>
          <TeamPerformancePanel
            data={dash001?.teamPerformance ?? null}
            section={summary?.sections.teamPerformance ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
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
            <DashboardSectionSkeleton rows={2} />
          )}
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="Live fleet map" onRetry={refetchSummary}>
          {deferFleet ? (
            <LiveOperationsPanel
              jobs={liveJobs}
              tracking={tracking}
              lastFetchedAt={fleetFetchedAt}
              isPolling={isPolling}
              fleetError={fleetError}
              opsStrip={deferOps ? (opsSnapshot?.liveStrip ?? null) : null}
              opsStripLoading={opsLoading}
              opsStripError={opsQuery.error}
              opsFreshness={opsSnapshot?.freshness ?? null}
              opsAgeSeconds={opsSnapshot?.ageSeconds ?? 0}
              opsRefreshing={opsRefreshing}
              opsDataAvailable={opsDataAvailable}
              opsSources={opsSnapshot?.sources ?? []}
            />
          ) : (
            <DashboardSectionSkeleton rows={2} />
          )}
        </SectionErrorBoundary>
      </div>

      <div className="exec-dashboard-row exec-dashboard-row--support exec-dashboard-region exec-dashboard-region--jobs">
        <SectionErrorBoundary sectionName="Active jobs" onRetry={refetchSummary}>
          <ActiveJobsPanel
            jobs={previewJobs}
            section={summary?.sections.activeJobs ?? null}
            generatedAt={summary?.generatedAt ?? null}
            isLoading={isLoading}
            error={loadError}
            onRetry={refetchSummary}
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
            previewLimit={DASHBOARD_LIST_LIMITS.outstandingInvoices}
          />
        </SectionErrorBoundary>
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
      </div>

      {deferSupport ? (
        <div className="exec-dashboard-row exec-dashboard-row--tools exec-dashboard-region exec-dashboard-region--tools">
          <SectionErrorBoundary sectionName="Connections">
            <ConnectionsPanel compact />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="Quick links">
            <QuickLinksPanel compact />
          </SectionErrorBoundary>
        </div>
      ) : null}
    </div>
  );
}
