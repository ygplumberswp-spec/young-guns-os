import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, GroupedTabNav, LoadingState, PageHeader, Panel, StatCard } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  captureSalesAnalytics,
  fetchSalesIntelligenceDashboard,
  syncSalesAlerts,
} from '../../lib/enterprise-sales-intelligence-api-client';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessSalesIntelligence,
  canManageSalesIntelligence,
  formatCurrency,
  formatPercent,
  formatWorkflowStatus,
} from '../../features/sales-intelligence/utils';
import {
  SALES_INTELLIGENCE_TAB_GROUPS,
  type SalesIntelligenceTab,
} from '../../features/sales-intelligence/tabs';

export function SalesIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<SalesIntelligenceTab>('overview');
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
    () => (user ? canAccessSalesIntelligence(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageSalesIntelligence(user.permissions) : false),
    [user],
  );

  const {
    data: dashboard,
    error: loadError,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: 'sales-intelligence/dashboard',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchSalesIntelligenceDashboard(accessToken!),
  });

  useEffect(() => {
    if (loadError) {
      setError(loadError);
    }
  }, [loadError]);

  async function loadDashboard() {
    await refetch();
  }

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
        <PageHeader
          title="Sales Intelligence"
          description="You do not have permission to view sales intelligence."
        />
      </div>
    );
  }

  const tabs = SALES_INTELLIGENCE_TAB_GROUPS;

  return (
    <div className="automation-page">
      <PageHeader
        title="Sales Intelligence"
        description="Revenue operations, pipeline, forecasts, and customer growth intelligence. Real tenant data only — forecasts and recommendations are clearly labelled."
        actions={
          <div className="page-header-actions">
            <Link href="/crm">
              <Button variant="secondary">CRM</Button>
            </Link>
            <Link href="/finance/quotes">
              <Button variant="secondary">Quotes</Button>
            </Link>
          </div>
        }
      />

      <GroupedTabNav
        groups={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as SalesIntelligenceTab)}
        ariaLabel="Sales intelligence sections"
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <LoadingState label="Loading sales intelligence…" /> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard
              label="Pipeline Value"
              value={formatCurrency(dashboard.salesStats.pipelineValueCents, dashboard.currency)}
            />
            <StatCard
              label="Open Opportunities"
              value={String(dashboard.salesStats.openOpportunityCount)}
            />
            <StatCard label="Active Leads" value={String(dashboard.leadStats.activeLeadCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Renewals Tracked" value={String(dashboard.renewalCount)} />
            <StatCard
              label="Quote Conversion"
              value={
                dashboard.salesStats.quoteConversionRatePercent != null
                  ? `${dashboard.salesStats.quoteConversionRatePercent.toFixed(1)}%`
                  : '—'
              }
            />
          </div>
          <Panel
            title="Revenue Monitoring"
            description={
              dashboard.revenueMonitoring.alerts.join(' · ') ||
              'No active revenue alerts from real data'
            }
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>Unassigned leads: {dashboard.revenueMonitoring.unassignedLeadCount}</li>
              <li>Stalled opportunities: {dashboard.revenueMonitoring.stalledOpportunityCount}</li>
              <li>Expiring quotes: {dashboard.revenueMonitoring.expiringQuoteCount}</li>
              <li>SLA breaches: {dashboard.revenueMonitoring.slaBreachCount}</li>
              <li>CRM sync failures: {dashboard.revenueMonitoring.crmSyncFailureCount}</li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureSalesAnalytics(accessToken!),
                      'Analytics captured from real sales data.',
                    )
                  }
                >
                  Capture Analytics
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => syncSalesAlerts(accessToken!),
                      'Sales alerts synced from real records.',
                    )
                  }
                >
                  Sync Alerts
                </Button>
              </div>
            ) : null}
          </Panel>
          {dashboard.analytics ? (
            <Panel
              title="Latest Analytics Snapshot"
              description={`Captured ${dashboard.analytics.capturedAt}`}
            >
              <ul className="simple-list">
                <li>
                  Weighted pipeline:{' '}
                  {formatCurrency(
                    dashboard.analytics.weightedPipelineCents,
                    dashboard.analytics.currency,
                  )}
                </li>
                <li>
                  Renewal exposure:{' '}
                  {formatCurrency(
                    dashboard.analytics.renewalExposureCents,
                    dashboard.analytics.currency,
                  )}
                </li>
                <li>
                  Revenue leakage:{' '}
                  {formatCurrency(
                    dashboard.analytics.revenueLeakageCents,
                    dashboard.analytics.currency,
                  )}
                </li>
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'leads' ? (
        <Panel title="Lead Registry" description="Unified lead registry from all connected sources">
          <div className="stat-grid">
            <StatCard label="Active" value={String(dashboard.leadStats.activeLeadCount)} />
            <StatCard label="Qualified" value={String(dashboard.leadStats.qualifiedLeadCount)} />
            <StatCard label="Converted" value={String(dashboard.leadStats.convertedLeadCount)} />
          </div>
          <p>
            Leads are managed through the unified lead registry with deduplication and source
            attribution.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'opportunities' ? (
        <Panel
          title="Opportunities"
          description="Open and won opportunities from real CRM and sales records"
        >
          <div className="stat-grid">
            <StatCard label="Open" value={String(dashboard.salesStats.openOpportunityCount)} />
            <StatCard label="Won" value={String(dashboard.salesStats.wonOpportunityCount)} />
            <StatCard
              label="Pipeline"
              value={formatCurrency(dashboard.salesStats.pipelineValueCents, dashboard.currency)}
            />
          </div>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'pipelines' ? (
        <Panel title="Sales Pipelines" description="Configurable pipelines — no hard-coded stages">
          {dashboard.recentPipelines.length === 0 ? (
            <EmptyState
              title="No pipelines"
              description="Create pipelines in revenue operations settings."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentPipelines.map((pipeline) => (
                <li key={pipeline.id}>
                  <strong>{pipeline.name}</strong>
                  {pipeline.pipelineType ? ` · ${pipeline.pipelineType}` : ''} ·{' '}
                  {pipeline.stageCount} stage(s)
                  {pipeline.isActive ? '' : ' · inactive'}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'activities' ? (
        <Panel
          title="Sales Activities"
          description="Linked to the Unified Communications Platform where available"
        >
          <p>
            Sales activities integrate with calls, emails, WhatsApp, meetings, and tasks from
            connected communications.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'quotes' ? (
        <Panel
          title="Quotes & Proposals"
          description="Integrated with finance quotes — approved versions are immutable"
        >
          <p>
            Quote conversion rate:{' '}
            {dashboard.salesStats.quoteConversionRatePercent != null
              ? `${dashboard.salesStats.quoteConversionRatePercent.toFixed(1)}%`
              : '—'}
          </p>
          <Link href="/finance/quotes">
            <Button variant="secondary">Open Quotes</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'forecasts' ? (
        <Panel
          title="Sales Forecasts"
          description="Evidence-based forecasts — simulations are clearly marked"
        >
          {dashboard.recentForecasts.length === 0 ? (
            <EmptyState
              title="No forecasts"
              description="Forecasts appear when created from pipeline and historical data."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentForecasts.map((forecast) => (
                <li key={forecast.id}>
                  <strong>{forecast.title}</strong> —{' '}
                  {formatWorkflowStatus(forecast.workflowStatus)}
                  {forecast.isSimulation ? ' · simulation' : ''}
                  {forecast.pipelineValueCents != null
                    ? ` · pipeline ${formatCurrency(forecast.pipelineValueCents, forecast.currency)}`
                    : ''}
                  {forecast.confidenceScore
                    ? ` · confidence ${formatPercent(forecast.confidenceScore)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'accounts' ? (
        <Panel title="Accounts" description="Territory-isolated account management">
          <p>{dashboard.crmStats.customerCount} customer record(s) connected.</p>
          <Link href="/crm">
            <Button variant="secondary">Open CRM</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'renewals' ? (
        <Panel
          title="Renewals"
          description="Service agreements, subscriptions, and contract renewals"
        >
          {dashboard.recentRenewals.length === 0 ? (
            <EmptyState
              title="No renewals"
              description="Renewals appear when tracked from real contracts and agreements."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentRenewals.map((renewal) => (
                <li key={renewal.id}>
                  <strong>{renewal.title}</strong> — {formatWorkflowStatus(renewal.workflowStatus)}
                  {renewal.renewalDate ? ` · due ${renewal.renewalDate}` : ''}
                  {renewal.currentValueCents != null
                    ? ` · ${formatCurrency(renewal.currentValueCents, dashboard.currency)}`
                    : ''}
                  {renewal.renewalProbability
                    ? ` · probability ${formatPercent(renewal.renewalProbability)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'growth' ? (
        <Panel
          title="Customer Growth"
          description="Recommendations only — based on real customer data"
        >
          {dashboard.recentGrowthSnapshots.length === 0 ? (
            <EmptyState
              title="No growth opportunities"
              description="Growth snapshots appear when analyzed from real customer records."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentGrowthSnapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  <strong>{snapshot.title}</strong> — {snapshot.opportunityType}
                  {snapshot.confidenceScore
                    ? ` · confidence ${formatPercent(snapshot.confidenceScore)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'retention' ? (
        <Panel
          title="Retention & Churn Intelligence"
          description="Recommendations only — no discriminatory scoring"
        >
          {dashboard.recentRetentionSnapshots.length === 0 ? (
            <EmptyState
              title="No retention signals"
              description="Retention analysis appears when real customer behaviour is available."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentRetentionSnapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  Risk level: <strong>{snapshot.riskLevel}</strong>
                  {snapshot.confidenceScore
                    ? ` · confidence ${formatPercent(snapshot.confidenceScore)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'pricing' ? (
        <Panel
          title="Pricing & Discounts"
          description="Draft → Review → Approval → Execution for discount governance"
        >
          <p>
            Pricing intelligence uses real cost and commercial data. AURA may recommend prices
            within configured policy only.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'commissions' ? (
        <Panel
          title="Commissions"
          description="Formulas and source transactions visible — payroll export requires approval"
        >
          <p>Commission plans and entries are configured per tenant with full audit history.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'targets' ? (
        <Panel
          title="Sales Targets & Performance"
          description="Supporting data and formulas shown — no hidden scoring"
        >
          {dashboard.recentTargets.length === 0 ? (
            <EmptyState
              title="No targets"
              description="Targets appear when configured for your sales teams."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentTargets.map((target) => (
                <li key={target.id}>
                  <strong>{target.title}</strong> — {target.targetType} ({target.status})
                  {target.progressPercent
                    ? ` · progress ${formatPercent(target.progressPercent)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'leakage' ? (
        <Panel
          title="Revenue Leakage"
          description="Warnings and draft actions only — from real operational and finance records"
        >
          {dashboard.recentLeakageFindings.length === 0 ? (
            <EmptyState
              title="No leakage findings"
              description="Leakage detection runs against real jobs, quotes, and invoices."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentLeakageFindings.map((finding) => (
                <li key={finding.id}>
                  <strong>{finding.title}</strong> — {finding.findingType} ({finding.status})
                  {finding.estimatedAmountCents != null
                    ? ` · ${formatCurrency(finding.estimatedAmountCents, dashboard.currency)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'marketing' ? (
        <Panel
          title="Marketing Attribution"
          description="Campaign attribution from real marketing and sales records"
        >
          <p>
            Cost per lead, cost per opportunity, and ROI metrics use connected marketing campaign
            data only.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'partners' ? (
        <Panel
          title="Partners & Referrals"
          description="Referral partners, agents, and strategic partners"
        >
          <p>
            Partner referrals are tracked with revenue, commission, and compliance audit history.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'tenders' ? (
        <Panel title="Tenders & Bids" description="Final submission requires human approval">
          <p>
            Tender management supports bid opportunities, compliance documents, and win/loss
            debriefs.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'winloss' ? (
        <Panel title="Win/Loss Intelligence" description="Trends from real closed opportunities">
          <p>
            Win and loss reasons, competitors, and process issues are captured from actual
            opportunity outcomes.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel
          title="Revenue Operations Alerts"
          description="Real alerts from leads, quotes, renewals, and CRM sync"
        >
          {dashboard.recentAlerts.length === 0 ? (
            <EmptyState
              title="No open alerts"
              description="Alerts are generated from real tenant activity."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentAlerts.map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.title}</strong> — {alert.severity} ({alert.status})
                  {alert.description ? ` · ${alert.description}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'providers' ? (
        <Panel
          title="CRM Providers"
          description="Vendor-agnostic — Salesforce, HubSpot, Zoho, Dynamics, and more"
        >
          <p>{dashboard.crmProviderCount} CRM provider adapter(s) configured.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'settings' ? (
        <Panel title="Revenue Operations Settings">
          <ul className="simple-list">
            <li>Platform owner tenant: {dashboard.isPlatformOwner ? 'Yes' : 'No'}</li>
            <li>Currency: {dashboard.currency}</li>
            <li>
              Pipeline templates:{' '}
              {Object.keys(dashboard.platformConfig.pipelineTemplates ?? {}).length}
            </li>
            <li>
              Playbook templates:{' '}
              {Object.keys(dashboard.platformConfig.playbookTemplates ?? {}).length}
            </li>
            <li>
              Forecast methodology configured:{' '}
              {Object.keys(dashboard.platformConfig.forecastMethodology ?? {}).length > 0
                ? 'Yes'
                : 'No'}
            </li>
            <li>Audit retention: {dashboard.platformConfig.auditRetentionDays} days</li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Sales Intelligence Agent"
          description="Recommendations and drafts only — no autonomous customer contact or pricing approval"
        >
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
                'sales_intelligence' as import('@titan/shared').AgentKey,
              )
            }
            placeholder="Ask about pipeline, leads, forecasts, renewals, or customer growth…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
