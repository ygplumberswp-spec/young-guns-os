import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { CeiDashboard, CeiDraftKind } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  createCeiDraft,
  CustomerEngagementIntelligenceApiClientError,
  decideCeiDraft,
  fetchCeiDashboard,
  generateCeiEtaDrafts,
  generateCeiFollowUpDrafts,
  generateCeiMaintenanceReminderDrafts,
  generateCeiReviewRequestDrafts,
  syncCeiCommunicationScores,
} from '../../lib/customer-engagement-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'notifications'
  | 'eta'
  | 'satisfaction'
  | 'scores'
  | 'retention'
  | 'drafts';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customer_experience:read') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('customers:read') ||
    permissions.includes('customers:write') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('portal:read') ||
    permissions.includes('portal:manage')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('customers:write') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('portal:manage')
  );
}

export function CustomerEngagementIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<CeiDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [draftKind, setDraftKind] = useState<CeiDraftKind>('notification');
  const [subject, setSubject] = useState('');

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
    const data = await fetchCeiDashboard(accessToken);
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
            err instanceof CustomerEngagementIntelligenceApiClientError
              ? err.message
              : 'Unable to load Customer Engagement Intelligence',
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
      await createCeiDraft(accessToken, {
        kind: draftKind,
        customerId: customerId.trim() || undefined,
        jobId: jobId.trim() || undefined,
        subject: subject.trim() || undefined,
        submitForApproval: true,
      });
      setSuccess('Draft queued for Owner/ops approval — nothing was sent.');
      setSubject('');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to create draft',
      );
    }
  }

  async function handleGenerateEta() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await generateCeiEtaDrafts(accessToken, { submitForApproval: true });
      setSuccess(
        result.created === 0
          ? 'No customer-visible ETA available from real job/dispatch data — no drafts invented.'
          : `Queued ${result.created} ETA update draft(s) for approval. Nothing was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to generate ETA drafts',
      );
    }
  }

  async function handleGenerateReviews() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await generateCeiReviewRequestDrafts(accessToken, {
        submitForApproval: true,
      });
      setSuccess(
        result.created === 0
          ? 'No completed jobs with customers available — review-request drafts not invented.'
          : `Queued ${result.created} review-request draft(s) for approval. Nothing was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to generate review-request drafts',
      );
    }
  }

  async function handleSyncScores() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await syncCeiCommunicationScores(accessToken);
      setSuccess(
        result.synced === 0
          ? 'Communication AURA scores unavailable — nothing invented.'
          : `Synced ${result.synced} communication score link(s) from Communication AURA Intelligence.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to sync communication scores',
      );
    }
  }

  async function handleGenerateFollowUps() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await generateCeiFollowUpDrafts(accessToken, { submitForApproval: true });
      setSuccess(
        result.created === 0
          ? 'No real follow-up opportunities from jobs/satisfaction/communication signals — nothing invented.'
          : `Queued ${result.created} follow-up draft(s) for approval. Nothing was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to generate follow-up drafts',
      );
    }
  }

  async function handleGenerateMaintenanceReminders() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await generateCeiMaintenanceReminderDrafts(accessToken, {
        submitForApproval: true,
      });
      setSuccess(
        result.created === 0
          ? 'No due maintenance plans with customers — reminder drafts not invented.'
          : `Queued ${result.created} maintenance-reminder draft(s) for approval. Nothing was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to generate maintenance reminder drafts',
      );
    }
  }

  async function handleDecide(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCeiDraft(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Draft approved for handoff — not sent. Use Email Centre / outbound execute path to send.'
          : 'Draft rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CustomerEngagementIntelligenceApiClientError
          ? err.message
          : 'Unable to decide draft',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Customer Engagement Intelligence"
          description="Approval-gated customer notifications, ETA updates, satisfaction, and review requests."
        />
        <EmptyState
          title="Access restricted"
          description="Requires CX, customers, communications, or portal access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Engagement Intelligence"
        description="Draft customer notifications, ETA updates, and review requests from real jobs and CX data. Owner/ops approval required before any external communication."
      />

      <p className="text-sm text-slate-400">
        <Link href="/customer-experience" className="yg-link">
          Customer Experience
        </Link>
        {' · '}
        <Link href="/communication-aura-intelligence" className="yg-link">
          Communication AURA
        </Link>
        {' · '}
        <Link href="/content-reputation-intelligence" className="yg-link">
          Content & Reputation
        </Link>
        {' · '}
        <Link href="/email-centre" className="yg-link">
          Email Centre
        </Link>
        {' · '}
        <Link href="/homeshield-experience" className="yg-link">
          HomeShield
        </Link>
        {' · '}
        <Link href="/communication-timeline" className="yg-link">
          Communication Timeline
        </Link>
        {' · '}
        <Link href="/recurring-maintenance" className="yg-link">
          Maintenance
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['notifications', 'Notifications'],
            ['eta', 'ETA'],
            ['satisfaction', 'Satisfaction'],
            ['scores', 'Comm scores'],
            ['retention', 'Retention'],
            ['drafts', `Drafts (${dashboard?.pendingDraftApprovals ?? 0})`],
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
        <Panel title="Loading">Loading Customer Engagement Intelligence…</Panel>
      ) : !dashboard ? (
        <EmptyState
          title="No data"
          description="Unable to load dashboard. Confirm tenant CX / jobs foundations are available."
        />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-6">
              <Panel title="Honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  <li>{dashboard.productClarification.thisLayer}</li>
                  <li>{dashboard.productClarification.customer360}</li>
                  <li>{dashboard.productClarification.communicationAura}</li>
                  <li>{dashboard.productClarification.homeShield}</li>
                  <li>{dashboard.productClarification.recurringMaintenance}</li>
                </ul>
                <p className="mt-2 yg-text-accent-subtle text-xs">
                  Auto-send: off · AURA drafts only · Owner approval required · Customer 360:{' '}
                  {dashboard.connections.customer360 ? 'linked' : 'unavailable (not rebuilt)'} ·
                  HomeShield:{' '}
                  {dashboard.connections.homeShieldExperience ? 'signals linked' : 'unavailable'} ·
                  Timeline:{' '}
                  {dashboard.connections.communicationTimeline ? 'linked' : 'unavailable'}
                </p>
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Pending approvals"
                  value={String(dashboard.pendingDraftApprovals)}
                />
                <StatCard
                  label="Satisfaction"
                  value={
                    dashboard.satisfaction.availability === 'unavailable'
                      ? 'Unavailable'
                      : dashboard.satisfaction.averageRating === null
                        ? 'Signals only'
                        : String(dashboard.satisfaction.averageRating)
                  }
                />
                <StatCard
                  label="Retention signals"
                  value={
                    dashboard.retentionAvailability === 'available'
                      ? String(dashboard.retentionOpportunities.length)
                      : 'Unavailable'
                  }
                />
                <StatCard
                  label="Relationship scores"
                  value={
                    dashboard.relationshipScoreAvailability === 'available'
                      ? 'Available'
                      : 'Unavailable'
                  }
                />
              </div>

              {dashboard.followUpSuggestions.length > 0 ? (
                <Panel title="AURA follow-up suggestions" className="border-slate-800 bg-slate-950/80">
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.followUpSuggestions.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <span className="yg-text-accent-muted">{item.customerName || item.customerId}</span>
                        {' — '}
                        {item.recommendation}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'notifications' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create notification / outreach draft" className="border-slate-800 bg-slate-950/80">
                  <form className="space-y-3" onSubmit={handleCreateDraft}>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Kind
                      <select
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                        value={draftKind}
                        onChange={(e) => setDraftKind(e.target.value as CeiDraftKind)}
                      >
                        <option value="notification">Notification</option>
                        <option value="eta_update">ETA update</option>
                        <option value="review_request">Review request</option>
                        <option value="satisfaction_follow_up">Satisfaction follow-up</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="maintenance_reminder">Maintenance reminder</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Customer ID (real CRM UUID)
                      <Input
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        placeholder="Optional — must exist in tenant"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Job ID (optional)
                      <Input
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                        placeholder="Optional — required for honest ETA when available"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      Subject hint
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Optional subject hint"
                      />
                    </label>
                    <Button type="submit">Queue draft for approval</Button>
                  </form>
                </Panel>
              ) : (
                <EmptyState
                  title="Read only"
                  description="Write permissions required to queue engagement drafts."
                />
              )}
            </div>
          ) : null}

          {tab === 'eta' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Generate ETA update drafts" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Uses real scheduled/assigned jobs only. Unavailable ETAs are not invented.
                  </p>
                  <Button type="button" onClick={() => void handleGenerateEta()}>
                    Generate ETA drafts
                  </Button>
                </Panel>
              ) : null}
              {dashboard.etaSuggestions.length === 0 ? (
                <EmptyState
                  title="No open jobs for ETA suggestions"
                  description="ETA suggestions appear when real new/scheduled/in-progress jobs exist."
                />
              ) : (
                dashboard.etaSuggestions.map((eta) => (
                  <Panel
                    key={eta.jobId}
                    title={`${eta.jobTitle || 'Job'} · ${eta.availability}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <div className="space-y-1 text-sm text-slate-300">
                      <p className="yg-text-accent-muted">
                        {eta.customerName || 'Customer unavailable'} · {eta.status}
                      </p>
                      <p>
                        ETA:{' '}
                        {eta.availability === 'available' && eta.etaAt
                          ? eta.etaAt
                          : 'Unavailable (not invented)'}
                      </p>
                      <p className="text-xs text-slate-500">{eta.rationale}</p>
                    </div>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'satisfaction' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Review request drafts" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Queues drafts for completed jobs with real customers. Never creates fake reviews.
                  </p>
                  <Button type="button" onClick={() => void handleGenerateReviews()}>
                    Generate review-request drafts
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Satisfaction tracking" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.satisfaction.note}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Reviews"
                    value={String(dashboard.satisfaction.reviewCount)}
                  />
                  <StatCard
                    label="Avg rating"
                    value={
                      dashboard.satisfaction.averageRating === null
                        ? 'Unavailable'
                        : String(dashboard.satisfaction.averageRating)
                    }
                  />
                  <StatCard label="Sentiment" value={dashboard.satisfaction.sentiment} />
                </div>
              </Panel>
              {dashboard.satisfaction.recent.length === 0 ? (
                <EmptyState
                  title="No satisfaction reviews yet"
                  description="Tracking uses real CX review feedback rows only — no demo scores."
                />
              ) : (
                dashboard.satisfaction.recent.map((row) => (
                  <Panel
                    key={row.id}
                    title={`${row.reviewType} · ${row.rating ?? 'no rating'}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm yg-text-accent-muted">
                      {row.customerName || row.customerId} — {row.subject}
                    </p>
                    <p className="text-xs text-slate-500">{row.createdAt}</p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'scores' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Sync Communication AURA scores" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Links real Communication AURA Intelligence customer insights when present.
                  </p>
                  <Button type="button" onClick={() => void handleSyncScores()}>
                    Sync communication scores
                  </Button>
                </Panel>
              ) : null}
              {dashboard.communicationScores.length === 0 ? (
                <EmptyState
                  title="Communication scores unavailable"
                  description="Run Communication AURA Intelligence first, then sync. Scores are never invented here."
                />
              ) : (
                dashboard.communicationScores.map((score) => (
                  <Panel
                    key={score.customerId}
                    title={`${score.customerName || score.customerId} · ${score.availability}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <div className="space-y-1 text-sm text-slate-300">
                      <p>
                        Avg score:{' '}
                        {score.availability === 'available' && score.averageScore !== null
                          ? score.averageScore
                          : 'Unavailable'}
                      </p>
                      <p>
                        Messages: {score.messageCount} · Sentiment: {score.dominantSentiment}
                      </p>
                      <p className="text-xs text-slate-500">{score.summary}</p>
                    </div>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'retention' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="AURA retention actions (drafts only)" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Suggest follow-ups and maintenance reminders from real CX, jobs, Communication
                    AURA, and HomeShield signals. Never auto-send; never auto-bill HomeShield.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void handleGenerateFollowUps()}>
                      Generate follow-up drafts
                    </Button>
                    <Button type="button" onClick={() => void handleGenerateMaintenanceReminders()}>
                      Generate maintenance reminders
                    </Button>
                  </div>
                </Panel>
              ) : null}

              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-1 text-sm text-slate-300">
                  <li>
                    HomeShield:{' '}
                    {dashboard.connections.homeShieldExperience
                      ? 'renewal/inactive signals when present'
                      : 'unavailable'}
                  </li>
                  <li>
                    Communication Timeline:{' '}
                    {dashboard.connections.communicationTimeline ? 'linked' : 'unavailable'}
                  </li>
                  <li>
                    Recurring Maintenance:{' '}
                    {dashboard.connections.recurringMaintenance ? 'linked' : 'unavailable'}
                  </li>
                  <li>Customer 360: unavailable (not rebuilt here)</li>
                  <li>Jobs / CX reviews / Communication AURA: used when real rows exist</li>
                </ul>
              </Panel>

              {dashboard.retentionOpportunities.length === 0 ? (
                <EmptyState
                  title="No retention opportunities"
                  description="Unhappy satisfaction, weak communication scores, and HomeShield renewal/inactive signals appear here when present — never invented."
                />
              ) : (
                dashboard.retentionOpportunities.map((row) => (
                  <Panel
                    key={row.id}
                    title={`${row.reason} · ${row.priority}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <div className="space-y-1 text-sm text-slate-300">
                      <p className="yg-text-accent-muted">
                        {row.customerName || row.customerId || 'Customer unavailable'}
                      </p>
                      <p>{row.recommendation}</p>
                      {row.homeShieldSubscriptionId || row.homeShieldRenewalOpportunityId ? (
                        <p className="text-xs text-slate-500">
                          HomeShield link · never auto-bill ·{' '}
                          <Link href="/homeshield-experience" className="yg-link">
                            open HomeShield
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </Panel>
                ))
              )}

              {dashboard.relationshipScores.length > 0 ? (
                <Panel title="Engagement / relationship scores" className="border-slate-800 bg-slate-950/80">
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.relationshipScores.slice(0, 10).map((row) => (
                      <li key={row.customerId}>
                        <span className="yg-text-accent-muted">{row.customerName || row.customerId}</span>
                        {' — score '}
                        {row.availability === 'available' && row.relationshipScore !== null
                          ? `${row.relationshipScore} (${row.band})`
                          : 'unavailable'}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'drafts' ? (
            <div className="space-y-4">
              {dashboard.draftQueue.length === 0 ? (
                <EmptyState
                  title="No engagement drafts"
                  description="Create notification/ETA/review/follow-up drafts from the other tabs. Nothing is auto-sent."
                />
              ) : (
                dashboard.draftQueue.map((draft) => (
                  <Panel
                    key={draft.id}
                    title={`${draft.kind} · ${draft.status}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <div className="space-y-2 text-sm text-slate-300">
                      <p className="font-medium yg-text-accent-muted">{draft.subject}</p>
                      <p className="text-xs text-slate-500">
                        {draft.customerName || draft.customerId || 'No customer linked'} ·{' '}
                        {draft.channel}
                        {draft.etaAvailability === 'available' && draft.etaSuggestionAt
                          ? ` · ETA ${draft.etaSuggestionAt}`
                          : ''}
                      </p>
                      <pre className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                        {draft.body}
                      </pre>
                      {canManage &&
                      (draft.status === 'pending_approval' || draft.status === 'draft') ? (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" onClick={() => void handleDecide(draft.id, 'approve')}>
                            Approve (do not send)
                          </Button>
                          <Button type="button" onClick={() => void handleDecide(draft.id, 'reject')}>
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
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
