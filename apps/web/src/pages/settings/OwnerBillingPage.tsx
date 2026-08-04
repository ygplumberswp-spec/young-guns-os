import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { SmOwnerBillingSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  cancelSubscription,
  fetchOwnerBilling,
  upgradeSubscription,
} from '../../lib/enterprise-saas-management-api-client';
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
    const data = await fetchOwnerBilling(accessToken);
    setBilling(data);
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

  return (
    <div className="automation-page">
      <PageHeader
        title="Subscription & Billing"
        description="View your subscription, usage, invoices, and add-ons. Built on the existing SaaS platform — no fake billing data."
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
          <div className="stat-grid">
            <StatCard
              label="Subscription"
              value={billing.subscription ? formatStatus(billing.subscription.status) : 'None'}
            />
            <StatCard label="Plan" value={billing.subscription?.plan?.name ?? '—'} />
            <StatCard label="Users" value={String(billing.usage.userCount)} />
            <StatCard label="API Calls" value={String(billing.usage.apiRequestCount)} />
          </div>

          <Panel title="Subscription">
            {billing.subscription ? (
              <>
                <p>Status: {formatStatus(billing.subscription.status)}</p>
                {billing.subscription.trialEndsAt ? (
                  <p>
                    Trial ends: {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}
                  </p>
                ) : null}
                {canWrite && billing.subscription.plan ? (
                  <div className="page-header-actions">
                    {billing.plans
                      .filter((p) => p.id !== billing.subscription?.plan?.id)
                      .map((plan) => (
                        <Button
                          key={plan.id}
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => upgradeSubscription(accessToken!, plan.id),
                              `Plan change to ${plan.name} requested.`,
                            )
                          }
                        >
                          Switch to {plan.name}
                        </Button>
                      ))}
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
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No Subscription"
                description="Contact your platform administrator to activate a subscription."
              />
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

          <Panel title="Usage">
            <div className="stat-grid">
              <StatCard
                label="Storage"
                value={`${Math.round(billing.usage.storageBytes / 1024 / 1024)} MB`}
              />
              <StatCard label="AI Usage" value={String(billing.usage.aiUsageCount)} />
              <StatCard label="Integrations" value={String(billing.usage.integrationCount)} />
            </div>
          </Panel>

          <Panel title="Add-Ons">
            {billing.addOns.length === 0 ? (
              <EmptyState
                title="No Add-Ons"
                description="Purchase add-ons from SaaS Management."
                action={
                  <Link href="/saas-management">
                    <Button variant="secondary">View Add-Ons</Button>
                  </Link>
                }
              />
            ) : (
              <div className="data-list">
                {billing.addOns.map((addOn) => (
                  <div key={addOn.id} className="data-list-item">
                    <strong>{addOn.addOnName}</strong>
                    <span className="status-pill">{formatStatus(addOn.status)}</span>
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
