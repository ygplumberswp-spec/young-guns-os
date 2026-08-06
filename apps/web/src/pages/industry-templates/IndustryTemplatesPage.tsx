import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  ItplDashboard,
  ItplSupportLevel,
  ItplTemplateDetail,
  ItplTrade,
} from '@titan/shared';
import {
  ITPL_SECTION_LABELS,
  ITPL_SUPPORT_LABELS,
  ITPL_TRADES,
  ITPL_TRADE_LABELS,
  canActivateItplTemplate,
  canEditItplTemplates,
  canReadItplTemplates,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  IndustryTemplatesApiClientError,
  activateItplTemplate,
  createItplTemplate,
  decideItplVersion,
  fetchItplAudit,
  fetchItplDashboard,
  fetchItplTemplate,
  submitItplVersion,
  updateItplSettings,
  type ItplAuditEntry,
} from '../../lib/industry-templates-api-client';

type Tab = 'active' | 'templates' | 'catalog' | 'versions' | 'controls' | 'audit';

const SUPPORT_STYLES: Record<ItplSupportLevel, string> = {
  supported: 'border-emerald-500/50 bg-emerald-950/30 text-emerald-100',
  requires_configuration: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
  requires_compliance_review: 'border-orange-500/50 bg-orange-950/30 text-orange-100',
  unavailable: 'border-slate-600/50 bg-slate-900/40 text-slate-300',
};

function formatWhen(iso: string | null): string {
  if (!iso) return 'No recorded date';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Unknown date';
  return new Date(parsed).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function SupportBadge({ support }: { support: ItplSupportLevel }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${SUPPORT_STYLES[support]}`}>
      {ITPL_SUPPORT_LABELS[support]}
    </span>
  );
}

export function IndustryTemplatesPage() {
  const { user, accessToken } = useAuth();
  const [dashboard, setDashboard] = useState<ItplDashboard | null>(null);
  const [detail, setDetail] = useState<ItplTemplateDetail | null>(null);
  const [audit, setAudit] = useState<ItplAuditEntry[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ trade: ItplTrade; name: string; customLabel: string }>({
    trade: 'plumbing',
    name: '',
    customLabel: '',
  });

  const canView = useMemo(
    () => (user ? canReadItplTemplates({ roleName: user.roleName, permissions: user.permissions }) : false),
    [user],
  );
  const canEdit = useMemo(
    () => (user ? canEditItplTemplates({ roleName: user.roleName, permissions: user.permissions }) : false),
    [user],
  );
  const canActivate = useMemo(
    () =>
      user ? canActivateItplTemplate({ roleName: user.roleName, permissions: user.permissions }) : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const next = await fetchItplDashboard(accessToken);
    setDashboard(next);
    setDetail((current) => {
      if (!current) return next.activeTemplate;
      return next.templates.some((template) => template.id === current.id)
        ? current
        : next.activeTemplate;
    });
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
            err instanceof IndustryTemplatesApiClientError
              ? err.message
              : 'Unable to load Industry Templates',
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
      setError(err instanceof IndustryTemplatesApiClientError ? err.message : 'Action failed');
    }
  }

  async function openTemplate(templateId: string) {
    if (!accessToken) return;
    try {
      setError(null);
      setDetail(await fetchItplTemplate(accessToken, templateId));
      setTab('versions');
    } catch (err) {
      setError(
        err instanceof IndustryTemplatesApiClientError ? err.message : 'Unable to open template',
      );
    }
  }

  async function loadAudit() {
    if (!accessToken) return;
    try {
      setError(null);
      setAudit(await fetchItplAudit(accessToken));
    } catch (err) {
      setError(
        err instanceof IndustryTemplatesApiClientError ? err.message : 'Unable to load history',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Industry Templates" />
        <EmptyState
          title="Not available to this role"
          description="Industry templates decide how a trade's work is set up. Only the Owner and administrators can see and change them."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'active', label: 'Active template' },
    { id: 'templates', label: 'All templates' },
    { id: 'catalog', label: 'Trades' },
    { id: 'versions', label: 'Version history' },
    ...(canEdit ? ([{ id: 'controls', label: 'Controls' }] as const) : []),
    ...(canEdit ? ([{ id: 'audit', label: 'History' }] as const) : []),
  ];

  const activeTemplate = dashboard?.activeTemplate ?? null;
  const shown = detail ?? activeTemplate;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Industry Templates"
        description="A template sets up this one platform for a trade: what jobs are called, which checklists and documents apply, and which approvals are needed. It configures what already exists and never becomes a second system."
      />

      {error ? (
        <div className="rounded border border-rose-500/50 bg-rose-950/30 p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded border border-emerald-500/50 bg-emerald-950/30 p-3 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      {isLoading ? (
        <Panel title="Industry Templates">
          <p className="text-sm text-slate-400">Loading templates…</p>
        </Panel>
      ) : !dashboard ? (
        <EmptyState
          title="Nothing to show yet"
          description="No template information could be loaded for this company."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active template"
              value={activeTemplate ? activeTemplate.name : 'None chosen'}
            />
            <StatCard label="Templates" value={String(dashboard.templates.length)} />
            <StatCard label="Awaiting approval" value={String(dashboard.pendingApprovalCount)} />
            <StatCard
              label="Trade"
              value={activeTemplate ? activeTemplate.tradeLabel : 'Not configured'}
            />
          </div>

          <Panel title="How templates work">
            <p className="text-xs text-slate-400">{dashboard.singleCoreStatement}</p>
            <p className="mt-2 text-xs text-slate-400">{dashboard.noSeedingStatement}</p>
          </Panel>

          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Button
                key={item.id}
                variant={tab === item.id ? 'primary' : 'secondary'}
                onClick={() => {
                  setTab(item.id);
                  if (item.id === 'audit') void loadAudit();
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {tab === 'active' ? (
            <Panel title="What this company is set up for">
              {!shown ? (
                <EmptyState
                  title="No active template"
                  description="No trade template has been made active for this company yet. Existing functionality is unaffected."
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-slate-100">{shown.name}</span>
                    <span className="text-sm text-slate-400">{shown.tradeLabel}</span>
                    <SupportBadge support={shown.support} />
                    {shown.isActive ? (
                      <span className="rounded border border-emerald-500/50 bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-100">
                        Active
                      </span>
                    ) : null}
                  </div>

                  {shown.definition.sections.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      This template has no sections filled in yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {shown.definition.sections.map((section) => (
                        <div
                          key={section.section}
                          className="rounded border border-slate-700/60 bg-slate-900/40 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-slate-100">
                              {ITPL_SECTION_LABELS[section.section]}
                            </span>
                            <SupportBadge support={section.support} />
                          </div>
                          {section.entries.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400">
                              Nothing configured in this section yet.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {section.entries.map((entry) => (
                                <li key={entry.key} className="text-xs text-slate-300">
                                  <span className="text-slate-100">{entry.label}</span>
                                  {entry.capabilityRef ? (
                                    <span className="ml-2 text-slate-500">
                                      configures {entry.capabilityRef.replace(/_/g, ' ')}
                                    </span>
                                  ) : null}
                                  {entry.support !== 'supported' ? (
                                    <span className="ml-2 text-amber-200">
                                      {ITPL_SUPPORT_LABELS[entry.support]}
                                    </span>
                                  ) : null}
                                  {entry.notes ? (
                                    <p className="mt-0.5 text-slate-400">{entry.notes}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {dashboard.withheld.length > 0 ? (
                    <div className="rounded border border-slate-700/60 bg-slate-900/40 p-3">
                      <p className="text-xs text-slate-400">
                        Some sections are not shown to your role:
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {dashboard.withheld.map((notice) => (
                          <li key={notice.section} className="text-xs text-slate-500">
                            {notice.label} — {notice.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          ) : null}

          {tab === 'templates' ? (
            <Panel title="Templates for this company">
              {canEdit ? (
                <div className="mb-4 space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
                  <p className="text-sm text-slate-200">Add a template</p>
                  <p className="text-xs text-slate-400">
                    A new template starts from the structure for that trade. Creating one changes
                    nothing that is live and writes no records into this company.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                      value={draft.trade}
                      onChange={(event) =>
                        setDraft({ ...draft, trade: event.target.value as ItplTrade })
                      }
                    >
                      {ITPL_TRADES.map((trade) => (
                        <option key={trade} value={trade}>
                          {ITPL_TRADE_LABELS[trade]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="min-w-[14rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                      placeholder="Template name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                    {draft.trade === 'other_trade' ? (
                      <input
                        className="min-w-[12rem] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                        placeholder="Trade name"
                        value={draft.customLabel}
                        onChange={(event) =>
                          setDraft({ ...draft, customLabel: event.target.value })
                        }
                      />
                    ) : null}
                    <Button
                      disabled={draft.name.trim().length === 0}
                      onClick={() =>
                        void withFeedback(async () => {
                          if (!accessToken) return;
                          await createItplTemplate(accessToken, {
                            trade: draft.trade,
                            name: draft.name.trim(),
                            customTradeLabel:
                              draft.trade === 'other_trade'
                                ? draft.customLabel.trim() || null
                                : null,
                          });
                          setDraft({ trade: draft.trade, name: '', customLabel: '' });
                        }, 'Template created as a draft.')
                      }
                    >
                      Create draft
                    </Button>
                  </div>
                </div>
              ) : null}

              {dashboard.templates.length === 0 ? (
                <EmptyState
                  title="No templates yet"
                  description="No trade template has been set up for this company."
                />
              ) : (
                <ul className="space-y-2">
                  {dashboard.templates.map((template) => (
                    <li
                      key={template.id}
                      className="rounded border border-slate-700/60 bg-slate-900/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-slate-100">{template.name}</p>
                          <p className="text-xs text-slate-400">
                            {template.tradeLabel} · version{' '}
                            {template.activeVersionNumber ?? template.latestVersionNumber ?? '—'} ·
                            updated {formatWhen(template.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SupportBadge support={template.support} />
                          {template.isActive ? (
                            <span className="rounded border border-emerald-500/50 bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-100">
                              Active
                            </span>
                          ) : null}
                          <Button variant="secondary" onClick={() => void openTemplate(template.id)}>
                            Open
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'catalog' ? (
            <Panel title="Trades you can set up">
              <ul className="space-y-2">
                {dashboard.catalog.map((item) => (
                  <li
                    key={item.trade}
                    className="rounded border border-slate-700/60 bg-slate-900/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-slate-100">{item.label}</span>
                      <SupportBadge support={item.support} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.guidance}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {tab === 'versions' ? (
            <Panel title="Version history">
              {!shown ? (
                <EmptyState
                  title="Choose a template"
                  description="Open a template to see how it has changed over time."
                />
              ) : shown.versions.length === 0 ? (
                <EmptyState
                  title="No versions visible"
                  description="Version history is available to the Owner and administrators."
                />
              ) : (
                <ul className="space-y-2">
                  {shown.versions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded border border-slate-700/60 bg-slate-900/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-slate-100">
                            Version {version.versionNumber} — {version.changeSummary}
                          </p>
                          <p className="text-xs text-slate-400">
                            {version.changeImpact === 'live_workflow'
                              ? 'Changes how work runs — needs Owner approval'
                              : 'Wording only'}{' '}
                            · saved {formatWhen(version.createdAt)}
                            {version.approvedAt
                              ? ` · decided ${formatWhen(version.approvedAt)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-slate-600/50 bg-slate-900/40 px-2 py-0.5 text-xs text-slate-300">
                            {version.status.replace(/_/g, ' ')}
                          </span>
                          {canEdit && version.status === 'draft' ? (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(async () => {
                                  if (!accessToken) return;
                                  await submitItplVersion(accessToken, shown.id, version.id);
                                  await openTemplate(shown.id);
                                }, 'Sent for Owner approval.')
                              }
                            >
                              Send for approval
                            </Button>
                          ) : null}
                          {canActivate && version.status === 'pending_approval' ? (
                            <>
                              <Button
                                onClick={() =>
                                  void withFeedback(async () => {
                                    if (!accessToken) return;
                                    await decideItplVersion(accessToken, shown.id, version.id, {
                                      decision: 'approved',
                                    });
                                    await openTemplate(shown.id);
                                  }, 'Version approved.')
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  void withFeedback(async () => {
                                    if (!accessToken) return;
                                    await decideItplVersion(accessToken, shown.id, version.id, {
                                      decision: 'rejected',
                                    });
                                    await openTemplate(shown.id);
                                  }, 'Version rejected.')
                                }
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {canActivate && version.status === 'approved' ? (
                            <Button
                              onClick={() =>
                                void withFeedback(async () => {
                                  if (!accessToken) return;
                                  await activateItplTemplate(accessToken, shown.id, {
                                    versionId: version.id,
                                  });
                                  await openTemplate(shown.id);
                                }, 'This version is now the active configuration.')
                              }
                            >
                              Make active
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {shown && shown.activations.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs text-slate-400">When this template went live</p>
                  <ul className="mt-1 space-y-1">
                    {shown.activations.map((activation) => (
                      <li key={activation.id} className="text-xs text-slate-500">
                        Version {activation.versionNumber} · {formatWhen(activation.activatedAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {tab === 'controls' ? (
            <Panel title="Controls">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.technicianReadEnabled}
                    disabled={!canActivate}
                    onChange={(event) =>
                      void withFeedback(async () => {
                        if (!accessToken) return;
                        await updateItplSettings(accessToken, {
                          technicianReadEnabled: event.target.checked,
                        });
                      }, 'Controls updated.')
                    }
                  />
                  Let technicians read job types, checklists and wording
                </label>

                <div className="rounded border border-slate-700/60 bg-slate-900/40 p-3 text-xs text-slate-400">
                  <p>These cannot be turned off:</p>
                  <ul className="mt-1 space-y-0.5">
                    <li>A change that affects live work always needs Owner approval.</li>
                    <li>
                      A compliance requirement is never stated as applying until a reviewer has
                      confirmed it.
                    </li>
                    <li>
                      Creating or activating a template never writes customers, jobs, quotes or
                      invoices into this company.
                    </li>
                  </ul>
                </div>
                {!canActivate ? (
                  <p className="text-xs text-slate-500">Only the Owner can change these controls.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {tab === 'audit' ? (
            <Panel title="History">
              {audit.length === 0 ? (
                <EmptyState
                  title="Nothing recorded yet"
                  description="Template changes and decisions appear here once they happen."
                />
              ) : (
                <ul className="space-y-1">
                  {audit.map((entry) => (
                    <li key={entry.id} className="text-xs text-slate-400">
                      {formatWhen(entry.occurredAt)} — {entry.eventKind.replace(/_/g, ' ')}
                      {entry.subjectKey ? ` (${entry.subjectKey})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
