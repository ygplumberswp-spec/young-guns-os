import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  DocIAuraInsightTarget,
  DocIDashboard,
  DocIDocumentType,
  DocIRecommendationDraftSummary,
} from '@titan/shared';
import { DOCI_DOCUMENT_TYPE_LABELS, DOCI_DOCUMENT_TYPES } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeDocIInsight,
  acknowledgeDocIReminder,
  createDocIAuraInsight,
  createDocIVersion,
  decideDocIRecommendation,
  DocumentIntelligenceApiClientError,
  fetchDocIDashboard,
  fetchDocIVersions,
  refreshDocIRecommendations,
  updateDocISettings,
  upsertDocIDocumentProfile,
} from '../../lib/document-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'search'
  | 'versions'
  | 'expiry'
  | 'recommendations'
  | 'settings'
  | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('documents:read') ||
    permissions.includes('documents:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return permissions.includes('*') || permissions.includes('documents:write');
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function DocumentIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<DocIDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocIDocumentType | ''>('');
  const [profileDocId, setProfileDocId] = useState('');
  const [profileType, setProfileType] = useState<DocIDocumentType>('coc');
  const [profileExpiresAt, setProfileExpiresAt] = useState('');
  const [profilePropertyId, setProfilePropertyId] = useState('');
  const [versionDocId, setVersionDocId] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [versionList, setVersionList] = useState<string>('');
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<DocIAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [reminderLeadDays, setReminderLeadDays] = useState('30');

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

  async function loadPage(searchQuery?: string, documentType?: DocIDocumentType | '') {
    if (!accessToken) return;
    const data = await fetchDocIDashboard(accessToken, {
      query: searchQuery?.trim() || undefined,
      documentType: documentType || undefined,
    });
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    setReminderLeadDays(String(data.settings.reminderLeadDays));
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
            err instanceof DocumentIntelligenceApiClientError
              ? err.message
              : 'Unable to load Document Intelligence',
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
      await loadPage(query, typeFilter);
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof DocumentIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Document Intelligence"
          description="Search, versions, expiry reminders, and AURA drafts over real documents"
        />
        <EmptyState
          title="Access restricted"
          description="Documents permissions are required. Technicians and clients cannot access this intelligence surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'search', label: 'Search & profiles' },
    { id: 'versions', label: 'Versions' },
    { id: 'expiry', label: 'Expiry' },
    { id: 'recommendations', label: 'AURA drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Document Intelligence"
        description="Typed profiles, search, version history, expiry reminders, and Owner-gated AURA drafts — extending the documents register"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/documents" className="yg-link">
          Documents
        </Link>
        <Link href="/crm" className="yg-link">
          Customers
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/legal-compliance" className="yg-link">
          Legal & Compliance
        </Link>
        <Link href="/aura/command-centre" className="yg-link">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          Real documents only — never invented. Operational uploads stay under /documents. AURA
          expiry alerts and missing-doc suggestions are drafts requiring Owner approval. Reminders
          never auto-send.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Saved" className="yg-panel-accent">
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
                ? 'yg-tab-active'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Document Intelligence…</p>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Documents" value={String(dashboard.totalDocuments)} />
                <StatCard label="Typed" value={String(dashboard.typedDocumentCount)} />
                <StatCard
                  label="Search"
                  value={
                    dashboard.search.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard
                  label="Expiry"
                  value={
                    dashboard.expiry.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard
                  label="Versions"
                  value={
                    dashboard.versions.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard label="Pending drafts" value={String(dashboard.pendingApprovals)} />
              </div>
              <Panel title="Links" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.links.rationale}</p>
              </Panel>
              <Panel title="Expiry" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.expiry.rationale}</p>
              </Panel>
              <Panel title="Versions" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.versions.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'search' ? (
            <div className="space-y-4">
              <Panel title="Search real documents" className="border-slate-800 bg-slate-950/80">
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(() => loadPage(query, typeFilter), 'Search refreshed');
                  }}
                >
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, file, customer, job…"
                  />
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as DocIDocumentType | '')}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
                  >
                    <option value="">All types</option>
                    {DOCI_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOCI_DOCUMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <Button type="submit">Search</Button>
                </form>
                <p className="mt-2 text-xs text-slate-500">{dashboard.search.rationale}</p>
                {dashboard.documents.length === 0 ? (
                  <EmptyState
                    title="No documents matched"
                    description="Results stay empty until real documents exist — not invented."
                  />
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {dashboard.documents.map((doc) => (
                      <li key={doc.documentId} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {doc.title} · {DOCI_DOCUMENT_TYPE_LABELS[doc.documentType]}
                        </div>
                        <div className="text-xs text-slate-500">
                          {doc.fileName}
                          {doc.customerName ? ` · ${doc.customerName}` : ''}
                          {doc.jobTitle ? ` · ${doc.jobTitle}` : ''}
                          {doc.propertyName ? ` · ${doc.propertyName}` : ''}
                          {doc.expiresAt ? ` · expires ${doc.expiresAt.slice(0, 10)}` : ''}
                          {` · v${doc.currentVersionNumber}`}
                          {' · '}
                          <Link
                            href={`/documents/${doc.documentId}`}
                            className="yg-link"
                          >
                            Open register
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {canManage ? (
                <Panel title="Set profile (type / expiry / property)" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="grid gap-2 sm:grid-cols-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          upsertDocIDocumentProfile(accessToken!, {
                            documentId: profileDocId.trim(),
                            documentType: profileType,
                            propertyId: profilePropertyId.trim() || null,
                            expiresAt: profileExpiresAt
                              ? new Date(profileExpiresAt).toISOString()
                              : null,
                          }),
                        'Document profile saved',
                      );
                    }}
                  >
                    <Input
                      value={profileDocId}
                      onChange={(e) => setProfileDocId(e.target.value)}
                      placeholder="Document UUID"
                      required
                    />
                    <select
                      value={profileType}
                      onChange={(e) => setProfileType(e.target.value as DocIDocumentType)}
                      className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
                    >
                      {DOCI_DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOCI_DOCUMENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={profileExpiresAt}
                      onChange={(e) => setProfileExpiresAt(e.target.value)}
                    />
                    <Input
                      value={profilePropertyId}
                      onChange={(e) => setProfilePropertyId(e.target.value)}
                      placeholder="Property UUID (cx_customer_properties)"
                    />
                    <Button type="submit">Save profile</Button>
                  </form>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'versions' ? (
            <div className="space-y-4">
              <Panel title="Version history" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.versions.rationale}</p>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(async () => {
                      const versions = await fetchDocIVersions(accessToken!, versionDocId.trim());
                      setVersionList(
                        versions.length === 0
                          ? 'No versions recorded yet for this document.'
                          : versions
                              .map(
                                (v) =>
                                  `v${v.versionNumber}: ${v.title} (${v.fileName})${
                                    v.changeNote ? ` — ${v.changeNote}` : ''
                                  }`,
                              )
                              .join('\n'),
                      );
                    }, 'Versions loaded');
                  }}
                >
                  <Input
                    value={versionDocId}
                    onChange={(e) => setVersionDocId(e.target.value)}
                    placeholder="Document UUID"
                    required
                  />
                  <Button type="submit">Load versions</Button>
                </form>
                {versionList ? (
                  <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-300">{versionList}</pre>
                ) : null}
              </Panel>
              {canManage ? (
                <Panel title="Record new version" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createDocIVersion(accessToken!, {
                            documentId: versionDocId.trim(),
                            changeNote: versionNote.trim() || null,
                          }),
                        'Version recorded against real document',
                      );
                    }}
                  >
                    <Input
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      placeholder="Change note"
                    />
                    <Button type="submit" disabled={!versionDocId.trim()}>
                      Create version
                    </Button>
                  </form>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'expiry' ? (
            <Panel title="Expiry reminders" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">{dashboard.expiry.rationale}</p>
              {dashboard.reminders.length === 0 ? (
                <EmptyState
                  title="No reminders"
                  description="Reminders appear when document profiles have real expiry dates and recommendations are refreshed."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.reminders.map((r) => (
                    <li key={r.id} className="rounded border border-slate-800 px-3 py-2">
                      <div className="font-medium yg-text-accent-muted">
                        {r.documentTitle ?? r.documentId} · {r.status}
                      </div>
                      <div className="text-xs text-slate-500">
                        expires {r.expiresAt.slice(0, 10)}
                        {r.docIDaysUntilExpiry != null
                          ? ` · ${r.docIDaysUntilExpiry} day(s)`
                          : ''}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{r.note}</p>
                      {canManage && r.status === 'open' ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  acknowledgeDocIReminder(accessToken!, r.id, {
                                    status: 'acknowledged',
                                  }),
                                'Reminder acknowledged',
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
                                  acknowledgeDocIReminder(accessToken!, r.id, {
                                    status: 'dismissed',
                                  }),
                                'Reminder dismissed',
                              )
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh AURA drafts" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-2 text-xs text-slate-500">
                    Generates expiry-alert and missing-doc suggestion drafts from real documents
                    only. Never auto-sends.
                  </p>
                  <Button
                    type="button"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          refreshDocIRecommendations(accessToken!, {
                            submitForApproval: true,
                          }),
                        'Recommendation drafts refreshed',
                      )
                    }
                  >
                    Refresh drafts (submit for approval)
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Recommendation drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.recommendationDrafts.length === 0 ? (
                  <EmptyState
                    title="No drafts"
                    description="Drafts stay empty until real expiry/missing-doc signals exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.recommendationDrafts.map((d: DocIRecommendationDraftSummary) => (
                      <li key={d.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {d.title} · {d.kind} · {d.status}
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                          {d.body}
                        </pre>
                        {canOwnerApprove &&
                        (d.status === 'draft' || d.status === 'pending_approval') ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideDocIRecommendation(accessToken!, d.id, {
                                      decision: 'approve',
                                    }),
                                  'Draft approved (no auto-execute)',
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
                                    decideDocIRecommendation(accessToken!, d.id, {
                                      decision: 'reject',
                                    }),
                                  'Draft rejected',
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
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Settings" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">
                autoSendRemindersEnabled and inventDocumentsEnabled are permanently false.
              </p>
              {canOwnerApprove ? (
                <form
                  className="grid gap-2 sm:grid-cols-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(
                      () =>
                        updateDocISettings(accessToken!, {
                          expiryRemindersEnabled:
                            dashboard.settings.expiryRemindersEnabled,
                          missingDocSuggestionsEnabled:
                            dashboard.settings.missingDocSuggestionsEnabled,
                          reminderLeadDays: Number(reminderLeadDays) || 30,
                          notes: settingsNotes.trim() || null,
                        }),
                      'Settings saved',
                    );
                  }}
                >
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.expiryRemindersEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            expiryRemindersEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Expiry reminders
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.missingDocSuggestionsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            missingDocSuggestionsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Missing-doc suggestions
                  </label>
                  <Input
                    value={reminderLeadDays}
                    onChange={(e) => setReminderLeadDays(e.target.value)}
                    placeholder="Reminder lead days"
                  />
                  <Input
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                    placeholder="Notes"
                  />
                  <Button type="submit">Save settings</Button>
                </form>
              ) : (
                <p className="text-sm text-slate-400">Only Company Owner may change settings.</p>
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create AURA insight handoff" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="grid gap-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createDocIAuraInsight(accessToken!, {
                            target: insightTarget,
                            title: insightTitle.trim(),
                            insight: insightBody.trim(),
                            href: '/document-intelligence',
                          }),
                        'AURA insight created',
                      );
                    }}
                  >
                    <select
                      value={insightTarget}
                      onChange={(e) =>
                        setInsightTarget(e.target.value as DocIAuraInsightTarget)
                      }
                      className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
                    >
                      {dashboard.auraConnections.map((c) => (
                        <option key={c.target} value={c.target}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      placeholder="Title"
                      required
                    />
                    <Input
                      value={insightBody}
                      onChange={(e) => setInsightBody(e.target.value)}
                      placeholder="Insight"
                      required
                    />
                    <Button type="submit">Create insight</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="AURA insights" className="border-slate-800 bg-slate-950/80">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No insights"
                    description="Insights are Owner-created handoffs — not invented analytics."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.auraInsights.map((insight) => (
                      <li key={insight.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {insight.title} · {insight.target} · {insight.status}
                        </div>
                        <p className="text-xs text-slate-400">{insight.insight}</p>
                        {canManage && insight.status === 'open' ? (
                          <Button
                            type="button"
                            className="mt-2"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  acknowledgeDocIInsight(accessToken!, insight.id, {
                                    status: 'acknowledged',
                                  }),
                                'Insight acknowledged',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-1 text-sm text-slate-300">
                  {dashboard.auraConnections.map((c) => (
                    <li key={c.target}>
                      <Link href={c.href} className="yg-link">
                        {c.label}
                      </Link>
                      <span className="text-xs text-slate-500"> — {c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
