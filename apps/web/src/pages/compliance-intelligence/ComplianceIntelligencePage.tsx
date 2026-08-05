import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  CmiAuraInsightTarget,
  CmiCocWorkflowStatus,
  CmiDashboard,
  CmiRecommendationDraftSummary,
} from '@titan/shared';
import { CMI_COC_WORKFLOW_LABELS, CMI_COC_WORKFLOW_STATUSES } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeCmiExpiry,
  acknowledgeCmiInsight,
  ComplianceIntelligenceApiClientError,
  createCmiAuditPack,
  createCmiAuraInsight,
  decideCmiRecommendation,
  fetchCmiDashboard,
  refreshCmiRecommendations,
  runCmiChecks,
  updateCmiCocWorkflowStatus,
  updateCmiSettings,
  upsertCmiCocWorkflow,
  upsertCmiSansStandard,
} from '../../lib/compliance-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'sans'
  | 'coc'
  | 'checks'
  | 'expiry'
  | 'audit'
  | 'recommendations'
  | 'settings'
  | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('legal_compliance:read') ||
    permissions.includes('legal_compliance:write') ||
    permissions.includes('legal_compliance:manage') ||
    permissions.includes('documents:read') ||
    permissions.includes('documents:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('legal_compliance:write') ||
    permissions.includes('legal_compliance:manage') ||
    permissions.includes('documents:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function ComplianceIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<CmiDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sansCode, setSansCode] = useState('');
  const [sansTitle, setSansTitle] = useState('');
  const [cocTitle, setCocTitle] = useState('');
  const [cocDocumentId, setCocDocumentId] = useState('');
  const [cocJobId, setCocJobId] = useState('');
  const [cocExpiresAt, setCocExpiresAt] = useState('');
  const [auditTitle, setAuditTitle] = useState('Audit readiness pack');
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<CmiAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [reminderLeadDays, setReminderLeadDays] = useState('30');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );
  const canOwnerApprove = useMemo(
    () => (user ? canApprove(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchCmiDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    setReminderLeadDays(String(data.settings.reminderLeadDays));
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ComplianceIntelligenceApiClientError
              ? err.message
              : 'Unable to load Compliance Intelligence',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function withFeedback(action: () => Promise<unknown>, ok: string) {
    try {
      setError(null);
      setSuccess(null);
      await action();
      await loadPage();
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof ComplianceIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Compliance Intelligence"
          description="SANS, COC workflows, checks, expiry tracking, and audit preparation"
        />
        <EmptyState
          title="Access restricted"
          description="Legal compliance or documents permissions are required. Technicians and clients cannot access this intelligence surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'sans', label: 'SANS' },
    { id: 'coc', label: 'COC workflows' },
    { id: 'checks', label: 'Checks' },
    { id: 'expiry', label: 'Expiry' },
    { id: 'audit', label: 'Audit prep' },
    { id: 'recommendations', label: 'AURA drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Compliance Intelligence"
        description="SANS support, COC workflows, compliance checks, expiry tracking, and audit preparation — extending documents and legal compliance"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/document-intelligence" className="yg-link">
          Document Intelligence
        </Link>
        <Link href="/documents" className="yg-link">
          Documents
        </Link>
        <Link href="/legal-compliance" className="yg-link">
          Legal & Compliance
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/assets" className="yg-link">
          Equipment
        </Link>
        <Link href="/aura/command-centre" className="yg-link">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          Real compliance evidence only — never invented. No automatic certification. AURA risks,
          missing-doc suggestions, and expiry alerts are drafts requiring Owner approval. Actions
          never auto-execute.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/20 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Success" className="border-emerald-500/40 bg-emerald-950/20 text-emerald-100">
          <p className="text-sm">{success}</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <EmptyState title="Loading" description="Loading Compliance Intelligence…" />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="SANS tracked" value={String(dashboard.sans.trackedCount)} />
                <StatCard label="Open COC workflows" value={String(dashboard.coc.openWorkflowCount)} />
                <StatCard label="Failed checks" value={String(dashboard.checks.failCount)} />
                <StatCard label="Pending drafts" value={String(dashboard.pendingApprovals)} />
              </div>
              <Panel title="Summary">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-400">
                  <li>{dashboard.productClarification.legalComplianceOps}</li>
                  <li>{dashboard.productClarification.documentIntelligenceOps}</li>
                  <li>{dashboard.productClarification.thisLayer}</li>
                </ul>
              </Panel>
              <div className="grid gap-3 md:grid-cols-2">
                <Panel title="SANS">
                  <p className="text-sm text-slate-300">{dashboard.sans.rationale}</p>
                </Panel>
                <Panel title="COC">
                  <p className="text-sm text-slate-300">{dashboard.coc.rationale}</p>
                </Panel>
                <Panel title="Checks">
                  <p className="text-sm text-slate-300">{dashboard.checks.rationale}</p>
                </Panel>
                <Panel title="Expiry">
                  <p className="text-sm text-slate-300">{dashboard.expiry.rationale}</p>
                </Panel>
              </div>
            </div>
          ) : null}

          {tab === 'sans' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Track SANS standard">
                  <form
                    className="grid gap-3 md:grid-cols-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          upsertCmiSansStandard(accessToken!, {
                            code: sansCode,
                            title: sansTitle,
                          }),
                        'SANS standard saved (company-entered — not invented)',
                      );
                      setSansCode('');
                      setSansTitle('');
                    }}
                  >
                    <Input
                      label="Code"
                      value={sansCode}
                      onChange={(e) => setSansCode(e.target.value)}
                      placeholder="SANS 10142"
                      required
                    />
                    <Input
                      label="Title"
                      value={sansTitle}
                      onChange={(e) => setSansTitle(e.target.value)}
                      placeholder="Wiring of premises"
                      required
                    />
                    <div className="flex items-end">
                      <Button type="submit">Save standard</Button>
                    </div>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Tracked standards">
                {dashboard.sansStandards.length === 0 ? (
                  <EmptyState
                    title="No SANS standards"
                    description="Add company-tracked SANS codes. Nothing is invented."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.sansStandards.map((s) => (
                      <li key={s.id} className="rounded border border-slate-700/60 p-3">
                        <div className="font-medium yg-text-accent-soft">
                          {s.code} — {s.title}
                        </div>
                        <div className="text-slate-400">
                          {s.status} · {s.linkedWorkflowCount} linked workflow(s)
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'coc' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create COC workflow">
                  <form
                    className="grid gap-3 md:grid-cols-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          upsertCmiCocWorkflow(accessToken!, {
                            title: cocTitle,
                            documentId: cocDocumentId.trim() || null,
                            jobId: cocJobId.trim() || null,
                            expiresAt: cocExpiresAt
                              ? new Date(cocExpiresAt).toISOString()
                              : null,
                          }),
                        'COC workflow created (never auto-certified)',
                      );
                      setCocTitle('');
                      setCocDocumentId('');
                      setCocJobId('');
                      setCocExpiresAt('');
                    }}
                  >
                    <Input
                      label="Title"
                      value={cocTitle}
                      onChange={(e) => setCocTitle(e.target.value)}
                      required
                    />
                    <Input
                      label="Document ID (optional real FK)"
                      value={cocDocumentId}
                      onChange={(e) => setCocDocumentId(e.target.value)}
                    />
                    <Input
                      label="Job ID (optional real FK)"
                      value={cocJobId}
                      onChange={(e) => setCocJobId(e.target.value)}
                    />
                    <Input
                      label="Expires at"
                      type="datetime-local"
                      value={cocExpiresAt}
                      onChange={(e) => setCocExpiresAt(e.target.value)}
                    />
                    <div className="md:col-span-2">
                      <Button type="submit">Create workflow</Button>
                    </div>
                  </form>
                </Panel>
              ) : null}
              <Panel title="COC workflows">
                {dashboard.cocWorkflows.length === 0 ? (
                  <EmptyState
                    title="No COC workflows"
                    description="Create workflows linked to real documents/jobs/properties. Issued status requires Owner."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.cocWorkflows.map((w) => (
                      <li key={w.id} className="rounded border border-slate-700/60 p-3 space-y-2">
                        <div className="font-medium yg-text-accent-soft">{w.title}</div>
                        <div className="text-slate-400">
                          {CMI_COC_WORKFLOW_LABELS[w.status]} · autoCertified={String(w.autoCertified)}
                          {w.documentTitle ? ` · doc ${w.documentTitle}` : ''}
                          {w.jobTitle ? ` · job ${w.jobTitle}` : ''}
                          {w.sansCode ? ` · ${w.sansCode}` : ''}
                        </div>
                        {canManage ? (
                          <div className="flex flex-wrap gap-2">
                            {CMI_COC_WORKFLOW_STATUSES.filter((s) => s !== w.status).map(
                              (status: CmiCocWorkflowStatus) => (
                                <Button
                                  key={status}
                                  variant="secondary"
                                  disabled={status === 'issued' && !canOwnerApprove}
                                  onClick={() =>
                                    void withFeedback(
                                      () =>
                                        updateCmiCocWorkflowStatus(accessToken!, w.id, { status }),
                                      `Workflow → ${CMI_COC_WORKFLOW_LABELS[status]} (not auto-certified)`,
                                    )
                                  }
                                >
                                  {CMI_COC_WORKFLOW_LABELS[status]}
                                </Button>
                              ),
                            )}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'checks' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Run compliance checks">
                  <p className="mb-3 text-sm text-slate-400">
                    Runs against real documents, COC workflows, DI profiles (when present), and LC
                    insurance. Results are informational — never a certification decision.
                  </p>
                  <Button
                    onClick={() =>
                      void withFeedback(
                        () => runCmiChecks(accessToken!),
                        'Compliance checks recorded (no auto-certification)',
                      )
                    }
                  >
                    Run checks
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Recent checks">
                {dashboard.complianceChecks.length === 0 ? (
                  <EmptyState
                    title="No checks yet"
                    description={dashboard.checks.rationale}
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.complianceChecks.map((c) => (
                      <li key={c.id} className="rounded border border-slate-700/60 p-3">
                        <div className="font-medium yg-text-accent-soft">
                          [{c.result}] {c.title}
                        </div>
                        <div className="text-slate-400">{c.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'expiry' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh expiry tracking">
                  <Button
                    onClick={() =>
                      void withFeedback(
                        () => refreshCmiRecommendations(accessToken!),
                        'Expiry items and AURA drafts refreshed from real sources',
                      )
                    }
                  >
                    Refresh from real sources
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Expiry items">
                {dashboard.expiryItems.length === 0 ? (
                  <EmptyState title="No expiry items" description={dashboard.expiry.rationale} />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.expiryItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-700/60 p-3"
                      >
                        <div>
                          <div className="font-medium yg-text-accent-soft">{item.title}</div>
                          <div className="text-slate-400">
                            {item.source} · {item.expiresAt}
                            {item.daysUntilExpiry != null
                              ? ` · ${item.daysUntilExpiry} day(s)`
                              : ''}{' '}
                            · {item.status}
                          </div>
                        </div>
                        {canManage && item.status === 'open' ? (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  acknowledgeCmiExpiry(accessToken!, item.id, {
                                    status: 'acknowledged',
                                  }),
                                'Expiry acknowledged',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'audit' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create audit preparation pack">
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () => createCmiAuditPack(accessToken!, { title: auditTitle }),
                        'Audit pack assembled from real documents/checks only',
                      );
                    }}
                  >
                    <Input
                      label="Pack title"
                      value={auditTitle}
                      onChange={(e) => setAuditTitle(e.target.value)}
                      required
                    />
                    <Button type="submit">Assemble pack</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Audit packs">
                {dashboard.auditPacks.length === 0 ? (
                  <EmptyState title="No audit packs" description={dashboard.audit.rationale} />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.auditPacks.map((p) => (
                      <li key={p.id} className="rounded border border-slate-700/60 p-3">
                        <div className="font-medium yg-text-accent-soft">{p.title}</div>
                        <div className="text-slate-400">
                          {p.status} · {p.documentCount} docs · {p.checkCount} checks ·{' '}
                          {p.gapCount} gaps · readiness {p.readiness}
                        </div>
                        <div className="text-slate-500">{p.readinessRationale}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh AURA drafts">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void withFeedback(
                          () => refreshCmiRecommendations(accessToken!),
                          'AURA recommendation drafts refreshed',
                        )
                      }
                    >
                      Refresh drafts
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void withFeedback(
                          () =>
                            refreshCmiRecommendations(accessToken!, {
                              submitForApproval: true,
                            }),
                          'Drafts submitted for Owner approval',
                        )
                      }
                    >
                      Refresh + submit for approval
                    </Button>
                  </div>
                </Panel>
              ) : null}
              <Panel title="Recommendation drafts">
                {dashboard.recommendationDrafts.length === 0 ? (
                  <EmptyState
                    title="No drafts"
                    description="Refresh to generate compliance risk / missing doc / expiry alert drafts from real data."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.recommendationDrafts.map((d: CmiRecommendationDraftSummary) => (
                      <li key={d.id} className="rounded border border-slate-700/60 p-3 space-y-2">
                        <div className="font-medium yg-text-accent-soft">
                          [{d.kind}] {d.title}
                        </div>
                        <pre className="whitespace-pre-wrap text-slate-400">{d.body}</pre>
                        <div className="text-slate-500">
                          status={d.status} · autoExecuted={String(d.autoExecuted)}
                        </div>
                        {canOwnerApprove &&
                        ['draft', 'pending_approval'].includes(d.status) ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideCmiRecommendation(accessToken!, d.id, {
                                      decision: 'approve',
                                    }),
                                  'Draft approved (no auto-execute / no auto-certify)',
                                )
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideCmiRecommendation(accessToken!, d.id, {
                                      decision: 'reject',
                                    }),
                                  'Draft rejected',
                                )
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Settings">
              {!canOwnerApprove ? (
                <EmptyState
                  title="Owner only"
                  description="Only Company Owner may change Compliance Intelligence settings."
                />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(
                      () =>
                        updateCmiSettings(accessToken!, {
                          reminderLeadDays: Number(reminderLeadDays) || 30,
                          notes: settingsNotes || null,
                          sansTrackingEnabled: true,
                          cocWorkflowsEnabled: true,
                          complianceChecksEnabled: true,
                          expiryTrackingEnabled: true,
                          auditPrepEnabled: true,
                        }),
                      'Settings updated (auto-certification remains disabled)',
                    );
                  }}
                >
                  <Input
                    label="Reminder lead days"
                    type="number"
                    value={reminderLeadDays}
                    onChange={(e) => setReminderLeadDays(e.target.value)}
                  />
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <p className="text-sm text-slate-400">
                    Invariants: autoCertification=
                    {String(dashboard.settings.autoCertificationEnabled)}, inventRecords=
                    {String(dashboard.settings.inventComplianceRecordsEnabled)}, autoExecute=
                    {String(dashboard.settings.autoExecuteActionsEnabled)}
                  </p>
                  <Button type="submit">Save settings</Button>
                </form>
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create AURA insight handoff">
                  <form
                    className="space-y-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createCmiAuraInsight(accessToken!, {
                            target: insightTarget,
                            title: insightTitle,
                            insight: insightBody,
                            href: '/compliance-intelligence',
                          }),
                        'AURA insight created (draft handoff)',
                      );
                      setInsightTitle('');
                      setInsightBody('');
                    }}
                  >
                    <Input
                      label="Title"
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      required
                    />
                    <label className="block text-sm text-slate-300">
                      Target
                      <select
                        className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
                        value={insightTarget}
                        onChange={(e) =>
                          setInsightTarget(e.target.value as CmiAuraInsightTarget)
                        }
                      >
                        {dashboard.auraConnections.map((c) => (
                          <option key={c.target} value={c.target}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-300">
                      Insight
                      <textarea
                        className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
                        rows={4}
                        value={insightBody}
                        onChange={(e) => setInsightBody(e.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit">Create insight</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Insights">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No insights"
                    description="Create handoffs for Command Centre / Legal / Documents review."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.auraInsights.map((i) => (
                      <li
                        key={i.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-700/60 p-3"
                      >
                        <div>
                          <div className="font-medium yg-text-accent-soft">
                            [{i.target}] {i.title}
                          </div>
                          <div className="text-slate-400">{i.insight}</div>
                        </div>
                        {canManage && i.status === 'open' ? (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  acknowledgeCmiInsight(accessToken!, i.id, {
                                    status: 'acknowledged',
                                  }),
                                'Insight acknowledged',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Connections">
                <ul className="space-y-1 text-sm text-slate-400">
                  {dashboard.auraConnections.map((c) => (
                    <li key={c.target}>
                      <Link href={c.href} className="yg-link">
                        {c.label}
                      </Link>{' '}
                      — {c.note}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
