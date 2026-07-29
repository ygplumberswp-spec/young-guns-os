import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { DmEntityType, DmImportJobDetailSummary, DmSourceFormat, EnterpriseDataMigrationDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveImportJob,
  autoMapImportJob,
  captureDataMigrationAnalytics,
  createExportJob,
  createImportJob,
  executeExportJob,
  executeImportJob,
  fetchDataMigrationAuditLogs,
  fetchDataMigrationDashboard,
  fetchImportJobDetail,
  syncMigrationAlerts,
  uploadImportFile,
  validateImportJob,
} from '../../lib/enterprise-data-migration-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessDataMigration,
  canApproveDataMigration,
  canManageDataMigration,
  formatEntityType,
  formatSeverity,
  formatSourceFormat,
  formatStatus,
} from '../../features/data-migration/utils';

type DataMigrationTab =
  | 'overview'
  | 'wizard'
  | 'mapping'
  | 'validation'
  | 'duplicates'
  | 'export'
  | 'history'
  | 'rollback'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'assistant';

export function DataMigrationPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DataMigrationTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseDataMigrationDashboard | null>(null);
  const [selectedImportJob, setSelectedImportJob] = useState<DmImportJobDetailSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchDataMigrationAuditLogs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [wizardTitle, setWizardTitle] = useState('Customer import');
  const [wizardFormat, setWizardFormat] = useState<DmSourceFormat>('csv');
  const [wizardEntity, setWizardEntity] = useState<DmEntityType>('customer');
  const [wizardFileName, setWizardFileName] = useState('customers.csv');
  const [wizardFileContent, setWizardFileContent] = useState('name,email,phone\nAcme Corp,acme@example.com,555-0100');

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessDataMigration(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDataMigration(user.permissions) : false), [user]);
  const canApprove = useMemo(() => (user ? canApproveDataMigration(user.permissions) : false), [user]);

  const tabs: Array<{ id: DataMigrationTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'wizard', label: 'Import Wizard' },
    { id: 'mapping', label: 'Mapping' },
    { id: 'validation', label: 'Validation' },
    { id: 'duplicates', label: 'Duplicate Review' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
    { id: 'rollback', label: 'Rollback' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchDataMigrationDashboard(accessToken);
    setDashboard(data);
    if (data.importJobs[0]) {
      const detail = await fetchImportJobDetail(accessToken, data.importJobs[0].id);
      setSelectedImportJob(detail);
    }
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load data migration dashboard');
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
        const logs = await fetchDataMigrationAuditLogs(accessToken!);
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

  async function runWizardStep(action: () => Promise<unknown>, successMessage: string) {
    await runAction(action, successMessage);
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader title="Data Migration" description="You do not have permission to view data migration." />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Data Migration"
        description="Enterprise data import, export, and migration — built on existing CRM, Finance, Jobs, Inventory, Fleet, and Integration services. No fake imports or demo migration jobs."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => syncMigrationAlerts(accessToken!), 'Migration alerts synced.')}
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => captureDataMigrationAnalytics(accessToken!), 'Analytics captured.')
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
        <Panel title="Loading">Loading data migration dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Data migration dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard label="Active Imports" value={String(dashboard.migrationHealth.activeImportCount)} />
                <StatCard label="Failed Imports" value={String(dashboard.migrationHealth.failedImportCount)} />
                <StatCard label="Rollback Available" value={String(dashboard.migrationHealth.rollbackAvailableCount)} />
                <StatCard label="Active Exports" value={String(dashboard.migrationHealth.activeExportCount)} />
                <StatCard label="Failed Exports" value={String(dashboard.migrationHealth.failedExportCount)} />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
              </div>
              <Panel title="Summary">
                <p>{dashboard.summary}</p>
              </Panel>
            </>
          ) : null}

          {activeTab === 'wizard' ? (
            <Panel title="Import Wizard">
              <div className="form-stack">
                <label>
                  Title
                  <input value={wizardTitle} onChange={(e) => setWizardTitle(e.target.value)} />
                </label>
                <label>
                  Source format
                  <select value={wizardFormat} onChange={(e) => setWizardFormat(e.target.value as DmSourceFormat)}>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel (CSV-compatible)</option>
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                  </select>
                </label>
                <label>
                  Entity type
                  <select value={wizardEntity} onChange={(e) => setWizardEntity(e.target.value as DmEntityType)}>
                    <option value="customer">Customer</option>
                    <option value="lead">Lead</option>
                    <option value="supplier">Supplier</option>
                    <option value="inventory">Inventory</option>
                  </select>
                </label>
                <label>
                  File name
                  <input value={wizardFileName} onChange={(e) => setWizardFileName(e.target.value)} />
                </label>
                <label>
                  File content
                  <textarea rows={6} value={wizardFileContent} onChange={(e) => setWizardFileContent(e.target.value)} />
                </label>
                {canWrite ? (
                  <div className="page-header-actions">
                    <Button
                      disabled={isWorking}
                      onClick={() =>
                        void runWizardStep(async () => {
                          const job = await createImportJob(accessToken!, {
                            title: wizardTitle,
                            sourceFormat: wizardFormat,
                            entityType: wizardEntity,
                          });
                          await uploadImportFile(accessToken!, job.id, {
                            fileName: wizardFileName,
                            fileContent: wizardFileContent,
                          });
                          await autoMapImportJob(accessToken!, job.id);
                          await validateImportJob(accessToken!, job.id);
                        }, 'Import wizard steps completed through validation.')
                      }
                    >
                      Run Wizard Through Validation
                    </Button>
                    {canApprove && selectedImportJob ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runWizardStep(
                              () => approveImportJob(accessToken!, selectedImportJob.id),
                              'Import approved.',
                            )
                          }
                        >
                          Approve Latest Import
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runWizardStep(
                              () => executeImportJob(accessToken!, selectedImportJob.id),
                              'Import executed.',
                            )
                          }
                        >
                          Execute Latest Import
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {activeTab === 'mapping' ? (
            <Panel title="Field Mappings">
              {!selectedImportJob || selectedImportJob.fieldMappingDetails.length === 0 ? (
                <EmptyState title="No mappings" description="Run the import wizard to generate AI-suggested field mappings." />
              ) : (
                <div className="data-list">
                  {selectedImportJob.fieldMappingDetails.map((mapping) => (
                    <div key={mapping.id} className="data-list-item">
                      <strong>{mapping.sourceField} → {mapping.targetField}</strong>
                      <span>
                        {mapping.aiSuggested ? 'AI suggested' : 'Manual'}
                        {mapping.confidence != null ? ` · ${Math.round(mapping.confidence * 100)}% confidence` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'validation' ? (
            <Panel title="Validation Results">
              {!selectedImportJob || selectedImportJob.validationResults.length === 0 ? (
                <EmptyState title="No validation issues" description="Validation runs after mapping and before import approval." />
              ) : (
                <div className="data-list">
                  {selectedImportJob.validationResults.map((result) => (
                    <div key={result.id} className="data-list-item">
                      <strong>Row {result.rowNumber}: {result.message}</strong>
                      <span>{formatSeverity(result.severity)} · {result.errorCode}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'duplicates' ? (
            <Panel title="Duplicate Review">
              {!selectedImportJob || selectedImportJob.duplicateReviews.length === 0 ? (
                <EmptyState title="No duplicates" description="Duplicate detection runs during validation using configurable rules." />
              ) : (
                <div className="data-list">
                  {selectedImportJob.duplicateReviews.map((review) => (
                    <div key={review.id} className="data-list-item">
                      <strong>Row {review.rowNumber}: {review.duplicateKey}</strong>
                      <span>
                        Proposed: {formatStatus(review.proposedAction)}
                        {review.resolvedAction ? ` · Resolved: ${formatStatus(review.resolvedAction)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'export' ? (
            <Panel title="Export Jobs">
              {dashboard.exportJobs.length === 0 ? (
                <EmptyState title="No export jobs" description="Create an export job to export real module records." />
              ) : (
                <div className="data-list">
                  {dashboard.exportJobs.map((job) => (
                    <div key={job.id} className="data-list-item">
                      <strong>{job.title}</strong>
                      <span>
                        {formatStatus(job.status)} · {job.entityType ? formatEntityType(job.entityType) : job.exportScope} ·{' '}
                        {formatSourceFormat(job.sourceFormat)} · {job.recordCount} record(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {canWrite ? (
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(async () => {
                      const job = await createExportJob(accessToken!, {
                        title: 'Customer export',
                        entityType: 'customer',
                        sourceFormat: 'csv',
                      });
                      await executeExportJob(accessToken!, (job as { id: string }).id);
                    }, 'Export job created and executed.')
                  }
                >
                  Export Customers
                </Button>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'history' ? (
            <Panel title="Migration History">
              {dashboard.migrationHistory.length === 0 ? (
                <EmptyState title="No history" description="Import and export history appears after approved migration actions." />
              ) : (
                <div className="data-list">
                  {dashboard.migrationHistory.map((entry) => (
                    <div key={entry.id} className="data-list-item">
                      <strong>{entry.summary}</strong>
                      <span>
                        {formatStatus(entry.actionType)} · {new Date(entry.occurredAt).toLocaleString()}
                        {entry.rollbackAvailable ? ' · Rollback available' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'rollback' ? (
            <Panel title="Rollback Requests">
              {dashboard.rollbackRequests.length === 0 ? (
                <EmptyState
                  title="No rollback requests"
                  description="Rollback is available for supported imports and requires explicit approval. Production records are never silently deleted."
                />
              ) : (
                <div className="data-list">
                  {dashboard.rollbackRequests.map((request) => (
                    <div key={request.id} className="data-list-item">
                      <strong>{formatStatus(request.status)}</strong>
                      <span>{request.recordsAffected} record(s) · {new Date(request.createdAt).toLocaleString()}</span>
                      {request.reason ? <p>{request.reason}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Migration Analytics">
              {dashboard.analytics ? (
                <pre>{JSON.stringify(dashboard.analytics.metrics, null, 2)}</pre>
              ) : (
                <EmptyState title="No analytics" description="Capture analytics to record migration metrics." />
              )}
            </Panel>
          ) : null}

          {activeTab === 'audit' ? (
            <Panel title="Audit Log">
              {isSupplementaryLoading ? (
                <p>Loading audit logs…</p>
              ) : auditLogs.length === 0 ? (
                <EmptyState title="No audit entries" description="All migration actions are fully auditable." />
              ) : (
                <div className="data-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{formatStatus(log.actionType)}</strong>
                      <span>{log.entityType ?? 'system'} · {new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <Panel title="Platform Settings">
              <div className="data-list">
                <div className="data-list-item">
                  <strong>Audit Retention</strong>
                  <span>{dashboard.platformConfig.auditRetentionDays} days</span>
                </div>
                <div className="data-list-item">
                  <strong>Overall Health</strong>
                  <span>{formatStatus(dashboard.overallMigrationHealthStatus)}</span>
                </div>
              </div>
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Migration Intelligence Agent">
              {assistantError ? <p className="form-error">{assistantError}</p> : null}
              <AuraMessageList messages={agentMessages} isSending={isSending} />
              {pendingTasks.map((task) => (
                <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
              ))}
              <AuraComposer
                disabled={isSending}
                onSend={(content) =>
                  void sendAgentMessage(content, 'migration_intelligence' as import('@titan/shared').AgentKey)
                }
                placeholder="Ask about import mappings, validation errors, migration history, or draft migration reports…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
