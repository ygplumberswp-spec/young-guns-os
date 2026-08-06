import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, GroupedTabNav, LoadingState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseSaasManagementDashboard, SmOwnerBillingSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  cancelSubscription,
  captureSaasAnalytics,
  downgradeSubscription,
  fetchBillingPolicies,
  fetchOwnerBilling,
  fetchPaymentProviders,
  fetchSaasAuditLogs,
  fetchSaasCoupons,
  fetchSaasLicenses,
  fetchSaasManagementDashboard,
  fetchSaasPartners,
  fetchUsageThresholds,
  syncSaasAlerts,
  upgradeSubscription,
} from '../../lib/enterprise-saas-management-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessSaasManagement,
  canManageSaasManagement,
  formatCurrency,
  formatSeverity,
  formatStatus,
} from '../../features/saas-management/utils';

type SaasManagementTab =
  | 'overview'
  | 'plans'
  | 'subscriptions'
  | 'tenants'
  | 'licenses'
  | 'billing'
  | 'usage'
  | 'add-ons'
  | 'partners'
  | 'notifications'
  | 'audit'
  | 'assistant';

export function SaasManagementPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<SaasManagementTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseSaasManagementDashboard | null>(null);
  const [ownerBilling, setOwnerBilling] = useState<SmOwnerBillingSummary | null>(null);
  const [licenses, setLicenses] = useState<Awaited<ReturnType<typeof fetchSaasLicenses>>>([]);
  const [paymentProviders, setPaymentProviders] = useState<
    Awaited<ReturnType<typeof fetchPaymentProviders>>
  >([]);
  const [billingPolicies, setBillingPolicies] = useState<
    Awaited<ReturnType<typeof fetchBillingPolicies>>
  >([]);
  const [coupons, setCoupons] = useState<Awaited<ReturnType<typeof fetchSaasCoupons>>>([]);
  const [partners, setPartners] = useState<Awaited<ReturnType<typeof fetchSaasPartners>>>([]);
  const [usageThresholds, setUsageThresholds] = useState<
    Awaited<ReturnType<typeof fetchUsageThresholds>>
  >([]);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchSaasAuditLogs>>>([]);
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

  const canView = useMemo(() => (user ? canAccessSaasManagement(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageSaasManagement(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: SaasManagementTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'plans', label: 'Plans' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'tenants', label: 'Tenants' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'billing', label: 'Billing' },
    { id: 'usage', label: 'Usage' },
    { id: 'add-ons', label: 'Add-Ons' },
    { id: 'partners', label: 'Partners' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  const tabGroups = [
    { id: 'overview', label: 'Overview', tabs: [{ id: 'overview', label: 'Overview' }] },
    {
      id: 'subscriptions',
      label: 'Subscriptions',
      tabs: tabs.filter((t) => ['plans', 'subscriptions', 'tenants', 'licenses'].includes(t.id)),
    },
    {
      id: 'billing',
      label: 'Billing',
      tabs: tabs.filter((t) => ['billing', 'usage', 'add-ons'].includes(t.id)),
    },
    {
      id: 'administration',
      label: 'Administration',
      tabs: tabs.filter((t) => ['partners', 'notifications', 'audit', 'assistant'].includes(t.id)),
    },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchSaasManagementDashboard(accessToken);
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
        if (!cancelled)
          setError(err instanceof ApiClientError ? err.message : 'Unable to load SaaS management');
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
          case 'billing':
            setOwnerBilling(await fetchOwnerBilling(accessToken));
            setPaymentProviders(await fetchPaymentProviders(accessToken));
            setBillingPolicies(await fetchBillingPolicies(accessToken));
            setCoupons(await fetchSaasCoupons(accessToken));
            break;
          case 'licenses':
            setLicenses(await fetchSaasLicenses(accessToken));
            break;
          case 'partners':
            setPartners(await fetchSaasPartners(accessToken));
            break;
          case 'usage':
            setUsageThresholds(await fetchUsageThresholds(accessToken));
            break;
          case 'audit':
            setAuditLogs(await fetchSaasAuditLogs(accessToken));
            break;
          default:
            break;
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiClientError ? err.message : 'Unable to load tab data');
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
          title="SaaS Management"
          description="You do not have permission to view SaaS management."
        />
      </div>
    );
  }

  const legacy = dashboard?.legacySaasPlatform;

  return (
    <div className="automation-page">
      <PageHeader
        title="SaaS Management"
        description="Subscription, billing, licensing, and tenant management — built on the existing white-label SaaS platform. No fake billing or demo data."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncSaasAlerts(accessToken!), 'SaaS alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => captureSaasAnalytics(accessToken!), 'Analytics captured.')
                }
              >
                Capture Analytics
              </Button>
              <Link href="/platform">
                <Button variant="secondary">Legacy Platform</Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <GroupedTabNav
        groups={tabGroups}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as SaasManagementTab)}
        ariaLabel="SaaS management sections"
      />

      {isLoading ? (
        <LoadingState label="Loading SaaS Management" />
      ) : !dashboard ? (
        <EmptyState title="No Data" description="SaaS management dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Billing Health"
                  value={formatStatus(dashboard.overallBillingHealthStatus)}
                />
                <StatCard
                  label="Active Subscriptions"
                  value={String(dashboard.activeSubscriptionCount)}
                />
                <StatCard
                  label="Trial Expirations"
                  value={String(dashboard.trialExpirationCount)}
                />
                <StatCard label="Failed Payments" value={String(dashboard.failedPaymentCount)} />
                <StatCard label="Licenses" value={String(dashboard.licenseCount)} />
                <StatCard label="Partners" value={String(dashboard.partnerCount)} />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
                <StatCard
                  label="TITAN Platform Owner"
                  value={dashboard.isPlatformOwner ? 'Yes' : 'No'}
                />
              </div>
              <Panel title="Platform Owner Status">
                <p>
                  {dashboard.isPlatformOwner
                    ? 'This tenant is registered as the TITAN platform owner with full platform visibility.'
                    : `This workspace is a tenant account (${user?.roleName ?? 'member'}). TITAN Platform Owner privileges require the tenant to be marked as platform_owner in SaaS tenant profiles.`}
                </p>
              </Panel>
              <Panel title="Summary">
                <p>{dashboard.summary}</p>
                {dashboard.usageMonitoring.alerts.length > 0 ? (
                  <ul>
                    {dashboard.usageMonitoring.alerts.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            </>
          ) : null}

          {activeTab === 'plans' ? (
            <Panel title="Subscription Plans">
              {dashboard.plans.length === 0 ? (
                <EmptyState
                  title="No Plans"
                  description="Create configurable subscription plans from the platform owner tenant."
                />
              ) : (
                <div className="data-list">
                  {dashboard.plans.map((plan) => (
                    <div key={plan.id} className="data-list-item">
                      <strong>{plan.name}</strong>
                      <span className="status-pill">{formatStatus(plan.tier)}</span>
                      <span>
                        {formatCurrency(plan.priceCents)} / {plan.billingInterval}
                      </span>
                      <p>{plan.description}</p>
                      <span>Features: {plan.features.join(', ') || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'subscriptions' ? (
            <Panel title="Subscriptions">
              {legacy?.subscription ? (
                <div className="data-list">
                  <div className="data-list-item">
                    <strong>{legacy.subscription.plan?.name ?? 'No plan'}</strong>
                    <span className="status-pill">{formatStatus(legacy.subscription.status)}</span>
                    {legacy.subscription.trialEndsAt ? (
                      <span>
                        Trial ends {new Date(legacy.subscription.trialEndsAt).toLocaleDateString()}
                      </span>
                    ) : null}
                    {canWrite && legacy.subscription.plan ? (
                      <div className="page-header-actions">
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () =>
                                upgradeSubscription(accessToken!, legacy.subscription!.plan!.id),
                              'Upgrade requested.',
                            )
                          }
                        >
                          Upgrade
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () =>
                                downgradeSubscription(accessToken!, legacy.subscription!.plan!.id),
                              'Downgrade requested.',
                            )
                          }
                        >
                          Downgrade
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => cancelSubscription(accessToken!),
                              'Cancellation requested.',
                            )
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No Subscription"
                  description="No active subscription on record."
                />
              )}
            </Panel>
          ) : null}

          {activeTab === 'tenants' ? (
            <Panel title="Tenants">
              {dashboard.tenants.length === 0 ? (
                <EmptyState
                  title="No Tenants"
                  description={
                    dashboard.isPlatformOwner
                      ? 'Provision tenants from the platform API.'
                      : 'Tenant list is available to platform owners only.'
                  }
                />
              ) : (
                <div className="data-list">
                  {dashboard.tenants.map((tenant) => (
                    <div key={tenant.companyId} className="data-list-item">
                      <strong>{tenant.companyName}</strong>
                      <span className="status-pill">{formatStatus(tenant.lifecycleStatus)}</span>
                      <span>{tenant.planName ?? 'No plan'}</span>
                      <span>{tenant.userCount} user(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'licenses' ? (
            <Panel title="Licenses">
              {isSupplementaryLoading ? <p>Loading licenses…</p> : null}
              {licenses.length === 0 ? (
                <EmptyState
                  title="No Licenses"
                  description="License records appear when licenses are created for tenants."
                />
              ) : (
                <div className="data-list">
                  {licenses.map((license) => (
                    <div key={license.id} className="data-list-item">
                      <strong>{license.licenseKey}</strong>
                      <span className="status-pill">{formatStatus(license.status)}</span>
                      <span>
                        {license.seatsUsed}
                        {license.seatLimit ? ` / ${license.seatLimit}` : ''} seats
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'billing' ? (
            <>
              <Panel title="Owner Billing">
                {ownerBilling?.subscription ? (
                  <p>
                    Current plan: {ownerBilling.subscription.plan?.name ?? 'None'} (
                    {formatStatus(ownerBilling.subscription.status)})
                  </p>
                ) : (
                  <p>No subscription on record.</p>
                )}
              </Panel>
              <Panel title="Billing Records">
                {(ownerBilling?.billingRecords ?? dashboard.billingRecords).length === 0 ? (
                  <EmptyState
                    title="No Billing Records"
                    description="Billing records are created through the existing SaaS billing abstraction."
                  />
                ) : (
                  <div className="data-list">
                    {(ownerBilling?.billingRecords ?? dashboard.billingRecords).map((record) => (
                      <div key={record.id} className="data-list-item">
                        <strong>{record.description}</strong>
                        <span className="status-pill">{formatStatus(record.status)}</span>
                        <span>{formatCurrency(record.amountCents, record.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Payment Providers">
                {paymentProviders.length === 0 ? (
                  <EmptyState
                    title="No Payment Providers"
                    description="Configure payment providers through the billing abstraction. No provider is hardcoded."
                  />
                ) : (
                  <div className="data-list">
                    {paymentProviders.map((p) => (
                      <div key={p.id} className="data-list-item">
                        <strong>{p.name}</strong>
                        <span className="status-pill">{p.enabled ? 'Enabled' : 'Disabled'}</span>
                        <span>{p.providerKey}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Billing Policies">
                {billingPolicies.length === 0 ? (
                  <EmptyState
                    title="No Billing Policies"
                    description="Configure retry, proration, tax, and currency policies."
                  />
                ) : (
                  <div className="data-list">
                    {billingPolicies.map((p) => (
                      <div key={p.id} className="data-list-item">
                        <strong>{p.name}</strong>
                        <span className="status-pill">{formatStatus(p.workflowStatus)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Coupons">
                {coupons.length === 0 ? (
                  <EmptyState
                    title="No Coupons"
                    description="Promotional codes and coupons can be configured by platform owners."
                  />
                ) : (
                  <div className="data-list">
                    {coupons.map((c) => (
                      <div key={c.id} className="data-list-item">
                        <strong>{c.name}</strong>
                        <code>{c.couponCode}</code>
                        <span>
                          {c.discountType}: {c.discountValue}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'usage' ? (
            <Panel title="Usage Monitoring">
              <div className="stat-grid">
                <StatCard label="Users" value={String(dashboard.usageMonitoring.userCount)} />
                <StatCard
                  label="API Calls"
                  value={String(dashboard.usageMonitoring.apiRequestCount)}
                />
                <StatCard
                  label="AI Requests"
                  value={String(dashboard.usageMonitoring.aiUsageCount)}
                />
                <StatCard
                  label="Automations"
                  value={String(dashboard.usageMonitoring.automationCount)}
                />
                <StatCard
                  label="Documents"
                  value={String(dashboard.usageMonitoring.documentCount)}
                />
                <StatCard
                  label="Integrations"
                  value={String(dashboard.usageMonitoring.integrationCount)}
                />
                <StatCard
                  label="Industry Packs"
                  value={String(dashboard.usageMonitoring.industryPackCount)}
                />
              </div>
              {usageThresholds.length > 0 ? (
                <div className="data-list">
                  {usageThresholds.map((t) => (
                    <div key={t.id} className="data-list-item">
                      <strong>{t.metricKey}</strong>
                      <span>
                        Warning {t.warningPercent}% / Critical {t.criticalPercent}%
                      </span>
                      {t.limitValue ? <span>Limit: {t.limitValue}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'add-ons' ? (
            <Panel title="Add-Ons">
              {dashboard.addOns.length === 0 ? (
                <EmptyState
                  title="No Add-Ons"
                  description="Configure add-on catalog entries for tenant purchases."
                />
              ) : (
                <div className="data-list">
                  {dashboard.addOns.map((addOn) => (
                    <div key={addOn.id} className="data-list-item">
                      <strong>{addOn.name}</strong>
                      <span>
                        {formatCurrency(addOn.priceCents, addOn.currency)} / {addOn.billingInterval}
                      </span>
                      <p>{addOn.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'partners' ? (
            <Panel title="Partners & Resellers">
              {isSupplementaryLoading ? <p>Loading partners…</p> : null}
              {partners.length === 0 ? (
                <EmptyState
                  title="No Partners"
                  description="Register reseller and white-label partner accounts."
                />
              ) : (
                <div className="data-list">
                  {partners.map((partner) => (
                    <div key={partner.id} className="data-list-item">
                      <strong>{partner.name}</strong>
                      <span className="status-pill">{formatStatus(partner.partnerType)}</span>
                      <span>{partner.managedTenantCount} managed tenant(s)</span>
                      {partner.whiteLabelEnabled ? <span>White-label enabled</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'notifications' ? (
            <Panel title="Notifications">
              {dashboard.recentNotifications.length === 0 ? (
                <EmptyState
                  title="No Notifications"
                  description="Billing and subscription notifications appear when events occur."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentNotifications.map((n) => (
                    <div key={n.id} className="data-list-item">
                      <strong>{n.title}</strong>
                      <span className="status-pill">{formatStatus(n.notificationType)}</span>
                      <p>{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
              {dashboard.recentAlerts.length > 0 ? (
                <>
                  <h4>Alerts</h4>
                  <div className="data-list">
                    {dashboard.recentAlerts.map((alert) => (
                      <div key={alert.id} className="data-list-item">
                        <strong>{alert.title}</strong>
                        <span className="status-pill">{formatSeverity(alert.severity)}</span>
                        <p>{alert.description}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'audit' ? (
            <Panel title="Audit Logs">
              {isSupplementaryLoading ? <p>Loading audit logs…</p> : null}
              {auditLogs.length === 0 ? (
                <EmptyState
                  title="No Audit Logs"
                  description="SaaS management actions are recorded for complete auditability."
                />
              ) : (
                <div className="data-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{log.actionType}</strong>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA SaaS Management Agent">
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
                    'saas_management' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about subscriptions, billing, usage, licenses, or plan recommendations…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
