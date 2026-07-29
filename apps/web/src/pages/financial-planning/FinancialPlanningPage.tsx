import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseFinancialPlanningDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  activateBudget,
  approveBudget,
  captureFinancialAnalytics,
  fetchFinancialPlanningDashboard,
  generateCashFlowProjection,
  syncFinancialAlerts,
} from '../../lib/enterprise-financial-planning-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessFinancialPlanning,
  canManageFinancialPlanning,
  formatBudgetStatus,
  formatCurrency,
} from '../../features/financial-planning/utils';

type FinancialPlanningTab =
  | 'overview'
  | 'budgets'
  | 'forecasts'
  | 'cashflow'
  | 'receivables'
  | 'payables'
  | 'treasury'
  | 'workingcapital'
  | 'profitability'
  | 'jobs'
  | 'customers'
  | 'suppliers'
  | 'workforce'
  | 'assets'
  | 'scenarios'
  | 'targets'
  | 'alerts'
  | 'providers'
  | 'settings'
  | 'assistant';

export function FinancialPlanningPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<FinancialPlanningTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseFinancialPlanningDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessFinancialPlanning(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinancialPlanning(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchFinancialPlanningDashboard(accessToken);
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
        const data = await fetchFinancialPlanningDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load financial planning dashboard');
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

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
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
        <PageHeader title="Financial Planning" description="You do not have permission to view financial planning." />
      </div>
    );
  }

  const tabs: Array<{ id: FinancialPlanningTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'budgets', label: 'Budgets' },
    { id: 'forecasts', label: 'Forecasts' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'receivables', label: 'Receivables' },
    { id: 'payables', label: 'Payables' },
    { id: 'treasury', label: 'Treasury' },
    { id: 'workingcapital', label: 'Working Capital' },
    { id: 'profitability', label: 'Profitability' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'customers', label: 'Customers' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'workforce', label: 'Workforce' },
    { id: 'assets', label: 'Assets & Fleet' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'targets', label: 'Targets' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'providers', label: 'Providers' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  const jobSnapshots = dashboard?.recentProfitabilitySnapshots.filter((s) => s.dimensionType === 'job') ?? [];
  const customerSnapshots =
    dashboard?.recentProfitabilitySnapshots.filter((s) => s.dimensionType === 'customer') ?? [];
  const supplierSnapshots =
    dashboard?.recentProfitabilitySnapshots.filter((s) => s.dimensionType === 'supplier') ?? [];

  return (
    <div className="automation-page">
      <PageHeader
        title="Financial Planning"
        description="Budgets, forecasts, cash flow, treasury, and profitability intelligence. Real tenant data only — forecasts and scenarios are clearly labelled."
        actions={
          <div className="page-header-actions">
            <Link href="/finance">
              <Button variant="secondary">Finance</Button>
            </Link>
          </div>
        }
      />

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

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <p>Loading financial planning...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard
              label="Cash Position"
              value={formatCurrency(dashboard.cashPositionCents, dashboard.currency)}
            />
            <StatCard label="Active Budgets" value={String(dashboard.activeBudgetCount)} />
            <StatCard label="Active Forecasts" value={String(dashboard.activeForecastCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard
              label="Overdue Receivables"
              value={formatCurrency(dashboard.receivables.overdueAmountCents, dashboard.currency)}
            />
            <StatCard
              label="Upcoming Payables"
              value={formatCurrency(dashboard.payables.upcomingAmountCents, dashboard.currency)}
            />
          </div>
          <Panel
            title="Financial Monitoring"
            description={dashboard.financialMonitoring.alerts.join(' · ') || 'No active alerts from real data'}
          >
            <p>{dashboard.summary}</p>
            {dashboard.cashShortageWarning ? (
              <p className="form-error">Cash shortage warning based on real receivables and payables.</p>
            ) : null}
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => captureFinancialAnalytics(accessToken!), 'Analytics captured from real data.')
                  }
                >
                  Capture Analytics
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => syncFinancialAlerts(accessToken!), 'Financial alerts synced from real records.')
                  }
                >
                  Sync Alerts
                </Button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'budgets' ? (
        <Panel title="Budgets" description="Draft → Review → Approval → Active">
          {dashboard.recentBudgets.length === 0 ? (
            <EmptyState title="No budgets" description="Budgets appear when created in the financial planning workspace." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentBudgets.map((b) => (
                <li key={b.id}>
                  <strong>{b.title}</strong> — {formatBudgetStatus(b.status)} ({b.workflowStatus})
                  {b.totalAmountCents != null ? ` · ${formatCurrency(b.totalAmountCents, b.currency)}` : ''}
                  {canWrite && b.workflowStatus === 'pending_approval' ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() => void runAction(() => approveBudget(accessToken!, b.id), 'Budget approved.')}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() => void runAction(() => activateBudget(accessToken!, b.id), 'Budget activated.')}
                      >
                        Activate
                      </Button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'forecasts' ? (
        <Panel title="Rolling Forecasts" description="Base, optimistic, conservative, and custom scenarios">
          {dashboard.recentForecasts.length === 0 ? (
            <EmptyState title="No forecasts" description="Forecasts are generated from real revenue, pipeline, and operational data." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentForecasts.map((f) => (
                <li key={f.id}>
                  {f.title} — {f.forecastType} ({f.workflowStatus})
                  {f.isSimulation ? ' · simulation' : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'cashflow' ? (
        <Panel title="Cash Flow" description="Forward-looking view from real invoices, payments, and commitments">
          {dashboard.recentCashFlowProjections.length === 0 ? (
            <EmptyState title="No projections" description="Generate cash-flow projections from real tenant records." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentCashFlowProjections.map((p) => (
                <li key={p.id}>
                  {p.projectionDate}: closing {formatCurrency(p.closingBalanceCents, dashboard.currency)}
                  {p.cashRunwayDays != null ? ` · runway ${p.cashRunwayDays} days` : ''}
                </li>
              ))}
            </ul>
          )}
          {canWrite ? (
            <Button
              disabled={isWorking}
              onClick={() =>
                void runAction(() => generateCashFlowProjection(accessToken!), 'Cash-flow projection generated.')
              }
            >
              Generate Projection
            </Button>
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'receivables' ? (
        <Panel title="Receivables Intelligence">
          <p>{dashboard.receivables.summary}</p>
          <ul className="simple-list">
            {dashboard.receivables.collectionPriorities.slice(0, 10).map((item) => (
              <li key={item.invoiceId}>
                {item.customerName} — {formatCurrency(item.amountDueCents, dashboard.currency)} ({item.priority})
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'payables' ? (
        <Panel title="Payables Intelligence">
          <p>{dashboard.payables.summary}</p>
          <ul className="simple-list">
            {dashboard.payables.paymentPriorities.slice(0, 10).map((item, index) => (
              <li key={`${item.supplierName}-${index}`}>
                {item.supplierName} — {formatCurrency(item.amountCents, dashboard.currency)} ({item.priority})
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'treasury' ? (
        <Panel title="Treasury">
          <p>{dashboard.treasuryAccountCount} treasury account(s) configured.</p>
          {dashboard.treasuryAccountCount === 0 ? (
            <EmptyState title="No treasury accounts" description="Connect banking providers and register treasury accounts." />
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'workingcapital' ? (
        <Panel title="Working Capital">
          <p>{dashboard.workingCapital.summary}</p>
          <ul className="simple-list">
            <li>Receivables: {formatCurrency(dashboard.workingCapital.receivablesCents, dashboard.currency)}</li>
            <li>Payables: {formatCurrency(dashboard.workingCapital.payablesCents, dashboard.currency)}</li>
            <li>Inventory: {formatCurrency(dashboard.workingCapital.inventoryValueCents, dashboard.currency)}</li>
          </ul>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'profitability' ? (
        <Panel title="Profitability" description="Source transactions, allocation method, and formula shown per snapshot">
          {dashboard.recentProfitabilitySnapshots.length === 0 ? (
            <EmptyState title="No profitability snapshots" description="Capture profitability from real job and customer data." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentProfitabilitySnapshots.map((s) => (
                <li key={s.id}>
                  {s.dimensionName ?? s.dimensionType}: margin {s.marginPercent ?? 'n/a'}%
                  {s.formula ? ` · ${s.formula}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'jobs' ? (
        <Panel title="Job Profitability">
          {jobSnapshots.length === 0 ? (
            <EmptyState title="No job profitability data" description="Job margins appear when jobs have invoiced revenue and cost data." />
          ) : (
            <ul className="simple-list">
              {jobSnapshots.map((s) => (
                <li key={s.id}>{s.dimensionName}: {formatCurrency(s.grossProfitCents, dashboard.currency)} gross profit</li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'customers' ? (
        <Panel title="Customer Profitability">
          {customerSnapshots.length === 0 ? (
            <EmptyState title="No customer profitability data" description="Customer margins appear from real revenue and cost-to-serve data." />
          ) : (
            <ul className="simple-list">
              {customerSnapshots.map((s) => (
                <li key={s.id}>{s.dimensionName}: {formatCurrency(s.grossProfitCents, dashboard.currency)} gross profit</li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'suppliers' ? (
        <Panel title="Supplier Cost Intelligence">
          {supplierSnapshots.length === 0 ? (
            <EmptyState title="No supplier cost snapshots" description="Supplier cost analysis uses procurement and finance records." />
          ) : (
            <ul className="simple-list">
              {supplierSnapshots.map((s) => (
                <li key={s.id}>{s.dimensionName}: {formatCurrency(s.directCostCents, dashboard.currency)} direct cost</li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'workforce' ? (
        <Panel title="Workforce Cost Intelligence" description="Confidential pay data restricted to authorized roles">
          <p>Workforce cost analysis integrates with Enterprise Workforce Intelligence. No fake labour costs.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'assets' ? (
        <Panel title="Assets & Fleet Cost Intelligence">
          <p>Asset and fleet cost analysis integrates with Asset Lifecycle and Fleet platforms.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'scenarios' ? (
        <Panel title="Scenario Planning" description="All scenarios are marked as simulations">
          {dashboard.recentScenarios.length === 0 ? (
            <EmptyState title="No scenarios" description="Create scenarios with explicit assumptions for simulation." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentScenarios.map((s) => (
                <li key={s.id}>
                  {s.title} — {s.scenarioType} {s.isSimulation ? '(simulation)' : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'targets' ? (
        <Panel title="Financial Targets & KPIs">
          <p>{dashboard.targetCount} target(s) configured.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel title="Financial Alerts">
          {dashboard.recentAlerts.length === 0 ? (
            <EmptyState title="No alerts" description="Alerts are generated from real financial monitoring only." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentAlerts.map((a) => (
                <li key={a.id}>
                  [{a.severity}] {a.title} — {a.status}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'providers' ? (
        <Panel title="Accounting & Banking Providers" description="Vendor-agnostic — Xero, QuickBooks, Sage, open banking, and more">
          <p>
            {dashboard.accountingProviderCount} accounting provider(s), {dashboard.bankingProviderCount} banking
            provider(s).
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'settings' ? (
        <Panel title="Financial Planning Settings">
          <ul className="simple-list">
            <li>Platform owner tenant: {dashboard.isPlatformOwner ? 'Yes' : 'No'}</li>
            <li>Currency: {dashboard.currency}</li>
            <li>KPI templates: {Object.keys(dashboard.platformConfig.kpiTemplates ?? {}).length}</li>
            <li>Allocation methods configured: {Object.keys(dashboard.platformConfig.allocationMethods ?? {}).length > 0 ? 'Yes' : 'No'}</li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Financial Planning Agent" description="Recommendations and drafts only — no autonomous financial transactions">
          {assistantError ? <p className="form-error">{assistantError}</p> : null}
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) => void sendAgentMessage(content, 'financial_planning' as import('@titan/shared').AgentKey)}
            placeholder="Ask about cash flow, budgets, forecasts, profitability, or working capital…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
