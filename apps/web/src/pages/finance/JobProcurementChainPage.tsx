import { useCallback, useEffect, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchJobProcurementChain,
  postJobProcurementMaterialCost,
  projectJobProcurementXeroBill,
  recordJobProcurementDelivery,
  recordJobProcurementSupplierInvoice,
  type JobProcurementChainDetail,
} from '../../lib/job-procurement-chain-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

/**
 * Row 118 usability handoff page — continues Row103 chain without manual IDs.
 */
export function JobProcurementChainPage() {
  const [, params] = useRoute('/finance/job-procurement-chains/:chainId');
  const chainId = params?.chainId ?? '';
  const { accessToken, user } = useAuth();
  const canWrite = user ? canManageFinance(user.permissions) : false;
  const [detail, setDetail] = useState<JobProcurementChainDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveredQty, setDeliveredQty] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceCostCents, setInvoiceCostCents] = useState('');
  const [xeroStatus, setXeroStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !chainId) return;
    try {
      const data = await fetchJobProcurementChain(accessToken, chainId);
      setDetail(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load procurement chain');
    }
  }, [accessToken, chainId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poId = detail?.links?.[0]?.purchaseOrderId ?? detail?.purchaseOrderId ?? null;
  const jobId = detail?.chain?.jobId ?? null;

  async function onDelivery() {
    if (!accessToken || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const qty = deliveredQty.trim() ? Number(deliveredQty) : null;
      await recordJobProcurementDelivery(accessToken, chainId, {
        deliveredQuantity: qty != null && Number.isFinite(qty) ? qty : null,
        deliveredAt: new Date().toISOString().slice(0, 10),
        deliveryReference: `DEL-${newFinanceClientActionId('del').slice(0, 8)}`,
      });
      setSuccess('Delivery evidence recorded.');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Delivery failed');
    } finally {
      setBusy(false);
    }
  }

  async function onInvoice() {
    if (!accessToken || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const cost = invoiceCostCents.trim() ? Number(invoiceCostCents) : null;
      await recordJobProcurementSupplierInvoice(accessToken, chainId, {
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: new Date().toISOString().slice(0, 10),
        sourceDocumentRef: invoiceNumber.trim() || 'supplier-invoice',
        lineCostCents: cost != null && Number.isFinite(cost) ? Math.trunc(cost) : null,
        vatBasis: 'EXCLUSIVE',
      });
      setSuccess('Supplier invoice evidence recorded.');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Supplier invoice failed');
    } finally {
      setBusy(false);
    }
  }

  async function onXeroProject() {
    if (!accessToken || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await projectJobProcurementXeroBill(accessToken, chainId)) as {
        projection?: { status?: string };
        warning?: string | null;
      };
      const status = data?.projection?.status ?? data?.warning ?? 'UNKNOWN';
      setXeroStatus(String(status));
      setSuccess(
        status === 'XERO_BILL_NOT_LINKED'
          ? 'Xero bill not linked (truthful — no fabricated bill).'
          : `Xero linkage: ${status}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Xero project failed');
    } finally {
      setBusy(false);
    }
  }

  async function onPostCost() {
    if (!accessToken || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await postJobProcurementMaterialCost(accessToken, chainId, {});
      setSuccess('Material cost posting resolved (exactly-once). Open Job profitability next.');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Cost post failed');
    } finally {
      setBusy(false);
    }
  }

  if (!detail && !error) {
    return (
      <>
        <FinanceNav />
        <LoadingState label="Loading procurement chain…" />
      </>
    );
  }

  return (
    <>
      <FinanceNav />
      <PageHeader
        title="Job procurement chain"
        description="Continue delivery → supplier invoice → Xero linkage → Job cost/profit without manual IDs."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="page-muted">{success}</p> : null}

      <Panel title="Chain status">
        <dl className="jobs-meta">
          <div>
            <dt>Chain</dt>
            <dd>{detail?.chain.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detail?.chain.status}</dd>
          </div>
          <div>
            <dt>Path</dt>
            <dd>{detail?.chain.purchasePath}</dd>
          </div>
          <div>
            <dt>Job</dt>
            <dd>{jobId ?? '—'}</dd>
          </div>
          <div>
            <dt>Purchase order</dt>
            <dd>
              {poId ? (
                <Link href={`/procurement/purchase-orders/${poId}`} className="jobs-link">
                  Open PO
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Xero bill</dt>
            <dd>{xeroStatus ?? 'not checked'}</dd>
          </div>
        </dl>
      </Panel>

      {canWrite ? (
        <>
          <Panel title="1. Delivery evidence">
            <label className="titan-input-group">
              <span className="titan-input-label">Delivered quantity</span>
              <input
                className="titan-input"
                value={deliveredQty}
                onChange={(e) => setDeliveredQty(e.target.value)}
                placeholder="e.g. 8"
              />
            </label>
            <Button type="button" disabled={busy} onClick={() => void onDelivery()}>
              Record delivery
            </Button>
          </Panel>

          <Panel title="2. Supplier invoice evidence">
            <label className="titan-input-group">
              <span className="titan-input-label">Invoice number</span>
              <input
                className="titan-input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Line cost (cents)</span>
              <input
                className="titan-input"
                value={invoiceCostCents}
                onChange={(e) => setInvoiceCostCents(e.target.value)}
              />
            </label>
            <Button type="button" disabled={busy} onClick={() => void onInvoice()}>
              Record supplier invoice
            </Button>
          </Panel>

          <Panel title="3. Xero bill linkage (read-only)">
            <p className="page-muted">
              Projects linkage only. If no legitimate bill exists, returns XERO_BILL_NOT_LINKED.
            </p>
            <Button type="button" disabled={busy} onClick={() => void onXeroProject()}>
              Check Xero bill linkage
            </Button>
          </Panel>

          <Panel title="4. Job cost + profitability">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" disabled={busy} onClick={() => void onPostCost()}>
                Post material cost (exactly once)
              </Button>
              {jobId ? (
                <Link href={`/jobs/${jobId}`} className="jobs-link">
                  View Job profitability / actual GP
                </Link>
              ) : null}
            </div>
          </Panel>
        </>
      ) : (
        <p className="page-muted">Finance write access required to continue this workflow.</p>
      )}
    </>
  );
}
