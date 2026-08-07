import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { SaasTenantSubscriptionView, SmOwnerBillingSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  cancelSubscription,
  fetchOwnerBilling,
  upgradeSubscription,
} from '../../lib/enterprise-saas-management-api-client';
import { fetchTenantSubscriptionView } from '../../lib/platform-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessSaasManagement,
  canManageSaasManagement,
  formatCurrency,
  formatStatus,
} from '../../features/saas-management/utils';

export function OwnerBillingPage() {
  const { accessToken, user } = useAuth();
  const [billing, setBilling] = useState<SmOwnerBillingSummary | null>(null);
  const [subscriptionView, setSubscriptionView] = useState<SaasTenantSubscriptionView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessSaasManagement(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageSaasManagement(user.permissions) : false),
    [user],
  );

  async function load() {
    if (!accessToken) return;
    const [billingData, viewData] = await Promise.all([
      fetchOwnerBilling(accessToken),
      fetchTenantSubscriptionView(accessToken).catch(() => null),
    ]);
    setBilling(billingData);
    setSubscriptionView(viewData);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await load();
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiClientError ? err.message : 'Unable to load billing');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
      setSuccess(message);
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
          title="Subscription & Billing"
          description="You do not have permission to view billing."
        />
      </div>
    );
  }

  const seats = subscriptionView?.seats;
  const fairUse = subscriptionView?.fairUse;

  return (
    <div className="automation-page">
      <PageHeader
        title="Subscription & Billing"
        description="Your TITAN plan, included team seats, usage status, and renewal information. Internal provider costs and margins are not shown."
        actions={
          <Link href="/saas-management">
            <Button variant="secondary">SaaS Management</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isLoading ? (
        <Panel title="Loading">Loading billing…</Panel>
      ) : !billing ? (
        <EmptyState title="No Billing Data" description="Billing information is unavailable." />
      ) : (
        <>
          {subscriptionView?.billingAttention ? (
            <Panel title="Payment / entitlement attention">
              <p>
                Your subscription needs attention. Operational access follows paid-through
                entitlement rules — your data remains safely stored.
              </p>
              {subscriptionView.paidThroughAt ? (
                <p>
                  Paid through:{' '}
                  {new Date(subscriptionView.paidThroughAt).toLocaleDateString()}
                </p>
              ) : null}
            </Panel>
          ) : null}

          <div className="stat-grid">
            <StatCard
              label="Current plan"
              value={subscriptionView?.plan?.name ?? billing.subscription?.plan?.name ?? '—'}
            />
            <StatCard
              label="Subscription"
              value={
                subscriptionView?.subscription
                  ? formatStatus(subscriptionView.subscription.status)
                  : billing.subscription
                    ? formatStatus(billing.subscription.status)
                    : 'None'
              }
            />
            <StatCard
              label="Seats used"
              value={
                seats
                  ? `${seats.usage.totalUsed}${seats.totalIncluded != null ? ` / ${seats.totalIncluded}` : ''}`
                  : String(billing.usage.userCount)
              }
            />
            <StatCard
              label="Usage status"
              value={fairUse ? formatStatus(fairUse.overall) : '—'}
            />
          </div>

          <Panel title="Included team">
            {seats ? (
              <div className="stat-grid">
                <StatCard
                  label="Admin / Office"
                  value={`${seats.usage.adminOfficeUsed}${seats.adminOfficeIncluded != null ? ` / ${seats.adminOfficeIncluded}` : ''}`}
                />
                <StatCard
                  label="Technicians"
                  value={`${seats.usage.technicianUsed}${seats.technicianIncluded != null ? ` / ${seats.technicianIncluded}` : ''}`}
                />
                <StatCard
                  label="Over-limit"
                  value={seats.overLimitState === 'action_required' ? 'Action required' : 'None'}
                />
              </div>
            ) : (
              <p>Seat details unavailable for this tenant.</p>
            )}
            {seats?.overLimitState === 'action_required' ? (
              <p className="muted-text">
                Existing users and history are preserved. Additional seats cannot be created until
                access is adjusted or the plan is upgraded.
              </p>
            ) : null}
          </Panel>

          <Panel title="Renewal information">
            <p>
              Paid through:{' '}
              {subscriptionView?.paidThroughAt
                ? new Date(subscriptionView.paidThroughAt).toLocaleDateString()
                : '—'}
            </p>
            <p>
              Next renewal:{' '}
              {subscriptionView?.nextRenewalAt
                ? new Date(subscriptionView.nextRenewalAt).toLocaleDateString()
                : '—'}
            </p>
            {billing.subscription?.trialEndsAt ? (
              <p>
                Trial ends: {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}
              </p>
            ) : null}
          </Panel>

          <Panel title="Upgrade options">
            {subscriptionView?.upgradePlans?.length || billing.plans.length ? (
              <div className="page-header-actions">
                {(subscriptionView?.upgradePlans ?? billing.plans)
                  .filter((plan) => plan.id !== (subscriptionView?.plan?.id ?? billing.subscription?.plan?.id))
                  .map((plan) => (
                    <Button
                      key={plan.id}
                      variant="secondary"
                      disabled={isWorking || !canWrite}
                      onClick={() =>
                        void runAction(
                          () => upgradeSubscription(accessToken!, plan.id),
                          `Plan change to ${plan.name} requested. Existing data preserved.`,
                        )
                      }
                    >
                      Upgrade to {plan.name}
                    </Button>
                  ))}
                {canWrite && billing.subscription ? (
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
                    Cancel Subscription
                  </Button>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No upgrade options"
                description="Contact your platform administrator if you need a different package."
              />
            )}
          </Panel>

          <Panel title="Fair-use / usage">
            {fairUse && fairUse.metrics.length > 0 ? (
              <div className="data-list">
                {fairUse.metrics.map((metric) => (
                  <div key={metric.metric} className="data-list-item">
                    <strong>{metric.metric.replace(/_/g, ' ')}</strong>
                    <span className="status-pill">{formatStatus(metric.state)}</span>
                    <span>
                      {metric.used}
                      {metric.allowance != null ? ` / ${metric.allowance}` : ''}
                    </span>
                    <p className="muted-text">{metric.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stat-grid">
                <StatCard
                  label="Storage"
                  value={`${Math.round(billing.usage.storageBytes / 1024 / 1024)} MB`}
                />
                <StatCard label="AI Usage" value={String(billing.usage.aiUsageCount)} />
                <StatCard label="Integrations" value={String(billing.usage.integrationCount)} />
              </div>
            )}
          </Panel>

          <Panel title="Invoices & Billing Records">
            {billing.billingRecords.length === 0 ? (
              <EmptyState
                title="No Invoices"
                description="Billing records appear when invoices are generated."
              />
            ) : (
              <div className="data-list">
                {billing.billingRecords.map((record) => (
                  <div key={record.id} className="data-list-item">
                    <strong>{record.description}</strong>
                    <span className="status-pill">{formatStatus(record.status)}</span>
                    <span>{formatCurrency(record.amountCents, record.currency)}</span>
                    <span>{new Date(record.issuedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
