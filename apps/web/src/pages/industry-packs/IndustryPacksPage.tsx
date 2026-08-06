import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  EnterpriseIndustryPackDashboard,
  IpCertificateSummary,
  IpComplianceFrameworkSummary,
  IpEquipmentCatalogSummary,
  IpPackCatalogSummary,
  IpPackInstallationSummary,
  IpTemplateSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureIndustryAnalytics,
  fetchComplianceFrameworks,
  fetchEquipmentCatalog,
  fetchIndustryCertificates,
  fetchIndustryPacksDashboard,
  fetchIndustryTemplates,
  fetchInstalledPacks,
  fetchMarketplacePacks,
  installIndustryPack,
  syncIndustryAlerts,
} from '../../lib/enterprise-industry-packs-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessIndustryPacks,
  canManageIndustryPacks,
  formatSeverity,
  formatStatus,
} from '../../features/industry-packs/utils';

type IndustryPacksTab =
  | 'overview'
  | 'installed-packs'
  | 'marketplace'
  | 'templates'
  | 'compliance'
  | 'certificates'
  | 'equipment'
  | 'reports'
  | 'analytics'
  | 'settings'
  | 'pack-builder'
  | 'assistant';

export function IndustryPacksPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<IndustryPacksTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseIndustryPackDashboard | null>(null);
  const [marketplacePacks, setMarketplacePacks] = useState<IpPackCatalogSummary[]>([]);
  const [installedPacks, setInstalledPacks] = useState<IpPackInstallationSummary[]>([]);
  const [templates, setTemplates] = useState<IpTemplateSummary[]>([]);
  const [complianceFrameworks, setComplianceFrameworks] = useState<IpComplianceFrameworkSummary[]>(
    [],
  );
  const [certificates, setCertificates] = useState<IpCertificateSummary[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<IpEquipmentCatalogSummary[]>([]);
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

  const canView = useMemo(() => (user ? canAccessIndustryPacks(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageIndustryPacks(user.permissions) : false), [user]);

  const tabs: Array<{ id: IndustryPacksTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'installed-packs', label: 'Installed Packs' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'templates', label: 'Templates' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'reports', label: 'Reports' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'pack-builder', label: 'Pack Builder' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchIndustryPacksDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load industry packs dashboard',
          );
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

  useEffect(() => {
    if (!accessToken || !canView) return;

    const loaders: Partial<Record<IndustryPacksTab, () => Promise<void>>> = {
      'installed-packs': async () => {
        setInstalledPacks(await fetchInstalledPacks(accessToken));
      },
      marketplace: async () => {
        setMarketplacePacks(await fetchMarketplacePacks(accessToken));
      },
      templates: async () => {
        setTemplates(await fetchIndustryTemplates(accessToken));
      },
      compliance: async () => {
        setComplianceFrameworks(await fetchComplianceFrameworks(accessToken));
      },
      certificates: async () => {
        setCertificates(await fetchIndustryCertificates(accessToken));
      },
      equipment: async () => {
        setEquipmentCatalog(await fetchEquipmentCatalog(accessToken));
      },
    };

    const loader = loaders[activeTab];
    if (!loader) return;

    let cancelled = false;
    async function load() {
      setIsSupplementaryLoading(true);
      try {
        await loader!();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load tab data');
        }
      } finally {
        if (!cancelled) setIsSupplementaryLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab]);

  async function refreshDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchIndustryPacksDashboard(accessToken));
  }

  async function runAction(action: () => Promise<void>, message: string) {
    setIsWorking(true);
    setError(null);
    try {
      await action();
      await refreshDashboard();
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
        <EmptyState
          title="Access Denied"
          description="You do not have permission to view industry packs."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Industry Packs"
        description="Modular vertical solutions, trade intelligence, compliance, certificates, and industry templates."
        actions={
          <div className="page-header-actions">
            <Link href="/app-builder">
              <Button variant="secondary">App Builder</Button>
            </Link>
            <Link href="/mission-control">
              <Button variant="secondary">Mission Control</Button>
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
            onClick={() => {
              setActiveTab(tab.id);
              setSuccess(null);
              setError(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <p>Loading industry packs...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Installed Packs" value={String(dashboard.installedPackCount)} />
            <StatCard label="Marketplace Packs" value={String(dashboard.marketplacePackCount)} />
            <StatCard label="Templates" value={String(dashboard.templateCount)} />
            <StatCard
              label="Compliance Frameworks"
              value={String(dashboard.complianceFrameworkCount)}
            />
            <StatCard label="Certificates" value={String(dashboard.certificateCount)} />
            <StatCard label="Equipment Catalog" value={String(dashboard.equipmentCatalogCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Health" value={dashboard.overallIndustryHealthStatus} />
          </div>
          <Panel
            title="Industry Monitoring"
            description={
              dashboard.industryMonitoring.alerts.join(' · ') || 'No active industry signals'
            }
          >
            <p>{dashboard.summary}</p>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(async () => {
                      await syncIndustryAlerts(accessToken!);
                    }, 'Industry alerts synced.')
                  }
                >
                  Sync Alerts
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(async () => {
                      await captureIndustryAnalytics(accessToken!);
                    }, 'Analytics captured.')
                  }
                >
                  Capture Analytics
                </Button>
              </div>
            ) : null}
          </Panel>
          {dashboard.recentAlerts.length > 0 ? (
            <Panel title="Recent Alerts">
              <div className="data-list">
                {dashboard.recentAlerts.map((alert) => (
                  <div key={alert.id} className="data-list-item">
                    <strong>{alert.title}</strong>
                    <span className="status-pill">{formatSeverity(alert.severity)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      {activeTab === 'installed-packs' ? (
        <Panel title="Installed Packs">
          {isSupplementaryLoading ? (
            <p>Loading installed packs...</p>
          ) : installedPacks.length === 0 ? (
            <EmptyState
              title="No Installed Packs"
              description="Install industry packs from the marketplace."
            />
          ) : (
            <div className="data-list">
              {installedPacks.map((pack) => (
                <div key={pack.id} className="data-list-item">
                  <strong>{pack.packName}</strong>
                  <span className="status-pill">{formatStatus(pack.status)}</span>
                  <p>
                    {pack.packKey} · v{pack.installedVersion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'marketplace' ? (
        <Panel title="Marketplace">
          {isSupplementaryLoading ? (
            <p>Loading marketplace...</p>
          ) : marketplacePacks.length === 0 ? (
            <EmptyState
              title="No Marketplace Packs"
              description="Built-in industry packs will appear here."
            />
          ) : (
            <div className="data-list">
              {marketplacePacks.map((pack) => (
                <div key={pack.id} className="data-list-item">
                  <strong>{pack.name}</strong>
                  <p>{pack.description}</p>
                  {canWrite ? (
                    <Button
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          await installIndustryPack(accessToken!, pack.id);
                          setInstalledPacks(await fetchInstalledPacks(accessToken!));
                          setMarketplacePacks(await fetchMarketplacePacks(accessToken!));
                        }, `${pack.name} installed.`)
                      }
                    >
                      Install
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'templates' ? (
        <Panel title="Templates">
          {isSupplementaryLoading ? (
            <p>Loading templates...</p>
          ) : templates.length === 0 ? (
            <EmptyState
              title="No Templates"
              description="Create job, inspection, quote, and workflow templates per installed pack."
            />
          ) : (
            <div className="data-list">
              {templates.map((template) => (
                <div key={template.id} className="data-list-item">
                  <strong>{template.name}</strong>
                  <span className="status-pill">{formatStatus(template.templateType)}</span>
                  <p>{formatStatus(template.workflowStatus)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'compliance' ? (
        <Panel title="Compliance Frameworks">
          {isSupplementaryLoading ? (
            <p>Loading compliance frameworks...</p>
          ) : complianceFrameworks.length === 0 ? (
            <EmptyState
              title="No Compliance Frameworks"
              description="Configure country and industry-specific compliance frameworks."
            />
          ) : (
            <div className="data-list">
              {complianceFrameworks.map((framework) => (
                <div key={framework.id} className="data-list-item">
                  <strong>{framework.name}</strong>
                  <span className="status-pill">{formatStatus(framework.workflowStatus)}</span>
                  <p>
                    {[framework.countryCode, framework.regulatoryBody]
                      .filter(Boolean)
                      .join(' · ') || 'Configurable framework'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'certificates' ? (
        <Panel title="Certificates">
          {isSupplementaryLoading ? (
            <p>Loading certificates...</p>
          ) : certificates.length === 0 ? (
            <EmptyState
              title="No Certificates"
              description="Certificates are generated from real completed work only."
            />
          ) : (
            <div className="data-list">
              {certificates.map((certificate) => (
                <div key={certificate.id} className="data-list-item">
                  <strong>{certificate.title}</strong>
                  <span className="status-pill">{formatStatus(certificate.status)}</span>
                  <p>{formatStatus(certificate.certificateType)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'equipment' ? (
        <Panel title="Equipment Catalog">
          {isSupplementaryLoading ? (
            <p>Loading equipment catalog...</p>
          ) : equipmentCatalog.length === 0 ? (
            <EmptyState
              title="No Equipment Catalog Entries"
              description="Add industry-specific equipment catalogs with manufacturers, models, and service intervals."
            />
          ) : (
            <div className="data-list">
              {equipmentCatalog.map((entry) => (
                <div key={entry.id} className="data-list-item">
                  <strong>{entry.manufacturer ?? entry.equipmentKey}</strong>
                  <span className="status-pill">{formatStatus(entry.workflowStatus)}</span>
                  <p>{entry.model ?? entry.category ?? 'Equipment entry'}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'reports' ? (
        <Panel title="Reports">
          <EmptyState
            title="Industry Report Templates"
            description="Report templates are managed per installed pack. Create templates via Templates or ask the Industry Intelligence agent."
          />
        </Panel>
      ) : null}

      {activeTab === 'analytics' && dashboard ? (
        <Panel title="Industry Analytics">
          <p>Industry KPIs derived from real tenant jobs, finance, and pack activity.</p>
          {dashboard.analytics ? (
            <pre className="code-block">{JSON.stringify(dashboard.analytics.metrics, null, 2)}</pre>
          ) : (
            <EmptyState
              title="No Analytics Captured"
              description="Capture analytics to measure industry KPIs."
            />
          )}
        </Panel>
      ) : null}

      {activeTab === 'settings' && dashboard ? (
        <Panel title="Settings">
          <p>Audit retention: {dashboard.platformConfig.auditRetentionDays} days</p>
          <p>
            Marketplace, compliance, certificate, and pack builder policies are configurable via
            API.
          </p>
        </Panel>
      ) : null}

      {activeTab === 'pack-builder' ? (
        <Panel title="Pack Builder">
          <p>
            Build custom industry packs using the App Builder platform without modifying core TITAN
            code.
          </p>
          <Link href="/app-builder">
            <Button>Open App Builder</Button>
          </Link>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Industry Intelligence Agent"
          description="Industry pack guidance, template recommendations, and compliance drafts — no autonomous legal decisions"
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
                'industry_intelligence' as import('@titan/shared').AgentKey,
              )
            }
            placeholder="Ask about industry packs, compliance, templates, or certificates…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
