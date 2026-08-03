import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  PriAuraConnection,
  PriAuraInsightSummary,
  PriAuraInsightTarget,
  PriCocRow,
  PriDashboard,
  PriEquipmentRow,
  PriInsightDraftSummary,
  PriMaintenanceHistoryRow,
  PriPhotoRow,
  PriPreviousWorkRow,
  PriPropertyProfile,
} from '@titan/shared';
import { buildGoogleMapsPlaceUrl, isValidLatLng } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { PropertyMapPanel } from '../../features/jobs/PropertyMapPanel';
import {
  acknowledgePriInsight,
  createPriAuraInsight,
  decidePriInsightDraft,
  fetchPriDashboard,
  PropertyIntelligenceApiClientError,
  refreshPriInsights,
  updatePriSettings,
} from '../../lib/property-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'properties'
  | 'equipment'
  | 'documents'
  | 'work'
  | 'insights'
  | 'settings'
  | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customers:read') ||
    permissions.includes('customers:write') ||
    permissions.includes('jobs:read') ||
    permissions.includes('documents:read') ||
    permissions.includes('ops:read') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customers:write') ||
    permissions.includes('jobs:write') ||
    permissions.includes('ops:manage')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function PropertyIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<PriDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<PriAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');

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
    const data = await fetchPriDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    if (!selectedPropertyId && data.propertyProfiles[0]) {
      setSelectedPropertyId(data.propertyProfiles[0].propertyId);
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
            err instanceof PropertyIntelligenceApiClientError
              ? err.message
              : 'Unable to load Property Intelligence',
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
        err instanceof PropertyIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Property Intelligence"
          description="Property profiles, Maps, equipment, and maintenance history"
        />
        <EmptyState
          title="Access restricted"
          description="Customers, jobs, documents, or ops permissions are required. Technicians and clients cannot access this intelligence surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'properties', label: 'Properties' },
    { id: 'equipment', label: 'Equipment & geysers' },
    { id: 'documents', label: 'COCs & photos' },
    { id: 'work', label: 'Work & maintenance' },
    { id: 'insights', label: 'Insight drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  const selectedProperty =
    dashboard?.propertyProfiles.find((p) => p.propertyId === selectedPropertyId) ??
    dashboard?.propertyProfiles[0] ??
    null;

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Property Intelligence"
        description="Real property profiles with Maps, equipment, COCs, photos, previous work, and Owner-gated AURA drafts — extending CRM properties"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/crm" className="text-cyan-300 hover:underline">
          CRM
        </Link>
        <Link href="/customer-360-intelligence" className="text-cyan-300 hover:underline">
          Customer 360
        </Link>
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/documents" className="text-cyan-300 hover:underline">
          Documents
        </Link>
        <Link href="/recurring-maintenance" className="text-cyan-300 hover:underline">
          Recurring Maintenance
        </Link>
        <Link href="/integrations/google-maps" className="text-cyan-300 hover:underline">
          Google Maps
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No fake properties, customers, jobs, or maintenance. Maps pins use real stored coordinates
          only via authenticated Google Maps browser config. Insight drafts require Owner approval
          and never auto-send communications.
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
          <p className="text-sm text-slate-400">Loading Property Intelligence…</p>
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
                <StatCard label="Properties" value={String(dashboard.totalProperties)} />
                <StatCard label="Customers linked" value={String(dashboard.linkedCustomerCount)} />
                <StatCard
                  label="Maps"
                  value={dashboard.maps.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard
                  label="Equipment"
                  value={
                    dashboard.equipment.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard label="Pending drafts" value={String(dashboard.pendingApprovals)} />
                <StatCard label="Geysers" value={String(dashboard.geyserRows.length)} />
              </div>
              <Panel title="Maps" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.maps.rationale}</p>
              </Panel>
              <Panel title="Equipment" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.equipment.rationale}</p>
              </Panel>
              <Panel title="Documents" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.documents.rationale}</p>
              </Panel>
              <Panel title="Work & maintenance" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.work.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'properties' ? (
            <div className="space-y-4">
              <Panel title="Property profiles" className="border-slate-800 bg-slate-950/80">
                {dashboard.propertyProfiles.length === 0 ? (
                  <EmptyState
                    title="No properties"
                    description="Profiles stay empty until real CRM customer properties exist — not invented."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.propertyProfiles.map((p: PriPropertyProfile) => {
                      const mapsUrl =
                        p.hasRealCoordinates && isValidLatLng(p.latitude, p.longitude)
                          ? buildGoogleMapsPlaceUrl({
                              latitude: p.latitude,
                              longitude: p.longitude,
                              placeId: p.placeId,
                              address: p.formattedAddress,
                            })
                          : null;
                      return (
                        <li key={p.propertyId} className="rounded border border-slate-800 px-3 py-2">
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setSelectedPropertyId(p.propertyId)}
                          >
                            <div className="font-medium text-cyan-100">
                              {p.propertyName}
                              {p.isPrimary ? ' · primary' : ''}
                            </div>
                            <div className="text-xs text-slate-500">
                              {p.customerName}
                              {p.formattedAddress ? ` · ${p.formattedAddress}` : ' · no address'}
                              {p.hasRealCoordinates
                                ? ` · coords ${p.latitude}, ${p.longitude}`
                                : ' · coords unavailable'}
                              {' · '}
                              {p.jobCount} job(s) · {p.equipmentCount} equipment · {p.cocCount}{' '}
                              COC · {p.photoCount} photo
                            </div>
                          </button>
                          {mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs text-cyan-300 hover:underline"
                            >
                              Open in Google Maps
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              {selectedProperty ? (
                <div data-titan-extension="property-intelligence">
                  <PropertyMapPanel
                    streetAddress={selectedProperty.formattedAddress}
                    latitude={selectedProperty.latitude}
                    longitude={selectedProperty.longitude}
                    placeId={selectedProperty.placeId}
                    formattedAddress={selectedProperty.formattedAddress}
                    cameraContextKey={selectedProperty.propertyId}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'equipment' ? (
            <div className="space-y-4">
              <Panel title="Installed equipment" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.equipment.rationale}</p>
                {dashboard.equipmentRows.length === 0 ? (
                  <EmptyState
                    title="No installed equipment"
                    description="Equipment stays unavailable until property-linked asset registry profiles or maintenance plans exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.equipmentRows.map((row: PriEquipmentRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.name}
                          {row.isGeyser ? ' · geyser' : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.source}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                          {row.manufacturer ? ` · ${row.manufacturer}` : ''}
                          {row.model ? ` ${row.model}` : ''}
                          {row.status ? ` · ${row.status}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Geysers" className="border-slate-800 bg-slate-950/80">
                {dashboard.geyserRows.length === 0 ? (
                  <EmptyState
                    title="No geyser signals"
                    description="Geysers stay unavailable until plumbing_kind=geyser plans or geyser-named assets exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.geyserRows.map((row: PriEquipmentRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.plumbingKind ?? 'geyser'}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'documents' ? (
            <div className="space-y-4">
              <Panel title="COCs / certificates" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.documents.rationale}</p>
                {dashboard.cocRows.length === 0 ? (
                  <EmptyState
                    title="No COC signals"
                    description="COCs stay unavailable until completion reports, certificate pack items, or CX certificates exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.cocRows.map((row: PriCocRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">{row.title}</div>
                        <div className="text-xs text-slate-500">
                          {row.source}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                          {row.status ? ` · ${row.status}` : ''}
                          {' · '}
                          {row.createdAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Photos" className="border-slate-800 bg-slate-950/80">
                {dashboard.photoRows.length === 0 ? (
                  <EmptyState
                    title="No photo signals"
                    description="Photos stay unavailable until completion-report photo sections, pack photo evidence, asset photos, or booking photos exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.photoRows.map((row: PriPhotoRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">{row.label}</div>
                        <div className="text-xs text-slate-500">
                          {row.source}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                          {' · '}
                          {row.createdAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'work' ? (
            <div className="space-y-4">
              <Panel title="Previous work" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.work.rationale}</p>
                {dashboard.previousWork.length === 0 ? (
                  <EmptyState
                    title="No previous work"
                    description="Previous work stays unavailable until jobs are linked to real properties."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.previousWork.map((row: PriPreviousWorkRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.jobNumber ? `${row.jobNumber} · ` : ''}
                          {row.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.status}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                          {row.customerName ? ` · ${row.customerName}` : ''}
                          {row.scheduledAt ? ` · scheduled ${row.scheduledAt}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Maintenance history" className="border-slate-800 bg-slate-950/80">
                {dashboard.maintenanceHistory.length === 0 ? (
                  <EmptyState
                    title="No maintenance history"
                    description="Maintenance history stays unavailable until property-linked recurring plans or runs exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.maintenanceHistory.map((row: PriMaintenanceHistoryRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.planName} · {row.source}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.status}
                          {row.plumbingKind ? ` · ${row.plumbingKind}` : ''}
                          {row.propertyName ? ` · ${row.propertyName}` : ''}
                          {row.nextDueAt ? ` · due ${row.nextDueAt}` : ''}
                          {row.runCompletedAt ? ` · completed ${row.runCompletedAt}` : ''}
                          {row.lastCompletedAt ? ` · last ${row.lastCompletedAt}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              <Panel title="Insight drafts" className="border-slate-800 bg-slate-950/80">
                <div className="mb-3 flex flex-wrap gap-2">
                  {canManage ? (
                    <>
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () => refreshPriInsights(accessToken!, {}),
                            'Insight drafts refreshed from real property signals',
                          )
                        }
                      >
                        Refresh drafts
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          void withFeedback(
                            () => refreshPriInsights(accessToken!, { submitForApproval: true }),
                            'Insight drafts submitted for Owner approval',
                          )
                        }
                      >
                        Refresh & submit for approval
                      </Button>
                    </>
                  ) : null}
                </div>
                {dashboard.insightDrafts.length === 0 ? (
                  <EmptyState
                    title="No insight drafts"
                    description="Refresh drafts when real property, maintenance, or document signals exist. Never invented."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.insightDrafts.map((draft: PriInsightDraftSummary) => (
                      <li key={draft.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {draft.title} · {draft.status}
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                          {draft.body}
                        </pre>
                        {canOwnerApprove &&
                        (draft.status === 'draft' || draft.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decidePriInsightDraft(accessToken!, draft.id, {
                                      decision: 'approve',
                                    }),
                                  'Insight draft approved (no auto-send)',
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
                                    decidePriInsightDraft(accessToken!, draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Insight draft rejected',
                                )
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decidePriInsightDraft(accessToken!, draft.id, {
                                      decision: 'acknowledge',
                                    }),
                                  'Insight draft acknowledged',
                                )
                              }
                            >
                              Acknowledge
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
                Auto-send and invent-properties remain permanently disabled. Owner-controlled only.
              </p>
              <form
                className="space-y-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!accessToken || !canOwnerApprove) return;
                  void withFeedback(
                    () =>
                      updatePriSettings(accessToken, {
                        insightDraftsEnabled: dashboard.settings.insightDraftsEnabled,
                        mapsSignalsEnabled: dashboard.settings.mapsSignalsEnabled,
                        maintenanceSignalsEnabled: dashboard.settings.maintenanceSignalsEnabled,
                        notes: settingsNotes || null,
                      }),
                    'Settings saved',
                  );
                }}
              >
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.insightDraftsEnabled}
                    disabled={!canOwnerApprove}
                    onChange={(e) =>
                      setDashboard({
                        ...dashboard,
                        settings: {
                          ...dashboard.settings,
                          insightDraftsEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Insight drafts enabled
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.mapsSignalsEnabled}
                    disabled={!canOwnerApprove}
                    onChange={(e) =>
                      setDashboard({
                        ...dashboard,
                        settings: {
                          ...dashboard.settings,
                          mapsSignalsEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Maps coordinate signals enabled
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.maintenanceSignalsEnabled}
                    disabled={!canOwnerApprove}
                    onChange={(e) =>
                      setDashboard({
                        ...dashboard,
                        settings: {
                          ...dashboard.settings,
                          maintenanceSignalsEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Maintenance signals enabled
                </label>
                <Input
                  label="Notes"
                  value={settingsNotes}
                  disabled={!canOwnerApprove}
                  onChange={(e) => setSettingsNotes(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  autoSendEnabled={String(dashboard.settings.autoSendEnabled)} ·
                  inventPropertiesEnabled={String(dashboard.settings.inventPropertiesEnabled)}
                </p>
                {canOwnerApprove ? (
                  <Button type="submit">Save settings</Button>
                ) : (
                  <p className="text-xs text-slate-500">Only Company Owner may change settings.</p>
                )}
              </form>
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="AURA connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.auraConnections.map((c: PriAuraConnection) => (
                    <li key={c.target} className="rounded border border-slate-800 px-3 py-2">
                      <Link href={c.href} className="font-medium text-cyan-100 hover:underline">
                        {c.label}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {c.status} · {c.note}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="AURA insights" className="border-slate-800 bg-slate-950/80">
                {canManage ? (
                  <form
                    className="mb-4 space-y-2"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      if (!accessToken) return;
                      void withFeedback(
                        () =>
                          createPriAuraInsight(accessToken, {
                            target: insightTarget,
                            title: insightTitle,
                            insight: insightBody,
                            href: '/property-intelligence',
                          }),
                        'AURA insight created (draft handoff only)',
                      ).then(() => {
                        setInsightTitle('');
                        setInsightBody('');
                      });
                    }}
                  >
                    <Input
                      label="Title"
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      required
                    />
                    <label className="block text-sm text-slate-300">
                      Target
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                        value={insightTarget}
                        onChange={(e) =>
                          setInsightTarget(e.target.value as PriAuraInsightTarget)
                        }
                      >
                        {dashboard.auraConnections.map((c) => (
                          <option key={c.target} value={c.target}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-300">
                      Insight
                      <textarea
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                        rows={4}
                        value={insightBody}
                        onChange={(e) => setInsightBody(e.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit">Create AURA insight</Button>
                  </form>
                ) : null}
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No AURA insights"
                    description="Create handoffs from real property understanding — never invented analytics."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.auraInsights.map((insight: PriAuraInsightSummary) => (
                      <li key={insight.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {insight.title} · {insight.status} · {insight.target}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{insight.insight}</p>
                        {canManage && insight.status === 'open' ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgePriInsight(accessToken!, insight.id, {
                                      status: 'acknowledged',
                                    }),
                                  'Insight acknowledged',
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
                                    acknowledgePriInsight(accessToken!, insight.id, {
                                      status: 'dismissed',
                                    }),
                                  'Insight dismissed',
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
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
