import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  MktAuditEntry,
  MktConfidence,
  MktDashboard,
  MktEvidenceOrigin,
  MktFreshness,
  MktInsight,
} from '@titan/shared';
import {
  canAccessMarketIntelligence,
  canManageMktSettings,
  MKT_FRESHNESS_LABELS,
  MKT_ORIGIN_LABELS,
  MKT_TOPIC_LABELS,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  decideMktInsight,
  decideMktOpportunity,
  fetchMktCompanyAudit,
  fetchMktDashboard,
  fetchMktInsightAudit,
  MarketIntelligenceApiClientError,
  refreshMktOpportunities,
  registerMktSource,
  updateMktSettings,
  updateMktSource,
} from '../../lib/market-intelligence-api-client';

type Tab = 'insights' | 'evidence' | 'withheld' | 'opportunities' | 'sources' | 'controls' | 'audit';

const CONFIDENCE_STYLES: Record<MktConfidence, string> = {
  high: 'border-emerald-500/50 bg-emerald-950/30 text-emerald-100',
  medium: 'border-sky-500/50 bg-sky-950/30 text-sky-100',
  low: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
  insufficient: 'border-slate-600/50 bg-slate-900/40 text-slate-300',
};

const FRESHNESS_TONE: Record<MktFreshness, string> = {
  fresh: 'text-emerald-300',
  recent: 'text-sky-300',
  stale: 'text-amber-300',
  expired: 'text-rose-300',
};

const ORIGIN_OPTIONS: MktEvidenceOrigin[] = [
  'public_source',
  'connected_provider',
  'manual_entry',
  'own_records',
];

function formatWhen(iso: string | null): string {
  if (!iso) return 'No observation date';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Unknown date';
  return new Date(parsed).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatMeasure(measure: MktInsight['measure']): string {
  if (!measure) return '';
  switch (measure.unit) {
    case 'percent':
      return `${measure.label}: ${measure.value.toFixed(1)}%`;
    case 'zar_cents':
      return `${measure.label}: R${(measure.value / 100).toFixed(2)}`;
    case 'rank':
      return `${measure.label}: #${measure.value}`;
    case 'days':
      return `${measure.label}: ${measure.value} day(s)`;
    default:
      return `${measure.label}: ${measure.value}`;
  }
}

export function MarketIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('insights');
  const [dashboard, setDashboard] = useState<MktDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companyAudit, setCompanyAudit] = useState<MktAuditEntry[]>([]);
  const [insightAudit, setInsightAudit] = useState<{
    insightKey: string;
    entries: MktAuditEntry[];
  } | null>(null);
  const [sourceDraft, setSourceDraft] = useState({
    sourceKey: '',
    label: '',
    origin: 'public_source' as MktEvidenceOrigin,
    reference: '',
    attested: false,
  });

  const canView = useMemo(
    () =>
      user
        ? canAccessMarketIntelligence({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const canManage = useMemo(
    () =>
      user
        ? canManageMktSettings({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    setDashboard(await fetchMktDashboard(accessToken));
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
            err instanceof MarketIntelligenceApiClientError
              ? err.message
              : 'Unable to load Market Intelligence',
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
        err instanceof MarketIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  async function openInsightAudit(insightKey: string) {
    if (!accessToken) return;
    try {
      setError(null);
      setInsightAudit({
        insightKey,
        entries: await fetchMktInsightAudit(accessToken, insightKey),
      });
    } catch (err) {
      setError(
        err instanceof MarketIntelligenceApiClientError ? err.message : 'Unable to load history',
      );
    }
  }

  async function openCompanyAudit() {
    if (!accessToken) return;
    try {
      setError(null);
      setCompanyAudit(await fetchMktCompanyAudit(accessToken));
    } catch (err) {
      setError(
        err instanceof MarketIntelligenceApiClientError ? err.message : 'Unable to load audit',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Market Intelligence" description="Competitors, trends, pricing and demand" />
        <EmptyState
          title="Access restricted"
          description="Market Intelligence is not available to this role. Market strategy, pricing and competitor topics are restricted."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'insights', label: 'What the evidence says' },
    { id: 'evidence', label: 'Coverage' },
    { id: 'withheld', label: 'Held back' },
    { id: 'opportunities', label: 'Recommendations' },
    { id: 'sources', label: 'Sources' },
    { id: 'controls', label: 'Controls' },
    { id: 'audit', label: 'Audit' },
  ];

  function renderInsight(item: MktInsight) {
    const isRecommendation = item.kind === 'aura_recommendation';
    return (
      <div
        key={item.insightKey}
        className={`rounded-lg border p-4 ${CONFIDENCE_STYLES[item.confidence]}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{item.headline}</h3>
          <span
            className={`text-xs uppercase tracking-wide ${
              isRecommendation ? 'text-violet-300' : 'text-slate-300'
            }`}
          >
            {isRecommendation ? 'AURA recommendation' : 'Measured fact'}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-90">{item.detail}</p>
        {item.measure ? (
          <p className="mt-2 text-sm font-medium opacity-95">{formatMeasure(item.measure)}</p>
        ) : null}
        <p className="mt-2 text-xs opacity-80">
          {item.topicLabel} · {item.availability} · confidence {item.confidence} ·{' '}
          <span className={FRESHNESS_TONE[item.freshness]}>
            {MKT_FRESHNESS_LABELS[item.freshness]}
          </span>{' '}
          · {item.recordCount} real record(s) · observed {formatWhen(item.observedAt)}
        </p>
        {item.caveat ? <p className="mt-1 text-xs text-amber-200">{item.caveat}</p> : null}

        {item.evidence.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs opacity-80">
            {item.evidence.map((entry) => (
              <li key={`${item.insightKey}-${entry.sourceKey}`}>
                {MKT_ORIGIN_LABELS[entry.origin]} — {entry.sourceLabel} ({entry.trust}) ·{' '}
                {entry.recordCount} record(s) · observed {formatWhen(entry.observedAt)} ·{' '}
                {entry.ageDays} day(s) old
                {entry.reference ? ` · ${entry.reference}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs opacity-75">
            No evidence is attached, so nothing is claimed here.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  void withFeedback(
                    () =>
                      decideMktInsight(accessToken ?? '', item.insightKey, {
                        decision: 'approve',
                      }),
                    'Approved. Marketing users can now see this insight.',
                  )
                }
              >
                Approve for marketing
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void withFeedback(
                    () =>
                      decideMktInsight(accessToken ?? '', item.insightKey, { decision: 'reject' }),
                    'Rejected. It stays in the audit history.',
                  )
                }
              >
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void withFeedback(
                    () =>
                      decideMktInsight(accessToken ?? '', item.insightKey, { decision: 'archive' }),
                    'Archived. It stays in the audit history.',
                  )
                }
              >
                Archive
              </Button>
            </>
          ) : null}
          <Button variant="secondary" onClick={() => void openInsightAudit(item.insightKey)}>
            History
          </Button>
        </div>
        <p className="mt-2 text-xs opacity-70">Publication status: {item.status}</p>

        {insightAudit?.insightKey === item.insightKey ? (
          <ul className="mt-3 space-y-1 text-xs opacity-80">
            {insightAudit.entries.length === 0 ? (
              <li>No decision has been recorded on this insight yet.</li>
            ) : (
              insightAudit.entries.map((entry) => (
                <li key={entry.id}>
                  {formatWhen(entry.occurredAt)} — {entry.kind}
                  {entry.notes ? ` — ${entry.notes}` : ''}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Market Intelligence"
        description="Competitors, industry trends, pricing, demand and market opportunities — from real evidence only"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/marketing-intelligence" className="yg-link">
          Marketing Intelligence
        </Link>
        <Link href="/sales-analytics-intelligence" className="yg-link">
          Sales Analytics
        </Link>
        <Link href="/leads" className="yg-link">
          Leads
        </Link>
        <Link href="/finance/quotes" className="yg-link">
          Quotes
        </Link>
        <Link href="/executive-command-centre" className="yg-link">
          Executive Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          Real evidence only. Every statement is labelled as a measured fact or an AURA
          recommendation and carries its source, observation date, freshness and confidence. A
          competitor price, market share, demand figure or trend is never invented — without enough
          evidence the answer is unavailable or needs verification. Nothing is fetched, scraped or
          called from here: this layer reads what a supported public source, a connected provider or
          a person already recorded. Pricing, supplier cost and new-service strategy are Owner only,
          and marketing users see approved insights only. AURA recommends; approval records a
          decision and never changes a price, starts or funds an advert, publishes content or
          contacts a customer.
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
        {tabs.map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? 'primary' : 'secondary'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <EmptyState title="Loading" description="Loading Market Intelligence…" />
      ) : (
        <>
          <Panel title="Summary">
            <p className="text-sm text-slate-300">{dashboard.summary}</p>
            <p className="mt-2 text-xs text-slate-400">{dashboard.scopeRationale}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Measured facts" value={String(dashboard.factCount)} />
              <StatCard
                label="AURA recommendations"
                value={String(dashboard.recommendationCount)}
                hint="Never acted on automatically"
              />
              <StatCard
                label="Held back"
                value={String(dashboard.withheld.length)}
                hint="Each with a stated reason"
              />
              <StatCard
                label="Real records read"
                value={String(dashboard.totalEvidenceRecords)}
                hint="Captured records, leads, quotes, jobs and keywords"
              />
            </div>
          </Panel>

          {tab === 'insights' ? (
            <div className="space-y-3">
              {dashboard.insights.length === 0 ? (
                <EmptyState
                  title="No market insight yet"
                  description={
                    dashboard.totalEvidenceRecords === 0
                      ? 'No market evidence exists for this company yet. Nothing is invented to fill the page.'
                      : 'Real records exist but none of them meet the evidence, freshness or source rules the Owner set. Held-back items are listed under Held back with the reason.'
                  }
                />
              ) : (
                dashboard.insights.map(renderInsight)
              )}
            </div>
          ) : null}

          {tab === 'evidence' ? (
            <Panel title="What each topic is actually backed by">
              <ul className="space-y-2 text-sm text-slate-300">
                {dashboard.coverage.map((entry) => (
                  <li key={entry.topic}>
                    <span className="font-medium">{entry.label}</span>: {entry.availability}
                    {entry.recordCount > 0 ? ` (${entry.recordCount} record(s))` : ''}
                    {entry.rationale ? (
                      <>
                        <br />
                        <span className="text-xs text-slate-400">{entry.rationale}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>

              <h3 className="mt-6 text-sm font-semibold text-slate-200">What this layer is</h3>
              <p className="mt-1 text-xs text-slate-400">
                {dashboard.productClarification.thisLayer}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {dashboard.productClarification.marketingSuite}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {dashboard.productClarification.noExternalActions}
              </p>
            </Panel>
          ) : null}

          {tab === 'withheld' ? (
            <Panel title="Held back from this view">
              {dashboard.withheld.length === 0 ? (
                <p className="text-sm text-slate-300">Nothing is being held back.</p>
              ) : (
                <ul className="space-y-2">
                  {dashboard.withheld.map((held) => (
                    <li key={`${held.insightKey}-${held.reason}`} className="text-sm text-slate-300">
                      <span className="font-medium">{MKT_TOPIC_LABELS[held.topic]}</span>{' '}
                      <span className="text-xs text-slate-400">({held.insightKey})</span>
                      <br />
                      <span className="text-xs text-slate-400">{held.explanation}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'opportunities' ? (
            <Panel title="Recommendations awaiting a decision">
              <p className="text-sm text-slate-300">
                Recommendations are drafted only from insights that already stand on their own
                evidence. Approving one records an Owner decision — it never changes a price, starts
                or funds an advert, publishes content or contacts a customer.
              </p>
              <div className="my-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void withFeedback(
                      () => refreshMktOpportunities(accessToken ?? '', { submitForApproval: true }),
                      'Recommendations drafted from the current evidence.',
                    )
                  }
                >
                  Draft from current evidence
                </Button>
              </div>
              {dashboard.opportunities.length === 0 ? (
                <p className="text-sm text-slate-300">
                  No recommendation has been drafted. Recommendations are only created from
                  well-evidenced, current facts.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dashboard.opportunities.map((opportunity) => (
                    <li key={opportunity.id} className="rounded-lg border border-slate-700 p-3">
                      <p className="text-sm font-semibold text-slate-100">{opportunity.title}</p>
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-400">
                        {opportunity.body}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {opportunity.status} · confidence {opportunity.confidence} · created{' '}
                        {formatWhen(opportunity.createdAt)}
                      </p>
                      {canManage &&
                      (opportunity.status === 'draft' ||
                        opportunity.status === 'pending_approval') ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decideMktOpportunity(accessToken ?? '', opportunity.id, {
                                    decision: 'approve',
                                  }),
                                'Approved. The decision is recorded and nothing was executed.',
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
                                  decideMktOpportunity(accessToken ?? '', opportunity.id, {
                                    decision: 'reject',
                                  }),
                                'Rejected.',
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
          ) : null}

          {tab === 'sources' ? (
            <div className="space-y-4">
              <Panel title="Registered sources">
                <p className="text-sm text-slate-300">
                  An observation may only be trusted once the Owner has registered the source it
                  cites as a supported public source or connected provider that may lawfully be
                  used. Nothing is fetched from any source here.
                </p>
                {dashboard.sources.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-300">
                    {canManage
                      ? 'No source has been registered yet, so every captured observation is reported as needing verification.'
                      : 'The source register is an Owner control and is not shown to your role.'}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {dashboard.sources.map((source) => (
                      <li key={source.id} className="rounded-lg border border-slate-700 p-3">
                        <p className="text-sm font-medium text-slate-100">{source.label}</p>
                        <p className="text-xs text-slate-400">
                          {source.sourceKey} · {MKT_ORIGIN_LABELS[source.origin]} · {source.trust} ·{' '}
                          {source.observationCount} observation(s) · last observed{' '}
                          {formatWhen(source.lastObservedAt)}
                        </p>
                        {canManage && !source.verified ? (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  updateMktSource(accessToken ?? '', source.id, {
                                    verified: true,
                                  }),
                                'Source marked verified.',
                              )
                            }
                          >
                            Mark verified
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {dashboard.unregisteredSources.length > 0 ? (
                <Panel
                  title="Cited but not registered"
                  className="border-amber-500/40 bg-amber-950/20 text-amber-100"
                >
                  <p className="text-sm">
                    These sources appear on captured observations but are not in the register, so
                    anything they back is reported as needing verification:{' '}
                    {dashboard.unregisteredSources.join(', ')}.
                  </p>
                </Panel>
              ) : null}

              {canManage ? (
                <Panel title="Register a source">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-400">
                      Source key
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                        value={sourceDraft.sourceKey}
                        onChange={(event) =>
                          setSourceDraft({ ...sourceDraft, sourceKey: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Label
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                        value={sourceDraft.label}
                        onChange={(event) =>
                          setSourceDraft({ ...sourceDraft, label: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Origin
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                        value={sourceDraft.origin}
                        onChange={(event) =>
                          setSourceDraft({
                            ...sourceDraft,
                            origin: event.target.value as MktEvidenceOrigin,
                          })
                        }
                      >
                        {ORIGIN_OPTIONS.map((origin) => (
                          <option key={origin} value={origin}>
                            {MKT_ORIGIN_LABELS[origin]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate-400">
                      Reference
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                        value={sourceDraft.reference}
                        onChange={(event) =>
                          setSourceDraft({ ...sourceDraft, reference: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={sourceDraft.attested}
                      onChange={(event) =>
                        setSourceDraft({ ...sourceDraft, attested: event.target.checked })
                      }
                    />
                    <span>
                      I confirm this is a supported public source or a connected provider whose data
                      this business may lawfully use. Registering a source does not fetch anything
                      from it.
                    </span>
                  </label>
                  <div className="mt-3">
                    <Button
                      onClick={() =>
                        void withFeedback(
                          () =>
                            registerMktSource(accessToken ?? '', {
                              sourceKey: sourceDraft.sourceKey,
                              label: sourceDraft.label,
                              origin: sourceDraft.origin,
                              permitted: true,
                              reference: sourceDraft.reference || null,
                            }),
                          'Source registered.',
                        )
                      }
                      disabled={
                        !sourceDraft.attested ||
                        !sourceDraft.sourceKey.trim() ||
                        !sourceDraft.label.trim()
                      }
                    >
                      Register source
                    </Button>
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'controls' ? (
            <div className="space-y-4">
              {!canManage ? (
                <Panel title="Owner controls">
                  <p className="text-sm text-slate-300">
                    The evidence, freshness and publication rules are set by the Owner. Your view
                    follows those settings.
                  </p>
                </Panel>
              ) : (
                <Panel title="Evidence and publication rules">
                  <p className="text-sm text-slate-300">
                    Reading {dashboard.settings.lookbackDays} day(s) of your own records. An
                    observation older than {dashboard.settings.stalenessDays} day(s) is reported as
                    stale. At least {dashboard.settings.minEvidenceRecords} real record(s) must sit
                    behind any claim.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Lookback</span>
                    {[90, 180, 365, 730].map((days) => (
                      <Button
                        key={days}
                        variant={dashboard.settings.lookbackDays === days ? 'primary' : 'secondary'}
                        onClick={() =>
                          void withFeedback(
                            () => updateMktSettings(accessToken ?? '', { lookbackDays: days }),
                            'Lookback window updated.',
                          )
                        }
                      >
                        {days}d
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Freshness window</span>
                    {[7, 30, 90, 180].map((days) => (
                      <Button
                        key={days}
                        variant={dashboard.settings.stalenessDays === days ? 'primary' : 'secondary'}
                        onClick={() =>
                          void withFeedback(
                            () => updateMktSettings(accessToken ?? '', { stalenessDays: days }),
                            'Freshness window updated.',
                          )
                        }
                      >
                        {days}d
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Minimum records behind a claim</span>
                    {[1, 5, 10, 25].map((records) => (
                      <Button
                        key={records}
                        variant={
                          dashboard.settings.minEvidenceRecords === records ? 'primary' : 'secondary'
                        }
                        onClick={() =>
                          void withFeedback(
                            () =>
                              updateMktSettings(accessToken ?? '', {
                                minEvidenceRecords: records,
                              }),
                            'Minimum evidence updated.',
                          )
                        }
                      >
                        {records}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void withFeedback(
                          () =>
                            updateMktSettings(accessToken ?? '', {
                              requireRegisteredSource:
                                !dashboard.settings.requireRegisteredSource,
                            }),
                          'Source requirement updated.',
                        )
                      }
                    >
                      {dashboard.settings.requireRegisteredSource
                        ? 'Allow unregistered sources to back an insight'
                        : 'Require a registered source'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void withFeedback(
                          () =>
                            updateMktSettings(accessToken ?? '', {
                              publishApprovedOnly: !dashboard.settings.publishApprovedOnly,
                            }),
                          'Publication rule updated.',
                        )
                      }
                    >
                      {dashboard.settings.publishApprovedOnly
                        ? 'Show marketing users unapproved insights too'
                        : 'Show marketing users approved insights only'}
                    </Button>
                  </div>
                </Panel>
              )}
            </div>
          ) : null}

          {tab === 'audit' ? (
            <Panel title="Decision history">
              <p className="text-sm text-slate-300">
                Every source registration, publication decision and recommendation decision is
                recorded. Archiving hides an insight from the marketing view; it never removes the
                history.
              </p>
              {canManage ? (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => void openCompanyAudit()}>
                    Load company history
                  </Button>
                </div>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {companyAudit.length === 0 ? (
                  <li>No history loaded.</li>
                ) : (
                  companyAudit.map((entry) => (
                    <li key={entry.id}>
                      {formatWhen(entry.occurredAt)} — {entry.kind}
                      {entry.insightKey ? ` — ${entry.insightKey}` : ''}
                      {entry.notes ? ` — ${entry.notes}` : ''}
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          ) : null}

          {dashboard.hiddenTopics.length > 0 ? (
            <Panel title="Not shown to your role">
              <p className="text-sm text-slate-300">
                {dashboard.hiddenTopics.map((topic) => MKT_TOPIC_LABELS[topic]).join(', ')}.
              </p>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
