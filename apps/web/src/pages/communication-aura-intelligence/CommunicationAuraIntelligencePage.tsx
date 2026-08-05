import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  CommAuraDashboard,
  CommAuraLinkTargetType,
  CommAuraPriority,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  analyseCommAuraInboxItem,
  CommunicationAuraIntelligenceApiClientError,
  createCommAuraLinkProposal,
  decideCommAuraDraft,
  decideCommAuraFollowUp,
  decideCommAuraLinkProposal,
  fetchCommAuraDashboard,
  runCommAuraScan,
} from '../../lib/communication-aura-intelligence-api-client';

type Tab = 'dashboard' | 'priority' | 'drafts' | 'insights' | 'links';

const LINK_TARGETS: CommAuraLinkTargetType[] = [
  'customer',
  'lead',
  'job',
  'property',
  'timeline',
];

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('communications_intelligence:read') ||
    permissions.includes('communications_intelligence:write')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('communications_intelligence:write')
  );
}

function priorityClass(priority: CommAuraPriority) {
  switch (priority) {
    case 'critical':
      return 'text-rose-300';
    case 'high':
      return 'text-amber-200';
    case 'normal':
      return 'yg-text-accent-soft';
    default:
      return 'text-slate-400';
  }
}

export function CommunicationAuraIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<CommAuraDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inboxItemId, setInboxItemId] = useState('');
  const [linkTargetType, setLinkTargetType] = useState<CommAuraLinkTargetType>('customer');
  const [linkTargetId, setLinkTargetId] = useState('');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchCommAuraDashboard(accessToken);
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
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof CommunicationAuraIntelligenceApiClientError
              ? err.message
              : 'Unable to load Communication AURA Intelligence',
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

  async function handleScan() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await runCommAuraScan(accessToken, { generateDrafts: true });
      setSuccess(
        `Analysed ${result.analysed} message(s); queued ${result.draftsCreated} draft(s) and ${result.followUpsCreated} follow-up(s). Nothing was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to run AURA scan',
      );
    }
  }

  async function handleAnalyse(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !inboxItemId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const message = await analyseCommAuraInboxItem(accessToken, {
        inboxItemId: inboxItemId.trim(),
      });
      setSuccess(
        `Scored message as ${message.priority} (${message.communicationScore}). Sentiment: ${message.sentiment}.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to analyse inbox item',
      );
    }
  }

  async function handleProposeLink(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !inboxItemId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createCommAuraLinkProposal(accessToken, {
        inboxItemId: inboxItemId.trim(),
        linkTargetType,
        linkTargetId: linkTargetId.trim() || undefined,
      });
      setSuccess('Link proposal queued for approval — nothing was auto-linked.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to create link proposal',
      );
    }
  }

  async function handleDecideDraft(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCommAuraDraft(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Draft approved for handoff — not sent. Use Email Centre / Gmail execute to send.'
          : 'Draft rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to decide draft',
      );
    }
  }

  async function handleDecideFollowUp(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCommAuraFollowUp(accessToken, id, { decision });
      setSuccess(decision === 'approve' ? 'Follow-up approved (not auto-executed).' : 'Follow-up rejected.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to decide follow-up',
      );
    }
  }

  async function handleDecideLink(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCommAuraLinkProposal(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Link executed to inbox + Communication Timeline (not auto-linked without approval).'
          : 'Link proposal rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationAuraIntelligenceApiClientError
          ? err.message
          : 'Unable to decide link proposal',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Communication AURA Intelligence"
          description="Prioritisation, honest sentiment, and approval-gated drafts for business channels."
        />
        <EmptyState
          title="Access restricted"
          description="Requires communications or communications-intelligence access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication AURA Intelligence"
        description="Prioritise business messages, score communications, surface honest sentiment, and queue smart-reply / follow-up drafts for Owner approval."
        actions={
          canManage ? (
            <Button type="button" onClick={() => void handleScan()}>
              Run AURA scan
            </Button>
          ) : null
        }
      />

      <p className="text-sm text-slate-400">
        <Link href="/email-centre" className="yg-link">
          Email Centre
        </Link>
        {' · '}
        <Link href="/communication-timeline" className="yg-link">
          Communication Timeline
        </Link>
        {' · '}
        <Link href="/communications-hub" className="yg-link">
          Communications Hub
        </Link>
        {' · '}
        <Link href="/communications-intelligence" className="yg-link">
          Comms Intelligence
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['priority', 'Priority'],
            ['drafts', `Drafts (${dashboard?.pendingDraftApprovals ?? 0})`],
            ['insights', 'Customer insights'],
            ['links', `Links (${dashboard?.pendingLinkApprovals ?? 0})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === key
                ? 'yg-tab-active'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          {error}
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Status" className="yg-panel-accent">
          {success}
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">Loading Communication AURA Intelligence…</Panel>
      ) : !dashboard ? (
        <EmptyState
          title="No data"
          description="Unable to load dashboard. Confirm business Gmail / WhatsApp inbox indexing is available."
        />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-6">
              <Panel title="Honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  <li>{dashboard.productClarification.thisLayer}</li>
                  <li>{dashboard.productClarification.personalWhatsappIntelligence}</li>
                </ul>
                <p className="mt-2 yg-text-accent-subtle text-xs">
                  Auto-send: off · Uses Personal WhatsApp: never · Sentiment never invented
                </p>
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Scored" value={String(dashboard.totalScored)} />
                <StatCard
                  label="Avg score"
                  value={
                    dashboard.averageCommunicationScore === null
                      ? 'Unavailable'
                      : String(dashboard.averageCommunicationScore)
                  }
                />
                <StatCard
                  label="Sentiment available"
                  value={String(dashboard.sentimentAvailableCount)}
                />
                <StatCard
                  label="Sentiment unavailable"
                  value={String(dashboard.sentimentUnavailableCount)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Critical" value={String(dashboard.byPriority.critical)} />
                <StatCard label="High" value={String(dashboard.byPriority.high)} />
                <StatCard label="Pending drafts" value={String(dashboard.pendingDraftApprovals)} />
                <StatCard label="Pending follow-ups" value={String(dashboard.pendingFollowUps)} />
              </div>
            </div>
          ) : null}

          {tab === 'priority' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Analyse inbox item" className="border-slate-800 bg-slate-950/80">
                  <form className="flex flex-wrap items-end gap-3" onSubmit={handleAnalyse}>
                    <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm text-slate-300">
                      Business inbox item ID
                      <Input
                        value={inboxItemId}
                        onChange={(e) => setInboxItemId(e.target.value)}
                        placeholder="UUID from Communications Hub inbox"
                      />
                    </label>
                    <Button type="submit">Analyse</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.prioritisedMessages.length === 0 ? (
                <EmptyState
                  title="No prioritised messages"
                  description="Run an AURA scan after business Gmail / WhatsApp messages are indexed. No demo rows are created."
                />
              ) : (
                <div className="space-y-3">
                  {dashboard.prioritisedMessages.map((msg) => (
                    <Panel
                      key={msg.id}
                      title={`${msg.priority.toUpperCase()} · score ${msg.communicationScore}`}
                      className="border-slate-800 bg-slate-950/80"
                    >
                      <div className="space-y-1 text-sm text-slate-300">
                        <p className={priorityClass(msg.priority)}>
                          {msg.channel} · {msg.sourceKind}
                          {msg.unread ? ' · unread' : ''}
                          {msg.urgent ? ' · urgent flag' : ''}
                        </p>
                        <p className="font-medium yg-text-accent-muted">
                          {msg.subject || '(no subject)'} — {msg.participantLabel || 'unknown'}
                        </p>
                        <p className="text-slate-400">{msg.preview || 'No preview indexed.'}</p>
                        <p className="text-xs text-slate-500">
                          Sentiment: {msg.sentiment}
                          {msg.sentimentConfidence !== null
                            ? ` (${msg.sentimentConfidence}%)`
                            : ' (confidence unavailable)'}
                          {msg.followUpSuggested ? ' · follow-up suggested' : ''}
                          {msg.timelineLinked ? ' · timeline linked' : ''}
                        </p>
                      </div>
                    </Panel>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'drafts' ? (
            <div className="space-y-4">
              <Panel title="Smart replies" className="border-slate-800 bg-slate-950/80">
                {dashboard.draftQueue.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No pending drafts. Scan with draft generation or create from a prioritised item.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.draftQueue.map((draft) => (
                      <div
                        key={draft.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-sm font-medium yg-text-accent-muted">{draft.subject}</p>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                          {draft.body}
                        </pre>
                        <p className="mt-2 text-xs text-slate-500">
                          {draft.draftType} · {draft.channel} · autoSend: false
                        </p>
                        {canManage ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() => void handleDecideDraft(draft.id, 'approve')}
                            >
                              Approve (no send)
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void handleDecideDraft(draft.id, 'reject')}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Follow-up suggestions" className="border-slate-800 bg-slate-950/80">
                {dashboard.followUpQueue.length === 0 ? (
                  <p className="text-sm text-slate-400">No pending follow-up suggestions.</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.followUpQueue.map((fu) => (
                      <div
                        key={fu.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-sm font-medium yg-text-accent-muted">{fu.subject}</p>
                        <p className="mt-1 text-sm text-slate-300">{fu.recommendation}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          due: {fu.dueHint || 'n/a'} · autoExecuted: false
                        </p>
                        {canManage ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() => void handleDecideFollowUp(fu.id, 'approve')}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void handleDecideFollowUp(fu.id, 'reject')}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-3">
              {dashboard.customerInsights.length === 0 ? (
                <EmptyState
                  title="No customer insights yet"
                  description="Insights appear for customers linked on scored business inbox items after a scan."
                />
              ) : (
                dashboard.customerInsights.map((insight) => (
                  <Panel
                    key={insight.id}
                    title={insight.customerName || insight.customerId}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm text-slate-300">{insight.summary}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      messages {insight.messageCount} · unread {insight.unreadCount} · avg score{' '}
                      {insight.averageScore ?? 'Unavailable'} · sentiment{' '}
                      {insight.dominantSentiment} ({insight.sentimentAvailability}) · jobs{' '}
                      {insight.linkedJobCount}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'links' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Propose CRM / timeline link" className="border-slate-800 bg-slate-950/80">
                  <form className="space-y-3" onSubmit={handleProposeLink}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Inbox item ID
                      <Input
                        value={inboxItemId}
                        onChange={(e) => setInboxItemId(e.target.value)}
                        placeholder="Business inbox UUID"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Target type
                      <select
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                        value={linkTargetType}
                        onChange={(e) =>
                          setLinkTargetType(e.target.value as CommAuraLinkTargetType)
                        }
                      >
                        {LINK_TARGETS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Target ID (optional for timeline)
                      <Input
                        value={linkTargetId}
                        onChange={(e) => setLinkTargetId(e.target.value)}
                        placeholder="Customer / lead / job UUID"
                      />
                    </label>
                    <Button type="submit">Queue link proposal</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.linkQueue.length === 0 ? (
                <EmptyState
                  title="No pending link proposals"
                  description="Propose links from prioritised business messages. Approval writes Communication Timeline notes."
                />
              ) : (
                dashboard.linkQueue.map((proposal) => (
                  <Panel
                    key={proposal.id}
                    title={proposal.subject}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm text-slate-300">{proposal.recommendation}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {proposal.linkTargetType} {proposal.linkTargetId || ''} · autoLinked: false
                    </p>
                    {canManage ? (
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          onClick={() => void handleDecideLink(proposal.id, 'approve')}
                        >
                          Approve &amp; execute
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleDecideLink(proposal.id, 'reject')}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
