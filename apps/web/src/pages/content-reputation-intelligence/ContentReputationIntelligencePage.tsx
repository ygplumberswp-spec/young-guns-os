import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { CriContentCategory, CriDashboard, CriObservationKind } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeCriInsight,
  ContentReputationApiClientError,
  createCriAuraInsight,
  createCriCompetitor,
  createCriObservation,
  createCriReview,
  createCriReviewResponseDraft,
  decideCriReviewResponse,
  decideCriSuggestion,
  fetchCriDashboard,
  generateCriSuggestion,
  scoreCriContent,
  syncCriSocialReviews,
} from '../../lib/content-reputation-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'content'
  | 'reputation'
  | 'competitors'
  | 'aura';

const CATEGORIES: CriContentCategory[] = [
  'content_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal',
  'education',
  'customer_focused',
  'maintenance_reminder',
  'geyser_education',
  'before_after',
  'trust_building',
  'video_review',
  'trend',
  'improvement',
];

const OBS_KINDS: CriObservationKind[] = [
  'industry_trend',
  'market_observation',
  'pricing_observation',
  'competitor_note',
  'other',
];

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('marketing:read') ||
    permissions.includes('marketing:write') ||
    permissions.includes('marketing_intelligence:read') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('marketing:write') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing_intelligence:manage')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*') || permissions.includes('marketing_intelligence:manage')) {
    return true;
  }
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function ContentReputationIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<CriDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [category, setCategory] = useState<CriContentCategory>('maintenance_reminder');
  const [topicHint, setTopicHint] = useState('');
  const [scoreBody, setScoreBody] = useState('');
  const [scoreResult, setScoreResult] = useState<string | null>(null);

  const [reviewBody, setReviewBody] = useState('');
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewRating, setReviewRating] = useState('');

  const [competitorName, setCompetitorName] = useState('');
  const [obsKind, setObsKind] = useState<CriObservationKind>('market_observation');
  const [obsTitle, setObsTitle] = useState('');
  const [obsBody, setObsBody] = useState('');

  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');

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
    const data = await fetchCriDashboard(accessToken);
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
            err instanceof ContentReputationApiClientError
              ? err.message
              : 'Unable to load Content & Reputation Intelligence',
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

  async function withFeedback(action: () => Promise<void>, ok: string) {
    try {
      setError(null);
      setSuccess(null);
      await action();
      await loadPage();
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof ContentReputationApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Content & Reputation"
          description="Marketing intelligence extension"
        />
        <EmptyState
          title="Access restricted"
          description="Marketing or marketing-intelligence permissions are required. Technicians and clients cannot access this surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'content', label: 'Content' },
    { id: 'reputation', label: 'Reputation' },
    { id: 'competitors', label: 'Competitors' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Content & Reputation Intelligence"
        description="Quality scoring, reputation foundation, and Owner-entered competitor notes — extending Marketing Agent"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/marketing-agent" className="text-cyan-300 hover:underline">
          Marketing Agent
        </Link>
        <Link href="/social-media-integrations" className="text-cyan-300 hover:underline">
          Social Media
        </Link>
        <Link href="/communication-timeline" className="text-cyan-300 hover:underline">
          Communication Timeline
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
        <Link href="/customer-experience" className="text-cyan-300 hover:underline">
          Customer Experience
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No automatic publishing. No automatic review replies. Owner approval required for
          outbound drafts. Scores and sentiment stay unavailable when there is no real signal —
          never invented.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Saved" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
          <p className="text-sm">{success}</p>
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
          <p className="text-sm text-slate-400">Loading Content & Reputation Intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {dashboard.productClarification.thisLayer}
                </p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Pending approvals"
                  value={String(dashboard.pendingApprovals)}
                />
                <StatCard
                  label="Suggestions"
                  value={String(dashboard.contentSuggestions.length)}
                />
                <StatCard label="Reviews" value={String(dashboard.reviews.length)} />
                <StatCard
                  label="Reputation"
                  value={
                    dashboard.reputation.availability === 'available'
                      ? String(dashboard.reputation.reputationScore)
                      : 'n/a'
                  }
                />
              </div>
              <Panel title="Reputation honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.reputation.csatInsight}</p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.reputation.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'content' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Generate draft suggestion" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="space-y-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          generateCriSuggestion(accessToken!, {
                            category,
                            topicHint: topicHint || undefined,
                            submitForApproval: true,
                          }).then(() => undefined),
                        'Content suggestion queued for Owner approval (not published).',
                      );
                    }}
                  >
                    <label className="block text-xs text-slate-400">
                      Category
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as CriContentCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Topic hint"
                      value={topicHint}
                      onChange={(e) => setTopicHint(e.target.value)}
                      placeholder="e.g. geyser pressure valve"
                    />
                    <Button type="submit">Generate + submit for approval</Button>
                  </form>
                </Panel>
              ) : null}

              <Panel title="Score real draft text" className="border-slate-800 bg-slate-950/80">
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(async () => {
                      const quality = await scoreCriContent(accessToken!, { body: scoreBody });
                      setScoreResult(
                        quality.availability === 'unavailable'
                          ? quality.brandConsistency.findings.join(' ')
                          : `Score ${quality.overallScore} · brand ${quality.brandConsistency.status} · engagement ${quality.engagementPrediction.availability}/${quality.engagementPrediction.band ?? 'n/a'}`,
                      );
                    }, 'Quality scored from provided draft text only.');
                  }}
                >
                  <label className="block text-xs text-slate-400">
                    Draft / campaign body
                    <textarea
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                      rows={4}
                      value={scoreBody}
                      onChange={(e) => setScoreBody(e.target.value)}
                      placeholder="Paste real draft content to score — empty yields unavailable"
                    />
                  </label>
                  <Button type="submit">Score content</Button>
                  {scoreResult ? (
                    <p className="text-xs text-cyan-300/80">{scoreResult}</p>
                  ) : null}
                </form>
              </Panel>

              {dashboard.contentSuggestions.length === 0 ? (
                <EmptyState
                  title="No content suggestions"
                  description="Generate plumbing/education/seasonal draft templates — nothing is published automatically."
                />
              ) : (
                dashboard.contentSuggestions.map((s) => (
                  <Panel key={s.id} title={s.title} className="border-slate-800 bg-slate-950/80">
                    <p className="text-xs text-slate-500">
                      {s.category} · {s.status}
                      {s.qualityAvailability === 'available'
                        ? ` · quality ${s.qualityScore}`
                        : ' · quality unavailable'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{s.body}</p>
                    {s.hashtags.length ? (
                      <p className="mt-2 text-xs text-cyan-300/80">{s.hashtags.join(' ')}</p>
                    ) : null}
                    {canOwnerApprove &&
                    (s.status === 'pending_approval' || s.status === 'draft') ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideCriSuggestion(accessToken!, s.id, {
                                  decision: 'approve',
                                }).then(() => undefined),
                              'Suggestion approved (not published).',
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideCriSuggestion(accessToken!, s.id, {
                                  decision: 'reject',
                                }).then(() => undefined),
                              'Suggestion rejected.',
                            )
                          }
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

          {tab === 'reputation' ? (
            <div className="space-y-4">
              <Panel title="Reputation scoring" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  Availability: {dashboard.reputation.availability}
                  {dashboard.reputation.reputationScore != null
                    ? ` · score ${dashboard.reputation.reputationScore}`
                    : ''}
                  {dashboard.reputation.averageRating != null
                    ? ` · avg rating ${dashboard.reputation.averageRating}`
                    : ''}
                </p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.reputation.csatInsight}</p>
              </Panel>

              {canManage ? (
                <>
                  <Panel title="Record Owner-verified review" className="border-slate-800 bg-slate-950/80">
                    <form
                      className="space-y-3"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void withFeedback(
                          () =>
                            createCriReview(accessToken!, {
                              body: reviewBody,
                              authorName: reviewAuthor || undefined,
                              rating: reviewRating
                                ? Number.parseInt(reviewRating, 10)
                                : undefined,
                              source: 'owner_entered',
                            }).then(() => undefined),
                          'Review stored (no demo data invented).',
                        );
                        setReviewBody('');
                        setReviewAuthor('');
                        setReviewRating('');
                      }}
                    >
                      <Input
                        label="Author"
                        value={reviewAuthor}
                        onChange={(e) => setReviewAuthor(e.target.value)}
                      />
                      <Input
                        label="Rating (1–5, optional)"
                        value={reviewRating}
                        onChange={(e) => setReviewRating(e.target.value)}
                      />
                      <label className="block text-xs text-slate-400">
                        Review body
                        <textarea
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          rows={3}
                          value={reviewBody}
                          onChange={(e) => setReviewBody(e.target.value)}
                          required
                        />
                      </label>
                      <Button type="submit">Save review</Button>
                    </form>
                  </Panel>
                  <Button
                    type="button"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          syncCriSocialReviews(accessToken!).then((r) => {
                            setSuccess(
                              `Imported ${r.imported} social monitoring review(s) when present.`,
                            );
                          }),
                        'Social review sync attempted (real rows only).',
                      )
                    }
                  >
                    Sync social monitoring reviews
                  </Button>
                </>
              ) : null}

              {dashboard.reviews.length === 0 ? (
                <EmptyState
                  title="No reviews"
                  description="Sentiment and reputation stay unavailable until real review rows exist (Owner-entered, social monitoring, or CX)."
                />
              ) : (
                dashboard.reviews.map((r) => (
                  <Panel
                    key={r.id}
                    title={r.authorName || 'Review'}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-xs text-slate-500">
                      {r.source}
                      {r.platform ? ` · ${r.platform}` : ''}
                      {r.rating != null ? ` · ${r.rating}/5` : ''} · sentiment {r.sentiment}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.body}</p>
                    {canManage && !r.id.startsWith('social:') ? (
                      <Button
                        type="button"
                        className="mt-3"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              createCriReviewResponseDraft(accessToken!, {
                                reviewId: r.id,
                                submitForApproval: true,
                              }).then(() => undefined),
                            'Review response draft queued (not sent).',
                          )
                        }
                      >
                        Draft response for approval
                      </Button>
                    ) : null}
                  </Panel>
                ))
              )}

              {dashboard.reviewResponseDrafts.map((d) => (
                <Panel key={d.id} title={d.title} className="border-slate-800 bg-slate-950/80">
                  <p className="text-xs text-slate-500">
                    {d.status} · autoReply=false
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{d.body}</p>
                  {canOwnerApprove &&
                  (d.status === 'pending_approval' || d.status === 'draft') ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              decideCriReviewResponse(accessToken!, d.id, {
                                decision: 'approve',
                              }).then(() => undefined),
                            'Response approved (not sent / not published).',
                          )
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              decideCriReviewResponse(accessToken!, d.id, {
                                decision: 'reject',
                              }).then(() => undefined),
                            'Response rejected.',
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : null}

          {tab === 'competitors' ? (
            <div className="space-y-4">
              <Panel title="Competitor foundation" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-400">
                  Owner-entered competitors and observations only. No scraping. No invented
                  competitor lists.
                </p>
              </Panel>
              {canManage ? (
                <>
                  <Panel title="Add competitor" className="border-slate-800 bg-slate-950/80">
                    <form
                      className="space-y-3"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void withFeedback(
                          () =>
                            createCriCompetitor(accessToken!, {
                              name: competitorName,
                            }).then(() => undefined),
                          'Competitor saved (Owner-entered).',
                        );
                        setCompetitorName('');
                      }}
                    >
                      <Input
                        label="Name"
                        value={competitorName}
                        onChange={(e) => setCompetitorName(e.target.value)}
                        required
                      />
                      <Button type="submit">Save competitor</Button>
                    </form>
                  </Panel>
                  <Panel title="Add observation" className="border-slate-800 bg-slate-950/80">
                    <form
                      className="space-y-3"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void withFeedback(
                          () =>
                            createCriObservation(accessToken!, {
                              kind: obsKind,
                              title: obsTitle,
                              body: obsBody,
                            }).then(() => undefined),
                          'Observation saved.',
                        );
                        setObsTitle('');
                        setObsBody('');
                      }}
                    >
                      <label className="block text-xs text-slate-400">
                        Kind
                        <select
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          value={obsKind}
                          onChange={(e) => setObsKind(e.target.value as CriObservationKind)}
                        >
                          {OBS_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        label="Title"
                        value={obsTitle}
                        onChange={(e) => setObsTitle(e.target.value)}
                        required
                      />
                      <label className="block text-xs text-slate-400">
                        Observation
                        <textarea
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          rows={3}
                          value={obsBody}
                          onChange={(e) => setObsBody(e.target.value)}
                          required
                        />
                      </label>
                      <Button type="submit">Save observation</Button>
                    </form>
                  </Panel>
                </>
              ) : null}

              {dashboard.competitors.length === 0 ? (
                <EmptyState
                  title="No competitors"
                  description="Add Owner-entered competitor records only — never invent market players."
                />
              ) : (
                dashboard.competitors.map((c) => (
                  <Panel key={c.id} title={c.name} className="border-slate-800 bg-slate-950/80">
                    <p className="text-sm text-slate-400">{c.notes || 'No notes'}</p>
                    {c.website ? (
                      <p className="mt-1 text-xs text-cyan-300/80">{c.website}</p>
                    ) : null}
                  </Panel>
                ))
              )}

              {dashboard.observations.map((o) => (
                <Panel key={o.id} title={o.title} className="border-slate-800 bg-slate-950/80">
                  <p className="text-xs text-slate-500">{o.kind}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{o.body}</p>
                </Panel>
              ))}
            </div>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Surface insight" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="space-y-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createCriAuraInsight(accessToken!, {
                            target: 'command_centre',
                            title: insightTitle,
                            insight: insightBody,
                            href: '/aura/command-centre',
                          }).then(() => undefined),
                        'AURA insight recorded (real insight text only).',
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
                    <label className="block text-xs text-slate-400">
                      Insight
                      <textarea
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        rows={3}
                        value={insightBody}
                        onChange={(e) => setInsightBody(e.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit">Create Command Centre insight</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.auraInsights.map((i) => (
                <Panel key={i.id} title={i.title} className="border-slate-800 bg-slate-950/80">
                  <p className="text-xs text-slate-500">
                    {i.target} · {i.status}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{i.insight}</p>
                  {canManage && i.status === 'open' ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              acknowledgeCriInsight(accessToken!, i.id, {
                                status: 'acknowledged',
                              }).then(() => undefined),
                            'Insight acknowledged.',
                          )
                        }
                      >
                        Acknowledge
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              acknowledgeCriInsight(accessToken!, i.id, {
                                status: 'dismissed',
                              }).then(() => undefined),
                            'Insight dismissed.',
                          )
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}

              {dashboard.auraConnections.map((c) => (
                <Panel key={c.target} title={c.label} className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">{c.note}</p>
                  <Link
                    href={c.href}
                    className="mt-2 inline-block text-sm text-cyan-300 hover:underline"
                  >
                    Open {c.label}
                  </Link>
                </Panel>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
