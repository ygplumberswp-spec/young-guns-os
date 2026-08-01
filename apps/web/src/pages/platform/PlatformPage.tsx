import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  EnterpriseSaasPlatformDashboard,
  PlatformOwnerAiOperationsDashboard,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  cancelSubscription,
  capturePlatformUsage,
  createFeatureFlag,
  createSubscriptionPlan,
  createTenantBranch,
  fetchAiOperationsDashboard,
  fetchPlatformDashboard,
  markPlatformOwner,
  provisionTenant,
  reactivateTenant,
  suspendTenant,
  updateAiResilienceConfig,
  updateBranding,
  upgradeSubscription,
} from '../../lib/platform-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessPlatform,
  canManagePlatform,
  canManageSaas,
  formatCents,
  formatStatus,
} from '../../features/platform/utils';

type PlatformTab =
  | 'tenants'
  | 'plans'
  | 'billing'
  | 'branding'
  | 'usage'
  | 'feature-flags'
  | 'analytics'
  | 'ai-operations'
  | 'assistant';

export function PlatformPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<PlatformTab>('tenants');
  const [dashboard, setDashboard] = useState<EnterpriseSaasPlatformDashboard | null>(null);
  const [aiOperations, setAiOperations] = useState<PlatformOwnerAiOperationsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiOpsLoading, setIsAiOpsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brandingName, setBrandingName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1a56db');
  const [hardLimitEnabled, setHardLimitEnabled] = useState(false);
  const [hardLimitCents, setHardLimitCents] = useState('');
  const [lowCreditWarningCents, setLowCreditWarningCents] = useState('');
  const [highUsageWarningTokens, setHighUsageWarningTokens] = useState('');

  const {
    agentMessages,
    pendingTasks,
    lastRunTools,
    isSending,
    error: assistantError,
    sendAgentMessage,
    updateTask,
  } = useAuraChat();

  const canView = useMemo(() => (user ? canAccessPlatform(user.permissions) : false), [user]);
  const canPlatformWrite = useMemo(
    () => (user ? canManagePlatform(user.permissions) : false),
    [user],
  );
  const canSaasWrite = useMemo(() => (user ? canManageSaas(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchPlatformDashboard(accessToken);
    setDashboard(data);
    setBrandingName(data.branding?.companyDisplayName ?? '');
    setPrimaryColor(data.branding?.primaryColor ?? '#1a56db');
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
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load platform dashboard',
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
  }, [accessToken, canView]);

  async function loadAiOperations() {
    if (!accessToken) return;
    setIsAiOpsLoading(true);
    try {
      const data = await fetchAiOperationsDashboard(accessToken);
      setAiOperations(data);
      setHardLimitEnabled(data.resilience.config.hardSpendingLimitEnabled);
      setHardLimitCents(
        data.resilience.config.hardSpendingLimitCents != null
          ? String(data.resilience.config.hardSpendingLimitCents)
          : '',
      );
      setLowCreditWarningCents(String(data.resilience.config.lowCreditWarningCents));
      setHighUsageWarningTokens(String(data.resilience.config.highUsageWarningTokens));
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to load AI operations dashboard',
      );
    } finally {
      setIsAiOpsLoading(false);
    }
  }

  useEffect(() => {
    if (
      activeTab === 'ai-operations' &&
      accessToken &&
      canView &&
      !aiOperations &&
      !isAiOpsLoading
    ) {
      void loadAiOperations();
    }
  }, [activeTab, accessToken, canView, aiOperations, isAiOpsLoading]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken) return;
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
          title="Platform"
          description="You do not have permission to view the SaaS platform."
        />
      </div>
    );
  }

  const tabs: Array<{ id: PlatformTab; label: string }> = [
    { id: 'tenants', label: 'Tenants' },
    { id: 'plans', label: 'Plans' },
    { id: 'billing', label: 'Billing' },
    { id: 'branding', label: 'Branding' },
    { id: 'usage', label: 'Usage' },
    { id: 'feature-flags', label: 'Feature Flags' },
    { id: 'analytics', label: 'Platform Analytics' },
    { id: 'ai-operations', label: 'AI Operations' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Platform"
        description="Enterprise white-label SaaS — tenant management, subscriptions, branding, and feature entitlements. No demo tenants."
        actions={
          canPlatformWrite && dashboard && !dashboard.isPlatformOwner ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => markPlatformOwner(accessToken!),
                  'Tenant marked as platform owner.',
                )
              }
            >
              Mark Platform Owner
            </Button>
          ) : canSaasWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => capturePlatformUsage(accessToken!),
                    'Usage snapshot captured.',
                  )
                }
              >
                Capture Usage
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
        <Panel title="Loading">Loading platform dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Platform dashboard is unavailable." />
      ) : (
        <>
          <Panel title="Platform Summary">
            <p>{dashboard.summary}</p>
            {dashboard.isPlatformOwner ? (
              <span className="status-pill status-healthy">
                Platform Owner — subscription enforcement bypassed
              </span>
            ) : dashboard.subscriptionEnforced ? (
              <span className="status-pill">
                Subscription enforced — {dashboard.subscription?.status ?? 'none'}
              </span>
            ) : null}
          </Panel>

          {activeTab === 'tenants' ? (
            <Panel title={dashboard.isPlatformOwner ? 'Customer Tenants' : 'Tenant Profile'}>
              {dashboard.isPlatformOwner && canPlatformWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        provisionTenant(accessToken!, {
                          companyName: `Tenant ${Date.now()}`,
                        }),
                      'Tenant provisioned with default roles and trial subscription.',
                    )
                  }
                >
                  Provision Tenant
                </Button>
              ) : null}

              {dashboard.isPlatformOwner ? (
                dashboard.tenants.length === 0 ? (
                  <EmptyState
                    title="No customer tenants"
                    description="Provision tenants from real company data. No demo tenants are seeded."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.tenants.map((tenant) => (
                      <div key={tenant.companyId} className="data-list-item">
                        <strong>{tenant.companyName}</strong>
                        <span className="status-pill">{formatStatus(tenant.lifecycleStatus)}</span>
                        <span className="status-pill">
                          {tenant.subscriptionStatus ?? 'no subscription'}
                        </span>
                        <p>
                          {tenant.userCount} user(s) · {tenant.branchCount} branch(es)
                          {tenant.planName ? ` · ${tenant.planName}` : ''}
                        </p>
                        {canPlatformWrite ? (
                          <div className="page-header-actions">
                            {tenant.lifecycleStatus === 'active' ? (
                              <Button
                                variant="secondary"
                                disabled={isWorking}
                                onClick={() =>
                                  void runAction(
                                    () => suspendTenant(accessToken!, tenant.companyId),
                                    'Tenant suspended.',
                                  )
                                }
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                disabled={isWorking}
                                onClick={() =>
                                  void runAction(
                                    () => reactivateTenant(accessToken!, tenant.companyId),
                                    'Tenant reactivated.',
                                  )
                                }
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="stat-grid">
                  <StatCard
                    label="Lifecycle"
                    value={formatStatus(dashboard.tenantProfile?.lifecycleStatus ?? '—')}
                  />
                  <StatCard label="Branches" value={String(dashboard.branches.length)} />
                  <StatCard
                    label="Storage (MB)"
                    value={String(dashboard.tenantProfile?.storageAllocationMb ?? '—')}
                  />
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'plans' ? (
            <Panel title="Subscription Plans">
              {dashboard.isPlatformOwner && canPlatformWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createSubscriptionPlan(accessToken!, {
                          planKey: `plan_${Date.now()}`,
                          name: 'Custom Plan',
                          description: 'Tenant-defined subscription plan',
                          tier: 'professional',
                          priceCents: 9900,
                          features: ['crm', 'jobs', 'finance'],
                          limits: { users: 25, storageMb: 5120 },
                        }),
                      'Subscription plan created.',
                    )
                  }
                >
                  Create Plan
                </Button>
              ) : null}

              {dashboard.plans.length === 0 ? (
                <EmptyState
                  title="No plans"
                  description="Platform owner creates subscription plans for customer tenants."
                />
              ) : (
                <div className="data-list">
                  {dashboard.plans.map((plan) => (
                    <div key={plan.id} className="data-list-item">
                      <strong>{plan.name}</strong>
                      <span className="status-pill">{formatStatus(plan.tier)}</span>
                      <p>{plan.description}</p>
                      <span>
                        {formatCents(plan.priceCents)} / {plan.billingInterval} ·{' '}
                        {plan.features.length} feature(s)
                      </span>
                      {!dashboard.isPlatformOwner && canSaasWrite ? (
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => upgradeSubscription(accessToken!, plan.id),
                              `Upgraded to ${plan.name}.`,
                            )
                          }
                        >
                          Upgrade
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'billing' ? (
            <>
              <Panel title="Subscription">
                {dashboard.subscription ? (
                  <>
                    <p>
                      Status: {formatStatus(dashboard.subscription.status)}
                      {dashboard.subscription.plan ? ` — ${dashboard.subscription.plan.name}` : ''}
                    </p>
                    {dashboard.subscription.trialEndsAt ? (
                      <p>
                        Trial ends:{' '}
                        {new Date(dashboard.subscription.trialEndsAt).toLocaleDateString()}
                      </p>
                    ) : null}
                    {canSaasWrite && !dashboard.isPlatformOwner ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => cancelSubscription(accessToken!),
                            'Subscription cancelled with grace period.',
                          )
                        }
                      >
                        Cancel Subscription
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    title="No subscription"
                    description="Subscription records are created during tenant provisioning."
                  />
                )}
              </Panel>

              <Panel title="Billing History">
                {dashboard.billingRecords.length === 0 ? (
                  <EmptyState
                    title="No billing records"
                    description="Billing framework records invoices, payments, renewals, credits, and taxes."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.billingRecords.map((record) => (
                      <div key={record.id} className="data-list-item">
                        <strong>{record.description}</strong>
                        <span className="status-pill">{formatStatus(record.recordType)}</span>
                        <span className="status-pill">{formatStatus(record.status)}</span>
                        <span>{formatCents(record.amountCents, record.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'branding' ? (
            <Panel title="White-Label Branding">
              {canSaasWrite ? (
                <div className="form-row">
                  <label>
                    Display Name
                    <input
                      className="titan-input"
                      value={brandingName}
                      onChange={(event) => setBrandingName(event.target.value)}
                    />
                  </label>
                  <label>
                    Primary Color
                    <input
                      className="titan-input"
                      type="color"
                      value={primaryColor}
                      onChange={(event) => setPrimaryColor(event.target.value)}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () =>
                          updateBranding(accessToken!, {
                            companyDisplayName: brandingName,
                            primaryColor,
                          }),
                        'Branding profile updated.',
                      )
                    }
                  >
                    Save Branding
                  </Button>
                </div>
              ) : null}

              {dashboard.branding ? (
                <div className="data-list">
                  <div className="data-list-item">
                    <strong>{dashboard.branding.companyDisplayName ?? 'Default'}</strong>
                    <span>Primary: {dashboard.branding.primaryColor ?? '—'}</span>
                    <p>
                      Email, PDF, invoice, portal, login, and mobile branding slots are configured
                      per tenant.
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No branding profile"
                  description="Branding is provisioned automatically for each tenant."
                />
              )}
            </Panel>
          ) : null}

          {activeTab === 'usage' ? (
            <>
              <div className="stat-grid">
                <StatCard label="Users" value={String(dashboard.usage.userCount)} />
                <StatCard label="Integrations" value={String(dashboard.usage.integrationCount)} />
                <StatCard label="API Requests" value={String(dashboard.usage.apiRequestCount)} />
                <StatCard label="AI Usage" value={String(dashboard.usage.aiUsageCount)} />
                <StatCard
                  label="Storage"
                  value={
                    dashboard.usage.storageBytes > 0
                      ? `${Math.round(dashboard.usage.storageBytes / 1024 / 1024)} MB`
                      : '—'
                  }
                />
              </div>

              <Panel title="Feature Entitlements">
                {dashboard.entitlements.length === 0 ? (
                  <EmptyState
                    title="No custom entitlements"
                    description="Entitlements derive from subscription plans and custom overrides."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.entitlements.map((entry) => (
                      <div key={entry.id} className="data-list-item">
                        <strong>{entry.featureKey}</strong>
                        <span className="status-pill">
                          {entry.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {canSaasWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createTenantBranch(accessToken!, {
                          branchKey: `branch_${Date.now()}`,
                          name: 'New Branch',
                        }),
                      'Branch created.',
                    )
                  }
                >
                  Add Branch
                </Button>
              ) : null}
            </>
          ) : null}

          {activeTab === 'feature-flags' ? (
            <Panel title="Feature Flags">
              {dashboard.isPlatformOwner && canPlatformWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createFeatureFlag(accessToken!, {
                          flagKey: `flag_${Date.now()}`,
                          name: 'Custom Flag',
                          description: 'Platform-defined feature flag',
                        }),
                      'Feature flag created.',
                    )
                  }
                >
                  Create Feature Flag
                </Button>
              ) : null}

              {dashboard.featureFlags.length === 0 ? (
                <EmptyState
                  title="No feature flags"
                  description="Platform owner defines feature flags for tenant rollout."
                />
              ) : (
                <div className="data-list">
                  {dashboard.featureFlags.map((flag) => (
                    <div key={flag.id} className="data-list-item">
                      <strong>{flag.name}</strong>
                      <span className="status-pill">{flag.flagKey}</span>
                      <p>{flag.description}</p>
                      <span>
                        Default: {flag.defaultEnabled ? 'on' : 'off'}
                        {flag.tenantEnabled != null
                          ? ` · Tenant override: ${flag.tenantEnabled ? 'on' : 'off'}`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            dashboard.isPlatformOwner && dashboard.platformAnalytics ? (
              <>
                <div className="stat-grid">
                  <StatCard
                    label="Total Tenants"
                    value={String(dashboard.platformAnalytics.totalTenants)}
                  />
                  <StatCard
                    label="Active Tenants"
                    value={String(dashboard.platformAnalytics.activeTenants)}
                  />
                  <StatCard
                    label="Suspended"
                    value={String(dashboard.platformAnalytics.suspendedTenants)}
                  />
                  <StatCard
                    label="Trial"
                    value={String(dashboard.platformAnalytics.trialTenants)}
                  />
                  <StatCard
                    label="Active Subscriptions"
                    value={String(dashboard.platformAnalytics.activeSubscriptions)}
                  />
                  <StatCard
                    label="Cancelled"
                    value={String(dashboard.platformAnalytics.cancelledSubscriptions)}
                  />
                </div>

                <Panel title="Platform Audits">
                  {dashboard.recentAudits.length === 0 ? (
                    <EmptyState
                      title="No audit events"
                      description="Platform actions are recorded in the audit log."
                    />
                  ) : (
                    <div className="data-list">
                      {dashboard.recentAudits.map((audit) => (
                        <div key={audit.id} className="data-list-item">
                          <strong>{audit.subject}</strong>
                          <span className="status-pill">{audit.actionType}</span>
                          <p>{audit.details ?? 'No details'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </>
            ) : (
              <EmptyState
                title="Platform analytics unavailable"
                description="Platform analytics are visible to the platform owner tenant only."
              />
            )
          ) : null}

          {activeTab === 'ai-operations' ? (
            isAiOpsLoading ? (
              <Panel title="Loading">Loading AI operations…</Panel>
            ) : !aiOperations ? (
              <EmptyState title="No data" description="AI operations dashboard is unavailable." />
            ) : (
              <>
                <Panel title="AI Allowance">
                  <p>{aiOperations.summary}</p>
                  <div className="stat-grid">
                    <StatCard
                      label="TITAN Limits"
                      value={aiOperations.allowance.titanLimitsEnforced ? 'Enforced' : 'Bypassed'}
                    />
                    <StatCard
                      label="Monthly Tokens"
                      value={
                        aiOperations.allowance.monthlyTokenLimit != null
                          ? `${aiOperations.allowance.monthlyTokensUsed.toLocaleString()} / ${aiOperations.allowance.monthlyTokenLimit.toLocaleString()}`
                          : aiOperations.allowance.monthlyTokensUsed.toLocaleString()
                      }
                    />
                    <StatCard
                      label="Estimated Cost"
                      value={formatCents(aiOperations.allowance.monthlyCostCents)}
                    />
                    <StatCard
                      label="Access"
                      value={aiOperations.allowance.allowed ? 'Allowed' : 'Blocked'}
                    />
                  </div>
                  {aiOperations.isPlatformOwner ? (
                    <span className="status-pill status-healthy">
                      Platform Owner — unlimited AURA access (RBAC still applies)
                    </span>
                  ) : null}
                </Panel>

                <Panel title="Provider Health & Resilience">
                  <div className="stat-grid">
                    <StatCard
                      label="Configured Providers"
                      value={String(aiOperations.resilience.providers.length)}
                    />
                    <StatCard
                      label="Queued Requests"
                      value={String(aiOperations.resilience.pendingQueueCount)}
                    />
                    <StatCard
                      label="Recent Failovers"
                      value={String(aiOperations.resilience.recentFailoverCount)}
                    />
                    <StatCard
                      label="Task Routing"
                      value={
                        aiOperations.resilience.config.taskRoutingEnabled ? 'Enabled' : 'Disabled'
                      }
                    />
                  </div>

                  {aiOperations.resilience.providers.length === 0 ? (
                    <EmptyState
                      title="No configured providers"
                      description="Configure AI providers in AI Orchestration. Environment OpenAI is used when configured."
                    />
                  ) : (
                    <div className="data-list">
                      {aiOperations.resilience.providers.map((provider) => (
                        <div
                          key={`${provider.providerKey}-${provider.providerId ?? 'env'}`}
                          className="data-list-item"
                        >
                          <strong>{provider.displayName}</strong>
                          <span className="status-pill">{provider.healthStatus}</span>
                          <span className="status-pill">
                            {provider.isEnabled ? 'enabled' : 'disabled'}
                          </span>
                          {provider.averageLatencyMs != null ? (
                            <p>Average latency: {provider.averageLatencyMs} ms</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                {aiOperations.alertCandidates.length > 0 ? (
                  <Panel title="Mission Control Alerts">
                    <div className="data-list">
                      {aiOperations.alertCandidates.map((alert) => (
                        <div key={alert.sourceEntityId} className="data-list-item">
                          <strong>{alert.title}</strong>
                          <span className="status-pill">{alert.severity}</span>
                          <p>{alert.description}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                {canPlatformWrite && aiOperations.isPlatformOwner ? (
                  <Panel title="Resilience & Spending Controls">
                    <p>
                      Warnings appear in Mission Control when thresholds are reached. Platform Owner
                      AI is never blocked unless a hard spending limit is explicitly enabled below.
                    </p>
                    <label className="form-field">
                      <span>Low credit warning (cents)</span>
                      <input
                        type="number"
                        min={0}
                        value={lowCreditWarningCents}
                        onChange={(event) => setLowCreditWarningCents(event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span>High usage warning (tokens)</span>
                      <input
                        type="number"
                        min={0}
                        value={highUsageWarningTokens}
                        onChange={(event) => setHighUsageWarningTokens(event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <input
                        type="checkbox"
                        checked={hardLimitEnabled}
                        onChange={(event) => setHardLimitEnabled(event.target.checked)}
                      />
                      <span>Enable hard spending limit (Platform Owner only)</span>
                    </label>
                    {hardLimitEnabled ? (
                      <label className="form-field">
                        <span>Hard spending limit (cents)</span>
                        <input
                          type="number"
                          min={0}
                          value={hardLimitCents}
                          onChange={(event) => setHardLimitCents(event.target.value)}
                        />
                      </label>
                    ) : null}
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          const config = await updateAiResilienceConfig(accessToken!, {
                            lowCreditWarningCents: Number(lowCreditWarningCents) || 0,
                            highUsageWarningTokens: Number(highUsageWarningTokens) || 0,
                            hardSpendingLimitEnabled: hardLimitEnabled,
                            hardSpendingLimitCents:
                              hardLimitEnabled && hardLimitCents ? Number(hardLimitCents) : null,
                          });
                          setAiOperations((current) =>
                            current
                              ? {
                                  ...current,
                                  allowance: {
                                    ...current.allowance,
                                    hardSpendingLimitEnabled: config.hardSpendingLimitEnabled,
                                    hardSpendingLimitCents: config.hardSpendingLimitCents,
                                  },
                                  resilience: { ...current.resilience, config },
                                }
                              : current,
                          );
                        }, 'AI resilience settings updated.')
                      }
                    >
                      Save Resilience Settings
                    </Button>
                  </Panel>
                ) : null}
              </>
            )
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA SaaS Agent">
              <p>
                Ask about plans, tenant usage, upgrade recommendations, onboarding guides, and
                feature availability. Recommendations only — subscriptions and tenants require
                approval.
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
                onSend={(content) => void sendAgentMessage(content, 'saas')}
                placeholder="Ask about plans, usage, upgrades, or feature entitlements…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
