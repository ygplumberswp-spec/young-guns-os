import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import { DEVELOPER_SDK_LANGUAGES, type EnterpriseDeveloperPlatformDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureDeveloperAnalytics,
  createDeveloperExtension,
  fetchDeveloperDashboard,
  fetchWebhookDeadLetter,
  generateOpenApiSpec,
  generateSdkPackage,
  installDeveloperExtension,
} from '../../lib/developer-platform-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessDeveloperPlatform,
  canManageDeveloperPlatform,
  formatExtensionType,
  formatStatus,
} from '../../features/developers/utils';

type DeveloperTab =
  | 'explorer'
  | 'sdks'
  | 'extensions'
  | 'marketplace'
  | 'webhooks'
  | 'analytics'
  | 'documentation'
  | 'assistant';

export function DevelopersPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DeveloperTab>('explorer');
  const [dashboard, setDashboard] = useState<EnterpriseDeveloperPlatformDashboard | null>(null);
  const [deadLetter, setDeadLetter] = useState<Awaited<
    ReturnType<typeof fetchWebhookDeadLetter>
  > | null>(null);
  const [selectedSdkLanguage, setSelectedSdkLanguage] =
    useState<(typeof DEVELOPER_SDK_LANGUAGES)[number]>('typescript');
  const [generatedSdkExample, setGeneratedSdkExample] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    pendingTasks,
    lastRunTools,
    isSending,
    error: assistantError,
    sendAgentMessage,
    updateTask,
  } = useAuraChat();

  const canView = useMemo(
    () => (user ? canAccessDeveloperPlatform(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageDeveloperPlatform(user.permissions) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchDeveloperDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadDashboard();
        if (activeTab === 'webhooks') {
          const items = await fetchWebhookDeadLetter(accessToken);
          if (!cancelled) setDeadLetter(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load developer platform',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab]);

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
      <div className="automation-page">
        <PageHeader
          title="Developers"
          description="You do not have permission to view the enterprise developer platform."
        />
      </div>
    );
  }

  const tabs: Array<{ id: DeveloperTab; label: string }> = [
    { id: 'explorer', label: 'API Explorer' },
    { id: 'sdks', label: 'SDKs' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Developers"
        description="Enterprise developer platform — API explorer, SDKs, extensions, webhooks, and analytics. Recommendations only; no demo extensions."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => generateOpenApiSpec(accessToken!),
                    'OpenAPI specification generated.',
                  )
                }
              >
                Generate OpenAPI
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureDeveloperAnalytics(accessToken!),
                    'Analytics snapshot captured from real API usage.',
                  )
                }
              >
                Capture Analytics
              </Button>
            </div>
          ) : undefined
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel title="Loading">Loading developer platform…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Developer platform dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'explorer' ? (
            <>
              <div className="stat-grid">
                <StatCard label="API Status" value={formatStatus(dashboard.apiHealth.status)} />
                <StatCard label="API Version" value={dashboard.apiHealth.apiVersion} />
                <StatCard
                  label="Avg Latency"
                  value={
                    dashboard.apiHealth.avgLatencyMs != null
                      ? `${dashboard.apiHealth.avgLatencyMs} ms`
                      : '—'
                  }
                />
                <StatCard
                  label="Error Rate"
                  value={
                    dashboard.apiHealth.errorRatePercent != null
                      ? `${dashboard.apiHealth.errorRatePercent}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Gateway Traces"
                  value={String(dashboard.apiHealth.gatewayTraceCount)}
                />
                <StatCard label="API Keys" value={String(dashboard.apiKeysCount)} />
              </div>

              <Panel title="API Explorer">
                <p>{dashboard.summary}</p>
                <div className="data-list">
                  {dashboard.apiExplorerEndpoints.map((endpoint) => (
                    <div key={`${endpoint.method}-${endpoint.path}`} className="data-list-item">
                      <strong>
                        {endpoint.method} {endpoint.path}
                      </strong>
                      <span className="status-pill">{endpoint.tag}</span>
                      <p>{endpoint.summary}</p>
                      <span>Required: {endpoint.requiredPermissions.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}

          {activeTab === 'sdks' ? (
            <Panel title="Enterprise SDKs">
              {canWrite ? (
                <div className="form-row">
                  <label>
                    Language
                    <select
                      className="titan-input"
                      value={selectedSdkLanguage}
                      onChange={(event) =>
                        setSelectedSdkLanguage(
                          event.target.value as (typeof DEVELOPER_SDK_LANGUAGES)[number],
                        )
                      }
                    >
                      {DEVELOPER_SDK_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(async () => {
                        const sdk = await generateSdkPackage(accessToken!, {
                          language: selectedSdkLanguage,
                        });
                        setGeneratedSdkExample(sdk.exampleCode);
                      }, `${selectedSdkLanguage} SDK package generated.`)
                    }
                  >
                    Generate SDK
                  </Button>
                </div>
              ) : null}

              {dashboard.sdkPackages.length === 0 ? (
                <EmptyState
                  title="No SDK packages"
                  description="Generate official SDK packages for TypeScript, JavaScript, Node.js, Python, C#, Java, or Go."
                />
              ) : (
                <div className="data-list">
                  {dashboard.sdkPackages.map((pkg) => (
                    <div key={pkg.id} className="data-list-item">
                      <strong>{pkg.packageName}</strong>
                      <span className="status-pill">{pkg.language}</span>
                      <span>v{pkg.version}</span>
                      <span>Generated {new Date(pkg.generatedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {generatedSdkExample ? (
                <pre className="code-block">
                  <code>{generatedSdkExample}</code>
                </pre>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'extensions' ? (
            <Panel title="Installed Extensions">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createDeveloperExtension(accessToken!, {
                          extensionKey: `ext_${Date.now()}`,
                          name: 'Custom Extension',
                          description: 'Tenant-defined extension draft',
                          extensionType: 'integration',
                        }),
                      'Extension draft created.',
                    )
                  }
                >
                  Create Extension Draft
                </Button>
              ) : null}

              {dashboard.installedExtensions.length === 0 ? (
                <EmptyState
                  title="No installed extensions"
                  description="Create and install tenant extensions. No demo extensions are included."
                />
              ) : (
                <div className="data-list">
                  {dashboard.installedExtensions.map((extension) => (
                    <div key={extension.id} className="data-list-item">
                      <strong>{extension.name}</strong>
                      <span className="status-pill">
                        {formatExtensionType(extension.extensionType)}
                      </span>
                      <span className="status-pill">{formatStatus(extension.status)}</span>
                      <p>{extension.description}</p>
                      {canWrite && extension.status !== 'installed' ? (
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => installDeveloperExtension(accessToken!, extension.id),
                              'Extension installed for this tenant.',
                            )
                          }
                        >
                          Install
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'marketplace' ? (
            <Panel title="Extension Marketplace">
              {dashboard.marketplaceListings.length === 0 ? (
                <EmptyState
                  title="No marketplace listings"
                  description="Published extensions appear here after tenant review and approval. No fake listings are seeded."
                />
              ) : (
                <div className="data-list">
                  {dashboard.marketplaceListings.map((listing) => (
                    <div key={listing.id} className="data-list-item">
                      <strong>{listing.name}</strong>
                      <span className="status-pill">{listing.category}</span>
                      <span className="status-pill">{formatStatus(listing.status)}</span>
                      <p>{listing.description}</p>
                      <span>
                        v{listing.version} · {listing.reviewCount} review(s)
                        {listing.averageRating != null ? ` · ${listing.averageRating} avg` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'webhooks' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Subscriptions"
                  value={String(dashboard.webhookSubscriptionCount)}
                />
                <StatCard label="Dead Letter" value={String(dashboard.webhookDeadLetterCount)} />
                <StatCard
                  label="Deliveries"
                  value={String(dashboard.analytics.webhookDeliveryCount)}
                />
                <StatCard
                  label="Failures"
                  value={String(dashboard.analytics.webhookFailureCount)}
                />
              </div>

              <Panel title="Webhook Platform">
                <p>
                  Event subscriptions support retry queues, dead-letter storage, signature
                  validation, and delivery replay through the existing integration hub.
                </p>
                {deadLetter && deadLetter.length > 0 ? (
                  <div className="data-list">
                    {deadLetter.map((entry) => (
                      <div key={entry.id} className="data-list-item">
                        <strong>{entry.eventType}</strong>
                        <span>{entry.attempts} attempt(s)</span>
                        <p>{entry.errorMessage ?? entry.payloadSummary ?? 'Delivery failed'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No dead-letter entries"
                    description="Failed webhook deliveries appear here."
                  />
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'analytics' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="API Requests"
                  value={String(dashboard.analytics.apiRequestCount)}
                />
                <StatCard label="API Errors" value={String(dashboard.analytics.apiErrorCount)} />
                <StatCard
                  label="Avg Latency"
                  value={
                    dashboard.analytics.avgLatencyMs != null
                      ? `${dashboard.analytics.avgLatencyMs} ms`
                      : '—'
                  }
                />
                <StatCard
                  label="Error Rate"
                  value={
                    dashboard.analytics.errorRatePercent != null
                      ? `${dashboard.analytics.errorRatePercent}%`
                      : '—'
                  }
                />
                <StatCard
                  label="SDK Downloads"
                  value={String(dashboard.analytics.sdkDownloadCount)}
                />
                <StatCard
                  label="Extension Usage"
                  value={String(dashboard.analytics.extensionUsageCount)}
                />
              </div>

              <Panel title="Developer Analytics">
                <p>
                  Usage metrics derive from real API gateway traces, webhook deliveries, and SDK
                  generation activity.
                </p>
              </Panel>
            </>
          ) : null}

          {activeTab === 'documentation' ? (
            <>
              <Panel title="Authentication">
                <ul>
                  <li>API keys — manage via Integrations → API Management</li>
                  <li>Personal access tokens — scoped tokens for developer automation</li>
                  <li>OAuth applications — third-party app authorization with redirect URIs</li>
                  <li>Service accounts — machine-to-machine integration credentials</li>
                </ul>
              </Panel>

              <Panel title="Changelog">
                {dashboard.changelog.length === 0 ? (
                  <EmptyState
                    title="No changelog entries"
                    description="Platform changelog is populated on first access."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.changelog.map((entry) => (
                      <div key={entry.id} className="data-list-item">
                        <strong>
                          v{entry.version} — {entry.title}
                        </strong>
                        <span className="status-pill">{entry.changeType}</span>
                        <p>{entry.description}</p>
                        <span>{new Date(entry.releasedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="OpenAPI">
                {dashboard.openapiSpec ? (
                  <p>
                    Latest spec: {dashboard.openapiSpec.title} v{dashboard.openapiSpec.version} —
                    generated {new Date(dashboard.openapiSpec.generatedAt).toLocaleString()}
                  </p>
                ) : (
                  <EmptyState
                    title="No OpenAPI spec"
                    description="Generate an OpenAPI specification from the versioned REST API surface."
                  />
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Developer Agent">
              <p>
                Ask about APIs, SDK examples, integration guides, webhook configuration, extension
                architecture, and developer analytics. Recommendations only — credentials and
                extensions require approval.
              </p>

              {assistantError ? <p className="form-error">{assistantError}</p> : null}
              {lastRunTools.length > 0 ? (
                <p className="form-hint">Tools used: {lastRunTools.join(', ')}</p>
              ) : null}

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
                onSend={(content) => void sendAgentMessage(content, 'developer')}
                placeholder="Ask about APIs, SDKs, webhooks, or extensions…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
