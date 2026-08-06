import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Button, EmptyState, GroupedTabNav, LoadingState, Panel, StatCard } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import {
  captureMarketingAnalytics,
  fetchMarketingIntelligenceDashboard,
  syncMarketingAlerts,
} from '../../lib/enterprise-marketing-intelligence-api-client';
import { ReactivationEligibilityPanel } from './ReactivationEligibilityPanel';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessMarketingIntelligence,
  canManageMarketingIntelligence,
  formatCurrency,
  formatLifecycleStatus,
  formatWorkflowStatus,
} from '../../features/marketing-intelligence/utils';
import {
  MARKETING_INTELLIGENCE_TAB_GROUPS,
  MARKETING_INTELLIGENCE_ADVANCED_TAB_GROUPS,
  type MarketingIntelligenceTab,
} from '../../features/marketing-intelligence/tabs';

export function MarketingIntelligencePage() {
  const { accessToken, user } = useAuth();
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get('tab') as MarketingIntelligenceTab | null;
  const [activeTab, setActiveTab] = useState<MarketingIntelligenceTab>(requestedTab ?? 'overview');
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
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
    () => (user ? canAccessMarketingIntelligence(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageMarketingIntelligence(user.permissions) : false),
    [user],
  );

  const {
    data: dashboard,
    error: loadError,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: 'marketing-intelligence/dashboard',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchMarketingIntelligenceDashboard(accessToken!),
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
          title="Marketing Intelligence"
          description="You do not have permission to view marketing intelligence."
        />
      </div>
    );
  }

  const tabs =
    viewMode === 'advanced'
      ? [...MARKETING_INTELLIGENCE_TAB_GROUPS, ...MARKETING_INTELLIGENCE_ADVANCED_TAB_GROUPS]
      : MARKETING_INTELLIGENCE_TAB_GROUPS;

  return (
    <div className="automation-page page-shell">
      <PageHeader
        title="Marketing Intelligence"
        description="Campaigns, content, audiences and performance."
        actions={
          <div className="page-header-actions">
            <SimpleAdvancedToggle
              mode={viewMode}
              onChange={setViewMode}
              canAccessAdvanced={canWrite}
            />
            <Link href="/aura">
              <Button variant="secondary" size="sm">
                Ask AURA
              </Button>
            </Link>
          </div>
        }
      />

      <GroupedTabNav
        groups={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as MarketingIntelligenceTab)}
        ariaLabel="Marketing intelligence sections"
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <LoadingState label="Loading Marketing Intelligence…" /> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard
              label="Active Campaigns"
              value={String(dashboard.marketingStats.activeCampaignCount)}
            />
            <StatCard label="Campaign Plans" value={String(dashboard.campaignPlanCount)} />
            <StatCard label="Strategies" value={String(dashboard.strategyCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Segments" value={String(dashboard.marketingStats.segmentCount)} />
            <StatCard label="Providers" value={String(dashboard.providerCount)} />
          </div>
          <Panel
            title="Campaign Monitoring"
            description={
              dashboard.campaignMonitoring.alerts.join(' · ') || 'No active alerts from real data'
            }
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>Pending reviews: {dashboard.campaignMonitoring.pendingReviewCount}</li>
              <li>Overdue content: {dashboard.campaignMonitoring.overdueContentCount}</li>
              <li>Budget overspend risk: {dashboard.campaignMonitoring.budgetOverspendCount}</li>
              <li>
                Provider sync failures: {dashboard.campaignMonitoring.adapterSyncFailureCount}
              </li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureMarketingAnalytics(accessToken!),
                      'Analytics captured from real marketing data.',
                    )
                  }
                >
                  Refresh analytics
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => syncMarketingAlerts(accessToken!),
                      'Marketing alerts synced from real records.',
                    )
                  }
                >
                  Review sync issues
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
                  Total spend:{' '}
                  {formatCurrency(
                    dashboard.analytics.totalSpendCents,
                    dashboard.analytics.currency,
                  )}
                </li>
                <li>
                  Attributed revenue:{' '}
                  {formatCurrency(
                    dashboard.analytics.attributedRevenueCents,
                    dashboard.analytics.currency,
                  )}
                </li>
                <li>Social posts: {dashboard.analytics.socialPostCount}</li>
                <li>Email campaigns: {dashboard.analytics.emailCampaignCount}</li>
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'strategy' ? (
        <Panel title="Marketing Strategy" description="Draft → Review → Approval → Active">
          {dashboard.recentStrategies.length === 0 ? (
            <EmptyState
              title="No Strategies"
              description="Marketing strategies appear when created in the workspace."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentStrategies.map((strategy) => (
                <li key={strategy.id}>
                  <strong>{strategy.name}</strong> — {formatWorkflowStatus(strategy.workflowStatus)}
                  {strategy.periodStart ? ` · ${strategy.periodStart}` : ''}
                  {strategy.periodEnd ? ` to ${strategy.periodEnd}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'reactivation' ? <ReactivationEligibilityPanel /> : null}

      {dashboard && activeTab === 'campaigns' ? (
        <Panel
          title="Campaign Plans"
          description="Publication and paid-media activation require approval"
        >
          {dashboard.recentCampaignPlans.length === 0 ? (
            <EmptyState
              title="No Campaign Plans"
              description="Campaign plans appear when created from real marketing objectives."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentCampaignPlans.map((campaign) => (
                <li key={campaign.id}>
                  <strong>{campaign.name}</strong> —{' '}
                  {formatLifecycleStatus(campaign.lifecycleStatus)} (
                  {formatWorkflowStatus(campaign.workflowStatus)})
                  {campaign.budgetCents != null
                    ? ` · ${formatCurrency(campaign.budgetCents, dashboard.currency)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard &&
      [
        'calendar',
        'audiences',
        'brand',
        'assets',
        'listening',
        'advertising',
        'messaging',
        'website',
        'seo',
        'journeys',
        'leads',
        'attribution',
        'growth',
        'referrals',
        'experiments',
      ].includes(activeTab) ? (
        <Panel
          title={tabs.find((t) => t.id === activeTab)?.label ?? 'Marketing'}
          description="Real tenant data only — no fake campaigns or engagement"
        >
          <p>
            Configure and manage {tabs.find((t) => t.id === activeTab)?.label?.toLowerCase()}{' '}
            through the marketing intelligence API and provider adapters.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'content' ? (
        <Panel
          title="Content Studio"
          description="AI-generated content requires human review before publication"
        >
          {dashboard.recentContentItems.length === 0 ? (
            <EmptyState
              title="No Content Items"
              description="Content items appear when created in the content operations workspace."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentContentItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong> — {item.contentType} (
                  {formatWorkflowStatus(item.contentStatus)})
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'social' ? (
        <Panel
          title="Social Media"
          description="Scheduling and publishing through configured providers only"
        >
          {dashboard.recentSocialPosts.length === 0 ? (
            <EmptyState
              title="No Social Posts"
              description="Social posts appear when drafted and scheduled."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentSocialPosts.map((post) => (
                <li key={post.id}>
                  <strong>{post.title ?? 'Social post'}</strong> —{' '}
                  {formatWorkflowStatus(post.contentStatus)}
                  {post.scheduledAt ? ` · scheduled ${post.scheduledAt}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'reviews' ? (
        <Panel
          title="Reviews & Reputation"
          description="Never generate fake reviews — response drafts require approval"
        >
          <p>
            Review management integrates with Customer Experience and configured review providers.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'email' ? (
        <Panel title="Email Marketing" description="Consent checks required before every send">
          {dashboard.recentEmailCampaigns.length === 0 ? (
            <EmptyState
              title="No Email Campaigns"
              description="Email campaigns appear when created with consent validation."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentEmailCampaigns.map((campaign) => (
                <li key={campaign.id}>
                  <strong>{campaign.name}</strong> — {formatWorkflowStatus(campaign.contentStatus)}
                  {campaign.subject ? ` · ${campaign.subject}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'roi' ? (
        <Panel title="ROI & Profitability" description="Real spend and revenue — no fabricated ROI">
          {dashboard.recentRoiSnapshots.length === 0 ? (
            <EmptyState
              title="No ROI Snapshots"
              description="ROI snapshots appear when calculated from real financial data."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentRoiSnapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  ROI snapshot — {snapshot.capturedAt}
                  {snapshot.roiPercent != null ? ` · ROI ${snapshot.roiPercent}%` : ''}
                  {snapshot.spendCents != null
                    ? ` · spend ${formatCurrency(snapshot.spendCents, dashboard.currency)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'market' ? (
        <Panel
          title="Market Intelligence"
          description="Verified facts, provider data, and AI inference are clearly distinguished"
        >
          {dashboard.recentMarketIntelligence.length === 0 ? (
            <EmptyState
              title="No Market Intelligence Records"
              description="Market intelligence appears from research and connected sources."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentMarketIntelligence.map((record) => (
                <li key={record.id}>
                  <strong>{record.title}</strong> — {record.recordType}
                  {record.confidenceScore ? ` · confidence ${record.confidenceScore}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel
          title="Marketing Alerts"
          description="Real alerts from campaigns, providers, consent, and reputation"
        >
          {dashboard.recentAlerts.length === 0 ? (
            <EmptyState
              title="No Open Alerts"
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
          title="Marketing Providers"
          description="Vendor-agnostic — Meta, Google, Mailchimp, HubSpot, and more"
        >
          <p>{dashboard.providerCount} marketing provider adapter(s) configured.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'settings' ? (
        <Panel title="Marketing Operations Settings">
          <ul className="simple-list">
            <li>Platform owner tenant: {dashboard.isPlatformOwner ? 'Yes' : 'No'}</li>
            <li>Currency: {dashboard.currency}</li>
            <li>
              Brand templates: {Object.keys(dashboard.platformConfig.brandTemplates ?? {}).length}
            </li>
            <li>
              Campaign templates:{' '}
              {Object.keys(dashboard.platformConfig.campaignTemplates ?? {}).length}
            </li>
            <li>
              Attribution standards configured:{' '}
              {Object.keys(dashboard.platformConfig.attributionStandards ?? {}).length > 0
                ? 'Yes'
                : 'No'}
            </li>
            <li>Audit retention: {dashboard.platformConfig.auditRetentionDays} days</li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Marketing Intelligence Agent"
          description="Recommendations and drafts only — no autonomous publication or ad spend"
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
                'marketing_intelligence' as import('@titan/shared').AgentKey,
              )
            }
            placeholder="Ask about campaigns, content, audiences, attribution, or marketing ROI…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
