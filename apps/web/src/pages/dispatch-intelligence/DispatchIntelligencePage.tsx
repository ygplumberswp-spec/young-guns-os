import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
import type { DispatchOperationsDashboard } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  DispatchIntelligenceApiClientError,
  createDispatchAction,
  createDispatchCallback,
  createReceptionistSummary,
  fetchCallbackQueue,
  fetchDispatchActions,
  fetchDispatchDashboard,
  fetchDispatchRecommendations,
  fetchEmergencyAssessments,
  fetchReceptionistSummaries,
  fetchTechnicianMatching,
  generateDispatchRecommendations,
} from '../../lib/dispatch-intelligence-api-client';

type DispatchTab =
  | 'dashboard'
  | 'receptionist'
  | 'queue'
  | 'matching'
  | 'emergency'
  | 'callbacks'
  | 'actions';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('dispatch_intelligence:read') ||
    permissions.includes('dispatch_intelligence:write') ||
    permissions.includes('dispatch:read') ||
    permissions.includes('voice:read') ||
    permissions.includes('agents:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('dispatch_intelligence:write') ||
    permissions.includes('dispatch:write') ||
    permissions.includes('voice:write') ||
    permissions.includes('*')
  );
}

export function DispatchIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<DispatchTab>('dashboard');
  const [dashboard, setDashboard] = useState<DispatchOperationsDashboard | null>(null);
  const [summaries, setSummaries] = useState<Awaited<ReturnType<typeof fetchReceptionistSummaries>>>([]);
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof fetchTechnicianMatching>>>([]);
  const [recommendations, setRecommendations] = useState<Awaited<ReturnType<typeof fetchDispatchRecommendations>>>([]);
  const [callbacks, setCallbacks] = useState<Awaited<ReturnType<typeof fetchCallbackQueue>>>([]);
  const [assessments, setAssessments] = useState<Awaited<ReturnType<typeof fetchEmergencyAssessments>>>([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof fetchDispatchActions>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [
      dashboardData,
      summaryRows,
      matchRows,
      recommendationRows,
      callbackRows,
      assessmentRows,
      actionRows,
    ] = await Promise.all([
      fetchDispatchDashboard(accessToken),
      fetchReceptionistSummaries(accessToken),
      fetchTechnicianMatching(accessToken),
      fetchDispatchRecommendations(accessToken),
      fetchCallbackQueue(accessToken),
      fetchEmergencyAssessments(accessToken),
      fetchDispatchActions(accessToken),
    ]);
    setDashboard(dashboardData);
    setSummaries(summaryRows);
    setMatches(matchRows);
    setRecommendations(recommendationRows);
    setCallbacks(callbackRows);
    setAssessments(assessmentRows);
    setActions(actionRows);
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
          setError(err instanceof DispatchIntelligenceApiClientError ? err.message : 'Unable to load dispatch data');
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

  async function handleCreateSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !summaryText.trim()) return;

    try {
      setError(null);
      await createReceptionistSummary(accessToken, { summary: summaryText.trim() });
      setSuccess('Receptionist summary recorded.');
      setSummaryText('');
      await loadPage();
    } catch (err) {
      setError(err instanceof DispatchIntelligenceApiClientError ? err.message : 'Unable to save summary');
    }
  }

  async function handleCreateCallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    try {
      setError(null);
      await createDispatchCallback(accessToken, { phoneNumber: callbackPhone.trim() || undefined, missedCallTracked: true });
      setSuccess('Callback request submitted for approval.');
      setCallbackPhone('');
      await loadPage();
    } catch (err) {
      setError(err instanceof DispatchIntelligenceApiClientError ? err.message : 'Unable to create callback');
    }
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !actionSubject.trim() || !actionRecommendation.trim()) return;

    try {
      setError(null);
      await createDispatchAction(accessToken, {
        actionType: 'dispatch_action',
        subject: actionSubject.trim(),
        recommendation: actionRecommendation.trim(),
      });
      setSuccess('Dispatch action submitted for approval.');
      setActionSubject('');
      setActionRecommendation('');
      await loadPage();
    } catch (err) {
      setError(err instanceof DispatchIntelligenceApiClientError ? err.message : 'Unable to create action');
    }
  }

  async function handleGenerateRecommendations() {
    if (!accessToken || !canManage) return;

    try {
      setError(null);
      await generateDispatchRecommendations(accessToken);
      setSuccess('Dispatch recommendations generated.');
      await loadPage();
    } catch (err) {
      setError(err instanceof DispatchIntelligenceApiClientError ? err.message : 'Unable to generate recommendations');
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Dispatch intelligence unavailable"
        description="You do not have permission to view the dispatch command centre."
      />
    );
  }

  const tabs: Array<{ id: DispatchTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'receptionist', label: 'Receptionist' },
    { id: 'queue', label: 'Call queue' },
    { id: 'matching', label: 'Matching' },
    { id: 'emergency', label: 'Emergency' },
    { id: 'callbacks', label: 'Callbacks' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch Command Centre"
        description="AI receptionist intelligence, call queue analytics, technician matching, and dispatch recommendations."
      />

      {error ? <Panel title="Error" className="border-red-200 bg-red-50 text-red-700">{error}</Panel> : null}
      {success ? <Panel title="Success" className="border-green-200 bg-green-50 text-green-700">{success}</Panel> : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button key={tab.id} variant={activeTab === tab.id ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? <Panel title="Loading">Loading dispatch intelligence…</Panel> : null}

      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Technicians" value={String(dashboard.liveTechnicianCount)} />
            <StatCard label="Scheduled jobs" value={String(dashboard.scheduledJobCount)} />
            <StatCard label="Live queue" value={String(dashboard.callQueue.liveQueueCount)} />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
          </div>
          <Panel title="Operations summary">
            <p className="text-sm text-slate-600">{dashboard.summary}</p>
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'receptionist' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Record receptionist summary">
              <form className="space-y-3" onSubmit={handleCreateSummary}>
                <label className="block text-sm">
                  Summary
                  <textarea
                    className="mt-1 min-h-24 w-full rounded border border-slate-300 px-3 py-2"
                    value={summaryText}
                    onChange={(event) => setSummaryText(event.target.value)}
                  />
                </label>
                <Button type="submit">Save summary</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Receptionist summaries">
            {summaries.length === 0 ? (
              <EmptyState title="No summaries" description="Receptionist summaries appear from real call handling records." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {summaries.map((summary) => (
                  <li key={summary.id} className="py-3">
                    <p className="font-medium">{summary.summary}</p>
                    <p className="text-sm text-slate-500">
                      Priority {summary.priorityScore}
                      {summary.emergencyDetected ? ' · Emergency detected' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'queue' && dashboard ? (
        <Panel title="Call queue intelligence">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Live queue" value={String(dashboard.callQueue.liveQueueCount)} />
            <StatCard label="Callback queue" value={String(dashboard.callQueue.callbackQueueCount)} />
            <StatCard label="Abandoned calls" value={String(dashboard.callQueue.abandonedCallCount)} />
            <StatCard label="Receptionist workload" value={String(dashboard.callQueue.receptionistWorkloadCount)} />
          </div>
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'matching' ? (
        <Panel title="Technician matching">
          {matches.length === 0 ? (
            <EmptyState title="No technicians" description="Assignees appear from your active team roster." />
          ) : (
            <ul className="divide-y divide-slate-200">
              {matches.map((match) => (
                <li key={match.technicianId} className="py-3">
                  <p className="font-medium">{match.technicianName}</p>
                  <p className="text-sm text-slate-500">{match.recommendation}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'emergency' ? (
        <Panel title="Emergency dispatch assessments">
          {assessments.length === 0 ? (
            <EmptyState title="No emergency assessments" description="Emergency assessments are recorded from real incidents — never auto-dispatched." />
          ) : (
            <ul className="divide-y divide-slate-200">
              {assessments.map((assessment) => (
                <li key={assessment.id} className="py-3">
                  <p className="font-medium">{assessment.emergencyType.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-slate-500">Priority {assessment.priority}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'callbacks' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Request callback">
              <form className="space-y-3" onSubmit={handleCreateCallback}>
                <Input label="Phone number" value={callbackPhone} onChange={(event) => setCallbackPhone(event.target.value)} />
                <Button type="submit">Submit for approval</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Callback queue">
            {callbacks.length === 0 ? (
              <EmptyState title="No callbacks" description="Callback requests require staff approval before execution." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {callbacks.map((callback) => (
                  <li key={callback.id} className="py-3">
                    <p className="font-medium">{callback.phoneNumber ?? callback.customerName ?? 'Callback request'}</p>
                    <p className="text-sm text-slate-500">{callback.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'actions' ? (
        <div className="space-y-4">
          {canManage ? (
            <>
              <Panel title="Generate recommendations">
                <Button onClick={() => void handleGenerateRecommendations()}>Generate dispatch recommendations</Button>
              </Panel>
              <Panel title="Draft dispatch action">
                <form className="space-y-3" onSubmit={handleCreateAction}>
                  <Input label="Subject" value={actionSubject} onChange={(event) => setActionSubject(event.target.value)} />
                  <label className="block text-sm">
                    Recommendation
                    <textarea
                      className="mt-1 min-h-24 w-full rounded border border-slate-300 px-3 py-2"
                      value={actionRecommendation}
                      onChange={(event) => setActionRecommendation(event.target.value)}
                    />
                  </label>
                  <Button type="submit">Submit for approval</Button>
                </form>
              </Panel>
            </>
          ) : null}
          <Panel title="Recommendations">
            {recommendations.length === 0 ? (
              <EmptyState title="No recommendations" description="Generate recommendations from real scheduling and quality data." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {recommendations.map((item) => (
                  <li key={item.id} className="py-3">
                    <p className="font-medium">{item.subject}</p>
                    <p className="text-sm text-slate-500">{item.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Pending and recent actions">
            {actions.length === 0 ? (
              <EmptyState title="No actions" description="Dispatch actions follow Draft → Approval → Execution." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {actions.map((action) => (
                  <li key={action.id} className="py-3">
                    <p className="font-medium">{action.subject}</p>
                    <p className="text-sm text-slate-500">{action.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
