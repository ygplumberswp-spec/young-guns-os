import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  AuraCommandAgentKey,
  AuraCommandCentreDashboard,
  AuraCommandMemoryKind,
} from '@titan/shared';
import {
  AURA_COMMAND_AGENT_KEYS,
  AURA_COMMAND_AGENT_LABELS,
  AURA_COMMAND_MEMORY_KINDS,
  canAccessAuraCommandCentre,
  canDecideAuraCommandCentre,
  canWriteAuraCommandCentre,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { AuraSectionNav } from '../../features/aura/AuraSectionNav';
import { useAuth } from '../../lib/auth-context';
import {
  AuraCommandCentreApiClientError,
  completeAuraCommandFollowUp,
  createAuraCommandActionDraft,
  createAuraCommandFollowUp,
  createAuraCommandHandoff,
  createAuraCommandMemory,
  decideAuraCommandActionDraft,
  decideAuraCommandHandoff,
  ensureAuraCommandAgentRegistry,
  fetchAuraCommandCentreDashboard,
} from '../../lib/aura-command-centre-api-client';

type Tab = 'command' | 'assistant' | 'memory' | 'agents' | 'approvals';

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AuraCommandCentrePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('command');
  const [dashboard, setDashboard] = useState<AuraCommandCentreDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [memoryKind, setMemoryKind] = useState<AuraCommandMemoryKind>('preference');
  const [memoryTitle, setMemoryTitle] = useState('');
  const [memoryContent, setMemoryContent] = useState('');
  const [handoffTo, setHandoffTo] = useState<AuraCommandAgentKey>('operations');
  const [handoffSummary, setHandoffSummary] = useState('');
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');

  const canView = useMemo(
    () =>
      canAccessAuraCommandCentre({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );
  const canWrite = useMemo(
    () =>
      canWriteAuraCommandCentre({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );
  const canDecide = useMemo(
    () =>
      canDecideAuraCommandCentre({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchAuraCommandCentreDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AuraCommandCentreApiClientError
              ? err.message
              : 'Unable to load AURA Command Centre',
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

  async function withWork(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadPage();
      setSuccess(okMessage);
    } catch (err) {
      setError(
        err instanceof AuraCommandCentreApiClientError
          ? err.message
          : 'AURA Command Centre action failed',
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="AURA Command Centre"
          description="Owner intelligence command surface for TITAN Business OS."
        />
        <AuraSectionNav />
        <EmptyState
          title="Access restricted"
          description="AURA Command Centre requires agents/intelligence read access or Owner role."
        />
      </div>
    );
  }

  return (
    <div className="command-centre-page">
      <PageHeader
        title="AURA Command Centre"
        description="Business health, approvals, memory, executive assistant mode, and agent coordination foundation — real tenant signals only."
      />
      <AuraSectionNav />

      <div className="command-centre-page__tabs">
        {(
          [
            ['command', 'Command'],
            ['assistant', 'Executive assistant'],
            ['memory', 'Business memory'],
            ['agents', 'Agent registry'],
            ['approvals', 'Approvals'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'command-centre-page__tab command-centre-page__tab--active'
                : 'command-centre-page__tab'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Loading Command Centre…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="text-sm yg-text-accent-soft">{success}</p> : null}

      {dashboard ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Open jobs" value={String(dashboard.health.openJobs ?? '—')} />
          <StatCard
            label="Outstanding invoices"
            value={String(dashboard.health.outstandingInvoices ?? '—')}
          />
          <StatCard
            label="Pending approvals"
            value={String(dashboard.health.pendingApprovals ?? '—')}
          />
          <StatCard label="Memory entries" value={String(dashboard.health.memoryEntries ?? '—')} />
        </div>
      ) : null}

      {tab === 'command' && dashboard ? (
        <>
          <Panel title="Business health">
            <p className="text-sm text-slate-300">{dashboard.summary}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-400">
              {dashboard.health.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={dashboard.chatIntegration.auraChatHref} className="text-sm yg-text-accent">
                Open AURA Executive Chat →
              </Link>
              <span className="text-slate-600">·</span>
              <span className="text-sm text-slate-400">
                Understands: {dashboard.chatIntegration.understandsModules.join(', ')}
              </span>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Risks">
              {dashboard.risks.length === 0 ? (
                <EmptyState
                  title="No live risk signals"
                  description="Risks appear from real receivables, fleet, and approval pressure — never invented."
                />
              ) : (
                <ul className="space-y-3">
                  {dashboard.risks.map((item) => (
                    <li
                      key={item.id}
                      className="yg-card-accent rounded p-3"
                    >
                      <p className="font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                      {item.href ? (
                        <Link href={item.href} className="mt-2 inline-block text-sm yg-text-accent">
                          Open →
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Opportunities & recommendations">
              {[...dashboard.opportunities, ...dashboard.recommendations].length === 0 ? (
                <EmptyState
                  title="No recommendations yet"
                  description="Advisory items appear from live tenant state."
                />
              ) : (
                <ul className="space-y-3">
                  {[...dashboard.opportunities, ...dashboard.recommendations].map((item) => (
                    <li
                      key={item.id}
                      className="rounded border border-slate-700 bg-slate-950/70 p-3"
                    >
                      <p className="font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Department signal honesty">
            <ul className="grid gap-3 md:grid-cols-2">
              {dashboard.departments.map((dept) => (
                <li
                  key={dept.department}
                  className="rounded border border-slate-700 bg-slate-950/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-100">{dept.label}</p>
                    <span className="yg-label-accent">
                      {dept.availability.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{dept.summary}</p>
                  {dept.signalCount != null ? (
                    <p className="mt-1 text-sm text-slate-300">Signals: {dept.signalCount}</p>
                  ) : null}
                  {dept.honestGap ? (
                    <p className="mt-2 text-xs text-slate-500">{dept.honestGap}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}

      {tab === 'assistant' && dashboard ? (
        <>
          <Panel title="Daily priorities">
            <ul className="space-y-3">
              {dashboard.executiveAssistant.dailyPriorities.map((item) => (
                <li key={item.id} className="yg-card-accent rounded p-3">
                  <p className="font-medium text-slate-100">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                  {item.href ? (
                    <Link href={item.href} className="mt-2 inline-block text-sm yg-text-accent">
                      Open →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Business questions">
            <ul className="space-y-3">
              {dashboard.executiveAssistant.businessQuestions.map((item) => (
                <li key={item.id} className="rounded border border-slate-700 bg-slate-950/70 p-3">
                  <p className="font-medium text-slate-100">{item.question}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.context}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Follow-ups">
            {canWrite ? (
              <form
                className="mb-4 flex flex-wrap gap-2"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!followUpTitle.trim()) return;
                  void withWork(async () => {
                    await createAuraCommandFollowUp(accessToken!, {
                      title: followUpTitle.trim(),
                      source: 'executive_assistant',
                    });
                    setFollowUpTitle('');
                  }, 'Follow-up created (draft planning support).');
                }}
              >
                <input
                  className="min-w-[220px] flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Follow-up title"
                  value={followUpTitle}
                  onChange={(e) => setFollowUpTitle(e.target.value)}
                />
                <Button type="submit" disabled={isWorking}>
                  Add follow-up
                </Button>
              </form>
            ) : null}
            {dashboard.executiveAssistant.followUps.length === 0 ? (
              <EmptyState
                title="No open follow-ups"
                description="Owner follow-ups are stored per tenant and stay under your control."
              />
            ) : (
              <ul className="space-y-3">
                {dashboard.executiveAssistant.followUps.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded border border-slate-700 bg-slate-950/70 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {item.notes || 'No notes'} · {formatWhen(item.dueAt)}
                      </p>
                    </div>
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void withWork(
                            () => completeAuraCommandFollowUp(accessToken!, item.id),
                            'Follow-up marked done.',
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

          <Panel title="Planning support">
            <p className="text-sm text-slate-300">
              {dashboard.executiveAssistant.planningSupport.summary}
            </p>
            <ul className="mt-3 flex flex-wrap gap-3 text-sm">
              {dashboard.executiveAssistant.planningSupport.linkedSurfaces.map((surface) => (
                <li key={surface.href}>
                  <Link href={surface.href} className="yg-text-accent">
                    {surface.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}

      {tab === 'memory' && dashboard ? (
        <>
          <Panel title="Add business memory">
            {canWrite ? (
              <form
                className="space-y-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!memoryTitle.trim() || !memoryContent.trim()) return;
                  void withWork(async () => {
                    await createAuraCommandMemory(accessToken!, {
                      kind: memoryKind,
                      title: memoryTitle.trim(),
                      content: memoryContent.trim(),
                      sourceModule: 'aura_command_centre',
                    });
                    setMemoryTitle('');
                    setMemoryContent('');
                  }, 'Memory saved (owner-controlled, tenant-isolated, audited).');
                }}
              >
                <select
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={memoryKind}
                  onChange={(e) => setMemoryKind(e.target.value as AuraCommandMemoryKind)}
                >
                  {AURA_COMMAND_MEMORY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Title"
                  value={memoryTitle}
                  onChange={(e) => setMemoryTitle(e.target.value)}
                />
                <textarea
                  className="min-h-[100px] w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Content (never store Personal WhatsApp private content here)"
                  value={memoryContent}
                  onChange={(e) => setMemoryContent(e.target.value)}
                />
                <Button type="submit" disabled={isWorking}>
                  Save memory
                </Button>
              </form>
            ) : (
              <p className="text-sm text-slate-400">Write permission required to edit memory.</p>
            )}
          </Panel>

          <Panel title="Recent memory">
            {dashboard.recentMemory.length === 0 ? (
              <EmptyState
                title="No Command Centre memory yet"
                description="Approved decisions, preferences, operating patterns, and important context appear here. Existing AURA company memory remains available in AURA chat."
              />
            ) : (
              <ul className="space-y-3">
                {dashboard.recentMemory.map((entry) => (
                  <li
                    key={entry.id}
                    className="yg-card-accent rounded p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-100">{entry.title}</p>
                      <span className="yg-label-accent">
                        {entry.kind.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{entry.content}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Updated {formatWhen(entry.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'agents' && dashboard ? (
        <>
          <Panel title="Agent coordination foundation">
            <p className="mb-3 text-sm text-slate-400">
              Specialist agents are foundation-only. Secure handoffs require Owner approval and never
              auto-execute.
            </p>
            {canWrite ? (
              <Button
                type="button"
                disabled={isWorking}
                onClick={() =>
                  void withWork(
                    () => ensureAuraCommandAgentRegistry(accessToken!),
                    'Tenant agent registry foundation rows ensured.',
                  )
                }
              >
                Ensure registry rows
              </Button>
            ) : null}
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {dashboard.agentRegistry.map((agent) => (
                <li
                  key={agent.agentKey}
                  className="rounded border border-slate-700 bg-slate-950/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-100">{agent.label}</p>
                    <span className="yg-label-accent">{agent.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Maps to existing agent key: {agent.existingAgentKey ?? 'none'}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {agent.capabilities.join(', ') || 'No capabilities listed'}
                  </p>
                  {agent.notes ? <p className="mt-2 text-xs text-slate-500">{agent.notes}</p> : null}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Create secure handoff (draft → approval)">
            {canWrite ? (
              <form
                className="space-y-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!handoffSummary.trim()) return;
                  void withWork(async () => {
                    await createAuraCommandHandoff(accessToken!, {
                      fromAgentKey: 'executive',
                      toAgentKey: handoffTo,
                      contextSummary: handoffSummary.trim(),
                    });
                    setHandoffSummary('');
                  }, 'Handoff created — pending Owner approval (not auto-executed).');
                }}
              >
                <select
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={handoffTo}
                  onChange={(e) => setHandoffTo(e.target.value as AuraCommandAgentKey)}
                >
                  {AURA_COMMAND_AGENT_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {AURA_COMMAND_AGENT_LABELS[key]}
                    </option>
                  ))}
                </select>
                <textarea
                  className="min-h-[90px] w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Business context summary (no Personal WhatsApp private data)"
                  value={handoffSummary}
                  onChange={(e) => setHandoffSummary(e.target.value)}
                />
                <Button type="submit" disabled={isWorking}>
                  Queue handoff
                </Button>
              </form>
            ) : (
              <p className="text-sm text-slate-400">Write permission required.</p>
            )}
            {dashboard.recentHandoffs.length === 0 ? (
              <EmptyState
                title="No handoffs yet"
                description="Handoffs pass scoped business context between future agents with audit history."
              />
            ) : (
              <ul className="mt-4 space-y-3">
                {dashboard.recentHandoffs.map((handoff) => (
                  <li
                    key={handoff.id}
                    className="rounded border border-slate-700 bg-slate-950/70 p-3"
                  >
                    <p className="font-medium text-slate-100">
                      {handoff.fromAgentKey} → {handoff.toAgentKey}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{handoff.contextSummary}</p>
                    <p className="mt-2 yg-label-accent">{handoff.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'approvals' && dashboard ? (
        <>
          <Panel title="Pending approvals">
            {dashboard.pendingApprovals.length === 0 ? (
              <EmptyState
                title="No pending approvals"
                description="Agent tasks and Command Centre drafts appear here when they need Owner decision."
              />
            ) : (
              <ul className="space-y-3">
                {dashboard.pendingApprovals.map((item) => (
                  <li
                    key={item.id}
                    className="yg-card-accent rounded p-3"
                  >
                    <p className="font-medium text-slate-100">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                    {item.href ? (
                      <Link href={item.href} className="mt-2 inline-block text-sm yg-text-accent">
                        Review →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Draft an action (approval required)">
            {canWrite ? (
              <form
                className="space-y-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!actionTitle.trim() || !actionDescription.trim()) return;
                  void withWork(async () => {
                    await createAuraCommandActionDraft(accessToken!, {
                      title: actionTitle.trim(),
                      description: actionDescription.trim(),
                      departmentKey: 'executive',
                    });
                    setActionTitle('');
                    setActionDescription('');
                  }, 'Action draft queued — never auto-executed.');
                }}
              >
                <input
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Action title"
                  value={actionTitle}
                  onChange={(e) => setActionTitle(e.target.value)}
                />
                <textarea
                  className="min-h-[90px] w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Suggested action (draft only)"
                  value={actionDescription}
                  onChange={(e) => setActionDescription(e.target.value)}
                />
                <Button type="submit" disabled={isWorking}>
                  Create draft
                </Button>
              </form>
            ) : null}
          </Panel>

          <Panel title="Command Centre action drafts">
            {dashboard.pendingActionDrafts.length === 0 ? (
              <EmptyState
                title="No action drafts"
                description="Drafts stay pending until Owner approve/reject."
              />
            ) : (
              <ul className="space-y-3">
                {dashboard.pendingActionDrafts.map((draft) => (
                  <li
                    key={draft.id}
                    className="rounded border border-slate-700 bg-slate-950/70 p-3"
                  >
                    <p className="font-medium text-slate-100">{draft.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{draft.description}</p>
                    <p className="mt-2 yg-label-accent">{draft.status}</p>
                    {canDecide &&
                    (draft.status === 'pending_approval' || draft.status === 'draft') ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          disabled={isWorking}
                          onClick={() =>
                            void withWork(
                              () =>
                                decideAuraCommandActionDraft(accessToken!, draft.id, {
                                  decision: 'approve',
                                }),
                              'Action draft approved (still not auto-executed).',
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void withWork(
                              () =>
                                decideAuraCommandActionDraft(accessToken!, draft.id, {
                                  decision: 'reject',
                                }),
                              'Action draft rejected.',
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

          <Panel title="Handoff decisions">
            {dashboard.recentHandoffs.filter(
              (h) => h.status === 'pending_approval' || h.status === 'draft',
            ).length === 0 ? (
              <EmptyState
                title="No handoffs awaiting decision"
                description="Approve or reject queued agent handoffs here."
              />
            ) : (
              <ul className="space-y-3">
                {dashboard.recentHandoffs
                  .filter((h) => h.status === 'pending_approval' || h.status === 'draft')
                  .map((handoff) => (
                    <li
                      key={handoff.id}
                      className="yg-card-accent rounded p-3"
                    >
                      <p className="font-medium text-slate-100">
                        {handoff.fromAgentKey} → {handoff.toAgentKey}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">{handoff.contextSummary}</p>
                      {canDecide ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            disabled={isWorking}
                            onClick={() =>
                              void withWork(
                                () =>
                                  decideAuraCommandHandoff(accessToken!, handoff.id, {
                                    decision: 'approve',
                                  }),
                                'Handoff approved (foundation only — not auto-executed).',
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isWorking}
                            onClick={() =>
                              void withWork(
                                () =>
                                  decideAuraCommandHandoff(accessToken!, handoff.id, {
                                    decision: 'reject',
                                  }),
                                'Handoff rejected.',
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">
                          Owner decision required to approve/reject.
                        </p>
                      )}
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
