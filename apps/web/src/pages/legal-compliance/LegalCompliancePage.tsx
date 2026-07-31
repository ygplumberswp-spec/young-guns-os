import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseLegalComplianceDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveContract,
  captureLegalAnalytics,
  completeObligation,
  fetchLegalComplianceDashboard,
} from '../../lib/enterprise-legal-compliance-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessLegalCompliance,
  canManageLegalCompliance,
  formatContractStatus,
  formatRiskCategory,
} from '../../features/legal-compliance/utils';

type LegalComplianceTab =
  | 'overview'
  | 'contracts'
  | 'obligations'
  | 'compliance'
  | 'risks'
  | 'controls'
  | 'policies'
  | 'matters'
  | 'insurance'
  | 'privacy'
  | 'retention'
  | 'evidence'
  | 'providers'
  | 'analytics'
  | 'settings'
  | 'assistant';

export function LegalCompliancePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<LegalComplianceTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseLegalComplianceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    () => (user ? canAccessLegalCompliance(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageLegalCompliance(user.permissions) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchLegalComplianceDashboard(accessToken);
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
        const data = await fetchLegalComplianceDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load legal compliance dashboard',
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
          title="Legal & Compliance"
          description="You do not have permission to view legal compliance."
        />
      </div>
    );
  }

  const tabs: Array<{ id: LegalComplianceTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'obligations', label: 'Obligations' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'risks', label: 'Risks' },
    { id: 'controls', label: 'Controls' },
    { id: 'policies', label: 'Policies' },
    { id: 'matters', label: 'Legal Matters' },
    { id: 'insurance', label: 'Insurance' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'retention', label: 'Retention & Legal Holds' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'providers', label: 'Providers' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Legal & Compliance"
        description="Enterprise legal workspace, contracts, compliance, and risk management. Real tenant data only — not legal advice."
        actions={
          <div className="page-header-actions">
            <Link href="/documents">
              <Button variant="secondary">Documents</Button>
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
      {isLoading ? <p>Loading legal compliance...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Active Contracts" value={String(dashboard.activeContractCount)} />
            <StatCard label="Expiring Soon" value={String(dashboard.expiringContractCount)} />
            <StatCard
              label="Overdue Obligations"
              value={String(dashboard.overdueObligationCount)}
            />
            <StatCard label="Open Risks" value={String(dashboard.openRiskCount)} />
            <StatCard label="Open Legal Matters" value={String(dashboard.openLegalMatterCount)} />
            <StatCard
              label="Pending Privacy Requests"
              value={String(dashboard.pendingPrivacyRequestCount)}
            />
          </div>
          <Panel
            title="Compliance Monitoring"
            description={dashboard.complianceMonitoring.alerts.join(' · ') || 'No active alerts'}
          >
            <p>{dashboard.summary}</p>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureLegalAnalytics(accessToken!),
                      'Analytics captured from real legal data.',
                    )
                  }
                >
                  Capture Analytics
                </Button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'contracts' ? (
        <Panel title="Contracts" description="Draft → Review → Approval → Execution">
          {dashboard.recentContracts.length === 0 ? (
            <EmptyState
              title="No contracts"
              description="Contracts appear when created in the legal workspace."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentContracts.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong> — {formatContractStatus(c.status)} ({c.workflowStatus})
                  {c.counterpartyName ? ` · ${c.counterpartyName}` : ''}
                  {c.expiryDate ? ` · expires ${c.expiryDate}` : ''}
                  {canWrite && c.workflowStatus === 'pending_approval' ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => approveContract(accessToken!, c.id),
                          'Contract approved.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'obligations' ? (
        <Panel title="Obligations Register">
          {dashboard.recentObligations.length === 0 ? (
            <EmptyState
              title="No obligations"
              description="Obligations are created from contracts, policies, and regulations."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentObligations.map((o) => (
                <li key={o.id}>
                  {o.title} — {o.status}
                  {o.isOverdue ? ' (overdue)' : ''}
                  {o.dueDate ? ` · due ${o.dueDate}` : ''}
                  {canWrite && o.status !== 'completed' ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => completeObligation(accessToken!, o.id),
                          'Obligation completed.',
                        )
                      }
                    >
                      Complete
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'compliance' ? (
        <Panel
          title="Compliance Monitoring"
          description="Real records only — no fabricated compliance failures"
        >
          <ul className="simple-list">
            {dashboard.complianceMonitoring.alerts.length === 0 ? (
              <li>No compliance alerts from real tenant data.</li>
            ) : (
              dashboard.complianceMonitoring.alerts.map((alert) => <li key={alert}>{alert}</li>)
            )}
          </ul>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'risks' ? (
        <Panel title="Risk Register" description="Scores show inputs, formula, and methodology">
          {dashboard.recentRisks.length === 0 ? (
            <EmptyState
              title="No risks"
              description="Risks are registered when identified by authorized users."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentRisks.map((r) => (
                <li key={r.id}>
                  {r.title} — {formatRiskCategory(r.category)} ({r.status})
                  {r.inherentRiskScore != null ? ` · score ${r.inherentRiskScore}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'controls' ? (
        <Panel
          title="Internal Controls"
          description="Control tests and exceptions from real tenant records"
        >
          <p>
            {dashboard.controlCount} control(s), {dashboard.failedControlCount} failed.
          </p>
          {dashboard.failedControlCount === 0 ? (
            <p>No failed controls recorded.</p>
          ) : (
            <p>Review failed controls in compliance monitoring and remediate with evidence.</p>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'insurance' ? (
        <Panel title="Insurance & Claims">
          <p>
            {dashboard.insurancePolicyCount} insurance policy record(s), {dashboard.openClaimCount}{' '}
            open claim(s).
          </p>
          {dashboard.insurancePolicyCount === 0 && dashboard.openClaimCount === 0 ? (
            <EmptyState
              title="No insurance records"
              description="Policies and claims appear when logged in the legal workspace."
            />
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'policies' ? (
        <Panel title="Policies" description="Draft → Review → Approval → Publish">
          <p>
            {dashboard.publishedPolicyCount} published of {dashboard.policyCount} total.
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'matters' ? (
        <Panel title="Legal Matters">
          {dashboard.recentLegalMatters.length === 0 ? (
            <EmptyState
              title="No legal matters"
              description="Disputes, claims, and complaints appear when logged."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentLegalMatters.map((m) => (
                <li key={m.id}>
                  {m.title} — {m.matterType} ({m.status})
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'privacy' ? (
        <Panel title="Privacy Requests">
          {dashboard.pendingPrivacyRequests.length === 0 ? (
            <EmptyState
              title="No pending privacy requests"
              description="Data subject requests appear when submitted."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.pendingPrivacyRequests.map((p) => (
                <li key={p.id}>
                  {p.requestType} — {p.status}
                  {p.legalHoldBlocked ? ' (blocked by legal hold)' : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'retention' ? (
        <Panel
          title="Retention & Legal Holds"
          description="Record disposal follows Draft → Legal Review → Approval → Execution"
        >
          <p>{dashboard.activeLegalHoldCount} active legal hold(s).</p>
          {dashboard.activeLegalHoldCount === 0 ? (
            <EmptyState
              title="No active legal holds"
              description="Legal holds appear when placed on tenant records."
            />
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'evidence' ? (
        <Panel
          title="Evidence Register"
          description="Documents, approvals, signatures, and audit evidence with chain of custody"
        >
          {dashboard.documentStats ? (
            <p>
              {dashboard.documentStats.documentCount} linked document(s) in the document platform.
            </p>
          ) : (
            <EmptyState
              title="No evidence records"
              description="Evidence is registered when uploaded or linked to legal workflows."
            />
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'providers' ? (
        <Panel
          title="E-Signature Providers"
          description="Vendor-agnostic — DocuSign, Adobe Sign, manual upload, and more"
        >
          <p>{dashboard.signatureProviderCount} signature provider(s) configured.</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'analytics' ? (
        <Panel title="Analytics">
          {dashboard.analytics ? (
            <ul className="simple-list">
              <li>Active contracts: {dashboard.analytics.activeContractCount}</li>
              <li>Expiring: {dashboard.analytics.expiringContractCount}</li>
              <li>Overdue obligations: {dashboard.analytics.overdueObligationCount}</li>
              <li>Open risks: {dashboard.analytics.openRiskCount}</li>
            </ul>
          ) : (
            <EmptyState
              title="No analytics captured"
              description="Capture analytics from real legal activity."
            />
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'settings' ? (
        <Panel
          title="Legal & Compliance Settings"
          description="Jurisdictions, risk methodology, retention, and provider templates"
        >
          <ul className="simple-list">
            <li>Platform owner tenant: {dashboard.isPlatformOwner ? 'Yes' : 'No'}</li>
            <li>Signature providers configured: {dashboard.signatureProviderCount}</li>
            <li>
              Jurisdiction templates:{' '}
              {Object.keys(dashboard.platformConfig.jurisdictionTemplates ?? {}).length}
            </li>
            <li>
              Risk methodology configured: {dashboard.platformConfig.riskMethodology ? 'Yes' : 'No'}
            </li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Legal & Compliance Agent"
          description="AI-generated outputs require human review — not legal advice"
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
              void sendAgentMessage(content, 'legal_compliance' as import('@titan/shared').AgentKey)
            }
            placeholder="Ask about contracts, obligations, risks, compliance gaps, or policy language…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
