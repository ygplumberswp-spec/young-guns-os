import { PageHeader } from '../../components/ux';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { BoqStatus } from '@titan/shared';
import { BOQ_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { convertBoqToQuote, fetchBoqDocument, updateBoqDocument } from '../../lib/boq-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

function formatStatus(status: BoqStatus): string {
  return BOQ_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function BoqDetailPage() {
  const [, params] = useRoute('/finance/boq/:id');
  const documentId = params?.id ?? '';
  const [, navigate] = useLocation();
  const { accessToken, user } = useAuth();

  const [document, setDocument] = useState<Awaited<ReturnType<typeof fetchBoqDocument>> | null>(null);
  const [convertCustomerId, setConvertCustomerId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const loadDocument = useCallback(async () => {
    if (!accessToken || !documentId) return;
    const data = await fetchBoqDocument(accessToken, documentId);
    setDocument(data);
    setConvertCustomerId(data.customerId ?? '');
  }, [accessToken, documentId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !documentId || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadDocument();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load BOQ');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, documentId, loadDocument]);

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="BOQ" description="You do not have permission to view finance." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="BOQ" />
        <LoadingState label="Loading BOQ…" />
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="finance-page">
        <PageHeader title="BOQ" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!document) return null;

  const canConvert = canWrite && document.status !== 'converted';
  const canApprove = canWrite && document.status === 'draft';

  async function handleApprove() {
    if (!accessToken || !canApprove) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateBoqDocument(accessToken, document!.id, { status: 'approved' });
      setDocument(updated);
      setSuccess('BOQ approved for quote conversion.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update BOQ');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConvert() {
    if (!accessToken || !canConvert || !convertCustomerId) return;
    setIsConverting(true);
    setError(null);
    try {
      const quote = await convertBoqToQuote(accessToken, document!.id, {
        clientActionId: newFinanceClientActionId('boq-quote'),
        customerId: convertCustomerId,
        jobId: document!.jobId,
        title: document!.title,
      });
      navigate(`/finance/quotes/${quote.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to convert BOQ to quote');
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <div className="finance-page">
      <PageHeader
        title={`${document.boqNumber} · ${document.title}`}
        description={`${document.lineItems.length} lines · ${formatStatus(document.status)}`}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="finance-detail">
        <Panel title="Summary">
          <dl className="finance-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{document.customerName ?? '—'}</dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                {document.jobId ? (
                  <Link href={`/jobs/${document.jobId}`} className="finance-link">
                    {document.jobTitle}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Source file</dt>
              <dd>{document.sourceFilename ?? '—'}</dd>
            </div>
            <div>
              <dt>Linked quote</dt>
              <dd>
                {document.quoteId ? (
                  <Link href={`/finance/quotes/${document.quoteId}`} className="finance-link">
                    View quote
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          {canApprove ? (
            <div className="finance-panel-actions">
              <Button type="button" disabled={isSaving} onClick={() => void handleApprove()}>
                {isSaving ? 'Saving…' : 'Approve BOQ'}
              </Button>
            </div>
          ) : null}
        </Panel>

        <Panel title="BOQ Lines" description="Original sequence preserved for side-by-side review.">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Section</th>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {document.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td>{line.position + 1}</td>
                    <td>{line.section ?? '—'}</td>
                    <td>{line.itemNumber ?? '—'}</td>
                    <td>{line.description}</td>
                    <td>{line.unit ?? '—'}</td>
                    <td>{line.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {canConvert ? (
          <Panel title="Convert To Quote" description="Creates a draft quote from BOQ material lines.">
            {!document.customerId ? (
              <label className="titan-input-group">
                <span className="titan-input-label">Customer ID for quote</span>
                <input
                  className="titan-input"
                  value={convertCustomerId}
                  onChange={(e) => setConvertCustomerId(e.target.value)}
                  placeholder="Customer UUID"
                  required
                />
              </label>
            ) : null}
            <div className="finance-panel-actions">
              <Button
                type="button"
                disabled={isConverting || !convertCustomerId}
                onClick={() => void handleConvert()}
              >
                {isConverting ? 'Converting…' : 'Create quote from BOQ'}
              </Button>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
