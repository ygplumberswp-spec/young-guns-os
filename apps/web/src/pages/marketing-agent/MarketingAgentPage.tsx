import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { MktAgentContentKind, MktAgentDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  createMktAgentCampaign,
  createMktAgentGoal,
  createMktAgentRecommendation,
  decideMktAgentDraft,
  decideMktAgentRecommendation,
  generateMktAgentContent,
  fetchMktAgentDashboard,
  MarketingAgentApiClientError,
  requestMktAgentPublish,
} from '../../lib/marketing-agent-api-client';

type Tab = 'dashboard' | 'campaigns' | 'content' | 'goals' | 'analytics' | 'aura';

const CONTENT_KINDS: MktAgentContentKind[] = [
  'post_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal_promo',
  'educational',
  'plumbing_tip',
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

export function MarketingAgentPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<MktAgentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [campaignName, setCampaignName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [contentKind, setContentKind] = useState<MktAgentContentKind>('post_idea');
  const [topicHint, setTopicHint] = useState('');
  const [recTitle, setRecTitle] = useState('');
  const [recBody, setRecBody] = useState('');

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
    const data = await fetchMktAgentDashboard(accessToken);
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
            err instanceof MarketingAgentApiClientError
              ? err.message
              : 'Unable to load Marketing Agent',
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

  async function handleCreateCampaign(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !campaignName.trim() || !campaignObjective.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createMktAgentCampaign(accessToken, {
        name: campaignName.trim(),
        objective: campaignObjective.trim(),
        channels: ['instagram', 'facebook'],
      });
      setCampaignName('');
      setCampaignObjective('');
      setSuccess('Campaign created as draft — nothing published.');
      await loadPage();
    } catch (err) {
      setError(err instanceof MarketingAgentApiClientError ? err.message : 'Unable to create campaign');
    }
  }

  async function handleCreateGoal(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !goalTitle.trim() || !goalDescription.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createMktAgentGoal(accessToken, {
        title: goalTitle.trim(),
        description: goalDescription.trim(),
      });
      setGoalTitle('');
      setGoalDescription('');
      setSuccess('Marketing goal saved. Current metrics stay empty until real measurements exist.');
      await loadPage();
    } catch (err) {
      setError(err instanceof MarketingAgentApiClientError ? err.message : 'Unable to create goal');
    }
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await generateMktAgentContent(accessToken, {
        contentKind,
        topicHint: topicHint.trim() || undefined,
        submitForApproval: true,
      });
      setTopicHint('');
      setSuccess('Content draft generated for Owner approval — not published.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof MarketingAgentApiClientError ? err.message : 'Unable to generate content',
      );
    }
  }

  async function handleCreateRecommendation(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !recTitle.trim() || !recBody.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createMktAgentRecommendation(accessToken, {
        kind: 'content_plan',
        title: recTitle.trim(),
        recommendation: recBody.trim(),
      });
      setRecTitle('');
      setRecBody('');
      setSuccess('Recommendation queued for Owner approval — not auto-executed.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof MarketingAgentApiClientError
          ? err.message
          : 'Unable to create recommendation',
      );
    }
  }

  async function handleDecideDraft(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canOwnerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await decideMktAgentDraft(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Draft approved — not published. Social publish remains gated.'
          : 'Draft rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(err instanceof MarketingAgentApiClientError ? err.message : 'Unable to decide draft');
    }
  }

  async function handlePublish(id: string) {
    if (!accessToken || !canOwnerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await requestMktAgentPublish(accessToken, id);
      setSuccess(result.reason);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof MarketingAgentApiClientError ? err.message : 'Unable to request publish',
      );
    }
  }

  async function handleDecideRec(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canOwnerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await decideMktAgentRecommendation(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Recommendation approved (not auto-executed).'
          : 'Recommendation rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof MarketingAgentApiClientError
          ? err.message
          : 'Unable to decide recommendation',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Marketing Agent"
          description="Campaign drafts, content intelligence, and Owner-gated publish paths."
        />
        <EmptyState
          title="Access restricted"
          description="Requires marketing or marketing-intelligence access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Agent"
        description="Campaign foundation, plumbing & educational content drafts, recommendations, and analytics from real stored activity only."
      />

      <p className="text-sm text-slate-400">
        <Link href="/marketing" className="text-cyan-300 hover:underline">
          Marketing
        </Link>
        {' · '}
        <Link href="/marketing-intelligence" className="text-cyan-300 hover:underline">
          Marketing Intelligence
        </Link>
        {' · '}
        <Link href="/communication-timeline" className="text-cyan-300 hover:underline">
          Communication Timeline
        </Link>
        {' · '}
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['campaigns', 'Campaigns'],
            ['content', `Content (${dashboard?.analytics.pendingApprovals ?? 0})`],
            ['goals', 'Goals'],
            ['analytics', 'Analytics'],
            ['aura', 'AURA links'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === key
                ? 'bg-cyan-700/40 text-cyan-100 ring-1 ring-cyan-500/50'
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
        <Panel title="Status" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
          {success}
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">Loading Marketing Agent…</Panel>
      ) : !dashboard ? (
        <EmptyState
          title="No data"
          description="Unable to load Marketing Agent dashboard."
        />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-6">
              <Panel title="Honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  <li>{dashboard.productClarification.thisLayer}</li>
                  <li>{dashboard.productClarification.socialIntegrations}</li>
                </ul>
                <p className="mt-2 text-xs text-cyan-300/80">
                  Auto-publish: off · Owner approval required · Social integrations: not live
                </p>
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Campaigns" value={String(dashboard.analytics.campaignCount)} />
                <StatCard label="Drafts" value={String(dashboard.analytics.draftCount)} />
                <StatCard
                  label="Pending approvals"
                  value={String(dashboard.analytics.pendingApprovals)}
                />
                <StatCard label="Active goals" value={String(dashboard.analytics.activeGoals)} />
              </div>
            </div>
          ) : null}

          {tab === 'campaigns' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create campaign draft" className="border-slate-800 bg-slate-950/80">
                  <form className="space-y-3" onSubmit={handleCreateCampaign}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Name
                      <Input
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        placeholder="e.g. Winter maintenance awareness"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Objective
                      <Input
                        value={campaignObjective}
                        onChange={(e) => setCampaignObjective(e.target.value)}
                        placeholder="What should this campaign achieve?"
                      />
                    </label>
                    <Button type="submit">Save campaign draft</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.campaigns.length === 0 ? (
                <EmptyState
                  title="No campaigns"
                  description="No campaign records yet. Create a draft when ready — no demo campaigns are seeded."
                />
              ) : (
                dashboard.campaigns.map((c) => (
                  <Panel key={c.id} title={c.name} className="border-slate-800 bg-slate-950/80">
                    <p className="text-sm text-slate-300">{c.objective}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Status: {c.status} · Channels: {c.channels.join(', ') || 'none'} · Auto-publish:
                      off
                    </p>
                  </Panel>
                ))
              )}

              {canManage ? (
                <Panel title="Add recommendation" className="border-slate-800 bg-slate-950/80">
                  <form className="space-y-3" onSubmit={handleCreateRecommendation}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Title
                      <Input
                        value={recTitle}
                        onChange={(e) => setRecTitle(e.target.value)}
                        placeholder="Recommendation title"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Detail
                      <Input
                        value={recBody}
                        onChange={(e) => setRecBody(e.target.value)}
                        placeholder="What should the Owner consider?"
                      />
                    </label>
                    <Button type="submit">Queue for Owner approval</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.recommendations.map((r) => (
                <Panel key={r.id} title={r.title} className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">{r.recommendation}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {r.kind} · {r.status} · Auto-executed: never
                  </p>
                  {canOwnerApprove && r.status === 'pending_approval' ? (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" onClick={() => void handleDecideRec(r.id, 'approve')}>
                        Approve
                      </Button>
                      <Button type="button" onClick={() => void handleDecideRec(r.id, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : null}

          {tab === 'content' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel
                  title="Generate content draft"
                  className="border-slate-800 bg-slate-950/80"
                >
                  <form className="space-y-3" onSubmit={handleGenerate}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Kind
                      <select
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                        value={contentKind}
                        onChange={(e) => setContentKind(e.target.value as MktAgentContentKind)}
                      >
                        {CONTENT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Topic hint (optional)
                      <Input
                        value={topicHint}
                        onChange={(e) => setTopicHint(e.target.value)}
                        placeholder="e.g. geyser maintenance"
                      />
                    </label>
                    <Button type="submit">Generate draft for approval</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.contentDrafts.length === 0 ? (
                <EmptyState
                  title="No content drafts"
                  description="Generate plumbing tips, captions, hashtags, or campaign ideas as drafts. Nothing is posted automatically."
                />
              ) : (
                dashboard.contentDrafts.map((d) => (
                  <Panel key={d.id} title={d.title} className="border-slate-800 bg-slate-950/80">
                    <p className="whitespace-pre-wrap text-sm text-slate-300">{d.body}</p>
                    {d.hashtags.length > 0 ? (
                      <p className="mt-2 text-xs text-cyan-300/80">{d.hashtags.join(' ')}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {d.contentKind} · {d.channel} · {d.status} · Social publish: unavailable
                    </p>
                    {canOwnerApprove &&
                    (d.status === 'pending_approval' || d.status === 'draft') ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void handleDecideDraft(d.id, 'approve')}>
                          Owner approve
                        </Button>
                        <Button type="button" onClick={() => void handleDecideDraft(d.id, 'reject')}>
                          Reject
                        </Button>
                      </div>
                    ) : null}
                    {canOwnerApprove && d.status === 'approved' ? (
                      <div className="mt-3">
                        <Button type="button" onClick={() => void handlePublish(d.id)}>
                          Request publish (gated)
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'goals' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create marketing goal" className="border-slate-800 bg-slate-950/80">
                  <form className="space-y-3" onSubmit={handleCreateGoal}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Title
                      <Input
                        value={goalTitle}
                        onChange={(e) => setGoalTitle(e.target.value)}
                        placeholder="e.g. Grow local awareness"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Description
                      <Input
                        value={goalDescription}
                        onChange={(e) => setGoalDescription(e.target.value)}
                        placeholder="Describe the goal without inventing metrics"
                      />
                    </label>
                    <Button type="submit">Save goal</Button>
                  </form>
                </Panel>
              ) : null}

              {dashboard.goals.length === 0 ? (
                <EmptyState
                  title="No goals"
                  description="No marketing goals stored yet. Current values stay empty until real measurements exist."
                />
              ) : (
                dashboard.goals.map((g) => (
                  <Panel key={g.id} title={g.title} className="border-slate-800 bg-slate-950/80">
                    <p className="text-sm text-slate-300">{g.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Status: {g.status} · Current:{' '}
                      {g.currentValue === null ? 'unavailable' : g.currentValue} · Target:{' '}
                      {g.targetValue === null ? 'unset' : g.targetValue}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'analytics' ? (
            <div className="space-y-4">
              <Panel title="Activity (real stored only)" className="border-slate-800 bg-slate-950/80">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <StatCard label="Campaigns" value={String(dashboard.analytics.campaignCount)} />
                  <StatCard label="Drafts" value={String(dashboard.analytics.draftCount)} />
                  <StatCard
                    label="Approved drafts"
                    value={String(dashboard.analytics.approvedDrafts)}
                  />
                  <StatCard
                    label="Rejected drafts"
                    value={String(dashboard.analytics.rejectedDrafts)}
                  />
                  <StatCard
                    label="Pending recommendations"
                    value={String(dashboard.analytics.pendingRecommendations)}
                  />
                </div>
              </Panel>

              <Panel title="Engagement" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  Availability: {dashboard.analytics.engagement.availability}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {dashboard.analytics.engagement.rationale}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Impressions / clicks / engagements: unavailable (not invented)
                </p>
              </Panel>

              {dashboard.analytics.opportunities.length === 0 ? (
                <EmptyState
                  title="No opportunities"
                  description="Opportunities appear from real stored drafts, campaigns, goals, and recommendations only."
                />
              ) : (
                dashboard.analytics.opportunities.map((o) => (
                  <Panel key={o.id} title={o.title} className="border-slate-800 bg-slate-950/80">
                    <p className="text-sm text-slate-300">{o.detail}</p>
                    <p className="mt-2 text-xs text-slate-500">Source: {o.source}</p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="AURA / adjacent connections" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-400">
                  Conceptual handoffs and navigation links. Unfinished AURA agents do not block this
                  foundation.
                </p>
              </Panel>
              {dashboard.auraConnections.map((c) => (
                <Panel key={c.target} title={c.label} className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">{c.note}</p>
                  <p className="mt-2 text-xs text-slate-500">Status: {c.status}</p>
                  <Link href={c.href} className="mt-2 inline-block text-sm text-cyan-300 hover:underline">
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
