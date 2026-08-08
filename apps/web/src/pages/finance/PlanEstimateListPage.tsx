import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { PageHeader } from '../../components/ux';
import { Button, Input, LoadingState, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { ApiClientError, request } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

type EstimateRow = {
  id: string;
  status: string;
  sourceFilename: string | null;
  sourceRevisionLabel: string | null;
  estimateVersion: number;
  proposedSellExVatCents: number | null;
  quoteId: string | null;
  jobId: string | null;
  updatedAt: string;
};

export function PlanEstimateListPage() {
  const { accessToken, user } = useAuth();
  const canWrite = user ? canManageFinance(user.permissions) : false;
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [filename, setFilename] = useState('fixture-plan-rev-a.pdf');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await request<{ estimates: EstimateRow[] }>('/finance/plan-estimates', {
        accessToken,
      });
      setRows(data.estimates);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load plan estimates');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !canWrite) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await request<{ estimate: EstimateRow; idempotent: boolean }>(
        '/finance/plan-estimates',
        {
          accessToken,
          method: 'POST',
          body: {
            customerId: customerId || null,
            sourceFilename: filename,
            sourceRevisionLabel: 'Rev A',
            scaleStatus: 'SCALE_NOT_PROVIDED',
            proposedSellExVatCents: 275000,
            sellSource: 'MANUAL_DRAFT',
            clientActionId: newFinanceClientActionId(),
            items: [
              {
                pointType: 'WATER',
                subtypeLabel: 'cold water point',
                description: 'Cold water points',
                quantity: 4,
                quantityOrigin: 'MANUAL_COUNT',
                pageReference: 'p.1',
                confidence: 'CONFIRMED',
                customerVisibleScopeText: 'Supply and install cold water points',
              },
              {
                pointType: 'WASTE',
                description: 'Waste points',
                quantity: 3,
                quantityOrigin: 'MANUAL_COUNT',
                pageReference: 'p.1',
                confidence: 'CONFIRMED',
                customerVisibleScopeText: 'Waste connections',
              },
              {
                pointType: 'GEYSER',
                description: 'Geyser requirement',
                quantity: 1,
                quantityOrigin: 'MANUAL_COUNT',
                pageReference: 'p.2',
                confidence: 'CONFIRMED',
                customerVisibleScopeText: 'Geyser installation',
              },
            ],
            costComponents: [
              {
                componentType: 'MATERIAL',
                description: 'Estimated materials',
                quantity: 1,
                unitCostCents: 90000,
                costProvenance: 'APPROVED_MANUAL_COST',
              },
              {
                componentType: 'LABOUR',
                description: 'Estimated labour hours',
                quantity: 8,
                unitCostCents: 8000,
                costProvenance: 'APPROVED_MANUAL_COST',
              },
              {
                componentType: 'SITE',
                description: 'Site attendance',
                quantity: 1,
                unitCostCents: 4500,
                costProvenance: 'APPROVED_MANUAL_COST',
              },
            ],
          },
        },
      );
      setSuccess(
        data.idempotent
          ? 'Existing estimate returned (idempotent).'
          : `Created estimate ${data.estimate.id} — review/approve before quote.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) {
    return <LoadingState label="Loading plan estimates…" />;
  }

  return (
    <div className="finance-page">
      <PageHeader
        title="Plan estimates"
        description="Manual floor-plan take-off baseline. Not AI reading. Global price automation OFF."
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Estimates">
        {rows.length === 0 ? (
          <p className="page-muted">No plan estimates yet.</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/finance/plan-estimates/${row.id}`}>
                  {row.sourceFilename ?? row.id.slice(0, 8)} · v{row.estimateVersion} ·{' '}
                  {row.status}
                  {row.proposedSellExVatCents != null
                    ? ` · sell ${formatMoney(row.proposedSellExVatCents, 'ZAR')}`
                    : ''}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canWrite ? (
        <Panel title="Create manual take-off estimate">
          <form onSubmit={onCreate}>
            <label>
              Customer ID (optional UUID)
              <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
            </label>
            <label>
              Source filename
              <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
            </label>
            <p className="page-muted">
              Creates WATER / WASTE / GEYSER CONFIRMED points with approved manual costs. Scale
              remains SCALE_NOT_PROVIDED (no invented lengths). Not AI.
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create draft take-off'}
            </Button>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
