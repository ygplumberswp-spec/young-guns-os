import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { PiDashboard, PiInsightTarget } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgePiInsight,
  createPiAuraInsight,
  decidePiRecommendation,
  fetchPiDashboard,
  ProcurementIntelligenceApiClientError,
  refreshPiCostComparisons,
  refreshPiRecommendations,
  updatePiSettings,
} from '../../lib/procurement-intelligence-api-client';

type Tab =
  | 'dashboard'
  | 'suppliers'
  | 'history'
  | 'pricing'
  | 'recommendations'
  | 'settings'
  | 'aura';

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

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `R ${(cents / 100).toFixed(2)}`;
}

export function ProcurementIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<PiDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<PiInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [productKeyFilter, setProductKeyFilter] = useState('');

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
    const data = await fetchPiDashboard(accessToken);
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
            err instanceof ProcurementIntelligenceApiClientError
              ? err.message
              : 'Unable to load Supplier & Procurement Intelligence',
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
        err instanceof ProcurementIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Supplier & Procurement Intelligence"
          description="Profiles, pricing, and purchase recommendations"
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
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'history', label: 'Purchase history' },
    { id: 'pricing', label: 'Pricing & comparisons' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Supplier & Procurement Intelligence"
        description="Real supplier profiles, pricing, purchase history, cost comparisons, and Owner-gated purchase recommendation drafts — extending Inventory Intelligence and Procurement"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/procurement" className="text-cyan-300 hover:underline">
          Procurement
        </Link>
        <Link href="/procurement/suppliers" className="text-cyan-300 hover:underline">
          Suppliers
        </Link>
        <Link href="/inventory-intelligence" className="text-cyan-300 hover:underline">
          Inventory Intelligence
        </Link>
        <Link href="/inventory/stock" className="text-cyan-300 hover:underline">
          Stock overview
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No automatic purchasing. No fake suppliers, POs, or prices. Purchase recommendations are
          drafts only — Owner approval required to accept. Optional draft PO creation still requires
          Owner PO approval to execute.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/20 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Success" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
          <p className="text-sm">{success}</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading">
          <p className="text-sm text-slate-300">Loading procurement intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">{dashboard.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Suppliers" value={String(dashboard.suppliers.supplierCount)} />
                <StatCard label="Purchase orders" value={String(dashboard.purchases.purchaseOrderCount)} />
                <StatCard label="Pricing records" value={String(dashboard.pricingRecords.length)} />
                <StatCard label="Pending recs" value={String(dashboard.pendingApprovals)} />
              </div>
              <Panel title="Honesty">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                  <li>Suppliers: {dashboard.suppliers.availability} — {dashboard.suppliers.rationale}</li>
                  <li>Purchases: {dashboard.purchases.availability} — {dashboard.purchases.rationale}</li>
                  <li>{dashboard.productClarification.thisLayer}</li>
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === 'suppliers' ? (
            <Panel title="Supplier profiles (real records)">
              {dashboard.supplierProfiles.length === 0 ? (
                <EmptyState
                  title="No suppliers yet"
                  description="Supplier intelligence stays unavailable until real suppliers exist in Procurement. Nothing is invented."
                />
              ) : (
                <div className="space-y-3">
                  {dashboard.supplierProfiles.map((s) => (
                    <div
                      key={s.supplierId}
                      className="rounded border border-slate-700/80 bg-slate-950/40 p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`/procurement/suppliers/${s.supplierId}`}
                          className="font-medium text-cyan-300 hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="text-xs uppercase text-slate-400">{s.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">
                        Products {s.productCount} · POs {s.purchaseOrderCount} · Completed{' '}
                        {s.completedOrderCount} · Spend {formatCents(s.totalSpendCents)} · Catalogue
                        prices {s.cataloguePriceCount}
                      </p>
                      <p className="text-xs text-slate-500">
                        Contact {s.contactName ?? '—'} · {s.email ?? 'no email'} ·{' '}
                        {s.phone ?? 'no phone'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {tab === 'history' ? (
            <Panel title="Purchase history (real POs)">
              {dashboard.purchaseHistory.length === 0 ? (
                <EmptyState
                  title="No purchase orders yet"
                  description="Purchase history is unavailable until real POs exist. Create them in Procurement when ready."
                />
              ) : (
                <div className="space-y-2">
                  {dashboard.purchaseHistory.map((po) => (
                    <div
                      key={po.purchaseOrderId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700/80 bg-slate-950/40 p-3 text-sm"
                    >
                      <div>
                        <Link
                          href={`/procurement/purchase-orders/${po.purchaseOrderId}`}
                          className="text-cyan-300 hover:underline"
                        >
                          {po.referenceNumber}
                        </Link>
                        <p className="text-slate-400">
                          {po.supplierName} · {po.itemCount} line(s) · {formatCents(po.totalCostCents)}
                        </p>
                      </div>
                      <span className="text-xs uppercase text-slate-400">{po.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {tab === 'pricing' ? (
            <div className="space-y-4">
              <Panel title="Pricing records">
                {dashboard.pricingRecords.length === 0 ? (
                  <EmptyState
                    title="No pricing records"
                    description="Cost comparisons stay unavailable without real supplier products or catalogue prices."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.pricingRecords.slice(0, 40).map((p) => (
                      <div
                        key={`${p.source}-${p.id}`}
                        className="rounded border border-slate-700/80 bg-slate-950/40 p-3 text-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{p.productName}</span>
                          <span>{formatCents(p.unitCostCents)}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {p.source} · {p.supplierName ?? 'No supplier'} · SKU {p.supplierSku ?? '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Cost comparisons">
                {canManage ? (
                  <form
                    className="mb-4 flex flex-wrap gap-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          refreshPiCostComparisons(accessToken!, {
                            productKey: productKeyFilter || undefined,
                          }).then(() => undefined),
                        'Cost comparisons refreshed from real pricing rows.',
                      );
                    }}
                  >
                    <Input
                      value={productKeyFilter}
                      onChange={(e) => setProductKeyFilter(e.target.value)}
                      placeholder="Optional product filter"
                    />
                    <Button type="submit">Refresh comparisons</Button>
                  </form>
                ) : null}
                {dashboard.costComparisons.length === 0 ? (
                  <EmptyState
                    title="No comparisons yet"
                    description="Refresh when real multi-supplier pricing exists. Unavailable results are not invented."
                  />
                ) : (
                  <div className="space-y-3">
                    {dashboard.costComparisons.map((c) => (
                      <div
                        key={c.id}
                        className="rounded border border-slate-700/80 bg-slate-950/40 p-3 text-sm"
                      >
                        <p className="font-medium">{c.title}</p>
                        <p className="text-slate-400">
                          {c.availability} · lines {c.lineCount} · low{' '}
                          {formatCents(c.lowestUnitCostCents)} · high{' '}
                          {formatCents(c.highestUnitCostCents)} · savings{' '}
                          {formatCents(c.savingsOpportunityCents)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{c.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <Panel title="Purchase recommendation drafts">
              {canManage ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      void withFeedback(
                        () =>
                          refreshPiRecommendations(accessToken!).then(() => undefined),
                        'Recommendation drafts generated from real stock/pricing signals.',
                      )
                    }
                  >
                    Refresh drafts
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          refreshPiRecommendations(accessToken!, {
                            submitForApproval: true,
                          }).then(() => undefined),
                        'Recommendation drafts submitted for Owner approval.',
                      )
                    }
                  >
                    Refresh + submit for approval
                  </Button>
                </div>
              ) : null}
              {dashboard.recommendations.length === 0 ? (
                <EmptyState
                  title="No recommendation drafts"
                  description="Drafts are generated from real low-stock and multi-supplier pricing only. Nothing is invented."
                />
              ) : (
                <div className="space-y-3">
                  {dashboard.recommendations.map((r) => (
                    <div
                      key={r.id}
                      className="rounded border border-slate-700/80 bg-slate-950/40 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{r.title}</p>
                        <span className="text-xs uppercase text-slate-400">
                          {r.kind} · {r.status}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-300">{r.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Qty {r.suggestedQuantity ?? '—'} · Unit {formatCents(r.estimatedUnitCostCents)}{' '}
                        · Total {formatCents(r.estimatedTotalCostCents)}
                        {r.draftPurchaseOrderId
                          ? ` · Draft PO ${r.draftPurchaseOrderId}`
                          : ''}
                      </p>
                      {canOwnerApprove &&
                      ['draft', 'pending_approval', 'approved'].includes(r.status) ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.status !== 'approved' && r.status !== 'accepted' ? (
                            <Button
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decidePiRecommendation(accessToken!, r.id, {
                                      decision: 'approve',
                                    }).then(() => undefined),
                                  'Recommendation approved (still not a purchase).',
                                )
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decidePiRecommendation(accessToken!, r.id, {
                                    decision: 'accept',
                                    createDraftPurchaseOrder: true,
                                  }).then(() => undefined),
                                'Recommendation accepted. Draft PO created if supplier linked — not ordered.',
                              )
                            }
                          >
                            Accept + draft PO
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decidePiRecommendation(accessToken!, r.id, {
                                    decision: 'reject',
                                  }).then(() => undefined),
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
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Settings">
              <p className="mb-3 text-sm text-slate-400">
                Auto-purchase is permanently disabled. Only Company Owner may change sensitive
                settings.
              </p>
              <p className="mb-3 text-xs text-slate-500">
                autoPurchaseEnabled: {String(dashboard.settings.autoPurchaseEnabled)} (always false)
              </p>
              {canOwnerApprove ? (
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(
                      () =>
                        updatePiSettings(accessToken!, {
                          recommendationsEnabled: dashboard.settings.recommendationsEnabled,
                          costComparisonsEnabled: dashboard.settings.costComparisonsEnabled,
                          notes: settingsNotes || null,
                        }).then(() => undefined),
                      'Settings updated.',
                    );
                  }}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.recommendationsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            recommendationsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Recommendations enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.costComparisonsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            costComparisonsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Cost comparisons enabled
                  </label>
                  <Input
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                    placeholder="Owner notes"
                  />
                  <Button type="submit">Save settings</Button>
                </form>
              ) : (
                <EmptyState
                  title="Owner settings only"
                  description="Company Owner is required to change Procurement Intelligence settings."
                />
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="AURA connections">
                <ul className="space-y-2 text-sm">
                  {dashboard.auraConnections.map((c) => (
                    <li key={c.target}>
                      <Link href={c.href} className="text-cyan-300 hover:underline">
                        {c.label}
                      </Link>
                      <span className="text-slate-500"> — {c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Create insight handoff">
                {canManage ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void withFeedback(
                        () =>
                          createPiAuraInsight(accessToken!, {
                            target: insightTarget,
                            title: insightTitle,
                            insight: insightBody,
                          }).then(() => undefined),
                        'AURA insight created for Owner review.',
                      );
                      setInsightTitle('');
                      setInsightBody('');
                    }}
                  >
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={insightTarget}
                      onChange={(e) => setInsightTarget(e.target.value as PiInsightTarget)}
                    >
                      {[
                        'command_centre',
                        'executive_dashboard',
                        'inventory_intelligence',
                        'procurement',
                        'operations',
                        'inventory',
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      placeholder="Insight title"
                      required
                    />
                    <textarea
                      className="min-h-[100px] w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={insightBody}
                      onChange={(e) => setInsightBody(e.target.value)}
                      placeholder="Insight grounded in real supplier/PO/pricing signals"
                      required
                    />
                    <Button type="submit">Create insight</Button>
                  </form>
                ) : (
                  <EmptyState
                    title="Write access required"
                    description="procurement:write or inventory:write is required to create insights."
                  />
                )}
              </Panel>
              <Panel title="Open insights">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No insights yet"
                    description="Create handoffs from real procurement signals only."
                  />
                ) : (
                  <div className="space-y-3">
                    {dashboard.auraInsights.map((i) => (
                      <div
                        key={i.id}
                        className="rounded border border-slate-700/80 bg-slate-950/40 p-3 text-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-medium">{i.title}</p>
                          <span className="text-xs uppercase text-slate-400">
                            {i.target} · {i.status}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-slate-300">{i.insight}</p>
                        {canManage && i.status === 'open' ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgePiInsight(accessToken!, i.id, {
                                      status: 'acknowledged',
                                    }).then(() => undefined),
                                  'Insight acknowledged.',
                                )
                              }
                            >
                              Acknowledge
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgePiInsight(accessToken!, i.id, {
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
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
