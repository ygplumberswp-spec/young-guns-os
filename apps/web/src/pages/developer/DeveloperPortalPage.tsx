import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  DeveloperOauthApplicationSummary,
  EnterprisePublicDeveloperDashboard,
  PdpApiScopeSummary,
  PdpAuditLogSummary,
  PdpRateLimitPolicySummary,
  PdpSandboxConfigSummary,
  PdpWebhookEventTypeSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  capturePublicApiStatus,
  capturePublicDeveloperAnalytics,
  fetchPublicApiKeys,
  fetchPublicApiScopes,
  fetchPublicDeveloperAuditLogs,
  fetchPublicDeveloperDashboard,
  fetchPublicOauthApplications,
  fetchPublicRateLimitPolicies,
  fetchPublicSandboxConfig,
  fetchPublicWebhookDeliveries,
  fetchPublicWebhookEventTypes,
  generatePublicOpenApiSpec,
  generatePublicSdk,
  syncDeveloperAlerts,
  updatePublicSandboxConfig,
} from '../../lib/enterprise-public-developer-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessPublicDeveloper,
  canManagePublicDeveloper,
  formatSeverity,
  formatStatus,
} from '../../features/developer/utils';

type DeveloperPortalTab =
  | 'overview'
  | 'explorer'
  | 'documentation'
  | 'api-keys'
  | 'oauth-apps'
  | 'webhooks'
  | 'sdks'
  | 'usage'
  | 'logs'
  | 'rate-limits'
  | 'settings'
  | 'assistant';

export function DeveloperPortalPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DeveloperPortalTab>('overview');
  const [dashboard, setDashboard] = useState<EnterprisePublicDeveloperDashboard | null>(null);
  const [apiScopes, setApiScopes] = useState<PdpApiScopeSummary[]>([]);
  const [webhookEventTypes, setWebhookEventTypes] = useState<PdpWebhookEventTypeSummary[]>([]);
  const [apiKeys, setApiKeys] = useState<
    Array<{ id: string; name: string; keyPrefix: string; status: string }>
  >([]);
  const [oauthApps, setOauthApps] = useState<DeveloperOauthApplicationSummary[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<
    Awaited<ReturnType<typeof fetchPublicWebhookDeliveries>>
  >([]);
  const [rateLimitPolicies, setRateLimitPolicies] = useState<PdpRateLimitPolicySummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<PdpAuditLogSummary[]>([]);
  const [sandboxConfig, setSandboxConfig] = useState<PdpSandboxConfigSummary | null>(null);
  const [selectedSdkLanguage, setSelectedSdkLanguage] = useState<
    'typescript' | 'javascript' | 'python'
  >('typescript');
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
    () => (user ? canAccessPublicDeveloper(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManagePublicDeveloper(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: DeveloperPortalTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'explorer', label: 'API Explorer' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'api-keys', label: 'API Keys' },
    { id: 'oauth-apps', label: 'OAuth Apps' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'sdks', label: 'SDKs' },
    { id: 'usage', label: 'Usage' },
    { id: 'logs', label: 'Logs' },
    { id: 'rate-limits', label: 'Rate Limits' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchPublicDeveloperDashboard(accessToken);
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
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load developer portal');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    let cancelled = false;
    async function loadTabData() {
      if (!accessToken || !canView || isLoading) return;
      setIsSupplementaryLoading(true);
      try {
        switch (activeTab) {
          case 'documentation':
            await generatePublicOpenApiSpec(accessToken).catch(() => null);
            await loadDashboard();
            break;
          case 'api-keys':
            setApiKeys(await fetchPublicApiKeys(accessToken));
            break;
          case 'oauth-apps':
            setOauthApps(await fetchPublicOauthApplications(accessToken));
            break;
          case 'webhooks':
            setWebhookDeliveries(await fetchPublicWebhookDeliveries(accessToken));
            setWebhookEventTypes(await fetchPublicWebhookEventTypes(accessToken));
            break;
          case 'rate-limits':
            setRateLimitPolicies(await fetchPublicRateLimitPolicies(accessToken));
            break;
          case 'logs':
            setAuditLogs(await fetchPublicDeveloperAuditLogs(accessToken));
            break;
          case 'settings':
            setSandboxConfig(await fetchPublicSandboxConfig(accessToken));
            setApiScopes(await fetchPublicApiScopes(accessToken));
            break;
          case 'explorer':
            setApiScopes(await fetchPublicApiScopes(accessToken));
            break;
          default:
            break;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load tab data');
        }
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
      <div className="automation-page">
        <PageHeader
          title="Developer Portal"
          description="You do not have permission to view the public developer platform."
        />
      </div>
    );
  }

  const legacy = dashboard?.legacyDeveloperPlatform;

  return (
    <div className="automation-page">
      <PageHeader
        title="Developer Portal"
        description="Public API, webhooks, SDKs, and integration platform — built on the existing TITAN developer ecosystem. No fake APIs or demo traffic."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => syncDeveloperAlerts(accessToken!),
                    'Developer alerts synced.',
                  )
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => capturePublicDeveloperAnalytics(accessToken!),
                    'Usage analytics captured from real tenant data.',
                  )
                }
              >
                Capture Usage
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => capturePublicApiStatus(accessToken!),
                    'API status snapshot captured.',
                  )
                }
              >
                Capture API Status
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
        <Panel title="Loading">Loading developer portal…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Developer portal dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="API Health"
                  value={formatStatus(dashboard.overallApiHealthStatus)}
                />
                <StatCard label="API Versions" value={String(dashboard.apiVersionCount)} />
                <StatCard label="API Scopes" value={String(dashboard.apiScopeCount)} />
                <StatCard label="Webhook Events" value={String(dashboard.webhookEventTypeCount)} />
                <StatCard
                  label="API Keys"
                  value={String(dashboard.developerMonitoring.apiKeyCount)}
                />
                <StatCard
                  label="Webhook Subscriptions"
                  value={String(dashboard.developerMonitoring.webhookSubscriptionCount)}
                />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
                <StatCard
                  label="Sandbox"
                  value={dashboard.developerMonitoring.sandboxEnabled ? 'Enabled' : 'Disabled'}
                />
              </div>
              <Panel title="Platform Summary">
                <p>{dashboard.summary}</p>
                {dashboard.developerMonitoring.alerts.length > 0 ? (
                  <ul>
                    {dashboard.developerMonitoring.alerts.map((alert) => (
                      <li key={alert}>{alert}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No active monitoring alerts.</p>
                )}
              </Panel>
              {dashboard.recentAlerts.length > 0 ? (
                <Panel title="Recent Alerts">
                  <div className="data-list">
                    {dashboard.recentAlerts.map((alert) => (
                      <div key={alert.id} className="data-list-item">
                        <strong>{alert.title}</strong>
                        <span className="status-pill">{formatSeverity(alert.severity)}</span>
                        <span className="status-pill">{formatStatus(alert.status)}</span>
                        <p>{alert.description}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'explorer' ? (
            <>
              <div className="stat-grid">
                <StatCard label="Endpoints" value={String(dashboard.apiExplorerEndpoints.length)} />
                <StatCard
                  label="API Status"
                  value={formatStatus(legacy?.apiHealth.status ?? dashboard.overallApiHealthStatus)}
                />
                <StatCard
                  label="Scopes Loaded"
                  value={String(apiScopes.length || dashboard.apiScopeCount)}
                />
              </div>
              <Panel title="API Explorer">
                {isSupplementaryLoading ? <p>Loading scopes…</p> : null}
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

          {activeTab === 'documentation' ? (
            <Panel title="OpenAPI Documentation">
              {dashboard.openapiSpec ? (
                <>
                  <p>
                    Version {dashboard.openapiSpec.version} — {dashboard.openapiSpec.title}
                  </p>
                  <p>Generated {new Date(dashboard.openapiSpec.generatedAt).toLocaleString()}</p>
                  <pre className="code-block">
                    <code>{JSON.stringify(dashboard.openapiSpec.spec, null, 2)}</code>
                  </pre>
                </>
              ) : (
                <EmptyState
                  title="No OpenAPI spec"
                  description={
                    canWrite
                      ? 'Generate an OpenAPI specification from the real API surface.'
                      : 'OpenAPI specification has not been generated yet.'
                  }
                  action={
                    canWrite ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => generatePublicOpenApiSpec(accessToken!),
                            'OpenAPI specification generated.',
                          )
                        }
                      >
                        Generate OpenAPI
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Panel>
          ) : null}

          {activeTab === 'api-keys' ? (
            <Panel title="API Keys">
              {isSupplementaryLoading ? <p>Loading API keys…</p> : null}
              {apiKeys.length === 0 ? (
                <EmptyState
                  title="No API keys"
                  description="API keys are managed through the integration API management layer. Create keys from Integrations or the legacy Developers page."
                  action={
                    <Link href="/integrations">
                      <Button variant="secondary">Open Integrations</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="data-list">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="data-list-item">
                      <strong>{key.name}</strong>
                      <span className="status-pill">{formatStatus(key.status)}</span>
                      <span>Prefix: {key.keyPrefix}…</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'oauth-apps' ? (
            <Panel title="OAuth Applications">
              {isSupplementaryLoading ? <p>Loading OAuth apps…</p> : null}
              {oauthApps.length === 0 ? (
                <EmptyState
                  title="No OAuth applications"
                  description="OAuth applications are registered through the enterprise developer platform."
                  action={
                    <Link href="/developers">
                      <Button variant="secondary">Open Developers</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="data-list">
                  {oauthApps.map((app) => (
                    <div key={app.id} className="data-list-item">
                      <strong>{app.name}</strong>
                      <span>Client ID: {app.clientId}</span>
                      <span>Scopes: {app.scopes.join(', ') || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'webhooks' ? (
            <>
              <Panel title="Webhook Subscriptions">
                {dashboard.webhookSubscriptions.length === 0 ? (
                  <EmptyState
                    title="No subscriptions"
                    description="No webhook subscriptions configured yet."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.webhookSubscriptions.map((subscription) => (
                      <div key={subscription.id} className="data-list-item">
                        <strong>{subscription.name}</strong>
                        <span className="status-pill">{formatStatus(subscription.status)}</span>
                        <p>{subscription.targetUrl}</p>
                        <span>Events: {subscription.eventTypes.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Supported Event Types">
                <div className="data-list">
                  {(webhookEventTypes.length > 0 ? webhookEventTypes : []).map((event) => (
                    <div key={event.id} className="data-list-item">
                      <strong>{event.name}</strong>
                      <span className="status-pill">{event.category}</span>
                      <code>{event.eventKey}</code>
                      <p>{event.description}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Delivery History">
                {webhookDeliveries.length === 0 ? (
                  <EmptyState
                    title="No deliveries"
                    description="Webhook delivery history appears when events are dispatched."
                  />
                ) : (
                  <div className="data-list">
                    {webhookDeliveries.map((delivery) => (
                      <div key={delivery.id} className="data-list-item">
                        <strong>{delivery.eventType}</strong>
                        <span className="status-pill">{formatStatus(delivery.status)}</span>
                        <span>Attempts: {delivery.attempts}</span>
                        {delivery.errorMessage ? <p>{delivery.errorMessage}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              {dashboard.webhookDeadLetter.length > 0 ? (
                <Panel title="Dead Letter Queue">
                  <div className="data-list">
                    {dashboard.webhookDeadLetter.map((item) => (
                      <div key={item.id} className="data-list-item">
                        <strong>{item.eventType}</strong>
                        <p>{item.errorMessage ?? item.payloadSummary ?? 'Delivery failed'}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'sdks' ? (
            <Panel title="Official SDKs">
              {canWrite ? (
                <div className="form-row">
                  <label>
                    Language
                    <select
                      className="titan-input"
                      value={selectedSdkLanguage}
                      onChange={(event) =>
                        setSelectedSdkLanguage(
                          event.target.value as 'typescript' | 'javascript' | 'python',
                        )
                      }
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                    </select>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => generatePublicSdk(accessToken!, { language: selectedSdkLanguage }),
                        `${selectedSdkLanguage} SDK generated from OpenAPI.`,
                      )
                    }
                  >
                    Generate SDK
                  </Button>
                </div>
              ) : null}
              {dashboard.sdkPackages.length === 0 && dashboard.recentSdkGenerations.length === 0 ? (
                <EmptyState
                  title="No SDK packages"
                  description="Generate official TypeScript, JavaScript, or Python client libraries from the OpenAPI specification."
                />
              ) : (
                <div className="data-list">
                  {dashboard.sdkPackages.map((pkg) => (
                    <div key={pkg.id} className="data-list-item">
                      <strong>{pkg.packageName}</strong>
                      <span className="status-pill">{pkg.language}</span>
                      <span>v{pkg.version}</span>
                    </div>
                  ))}
                  {dashboard.recentSdkGenerations.map((record) => (
                    <div key={record.id} className="data-list-item">
                      <strong>{record.packageName}</strong>
                      <span className="status-pill">{record.language}</span>
                      <span>Generated {new Date(record.generatedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'usage' ? (
            <Panel title="Usage Analytics">
              {dashboard.analytics ? (
                <pre className="code-block">
                  <code>{JSON.stringify(dashboard.analytics.metrics, null, 2)}</code>
                </pre>
              ) : legacy?.analytics ? (
                <div className="stat-grid">
                  <StatCard label="API Requests" value={String(legacy.analytics.apiRequestCount)} />
                  <StatCard label="API Errors" value={String(legacy.analytics.apiErrorCount)} />
                  <StatCard
                    label="Webhook Deliveries"
                    value={String(legacy.analytics.webhookDeliveryCount)}
                  />
                  <StatCard
                    label="Webhook Failures"
                    value={String(legacy.analytics.webhookFailureCount)}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No usage data"
                  description="Capture a usage analytics snapshot from real API activity."
                  action={
                    canWrite ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => capturePublicDeveloperAnalytics(accessToken!),
                            'Usage analytics captured.',
                          )
                        }
                      >
                        Capture Usage
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Panel>
          ) : null}

          {activeTab === 'logs' ? (
            <Panel title="Audit Logs">
              {isSupplementaryLoading ? <p>Loading audit logs…</p> : null}
              {auditLogs.length === 0 ? (
                <EmptyState
                  title="No audit logs"
                  description="Platform actions are recorded for complete auditability."
                />
              ) : (
                <div className="data-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{log.actionType}</strong>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                      {log.entityType ? <span>{log.entityType}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'rate-limits' ? (
            <Panel title="Rate Limit Policies">
              {isSupplementaryLoading ? <p>Loading rate limits…</p> : null}
              {rateLimitPolicies.length === 0 ? (
                <EmptyState
                  title="No rate limit policies"
                  description="Configure tenant, application, and burst limits for abuse protection."
                />
              ) : (
                <div className="data-list">
                  {rateLimitPolicies.map((policy) => (
                    <div key={policy.id} className="data-list-item">
                      <strong>{policy.name}</strong>
                      <span className="status-pill">{formatStatus(policy.workflowStatus)}</span>
                      <span>Tenant/min: {policy.tenantLimitPerMinute ?? '—'}</span>
                      <span>App/min: {policy.applicationLimitPerMinute ?? '—'}</span>
                      <span>Burst: {policy.burstLimit ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <>
              <Panel title="Sandbox Mode">
                {sandboxConfig ? (
                  <>
                    <p>Sandbox {sandboxConfig.enabled ? 'enabled' : 'disabled'}</p>
                    {sandboxConfig.sandboxBaseUrl ? (
                      <p>Base URL: {sandboxConfig.sandboxBaseUrl}</p>
                    ) : null}
                    {canWrite ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () =>
                              updatePublicSandboxConfig(accessToken!, {
                                enabled: !sandboxConfig.enabled,
                              }),
                            `Sandbox mode ${sandboxConfig.enabled ? 'disabled' : 'enabled'}.`,
                          )
                        }
                      >
                        {sandboxConfig.enabled ? 'Disable Sandbox' : 'Enable Sandbox'}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p>Loading sandbox configuration…</p>
                )}
              </Panel>
              <Panel title="API Scopes Catalog">
                <div className="data-list">
                  {(apiScopes.length > 0 ? apiScopes : []).slice(0, 20).map((scope) => (
                    <div key={scope.id} className="data-list-item">
                      <strong>{scope.name}</strong>
                      <code>{scope.scopeKey}</code>
                      <p>{scope.description}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Developer Platform Agent">
              {assistantError ? <p className="form-error">{assistantError}</p> : null}
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
                  void sendAgentMessage(
                    content,
                    'developer_platform' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about API scopes, webhooks, SDKs, integration issues…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
