import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseReleaseManagementDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchReleaseManagementAuditLogs,
  fetchReleaseManagementDashboard,
  finalizeVersion,
  refreshDocumentationStatus,
  runAppStoreReadinessReviews,
  runBrandingReview,
  runMobilePackagingReview,
  runUxReview,
  syncReleaseManagementAlerts,
} from '../../lib/enterprise-release-management-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessReleaseManagement,
  canAdministerReleaseManagement,
  canManageReleaseManagement,
  formatChecklistStatus,
  formatReleaseStatus,
  formatStorePlatform,
  formatValidationStatus,
} from '../../features/release/utils';

type ReleaseTab =
  | 'overview'
  | 'mobile'
  | 'app-stores'
  | 'branding'
  | 'ux-review'
  | 'documentation'
  | 'version'
  | 'launch-checklist'
  | 'audit'
  | 'assistant';

export function ReleasePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReleaseTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseReleaseManagementDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<
    Awaited<ReturnType<typeof fetchReleaseManagementAuditLogs>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    isSending,
    pendingTasks,
    sendAgentMessage,
    updateTask,
    error: assistantError,
  } = useAuraChat();

  const canView = useMemo(
    () => (user ? canAccessReleaseManagement(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageReleaseManagement(user.permissions) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canAdministerReleaseManagement(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: ReleaseTab; label: string }> = [
    { id: 'overview', label: 'Release Overview' },
    { id: 'mobile', label: 'Mobile' },
    { id: 'app-stores', label: 'App Stores' },
    { id: 'branding', label: 'Branding' },
    { id: 'ux-review', label: 'UX Review' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'version', label: 'Version' },
    { id: 'launch-checklist', label: 'Launch Checklist' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchReleaseManagementDashboard(accessToken));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await loadDashboard();
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load release dashboard',
          );
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView || isLoading || activeTab !== 'audit') return;
    let cancelled = false;
    async function loadTabData() {
      setIsSupplementaryLoading(true);
      try {
        const logs = await fetchReleaseManagementAuditLogs(accessToken!);
        if (!cancelled) setAuditLogs(logs);
      } catch {
        if (!cancelled) setAuditLogs([]);
      } finally {
        if (!cancelled) setIsSupplementaryLoading(false);
      }
    }
    void loadTabData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab, isLoading]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="p-6">
        <EmptyState
          title="Access Denied"
          description="You do not have permission to view the release dashboard."
        />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="p-6">
        <PageHeader
          title="TITAN V1.0 Release"
          description="Loading release management dashboard..."
        />
      </div>
    );
  }

  const readiness = dashboard.releaseReadiness;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="TITAN V1.0 Release"
        description="Mobile production packaging, app store readiness, branding verification, documentation, and final launch checklist."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncReleaseManagementAlerts(accessToken!), 'Alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              {canManage ? (
                <Button
                  variant="primary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => finalizeVersion(accessToken!), 'Version v1.0.0 finalized.')
                  }
                >
                  Finalize v1.0.0
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Release Status" value={formatReleaseStatus(readiness.releaseStatus)} />
            <StatCard label="Documentation" value={`${readiness.documentationCompleteness}%`} />
            <StatCard label="Pending Checklist" value={String(readiness.pendingChecklistCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
          </div>
          <Panel title="Release Readiness">
            <div className="grid gap-2 md:grid-cols-2">
              <p>Mobile ready: {readiness.mobileReady ? 'Yes' : 'No'}</p>
              <p>App store ready: {readiness.appStoreReady ? 'Yes' : 'No'}</p>
              <p>Branding ready: {readiness.brandingReady ? 'Yes' : 'No'}</p>
              <p>Documentation complete: {readiness.documentationComplete ? 'Yes' : 'No'}</p>
              <p>Launch checklist complete: {readiness.launchChecklistComplete ? 'Yes' : 'No'}</p>
              <p>Version finalized: {readiness.versionFinalized ? 'Yes' : 'No'}</p>
            </div>
            {dashboard.productionLaunchSummary ? (
              <p className="mt-4 text-sm text-slate-600">
                Production launch status:{' '}
                {formatReleaseStatus(String(dashboard.productionLaunchSummary.launchStatus))}
              </p>
            ) : null}
          </Panel>
          {readiness.releaseStatus === 'blocked' || readiness.releaseStatus === 'not_ready' ? (
            <p className="text-sm text-red-700">
              Release is not ready — complete mobile packaging, app store checklists, and production
              launch prerequisites.
            </p>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'mobile' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => runMobilePackagingReview(accessToken!),
                  'Mobile packaging review completed.',
                )
              }
            >
              Run Mobile Packaging Review
            </Button>
          ) : null}
          {dashboard.latestMobileReview ? (
            <Panel
              title={`Mobile Review — ${formatValidationStatus(dashboard.latestMobileReview.status)}`}
            >
              <p className="mb-2 text-sm text-slate-600">
                iOS ready: {dashboard.latestMobileReview.iosReady ? 'Yes' : 'No'} · Android ready:{' '}
                {dashboard.latestMobileReview.androidReady ? 'Yes' : 'No'} ·{' '}
                {dashboard.latestMobileReview.warningCount} warning(s)
              </p>
              <ul className="space-y-2">
                {dashboard.latestMobileReview.findings.map((finding, index) => (
                  <li
                    key={String(finding.key ?? index)}
                    className="rounded border border-slate-200 p-3 text-sm"
                  >
                    <span className="font-medium">{String(finding.key)}</span>:{' '}
                    {String(finding.message)}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyState
              title="No Mobile Review"
              description="Run a mobile packaging review to verify iOS/Android production builds."
            />
          )}
        </div>
      ) : null}

      {activeTab === 'app-stores' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => runAppStoreReadinessReviews(accessToken!),
                  'App store readiness checklists generated.',
                )
              }
            >
              Generate Store Readiness Checklists
            </Button>
          ) : null}
          {dashboard.appStoreReadiness.length > 0 ? (
            dashboard.appStoreReadiness.map((store) => (
              <Panel key={store.id} title={formatStorePlatform(store.storePlatform)}>
                <p className="mb-2 text-sm text-slate-600">
                  Status: {formatValidationStatus(store.status)} · Checklist:{' '}
                  {store.checklistCompleteCount}/{store.checklistTotalCount}
                </p>
                {Array.isArray((store.storeListing as { checklist?: unknown[] }).checklist) ? (
                  <ul className="space-y-1 text-sm">
                    {(
                      store.storeListing as { checklist: Array<{ label: string; status: string }> }
                    ).checklist.map((item) => (
                      <li key={item.label}>
                        {item.label} — {item.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            ))
          ) : (
            <EmptyState
              title="No App Store Readiness"
              description="Generate Apple App Store and Google Play Store readiness checklists."
            />
          )}
        </div>
      ) : null}

      {activeTab === 'branding' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(() => runBrandingReview(accessToken!), 'Branding review completed.')
              }
            >
              Run Branding Review
            </Button>
          ) : null}
          {dashboard.latestBrandingReview ? (
            <Panel
              title={`Branding — ${formatValidationStatus(dashboard.latestBrandingReview.status)}`}
            >
              <ul className="space-y-2">
                {dashboard.latestBrandingReview.findings.map((finding, index) => (
                  <li
                    key={String(finding.key ?? index)}
                    className="rounded border border-slate-200 p-3 text-sm"
                  >
                    {String(finding.message)}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyState
              title="No Branding Review"
              description="Verify logo, icons, splash screen, colors, and white-label branding."
            />
          )}
        </div>
      ) : null}

      {activeTab === 'ux-review' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => runUxReview(accessToken!),
                  'UX review recommendations generated.',
                )
              }
            >
              Run UX Review
            </Button>
          ) : null}
          {dashboard.latestUxReview ? (
            <Panel title="UX Improvement Recommendations">
              <ul className="space-y-2">
                {dashboard.latestUxReview.findings.map((finding, index) => (
                  <li
                    key={String(finding.key ?? index)}
                    className="rounded border border-slate-200 p-3 text-sm"
                  >
                    <span className="font-medium">{String(finding.category)}</span>:{' '}
                    {String(finding.recommendation)}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyState
              title="No UX Review"
              description="Generate UX improvement recommendations for navigation, accessibility, and responsive layouts."
            />
          )}
        </div>
      ) : null}

      {activeTab === 'documentation' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => refreshDocumentationStatus(accessToken!),
                  'Documentation status refreshed.',
                )
              }
            >
              Refresh Documentation Status
            </Button>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.documentationArtifacts.map((doc) => (
              <Panel key={doc.id} title={doc.title}>
                <p className="text-sm text-slate-600">
                  {formatValidationStatus(doc.status)} · {doc.completenessPercent}% complete
                </p>
              </Panel>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'version' && dashboard.versionRecord ? (
        <div className="space-y-4">
          <Panel title={dashboard.versionRecord.versionName}>
            <p className="mb-2">Status: {formatReleaseStatus(dashboard.versionRecord.status)}</p>
            <p className="mb-4 text-sm text-slate-600">
              {String((dashboard.versionRecord.releaseNotes as { summary?: string }).summary ?? '')}
            </p>
            <h4 className="font-medium">Feature Summary</h4>
            <ul className="mb-4 list-disc pl-5 text-sm">
              {dashboard.versionRecord.featureSummary.map((item, i) => (
                <li key={i}>
                  {String(item.module)}: {String(item.description)}
                </li>
              ))}
            </ul>
            <h4 className="font-medium">Known Limitations</h4>
            <ul className="list-disc pl-5 text-sm">
              {dashboard.versionRecord.knownLimitations.map((item, i) => (
                <li key={i}>
                  {String(item.area)}: {String(item.description)}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {activeTab === 'launch-checklist' ? (
        <Panel title="Final Launch Checklist">
          <ul className="space-y-2">
            {dashboard.launchChecklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm"
              >
                <span>{item.itemName}</span>
                <span className="text-slate-500">
                  {formatChecklistStatus(item.status)} · {item.category}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'audit' ? (
        isSupplementaryLoading ? (
          <p>Loading audit logs...</p>
        ) : auditLogs.length > 0 ? (
          <Panel title="Audit Log">
            <ul className="space-y-2">
              {auditLogs.map((log) => (
                <li key={log.id} className="rounded border border-slate-200 p-3 text-sm">
                  <span className="font-medium">{log.actionType}</span>
                  {log.entityType ? ` · ${log.entityType}` : ''} ·{' '}
                  {new Date(log.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <EmptyState
            title="No Audit Logs"
            description="Release management actions will appear here."
          />
        )
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Release Manager Agent">
          <p className="mb-4 text-sm text-slate-600">
            Ask about release readiness, mobile packaging, app store checklists, documentation, or
            request draft release notes and guides.
          </p>
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard
              key={task.id}
              task={task}
              accessToken={accessToken ?? ''}
              onUpdated={updateTask}
            />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) =>
              void sendAgentMessage(content, 'release_manager' as import('@titan/shared').AgentKey)
            }
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
