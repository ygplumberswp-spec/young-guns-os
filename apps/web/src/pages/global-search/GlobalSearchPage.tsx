import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  EnterpriseGlobalSearchDashboard,
  GsSearchMode,
  GsSearchResultSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureGlobalSearchAnalytics,
  fetchGlobalSearchAuditLogs,
  fetchGlobalSearchDashboard,
  refreshSearchIndex,
  runGlobalSearch,
  syncSearchAlerts,
} from '../../lib/enterprise-global-search-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessGlobalSearch,
  canManageGlobalSearch,
  formatEntityType,
  formatRelevanceScore,
  formatSearchMode,
  formatSeverity,
  formatStatus,
} from '../../features/global-search/utils';
import { resolveGlobalSearchEntityHref } from '../../features/global-search/entity-routes';

type GlobalSearchTab =
  | 'search'
  | 'timeline'
  | 'activity'
  | 'saved'
  | 'relationships'
  | 'ai_search'
  | 'analytics'
  | 'settings'
  | 'audit'
  | 'assistant';

export function GlobalSearchPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<GlobalSearchTab>('search');
  const [dashboard, setDashboard] = useState<EnterpriseGlobalSearchDashboard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<GsSearchMode>('hybrid');
  const [searchResults, setSearchResults] = useState<GsSearchResultSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<
    Awaited<ReturnType<typeof fetchGlobalSearchAuditLogs>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
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

  const canView = useMemo(() => (user ? canAccessGlobalSearch(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageGlobalSearch(user.permissions) : false), [user]);

  const tabs: Array<{ id: GlobalSearchTab; label: string }> = [
    { id: 'search', label: 'Search' },
    { id: 'timeline', label: 'Universal Timeline' },
    { id: 'activity', label: 'Activity Feed' },
    { id: 'saved', label: 'Saved Searches' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'ai_search', label: 'AI Search' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchGlobalSearchDashboard(accessToken);
    setDashboard(data);
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
            err instanceof ApiClientError ? err.message : 'Unable to load global search dashboard',
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
        const logs = await fetchGlobalSearchAuditLogs(accessToken!);
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

  async function handleSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!accessToken || !searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const results = await runGlobalSearch(accessToken, {
        query: searchQuery.trim(),
        searchMode,
        limit: 50,
      });
      setSearchResults(results);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Global Search"
          description="You do not have permission to view global search."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Global Search"
        description="Enterprise global search, universal timeline, and cross-module activity intelligence — built on existing CRM, Jobs, Finance, Documents, Knowledge Graph, and Mission Control services. No fake indexes or demo activity."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncSearchAlerts(accessToken!), 'Search alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureGlobalSearchAnalytics(accessToken!),
                    'Analytics captured.',
                  )
                }
              >
                Capture Analytics
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => refreshSearchIndex(accessToken!), 'Search index refreshed.')
                }
              >
                Refresh Index
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
        <Panel title="Loading">Loading global search dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Global search dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'search' ? (
            <>
              <Panel title="Global Search">
                <form className="form-stack" onSubmit={(event) => void handleSearch(event)}>
                  <label>
                    Search query
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search customers, jobs, invoices, documents…"
                    />
                  </label>
                  <label>
                    Search mode
                    <select
                      value={searchMode}
                      onChange={(event) => setSearchMode(event.target.value as GsSearchMode)}
                    >
                      <option value="hybrid">Hybrid</option>
                      <option value="keyword">Keyword</option>
                      <option value="fuzzy">Fuzzy</option>
                      <option value="natural_language">Natural language</option>
                    </select>
                  </label>
                  <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
                    {isSearching ? 'Searching…' : 'Search'}
                  </Button>
                </form>
              </Panel>
              {searchResults.length > 0 ? (
                <Panel title={`Results (${searchResults.length})`}>
                  <div className="data-list">
                    {searchResults.map((result) => {
                      const href = resolveGlobalSearchEntityHref(
                        result.entityType,
                        result.sourceEntityId,
                      );
                      const content = (
                        <>
                          <strong>{result.title}</strong>
                          <span>
                            {formatEntityType(result.entityType)} · {result.sourceModule} ·{' '}
                            {formatRelevanceScore(result.relevanceScore)}
                          </span>
                          {result.summary ? <p>{result.summary}</p> : null}
                        </>
                      );

                      return href ? (
                        <Link
                          key={`${result.sourceModule}-${result.sourceEntityId}`}
                          href={href}
                          className="data-list-item data-list-item--link"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div
                          key={`${result.sourceModule}-${result.sourceEntityId}`}
                          className="data-list-item"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              ) : (
                <EmptyState
                  title="No results yet"
                  description="Run a search to query real records across CRM, Jobs, Finance, Inventory, Fleet, Documents, OCR, and Knowledge Graph."
                />
              )}
            </>
          ) : null}

          {activeTab === 'timeline' ? (
            <Panel title="Universal Timeline Preview">
              {dashboard.timelinePreview.length === 0 ? (
                <EmptyState
                  title="No timeline events"
                  description="Timeline events are derived from real CRM activities, jobs, communications, and stored timeline entries."
                />
              ) : (
                <div className="data-list">
                  {dashboard.timelinePreview.map((entry) => (
                    <div key={entry.id} className="data-list-item">
                      <strong>{entry.title}</strong>
                      <span>
                        {formatEntityType(entry.entityType)} · {formatStatus(entry.eventType)} ·{' '}
                        {new Date(entry.occurredAt).toLocaleString()}
                      </span>
                      {entry.description ? <p>{entry.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'activity' ? (
            <Panel title="Activity Feed">
              {dashboard.activityFeedPreview.length === 0 ? (
                <EmptyState
                  title="No activity feed items"
                  description="Activity feed items appear when modules emit real cross-module activity events."
                />
              ) : (
                <div className="data-list">
                  {dashboard.activityFeedPreview.map((item) => (
                    <div key={item.id} className="data-list-item">
                      <strong>{item.title}</strong>
                      <span>
                        {formatStatus(item.feedScope)} · {item.moduleKey} ·{' '}
                        {formatStatus(item.eventType)} ·{' '}
                        {new Date(item.occurredAt).toLocaleString()}
                      </span>
                      {item.description ? <p>{item.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'saved' ? (
            <Panel title="Saved Searches">
              {dashboard.savedSearches.length === 0 ? (
                <EmptyState
                  title="No saved searches"
                  description="Save frequently used queries from the Search tab."
                />
              ) : (
                <div className="data-list">
                  {dashboard.savedSearches.map((saved) => (
                    <div key={saved.id} className="data-list-item">
                      <strong>{saved.name}</strong>
                      <span>
                        {saved.query} · {formatSearchMode(saved.searchMode)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {dashboard.recentSearches.length > 0 ? (
                <>
                  <h3>Recent Searches</h3>
                  <div className="data-list">
                    {dashboard.recentSearches.map((recent) => (
                      <div key={recent.id} className="data-list-item">
                        <strong>{recent.query}</strong>
                        <span>
                          {formatSearchMode(recent.searchMode)} · {recent.resultCount} result(s) ·{' '}
                          {new Date(recent.searchedAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'relationships' ? (
            <Panel title="Relationship Intelligence">
              {dashboard.relationshipPreview.length === 0 ? (
                <EmptyState
                  title="No relationship links"
                  description="Relationships are derived from real customer-to-job, quote, invoice, and document links."
                />
              ) : (
                <div className="data-list">
                  {dashboard.relationshipPreview.map((link) => (
                    <div key={link.id} className="data-list-item">
                      <strong>
                        {formatEntityType(link.fromEntityType)} →{' '}
                        {formatEntityType(link.toEntityType)}
                      </strong>
                      <span>
                        {formatStatus(link.relationshipType)} · {link.sourceModule}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'ai_search' ? (
            <>
              <Panel title="AI-Assisted Search Suggestions">
                {dashboard.searchSuggestions.length === 0 ? (
                  <EmptyState
                    title="No suggestions"
                    description="AI-assisted search suggestions appear when the Search Intelligence agent recommends queries."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.searchSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="data-list-item">
                        <strong>{suggestion.suggestionText}</strong>
                        <span>
                          {formatStatus(suggestion.suggestionType)}
                          {suggestion.entityType
                            ? ` · ${formatEntityType(suggestion.entityType)}`
                            : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Natural Language Examples">
                <p>Use the AI Assistant tab to ask questions such as:</p>
                <ul>
                  <li>Show unpaid invoices for ABC.</li>
                  <li>Find all jobs completed this week.</li>
                  <li>Show every interaction with this customer.</li>
                  <li>Find warranty documents expiring next month.</li>
                </ul>
              </Panel>
            </>
          ) : null}

          {activeTab === 'analytics' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Indexed Records"
                  value={String(dashboard.searchHealth.indexedCount)}
                />
                <StatCard
                  label="Pending Index"
                  value={String(dashboard.searchHealth.pendingIndexCount)}
                />
                <StatCard
                  label="Failed Index"
                  value={String(dashboard.searchHealth.failedIndexCount)}
                />
                <StatCard
                  label="Timeline Events"
                  value={String(dashboard.searchHealth.timelineEntryCount)}
                />
                <StatCard
                  label="Activity Items"
                  value={String(dashboard.searchHealth.activityFeedCount)}
                />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
              </div>
              <Panel title="Latest Analytics Snapshot">
                {dashboard.analytics ? (
                  <pre>{JSON.stringify(dashboard.analytics.metrics, null, 2)}</pre>
                ) : (
                  <EmptyState
                    title="No analytics captured"
                    description="Capture analytics to record search metrics."
                  />
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'settings' ? (
            <Panel title="Platform Settings">
              <div className="data-list">
                <div className="data-list-item">
                  <strong>Index Status</strong>
                  <span>{formatStatus(dashboard.searchHealth.indexStatus)}</span>
                </div>
                <div className="data-list-item">
                  <strong>Audit Retention</strong>
                  <span>{dashboard.platformConfig.auditRetentionDays} days</span>
                </div>
                <div className="data-list-item">
                  <strong>Overall Health</strong>
                  <span>{formatStatus(dashboard.overallSearchHealthStatus)}</span>
                </div>
              </div>
              {dashboard.recentAlerts.length > 0 ? (
                <>
                  <h3>Search Alerts</h3>
                  <div className="data-list">
                    {dashboard.recentAlerts.map((alert) => (
                      <div key={alert.id} className="data-list-item">
                        <strong>{alert.title}</strong>
                        <span>
                          {formatSeverity(alert.severity)} · {formatStatus(alert.status)}
                        </span>
                        {alert.description ? <p>{alert.description}</p> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'audit' ? (
            <Panel title="Audit Log">
              {isSupplementaryLoading ? (
                <p>Loading audit logs…</p>
              ) : auditLogs.length === 0 ? (
                <EmptyState
                  title="No audit entries"
                  description="Global search actions are fully auditable."
                />
              ) : (
                <div className="data-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{formatStatus(log.actionType)}</strong>
                      <span>
                        {log.entityType ?? 'system'} · {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Search Intelligence Agent">
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
                    'search_intelligence' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about search results, timelines, activity feeds, or draft search reports…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
