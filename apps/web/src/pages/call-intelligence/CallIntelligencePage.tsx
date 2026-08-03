import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { CiCustomerHistoryLookup, CiOwnerDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  analyzeCiCall,
  CallIntelligenceApiClientError,
  decideCiLeadDraft,
  extractCiLeadDraft,
  fetchCiDashboard,
  lookupCiCustomerHistory,
} from '../../lib/call-intelligence-api-client';

type Tab = 'dashboard' | 'summaries' | 'history' | 'leads' | 'sentiment' | 'insights';

function isOwnerOrAdmin(roleName: string | undefined) {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdmin(roleName)) return true;
  return (
    permissions.includes('voice:read') ||
    permissions.includes('voice:write') ||
    permissions.includes('voice_reception:read') ||
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdmin(roleName)) return true;
  return (
    permissions.includes('voice:write') ||
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

function canApprove(roleName: string | undefined, permissions: string[]) {
  if (permissions.includes('*')) return true;
  return isOwnerOrAdmin(roleName);
}

export function CallIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<CiOwnerDashboard | null>(null);
  const [history, setHistory] = useState<CiCustomerHistoryLookup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [callSessionId, setCallSessionId] = useState('');
  const [voiceSessionId, setVoiceSessionId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadService, setLeadService] = useState('');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );
  const canApproveLeads = useMemo(
    () => (user ? canApprove(user.roleName, user.permissions) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchCiDashboard(accessToken);
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
            err instanceof CallIntelligenceApiClientError
              ? err.message
              : 'Unable to load Call Intelligence',
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
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(ok);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CallIntelligenceApiClientError
          ? err.message
          : 'Call Intelligence action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Call Intelligence" description="Dept 9.2 — extends Voice AI Receptionist" />
        <EmptyState
          title="Access restricted"
          description="Owner/Admin or voice/communications permissions required. Technician/Client denied."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'summaries', label: 'Summaries' },
    { id: 'history', label: 'Customer history' },
    { id: 'leads', label: 'Lead drafts' },
    { id: 'sentiment', label: 'Sentiment' },
    { id: 'insights', label: 'Insights' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call Intelligence"
        description="Summaries, history lookup, approval-gated lead drafts, sentiment & insights from real calls"
      />

      <Panel title="Honesty" className="border-cyan-500/20 bg-zinc-950/60">
        <p className="text-sm text-slate-300">
          Extends{' '}
          <Link href="/voice-ai-receptionist" className="text-cyan-300 hover:underline">
            Voice AI Receptionist
          </Link>{' '}
          and core voice sessions. No fake calls or leads. Lead drafts require Owner approval. No
          automatic customer communication. Finance margins and quote internal notes are never
          exposed here.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/30 bg-slate-950/80">
          <p className="text-sm text-rose-300">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Status" className="border-cyan-500/20 bg-slate-950/80">
          <p className="text-sm text-cyan-200">{success}</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-cyan-700/40 text-cyan-100 ring-1 ring-cyan-500/50'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Call Intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="VAIR sessions"
                  value={String(dashboard.callStats.vairSessionCount)}
                />
                <StatCard
                  label="Voice sessions"
                  value={String(dashboard.callStats.voiceSessionCount)}
                />
                <StatCard label="Analyzed" value={String(dashboard.callStats.analyzedCount)} />
                <StatCard
                  label="Pending lead approvals"
                  value={String(dashboard.callStats.pendingLeadApprovals)}
                />
              </div>
              <Panel title="Stats honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.callStats.rationale}</p>
              </Panel>
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm">
                  {dashboard.connections.map((c) => (
                    <li key={c.target} className="flex flex-wrap items-center gap-2">
                      <Link href={c.href} className="text-cyan-300 hover:underline">
                        {c.label}
                      </Link>
                      <span className="text-xs text-slate-500">{c.status}</span>
                      <span className="text-slate-400">— {c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === 'summaries' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Analyze real call session" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken) return;
                      void withFeedback(
                        () =>
                          analyzeCiCall(accessToken, {
                            callSessionId: callSessionId.trim() || undefined,
                            voiceSessionId: voiceSessionId.trim() || undefined,
                          }),
                        'Analysis stored from real transcript/notes (or marked unavailable).',
                      );
                    }}
                  >
                    <Input
                      label="VAIR call session ID"
                      value={callSessionId}
                      onChange={(e) => setCallSessionId(e.target.value)}
                    />
                    <Input
                      label="Voice session ID"
                      value={voiceSessionId}
                      onChange={(e) => setVoiceSessionId(e.target.value)}
                    />
                    <div className="sm:col-span-2">
                      <Button type="submit">Analyze call</Button>
                    </div>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Recent summaries" className="border-slate-800 bg-slate-950/80">
                {dashboard.recentSummaries.length === 0 ? (
                  <EmptyState
                    title="No analyses yet"
                    description="Summaries appear when real call transcripts/notes are analyzed. Nothing is invented."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.recentSummaries.map((s, idx) => (
                      <li
                        key={`${s.callSessionId ?? s.voiceSessionId ?? 'row'}-${idx}`}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-slate-100">
                          {s.availability} — {s.summary || 'Summary unavailable'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{s.rationale}</p>
                        {s.keyPoints.length > 0 ? (
                          <ul className="mt-2 list-disc pl-5 text-slate-300">
                            {s.keyPoints.slice(0, 5).map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        ) : null}
                        {s.customerRequests.length > 0 ? (
                          <p className="mt-2 text-cyan-200">
                            Requests: {s.customerRequests.join('; ')}
                          </p>
                        ) : null}
                        {s.requiredActions.length > 0 ? (
                          <p className="mt-1 text-slate-300">
                            Actions: {s.requiredActions.join('; ')}
                          </p>
                        ) : null}
                        {s.followUpRecommendations.length > 0 ? (
                          <p className="mt-1 text-slate-400">
                            Follow-up: {s.followUpRecommendations.join('; ')}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="space-y-4">
              <Panel title="Customer history lookup" className="border-slate-800 bg-slate-950/80">
                <form
                  className="grid gap-3 sm:grid-cols-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (!accessToken) return;
                    void (async () => {
                      setError(null);
                      setSuccess(null);
                      try {
                        const result = await lookupCiCustomerHistory(accessToken, {
                          customerId: customerId.trim() || undefined,
                          callSessionId: callSessionId.trim() || undefined,
                          voiceSessionId: voiceSessionId.trim() || undefined,
                        });
                        setHistory(result);
                        setSuccess(result.rationale);
                      } catch (err) {
                        setError(
                          err instanceof CallIntelligenceApiClientError
                            ? err.message
                            : 'Unable to load customer history',
                        );
                      }
                    })();
                  }}
                >
                  <Input
                    label="Customer ID"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  />
                  <Input
                    label="VAIR call session ID"
                    value={callSessionId}
                    onChange={(e) => setCallSessionId(e.target.value)}
                  />
                  <Input
                    label="Voice session ID"
                    value={voiceSessionId}
                    onChange={(e) => setVoiceSessionId(e.target.value)}
                  />
                  <div className="sm:col-span-3">
                    <Button type="submit">Lookup approved history</Button>
                  </div>
                </form>
              </Panel>
              {history ? (
                <Panel title="Lookup result" className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-400">{history.rationale}</p>
                  {history.availability === 'unavailable' || !history.customer ? (
                    <EmptyState
                      title="History unavailable"
                      description="Link a real customer or call session — nothing invented."
                    />
                  ) : (
                    <div className="mt-3 space-y-3 text-sm text-slate-300">
                      <p>
                        <span className="text-slate-100">{history.customer.name}</span> ·{' '}
                        {history.customer.phone || 'no phone'} · notes:{' '}
                        {history.customer.notesVisibility === 'hidden'
                          ? 'hidden (Owner/Admin only)'
                          : history.customer.notes || '(none)'}
                      </p>
                      <p>
                        Jobs: {history.previousJobs.length} · Quotes: {history.quotes.length} ·
                        Invoices: {history.invoices.length} · Maintenance:{' '}
                        {history.maintenance.length}
                      </p>
                      <p className="text-xs text-slate-500">
                        Equipment: {history.equipment.rationale} · Margins exposed:{' '}
                        {String(
                          history.quotes.some((q) => q.financeMarginsExposed) ? 'true' : 'false',
                        )}
                      </p>
                    </div>
                  )}
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'leads' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel
                  title="Extract lead draft (Owner approval required)"
                  className="border-slate-800 bg-slate-950/80"
                >
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken) return;
                      void withFeedback(
                        () =>
                          extractCiLeadDraft(accessToken, {
                            callSessionId: callSessionId.trim() || undefined,
                            voiceSessionId: voiceSessionId.trim() || undefined,
                            contactName: leadName.trim() || undefined,
                            contactPhone: leadPhone.trim() || undefined,
                            serviceType: leadService.trim() || undefined,
                            submitForApproval: true,
                          }),
                        'Lead draft queued for Owner approval — nothing was sent or written to CRM.',
                      );
                    }}
                  >
                    <Input
                      label="Contact name"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                    />
                    <Input
                      label="Contact phone"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                    />
                    <Input
                      label="Service type"
                      value={leadService}
                      onChange={(e) => setLeadService(e.target.value)}
                    />
                    <Input
                      label="VAIR call session ID"
                      value={callSessionId}
                      onChange={(e) => setCallSessionId(e.target.value)}
                    />
                    <div className="sm:col-span-2">
                      <Button type="submit">Queue lead draft</Button>
                    </div>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Lead draft queue" className="border-slate-800 bg-slate-950/80">
                {dashboard.leadDraftQueue.length === 0 ? (
                  <EmptyState
                    title="No lead drafts"
                    description="Drafts are created from real call signals only — never invented."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.leadDraftQueue.map((draft) => (
                      <li
                        key={draft.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-slate-100">
                          {draft.title} — {draft.status}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">
                          {draft.body}
                        </pre>
                        {canApproveLeads &&
                        (draft.status === 'draft' || draft.status === 'pending_approval') ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() => {
                                if (!accessToken) return;
                                void withFeedback(
                                  () =>
                                    decideCiLeadDraft(accessToken, draft.id, {
                                      decision: 'approve',
                                    }),
                                  'Approved — Owner intent only; CRM lead not auto-created; nothing sent.',
                                );
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              onClick={() => {
                                if (!accessToken) return;
                                void withFeedback(
                                  () =>
                                    decideCiLeadDraft(accessToken, draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Lead draft rejected.',
                                );
                              }}
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

          {tab === 'sentiment' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Availability" value={dashboard.sentimentOverview.availability} />
                <StatCard label="Sentiment" value={dashboard.sentimentOverview.sentiment} />
                <StatCard label="Urgency" value={dashboard.sentimentOverview.urgency} />
                <StatCard label="Priority" value={dashboard.sentimentOverview.priority} />
              </div>
              <Panel title="Sentiment honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.sentimentOverview.rationale}</p>
                {dashboard.sentimentOverview.recommendations.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No recommendations without clear signal.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                    {dashboard.sentimentOverview.recommendations.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              <Panel title="Aggregated insights" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.insights.rationale}</p>
                {dashboard.insights.availability === 'unavailable' ? (
                  <EmptyState
                    title="Insights unavailable"
                    description="Insights require real aggregated call text — nothing invented."
                  />
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {(
                      [
                        ['Common questions', dashboard.insights.commonQuestions],
                        ['Sales opportunities', dashboard.insights.salesOpportunities],
                        ['Service trends', dashboard.insights.serviceTrends],
                        ['Customer issues', dashboard.insights.customerIssues],
                      ] as const
                    ).map(([label, items]) => (
                      <div
                        key={label}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-sm font-medium text-cyan-100">{label}</p>
                        {items.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500">No matches in real call text.</p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm text-slate-300">
                            {items.map((item) => (
                              <li key={item.label}>
                                <span className="text-slate-100">
                                  {item.label} ({item.count})
                                </span>
                                <p className="text-xs text-slate-500">{item.recommendation}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
