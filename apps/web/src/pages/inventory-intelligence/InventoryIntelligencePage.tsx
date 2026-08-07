import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { InvIntelDashboard, InvIntelInsightTarget } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeInvIntelInsight,
  createInvIntelAuraInsight,
  decideInvIntelAlert,
  fetchInvIntelDashboard,
  InventoryIntelligenceApiClientError,
  refreshInvIntelAlerts,
  refreshInvIntelUsage,
  updateInvIntelSettings,
} from '../../lib/inventory-intelligence-api-client';

type Tab = 'dashboard' | 'stock' | 'usage' | 'alerts' | 'settings' | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('inventory:read') ||
    permissions.includes('inventory:write') ||
    permissions.includes('procurement:read') ||
    permissions.includes('procurement:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('inventory:write') ||
    permissions.includes('procurement:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function InventoryIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<InvIntelDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<InvIntelInsightTarget>('command_centre');
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
    const data = await fetchInvIntelDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
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
            err instanceof InventoryIntelligenceApiClientError
              ? err.message
              : 'Unable to load Inventory Intelligence',
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
        err instanceof InventoryIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Inventory Intelligence"
          description="Stock, warehouse, and usage foundation"
        />
        <EmptyState
          title="Access restricted"
          description="Inventory or procurement permissions are required. Technicians and clients cannot access this intelligence surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'stock', label: 'Stock & warehouses' },
    { id: 'usage', label: 'Usage & movements' },
    { id: 'alerts', label: 'Alert drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Inventory Intelligence"
        description="Real stock visibility, warehouse overview, material usage, and Owner-gated shortage drafts — extending existing inventory"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/inventory/stock" className="yg-link">
          Stock overview
        </Link>
        <Link href="/inventory/movements" className="yg-link">
          Movements
        </Link>
        <Link href="/procurement" className="yg-link">
          Procurement
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/aura/command-centre" className="yg-link">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          No fake stock. No automatic reorder or stock mutation from this layer. Shortage alerts
          are drafts only — Owner approval required. Levels and usage stay unavailable when there
          are no real records.
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
          <p className="text-sm text-slate-400">Loading Inventory Intelligence…</p>
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
                  label="Stock availability"
                  value={dashboard.stock.availability === 'available' ? 'available' : 'n/a'}
                />
                <StatCard
                  label="Items"
                  value={
                    dashboard.stock.availability === 'available'
                      ? String(dashboard.stock.itemCount)
                      : 'n/a'
                  }
                />
                <StatCard
                  label="Low stock"
                  value={
                    dashboard.stock.availability === 'available'
                      ? String(dashboard.stock.lowStockCount)
                      : 'n/a'
                  }
                />
                <StatCard label="Pending alert drafts" value={String(dashboard.pendingApprovals)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Warehouses / locations"
                  value={
                    dashboard.stock.availability === 'available'
                      ? String(dashboard.stock.locationCount)
                      : 'n/a'
                  }
                />
                <StatCard label="Suppliers linked" value={String(dashboard.supplierLinkCount)} />
                <StatCard
                  label="Open purchase orders"
                  value={String(dashboard.openPurchaseOrderCount)}
                />
              </div>
              <Panel title="Usage snapshot" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.usage.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'stock' ? (
            <div className="space-y-4">
              <Panel title="Warehouses" className="border-slate-800 bg-slate-950/80">
                {dashboard.warehouses.length === 0 ? (
                  <EmptyState
                    title="No warehouses"
                    description="Warehouse visibility stays empty until real inventory locations exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.warehouses.map((w) => (
                      <li key={w.locationId} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {w.name}
                          {w.isDefault ? ' (default)' : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          {w.locationType}
                          {w.code ? ` · ${w.code}` : ''} · {w.distinctItemCount} item(s) ·{' '}
                          {w.totalUnitsOnHand} unit(s)
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Stock records" className="border-slate-800 bg-slate-950/80">
                {dashboard.stockRows.length === 0 ? (
                  <EmptyState
                    title="No stock records"
                    description="Stock levels stay unavailable until real inventory items and on-hand rows exist — not invented."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.stockRows.map((row) => (
                      <li key={row.itemId} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {row.sku} — {row.name}
                          {row.isLowStock ? ' · low stock' : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          On hand {row.totalQuantityOnHand} {row.unit} · reorder {row.reorderLevel} ·{' '}
                          {row.status}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'usage' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh usage signals" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Build usage signals from real stock movements only. Never invents patterns.
                  </p>
                  <Button
                    type="button"
                    onClick={() =>
                      void withFeedback(async () => {
                        await refreshInvIntelUsage(accessToken!, { windowDays: 30 });
                      }, 'Usage signals refreshed from real movements')
                    }
                  >
                    Refresh from movements (30d)
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Recent movements" className="border-slate-800 bg-slate-950/80">
                {dashboard.recentMovements.length === 0 ? (
                  <EmptyState
                    title="No movements"
                    description="Movement history is empty until receipts, issues, or adjustments are recorded."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.recentMovements.map((m) => (
                      <li key={m.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {m.movementType} · {m.itemSku} · Δ{m.quantityDelta}
                        </div>
                        <div className="text-xs text-slate-500">
                          {m.locationName}
                          {m.jobId ? ` · job ${m.jobId.slice(0, 8)}…` : ''}
                          {m.purchaseOrderId ? ` · PO ${m.purchaseOrderId.slice(0, 8)}…` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Job material usage" className="border-slate-800 bg-slate-950/80">
                {dashboard.materialUsage.length === 0 ? (
                  <EmptyState
                    title="No material lines"
                    description="Job material usage appears when technicians or office staff record real material lines."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.materialUsage.map((m) => (
                      <li key={m.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {m.itemSku ?? 'Unlinked item'} · qty {m.quantity} · {m.status}
                        </div>
                        <div className="text-xs text-slate-500">
                          Job {m.jobId.slice(0, 8)}… · {m.materialSource}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Usage signals" className="border-slate-800 bg-slate-950/80">
                {dashboard.usageSignals.length === 0 ? (
                  <EmptyState
                    title="No usage signals"
                    description="Refresh from real movements when ready. Patterns stay unavailable until then."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.usageSignals.map((s) => (
                      <li key={s.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">{s.title}</div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{s.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'alerts' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Scan real stock" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Creates shortage / below-reorder drafts from real on-hand vs reorder levels.
                    Does not create purchase orders.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(async () => {
                          await refreshInvIntelAlerts(accessToken!, {});
                        }, 'Alert drafts refreshed from real stock')
                      }
                    >
                      Refresh drafts
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(async () => {
                          await refreshInvIntelAlerts(accessToken!, {
                            submitForApproval: true,
                          });
                        }, 'Alert drafts submitted for Owner approval')
                      }
                    >
                      Refresh + submit for approval
                    </Button>
                  </div>
                </Panel>
              ) : null}
              <Panel title="Alert drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.alertDrafts.length === 0 ? (
                  <EmptyState
                    title="No alert drafts"
                    description="No shortage drafts yet. Scan real stock when items fall to or below reorder level."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.alertDrafts.map((a) => (
                      <li key={a.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {a.title} · {a.status}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{a.body}</p>
                        {canOwnerApprove &&
                        (a.status === 'draft' || a.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(async () => {
                                  await decideInvIntelAlert(accessToken!, a.id, {
                                    decision: 'approve',
                                  });
                                }, 'Alert draft approved (no PO created)')
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(async () => {
                                  await decideInvIntelAlert(accessToken!, a.id, {
                                    decision: 'reject',
                                  });
                                }, 'Alert draft rejected')
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
            <Panel title="Owner controls" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-sm text-slate-400">
                Auto-reorder and auto stock mutation stay off. Only Company Owner may change
                sensitive settings.
              </p>
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li>Auto reorder: always off</li>
                <li>Auto stock mutation: always off</li>
                <li>
                  Alert drafts: {dashboard.settings.alertDraftsEnabled ? 'enabled' : 'disabled'}
                </li>
                <li>
                  Usage signals:{' '}
                  {dashboard.settings.usageSignalsEnabled ? 'enabled' : 'disabled'}
                </li>
                <li>Shortage mode: {dashboard.settings.shortageThresholdMode}</li>
              </ul>
              {canOwnerApprove ? (
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(async () => {
                      await updateInvIntelSettings(accessToken!, {
                        alertDraftsEnabled: dashboard.settings.alertDraftsEnabled,
                        usageSignalsEnabled: dashboard.settings.usageSignalsEnabled,
                        shortageThresholdMode: dashboard.settings.shortageThresholdMode,
                        notes: settingsNotes.trim() || null,
                      });
                    }, 'Settings updated');
                  }}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.alertDraftsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            alertDraftsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Alert drafts enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.usageSignalsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            usageSignalsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Usage signals enabled
                  </label>
                  <label className="block text-sm text-slate-400">
                    Shortage threshold mode
                    <select
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
                      value={dashboard.settings.shortageThresholdMode}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            shortageThresholdMode: e.target.value as
                              | 'reorder_level'
                              | 'zero_only',
                          },
                        })
                      }
                    >
                      <option value="reorder_level">Reorder level</option>
                      <option value="zero_only">Zero stock only</option>
                    </select>
                  </label>
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <Button type="submit">Save settings</Button>
                </form>
              ) : (
                <EmptyState
                  title="Owner only"
                  description="Sensitive Inventory Intelligence settings require Company Owner."
                />
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm text-slate-300">
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
              {canManage ? (
                <Panel title="Create insight handoff" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="space-y-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(async () => {
                        await createInvIntelAuraInsight(accessToken!, {
                          target: insightTarget,
                          title: insightTitle,
                          insight: insightBody,
                        });
                        setInsightTitle('');
                        setInsightBody('');
                      }, 'AURA insight created from real inventory context');
                    }}
                  >
                    <label className="block text-sm text-slate-400">
                      Target
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
                        value={insightTarget}
                        onChange={(e) =>
                          setInsightTarget(e.target.value as InvIntelInsightTarget)
                        }
                      >
                        <option value="command_centre">Command Centre</option>
                        <option value="executive_dashboard">Executive dashboard</option>
                        <option value="procurement">Procurement</option>
                        <option value="operations">Operations</option>
                        <option value="jobs">Jobs</option>
                        <option value="inventory">Inventory</option>
                      </select>
                    </label>
                    <Input
                      label="Title"
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      required
                    />
                    <label className="block text-sm text-slate-400">
                      Insight
                      <textarea
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
                        rows={4}
                        value={insightBody}
                        onChange={(e) => setInsightBody(e.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit">Create insight draft</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="AURA insights" className="border-slate-800 bg-slate-950/80">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No insights"
                    description="Create handoffs from real stock/usage context. Nothing is invented automatically."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.auraInsights.map((i) => (
                      <li key={i.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {i.title} · {i.target} · {i.status}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                          {i.insight}
                        </p>
                        {canManage && i.status === 'open' ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(async () => {
                                  await acknowledgeInvIntelInsight(accessToken!, i.id, {
                                    status: 'acknowledged',
                                  });
                                }, 'Insight acknowledged')
                              }
                            >
                              Acknowledge
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(async () => {
                                  await acknowledgeInvIntelInsight(accessToken!, i.id, {
                                    status: 'dismissed',
                                  });
                                }, 'Insight dismissed')
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
