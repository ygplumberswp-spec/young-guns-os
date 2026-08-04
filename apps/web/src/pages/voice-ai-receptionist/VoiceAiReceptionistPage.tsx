import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { VairOwnerDashboard, VairSaLocale } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  completeVairCallSession,
  createVairBookingDraft,
  createVairLeadDraft,
  decideVairApproval,
  fetchVairDashboard,
  lookupVairCustomer,
  recordVairIncomingCall,
  releaseVairTakeover,
  requestVairTakeover,
  updateVairSettings,
  upsertVairRoutingRule,
  VoiceAiReceptionistApiClientError,
} from '../../lib/voice-ai-receptionist-api-client';

type Tab = 'status' | 'calls' | 'approvals' | 'routing' | 'config' | 'lookup';

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

export function VoiceAiReceptionistPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('status');
  const [dashboard, setDashboard] = useState<VairOwnerDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [callerPhone, setCallerPhone] = useState('');
  const [callerName, setCallerName] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadService, setLeadService] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const [ruleKey, setRuleKey] = useState('default-inbound');
  const [ruleName, setRuleName] = useState('Default inbound AI');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [locale, setLocale] = useState<VairSaLocale>('en-ZA');
  const [telephonyKey, setTelephonyKey] = useState('');
  const [ttsKey, setTtsKey] = useState('');
  const [sttKey, setSttKey] = useState('');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchVairDashboard(accessToken);
    setDashboard(data);
    setWelcomeMessage(data.settings.welcomeMessage ?? '');
    setLocale(data.settings.defaultLocale);
    setTelephonyKey(data.settings.telephonyProviderKey ?? '');
    setTtsKey(data.settings.ttsProviderKey ?? '');
    setSttKey(data.settings.sttProviderKey ?? '');
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
            err instanceof VoiceAiReceptionistApiClientError
              ? err.message
              : 'Unable to load Voice AI Receptionist',
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
        err instanceof VoiceAiReceptionistApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Voice AI Receptionist"
          description="Incoming call handling foundation with human takeover"
        />
        <EmptyState
          title="Access restricted"
          description="Owner/Admin or voice/communications access is required. Technician and Client roles are denied."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'status', label: 'Status' },
    { id: 'calls', label: 'Call log' },
    { id: 'approvals', label: 'Approval queue' },
    { id: 'routing', label: 'Routing' },
    { id: 'lookup', label: 'Customer lookup' },
    { id: 'config', label: 'Config' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Voice AI Receptionist"
        description="Foundation for inbound handling, caller ID, CRM lookup, approval-gated leads, routing, and SA voice config"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/voice" className="text-cyan-300 hover:underline">
          Voice sessions
        </Link>
        <Link href="/voice-reception" className="text-cyan-300 hover:underline">
          Enterprise Voice Reception
        </Link>
        <Link href="/crm" className="text-cyan-300 hover:underline">
          CRM
        </Link>
        <Link href="/leads" className="text-cyan-300 hover:underline">
          Leads
        </Link>
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/scheduling" className="text-cyan-300 hover:underline">
          Scheduling
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No fake calls, customers, or leads. Human takeover is always available. Lead create and
          booking drafts require Owner approval. Live telephony/TTS/STT stay not_configured until
          real provider credentials connect. Customer 360 is not a dedicated module yet.
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
          <p className="text-sm text-slate-400">Loading Voice AI Receptionist…</p>
        </Panel>
      ) : (
        <>
          {tab === 'status' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Telephony" value={dashboard.provider.telephonyStatus} />
                <StatCard label="TTS" value={dashboard.saVoice.ttsStatus} />
                <StatCard label="STT" value={dashboard.saVoice.sttStatus} />
                <StatCard label="Pending approvals" value={String(dashboard.pendingApprovals)} />
              </div>
              <Panel title="Provider honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.provider.rationale}</p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.saVoice.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'calls' ? (
            <div className="space-y-4">
              <Panel title="Record inbound call session" className="border-slate-800 bg-slate-950/80">
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (!accessToken) return;
                    void withFeedback(
                      () =>
                        recordVairIncomingCall(accessToken, {
                          callerPhone: callerPhone || undefined,
                          callerName: callerName || undefined,
                          identifyCaller: true,
                        }),
                      'Inbound call session recorded.',
                    );
                  }}
                >
                  <Input
                    label="Caller phone"
                    value={callerPhone}
                    onChange={(e) => setCallerPhone(e.target.value)}
                  />
                  <Input
                    label="Caller name"
                    value={callerName}
                    onChange={(e) => setCallerName(e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Button type="submit">Record inbound session</Button>
                  </div>
                </form>
              </Panel>
              <Panel title="Call log" className="border-slate-800 bg-slate-950/80">
                {dashboard.callSessions.length === 0 ? (
                  <EmptyState
                    title="No call sessions yet"
                    description={dashboard.callStats.rationale}
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.callSessions.map((session) => (
                      <li
                        key={session.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-slate-100">
                              {session.callerName || session.callerPhone || 'Unknown caller'} —{' '}
                              {session.status}
                            </p>
                            <p className="text-xs text-slate-500">
                              {session.customerName
                                ? `Customer: ${session.customerName}`
                                : 'No CRM match'}{' '}
                              · Takeover: {session.humanTakeoverActive ? 'active' : 'available'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!session.humanTakeoverActive &&
                            ['ringing', 'active'].includes(session.status) ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!accessToken) return;
                                  void withFeedback(
                                    () =>
                                      requestVairTakeover(accessToken, {
                                        callSessionId: session.id,
                                        reason: 'operator_initiated',
                                      }),
                                    'Human takeover activated.',
                                  );
                                }}
                              >
                                Take over
                              </Button>
                            ) : null}
                            {session.humanTakeoverActive ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!accessToken) return;
                                  void withFeedback(
                                    () =>
                                      releaseVairTakeover(accessToken, {
                                        callSessionId: session.id,
                                      }),
                                    'Takeover released.',
                                  );
                                }}
                              >
                                Release
                              </Button>
                            ) : null}
                            {!session.endedAt ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!accessToken) return;
                                  void withFeedback(
                                    () => completeVairCallSession(accessToken, session.id, {}),
                                    'Call session completed.',
                                  );
                                }}
                              >
                                Complete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'approvals' ? (
            <div className="space-y-4">
              <Panel title="Draft lead (approval-gated)" className="border-slate-800 bg-slate-950/80">
                <form
                  className="grid gap-3 sm:grid-cols-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (!accessToken || !leadName.trim()) return;
                    void withFeedback(
                      () =>
                        createVairLeadDraft(accessToken, {
                          contactName: leadName.trim(),
                          contactPhone: leadPhone || undefined,
                          serviceType: leadService || undefined,
                          submitForApproval: true,
                        }),
                      'Lead draft queued for Owner approval.',
                    );
                  }}
                >
                  <Input
                    label="Contact name"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    required
                  />
                  <Input
                    label="Phone"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                  />
                  <Input
                    label="Service"
                    value={leadService}
                    onChange={(e) => setLeadService(e.target.value)}
                  />
                  <div className="sm:col-span-3 flex flex-wrap gap-2">
                    <Button type="submit">Queue lead draft</Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!accessToken) return;
                        void withFeedback(
                          () =>
                            createVairBookingDraft(accessToken, {
                              serviceType: leadService || 'Service request',
                              notes: 'Draft booking from Voice AI — never auto-scheduled.',
                              submitForApproval: true,
                            }),
                          'Booking draft queued.',
                        );
                      }}
                    >
                      Queue booking draft
                    </Button>
                  </div>
                </form>
              </Panel>
              <Panel title="Approval queue" className="border-slate-800 bg-slate-950/80">
                {dashboard.approvalQueue.length === 0 ? (
                  <EmptyState
                    title="No approval drafts"
                    description="Lead create and booking drafts appear here for Owner review."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.approvalQueue.map((draft) => (
                      <li
                        key={draft.id}
                        className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <p className="text-slate-100">
                          {draft.title} — {draft.kind} / {draft.status}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">
                          {draft.body}
                        </pre>
                        {['draft', 'pending_approval'].includes(draft.status) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() => {
                                if (!accessToken) return;
                                void withFeedback(
                                  () =>
                                    decideVairApproval(accessToken, draft.id, {
                                      decision: 'approve',
                                      execute: true,
                                    }),
                                  'Draft approved.',
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
                                    decideVairApproval(accessToken, draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Draft rejected.',
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

          {tab === 'routing' ? (
            <div className="space-y-4">
              <Panel title="Upsert routing rule" className="border-slate-800 bg-slate-950/80">
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (!accessToken) return;
                    void withFeedback(
                      () =>
                        upsertVairRoutingRule(accessToken, {
                          ruleKey,
                          name: ruleName,
                          destination: 'ai_receptionist',
                          priority: 100,
                          enabled: true,
                        }),
                      'Routing rule saved.',
                    );
                  }}
                >
                  <Input
                    label="Rule key"
                    value={ruleKey}
                    onChange={(e) => setRuleKey(e.target.value)}
                  />
                  <Input
                    label="Name"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Button type="submit">Save routing rule</Button>
                  </div>
                </form>
              </Panel>
              <Panel title="Rules" className="border-slate-800 bg-slate-950/80">
                {dashboard.routingRules.length === 0 ? (
                  <EmptyState title="No routing rules" description="Add a default inbound rule." />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.routingRules.map((rule) => (
                      <li key={rule.id}>
                        {rule.priority}. {rule.name} → {rule.destination}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'lookup' ? (
            <Panel title="CRM customer lookup" className="border-slate-800 bg-slate-950/80">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!accessToken) return;
                  void (async () => {
                    try {
                      setError(null);
                      const result = await lookupVairCustomer(accessToken, {
                        phone: lookupPhone || undefined,
                      });
                      setLookupResult(
                        result.matches.length > 0
                          ? result.matches
                              .map((m) => `${m.customerName} · ${m.phone ?? 'no phone'}`)
                              .join('\n')
                          : result.rationale,
                      );
                    } catch (err) {
                      setError(
                        err instanceof VoiceAiReceptionistApiClientError
                          ? err.message
                          : 'Lookup failed',
                      );
                    }
                  })();
                }}
              >
                <Input
                  label="Phone"
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                />
                <Button type="submit">Lookup</Button>
              </form>
              {lookupResult ? (
                <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{lookupResult}</pre>
              ) : null}
            </Panel>
          ) : null}

          {tab === 'config' ? (
            <Panel title="SA voice & provider config" className="border-slate-800 bg-slate-950/80">
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!accessToken) return;
                  void withFeedback(
                    () =>
                      updateVairSettings(accessToken, {
                        defaultLocale: locale,
                        welcomeMessage: welcomeMessage || null,
                        telephonyProviderKey: telephonyKey || null,
                        ttsProviderKey: ttsKey || null,
                        sttProviderKey: sttKey || null,
                      }),
                    'Settings saved. Human takeover remains always available.',
                  );
                }}
              >
                <label className="block text-sm text-slate-300">
                  Default SA locale
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as VairSaLocale)}
                  >
                    <option value="en-ZA">en-ZA</option>
                    <option value="af-ZA">af-ZA</option>
                    <option value="zu-ZA">zu-ZA</option>
                    <option value="xh-ZA">xh-ZA</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <Input
                  label="Welcome message"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                />
                <Input
                  label="Telephony provider key"
                  value={telephonyKey}
                  onChange={(e) => setTelephonyKey(e.target.value)}
                  placeholder="empty = not_configured"
                />
                <Input
                  label="TTS provider key"
                  value={ttsKey}
                  onChange={(e) => setTtsKey(e.target.value)}
                />
                <Input
                  label="STT provider key"
                  value={sttKey}
                  onChange={(e) => setSttKey(e.target.value)}
                />
                <div className="sm:col-span-2">
                  <Button type="submit">Save config</Button>
                </div>
              </form>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
