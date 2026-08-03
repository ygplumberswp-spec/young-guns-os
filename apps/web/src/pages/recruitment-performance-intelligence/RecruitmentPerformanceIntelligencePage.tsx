import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { RpiOwnerDashboard, RpiPipelineStage } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  createRpiCandidate,
  createRpiHiringDraft,
  createRpiInterviewDraft,
  decideRpiHiringDraft,
  decideRpiInterviewDraft,
  decideRpiRecommendation,
  fetchRpiDashboard,
  RecruitmentPerformanceIntelligenceApiClientError,
  refreshRpiRecommendations,
  updateRpiSettings,
} from '../../lib/recruitment-performance-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'pipeline'
  | 'interview'
  | 'hiring'
  | 'performance'
  | 'recommendations'
  | 'settings';

const STAGES: RpiPipelineStage[] = [
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
  'hired',
  'rejected',
];

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  return canAccess(permissions, roleName);
}

export function RecruitmentPerformanceIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<RpiOwnerDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateRole, setCandidateRole] = useState('');
  const [hireCandidateId, setHireCandidateId] = useState('');
  const [hireToStage, setHireToStage] = useState<RpiPipelineStage>('interview');
  const [interviewCandidateId, setInterviewCandidateId] = useState('');
  const [interviewTitle, setInterviewTitle] = useState('');
  const [interviewScheduledAt, setInterviewScheduledAt] = useState('');
  const [settingsNotes, setSettingsNotes] = useState('');

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
    const data = await fetchRpiDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    if (!hireCandidateId && data.candidates[0]) {
      setHireCandidateId(data.candidates[0].id);
    }
    if (!interviewCandidateId && data.candidates[0]) {
      setInterviewCandidateId(data.candidates[0].id);
    }
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
            err instanceof RecruitmentPerformanceIntelligenceApiClientError
              ? err.message
              : 'Unable to load Recruitment & Performance Intelligence',
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
        err instanceof RecruitmentPerformanceIntelligenceApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Recruitment & Performance Intelligence"
          description="Owner-gated hiring workflow and performance drafts"
        />
        <EmptyState
          title="Access restricted"
          description="Owner or Admin access is required for recruitment and others’ performance. Technicians can use self-performance via the API when enabled."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'interview', label: 'Interview workflow' },
    { id: 'hiring', label: 'Hiring workflow' },
    { id: 'performance', label: 'Performance' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'settings', label: 'Settings' },
  ];

  const interviewStageCount =
    dashboard?.pipeline.find((b) => b.stage === 'interview')?.count ??
    dashboard?.recruitment.interviewStageCount ??
    0;

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Recruitment & Performance Intelligence"
        description="Real candidates, Owner-gated hiring advances, interview drafts, technician performance insights, and AURA capacity/risk drafts — no automatic hiring"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/technician-intelligence" className="text-cyan-300 hover:underline">
          Technician Intelligence
        </Link>
        <Link href="/hr-employee-intelligence" className="text-cyan-300 hover:underline">
          HR Employee Intelligence
        </Link>
        <Link href="/payroll-timesheet-intelligence" className="text-cyan-300 hover:underline">
          Payroll & Timesheet
        </Link>
        <Link href="/recruiting" className="text-cyan-300 hover:underline">
          Recruiting
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              tab === item.id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Done" className="border-cyan-500/30 bg-cyan-950/20 text-cyan-100">
          <p className="text-sm">{success}</p>
        </Panel>
      ) : null}

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Recruitment & Performance Intelligence…</p>
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
                  label="Candidates"
                  value={
                    dashboard.recruitment.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.recruitment.candidateCount)
                  }
                />
                <StatCard
                  label="Active pipeline"
                  value={
                    dashboard.recruitment.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.recruitment.activePipelineCount)
                  }
                />
                <StatCard label="Interview stage" value={String(interviewStageCount)} />
                <StatCard
                  label="Hiring approvals"
                  value={String(dashboard.recruitment.pendingHiringApprovals)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Active technicians"
                  value={
                    dashboard.workforcePlanning.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforcePlanning.activeTechnicianCount)
                  }
                />
                <StatCard
                  label="Open job assignments"
                  value={
                    dashboard.workforcePlanning.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforcePlanning.openJobAssignmentCount)
                  }
                />
                <StatCard
                  label="Interview pipeline"
                  value={
                    dashboard.workforcePlanning.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforcePlanning.interviewPipelineCount)
                  }
                />
                <StatCard
                  label="Timesheet hours (sample)"
                  value={
                    dashboard.workforcePlanning.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforcePlanning.timesheetHoursSample)
                  }
                />
              </div>
              <Panel title="Workforce planning" className="border-slate-800 bg-slate-950/80">
                <p className="text-xs text-slate-500">{dashboard.workforcePlanning.rationale}</p>
              </Panel>
              <Panel title="Policy" className="border-slate-800 bg-slate-950/80">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                  <li>No automatic hiring decisions</li>
                  <li>Owner approval required before hiring advances execute</li>
                  <li>Interview drafts never change candidate hiring status</li>
                  <li>Performance scores are never invented</li>
                  <li>AURA capacity/risk recommendations stay drafts</li>
                </ul>
              </Panel>
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <div className="space-y-2">
                  {dashboard.connections.map((c) => (
                    <div
                      key={c.target}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-slate-100">{c.label}</p>
                        <p className="text-xs text-slate-500">{c.note}</p>
                      </div>
                      {c.status === 'available_link' ? (
                        <Link href={c.href} className="text-sm text-cyan-300 hover:underline">
                          Open
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">{c.availability}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === 'pipeline' ? (
            <div className="space-y-4">
              <Panel title="Applicant tracking pipeline" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.recruitment.rationale}</p>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {dashboard.pipeline.map((bucket) => (
                    <div
                      key={bucket.stage}
                      className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2"
                    >
                      <p className="text-xs uppercase tracking-wide text-cyan-300/80">
                        {bucket.stage}
                      </p>
                      <p className="text-lg font-semibold text-slate-100">{bucket.count}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Candidates (real records)" className="border-slate-800 bg-slate-950/80">
                {dashboard.candidates.length === 0 ? (
                  <EmptyState
                    title="No candidates yet"
                    description="Pipeline stays unavailable until real recruiting_candidates exist — nothing invented."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.candidates.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <p className="text-sm text-slate-100">
                          {c.name}{' '}
                          <span className="text-cyan-300/90">· {c.status}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.roleTitle ?? 'No role title'} · apps {c.applicationCount}
                          {c.email ? ` · ${c.email}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              {canManage ? (
                <Panel title="Add candidate" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createRpiCandidate(accessToken!, {
                            name: candidateName,
                            roleTitle: candidateRole || null,
                          }),
                        'Candidate recorded (real record — not demo data).',
                      ).then(() => {
                        setCandidateName('');
                        setCandidateRole('');
                      });
                    }}
                  >
                    <Input
                      label="Name"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      required
                    />
                    <Input
                      label="Role title"
                      value={candidateRole}
                      onChange={(e) => setCandidateRole(e.target.value)}
                    />
                    <Button type="submit" variant="primary">
                      Save candidate
                    </Button>
                  </form>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'interview' ? (
            <div className="space-y-4">
              <Panel title="Interview workflow drafts" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">
                  Schedule, complete, approve, or reject interview drafts. Candidate hiring status
                  stays unchanged — use Hiring workflow to advance pipeline stages.
                </p>
                {canManage ? (
                  <form
                    className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!interviewCandidateId) return;
                      void withFeedback(
                        () =>
                          createRpiInterviewDraft(accessToken!, {
                            candidateId: interviewCandidateId,
                            title: interviewTitle || undefined,
                            scheduledAt: interviewScheduledAt
                              ? new Date(interviewScheduledAt).toISOString()
                              : null,
                            submitForApproval: true,
                          }),
                        'Interview draft created (candidate status unchanged).',
                      ).then(() => {
                        setInterviewTitle('');
                        setInterviewScheduledAt('');
                      });
                    }}
                  >
                    <label className="block text-sm text-slate-300">
                      Candidate
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                        value={interviewCandidateId}
                        onChange={(e) => setInterviewCandidateId(e.target.value)}
                      >
                        {dashboard.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.status})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Title (optional)"
                      value={interviewTitle}
                      onChange={(e) => setInterviewTitle(e.target.value)}
                    />
                    <Input
                      label="Scheduled at (optional)"
                      type="datetime-local"
                      value={interviewScheduledAt}
                      onChange={(e) => setInterviewScheduledAt(e.target.value)}
                    />
                    <Button type="submit" variant="primary" disabled={!interviewCandidateId}>
                      Create interview draft
                    </Button>
                  </form>
                ) : null}
                {dashboard.interviewDrafts.length === 0 ? (
                  <EmptyState
                    title="No interview drafts"
                    description="Create an interview draft for a real candidate. Drafts never auto-hire or change status."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.interviewDrafts.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <p className="text-sm text-slate-100">{d.title}</p>
                        <p className="text-xs text-slate-500">
                          {d.candidateName ?? d.candidateId} · {d.status}
                          {d.scheduledAt
                            ? ` · scheduled ${new Date(d.scheduledAt).toLocaleString()}`
                            : ''}
                          {d.interviewerName ? ` · interviewer ${d.interviewerName}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{d.body}</p>
                        {canManage &&
                        !['cancelled', 'rejected', 'completed'].includes(d.status) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiInterviewDraft(accessToken!, d.id, {
                                      decision: 'schedule',
                                      scheduledAt:
                                        d.scheduledAt ?? new Date().toISOString(),
                                    }),
                                  'Interview marked scheduled — candidate status unchanged.',
                                )
                              }
                            >
                              Schedule
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiInterviewDraft(accessToken!, d.id, {
                                      decision: 'complete',
                                    }),
                                  'Interview marked complete — candidate status unchanged.',
                                )
                              }
                            >
                              Complete
                            </Button>
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiInterviewDraft(accessToken!, d.id, {
                                      decision: 'approve',
                                    }),
                                  'Interview draft approved — still no hiring status change.',
                                )
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiInterviewDraft(accessToken!, d.id, {
                                      decision: 'reject',
                                    }),
                                  'Interview draft rejected — candidate status unchanged.',
                                )
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiInterviewDraft(accessToken!, d.id, {
                                      decision: 'cancel',
                                    }),
                                  'Interview draft cancelled.',
                                )
                              }
                            >
                              Cancel
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

          {tab === 'hiring' ? (
            <div className="space-y-4">
              <Panel
                title="Hiring workflow drafts"
                className="border-slate-800 bg-slate-950/80"
              >
                <p className="mb-3 text-xs text-slate-500">
                  Draft → Owner approve. Advances that execute update real candidate status only
                  after approval. Never automatic.
                </p>
                {canManage ? (
                  <form
                    className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!hireCandidateId) return;
                      void withFeedback(
                        () =>
                          createRpiHiringDraft(accessToken!, {
                            candidateId: hireCandidateId,
                            toStage: hireToStage,
                            submitForApproval: true,
                          }),
                        'Hiring draft submitted for Owner approval.',
                      );
                    }}
                  >
                    <label className="block text-sm text-slate-300">
                      Candidate
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                        value={hireCandidateId}
                        onChange={(e) => setHireCandidateId(e.target.value)}
                      >
                        {dashboard.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.status})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-300">
                      To stage
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                        value={hireToStage}
                        onChange={(e) => setHireToStage(e.target.value as RpiPipelineStage)}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" variant="primary" disabled={!hireCandidateId}>
                      Submit for approval
                    </Button>
                  </form>
                ) : null}
                {dashboard.hiringDrafts.length === 0 ? (
                  <EmptyState
                    title="No hiring drafts"
                    description="Create a pipeline advance draft when a real candidate is ready for Owner review."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.hiringDrafts.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <p className="text-sm text-slate-100">{d.title}</p>
                        <p className="text-xs text-slate-500">
                          {d.candidateName ?? d.candidateId} · {d.fromStage ?? '—'} → {d.toStage} ·{' '}
                          {d.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{d.body}</p>
                        {canManage &&
                        (d.status === 'draft' || d.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiHiringDraft(accessToken!, d.id, {
                                      decision: 'approve',
                                      executeOnCandidate: true,
                                    }),
                                  'Hiring advance approved and executed on candidate record.',
                                )
                              }
                            >
                              Approve & execute
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiHiringDraft(accessToken!, d.id, {
                                      decision: 'reject',
                                    }),
                                  'Hiring draft rejected — no status change.',
                                )
                              }
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

          {tab === 'performance' ? (
            <div className="space-y-4">
              <Panel title="Technician performance insights" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.performance.rationale}</p>
                {dashboard.performanceRows.length === 0 ? (
                  <EmptyState
                    title="No technician performance signals"
                    description="Unavailable until real technician-role users and jobs/skills exist."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.performanceRows.map((row) => (
                      <div
                        key={row.userId}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm text-slate-100">{row.displayName}</p>
                          <Link
                            href={row.technicianIntelligenceHref}
                            className="text-xs text-cyan-300 hover:underline"
                          >
                            Technician Intelligence
                          </Link>
                        </div>
                        <p className="text-xs text-slate-500">
                          jobs completed {row.jobsCompleted ?? 'n/a'} · assigned{' '}
                          {row.jobsAssigned ?? 'n/a'} · callbacks {row.callbacks ?? 'n/a'}
                          {row.timesheetHours != null
                            ? ` · timesheet hours ${row.timesheetHours}`
                            : ''}{' '}
                          · skills {row.skillCount} · training {row.trainingCount}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{row.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Skill tracking" className="border-slate-800 bg-slate-950/80">
                {dashboard.skillTracking.length === 0 ? (
                  <EmptyState
                    title="No skill records"
                    description="Skill tracking uses real employee_skills rows only."
                  />
                ) : (
                  <div className="space-y-1">
                    {dashboard.skillTracking.slice(0, 40).map((s, idx) => (
                      <p key={`${s.userId}-${s.skillKey}-${idx}`} className="text-sm text-slate-300">
                        {s.displayName}: {s.skillName} ({s.proficiency})
                      </p>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              <Panel title="Training, capacity & workforce risk drafts" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">
                  Refresh builds training/development drafts plus AURA capacity-improvement and
                  workforce-risk drafts from real technician, job, interview, and timesheet signals.
                  Nothing auto-executes.
                </p>
                {canManage ? (
                  <div className="mb-3">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() =>
                        void withFeedback(
                          () =>
                            refreshRpiRecommendations(accessToken!, {
                              submitForApproval: true,
                            }),
                          'Recommendation drafts refreshed (training + AURA capacity/risk).',
                        )
                      }
                    >
                      Refresh recommendation drafts
                    </Button>
                  </div>
                ) : null}
                {dashboard.recommendationDrafts.length === 0 ? (
                  <EmptyState
                    title="No recommendation drafts"
                    description="Refresh when real technician/job/skill/timesheet signals exist. Capacity and workforce-risk drafts never auto-execute."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.recommendationDrafts.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <p className="text-sm text-slate-100">
                          {r.title}{' '}
                          <span className="text-cyan-300/90">· {r.kind}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.subjectUserName ?? '—'} · {r.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{r.body}</p>
                        {canManage &&
                        (r.status === 'draft' || r.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiRecommendation(accessToken!, r.id, {
                                      decision: 'approve',
                                    }),
                                  'Recommendation approved (still does not auto-enrol training).',
                                )
                              }
                            >
                              Approve draft
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideRpiRecommendation(accessToken!, r.id, {
                                      decision: 'reject',
                                    }),
                                  'Recommendation rejected.',
                                )
                              }
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

          {tab === 'settings' ? (
            <Panel title="Settings" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">
                Interview workflow and AURA suggestions can be toggled. Auto-hiring and invented
                scores are hard-disabled invariants and cannot be enabled.
              </p>
              <p className="mb-3 text-sm text-slate-300">
                Interview workflow:{' '}
                <span className="text-cyan-300">
                  {dashboard.settings.interviewWorkflowEnabled ? 'on' : 'off'}
                </span>{' '}
                · AURA suggestions:{' '}
                <span className="text-cyan-300">
                  {dashboard.settings.auraSuggestionsEnabled ? 'on' : 'off'}
                </span>{' '}
                · Auto hiring: <span className="text-cyan-300">off</span> · Invent scores:{' '}
                <span className="text-cyan-300">off</span>
              </p>
              {canManage ? (
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(
                      () =>
                        updateRpiSettings(accessToken!, {
                          notes: settingsNotes || null,
                          recruitmentEnabled: dashboard.settings.recruitmentEnabled,
                          performanceInsightsEnabled:
                            dashboard.settings.performanceInsightsEnabled,
                          selfPerformanceViewEnabled:
                            dashboard.settings.selfPerformanceViewEnabled,
                          interviewWorkflowEnabled:
                            dashboard.settings.interviewWorkflowEnabled,
                          auraSuggestionsEnabled: dashboard.settings.auraSuggestionsEnabled,
                        }),
                      'Settings saved.',
                    );
                  }}
                >
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <Button type="submit" variant="primary">
                    Save settings
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-slate-400">Owner/Admin required to change settings.</p>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
