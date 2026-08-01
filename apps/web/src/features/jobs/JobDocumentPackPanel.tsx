import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobDocumentPackSummary } from '@titan/shared';
import {
  JOB_DOCUMENT_PACK_STATUS_OPTIONS,
  formatJobDocumentPackDeliveryState,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createJobDocumentPack, fetchJobDocumentPacks } from '../../lib/job-document-pack-api';
import { newDocumentClientActionId } from '../documents/utils';

type JobDocumentPackPanelProps = {
  accessToken: string;
  jobId: string;
  jobTitle: string;
  canWrite: boolean;
};

function formatStatus(status: JobDocumentPackSummary['status']): string {
  return JOB_DOCUMENT_PACK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function JobDocumentPackPanel({
  accessToken,
  jobId,
  jobTitle,
  canWrite,
}: JobDocumentPackPanelProps) {
  const [packs, setPacks] = useState<JobDocumentPackSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPacks = useCallback(async () => {
    const rows = await fetchJobDocumentPacks(accessToken, { jobId });
    setPacks(rows);
  }, [accessToken, jobId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        await loadPacks();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load job packs');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadPacks]);

  async function handleCreatePack() {
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const pack = await createJobDocumentPack(accessToken, {
        jobId,
        title: `Job pack — ${jobTitle}`,
        clientActionId: newDocumentClientActionId('job-pack'),
      });
      await loadPacks();
      setSuccess(`Draft pack ${pack.packNumber} created from linked job documents.`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to create job pack — link documents to this job first',
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Panel
      title="Job document packs"
      description="Curate linked documents, run internal approval, then share to the customer portal."
    >
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isLoading ? (
        <p className="page-muted">Loading job packs…</p>
      ) : packs.length === 0 ? (
        <p className="page-muted">
          No job packs yet. Create a draft pack from documents already linked to this job.
        </p>
      ) : (
        <ul className="jobs-doc-list">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Link href={`/documents/job-packs/${pack.id}`} className="jobs-link">
                {pack.packNumber} — {pack.title}
              </Link>{' '}
              <span className="page-muted">
                {formatStatus(pack.status)} · {pack.itemCount} item(s) ·{' '}
                {formatJobDocumentPackDeliveryState(pack.deliveryState)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="jobs-form__actions">
          <Button variant="secondary" disabled={isCreating} onClick={() => void handleCreatePack()}>
            {isCreating ? 'Creating…' : 'Create job pack'}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
