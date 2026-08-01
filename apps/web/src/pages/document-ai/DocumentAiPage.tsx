import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseDocumentAiDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureDocumentAiAnalytics,
  fetchDocumentAiAuditLogs,
  fetchDocumentAiDashboard,
  searchDocuments,
  syncDocumentAlerts,
} from '../../lib/enterprise-document-ai-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessDocumentAi,
  canManageDocumentAi,
  formatClassificationKey,
  formatConfidence,
  formatFileSize,
  formatSeverity,
  formatStatus,
} from '../../features/document-ai/utils';

type DocumentAiTab =
  | 'overview'
  | 'inbox'
  | 'ocr-queue'
  | 'review-queue'
  | 'classifications'
  | 'templates'
  | 'search'
  | 'intelligence'
  | 'workflows'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'assistant';

export function DocumentAiPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DocumentAiTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseDocumentAiDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchDocumentAiAuditLogs>>>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchDocuments>>>(
    [],
  );
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

  const canView = useMemo(() => (user ? canAccessDocumentAi(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocumentAi(user.permissions) : false), [user]);

  const tabs: Array<{ id: DocumentAiTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'ocr-queue', label: 'OCR Queue' },
    { id: 'review-queue', label: 'Review Queue' },
    { id: 'classifications', label: 'Classifications' },
    { id: 'templates', label: 'Templates' },
    { id: 'search', label: 'Search' },
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchDocumentAiDashboard(accessToken);
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
            err instanceof ApiClientError ? err.message : 'Unable to load document AI dashboard',
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
        const logs = await fetchDocumentAiAuditLogs(accessToken!);
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

  async function handleSearch() {
    if (!accessToken || !searchQuery.trim()) return;
    setIsWorking(true);
    setError(null);
    try {
      const results = await searchDocuments(accessToken, searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Search failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Document AI"
          description="You do not have permission to view document AI."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Document AI"
        description="Enterprise document AI, OCR, classification, extraction, and intelligent processing — built on existing documents and knowledge services. No fake OCR or demo data."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncDocumentAlerts(accessToken!), 'Document alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureDocumentAiAnalytics(accessToken!),
                    'Analytics captured.',
                  )
                }
              >
                Capture Analytics
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
        <Panel title="Loading">Loading document AI dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Document AI dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Documents"
                  value={String(dashboard.documentsStats.documentCount)}
                />
                <StatCard
                  label="OCR Pending"
                  value={String(dashboard.processingHealth.pendingOcrCount)}
                />
                <StatCard
                  label="Review Backlog"
                  value={String(dashboard.processingHealth.reviewBacklogCount)}
                />
                <StatCard
                  label="Failed OCR"
                  value={String(dashboard.processingHealth.failedOcrCount)}
                />
                <StatCard
                  label="OCR Health"
                  value={formatStatus(dashboard.processingHealth.ocrHealthStatus)}
                />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
              </div>
              <Panel title="Summary">
                <p>{dashboard.summary}</p>
              </Panel>
              {dashboard.recentAlerts.length > 0 ? (
                <Panel title="Recent Alerts">
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
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'inbox' ? (
            <Panel title="Document Inbox">
              {dashboard.inboxDocuments.length === 0 ? (
                <EmptyState
                  title="No documents"
                  description="Uploaded documents appear here from real document records."
                />
              ) : (
                <div className="data-list">
                  {dashboard.inboxDocuments.map((doc) => (
                    <div key={doc.id} className="data-list-item">
                      <strong>{doc.title}</strong>
                      <span>
                        {doc.fileName} · {formatFileSize(doc.fileSizeBytes)}
                      </span>
                      <span>
                        {doc.categoryName ?? 'Uncategorised'} ·{' '}
                        {new Date(doc.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'ocr-queue' ? (
            <Panel title="OCR Queue">
              {dashboard.ocrQueue.length === 0 ? (
                <EmptyState
                  title="No OCR jobs"
                  description="OCR jobs appear here when queued for real documents."
                />
              ) : (
                <div className="data-list">
                  {dashboard.ocrQueue.map((job) => (
                    <div key={job.id} className="data-list-item">
                      <strong>{job.documentTitle ?? job.documentId.slice(0, 8)}</strong>
                      <span>
                        {formatStatus(job.status)} · {job.sourceKey ?? 'upload'}
                      </span>
                      {job.errorMessage ? <p>{job.errorMessage}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'review-queue' ? (
            <Panel title="Review Queue">
              {dashboard.reviewQueue.length === 0 ? (
                <EmptyState
                  title="No review items"
                  description="Low-confidence extractions and matches create review tasks."
                />
              ) : (
                <div className="data-list">
                  {dashboard.reviewQueue.map((item) => (
                    <div key={item.id} className="data-list-item">
                      <strong>{item.title}</strong>
                      <span>
                        {formatStatus(item.reviewType)} · {formatStatus(item.status)}
                      </span>
                      {item.description ? <p>{item.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'classifications' ? (
            <Panel title="Classifications">
              {dashboard.classifications.length === 0 ? (
                <EmptyState
                  title="No classifications"
                  description="Document classifications appear after processing real documents."
                />
              ) : (
                <div className="data-list">
                  {dashboard.classifications.map((record) => (
                    <div key={record.id} className="data-list-item">
                      <strong>{record.documentTitle ?? record.documentId.slice(0, 8)}</strong>
                      <span>
                        {formatClassificationKey(record.classificationKey)} ·{' '}
                        {formatConfidence(record.confidenceScore)}
                      </span>
                      {record.manuallyCorrected ? <span>Manually corrected</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'templates' ? (
            <Panel title="Extraction Templates">
              {dashboard.extractionTemplates.length === 0 ? (
                <EmptyState
                  title="No templates"
                  description="Configure extraction templates for structured field capture."
                />
              ) : (
                <div className="data-list">
                  {dashboard.extractionTemplates.map((template) => (
                    <div key={template.id} className="data-list-item">
                      <strong>{template.name}</strong>
                      <span>{template.templateKey}</span>
                      {template.classificationKey ? (
                        <span>{formatClassificationKey(template.classificationKey)}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'search' ? (
            <Panel title="Document Search">
              <div className="form-row">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search OCR text, summaries, tags, classifications…"
                />
                <Button
                  variant="secondary"
                  disabled={isWorking || !searchQuery.trim()}
                  onClick={() => void handleSearch()}
                >
                  Search
                </Button>
              </div>
              {searchResults.length === 0 ? (
                <p>Search indexed document content. Results respect RBAC and tenant isolation.</p>
              ) : (
                <div className="data-list">
                  {searchResults.map(
                    (result: {
                      documentId: string;
                      documentTitle?: string | null;
                      matchedText?: string | null;
                    }) => (
                      <div key={result.documentId} className="data-list-item">
                        <strong>{result.documentTitle ?? result.documentId.slice(0, 8)}</strong>
                        {result.matchedText ? <p>{result.matchedText}</p> : null}
                      </div>
                    ),
                  )}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'intelligence' ? (
            <Panel title="Document Intelligence">
              {dashboard.intelligenceRecords.length === 0 ? (
                <EmptyState
                  title="No intelligence records"
                  description="Summaries, expiry alerts, and duplicate detection appear from real document analysis."
                />
              ) : (
                <div className="data-list">
                  {dashboard.intelligenceRecords.map((record) => (
                    <div key={record.id} className="data-list-item">
                      <strong>{record.title}</strong>
                      <span>
                        {formatStatus(record.intelligenceType)} · {formatSeverity(record.severity)}
                      </span>
                      <p>{record.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'workflows' ? (
            <Panel title="Workflow Drafts">
              {dashboard.workflowDrafts.length === 0 ? (
                <EmptyState
                  title="No workflow drafts"
                  description="Approved documents can create draft actions requiring human approval."
                />
              ) : (
                <div className="data-list">
                  {dashboard.workflowDrafts.map((draft) => (
                    <div key={draft.id} className="data-list-item">
                      <strong>{draft.title}</strong>
                      <span>{formatStatus(draft.draftType)} · Requires approval</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Analytics">
              <div className="stat-grid">
                <StatCard label="Search Index" value={String(dashboard.searchIndexCount)} />
                <StatCard
                  label="Classifications"
                  value={String(dashboard.classifications.length)}
                />
                <StatCard label="Extractions" value={String(dashboard.extractionRecords.length)} />
                <StatCard
                  label="Expiring Docs"
                  value={String(dashboard.processingHealth.expiringDocumentCount)}
                />
              </div>
              {dashboard.analytics ? (
                <pre>{JSON.stringify(dashboard.analytics.metrics, null, 2)}</pre>
              ) : (
                <p>Capture analytics to store a snapshot from real document processing data.</p>
              )}
            </Panel>
          ) : null}

          {activeTab === 'audit' ? (
            <Panel title="Audit Log">
              {isSupplementaryLoading ? <p>Loading audit logs…</p> : null}
              {auditLogs.length === 0 ? (
                <EmptyState
                  title="No audit logs"
                  description="Document AI actions are recorded for complete auditability."
                />
              ) : (
                <div className="data-list">
                  {auditLogs.slice(0, 20).map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{formatStatus(log.actionType)}</strong>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <>
              <Panel title="OCR Providers">
                <div className="data-list">
                  {dashboard.ocrProviders.map((provider) => (
                    <div key={provider.id} className="data-list-item">
                      <strong>{provider.name}</strong>
                      <span>
                        {provider.providerKey} · {provider.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Document Sources">
                <div className="data-list">
                  {dashboard.sourceConfigs.map((source) => (
                    <div key={source.id} className="data-list-item">
                      <strong>{source.name}</strong>
                      <span>
                        {source.sourceKey} · {source.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Document Intelligence Agent">
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
                    'document_intelligence' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about documents, OCR, classifications, review queue, or draft summaries and workflow actions…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
