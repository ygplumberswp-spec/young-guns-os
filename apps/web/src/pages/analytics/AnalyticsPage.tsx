import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { AnalyticsPeriod, AnalyticsReportingSectionId, ReportDefinitionSummary } from '@titan/shared';
import { ANALYTICS_PERIOD_OPTIONS, ANALYTICS_REPORTING_SECTIONS, REPORT_TYPE_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchReportCatalog,
  fetchReportingWorkspace,
  generateAnalyticsReport,
} from '../../lib/analytics-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { canAccessAnalytics, canManageAnalytics } from '../../features/analytics/utils';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';
import { ReportingSectionView } from '../../features/analytics/ReportingSectionView';

type AnalyticsTab = AnalyticsReportingSectionId | 'reports';

export function AnalyticsPage() {
  const { accessToken, user } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>('monthly');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('executive');
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAnalytics(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAnalytics(user.permissions) : false), [user]);

  const periodKey = `analytics/${period}`;

  const workspaceQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/reporting-workspace`,
    enabled: canView && activeTab !== 'reports',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchReportingWorkspace(accessToken!, { period }, { signal }),
  });

  const reportsQuery = useStaffCachedQuery({
    queryKey: 'analytics/reports',
    enabled: canView && activeTab === 'reports',
    staleTimeMs: 120_000,
    fetcher: (signal) => fetchReportCatalog(accessToken!, { signal }),
  });

  const activeSection = workspaceQuery.data?.sections.find((section) => section.id === activeTab);

  async function handleGenerateReport(reportType: ReportDefinitionSummary['reportType']) {
    if (!accessToken || !canWrite) return;

    setIsGenerating(true);
    setActionError(null);
    setSuccess(null);

    try {
      const run = await generateAnalyticsReport(accessToken, { reportType, period });
      await reportsQuery.refetch();
      setSuccess(run.summary ?? 'Report generated successfully.');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to generate report');
    } finally {
      setIsGenerating(false);
    }
  }

  if (!canView) {
    return (
      <div className="analytics-page">
        <PageHeader title="Analytics" description="You do not have permission to view analytics." />
      </div>
    );
  }

  const tabs: Array<{ id: AnalyticsTab; label: string }> = [
    ...ANALYTICS_REPORTING_SECTIONS.map((section) => ({ id: section.id, label: section.label })),
    { id: 'reports', label: 'Report catalog' },
  ];

  return (
    <div className="analytics-page">
      <PageHeader
        title="Analytics & Reporting"
        description="Executive, operational, financial, and sales reports from reconciled tenant data — invoiced revenue and cash received are reported separately."
      />

      <div className="analytics-page__controls">
        <div className="analytics-page__period">
          {ANALYTICS_PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={period === option.value ? 'primary' : 'secondary'}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <nav className="analytics-page__tabs" aria-label="Analytics sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                activeTab === tab.id
                  ? 'analytics-page__tab analytics-page__tab--active'
                  : 'analytics-page__tab'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {workspaceQuery.data ? (
        <p className="page-muted analytics-report-workspace__range">
          Date range: {new Date(workspaceQuery.data.range.from).toLocaleDateString()} –{' '}
          {new Date(workspaceQuery.data.range.to).toLocaleDateString()} · Last updated{' '}
          {new Date(workspaceQuery.data.generatedAt).toLocaleString()} · Sources:{' '}
          {workspaceQuery.data.dataSources.join(', ')}
        </p>
      ) : null}

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {activeTab !== 'reports' ? (
        <AnalyticsTabPanel
          isLoading={workspaceQuery.isLoading}
          error={workspaceQuery.error}
          hasData={workspaceQuery.data !== undefined}
          loadingLabel="Loading reporting workspace…"
          onRetry={() => void workspaceQuery.refetch()}
        >
          {activeSection ? (
            <>
              <p className="page-muted">{ANALYTICS_REPORTING_SECTIONS.find((s) => s.id === activeTab)?.description}</p>
              <ReportingSectionView
                metrics={activeSection.metrics}
                breakdowns={activeSection.breakdowns}
              />
            </>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'reports' ? (
        <AnalyticsTabPanel
          isLoading={reportsQuery.isLoading}
          error={reportsQuery.error}
          hasData={reportsQuery.data !== undefined}
          loadingLabel="Loading report catalog…"
          onRetry={() => void reportsQuery.refetch()}
        >
          {reportsQuery.data ? (
            <div className="analytics-page__grid">
              <Panel title="Available reports">
                <ul className="analytics-page__report-list">
                  {reportsQuery.data.definitions.map((definition) => (
                    <li key={`${definition.reportType}-${definition.id ?? 'builtin'}`}>
                      <div>
                        <strong>{definition.name}</strong>
                        <p className="page-muted">{definition.description}</p>
                      </div>
                      {canWrite ? (
                        <Button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => void handleGenerateReport(definition.reportType)}
                        >
                          Generate
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Recent report runs">
                {reportsQuery.data.runs.length === 0 ? (
                  <EmptyState
                    title="No reports generated yet"
                    description="Generate a report to create an export-ready snapshot from your live data."
                  />
                ) : (
                  <ul className="analytics-page__run-list">
                    {reportsQuery.data.runs.map((run) => (
                      <li key={run.id}>
                        <strong>
                          {REPORT_TYPE_OPTIONS.find((option) => option.value === run.reportType)
                            ?.label ?? run.reportType}
                        </strong>
                        <span className="analytics-page__run-status">{run.status}</span>
                        <p className="page-muted">{run.summary ?? 'Report run recorded.'}</p>
                        <p className="page-muted">
                          {new Date(run.startedAt).toLocaleString()}
                          {run.completedAt
                            ? ` · completed ${new Date(run.completedAt).toLocaleString()}`
                            : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}
    </div>
  );
}
