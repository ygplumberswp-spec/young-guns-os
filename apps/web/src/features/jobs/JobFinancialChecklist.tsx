import { useEffect, useState } from 'react';
import type { JobCostChecklist } from '@titan/shared';
import { Panel } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobCostChecklist } from '../../lib/jobs-api';

type JobFinancialChecklistProps = {
  accessToken: string;
  jobId: string;
};

function statusIcon(status: JobCostChecklist[keyof JobCostChecklist]['status']): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'warning':
      return '⚠';
    case 'missing':
      return '✗';
    default:
      return '—';
  }
}

export function JobFinancialChecklist({ accessToken, jobId }: JobFinancialChecklistProps) {
  const [checklist, setChecklist] = useState<JobCostChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJobCostChecklist(accessToken, jobId)
      .then(setChecklist)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load cost checklist'),
      );
  }, [accessToken, jobId]);

  if (error) {
    return (
      <Panel title="Cost Capture Checklist">
        <p className="form-error">{error}</p>
      </Panel>
    );
  }

  if (!checklist) {
    return (
      <Panel title="Cost Capture Checklist">
        <p className="page-muted">Loading checklist…</p>
      </Panel>
    );
  }

  const sections = Object.values(checklist);

  return (
    <Panel title="Cost Capture Checklist" description="Financial readiness at a glance for this job.">
      <dl className="jobs-detail-list">
        {sections.map((section) => (
          <div key={section.label}>
            <dt>{section.label}</dt>
            <dd>
              {statusIcon(section.status)} {section.detail}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
