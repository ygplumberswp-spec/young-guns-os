import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { SfiDashboard, SfiDraftKind } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  createSfiDraft,
  decideSfiDraft,
  fetchSfiDashboard,
  generateSfiObjectionDrafts,
  generateSfiQuoteReminderDrafts,
  generateSfiReactivationDrafts,
  recordSfiQuoteResponse,
  SalesFollowupIntelligenceApiClientError,
  scheduleSfiQuoteFollowUp,
} from '../../lib/sales-followup-intelligence-api-client';

type Tab = 'dashboard' | 'quotes' | 'objections' | 'reactivation' | 'drafts';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('sales:read') ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:read') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:read') ||
    permissions.includes('leads:write') ||
    permissions.includes('quotes:read') ||
    permissions.includes('quotes:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:write') ||
    permissions.includes('quotes:write') ||
    permissions.includes('agents:write')
  );
}

export function SalesFollowupIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<SfiDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [draftKind, setDraftKind] = useState<SfiDraftKind>('quote_reminder');
  const [scheduleAt, setScheduleAt] = useState('');

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
    const data = await fetchSfiDashboard(accessToken);
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
            err instanceof SalesFollowupIntelligenceApiClientError
              ? err.message
              : 'Unable to load Sales Follow-up Intelligence',
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

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await createSfiDraft(accessToken, {
        kind: draftKind,
        quoteId: quoteId.trim() || undefined,
        customerId: customerId.trim() || undefined,
        submitForApproval: true,
      });
      setSuccess('Draft queued for Owner approval — nothing was sent.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesFollowupIntelligenceApiClientError
          ? err.message
          : 'Unable to create draft',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Sales Follow-up Intelligence"
          description="Owner / sales access only."
        />
        <EmptyState
          title="Access denied"
          description="Technician and Client roles cannot view sales follow-up drafts."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Follow-up Intelligence"
        description="Quote reminders, objection drafts, and reactivation outreach from real quotes and customers — Owner approval before send. Extends Sales Intelligence Agent."
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/sales-intelligence-agent" className="text-cyan-300 hover:underline">
          Sales Intelligence Agent
        </Link>
        <Link href="/sales-intelligence" className="text-cyan-300 hover:underline">
          Sales Intelligence
        </Link>
        <Link href="/quotes" className="text-cyan-300 hover:underline">
          Quotes
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100">
          {success}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['quotes', 'Quote follow-up'],
            ['objections', 'Objections'],
            ['reactivation', 'Reactivation'],
            ['drafts', 'Drafts'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'rounded-md bg-cyan-700/40 px-3 py-1.5 text-sm text-cyan-100 ring-1 ring-cyan-500/50'
                : 'rounded-md bg-slate-900 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-slate-700'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80 text-slate-300">
          Loading…
        </Panel>
      ) : null}

      {!isLoading && dashboard ? (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Open quotes" value={String(dashboard.quoteFollowUps.openQuoteCount)} />
                <StatCard label="Reminders due" value={String(dashboard.quoteFollowUps.reminderDueCount)} />
                <StatCard label="Objection signals" value={String(dashboard.objections.signalCount)} />
                <StatCard label="Pending approvals" value={String(dashboard.pendingApprovalCount)} />
              </div>
              <Panel title="Follow-up overview" className="border-slate-800 bg-slate-950/80 space-y-2">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <p className="text-xs text-slate-400">
                  Auto-send: never. Fake campaigns: never. Extends Sales Intelligence Agent (10.1).
                </p>
                <p className="text-xs text-cyan-300/80">{dashboard.productClarification.thisLayer}</p>
              </Panel>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!accessToken) return;
                      setError(null);
                      try {
                        const result = await generateSfiQuoteReminderDrafts(accessToken);
                        setSuccess(
                          `Created ${result.created} quote reminder draft(s) — nothing sent.`,
                        );
                        await loadPage();
                      } catch (err) {
                        setError(
                          err instanceof SalesFollowupIntelligenceApiClientError
                            ? err.message
                            : 'Generate failed',
                        );
                      }
                    }}
                  >
                    Generate quote reminders
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!accessToken) return;
                      setError(null);
                      try {
                        const result = await generateSfiObjectionDrafts(accessToken);
                        setSuccess(
                          `Created ${result.created} objection draft(s) — nothing sent.`,
                        );
                        await loadPage();
                      } catch (err) {
                        setError(
                          err instanceof SalesFollowupIntelligenceApiClientError
                            ? err.message
                            : 'Generate failed',
                        );
                      }
                    }}
                  >
                    Generate objection drafts
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!accessToken) return;
                      setError(null);
                      try {
                        const result = await generateSfiReactivationDrafts(accessToken);
                        setSuccess(
                          `Created ${result.created} reactivation draft(s) — nothing sent.`,
                        );
                        await loadPage();
                      } catch (err) {
                        setError(
                          err instanceof SalesFollowupIntelligenceApiClientError
                            ? err.message
                            : 'Generate failed',
                        );
                      }
                    }}
                  >
                    Generate reactivation drafts
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'quotes' ? (
            <div className="space-y-4">
              <Panel
                title="Quote follow-ups"
                className="border-slate-800 bg-slate-950/80 space-y-3"
              >
                <p className="text-sm text-slate-300">{dashboard.quoteFollowUps.note}</p>
                {canManage ? (
                  <form
                    className="grid gap-2 md:grid-cols-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!accessToken || !quoteId.trim() || !scheduleAt.trim()) return;
                      setError(null);
                      try {
                        await scheduleSfiQuoteFollowUp(accessToken, {
                          quoteId: quoteId.trim(),
                          scheduledFollowUpAt: new Date(scheduleAt).toISOString(),
                        });
                        setSuccess('Follow-up scheduled — no message sent.');
                        await loadPage();
                      } catch (err) {
                        setError(
                          err instanceof SalesFollowupIntelligenceApiClientError
                            ? err.message
                            : 'Schedule failed',
                        );
                      }
                    }}
                  >
                    <Input
                      placeholder="Quote ID"
                      value={quoteId}
                      onChange={(e) => setQuoteId(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <Button type="submit">Schedule follow-up</Button>
                  </form>
                ) : null}
              </Panel>
              {dashboard.quoteFollowUps.items.length === 0 ? (
                <EmptyState
                  title="No open quotes"
                  description="Quote follow-up appears when real sent/viewed quotes exist."
                />
              ) : (
                dashboard.quoteFollowUps.items.map((item) => (
                  <Panel
                    key={item.quoteId}
                    title={`${item.quoteNumber} — ${item.title}`}
                    className="border border-cyan-500/20 bg-zinc-950/60 space-y-1"
                  >
                    <p className="text-xs text-zinc-300">{item.summary}</p>
                    <p className="text-xs text-slate-400">
                      {item.customerName ?? 'Customer'} · {item.status} · response:{' '}
                      {item.responseStatus}
                      {item.scheduledFollowUpAt
                        ? ` · scheduled ${item.scheduledFollowUpAt.slice(0, 16)}`
                        : ''}
                    </p>
                    {canManage ? (
                      <Button
                        type="button"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            await recordSfiQuoteResponse(accessToken, {
                              quoteId: item.quoteId,
                              responseStatus: 'awaiting',
                            });
                            setSuccess('Response tracking updated — no outreach sent.');
                            await loadPage();
                          } catch (err) {
                            setError(
                              err instanceof SalesFollowupIntelligenceApiClientError
                                ? err.message
                                : 'Update failed',
                            );
                          }
                        }}
                      >
                        Mark awaiting response
                      </Button>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'objections' ? (
            <div className="space-y-4">
              <Panel title="Objection signals" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.objections.note}</p>
              </Panel>
              {dashboard.objections.signals.length === 0 ? (
                <EmptyState
                  title="No objection signals"
                  description="Signals come from real inbound communications or quote notes only."
                />
              ) : (
                dashboard.objections.signals.map((signal) => (
                  <Panel
                    key={signal.id}
                    title={`${signal.category} · ${signal.customerName ?? 'Customer'}${
                      signal.quoteNumber ? ` · ${signal.quoteNumber}` : ''
                    }`}
                    className="border border-cyan-500/20 bg-zinc-950/60 space-y-1"
                  >
                    <p className="text-xs text-zinc-300">{signal.recommendation}</p>
                    {signal.signalText ? (
                      <p className="text-xs text-slate-400">“{signal.signalText}”</p>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'reactivation' ? (
            <div className="space-y-4">
              <Panel
                title="Reactivation opportunities"
                className="border-slate-800 bg-slate-950/80"
              >
                <p className="text-sm text-slate-300">{dashboard.reactivation.note}</p>
              </Panel>
              {dashboard.reactivation.opportunities.length === 0 ? (
                <EmptyState
                  title="No reactivation opportunities"
                  description="Opportunities appear from real completed jobs and maintenance history only."
                />
              ) : (
                dashboard.reactivation.opportunities.map((op) => (
                  <Panel
                    key={op.id}
                    title={`${op.kind.replaceAll('_', ' ')} · ${op.customerName ?? 'Customer'}`}
                    className="border border-cyan-500/20 bg-zinc-950/60 space-y-1"
                  >
                    <p className="text-xs text-zinc-300">{op.recommendation}</p>
                    <p className="text-xs text-slate-400">
                      Completed jobs: {op.completedJobCount}
                      {op.lastJobAt ? ` · last ${op.lastJobAt.slice(0, 10)}` : ''}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'drafts' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Queue a draft" className="border-slate-800 bg-slate-950/80">
                  <form className="grid gap-2 md:grid-cols-4" onSubmit={handleCreateDraft}>
                    <select
                      value={draftKind}
                      onChange={(e) => setDraftKind(e.target.value as SfiDraftKind)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    >
                      <option value="quote_reminder">Quote reminder</option>
                      <option value="quote_follow_up">Quote follow-up</option>
                      <option value="objection_response">Objection response</option>
                      <option value="price_objection">Price objection</option>
                      <option value="value_explanation">Value explanation</option>
                      <option value="reactivation">Reactivation</option>
                      <option value="maintenance_opportunity">Maintenance opportunity</option>
                      <option value="service_opportunity">Service opportunity</option>
                    </select>
                    <Input
                      placeholder="Quote ID (optional)"
                      value={quoteId}
                      onChange={(e) => setQuoteId(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <Input
                      placeholder="Customer ID (optional)"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                    <Button type="submit">Queue draft</Button>
                  </form>
                </Panel>
              ) : null}
              {dashboard.drafts.length === 0 ? (
                <EmptyState
                  title="No drafts"
                  description="Generate or create drafts from real quotes and customers. Nothing auto-sends."
                />
              ) : (
                dashboard.drafts.map((draft) => (
                  <Panel
                    key={draft.id}
                    title={`${draft.kind} · ${draft.status}${
                      draft.quoteNumber ? ` · ${draft.quoteNumber}` : ''
                    }`}
                    className="border border-cyan-500/20 bg-zinc-950/60 space-y-2"
                  >
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap">{draft.body}</p>
                    {canManage &&
                    (draft.status === 'draft' || draft.status === 'pending_approval') ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!accessToken) return;
                            try {
                              await decideSfiDraft(accessToken, draft.id, { decision: 'approve' });
                              setSuccess(
                                'Draft approved — still not sent. Use Email Centre outbound path.',
                              );
                              await loadPage();
                            } catch (err) {
                              setError(
                                err instanceof SalesFollowupIntelligenceApiClientError
                                  ? err.message
                                  : 'Approve failed',
                              );
                            }
                          }}
                        >
                          Approve (no send)
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!accessToken) return;
                            try {
                              await decideSfiDraft(accessToken, draft.id, { decision: 'reject' });
                              setSuccess('Draft rejected.');
                              await loadPage();
                            } catch (err) {
                              setError(
                                err instanceof SalesFollowupIntelligenceApiClientError
                                  ? err.message
                                  : 'Reject failed',
                              );
                            }
                          }}
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
      ) : null}
    </div>
  );
}
