import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  EnterpriseKnowledgeGraphDashboard,
  KnowledgeSemanticSearchResult,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchKnowledgeGraphDashboard,
  generateKnowledgeGraphRecommendations,
  searchKnowledgeGraph,
  syncKnowledgeGraph,
} from '../../lib/knowledge-graph-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessKnowledgeGraph,
  canManageKnowledgeGraph,
  formatEntityType,
} from '../../features/knowledge-graph/utils';

type KnowledgeTab = 'dashboard' | 'graph' | 'search' | 'memory' | 'recommendations';

export function KnowledgeGraphPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('dashboard');
  const [dashboard, setDashboard] = useState<EnterpriseKnowledgeGraphDashboard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSemanticSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessKnowledgeGraph(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageKnowledgeGraph(user.permissions) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchKnowledgeGraphDashboard(accessToken);
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load knowledge graph');
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

  async function handleSyncGraph() {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await syncKnowledgeGraph(accessToken);
      await loadDashboard();
      setSuccess(
        `Graph synced — ${result.entityCount} entities, ${result.relationshipCount} new relationship(s).`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sync knowledge graph');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !searchQuery.trim()) return;
    setIsWorking(true);
    setError(null);
    try {
      const results = await searchKnowledgeGraph(accessToken, searchQuery.trim());
      setSearchResults(results);
      setActiveTab('search');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Search failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleGenerateRecommendations() {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await generateKnowledgeGraphRecommendations(accessToken);
      await loadDashboard();
      setSuccess('Knowledge recommendations generated from real indexed data.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to generate recommendations');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Knowledge Graph"
          description="You do not have permission to view the knowledge graph."
        />
      </div>
    );
  }

  const tabs: Array<{ id: KnowledgeTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'graph', label: 'Graph Explorer' },
    { id: 'search', label: 'Semantic Search' },
    { id: 'memory', label: 'Organizational Memory' },
    { id: 'recommendations', label: 'AI Recommendations' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Knowledge Graph"
        description="Tenant-isolated knowledge graph, semantic search, and organizational memory across your business."
        actions={
          canWrite ? (
            <Button disabled={isWorking} onClick={() => void handleSyncGraph()}>
              Sync graph
            </Button>
          ) : undefined
        }
      />

      <nav className="automation-nav" aria-label="Knowledge Graph Sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id
                ? 'automation-nav__link automation-nav__link--active'
                : 'automation-nav__link'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isLoading ? <p className="page-muted">Loading knowledge graph…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {dashboard && activeTab === 'dashboard' ? (
        <>
          <section className="stat-grid">
            <StatCard label="Graph Entities" value={String(dashboard.entityCount)} />
            <StatCard label="Relationships" value={String(dashboard.relationshipCount)} />
            <StatCard label="Memory Entries" value={String(dashboard.memoryEntryCount)} />
            <StatCard label="Indexed Records" value={String(dashboard.indexedCount)} />
            <StatCard
              label="Coverage"
              value={
                dashboard.coverage.coveragePercent != null
                  ? `${dashboard.coverage.coveragePercent}%`
                  : '—'
              }
            />
            <StatCard
              label="Published Articles"
              value={String(dashboard.knowledgeStats.publishedArticleCount)}
            />
            <StatCard label="Search Activity" value={String(dashboard.searchActivityCount)} />
            <StatCard label="Pending Actions" value={String(dashboard.pendingActionCount)} />
          </section>
          <p className="page-muted">{dashboard.summary}</p>
        </>
      ) : null}

      {dashboard && activeTab === 'graph' ? (
        <div className="analytics-page__grid">
          <Panel title="Indexed Entities">
            {dashboard.recentEntities.length === 0 ? (
              <EmptyState
                title="No Entities Indexed"
                description="Sync the graph to index real module data."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recentEntities.map((entity) => (
                  <li key={entity.id}>
                    <strong>{entity.label}</strong>
                    <span className="page-muted">
                      {' '}
                      · {formatEntityType(entity.entityType)} · {entity.classification}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Relationships">
            {dashboard.recentRelationships.length === 0 ? (
              <p className="page-muted">No relationships indexed yet.</p>
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recentRelationships.map((rel) => (
                  <li key={rel.id}>
                    <strong>{rel.sourceLabel ?? 'Source'}</strong> → {rel.targetLabel ?? 'Target'}
                    <span className="page-muted"> · {rel.relationshipType.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'search' ? (
        <>
          <form
            className="analytics-page__section-header"
            onSubmit={(event) => void handleSearch(event)}
          >
            <input
              className="form-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Natural language search across organizational memory…"
            />
            <Button type="submit" disabled={isWorking || !searchQuery.trim()}>
              Search
            </Button>
          </form>
          <Panel title="Search Results">
            {searchResults.length === 0 ? (
              <EmptyState
                title="No Results Yet"
                description="Run a hybrid semantic search query."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {searchResults.map((result) => (
                  <li key={`${result.resultType}-${result.id}`}>
                    <strong>{result.title}</strong>
                    <span className="page-muted">
                      {' '}
                      · {result.resultType} · score {result.relevanceScore} · {result.searchMode}
                    </span>
                    {result.summary ? <p className="page-muted">{result.summary}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'memory' ? (
        <Panel title="Organizational Memory">
          {dashboard.recentMemory.length === 0 ? (
            <EmptyState
              title="No Memory Entries Yet"
              description="Memory entries are created from real business records and user-authored content."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {dashboard.recentMemory.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span className="page-muted">
                    {' '}
                    · {formatEntityType(entry.memoryType)} · v{entry.versionNumber}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'recommendations' ? (
        <>
          {canWrite ? (
            <div className="analytics-page__section-header">
              <span className="page-muted">
                Recommendations from real knowledge coverage analysis.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isWorking}
                onClick={() => void handleGenerateRecommendations()}
              >
                Generate recommendations
              </Button>
            </div>
          ) : null}
          <Panel title="AI Knowledge Intelligence">
            {dashboard.recommendations.length === 0 ? (
              <EmptyState
                title="No Recommendations Yet"
                description="Generate recommendations when knowledge data is available."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recommendations.map((item) => (
                  <li key={item.id}>
                    <strong>
                      [{item.priority}] {item.title}
                    </strong>
                    <p className="page-muted">{item.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
