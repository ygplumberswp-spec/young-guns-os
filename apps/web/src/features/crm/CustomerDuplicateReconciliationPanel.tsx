import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { DuplicateResolutionType } from '@titan/shared';
import { canAccessDuplicateReconciliation, canExecuteDuplicateReconciliation } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import {
  approveDuplicateResolution,
  draftDuplicateResolution,
  executeDuplicateResolution,
  fetchDuplicateReconciliationQueue,
  fetchDuplicateSideBySide,
  reverseDuplicateResolution,
  scanDuplicateReconciliations,
  type ReconciliationQueueItem,
} from '../../lib/customer-duplicate-reconciliation-api';

const RESOLUTION_OPTIONS: Array<{ value: DuplicateResolutionType; label: string }> = [
  { value: 'NOT_DUPLICATE', label: 'Not a duplicate' },
  { value: 'SAME_COMPANY_DIFFERENT_PERSON', label: 'Same company — different person / contact' },
  { value: 'TRUE_DUPLICATE_CANONICALIZE', label: 'True duplicate — canonicalize (non-destructive)' },
  { value: 'DEFER', label: 'Defer / needs more information' },
];

export function CustomerDuplicateReconciliationPanel() {
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState<ReconciliationQueueItem[]>([]);
  const [filter, setFilter] = useState<string>('unreviewed');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState<Record<string, unknown> | null>(null);
  const [resolutionType, setResolutionType] =
    useState<DuplicateResolutionType>('SAME_COMPANY_DIFFERENT_PERSON');
  const [canonicalId, setCanonicalId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<Record<string, unknown> | null>(null);

  const canReview = useMemo(
    () =>
      user
        ? canAccessDuplicateReconciliation({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );
  const canExecute = useMemo(
    () =>
      user
        ? canExecuteDuplicateReconciliation({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const load = useCallback(async () => {
    if (!accessToken || !canReview) return;
    const next = await fetchDuplicateReconciliationQueue(accessToken, {
      status: filter || undefined,
    });
    setItems(next);
  }, [accessToken, canReview, filter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load queue');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleScan() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await scanDuplicateReconciliations(accessToken);
      await load();
      setSuccess('Scan complete — candidates classified. No auto-merge.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function openCase(id: string) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setImpact(null);
    try {
      const data = await fetchDuplicateSideBySide(accessToken, id);
      setSideBySide(data);
      setSelectedId(id);
      const left = data.left as { id: string };
      const right = data.right as { id: string };
      const suggested = (data.reconciliation as { suggestedResolution?: DuplicateResolutionType })
        .suggestedResolution;
      if (suggested) setResolutionType(suggested);
      setCanonicalId(left.id);
      void right;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load side-by-side');
    } finally {
      setBusy(false);
    }
  }

  async function handleDraft() {
    if (!accessToken || !selectedId || !canonicalId) return;
    setBusy(true);
    setError(null);
    try {
      const result = (await draftDuplicateResolution(accessToken, selectedId, {
        resolutionType,
        canonicalCustomerId: canonicalId,
        notes: notes.trim() || null,
      })) as { impact: Record<string, unknown> };
      setImpact(result.impact);
      setSuccess('Draft saved. Review impact, then Approve → Execute.');
      await openCase(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Draft failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!accessToken || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await approveDuplicateResolution(accessToken, selectedId);
      setSuccess('Approved. Ready to execute.');
      await openCase(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute() {
    if (!accessToken || !selectedId) return;
    if (
      !window.confirm(
        'Execute this reconciliation? Xero IDs and financial ownership will be preserved. No Xero write.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await executeDuplicateResolution(accessToken, selectedId);
      setSuccess('Executed. Financial ownership preserved. Xero writes = 0.');
      setSideBySide(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleReverse() {
    if (!accessToken || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await reverseDuplicateResolution(accessToken, selectedId);
      setSuccess('Reversed. Source histories preserved.');
      await openCase(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reverse failed');
    } finally {
      setBusy(false);
    }
  }

  if (!canReview) {
    return (
      <EmptyState
        title="Access denied"
        description="Technicians and Clients cannot open the duplicate review queue."
      />
    );
  }

  const left = sideBySide?.left as
    | {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        xeroContactIds: string[];
        linkCounts: Record<string, number>;
        peopleCount?: number;
        vatNumber?: string | null;
        companyName?: string | null;
      }
    | undefined;
  const right = sideBySide?.right as typeof left;
  const recon = sideBySide?.reconciliation as
    | {
        status: string;
        confidenceLabel: string;
        rationale: string[];
        matchSignals: string[];
        differingSignals: string[];
        fieldCompares: Array<{
          field: string;
          left: string | null;
          right: string | null;
          status: string;
        }>;
      }
    | undefined;

  return (
    <div className="space-y-4">
      <Panel
        title="Safe Duplicate Review (Row 85)"
        description="Classify → Draft → Approve → Execute. Never auto-merge. Never write to Xero. Prefer same-company / different-person over destructive merge."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleScan()}>
            Scan & classify
          </Button>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="executed">Executed</option>
            <option value="dismissed">Dismissed</option>
            <option value="deferred">Deferred</option>
            <option value="">All</option>
          </select>
          <Link href="/crm">
            <Button type="button" variant="ghost">
              Back to CRM
            </Button>
          </Link>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        {items.length === 0 ? (
          <EmptyState
            title="No reconciliation cases"
            description="Run Scan & classify to build an explainable review queue."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="text-sm">
                  <strong>
                    {item.leftName} ↔ {item.rightName}
                  </strong>
                  <div className="text-slate-600">
                    {item.confidenceLabel} · {item.status}
                    {item.suggestedResolution ? ` · suggest ${item.suggestedResolution}` : ''}
                  </div>
                  <div className="text-xs text-slate-500">
                    {(item.matchSignals ?? []).slice(0, 3).join(' · ') || 'No strong signals'}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void openCase(item.id)}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sideBySide && left && right && recon ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`A — ${left.name}`}>
            <SideCard side={left} />
          </Panel>
          <Panel title={`B — ${right.name}`}>
            <SideCard side={right} />
          </Panel>

          <Panel title="Why matched / differed">
            <p className="text-sm font-medium">{recon.confidenceLabel}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {(recon.rationale ?? []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-1 pr-2">Field</th>
                    <th className="py-1 pr-2">A</th>
                    <th className="py-1 pr-2">B</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(recon.fieldCompares ?? []).map((f) => (
                    <tr key={f.field} className="border-t border-slate-100">
                      <td className="py-1 pr-2">{f.field}</td>
                      <td className="py-1 pr-2">{f.left || '—'}</td>
                      <td className="py-1 pr-2">{f.right || '—'}</td>
                      <td className="py-1">{f.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(left.xeroContactIds.length > 0 || right.xeroContactIds.length > 0) &&
            left.xeroContactIds.join() !== right.xeroContactIds.join() ? (
              <p className="mt-3 text-sm text-amber-800">
                Warning: Xero Contact IDs differ — do not collapse identities. Prefer same-company /
                different-person.
              </p>
            ) : null}
          </Panel>

          <Panel title="Resolution (Draft → Approve → Execute)">
            <label className="mb-2 block text-sm">
              Resolution
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                value={resolutionType}
                disabled={!canExecute || busy}
                onChange={(e) => setResolutionType(e.target.value as DuplicateResolutionType)}
              >
                {RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-sm">
              Canonical company
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                value={canonicalId}
                disabled={!canExecute || busy}
                onChange={(e) => setCanonicalId(e.target.value)}
              >
                <option value={left.id}>A — {left.name}</option>
                <option value={right.id}>B — {right.name}</option>
              </select>
            </label>
            <label className="mb-3 block text-sm">
              Notes
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                rows={3}
                value={notes}
                disabled={!canExecute || busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!canExecute || busy} onClick={() => void handleDraft()}>
                Save draft + preview
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canExecute || busy || recon.status !== 'draft'}
                onClick={() => void handleApprove()}
              >
                Approve
              </Button>
              <Button
                type="button"
                disabled={!canExecute || busy || recon.status !== 'approved'}
                onClick={() => void handleExecute()}
              >
                Execute
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!canExecute || busy || recon.status !== 'executed'}
                onClick={() => void handleReverse()}
              >
                Reverse
              </Button>
            </div>
            {impact ? (
              <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-2 text-xs">
                {JSON.stringify(impact, null, 2)}
              </pre>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              Status: {recon.status}. Vague “Merge” is not offered — choose an explicit resolution.
            </p>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function SideCard({
  side,
}: {
  side: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    xeroContactIds: string[];
    linkCounts: Record<string, number>;
    peopleCount?: number;
    vatNumber?: string | null;
    companyName?: string | null;
  };
}) {
  const c = side.linkCounts;
  return (
    <dl className="space-y-1 text-sm">
      <div>
        <dt className="text-slate-500">ID</dt>
        <dd>
          <Link href={`/crm/${side.id}`} className="underline">
            {side.id}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Company</dt>
        <dd>{side.companyName || side.name}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Email / phone</dt>
        <dd>
          {side.email || '—'} · {side.phone || '—'}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">VAT</dt>
        <dd>{side.vatNumber || '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Xero Contact IDs</dt>
        <dd>{side.xeroContactIds.length ? side.xeroContactIds.join(', ') : '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Linked history</dt>
        <dd>
          people {side.peopleCount ?? 0} · jobs {c.jobs} · quotes {c.quotes} · invoices {c.invoices} ·
          payments {c.payments} · properties {c.properties} · docs {c.documents} · leads {c.leads}
        </dd>
      </div>
    </dl>
  );
}
