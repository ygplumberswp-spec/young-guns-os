import { PageHeader } from '../../components/ux';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { JobDocumentPackChannel, JobDocumentPackDetail } from '@titan/shared';
import {
  JOB_DOCUMENT_PACK_CHANNEL_OPTIONS,
  JOB_DOCUMENT_PACK_STATUS_OPTIONS,
  canSendJobDocumentPack,
  formatJobDocumentPackDeliveryState,
  nextJobDocumentPackApprovalAction,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveJobDocumentPackStep,
  fetchJobDocumentPack,
  sendJobDocumentPack,
  updateJobDocumentPack,
} from '../../lib/job-document-pack-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import {
  canAccessDocuments,
  canManageDocuments,
  newDocumentClientActionId,
} from '../../features/documents/utils';

function formatStatus(status: JobDocumentPackDetail['status']): string {
  return JOB_DOCUMENT_PACK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatChannel(channel: JobDocumentPackChannel): string {
  return JOB_DOCUMENT_PACK_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

export function JobPackDetailPage() {
  const [, params] = useRoute('/documents/job-packs/:id');
  const packId = params?.id ?? '';
  const { accessToken, user } = useAuth();

  const [pack, setPack] = useState<JobDocumentPackDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<JobDocumentPackChannel>('portal');

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  const loadPack = useCallback(async () => {
    if (!accessToken || !packId) return;
    const data = await fetchJobDocumentPack(accessToken, packId);
    setPack(data);
    setDeliveryChannel(data.deliveryChannel);
  }, [accessToken, packId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !packId || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadPack();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load job pack');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, loadPack, packId]);

  const approvalAction = pack ? nextJobDocumentPackApprovalAction(pack.status) : null;
  const canSend = pack ? canSendJobDocumentPack(pack) : false;

  async function handleSaveChannel() {
    if (!accessToken || !pack) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateJobDocumentPack(accessToken, pack.id, { deliveryChannel });
      setPack(updated);
      setSuccess('Delivery channel updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update job pack');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApproveStep() {
    if (!accessToken || !pack) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await approveJobDocumentPackStep(accessToken, pack.id);
      setPack(updated);
      setSuccess('Approval step recorded.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to advance approval');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSend() {
    if (!accessToken || !pack) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await sendJobDocumentPack(accessToken, pack.id, {
        clientActionId: newDocumentClientActionId('job-pack-send'),
      });
      setPack(updated);
      setSuccess('Documents shared on the customer portal.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to send job pack');
    } finally {
      setIsSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="documents-page">
        <PageHeader title="Job Pack" description="You do not have permission to view documents." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Job Pack" />
        <LoadingState label="Loading Job Pack…" />
      </div>
    );
  }

  if (error && !pack) {
    return (
      <div className="documents-page">
        <PageHeader title="Job Pack" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!pack) return null;

  return (
    <div className="documents-page">
      <PageHeader
        title={pack.title}
        description={`${pack.packNumber} · ${formatStatus(pack.status)} · ${formatJobDocumentPackDeliveryState(pack.deliveryState)}`}
      />
      <DocumentsNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="documents-page__grid">
        <Panel title="Pack Details">
          <dl className="jobs-detail-list">
            <div>
              <dt>Job</dt>
              <dd>
                <Link href={`/jobs/${pack.jobId}`} className="jobs-link">
                  {pack.jobTitle ?? pack.jobId.slice(0, 8)}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{pack.customerName ?? '—'}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{pack.itemCount}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{formatChannel(pack.deliveryChannel)}</dd>
            </div>
            {pack.sentAt ? (
              <div>
                <dt>Sent</dt>
                <dd>{new Date(pack.sentAt).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
        </Panel>

        <Panel title="Documents In Pack">
          {pack.items.length === 0 ? (
            <p className="page-muted">No documents in this pack.</p>
          ) : (
            <ul className="jobs-doc-list">
              {pack.items.map((item) => (
                <li key={item.id}>
                  {item.documentId ? (
                    <Link href={`/documents/${item.documentId}`} className="jobs-link">
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}{' '}
                  <span className="page-muted">
                    {item.fileName ?? item.itemType.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {canWrite ? (
          <Panel title="Approval And Send">
            {approvalAction ? (
              <div className="jobs-form__actions">
                <Button disabled={isSaving} onClick={() => void handleApproveStep()}>
                  {approvalAction.label}
                </Button>
              </div>
            ) : null}

            <div className="jobs-form__field">
              <span className="titan-input-label">Delivery channel</span>
              <select
                className="titan-input"
                value={deliveryChannel}
                disabled={pack.status === 'sent' || isSaving}
                onChange={(event) =>
                  setDeliveryChannel(event.target.value as JobDocumentPackChannel)
                }
              >
                {JOB_DOCUMENT_PACK_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {pack.status !== 'sent' ? (
                <div className="jobs-form__actions">
                  <Button variant="secondary" disabled={isSaving} onClick={() => void handleSaveChannel()}>
                    Save channel
                  </Button>
                </div>
              ) : null}
            </div>

            {canSend ? (
              <div className="jobs-form__actions">
                <Button disabled={isSaving} onClick={() => void handleSend()}>
                  {deliveryChannel === 'portal' ? 'Share on customer portal' : 'Request send'}
                </Button>
              </div>
            ) : null}

            {deliveryChannel !== 'portal' ? (
              <p className="page-muted">
                Email and WhatsApp delivery require connected providers and remain blocked until a
                communications send path is approved.
              </p>
            ) : null}
          </Panel>
        ) : null}
      </div>

      <div className="jobs-form__actions">
      </div>
    </div>
  );
}
